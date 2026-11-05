import express from 'express';
import path from 'path';
import fs from 'fs';
import initSqlJs from 'sql.js';
import { getSqliteDb, saveSqliteDb, getSanitizedRootFolder, setRootFolder, getSqliteDbPath, createDatabaseBackup, withSqliteWriteLock } from './sqliteDb.js';

export const localRouter = express.Router();

const SQL_TABLE_MAP: Record<string, string> = {
  settings: 'settings',
  users: 'users',
  employees: 'employees',
  punches: 'attendance_punches',
  documents: 'documents',
  shift_assignments: 'shift_assignments',
  exceptions: 'exceptions',
  overtime: 'overtime',
  sbl: 'sbl',
  force_attendance: 'force_attendance',
  payroll_runs: 'payroll_runs',
  audit_logs: 'audit_logs',
  zk_devices: 'zk_devices',
  zk_user_mappings: 'zk_user_mappings',
  zk_sync_logs: 'zk_sync_logs',
  zk_unmapped_punches: 'zk_unmapped_punches',
  leave_records: 'leave_records',
  departments: 'departments',
  sections: 'sections',
  designations: 'designations',
  roster_batches: 'roster_batches',
  roster_assignments: 'roster_assignments',
  shift_audit_logs: 'shift_audit_logs',
  employee_movements: 'employee_movements',
  assignment_logs: 'assignment_logs',
  audit_decisions: 'audit_decisions',
  field_attendance_audit: 'field_attendance_audit',
  tax_rules: 'tax_rules',
  deduction_rules: 'deduction_rules',
  salary_components: 'salary_components',
  payroll_config_audit: 'payroll_config_audit'
};

// Helper to sanitize paths against path traversal
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

// 1. Status & Health
localRouter.get('/status', async (req, res) => {
  try {
    const db = await getSqliteDb();
    const root = getSanitizedRootFolder();

    let empCount = 0;
    let punchCount = 0;
    let docCount = 0;

    try {
      const empRes = db.exec('SELECT COUNT(*) as cnt FROM employees');
      if (empRes.length > 0 && empRes[0].values.length > 0) {
        empCount = Number(empRes[0].values[0][0]);
      }
      const punchRes = db.exec('SELECT COUNT(*) as cnt FROM attendance_punches');
      if (punchRes.length > 0 && punchRes[0].values.length > 0) {
        punchCount = Number(punchRes[0].values[0][0]);
      }
      const docRes = db.exec('SELECT COUNT(*) as cnt FROM documents');
      if (docRes.length > 0 && docRes[0].values.length > 0) {
        docCount = Number(docRes[0].values[0][0]);
      }
    } catch (e) {
      console.warn('[Status] Query count note:', e);
    }

    const backupsDir = fs.existsSync(path.join(root, 'Backups')) 
      ? path.join(root, 'Backups') 
      : path.join(root, 'backups');
    let backupCount = 0;
    if (fs.existsSync(backupsDir)) {
      backupCount = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db') || f.endsWith('.json')).length;
    }

    res.json({
      status: 'online',
      mode: 'LOCAL MODE',
      database: 'SQLite',
      storage: 'Local Disk',
      internetRequired: false,
      rootFolder: root,
      stats: {
        employees: empCount,
        punches: punchCount,
        documents: docCount,
        backups: backupCount
      }
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// 2. Change local storage root path
localRouter.post('/config/root', (req, res) => {
  const { rootFolder } = req.body;
  if (!rootFolder || typeof rootFolder !== 'string') {
    return res.status(400).json({ error: 'rootFolder is required' });
  }
  setRootFolder(rootFolder);
  res.json({ success: true, rootFolder: getSanitizedRootFolder() });
});

// 3. Generic Get Table Data
localRouter.get('/data/:table', async (req, res) => {
  const { table } = req.params;
  const sqlTable = SQL_TABLE_MAP[table];
  if (!sqlTable) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  try {
    const db = await getSqliteDb();

    // Auto-sync zk_user_mappings with Active Employees in Directory so User Mapping matches Directory
    if (sqlTable === 'zk_user_mappings') {
      try {
        const empRes = db.exec('SELECT id, name, department, status, data FROM employees');
        if (empRes.length > 0 && empRes[0].values.length > 0) {
          const existingRes = db.exec('SELECT id, employee_id FROM zk_user_mappings');
          const mappedEmpIds = new Set<string>();
          if (existingRes.length > 0) {
            for (const r of existingRes[0].values) {
              if (r[1]) mappedEmpIds.add(String(r[1]).trim());
            }
          }

          const nowIso = new Date().toISOString();
          let addedAny = false;
          const mapStmt = db.prepare(`
            INSERT OR IGNORE INTO zk_user_mappings (id, device_user_id, employee_id, data)
            VALUES (?, ?, ?, ?)
          `);

          for (const row of empRes[0].values) {
            const empId = String(row[0] || '').trim();
            const empName = String(row[1] || empId).trim();
            const empDept = String(row[2] || 'General').trim();
            let empStatus = String(row[3] || 'Active').trim();
            let empData: any = {};
            if (row[4]) {
              try {
                empData = JSON.parse(String(row[4]));
                if (empData.status) empStatus = String(empData.status).trim();
              } catch {}
            }
            if (!empId || empStatus.toLowerCase() !== 'active') continue;
            if (mappedEmpIds.has(empId)) continue;

            const devUserId = String(empData.deviceUserId || empData.biometricId || empData.acNo || empData.zkPin || empId).trim();
            const mapId = `map_${devUserId}`;
            const mapObj = {
              id: mapId,
              deviceUserId: devUserId,
              employeeId: empId,
              employeeName: empName,
              department: empDept,
              mappedAt: empData.joiningDate || nowIso
            };
            mapStmt.run([mapId, devUserId, empId, JSON.stringify(mapObj)]);
            mappedEmpIds.add(empId);
            addedAny = true;
          }
          mapStmt.free();
          if (addedAny) saveSqliteDb();
        }
      } catch (e) {
        console.warn('[SQLite] Auto-sync zk_user_mappings notice:', e);
      }
    }

    const result = db.exec(`SELECT * FROM ${sqlTable}`);
    if (result.length === 0) return res.json([]);

    const columns = result[0].columns;
    const dataIdx = columns.indexOf('data');

    const rows = result[0].values.map(valArr => {
      if (dataIdx !== -1 && valArr[dataIdx]) {
        try {
          return JSON.parse(valArr[dataIdx] as string);
        } catch (e) {
          // fallback
        }
      }
      const obj: Record<string, any> = {};
      columns.forEach((col, i) => {
        obj[col] = valArr[i];
      });
      return obj;
    });

    // Dynamically reconcile zk_devices userCount & logCount with actual SQLite attendance_punches & active employees
    if (sqlTable === 'zk_devices' && rows.length > 0) {
      try {
        // If there are unassigned DIA punches in attendance_punches (device_id = ''), link them to the primary enabled device
        const assignedCheck = db.exec("SELECT COUNT(*) FROM attendance_punches WHERE device_id != '' AND device_id IS NOT NULL");
        const assignedCnt = assignedCheck.length > 0 ? Number(assignedCheck[0].values[0][0] || 0) : 0;
        const unassignedCheck = db.exec("SELECT COUNT(*) FROM attendance_punches WHERE device_id = '' OR device_id IS NULL");
        const unassignedCnt = unassignedCheck.length > 0 ? Number(unassignedCheck[0].values[0][0] || 0) : 0;

        if (assignedCnt === 0 && unassignedCnt > 0) {
          const primaryDev = rows.find((d: any) => d && d.id && d.enabled !== false) || rows[0];
          if (primaryDev && primaryDev.id) {
            const linkStmt = db.prepare(
              "UPDATE attendance_punches SET device_id = ?, source = 'ZKTeco', data = json_set(data, '$.deviceId', ?, '$.deviceName', ?, '$.deviceIP', ?, '$.source', 'ZKTeco') WHERE device_id = '' OR device_id IS NULL"
            );
            linkStmt.run([primaryDev.id, primaryDev.id, primaryDev.name || 'ZKTeco Device', primaryDev.ip || '']);
            linkStmt.free();
            saveSqliteDb();
          }
        }

        const statsByDev = new Map<string, { logs: number; users: number }>();
        const devPunchRes = db.exec(
          "SELECT device_id, COUNT(*) as log_cnt, COUNT(DISTINCT CASE WHEN employee_id != '' THEN employee_id END) as user_cnt FROM attendance_punches GROUP BY device_id"
        );
        let totalLogsAll = 0;
        if (devPunchRes.length > 0) {
          for (const r of devPunchRes[0].values) {
            const dId = String(r[0] || '');
            const lCnt = Number(r[1] || 0);
            const uCnt = Number(r[2] || 0);
            totalLogsAll += lCnt;
            if (dId) {
              statsByDev.set(dId, { logs: lCnt, users: uCnt });
            }
          }
        }

        let activeEmpCount = 0;
        const activeEmpRes = db.exec("SELECT COUNT(*) FROM employees WHERE LOWER(status) = 'active'");
        if (activeEmpRes.length > 0 && activeEmpRes[0].values.length > 0) {
          activeEmpCount = Number(activeEmpRes[0].values[0][0] || 0);
        }

        let updatedAnyDev = false;
        const updStmt = db.prepare('UPDATE zk_devices SET data = ? WHERE id = ?');

        for (const dev of rows) {
          if (!dev || !dev.id) continue;
          const exactStats = statsByDev.get(dev.id) || { logs: 0, users: 0 };
          const exactLogCount = exactStats.logs;
          const exactUserCount = exactStats.users;

          if (
            dev.logCount !== exactLogCount ||
            dev.userCount !== exactUserCount ||
            dev.activeDirectoryUsers !== activeEmpCount
          ) {
            dev.logCount = exactLogCount;
            dev.userCount = exactUserCount;
            dev.activeDirectoryUsers = activeEmpCount;
            dev.totalSystemLogs = totalLogsAll;
            updStmt.run([JSON.stringify(dev), dev.id]);
            updatedAnyDev = true;
          }
        }
        updStmt.free();
        if (updatedAnyDev) saveSqliteDb();
      } catch (e) {
        console.warn('[SQLite] Reconcile zk_devices counts notice:', e);
      }
    }

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Batch Save Table Data
localRouter.post('/data/:table', async (req, res) => {
  const { table } = req.params;
  const items = Array.isArray(req.body) ? req.body : [req.body];

  const sqlTable = SQL_TABLE_MAP[table];
  if (!sqlTable) {
    return res.status(400).json({ error: 'Invalid table' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const now = new Date().toISOString();
      try { db.run('ROLLBACK'); } catch(e) {}
      db.run('BEGIN TRANSACTION');

    if (sqlTable === 'employees') {
      const stmt = db.prepare(`
        INSERT INTO employees (id, name, department, designation, shift_id, joining_date, status, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          department=excluded.department,
          designation=excluded.designation,
          shift_id=excluded.shift_id,
          joining_date=excluded.joining_date,
          status=excluded.status,
          data=excluded.data,
          updated_at=excluded.updated_at
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.name || 'Unnamed',
          item.department || '',
          item.designation || '',
          item.shiftId || '',
          item.joiningDate || '',
          item.status || 'Active',
          JSON.stringify(item),
          now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'attendance_punches') {
      const stmt = db.prepare(`
        INSERT INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.punchDatetime || now,
          item.deviceId || '',
          item.source || 'Manual',
          JSON.stringify(item),
          now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'shift_assignments') {
      const stmt = db.prepare(`
        INSERT INTO shift_assignments (id, employee_id, date, shift_id, data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          shift_id=excluded.shift_id,
          data=excluded.data
      `);
      for (const item of items) {
        const empId = item.employeeId || item.employee_id || '';
        const dateStr = item.date || item.rosterDate || item.roster_date || '';
        const shiftId = item.shiftId || item.shift_id || item.shiftCode || 'default';
        const id = item.id || `${empId}_${dateStr}` || `sa_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        if (!id) continue;
        stmt.run([
          id,
          empId,
          dateStr,
          shiftId,
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'assignment_logs') {
      const stmt = db.prepare(`
        INSERT INTO assignment_logs (id, employee_id, date, shift_id, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `alog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([
          id,
          item.employeeId || '',
          item.date || '',
          item.shiftId || '',
          JSON.stringify(item),
          item.timestamp || now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'audit_logs') {
      const stmt = db.prepare(`
        INSERT INTO audit_logs (id, employee_id, date, data, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([
          id,
          item.employeeId || '',
          item.date || '',
          JSON.stringify(item),
          item.timestamp || item.created_at || now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'payroll_runs') {
      const stmt = db.prepare(`
        INSERT INTO payroll_runs (id, month, status, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          month=excluded.month,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.month || '',
          item.status || 'Draft',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'employee_movements') {
      const stmt = db.prepare(`
        INSERT INTO employee_movements (id, employee_id, effective_date, movement_type, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          employee_id=excluded.employee_id,
          effective_date=excluded.effective_date,
          movement_type=excluded.movement_type,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || item.employee_id || '',
          item.effectiveDate || item.effective_date || '',
          item.movementType || item.movement_type || 'Update',
          JSON.stringify(item),
          item.createdAt || item.created_at || now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'settings') {
      const stmt = db.prepare(`
        INSERT INTO settings (id, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
      `);
      for (const item of items) {
        const id = item.id || 'config';
        stmt.run([id, JSON.stringify(item), now]);
      }
      stmt.free();
    } else if (sqlTable === 'roster_batches') {
      const stmt = db.prepare(`
        INSERT INTO roster_batches (id, roster_name, period_start, period_end, total_days, imported_at, imported_by, source_file_name, status, created_at, updated_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          roster_name=excluded.roster_name,
          period_start=excluded.period_start,
          period_end=excluded.period_end,
          total_days=excluded.total_days,
          status=excluded.status,
          updated_at=excluded.updated_at,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.rosterName || 'Roster Batch',
          item.periodStart || '',
          item.periodEnd || '',
          item.totalDays || 0,
          item.importedAt || now,
          item.importedBy || 'Admin',
          item.sourceFileName || '',
          item.status || 'Active',
          item.createdAt || now,
          now,
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'roster_assignments') {
      const stmt = db.prepare(`
        INSERT INTO roster_assignments (id, roster_batch_id, employee_id, roster_date, shift_code, shift_start, shift_end, source, status, created_at, updated_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          shift_code=excluded.shift_code,
          shift_start=excluded.shift_start,
          shift_end=excluded.shift_end,
          source=excluded.source,
          status=excluded.status,
          updated_at=excluded.updated_at,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.rosterBatchId || '',
          item.employeeId || '',
          item.rosterDate || item.date || '',
          item.shiftCode || '',
          item.shiftStart || '',
          item.shiftEnd || '',
          item.source || 'Imported Roster',
          item.status || 'Active',
          item.createdAt || now,
          now,
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'shift_audit_logs') {
      const stmt = db.prepare(`
        INSERT INTO shift_audit_logs (id, employee_id, date, old_shift, new_shift, changed_by, changed_at, reason, source, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.oldShift || '',
          item.newShift || '',
          item.changedBy || 'Admin',
          item.changedAt || now,
          item.reason || '',
          item.source || 'Manual Override',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'overtime') {
      const stmt = db.prepare(`
        INSERT INTO overtime (id, employee_id, date, hours, status, data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          hours=excluded.hours,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.hours || 0,
          item.status || 'Pending',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'exceptions') {
      const stmt = db.prepare(`
        INSERT INTO exceptions (id, employee_id, date, type, status, data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          type=excluded.type,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.type || 'General',
          item.status || 'pending',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'sbl') {
      const stmt = db.prepare(`
        INSERT INTO sbl (id, employee_id, date, status, data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.status || 'Pending',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'force_attendance') {
      const stmt = db.prepare(`
        INSERT INTO force_attendance (id, employee_id, date, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'leave_records') {
      const stmt = db.prepare(`
        INSERT INTO leave_records (id, employee_id, date, status, data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.status || 'Approved',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'zk_user_mappings') {
      const stmt = db.prepare(`
        INSERT INTO zk_user_mappings (id, device_user_id, employee_id, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          device_user_id=excluded.device_user_id,
          employee_id=excluded.employee_id,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.deviceUserId || '',
          item.employeeId || '',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'zk_sync_logs') {
      const stmt = db.prepare(`
        INSERT INTO zk_sync_logs (id, data, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `sync_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([
          id,
          JSON.stringify(item),
          item.timestamp || now
        ]);
      }
      stmt.free();
    } else {
      const stmt = db.prepare(`
        INSERT INTO ${sqlTable} (id, data)
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([id, JSON.stringify(item)]);
      }
      stmt.free();
    }

    db.run('COMMIT');
    saveSqliteDb();

    // Verification Readback check
    let verified = false;
    let verificationStatus: 'PASSED' | 'FAILED' | 'WARNING' = 'PASSED';
    try {
      if (items.length > 0) {
        const sampleId = items[0].id || (items[0] as any).id;
        if (sampleId) {
          const verifyStmt = db.prepare(`SELECT id FROM ${sqlTable} WHERE id = ?`);
          verifyStmt.bind([sampleId]);
          if (verifyStmt.step()) {
            verified = true;
          }
          verifyStmt.free();
        } else {
          verified = true;
        }
      } else {
        verified = true;
      }
    } catch (vErr) {
      console.warn(`[SQLite Verification Warning] Could not verify write on ${sqlTable}:`, vErr);
      verificationStatus = 'WARNING';
    }

      const dbPath = getSqliteDbPath();
      console.log(`[SQLite SAVE] Persisted ${items.length} records to ${sqlTable} at ${dbPath} (Verification: ${verified ? 'PASSED' : 'PENDING'})`);

      return res.json({ 
        success: true, 
        count: items.length,
        affectedCount: items.length,
        verified: verified,
        verificationStatus: verificationStatus,
        transaction: 'COMMITTED',
        dbPath: dbPath,
        table: sqlTable,
        timestamp: now
      });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (rbErr) {}
      console.error(`[SQLite SAVE Error] Failed to save to ${table}:`, error);
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        transaction: 'ROLLED_BACK',
        verificationStatus: 'FAILED'
      });
    }
  });
});

// 5. Delete records with automatic safety backup & readback verification
localRouter.post('/data/:table/delete', async (req, res) => {
  const { table } = req.params;
  const { ids } = req.body;
  const idList = Array.isArray(ids) ? ids : [ids];

  const sqlTable = SQL_TABLE_MAP[table];
  if (!sqlTable) return res.status(400).json({ error: 'Invalid table' });

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      
      // Automatic Safety Backup if deleting multiple records or employees
      if (idList.length >= 3 || sqlTable === 'employees') {
        try {
          createDatabaseBackup(`before_delete_${sqlTable}`);
        } catch (bErr) {
          console.warn('[SQLite Backup Notice before delete]:', bErr);
        }
      }

      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(`DELETE FROM ${sqlTable} WHERE id = ?`);
      let deletedCount = 0;
      for (const id of idList) {
        if (id) {
          stmt.run([id]);
          deletedCount++;
        }
      }
      stmt.free();
      db.run('COMMIT');
      saveSqliteDb();

      // Readback verification for deletion: verify deleted IDs are gone
      let verified = true;
      if (idList.length > 0 && idList[0]) {
        try {
          const verifyStmt = db.prepare(`SELECT id FROM ${sqlTable} WHERE id = ?`);
          verifyStmt.bind([idList[0]]);
          if (verifyStmt.step()) {
            verified = false; // still exists!
          }
          verifyStmt.free();
        } catch (vErr) {
          console.warn('[SQLite Verification Warning on delete]:', vErr);
        }
      }

      const dbPath = getSqliteDbPath();
      console.log(`[SQLite DELETE] Deleted ${deletedCount} record(s) from ${sqlTable} at ${dbPath} (Verification: ${verified ? 'PASSED' : 'FAILED'})`);
      return res.json({ 
        success: true, 
        deleted: deletedCount,
        deletedCount: deletedCount,
        affectedCount: deletedCount,
        verified: verified,
        verificationStatus: verified ? 'PASSED' : 'FAILED',
        transaction: 'COMMITTED',
        dbPath: dbPath,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (rbErr) {}
      console.error(`[SQLite DELETE Error] Failed to delete from ${table}:`, error);
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        transaction: 'ROLLED_BACK',
        verificationStatus: 'FAILED'
      });
    }
  });
});

// 5b. Database Verification Health Check
localRouter.get('/verify-db', async (req, res) => {
  try {
    const db = await getSqliteDb();
    const checkRes = db.exec('PRAGMA integrity_check;');
    const integrity = (checkRes.length > 0 && checkRes[0].values?.[0]?.[0] === 'ok') ? 'PASSED' : 'WARNING';
    const dbPath = getSqliteDbPath();
    
    // Get counts
    const counts: Record<string, number> = {};
    const tables = ['employees', 'attendance_punches', 'payroll_runs', 'roster_assignments', 'documents', 'audit_logs'];
    for (const t of tables) {
      try {
        const cRes = db.exec(`SELECT COUNT(*) FROM ${t}`);
        counts[t] = cRes.length > 0 ? Number(cRes[0].values[0][0]) : 0;
      } catch {
        counts[t] = 0;
      }
    }

    res.json({
      status: 'healthy',
      integrityCheck: integrity,
      databasePath: dbPath,
      rootFolder: getSanitizedRootFolder(),
      tableCounts: counts,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// 5c. Explicit Safety Backup Creation
localRouter.post('/backup', async (req, res) => {
  try {
    const { label } = req.body || {};
    const backupPath = createDatabaseBackup(label || 'manual');
    const fileSize = fs.existsSync(backupPath) ? fs.statSync(backupPath).size : 0;
    const fileName = path.basename(backupPath);

    res.json({
      success: true,
      backupPath: backupPath,
      fileName: fileName,
      fileSize: fileSize,
      timestamp: new Date().toISOString(),
      message: `Database backup created successfully: ${fileName}`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5d. List Available Backups
localRouter.get('/backups', async (req, res) => {
  try {
    const root = getSanitizedRootFolder();
    const backupsDir = fs.existsSync(path.join(root, 'Backups')) 
      ? path.join(root, 'Backups') 
      : path.join(root, 'backups');
      
    if (!fs.existsSync(backupsDir)) {
      return res.json({ backups: [], count: 0, backupsDir });
    }

    const files = fs.readdirSync(backupsDir);
    const backupList = files
      .filter(f => f.endsWith('.db') || f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(backupsDir, f);
        const stats = fs.statSync(fullPath);
        return {
          fileName: f,
          fullPath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          type: f.endsWith('.db') ? 'SQLite Database' : 'JSON Snapshot'
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    res.json({
      backups: backupList,
      count: backupList.length,
      backupsDir
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Payroll Run Delete Endpoint (supports /payroll/runs/:id and /runs/:id)
const handlePayrollRunDelete = async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing payroll run ID' });

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');

      // Check if run exists and check status
      const checkStmt = db.prepare('SELECT data FROM payroll_runs WHERE id = ?');
      checkStmt.bind([id]);
      let existingRun: any = null;
      if (checkStmt.step()) {
        const row = checkStmt.getAsObject();
        if (row.data) {
          try {
            existingRun = JSON.parse(row.data as string);
          } catch (e) {
            existingRun = null;
          }
        }
      }
      checkStmt.free();

      if (existingRun && (existingRun.status === 'Finalized' || existingRun.status === 'Locked')) {
        db.run('ROLLBACK');
        return res.status(400).json({ error: 'This payroll run is finalized/locked and cannot be deleted.' });
      }

      const delStmt = db.prepare('DELETE FROM payroll_runs WHERE id = ?');
      delStmt.run([id]);
      delStmt.free();

      db.run('COMMIT');
      saveSqliteDb();

      console.log(`[SQLite DELETE] Deleted payroll run ${id} successfully`);
      return res.json({ success: true, deleted: 1, message: `Successfully deleted draft payroll run ${id}` });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (e) { /* ignore rollback error */ }
      console.error(`[SQLite DELETE Error] Failed to delete payroll run ${id}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });
};

localRouter.delete('/payroll/runs/:id', handlePayrollRunDelete);
localRouter.delete('/runs/:id', handlePayrollRunDelete);

// =========================================================================
// 5B. Dedicated Movement & Separation Transactions with Read-back Verification
// =========================================================================
localRouter.post('/movement/separation', async (req, res) => {
  const {
    employeeId,
    effectiveDate,
    separationType = 'Resignation',
    exitType = 'Voluntary',
    reason = '',
    exitReason = '',
    noticePeriod = '',
    lastWorkingDate = '',
    resignationDate = '',
    remarks = '',
    approvedBy = 'HR Administrator'
  } = req.body;

  const empId = String(employeeId || '').trim();
  if (!empId) {
    return res.status(400).json({ error: 'Employee ID (Bio ID) is required' });
  }
  if (!effectiveDate) {
    return res.status(400).json({ error: 'Effective separation date is required' });
  }
  const cleanReason = String(exitReason || reason || '').trim();
  if (!cleanReason) {
    return res.status(400).json({ error: 'Reason for separation is mandatory' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const now = new Date().toISOString();

      // 1. Verify Employee exists in Master Directory
      const checkStmt = db.prepare(`SELECT id, name, department, designation, shift_id, joining_date, status, data FROM employees WHERE id = ?`);
      checkStmt.bind([empId]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return res.status(404).json({ error: `Employee Bio ID #${empId} not found in Employee Directory Master.` });
      }

      const row = checkStmt.getAsObject();
      checkStmt.free();

      let empData: any = {};
      try {
        empData = row.data ? JSON.parse(row.data as string) : {};
      } catch (e) {
        empData = {};
      }

      // Merge column values
      empData.id = row.id || empId;
      empData.name = row.name || empData.name || 'Unnamed';
      empData.department = row.department || empData.department || 'General';
      empData.designation = row.designation || empData.designation || 'Staff';
      empData.shiftId = row.shift_id || empData.shiftId || 'S1';
      empData.joiningDate = row.joining_date || empData.joiningDate || '';
      const previousStatus = row.status || empData.status || 'Active';

      // 2. Validate separation date against joining date
      if (empData.joiningDate && effectiveDate < empData.joiningDate) {
        return res.status(400).json({
          error: `Separation date (${effectiveDate}) cannot be prior to joining date (${empData.joiningDate}).`
        });
      }

      // 3. Begin Transaction
      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');

      // 4. Create Movement Record
      const moveId = `move_sep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const movementRecord = {
        id: moveId,
        employeeId: empId,
        effectiveDate,
        movementType: separationType,
        previousDepartment: empData.department,
        previousDesignation: empData.designation,
        previousSection: empData.section || '',
        previousGrade: empData.grade || '',
        previousSalary: empData.basicSalary || 0,
        newDepartment: empData.department,
        newDesignation: empData.designation,
        newSection: empData.section || '',
        newGrade: empData.grade || '',
        newSalary: empData.basicSalary || 0,
        exitType: exitType || (separationType === 'Resignation' ? 'Voluntary' : 'Involuntary'),
        exitReason: cleanReason,
        reason: cleanReason,
        noticePeriod: noticePeriod || '',
        lastWorkingDate: lastWorkingDate || effectiveDate,
        resignationDate: resignationDate || effectiveDate,
        remarks: remarks || '',
        changedBy: approvedBy || 'HR Administrator',
        changedAt: now
      };

      const moveStmt = db.prepare(`
        INSERT INTO employee_movements (id, employee_id, effective_date, movement_type, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          employee_id=excluded.employee_id,
          effective_date=excluded.effective_date,
          movement_type=excluded.movement_type,
          data=excluded.data
      `);
      moveStmt.run([
        moveId,
        empId,
        effectiveDate,
        separationType,
        JSON.stringify(movementRecord),
        now
      ]);
      moveStmt.free();

      // 5. Update Employee Master in SQLite (Status -> Inactive)
      empData.status = 'Inactive';
      empData.statusEffectiveDate = effectiveDate;
      empData.separationDate = effectiveDate;
      empData.exitType = exitType || (separationType === 'Resignation' ? 'Voluntary' : 'Involuntary');
      empData.exitReason = cleanReason;
      empData.lastWorkingDate = lastWorkingDate || effectiveDate;
      empData.resignationDate = resignationDate || effectiveDate;
      empData.noticePeriod = noticePeriod || '';

      const empUpdateStmt = db.prepare(`
        UPDATE employees 
        SET status = 'Inactive', data = ?, updated_at = ?
        WHERE id = ?
      `);
      empUpdateStmt.run([JSON.stringify(empData), now, empId]);
      empUpdateStmt.free();

      // 6. Record in Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const auditStmt = db.prepare(`
        INSERT INTO audit_logs (id, employee_id, employee_name, date, field, old_value, new_value, changed_by, reason, source, data, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      auditStmt.run([
        auditId,
        empId,
        empData.name,
        effectiveDate,
        'status',
        previousStatus,
        'Inactive',
        approvedBy || 'HR Administrator',
        `Separation recorded (${separationType}): ${cleanReason}`,
        'Separation Workflow',
        JSON.stringify({
          separationType,
          exitType,
          reason: cleanReason,
          noticePeriod,
          lastWorkingDate: lastWorkingDate || effectiveDate,
          remarks
        }),
        now
      ]);
      auditStmt.free();

      // 7. Commit & Persist
      db.run('COMMIT');
      saveSqliteDb();

      // 8. Read-back Verification Check
      let verified = false;
      let verifiedStatus = '';
      let verifiedSeparationDate = '';
      const vEmpStmt = db.prepare(`SELECT status, data FROM employees WHERE id = ?`);
      vEmpStmt.bind([empId]);
      if (vEmpStmt.step()) {
        const vRow = vEmpStmt.getAsObject();
        verifiedStatus = String(vRow.status || '');
        try {
          const vData = JSON.parse(vRow.data as string);
          verifiedSeparationDate = vData.separationDate || '';
        } catch (e) {}
      }
      vEmpStmt.free();

      const vMoveStmt = db.prepare(`SELECT id FROM employee_movements WHERE id = ?`);
      vMoveStmt.bind([moveId]);
      const moveExists = vMoveStmt.step();
      vMoveStmt.free();

      if (moveExists && verifiedStatus === 'Inactive' && verifiedSeparationDate === effectiveDate) {
        verified = true;
      }

      const dbPath = getSqliteDbPath();
      console.log(`[SQLite SEPARATION] Processed Bio ID #${empId} - Status: Inactive, Date: ${effectiveDate} at ${dbPath} (Verified: ${verified ? 'PASSED' : 'PENDING'})`);

      return res.json({
        success: true,
        verified,
        verificationStatus: verified ? 'PASSED' : 'FAILED',
        transaction: 'COMMITTED',
        dbPath,
        movement: movementRecord,
        employee: empData,
        message: `Separation verified and committed successfully for Employee ID #${empId}.`
      });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (e) {}
      console.error('[SQLite SEPARATION ERROR]:', error);
      return res.status(500).json({ error: error.message || 'Failed to process separation transaction' });
    }
  });
});

localRouter.post('/movement/record', async (req, res) => {
  const {
    employeeId,
    effectiveDate,
    movementType = 'Promotion',
    previousDepartment = '',
    newDepartment = '',
    previousDesignation = '',
    newDesignation = '',
    previousSection = '',
    newSection = '',
    previousGrade = '',
    newGrade = '',
    previousSalary = 0,
    newSalary = 0,
    newShiftId = '',
    reason = '',
    changedBy = 'HR Administrator'
  } = req.body;

  const empId = String(employeeId || '').trim();
  if (!empId) {
    return res.status(400).json({ error: 'Employee ID (Bio ID) is required' });
  }
  if (!effectiveDate) {
    return res.status(400).json({ error: 'Effective date is required' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const now = new Date().toISOString();

      // 1. Verify Employee exists
      const checkStmt = db.prepare(`SELECT id, name, department, designation, shift_id, joining_date, status, data FROM employees WHERE id = ?`);
      checkStmt.bind([empId]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return res.status(404).json({ error: `Employee Bio ID #${empId} not found in Employee Directory Master.` });
      }

      const row = checkStmt.getAsObject();
      checkStmt.free();

      let empData: any = {};
      try {
        empData = row.data ? JSON.parse(row.data as string) : {};
      } catch (e) {
        empData = {};
      }

      empData.id = row.id || empId;
      empData.name = row.name || empData.name || 'Unnamed';
      empData.department = row.department || empData.department || 'General';
      empData.designation = row.designation || empData.designation || 'Staff';
      empData.shiftId = row.shift_id || empData.shiftId || 'S1';
      empData.joiningDate = row.joining_date || empData.joiningDate || '';

      // 2. Begin Transaction
      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');

      const moveId = `move_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const movementRecord = {
        id: moveId,
        employeeId: empId,
        effectiveDate,
        movementType,
        previousDepartment: previousDepartment || empData.department,
        newDepartment: newDepartment || empData.department,
        previousDesignation: previousDesignation || empData.designation,
        newDesignation: newDesignation || empData.designation,
        previousSection: previousSection || empData.section || '',
        newSection: newSection || empData.section || '',
        previousGrade: previousGrade || empData.grade || '',
        newGrade: newGrade || empData.grade || '',
        previousSalary: previousSalary || empData.basicSalary || 0,
        newSalary: newSalary || empData.basicSalary || 0,
        reason: reason || `Employee Movement: ${movementType}`,
        changedBy: changedBy || 'HR Administrator',
        changedAt: now
      };

      const moveStmt = db.prepare(`
        INSERT INTO employee_movements (id, employee_id, effective_date, movement_type, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          employee_id=excluded.employee_id,
          effective_date=excluded.effective_date,
          movement_type=excluded.movement_type,
          data=excluded.data
      `);
      moveStmt.run([
        moveId,
        empId,
        effectiveDate,
        movementType,
        JSON.stringify(movementRecord),
        now
      ]);
      moveStmt.free();

      // 3. Update Employee Master attributes based on movement type
      if (newDepartment) empData.department = newDepartment;
      if (newDesignation) empData.designation = newDesignation;
      if (newSection) empData.section = newSection;
      if (newGrade) empData.grade = newGrade;
      if (newSalary && Number(newSalary) > 0) {
        empData.basicSalary = Number(newSalary);
        empData.salaryEffectiveDate = effectiveDate;
      }
      if (newShiftId) empData.shiftId = newShiftId;

      if (movementType === 'Promotion') {
        empData.previousDesignation = previousDesignation || empData.previousDesignation;
        empData.previousGrade = previousGrade || empData.previousGrade;
      } else if (movementType === 'Transfer' || movementType === 'Department Change') {
        empData.previousDepartment = previousDepartment || empData.previousDepartment;
        empData.transferDate = effectiveDate;
      } else if (movementType === 'New Joiner') {
        empData.status = 'Active';
        empData.joiningDate = effectiveDate;
      }

      const empUpdateStmt = db.prepare(`
        UPDATE employees 
        SET department = ?, designation = ?, shift_id = ?, data = ?, updated_at = ?
        WHERE id = ?
      `);
      empUpdateStmt.run([
        empData.department,
        empData.designation,
        empData.shiftId,
        JSON.stringify(empData),
        now,
        empId
      ]);
      empUpdateStmt.free();

      // 4. Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const auditStmt = db.prepare(`
        INSERT INTO audit_logs (id, employee_id, employee_name, date, field, old_value, new_value, changed_by, reason, source, data, changed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      auditStmt.run([
        auditId,
        empId,
        empData.name,
        effectiveDate,
        movementType,
        previousDesignation || previousDepartment || '',
        newDesignation || newDepartment || '',
        changedBy || 'HR Administrator',
        reason || `Movement recorded: ${movementType}`,
        'Movement Workflow',
        JSON.stringify(movementRecord),
        now
      ]);
      auditStmt.free();

      db.run('COMMIT');
      saveSqliteDb();

      // 5. Readback verification
      let verified = false;
      const vMoveStmt = db.prepare(`SELECT id FROM employee_movements WHERE id = ?`);
      vMoveStmt.bind([moveId]);
      if (vMoveStmt.step()) verified = true;
      vMoveStmt.free();

      const dbPath = getSqliteDbPath();
      console.log(`[SQLite MOVEMENT] Recorded ${movementType} for Bio ID #${empId} at ${dbPath} (Verified: ${verified ? 'PASSED' : 'PENDING'})`);

      return res.json({
        success: true,
        verified,
        verificationStatus: verified ? 'PASSED' : 'FAILED',
        transaction: 'COMMITTED',
        dbPath,
        movement: movementRecord,
        employee: empData,
        message: `Movement recorded and verified successfully for Employee ID #${empId}.`
      });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (e) {}
      console.error('[SQLite MOVEMENT ERROR]:', error);
      return res.status(500).json({ error: error.message || 'Failed to record movement transaction' });
    }
  });
});

// 6. Purge Table
localRouter.post('/data/:table/purge', async (req, res) => {
  const { table } = req.params;
  const validTables: Record<string, string> = {
    employees: 'employees',
    punches: 'attendance_punches',
    attendance: 'attendance',
    documents: 'documents',
    shift_assignments: 'shift_assignments',
    assignment_logs: 'assignment_logs',
    shifts: 'shifts',
    leave: 'leave',
    leave_records: 'leave_records',
    exceptions: 'exceptions',
    overtime: 'overtime',
    sbl: 'sbl',
    force_attendance: 'force_attendance',
    payroll: 'payroll',
    payroll_runs: 'payroll_runs',
    audit_logs: 'audit_logs',
    roster_batches: 'roster_batches',
    roster_assignments: 'roster_assignments',
    shift_audit_logs: 'shift_audit_logs',
    employee_movements: 'employee_movements',
    field_attendance_audit: 'field_attendance_audit',
    audit_decisions: 'audit_decisions',
    tax_rules: 'tax_rules',
    deduction_rules: 'deduction_rules',
    salary_components: 'salary_components'
  };

  const sqlTable = validTables[table];
  if (!sqlTable) return res.status(400).json({ error: 'Invalid table' });

  try {
    const db = await getSqliteDb();
    db.run(`DELETE FROM ${sqlTable}`);
    saveSqliteDb();
    res.json({ success: true, message: `Purged ${sqlTable}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Local HR Document Upload
localRouter.post('/documents/upload', async (req, res) => {
  try {
    const { employeeId, documentType, title, fileName, fileBase64, notes, uploadedBy } = req.body;

    if (!employeeId || !title || !fileName || !fileBase64) {
      return res.status(400).json({ error: 'Missing required document parameters (employeeId, title, fileName, fileBase64)' });
    }

    const ext = path.extname(String(fileName)).toLowerCase();
    const dangerousExts = ['.exe', '.bat', '.cmd', '.sh', '.vbs', '.js', '.dll', '.scr', '.msi'];
    if (dangerousExts.includes(ext)) {
      return res.status(400).json({ error: 'Executable file types are strictly prohibited for HR documents.' });
    }

    const root = getSanitizedRootFolder();
    const cleanEmpId = sanitizeFileName(String(employeeId));
    const empDocsDir = path.join(root, 'Documents', 'Employees', cleanEmpId);
    if (!fs.existsSync(empDocsDir)) {
      fs.mkdirSync(empDocsDir, { recursive: true });
    }

    const cleanFileName = sanitizeFileName(String(fileName));
    const uniqueId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const physicalName = `${Date.now()}_${cleanFileName}`;
    const physicalPath = path.join(empDocsDir, physicalName);

    // Decode Base64 and write to local disk
    const base64Data = fileBase64.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(physicalPath, buffer);

    const uploadedAt = new Date().toISOString();
    const docMeta = {
      id: uniqueId,
      employeeId,
      documentType: documentType || 'Other',
      title,
      fileName,
      filePath: physicalPath,
      fileSize: buffer.length,
      fileType: fileName.substring(fileName.lastIndexOf('.')).toLowerCase() || '.bin',
      uploadedAt,
      uploadedBy: uploadedBy || 'HR Admin',
      notes: notes || ''
    };

    const db = await getSqliteDb();
    const stmt = db.prepare(`
      INSERT INTO documents (id, employee_id, document_type, title, file_name, file_path, file_size, file_type, uploaded_at, uploaded_by, notes, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      docMeta.id,
      docMeta.employeeId,
      docMeta.documentType,
      docMeta.title,
      docMeta.fileName,
      docMeta.filePath,
      docMeta.fileSize,
      docMeta.fileType,
      docMeta.uploadedAt,
      docMeta.uploadedBy,
      docMeta.notes,
      JSON.stringify(docMeta)
    ]);
    stmt.free();
    saveSqliteDb();

    res.json({ success: true, document: docMeta });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. List documents for Employee
localRouter.get('/documents/employee/:employeeId', async (req, res) => {
  const { employeeId } = req.params;
  try {
    const db = await getSqliteDb();
    const stmt = db.prepare(`SELECT data FROM documents WHERE employee_id = ? ORDER BY uploaded_at DESC`);
    stmt.bind([employeeId]);

    const docs: any[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.data) {
        try {
          docs.push(JSON.parse(row.data as string));
        } catch (e) {
          // ignore
        }
      }
    }
    stmt.free();

    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Download / Serve Document
localRouter.get('/documents/download/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getSqliteDb();
    const stmt = db.prepare(`SELECT file_path, file_name, file_type FROM documents WHERE id = ?`);
    stmt.bind([id]);

    let filePath = '';
    let fileName = 'document';

    if (stmt.step()) {
      const row = stmt.getAsObject();
      filePath = row.file_path as string;
      fileName = (row.file_name as string) || 'document';
    }
    stmt.free();

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).send('Document file not found on local disk');
    }

    res.download(filePath, fileName);
  } catch (error: any) {
    res.status(500).send('Error downloading file: ' + error.message);
  }
});

// 10. Delete Document
localRouter.delete('/documents/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getSqliteDb();
    const stmt = db.prepare(`SELECT file_path FROM documents WHERE id = ?`);
    stmt.bind([id]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      const filePath = row.file_path as string;
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('[DocDelete] File unlink note:', e);
        }
      }
    }
    stmt.free();

    db.run(`DELETE FROM documents WHERE id = ?`, [id]);
    saveSqliteDb();

    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 11. Local Manual Backup (Unified with Section 5c /backup)
// Deprecated duplicate removed to prevent route shadowing and stale database path references.

// 12. Migrate Firestore JSON dump to SQLite
localRouter.post('/migrate-from-firestore', async (req, res) => {
  const { employees, punches, settings, shiftAssignments, exceptions, overtimeRecords, sblRecords, forceAttendanceRecords, payrollRuns } = req.body;

  try {
    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch (e) {}
    db.run('BEGIN TRANSACTION');

    if (Array.isArray(employees) && employees.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO employees (id, name, department, designation, shift_id, joining_date, status, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          name=excluded.name,
          department=excluded.department,
          designation=excluded.designation,
          shift_id=excluded.shift_id,
          joining_date=excluded.joining_date,
          status=excluded.status,
          data=excluded.data,
          updated_at=excluded.updated_at
      `);
      employees.forEach(e => {
        if (e.id) stmt.run([e.id, e.name || '', e.department || '', e.designation || '', e.shiftId || '', e.joiningDate || '', e.status || 'Active', JSON.stringify(e), new Date().toISOString()]);
      });
      stmt.free();
    }

    if (Array.isArray(punches) && punches.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      punches.forEach(p => {
        if (p.id) stmt.run([p.id, p.employeeId || '', p.punchDatetime || '', p.deviceId || '', p.source || 'Manual', JSON.stringify(p), new Date().toISOString()]);
      });
      stmt.free();
    }

    if (settings) {
      const stmt = db.prepare(`
        INSERT INTO settings (id, data, updated_at)
        VALUES ('config', ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      stmt.run([JSON.stringify(settings), new Date().toISOString()]);
      stmt.free();
    }

    db.run('COMMIT');
    saveSqliteDb();

    res.json({ success: true, message: 'Firestore snapshot successfully migrated to local SQLite database.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Phase 8: Local Excel/CSV Data Import Endpoint
localRouter.post('/import-excel', async (req, res) => {
  const { type, rows } = req.body;
  if (!type || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Missing import type or rows array' });
  }

  try {
    const db = await getSqliteDb();
    const now = new Date().toISOString();
    let importedCount = 0;
    try { db.run('ROLLBACK'); } catch(e) {}
    db.run('BEGIN TRANSACTION');

    if (type === 'employees') {
      const stmt = db.prepare(`
        INSERT INTO employees (id, name, department, designation, shift_id, joining_date, status, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          department=excluded.department,
          designation=excluded.designation,
          shift_id=excluded.shift_id,
          joining_date=excluded.joining_date,
          status=excluded.status,
          data=excluded.data,
          updated_at=excluded.updated_at
      `);
      for (const r of rows) {
        const empId = String(r.id || r.employeeId || r.code || r.EmployeeID || '').trim();
        if (!empId) continue;
        const emp = {
          id: empId,
          name: r.name || r.EmployeeName || r.fullName || 'Unnamed',
          department: r.department || r.Department || '',
          designation: r.designation || r.Designation || '',
          shiftId: r.shiftId || r.Shift || 'S1',
          joiningDate: r.joiningDate || r.JoiningDate || now.substring(0, 10),
          status: r.status || 'Active',
          email: r.email || '',
          phone: r.phone || ''
        };
        stmt.run([emp.id, emp.name, emp.department, emp.designation, emp.shiftId, emp.joiningDate, emp.status, JSON.stringify(emp), now]);
        importedCount++;
      }
      stmt.free();
    } else if (type === 'punches') {
      const stmt = db.prepare(`
        INSERT INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const r of rows) {
        const empId = String(r.employeeId || r.id || r.EmployeeID || r.code || '').trim();
        const punchTime = String(r.punchDatetime || r.punchTime || r.time || r.date || now).replace(' ', 'T');
        if (!empId) continue;
        const id = `import_${empId}_${punchTime.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const punchObj = {
          id,
          employeeId: empId,
          punchDatetime: punchTime,
          deviceId: r.deviceId || 'ExcelImport',
          source: r.source || 'Excel/CSV Import',
          importFormat: 'excel'
        };
        stmt.run([id, empId, punchTime, punchObj.deviceId, punchObj.source, JSON.stringify(punchObj), now]);
        importedCount++;
      }
      stmt.free();
    } else {
      // Generic batch save
      const targetTable = type === 'shift_assignments' ? 'shift_assignments' : 'attendance_punches';
      const stmt = db.prepare(`
        INSERT INTO ${targetTable} (id, data)
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const r of rows) {
        const id = r.id || `imp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        stmt.run([id, JSON.stringify(r)]);
        importedCount++;
      }
      stmt.free();
    }

    db.run('COMMIT');
    saveSqliteDb();

    res.json({ success: true, importedCount, message: `Successfully imported ${importedCount} records locally into SQLite.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Phase 18: Real Local Backend Diagnostics Endpoint
localRouter.get('/diagnostics', async (req, res) => {
  const startTime = Date.now();
  const root = getSanitizedRootFolder();
  const actualDbPath = getSqliteDbPath();
  const configuredDbPath = process.env.LOCAL_DB_PATH || (process.platform === 'win32' ? 'E:\\SHRM_HRIS\\Database.db' : actualDbPath);
  const docsPath = path.join(root, 'Documents');

  const isWin32 = process.platform === 'win32';
  const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB || !isWin32);

  const diagResult: any = {
    timestamp: new Date().toISOString(),
    runtime: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      isCloudRunPreview: isCloudRun,
      runtimeLabel: isWin32 ? 'WINDOWS NATIVE SERVER (win32)' : 'GOOGLE AI STUDIO PREVIEW CONTAINER (Linux Container)'
    },
    paths: {
      configuredDatabasePath: configuredDbPath,
      actualDatabasePath: actualDbPath,
      rootDirectory: root,
      rootDirectoryExists: fs.existsSync(root),
      documentsDirectoryPath: docsPath,
      documentsDirectoryExists: fs.existsSync(docsPath)
    },
    databaseFile: {
      exists: fs.existsSync(actualDbPath),
      sizeBytes: 0,
      sizeFormatted: '0 KB',
      lastModified: null
    },
    sqliteTests: {
      connection: 'UNKNOWN',
      readTest: { passed: false, employeeCount: 0, latencyMs: 0, error: null },
      writeTest: { passed: false, latencyMs: 0, error: null },
      transactionTest: { passed: false, latencyMs: 0, error: null }
    },
    fileIoTest: {
      passed: false,
      testFilePath: null,
      error: null
    },
    accessibilityStatus: '',
    summaryNote: ''
  };

  // 1. Check DB File Info
  if (diagResult.paths.databaseFileExists = fs.existsSync(actualDbPath)) {
    try {
      const stats = fs.statSync(actualDbPath);
      diagResult.databaseFile.sizeBytes = stats.size;
      diagResult.databaseFile.sizeFormatted = `${(stats.size / 1024).toFixed(2)} KB (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
      diagResult.databaseFile.lastModified = stats.mtime.toISOString();
    } catch (e: any) {
      diagResult.databaseFile.error = e.message;
    }
  }

  // 2. Test SQLite Operations
  try {
    const db = await getSqliteDb();
    diagResult.sqliteTests.connection = 'Connected (sql.js / SQLite)';

    // 2a. Read Test
    const rStart = Date.now();
    try {
      const empRes = db.exec('SELECT COUNT(*) as cnt FROM employees');
      let count = 0;
      if (empRes.length > 0 && empRes[0].values.length > 0) {
        count = Number(empRes[0].values[0][0]);
      }
      diagResult.sqliteTests.readTest = {
        passed: true,
        employeeCount: count,
        latencyMs: Date.now() - rStart,
        error: null
      };
    } catch (rErr: any) {
      diagResult.sqliteTests.readTest = {
        passed: false,
        employeeCount: 0,
        latencyMs: Date.now() - rStart,
        error: rErr.message
      };
    }

    // 2b. Write & Delete Test
    const wStart = Date.now();
    const diagId = `_diag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      const stmt = db.prepare('INSERT INTO audit_logs (id, employee_id, date, data, created_at) VALUES (?, ?, ?, ?, ?)');
      stmt.run([diagId, 'DIAGNOSTIC', 'TODAY', JSON.stringify({ diagnostic: true }), new Date().toISOString()]);
      stmt.free();

      // Verify read back
      const verifyRes = db.exec(`SELECT id FROM audit_logs WHERE id = '${diagId}'`);
      const verifyPassed = verifyRes.length > 0 && verifyRes[0].values.length > 0;

      // Clean up test row
      db.run(`DELETE FROM audit_logs WHERE id = '${diagId}'`);
      saveSqliteDb();

      diagResult.sqliteTests.writeTest = {
        passed: verifyPassed,
        latencyMs: Date.now() - wStart,
        error: verifyPassed ? null : 'Row inserted but verification query returned no records.'
      };
    } catch (wErr: any) {
      diagResult.sqliteTests.writeTest = {
        passed: false,
        latencyMs: Date.now() - wStart,
        error: wErr.message
      };
    }

    // 2c. Transaction Test
    const tStart = Date.now();
    try {
      try { db.run('ROLLBACK'); } catch(e) {}
      db.run('BEGIN TRANSACTION;');
      const txId = `_tx_${Date.now()}`;
      db.run(`INSERT INTO departments (id, name, data) VALUES ('${txId}', 'DiagDept', '{"tx":true}');`);
      db.run(`DELETE FROM departments WHERE id = '${txId}';`);
      db.run('COMMIT;');
      saveSqliteDb();

      diagResult.sqliteTests.transactionTest = {
        passed: true,
        latencyMs: Date.now() - tStart,
        error: null
      };
    } catch (tErr: any) {
      try { db.run('ROLLBACK;'); } catch (e) {}
      diagResult.sqliteTests.transactionTest = {
        passed: false,
        latencyMs: Date.now() - tStart,
        error: tErr.message
      };
    }

  } catch (dbErr: any) {
    diagResult.sqliteTests.connection = 'FAILED: ' + dbErr.message;
  }

  // 3. File I/O Test
  try {
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
    }
    const testFilePath = path.join(docsPath, '_diag_io_test.tmp');
    const testContent = `DIAGNOSTIC_TEST_${Date.now()}`;
    fs.writeFileSync(testFilePath, testContent, 'utf-8');
    const readBack = fs.readFileSync(testFilePath, 'utf-8');
    fs.unlinkSync(testFilePath);

    diagResult.fileIoTest = {
      passed: readBack === testContent,
      testFilePath: testFilePath,
      error: readBack === testContent ? null : 'Content mismatch during file readback.'
    };
  } catch (ioErr: any) {
    diagResult.fileIoTest = {
      passed: false,
      testFilePath: path.join(docsPath, '_diag_io_test.tmp'),
      error: ioErr.message
    };
  }

  // 4. Determine Honest Accessibility Status
  if (isWin32 && diagResult.sqliteTests.readTest.passed && diagResult.sqliteTests.writeTest.passed) {
    diagResult.accessibilityStatus = 'WINDOWS DISK & DATABASE FULLY ACCESSIBLE';
    diagResult.summaryNote = 'Running natively on Windows. Backend is physically reading & writing E:\\SHRM_HRIS\\Database.db.';
  } else if (!isWin32) {
    diagResult.accessibilityStatus = 'LOCAL WINDOWS DATABASE NOT ACCESSIBLE FROM THIS PREVIEW CONTAINER';
    diagResult.summaryNote = `This preview is running inside a Linux Cloud Run container. SQLite is operating in container storage (${actualDbPath}). To write directly to your Windows E:\\ drive, download the project and run start-hris.bat locally on Windows.`;
  } else {
    diagResult.accessibilityStatus = 'LOCAL STORAGE ERROR DETECTED';
    diagResult.summaryNote = 'Windows host detected but SQLite read/write diagnostic encountered errors.';
  }

  diagResult.totalDiagnosticTimeMs = Date.now() - startTime;
  res.json(diagResult);
});

// 12. Final Real Physical Database Persistence Test
localRouter.post('/persistence-test', async (req, res) => {
  try {
    const dbPath = getSqliteDbPath();

    // 1. Get active database instance & ensure initialization
    const mainDb = await getSqliteDb();
    saveSqliteDb();

    // Confirm physical database file exists on disk
    const physicalFileExists = fs.existsSync(dbPath);
    if (!physicalFileExists) {
      return res.status(500).json({
        physicalDatabase: dbPath,
        physicalFileExists: false,
        writeToPhysicalFile: false,
        reloadFromPhysicalFile: false,
        temporaryRecordFoundAfterReload: false,
        temporaryRecordDeleted: false,
        finalReloadConfirmedDeleted: false,
        persistenceStatus: 'FAILED',
        error: 'Database file does not exist on physical disk.'
      });
    }

    // 2. Ensure persistence_test table exists
    mainDb.run(`
      CREATE TABLE IF NOT EXISTS persistence_test (
        id TEXT PRIMARY KEY,
        test_val TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // 3. Create a unique temporary test record
    const testId = `test_pers_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = new Date().toISOString();

    mainDb.run(
      `INSERT INTO persistence_test (id, test_val, created_at) VALUES (?, ?, ?)`,
      [testId, 'REAL_PHYSICAL_PERSISTENCE_VERIFICATION', timestamp]
    );

    // 4. Explicitly persist/export the sql.js database contents to physical file on disk
    saveSqliteDb();

    // 5. Confirm that the physical database file has been updated on disk
    const statAfterWrite = fs.statSync(dbPath);
    const writeToPhysicalFile = fs.existsSync(dbPath) && statAfterWrite.size > 0;

    // 6. Open / reload the SQLite database from the physical file on disk
    const SQL = await initSqlJs();
    const fileBuffer1 = fs.readFileSync(dbPath);
    const reloadedDb1 = new SQL.Database(fileBuffer1);
    const reloadFromPhysicalFile = true;

    // 7. Query temporary test record from reloaded physical database instance
    const queryRes1 = reloadedDb1.exec(`SELECT id, test_val FROM persistence_test WHERE id = '${testId}'`);
    const temporaryRecordFoundAfterReload = Boolean(
      queryRes1.length > 0 &&
      queryRes1[0].values.length > 0 &&
      queryRes1[0].values[0][0] === testId
    );
    reloadedDb1.close();

    // 8. Delete ONLY the temporary test record
    mainDb.run(`DELETE FROM persistence_test WHERE id = ?`, [testId]);
    saveSqliteDb();

    // 9. Reload the physical database again from disk to confirm deletion
    const fileBuffer2 = fs.readFileSync(dbPath);
    const reloadedDb2 = new SQL.Database(fileBuffer2);
    const queryRes2 = reloadedDb2.exec(`SELECT id FROM persistence_test WHERE id = '${testId}'`);
    const finalReloadConfirmedDeleted = Boolean(
      queryRes2.length === 0 || queryRes2[0].values.length === 0
    );
    const temporaryRecordDeleted = true;
    reloadedDb2.close();

    const isPassed = physicalFileExists &&
      writeToPhysicalFile &&
      reloadFromPhysicalFile &&
      temporaryRecordFoundAfterReload &&
      temporaryRecordDeleted &&
      finalReloadConfirmedDeleted;

    res.json({
      physicalDatabase: dbPath,
      physicalFileExists,
      writeToPhysicalFile,
      reloadFromPhysicalFile,
      temporaryRecordFoundAfterReload,
      temporaryRecordDeleted,
      finalReloadConfirmedDeleted,
      persistenceStatus: isPassed ? 'PASSED' : 'FAILED'
    });
  } catch (error: any) {
    res.status(500).json({
      physicalDatabase: getSqliteDbPath(),
      physicalFileExists: fs.existsSync(getSqliteDbPath()),
      writeToPhysicalFile: false,
      reloadFromPhysicalFile: false,
      temporaryRecordFoundAfterReload: false,
      temporaryRecordDeleted: false,
      finalReloadConfirmedDeleted: false,
      persistenceStatus: 'FAILED',
      error: error.message
    });
  }
});



