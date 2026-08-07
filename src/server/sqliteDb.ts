import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';

let dbInstance: Database | null = null;
let currentRootFolder: string = process.env.LOCAL_HRIS_ROOT || 'E:\\SHRM_HRIS';

// Ensure root folder works across operating systems safely
export function getSanitizedRootFolder(): string {
  // If running in Linux/Container and D:\ or E:\ isn't physically writeable, fallback to ./local_hris_data
  try {
    if (process.platform !== 'win32' && (currentRootFolder.startsWith('D:') || currentRootFolder.startsWith('E:'))) {
      const fallback = path.resolve(process.cwd(), 'local_hris_data');
      if (!fs.existsSync(fallback)) {
        fs.mkdirSync(fallback, { recursive: true });
      }
      return fallback;
    }
  } catch (e) {
    // ignore
  }
  return currentRootFolder;
}

export function setRootFolder(newPath: string) {
  if (newPath && typeof newPath === 'string') {
    currentRootFolder = newPath.trim();
    initLocalDirectories();
  }
}

export function initLocalDirectories() {
  const root = getSanitizedRootFolder();
  const dirs = [
    root,
    path.join(root, 'database'),
    path.join(root, 'data'),
    path.join(root, 'data', 'employees'),
    path.join(root, 'data', 'attendance'),
    path.join(root, 'data', 'leave'),
    path.join(root, 'data', 'overtime'),
    path.join(root, 'data', 'payroll'),
    path.join(root, 'data', 'documents'),
    path.join(root, 'imports'),
    path.join(root, 'exports'),
    path.join(root, 'backups'),
  ];

  dirs.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.warn(`[LocalDirs] Note for dir ${dir}:`, err);
    }
  });
}

export async function getSqliteDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  initLocalDirectories();
  const SQL = await initSqlJs();
  const root = getSanitizedRootFolder();
  const candidatePaths = [
    path.join(root, 'Database.db'),
    path.join(root, 'database', 'hris.db'),
    path.join(root, 'database', 'Database.db'),
  ];

  let fileBuffer: Buffer | null = null;
  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      try {
        fileBuffer = fs.readFileSync(candidatePath);
        if (fileBuffer && fileBuffer.length > 0) break;
      } catch (e) {
        console.warn(`[SQLite] Failed to read ${candidatePath}:`, e);
      }
    }
  }

  if (fileBuffer && fileBuffer.length > 0) {
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Create tables
  dbInstance.run(`
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

    CREATE TABLE IF NOT EXISTS shift_assignments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      shift_id TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS exceptions (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      status TEXT,
      data TEXT NOT NULL
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
  `);

  saveSqliteDb();
  return dbInstance;
}

export function saveSqliteDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const root = getSanitizedRootFolder();
    
    // Save to Database.db (matching DB Browser for SQLite default file)
    fs.writeFileSync(path.join(root, 'Database.db'), buffer);
    
    // Save to database/hris.db (matching subdirectory structure)
    const dbSubDir = path.join(root, 'database');
    if (!fs.existsSync(dbSubDir)) {
      fs.mkdirSync(dbSubDir, { recursive: true });
    }
    fs.writeFileSync(path.join(dbSubDir, 'hris.db'), buffer);
  } catch (err) {
    console.error('[SQLite] Failed to persist SQLite database file:', err);
  }
}
