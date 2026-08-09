import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';

let dbInstance: Database | null = null;
let activeDbPath: string | null = null;

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
  if (dbInstance) return dbInstance;

  initLocalDirectories();
  const SQL = await initSqlJs();
  const dbPath = getSqliteDbPath();
  activeDbPath = dbPath;

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let fileBuffer: Buffer | null = null;
  const dbExists = fs.existsSync(dbPath);

  if (dbExists) {
    try {
      fileBuffer = fs.readFileSync(dbPath);
    } catch (e) {
      console.warn(`[SQLite] Failed to read existing database at ${dbPath}:`, e);
    }
  }

  let loadedSuccessfully = false;

  if (fileBuffer && fileBuffer.length > 0) {
    try {
      const candidate = new SQL.Database(fileBuffer);
      // Quick health check on the loaded database instance
      candidate.exec('SELECT count(*) FROM sqlite_master;');
      candidate.exec('PRAGMA quick_check;');
      dbInstance = candidate;
      loadedSuccessfully = true;
      console.log(`[SQLite] Loaded existing production database from: ${dbPath}`);

      // Automatic Safety Backup after successful load verification
      try {
        const backupDir = path.join(getSanitizedRootFolder(), 'Backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `Database_backup_${timestamp}.db`);
        fs.copyFileSync(dbPath, backupPath);
        console.log(`[SQLite] Created safety backup at: ${backupPath}`);
      } catch (bErr) {
        console.warn('[SQLite] Automatic safety backup notice:', bErr);
      }
    } catch (e) {
      console.error(`[SQLite] Database file at ${dbPath} is corrupted/malformed:`, e);
      // Preserve corrupted file for reference
      try {
        const corruptPath = `${dbPath}.corrupted_${Date.now()}`;
        fs.copyFileSync(dbPath, corruptPath);
        console.warn(`[SQLite] Preserved corrupted file at ${corruptPath}`);
      } catch (cErr) {
        // ignore
      }

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
              const bCand = new SQL.Database(bBuf);
              bCand.exec('SELECT count(*) FROM sqlite_master;');
              dbInstance = bCand;
              loadedSuccessfully = true;
              fs.copyFileSync(bFile, dbPath);
              console.log(`[SQLite] Restored healthy database from backup: ${bFile}`);
              break;
            } catch (rErr) {
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
    console.log(`[SQLite] Initialized clean database instance at: ${dbPath}`);
  }

  const schemaSql = `
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT,
      designation TEXT,
      shift_id TEXT,
      joining_date TEXT,
      status TEXT,
      data TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance_punches (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      punch_datetime TEXT NOT NULL,
      device_id TEXT,
      source TEXT,
      data TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shift_assignments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      shift_id TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leave (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS overtime (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      hours REAL,
      status TEXT,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sbl (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS force_attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      month TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      status TEXT,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      file_type TEXT,
      uploaded_at TEXT,
      uploaded_by TEXT,
      notes TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      date TEXT,
      data TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zk_devices (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zk_user_mappings (
      id TEXT PRIMARY KEY,
      device_user_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS zk_sync_logs (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS zk_unmapped_punches (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS weekly_offs (
      id TEXT PRIMARY KEY,
      day TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS designations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_punch_dedup ON attendance_punches (employee_id, punch_datetime, device_id);
  `;

  try {
    dbInstance.run(schemaSql);
  } catch (schemaErr) {
    console.warn('[SQLite] Schema setup error on existing instance, re-initializing clean database:', schemaErr);
    dbInstance = new SQL.Database();
    dbInstance.run(schemaSql);
  }

  saveSqliteDb();
  return dbInstance;
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

    fs.writeFileSync(targetPath, buffer);
  } catch (err) {
    console.error('[SQLite] Failed to save SQLite database:', err);
  }
}

