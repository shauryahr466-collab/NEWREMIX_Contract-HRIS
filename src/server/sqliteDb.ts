import fs from 'fs';
import os from 'os';
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

export interface SystemErrorEntry {
  id: string;
  timestamp: string;
  source: string;
  message: string;
}

const recentSystemErrors: SystemErrorEntry[] = [];
const MAX_SYSTEM_ERRORS = 50;

export const sqliteHealthMeta: {
  lastVerifiedAt: string | null;
  lastIntegrityStatus: 'ok' | 'error' | 'unknown';
  lastIntegrityError: string | null;
  lastBackupPath: string | null;
  lastBackupVerifiedAt: string | null;
  lastBackupStatus: 'VERIFIED' | 'FAILED' | 'NONE';
  lastBackupError: string | null;
} = {
  lastVerifiedAt: null,
  lastIntegrityStatus: 'unknown',
  lastIntegrityError: null,
  lastBackupPath: null,
  lastBackupVerifiedAt: null,
  lastBackupStatus: 'NONE',
  lastBackupError: null
};

export function recordSystemError(source: string, message: unknown) {
  const cleanMsg = String(message instanceof Error ? message.message : message || 'Unknown error').slice(0, 400);
  recentSystemErrors.unshift({
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    source,
    message: cleanMsg
  });
  if (recentSystemErrors.length > MAX_SYSTEM_ERRORS) {
    recentSystemErrors.length = MAX_SYSTEM_ERRORS;
  }
}

export function getRecentSystemErrors(limit = 15): SystemErrorEntry[] {
  return recentSystemErrors.slice(0, Math.max(1, limit));
}

export function getSqliteHealthMeta() {
  return { ...sqliteHealthMeta };
}

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
    } catch {
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
  const requireExistingDb =
    ((process.platform === 'win32' && Boolean(process.env.LOCAL_DB_PATH)) ||
      process.env.REQUIRE_EXISTING_DB === 'true') &&
    process.env.ALLOW_INIT_NEW_DB !== 'true';

  if (dbInstance && activeDbPath === dbPath) {
    try {
      let diskChanged = false;
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        if (stats.size > 0 && (stats.mtimeMs !== activeDbMtimeMs || stats.size !== activeDbSize)) {
          diskChanged = true;
        }
      } else if (requireExistingDb) {
        const msg = `PRODUCTION_DB_MISSING: Configured SQLite database missing at ${dbPath}`;
        sqliteHealthMeta.lastIntegrityStatus = 'error';
        sqliteHealthMeta.lastIntegrityError = msg;
        recordSystemError('sqliteDb', msg);
        throw new Error(msg);
      }
      if (!diskChanged) {
        const chk = dbInstance.exec('PRAGMA quick_check;');
        if (chk.length > 0 && chk[0].values?.[0]?.[0] === 'ok') {
          sqliteHealthMeta.lastVerifiedAt = new Date().toISOString();
          sqliteHealthMeta.lastIntegrityStatus = 'ok';
          sqliteHealthMeta.lastIntegrityError = null;
          return dbInstance;
        }
      }
      try { dbInstance.close(); } catch {}
      dbInstance = null;
    } catch (err: any) {
      if (err?.message?.startsWith('PRODUCTION_DB_MISSING')) {
        throw err;
      }
      dbInstance = null;
    }
  }

  initLocalDirectories();
  const SQL = await initSqlJs();
  activeDbPath = dbPath;

  const dbExists = fs.existsSync(dbPath);
  if (requireExistingDb && !dbExists) {
    const msg = `PRODUCTION_DB_MISSING: Refusing to create a blank database because required SQLite file is missing at ${dbPath}. Restore from Backups or set ALLOW_INIT_NEW_DB=true for initial setup.`;
    sqliteHealthMeta.lastIntegrityStatus = 'error';
    sqliteHealthMeta.lastIntegrityError = msg;
    recordSystemError('sqliteDb', msg);
    throw new Error(msg);
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let fileBuffer: Buffer | null = null;
  let loadedStats: fs.Stats | null = null;

  if (dbExists) {
    try {
      const stats = fs.statSync(dbPath);
      if (stats.size > 0) {
        fileBuffer = fs.readFileSync(dbPath);
        loadedStats = stats;
      }
    } catch (e: any) {
      recordSystemError('sqliteDb', `Failed to read database at ${dbPath}: ${e?.message || e}`);
      console.warn(`[SQLite] Failed to read existing database at ${dbPath}:`, e);
    }
  }

  let loadedSuccessfully = false;

  if (fileBuffer && fileBuffer.length > 0) {
    try {
      const candidate = new SQL.Database(fileBuffer);
      const check = candidate.exec('PRAGMA quick_check;');
      if (check && check.length > 0 && check[0].values?.[0]?.[0] === 'ok') {
        dbInstance = candidate;
        loadedSuccessfully = true;
        activeDbMtimeMs = loadedStats?.mtimeMs || 0;
        activeDbSize = loadedStats?.size || fileBuffer.length;
        sqliteHealthMeta.lastVerifiedAt = new Date().toISOString();
        sqliteHealthMeta.lastIntegrityStatus = 'ok';
        sqliteHealthMeta.lastIntegrityError = null;
        console.log(`[SQLite] Loaded healthy database from: ${dbPath}`);
      } else {
        throw new Error('Database quick_check failed');
      }

      // Automatic verified startup safety backup disabled per user request
      sqliteHealthMeta.lastBackupStatus = 'NONE';
    } catch (e: any) {
      recordSystemError('sqliteDb', `Database integrity recovery triggered: ${e?.message || e}`);
      console.warn(`[SQLite] Database file at ${dbPath} needed recovery (${e?.message || e}), searching backups...`);

      // Try restoring from recent verified backup if available
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
                  sqliteHealthMeta.lastVerifiedAt = new Date().toISOString();
                  sqliteHealthMeta.lastIntegrityStatus = 'ok';
                  sqliteHealthMeta.lastIntegrityError = null;
                  console.log(`[SQLite] Restored healthy database from backup: ${bFile}`);
                  break;
                }
              }
            } catch {
              // continue trying older backups
            }
          }
        }
      } catch (bRestErr: any) {
        recordSystemError('sqliteDb', `Backup recovery check failed: ${bRestErr?.message || bRestErr}`);
      }
    }
  }

  if (!loadedSuccessfully || !dbInstance) {
    if (requireExistingDb && dbExists) {
      const msg = `PRODUCTION_DB_CORRUPT: Existing production database at ${dbPath} failed integrity check and no verified backup could be restored. Halting to prevent overwriting production records.`;
      sqliteHealthMeta.lastIntegrityStatus = 'error';
      sqliteHealthMeta.lastIntegrityError = msg;
      recordSystemError('sqliteDb', msg);
      throw new Error(msg);
    }
    dbInstance = new SQL.Database();
    sqliteHealthMeta.lastVerifiedAt = new Date().toISOString();
    sqliteHealthMeta.lastIntegrityStatus = 'ok';
    sqliteHealthMeta.lastIntegrityError = null;
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

    CREATE TABLE IF NOT EXISTS zk_scheduler_config (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      interval_minutes INTEGER NOT NULL DEFAULT 15,
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

    CREATE TABLE IF NOT EXISTS hr_jobs (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_candidates (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_onboarding_tasks (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_performance_goals (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_assets (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_tickets (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_projects (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_timesheets (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_document_requests (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hr_notifications (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS approval_audits (
      id TEXT PRIMARY KEY,
      module TEXT NOT NULL DEFAULT '',
      record_id TEXT NOT NULL DEFAULT '',
      employee_id TEXT DEFAULT '',
      employee_name TEXT DEFAULT '',
      target_date TEXT DEFAULT '',
      previous_status TEXT DEFAULT '',
      new_status TEXT NOT NULL DEFAULT '',
      previous_approver TEXT DEFAULT '',
      previous_approver_role TEXT DEFAULT '',
      approved_by TEXT NOT NULL DEFAULT '',
      approved_by_role TEXT NOT NULL DEFAULT '',
      is_override INTEGER NOT NULL DEFAULT 0,
      remarks TEXT DEFAULT '',
      bs_date TEXT DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_punch_dedup ON attendance_punches (employee_id, punch_datetime, device_id);
    CREATE INDEX IF NOT EXISTS idx_punch_emp_datetime ON attendance_punches (employee_id, punch_datetime);
    CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees (department);
    CREATE INDEX IF NOT EXISTS idx_emp_status ON employees (status);
    CREATE INDEX IF NOT EXISTS idx_emp_joining ON employees (joining_date);
    CREATE INDEX IF NOT EXISTS idx_emp_designation ON employees (designation);
    CREATE INDEX IF NOT EXISTS idx_movements_emp ON employee_movements (employee_id, effective_date);
    CREATE INDEX IF NOT EXISTS idx_audit_emp ON audit_logs (employee_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_approval_audits_ts ON approval_audits (timestamp);
    CREATE INDEX IF NOT EXISTS idx_approval_audits_emp ON approval_audits (employee_id, module);
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

const SQLITE_MAGIC_HEADER = 'SQLite format 3\0';

function assertValidSqliteBuffer(buf: Buffer, contextLabel: string) {
  if (!buf || buf.length < 100) {
    throw new Error(`${contextLabel}: file is empty or too small (${buf ? buf.length : 0} bytes)`);
  }
  const header = buf.subarray(0, 16).toString('utf8');
  if (header !== SQLITE_MAGIC_HEADER) {
    throw new Error(`${contextLabel}: invalid SQLite magic header`);
  }
}

export function _createDatabaseBackupUnlocked(label?: string): string {
  const dbPath = activeDbPath || getSqliteDbPath();
  const backupDir = path.join(getSanitizedRootFolder(), 'Backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = new Date();
  const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3, '0')}`;
  const suffix = label ? `_${label.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  const backupFileName = `Database_backup_${dateStr}${suffix}.db`;
  const backupPath = path.join(backupDir, backupFileName);
  const tmpPath = `${backupPath}.tmp.${Date.now()}`;

  let diskIsNewer = false;
  if (fs.existsSync(dbPath)) {
    try {
      const st = fs.statSync(dbPath);
      if (st.size > 0 && activeDbMtimeMs > 0 && st.mtimeMs > activeDbMtimeMs + 5) {
        diskIsNewer = true;
      }
    } catch {}
  }

  if (diskIsNewer || !dbInstance) {
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Cannot create backup: database file not found at ${dbPath}`);
    }
    fs.copyFileSync(dbPath, tmpPath);
  } else {
    const data = dbInstance.export();
    fs.writeFileSync(tmpPath, Buffer.from(data));
  }

  const buf = fs.readFileSync(tmpPath);
  assertValidSqliteBuffer(buf, 'Backup creation');
  fs.renameSync(tmpPath, backupPath);

  sqliteHealthMeta.lastBackupPath = backupPath;
  console.log(`[SQLite Backup] Created backup at: ${backupPath} (${buf.length} bytes)`);
  return backupPath;
}

export function createDatabaseBackup(label?: string): string {
  // Flush current database to disk safely if no external collector overwrite occurred
  saveSqliteDb();
  return _createDatabaseBackupUnlocked(label);
}

export async function verifyBackupFile(fileNameOrPath: string): Promise<{
  valid: boolean;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  quickCheck: string;
  employeesCount: number;
  punchesCount: number;
  payrollRunsCount: number;
  error?: string;
}> {
  const backupDir = path.resolve(getSanitizedRootFolder(), 'Backups');
  const safeName = path.basename(String(fileNameOrPath || '').trim());
  if (!safeName || !safeName.endsWith('.db')) {
    throw new Error('Invalid backup filename');
  }
  const resolved = path.resolve(backupDir, safeName);
  if (!resolved.startsWith(backupDir + path.sep)) {
    throw new Error('Access denied: backup path outside Backups directory');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Backup file not found: ${safeName}`);
  }

  const stats = fs.statSync(resolved);
  const buf = fs.readFileSync(resolved);
  let testDb: Database | null = null;
  try {
    assertValidSqliteBuffer(buf, `Backup verify (${safeName})`);
    const SQL = await initSqlJs();
    testDb = new SQL.Database(buf);
    const chk = testDb.exec('PRAGMA quick_check;');
    const quickCheck = String(chk?.[0]?.values?.[0]?.[0] || 'unknown');
    if (quickCheck !== 'ok') {
      throw new Error(`PRAGMA quick_check returned: ${quickCheck}`);
    }

    const safeCount = (tableName: string): number => {
      try {
        const res = testDb!.exec(`SELECT COUNT(*) FROM ${tableName}`);
        return Number(res?.[0]?.values?.[0]?.[0] || 0);
      } catch {
        return 0;
      }
    };

    return {
      valid: true,
      fileName: safeName,
      filePath: resolved,
      sizeBytes: stats.size,
      quickCheck,
      employeesCount: safeCount('employees'),
      punchesCount: safeCount('attendance_punches'),
      payrollRunsCount: safeCount('payroll_runs')
    };
  } catch (err: any) {
    return {
      valid: false,
      fileName: safeName,
      filePath: resolved,
      sizeBytes: stats.size,
      quickCheck: 'failed',
      employeesCount: 0,
      punchesCount: 0,
      payrollRunsCount: 0,
      error: err?.message || 'Backup verification failed'
    };
  } finally {
    if (testDb) {
      try { testDb.close(); } catch {}
    }
  }
}

export async function createVerifiedDatabaseBackup(label?: string): Promise<{
  backupPath: string;
  fileName: string;
  sizeBytes: number;
  quickCheck: string;
  employeesCount: number;
  punchesCount: number;
  payrollRunsCount: number;
  verified: boolean;
}> {
  return withSqliteWriteLock(async () => {
    await getSqliteDb();
    const backupPath = _createDatabaseBackupUnlocked(label);
    const fileName = path.basename(backupPath);
    const verification = await verifyBackupFile(fileName);
    if (!verification.valid) {
      sqliteHealthMeta.lastBackupStatus = 'FAILED';
      sqliteHealthMeta.lastBackupError = verification.error || 'Backup verification failed';
      recordSystemError('backup', sqliteHealthMeta.lastBackupError);
      try { fs.unlinkSync(backupPath); } catch {}
      throw new Error(`Verified backup failed: ${sqliteHealthMeta.lastBackupError}`);
    }

    sqliteHealthMeta.lastBackupPath = backupPath;
    sqliteHealthMeta.lastBackupVerifiedAt = new Date().toISOString();
    sqliteHealthMeta.lastBackupStatus = 'VERIFIED';
    sqliteHealthMeta.lastBackupError = null;

    return {
      backupPath,
      fileName,
      sizeBytes: verification.sizeBytes,
      quickCheck: verification.quickCheck,
      employeesCount: verification.employeesCount,
      punchesCount: verification.punchesCount,
      payrollRunsCount: verification.payrollRunsCount,
      verified: true
    };
  });
}

export async function testRestoreBackupCopy(fileName: string): Promise<{
  success: boolean;
  fileName: string;
  quickCheck: string;
  employeesCount: number;
  punchesCount: number;
  payrollRunsCount: number;
  sizeBytes: number;
  error?: string;
}> {
  const backupDir = path.resolve(getSanitizedRootFolder(), 'Backups');
  const safeName = path.basename(String(fileName || '').trim());
  if (!safeName || !safeName.endsWith('.db')) {
    throw new Error('Invalid backup filename');
  }
  const sourcePath = path.resolve(backupDir, safeName);
  if (!sourcePath.startsWith(backupDir + path.sep)) {
    throw new Error('Access denied: backup path outside Backups directory');
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found: ${safeName}`);
  }

  const tempCopyPath = path.join(os.tmpdir(), `shrm_restore_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
  let tempDb: Database | null = null;
  try {
    fs.copyFileSync(sourcePath, tempCopyPath);
    const stats = fs.statSync(tempCopyPath);
    const buf = fs.readFileSync(tempCopyPath);
    assertValidSqliteBuffer(buf, `Test restore (${safeName})`);
    const SQL = await initSqlJs();
    tempDb = new SQL.Database(buf);
    const chk = tempDb.exec('PRAGMA quick_check;');
    const quickCheck = String(chk?.[0]?.values?.[0]?.[0] || 'unknown');
    if (quickCheck !== 'ok') {
      throw new Error(`Restore integrity check failed: ${quickCheck}`);
    }
    const safeCount = (t: string): number => {
      try {
        const res = tempDb!.exec(`SELECT COUNT(*) FROM ${t}`);
        return Number(res?.[0]?.values?.[0]?.[0] || 0);
      } catch {
        return 0;
      }
    };
    return {
      success: true,
      fileName: safeName,
      quickCheck,
      employeesCount: safeCount('employees'),
      punchesCount: safeCount('attendance_punches'),
      payrollRunsCount: safeCount('payroll_runs'),
      sizeBytes: stats.size
    };
  } catch (err: any) {
    return {
      success: false,
      fileName: safeName,
      quickCheck: 'failed',
      employeesCount: 0,
      punchesCount: 0,
      payrollRunsCount: 0,
      sizeBytes: 0,
      error: err?.message || 'Test restore failed'
    };
  } finally {
    if (tempDb) {
      try { tempDb.close(); } catch {}
    }
    try {
      if (fs.existsSync(tempCopyPath)) fs.unlinkSync(tempCopyPath);
    } catch {}
  }
}

export function saveSqliteDb() {
  if (!dbInstance) return;
  try {
    const targetPath = activeDbPath || getSqliteDbPath();

    // Guard against overwriting an external collector's newer write on disk with stale in-memory sql.js bytes
    if (activeDbMtimeMs > 0 && fs.existsSync(targetPath)) {
      try {
        const currentStats = fs.statSync(targetPath);
        if (currentStats.size > 0 && currentStats.mtimeMs > activeDbMtimeMs + 5) {
          const msg = `Aborted stale SQLite flush: external disk modification detected at ${targetPath}`;
          console.warn(`[SQLite Guard] ${msg}`);
          recordSystemError('sqliteDb', msg);
          return;
        }
      } catch {}
    }

    const data = dbInstance.export();
    const buffer = Buffer.from(data);

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
  } catch (err: any) {
    recordSystemError('sqliteDb', `Notice during SQLite disk sync: ${err?.message || err}`);
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

