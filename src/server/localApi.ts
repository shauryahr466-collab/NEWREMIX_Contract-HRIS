import express from 'express';
import path from 'path';
import fs from 'fs';
import initSqlJs from 'sql.js';
import { getSqliteDb, saveSqliteDb, getSanitizedRootFolder, setRootFolder, getSqliteDbPath } from './sqliteDb.js';

export const localRouter = express.Router();

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

    const backupsDir = path.join(root, 'backups');
    let backupCount = 0;
    if (fs.existsSync(backupsDir)) {
      backupCount = fs.readdirSync(backupsDir).length;
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
  const validTables: Record<string, string> = {
    settings: 'settings',
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
    shift_audit_logs: 'shift_audit_logs'
  };

  const sqlTable = validTables[table];
  if (!sqlTable) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  try {
    const db = await getSqliteDb();
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

    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Batch Save Table Data
localRouter.post('/data/:table', async (req, res) => {
  const { table } = req.params;
  const items = Array.isArray(req.body) ? req.body : [req.body];

  const validTables: Record<string, string> = {
    settings: 'settings',
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
    shift_audit_logs: 'shift_audit_logs'
  };

  const sqlTable = validTables[table];
  if (!sqlTable) {
    return res.status(400).json({ error: 'Invalid table' });
  }

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

    res.json({ success: true, count: items.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Delete records
localRouter.post('/data/:table/delete', async (req, res) => {
  const { table } = req.params;
  const { ids } = req.body;
  const idList = Array.isArray(ids) ? ids : [ids];

  const validTables: Record<string, string> = {
    settings: 'settings',
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
    designations: 'designations'
  };

  const sqlTable = validTables[table];
  if (!sqlTable) return res.status(400).json({ error: 'Invalid table' });

  try {
    const db = await getSqliteDb();
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

    console.log(`[SQLite DELETE] Deleted ${deletedCount} record(s) from ${sqlTable}`);
    res.json({ success: true, deleted: deletedCount });
  } catch (error: any) {
    console.error(`[SQLite DELETE Error] Failed to delete from ${table}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Dedicated Payroll Run Delete Endpoint
localRouter.delete('/payroll/runs/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing payroll run ID' });

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
    res.json({ success: true, deleted: 1, message: `Successfully deleted draft payroll run ${id}` });
  } catch (error: any) {
    try {
      const db = await getSqliteDb();
      db.run('ROLLBACK');
    } catch (e) { /* ignore rollback error */ }
    console.error(`[SQLite DELETE Error] Failed to delete payroll run ${id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Purge Table
localRouter.post('/data/:table/purge', async (req, res) => {
  const { table } = req.params;
  const validTables: Record<string, string> = {
    employees: 'employees',
    punches: 'attendance_punches',
    documents: 'documents',
    shift_assignments: 'shift_assignments',
    exceptions: 'exceptions',
    overtime: 'overtime',
    sbl: 'sbl',
    force_attendance: 'force_attendance',
    payroll_runs: 'payroll_runs',
    audit_logs: 'audit_logs'
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

// 11. Local Manual Backup
localRouter.post('/backup', async (req, res) => {
  try {
    const root = getSanitizedRootFolder();
    const backupsDir = path.join(root, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
    const backupFolderName = `backup_${timestamp}`;
    const targetBackupPath = path.join(backupsDir, backupFolderName);
    fs.mkdirSync(targetBackupPath, { recursive: true });

    // Copy DB
    const dbSource = path.join(root, 'database', 'hris.db');
    if (fs.existsSync(dbSource)) {
      fs.copyFileSync(dbSource, path.join(targetBackupPath, 'hris.db'));
    }

    // Export JSON snapshot
    const db = await getSqliteDb();
    const snapshot: Record<string, any> = {};
    const tables = ['settings', 'employees', 'attendance_punches', 'documents', 'shift_assignments', 'exceptions', 'overtime', 'sbl', 'force_attendance', 'payroll_runs'];
    
    tables.forEach(tbl => {
      try {
        const resObj = db.exec(`SELECT * FROM ${tbl}`);
        if (resObj.length > 0) {
          snapshot[tbl] = resObj[0].values.map(val => val[val.length - 2]); // data column
        }
      } catch (e) {
        // ignore missing
      }
    });

    fs.writeFileSync(path.join(targetBackupPath, 'data_snapshot.json'), JSON.stringify(snapshot, null, 2));

    res.json({
      success: true,
      backupPath: targetBackupPath,
      timestamp,
      message: `Local backup saved successfully to ${targetBackupPath}`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

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
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
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



