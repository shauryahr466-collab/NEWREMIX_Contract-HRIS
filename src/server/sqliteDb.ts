import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';

let dbInstance: Database | null = null;
let activeDbPath: string | null = null;
let activeDbMtimeMs = 0;
let activeDbSize = 0;

let roDbInstance: Database | null = null;
let roDbPath: string | null = null;
let roDbMtimeMs = 0;
let roDbSize = 0;

// Ensure root folder works across operating systems safely
export function getSanitizedRootFolder(): string {
  if (process.env.LOCAL_STORAGE_PATH) {
    return process.env.LOCAL_STORAGE_PATH.trim();
  }

  if (process.platform === 'win32') {
    return 'E:\\SHRM_HRIS';
  }

  // Fallback for Linux / Cloud Run container / AI Studio Preview
  const fallback = path.resolve(process.cwd(), 'local_hris_data');
  if (!fs.existsSync(fallback)) {
    try {
      fs.mkdirSync(fallback, { recursive: true });
    } catch (e) {
      // ignore
    }
  }
  return fallback;
}

export function getSqliteDbPath(): string {
  if (process.env.LOCAL_DB_PATH) {
    return process.env.LOCAL_DB_PATH.trim();
  }

  const root = getSanitizedRootFolder();
  return path.join(root, 'Database.db');
}

export function setRootFolder(newPath: string) {
  if (newPath && typeof newPath === 'string') {
    process.env.LOCAL_STORAGE_PATH = newPath.trim();
    process.env.LOCAL_DB_PATH = path.join(newPath.trim(), 'Database.db');
    initLocalDirectories();
  }
}

export function initLocalDirectories() {
  const root = getSanitizedRootFolder();
  const dirs = [
    root,
    path.join(root, 'Documents'),
    path.join(root, 'Documents', 'Employees'),
    path.join(root, 'Backups'),
    path.join(root, 'Imports'),
    path.join(root, 'Exports'),
    path.join(root, 'Logs'),
  ];

  dirs.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.warn(`[LocalDirs] Directory notice for ${dir}:`, err);
    }
  });
}

export async function getSqliteDb(): Promise<Database> {
  const dbPath = getSqliteDbPath();

  if (dbInstance && activeDbPath === dbPath) {
    try {
      let diskChanged = false;
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        if (stats.size > 0 && (stats.mtimeMs !== activeDbMtimeMs || stats.size !== activeDbSize)) {
          diskChanged = true;
        }
      }
      if (!diskChanged) {
        dbInstance.exec('PRAGMA quick_check;');
        return dbInstance;
      }
      try { dbInstance.close(); } catch {}
      dbInstance = null;
    } catch {
      dbInstance = null;
    }
  }

  initLocalDirectories();
  const SQL = await initSqlJs();
  activeDbPath = dbPath;

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let fileBuffer: Buffer | null = null;
  const dbExists = fs.existsSync(dbPath);
  let loadedStats: fs.Stats | null = null;

  if (dbExists) {
    try {
      const stats = fs.statSync(dbPath);
      if (stats.size > 0) {
        fileBuffer = fs.readFileSync(dbPath);
        loadedStats = stats;
      }
    } catch (e) {
      console.warn(`[SQLite] Failed to read existing database at ${dbPath}:`, e);
    }
  }

  let loadedSuccessfully = false;

  if (fileBuffer && fileBuffer.length > 0) {
    try {
      const candidate = new SQL.Database(fileBuffer);
      // Quick health check on the loaded database instance
      const check = candidate.exec('PRAGMA quick_check;');
      if (check && check.length > 0 && check[0].values?.[0]?.[0] === 'ok') {
        dbInstance = candidate;
        loadedSuccessfully = true;
        activeDbMtimeMs = loadedStats?.mtimeMs || 0;
        activeDbSize = loadedStats?.size || fileBuffer.length;
        console.log(`[SQLite] Loaded healthy database from: ${dbPath}`);
      } else {
        throw new Error('Database quick_check failed');
      }

      // Automatic Safety Backup after successful load verification
      try {
        const backupDir = path.join(getSanitizedRootFolder(), 'Backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `Database_backup_${timestamp}.db`);
        fs.copyFileSync(dbPath, backupPath);
      } catch (bErr) {
        console.warn('[SQLite] Automatic safety backup notice:', bErr);
      }
    } catch (e: any) {
      console.warn(`[SQLite] Database file at ${dbPath} needed recovery (${e?.message || e}), searching backups...`);

      // Try restoring from recent backup if available
      try {
        const backupDir = path.join(getSanitizedRootFolder(), 'Backups');
        if (fs.existsSync(backupDir)) {
          const backupFiles = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.db'))
            .map(f => path.join(backupDir, f))
            .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

          for (const bFile of backupFiles) {
            try {
              const bBuf = fs.readFileSync(bFile);
              if (bBuf.length > 0) {
                const bCand = new SQL.Database(bBuf);
                const bCheck = bCand.exec('PRAGMA quick_check;');
                if (bCheck && bCheck.length > 0 && bCheck[0].values?.[0]?.[0] === 'ok') {
                  dbInstance = bCand;
                  loadedSuccessfully = true;
                  console.log(`[SQLite] Restored healthy database from backup: ${bFile}`);
                  break;
                }
              }
            } catch {
              // continue trying older backups
            }
          }
        }
      } catch (bRestErr) {
        console.warn('[SQLite] Backup restore check notice:', bRestErr);
      }
    }
  }

  if (!loadedSuccessfully || !dbInstance) {
    dbInstance = new SQL.Database();
    console.log(`[SQLite] Initialized clean SQLite database instance.`);
  }

  const schemaSql = `
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT DEFAULT '',
      role TEXT DEFAULT 'Editor',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Unnamed',
      department TEXT DEFAULT '',
      designation TEXT DEFAULT '',
      shift_id TEXT DEFAULT '',
      joining_date TEXT DEFAULT '',
      status TEXT DEFAULT 'Active',
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance_punches (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      punch_datetime TEXT NOT NULL DEFAULT '',
      device_id TEXT DEFAULT '',
      source TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shift_assignments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      shift_id TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS assignment_logs (
      id TEXT PRIMARY KEY,
      employee_id TEXT DEFAULT '',
      date TEXT DEFAULT '',
      shift_id TEXT DEFAULT '',
      data TEXT DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS leave (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS leave_records (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS overtime (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      hours REAL DEFAULT 0,
      status TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sbl (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS force_attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS exceptions (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT 'Pending',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      month TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS tax_rules (
      id TEXT PRIMARY KEY,
      fiscal_year TEXT NOT NULL DEFAULT 'FY 2083/84',
      taxpayer_type TEXT NOT NULL DEFAULT 'RESIDENT_INDIVIDUAL',
      marital_status_applicable INTEGER NOT NULL DEFAULT 0,
      slab_order INTEGER NOT NULL DEFAULT 1,
      label TEXT NOT NULL DEFAULT '',
      lower_limit REAL NOT NULL DEFAULT 0,
      upper_limit REAL NOT NULL DEFAULT 0,
      rate REAL NOT NULL DEFAULT 0,
      tax_type TEXT NOT NULL DEFAULT 'Income Tax',
      cumulative_checkpoint REAL NOT NULL DEFAULT 0,
      effective_from TEXT NOT NULL DEFAULT '2083-04-01',
      effective_to TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      source_reference TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deduction_rules (
      id TEXT PRIMARY KEY,
      fiscal_year TEXT NOT NULL DEFAULT 'FY 2083/84',
      name TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'RETIREMENT_FUND',
      annual_limit REAL NOT NULL DEFAULT 0,
      income_percentage_cap REAL,
      eligible INTEGER NOT NULL DEFAULT 1,
      effective_date TEXT NOT NULL DEFAULT '2083-04-01',
      active INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS salary_components (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'Earning',
      taxable INTEGER NOT NULL DEFAULT 1,
      ssf_applicable INTEGER NOT NULL DEFAULT 0,
      ctc_applicable INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payroll_config_audit (
      id TEXT PRIMARY KEY,
      fiscal_year TEXT NOT NULL DEFAULT 'FY 2083/84',
      rule_version TEXT NOT NULL DEFAULT '1.0',
      user TEXT NOT NULL DEFAULT '',
      changes_summary TEXT NOT NULL DEFAULT '',
      reason TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      document_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER DEFAULT 0,
      file_type TEXT DEFAULT '',
      uploaded_at TEXT,
      uploaded_by TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      employee_id TEXT DEFAULT '',
      date TEXT DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zk_devices (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zk_user_mappings (
      id TEXT PRIMARY KEY,
      device_user_id TEXT NOT NULL DEFAULT '',
      employee_id TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS zk_sync_logs (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zk_unmapped_punches (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS weekly_offs (
      id TEXT PRIMARY KEY,
      day TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS designations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS roster_batches (
      id TEXT PRIMARY KEY,
      roster_name TEXT NOT NULL DEFAULT '',
      period_start TEXT NOT NULL DEFAULT '',
      period_end TEXT NOT NULL DEFAULT '',
      total_days INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT '',
      imported_by TEXT DEFAULT '',
      source_file_name TEXT DEFAULT '',
      status TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT,
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS roster_assignments (
      id TEXT PRIMARY KEY,
      roster_batch_id TEXT DEFAULT '',
      employee_id TEXT NOT NULL DEFAULT '',
      roster_date TEXT NOT NULL DEFAULT '',
      shift_code TEXT NOT NULL DEFAULT '',
      shift_start TEXT DEFAULT '',
      shift_end TEXT DEFAULT '',
      source TEXT DEFAULT '',
      status TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT,
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS shift_audit_logs (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      old_shift TEXT DEFAULT '',
      new_shift TEXT NOT NULL DEFAULT '',
      changed_by TEXT DEFAULT '',
      changed_at TEXT NOT NULL DEFAULT '',
      reason TEXT DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      data TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS employee_movements (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL DEFAULT '',
      effective_date TEXT NOT NULL DEFAULT '',
      movement_type TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS field_attendance_audit (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_decisions (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_punch_dedup ON attendance_punches (employee_id, punch_datetime, device_id);
    CREATE INDEX IF NOT EXISTS idx_punch_emp_datetime ON attendance_punches (employee_id, punch_datetime);
    CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees (department);
    CREATE INDEX IF NOT EXISTS idx_emp_status ON employees (status);
    CREATE INDEX IF NOT EXISTS idx_emp_joining ON employees (joining_date);
    CREATE INDEX IF NOT EXISTS idx_emp_designation ON employees (designation);
    CREATE INDEX IF NOT EXISTS idx_movements_emp ON employee_movements (employee_id, effective_date);
    CREATE INDEX IF NOT EXISTS idx_audit_emp ON audit_logs (employee_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_roster_assign_batch ON roster_assignments (roster_batch_id, employee_id, roster_date);
    CREATE INDEX IF NOT EXISTS idx_roster_assign_emp_date ON roster_assignments (employee_id, roster_date);
    CREATE INDEX IF NOT EXISTS idx_roster_batches_period ON roster_batches (period_start, period_end);
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll_runs (month, status);
    CREATE INDEX IF NOT EXISTS idx_payroll_emp_month ON payroll (employee_id, month);
    CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance (employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_documents_emp ON documents (employee_id);
    CREATE INDEX IF NOT EXISTS idx_overtime_emp_date ON overtime (employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_leave_emp_date ON leave (employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_exceptions_emp_date ON exceptions (employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_shift_assign_emp_date ON shift_assignments (employee_id, date);
  `;

  try {
    dbInstance.run(schemaSql);
  } catch (schemaErr) {
    console.warn('[SQLite] Schema setup error on existing instance, re-initializing clean database:', schemaErr);
    dbInstance = new SQL.Database();
    dbInstance.run(schemaSql);
  }

  // Auto-normalize any legacy 5-digit Excel serial dates in employees table to ISO YYYY-MM-DD
  try {
    const empRows = dbInstance.exec("SELECT id, joining_date, data FROM employees WHERE joining_date GLOB '[0-9][0-9][0-9][0-9][0-9]'");
    if (empRows.length > 0 && empRows[0].values.length > 0) {
      const updateStmt = dbInstance.prepare("UPDATE employees SET joining_date = ?, data = ? WHERE id = ?");
      let migratedCount = 0;
      for (const val of empRows[0].values) {
        const id = String(val[0]);
        const rawDOJ = String(val[1]);
        const dataStr = String(val[2] || '{}');
        const num = Number(rawDOJ);
        if (num > 20000 && num < 90000) {
          const d = new Date((num - 25569) * 86400 * 1000);
          if (!isNaN(d.getTime())) {
            const isoDate = d.toISOString().split('T')[0];
            let parsedData: any = {};
            try {
              parsedData = JSON.parse(dataStr);
              parsedData.joiningDate = isoDate;
            } catch (e) {}
            updateStmt.run([isoDate, JSON.stringify(parsedData), id]);
            migratedCount++;
          }
        }
      }
      updateStmt.free();
      console.log(`[SQLite] Auto-migrated ${migratedCount} employee joining_date serials to ISO dates.`);
    }
  } catch (migErr) {
    console.warn('[SQLite] Notice during employee joining_date auto-normalization:', migErr);
  }

  if (!dbExists || !loadedSuccessfully) {
    saveSqliteDb();
  }
  return dbInstance;
}

/**
 * 100% Read-Only SQLite Snapshot Reader.
 * Reads directly from physical Database.db on disk whenever file mtime/size changes
 * and NEVER exports, saves, or mutates Database.db.
 */
export async function withReadOnlySqliteSnapshot<T>(operation: (db: Database) => T): Promise<T> {
  const dbPath = getSqliteDbPath();

  if (!fs.existsSync(dbPath)) {
    // Fallback to initialized schema view if DB file has not been created yet, without forcing disk writes if avoidable
    const db = await getSqliteDb();
    return operation(db);
  }

  try {
    const stats = fs.statSync(dbPath);
    if (stats.size > 0) {
      const needsReload =
        !roDbInstance ||
        roDbPath !== dbPath ||
        roDbMtimeMs !== stats.mtimeMs ||
        roDbSize !== stats.size;

      if (needsReload) {
        const SQL = await initSqlJs();
        const fileBuffer = fs.readFileSync(dbPath);
        const candidate = new SQL.Database(fileBuffer);
        if (roDbInstance) {
          try { roDbInstance.close(); } catch {}
        }
        roDbInstance = candidate;
        roDbPath = dbPath;
        roDbMtimeMs = stats.mtimeMs;
        roDbSize = stats.size;
      }

      if (roDbInstance) {
        return operation(roDbInstance);
      }
    }
  } catch (err) {
    console.warn('[SQLite Read-Only Snapshot] Falling back cleanly:', err);
  }

  const db = await getSqliteDb();
  return operation(db);
}

export async function resetSqliteDb(): Promise<Database> {
  dbInstance = null;
  const dbPath = getSqliteDbPath();
  if (fs.existsSync(dbPath)) {
    try {
      const corruptPath = `${dbPath}.corrupted_${Date.now()}`;
      fs.copyFileSync(dbPath, corruptPath);
      fs.unlinkSync(dbPath);
    } catch (e) {
      // ignore
    }
  }
  return await getSqliteDb();
}

export function createDatabaseBackup(label?: string): string {
  const dbPath = activeDbPath || getSqliteDbPath();
  const backupDir = path.join(getSanitizedRootFolder(), 'Backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Flush current database to disk first
  saveSqliteDb();

  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = new Date();
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const suffix = label ? `_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  const backupFileName = `Database_backup_${dateStr}${suffix}.db`;
  const backupPath = path.join(backupDir, backupFileName);

  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[SQLite Backup] Created backup at: ${backupPath}`);
  }
  return backupPath;
}

export function saveSqliteDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const targetPath = activeDbPath || getSqliteDbPath();

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${targetPath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, targetPath);

    try {
      const savedStats = fs.statSync(targetPath);
      activeDbMtimeMs = savedStats.mtimeMs;
      activeDbSize = savedStats.size;
    } catch {}
  } catch (err) {
    console.warn('[SQLite] Notice during SQLite disk sync:', err);
  }
}

// In-process serialized write lock to prevent simultaneous write transactions
let writeLockPromise: Promise<unknown> = Promise.resolve();

export function withSqliteWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeLockPromise.then(
    () => operation(),
    () => operation()
  );
  writeLockPromise = next.catch(() => {});
  return next;
}

