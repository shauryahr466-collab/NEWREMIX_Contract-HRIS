import express from 'express';
import path from 'path';
import fs from 'fs';
import { getSqliteDb, saveSqliteDb, getSanitizedRootFolder, setRootFolder } from './sqliteDb.js';

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
    zk_user_mappings: 'zk_user_mappings'
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
    zk_user_mappings: 'zk_user_mappings'
  };

  const sqlTable = validTables[table];
  if (!sqlTable) {
    return res.status(400).json({ error: 'Invalid table' });
  }

  try {
    const db = await getSqliteDb();
    const now = new Date().toISOString();

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
    zk_user_mappings: 'zk_user_mappings'
  };

  const sqlTable = validTables[table];
  if (!sqlTable) return res.status(400).json({ error: 'Invalid table' });

  try {
    const db = await getSqliteDb();
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(`DELETE FROM ${sqlTable} WHERE id = ?`);
    for (const id of idList) {
      if (id) stmt.run([id]);
    }
    stmt.free();
    db.run('COMMIT');
    saveSqliteDb();

    res.json({ success: true, deleted: idList.length });
  } catch (error: any) {
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
    const docsDir = path.join(root, 'data', 'documents');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    const cleanEmpId = sanitizeFileName(String(employeeId));
    const cleanFileName = sanitizeFileName(String(fileName));
    const uniqueId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const physicalName = `${cleanEmpId}_${Date.now()}_${cleanFileName}`;
    const physicalPath = path.join(docsDir, physicalName);

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
