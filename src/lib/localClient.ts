// Client helper for interacting with the Local Node.js + Express + SQLite API

export interface LocalStatus {
  status: string;
  mode: string;
  database: string;
  storage: string;
  internetRequired: boolean;
  rootFolder: string;
  stats: {
    employees: number;
    punches: number;
    documents: number;
    backups: number;
  };
}

export async function fetchLocalStatus(): Promise<LocalStatus | null> {
  try {
    const res = await fetch('/api/local/status');
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function setLocalRootFolder(rootFolder: string): Promise<boolean> {
  try {
    const res = await fetch('/api/local/config/root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootFolder })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function fetchLocalTable<T>(table: string): Promise<T[]> {
  try {
    const res = await fetch(`/api/local/data/${table}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

export interface LocalSaveResult {
  success: boolean;
  verified: boolean;
  verificationStatus: 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';
  transaction: 'COMMITTED' | 'ROLLED_BACK' | 'N/A';
  dbPath: string;
  affectedCount: number;
  table?: string;
  timestamp: string;
  error?: string;
}

export async function saveLocalTable<T>(table: string, data: T | T[]): Promise<boolean> {
  const res = await saveLocalTableDetailed(table, data);
  return res.success;
}

export async function saveLocalTableDetailed<T>(table: string, data: T | T[]): Promise<LocalSaveResult> {
  const items = Array.isArray(data) ? data : [data];
  try {
    const res = await fetch(`/api/local/data/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) {
      return {
        success: false,
        verified: false,
        verificationStatus: 'FAILED',
        transaction: 'ROLLED_BACK',
        dbPath: 'E:\\SHRM_HRIS\\Database.db',
        affectedCount: 0,
        table: table,
        timestamp: new Date().toISOString(),
        error: result.error || 'Failed to save to database'
      };
    }
    return {
      success: true,
      verified: result.verified ?? true,
      verificationStatus: result.verificationStatus || 'PASSED',
      transaction: result.transaction || 'COMMITTED',
      dbPath: result.dbPath || 'E:\\SHRM_HRIS\\Database.db',
      affectedCount: result.affectedCount || items.length,
      table: table,
      timestamp: result.timestamp || new Date().toISOString()
    };
  } catch (e: any) {
    return {
      success: false,
      verified: false,
      verificationStatus: 'FAILED',
      transaction: 'ROLLED_BACK',
      dbPath: 'E:\\SHRM_HRIS\\Database.db',
      affectedCount: 0,
      table: table,
      timestamp: new Date().toISOString(),
      error: e?.message || 'Network / Server Error'
    };
  }
}

export async function deleteLocalTableRecords(table: string, ids: string[]): Promise<boolean> {
  const res = await deleteLocalTableDetailed(table, ids);
  return res.success;
}

export async function deleteLocalTableDetailed(table: string, ids: string[]): Promise<LocalSaveResult> {
  try {
    const res = await fetch(`/api/local/data/${table}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const result = await res.json();
    if (!res.ok) {
      return {
        success: false,
        verified: false,
        verificationStatus: 'FAILED',
        transaction: 'ROLLED_BACK',
        dbPath: 'E:\\SHRM_HRIS\\Database.db',
        affectedCount: 0,
        timestamp: new Date().toISOString(),
        error: result.error || 'Failed to delete records'
      };
    }
    return {
      success: true,
      verified: result.verified ?? true,
      verificationStatus: result.verificationStatus || 'PASSED',
      transaction: result.transaction || 'COMMITTED',
      dbPath: result.dbPath || 'E:\\SHRM_HRIS\\Database.db',
      affectedCount: result.deletedCount || ids.length,
      timestamp: result.timestamp || new Date().toISOString()
    };
  } catch (e: any) {
    return {
      success: false,
      verified: false,
      verificationStatus: 'FAILED',
      transaction: 'ROLLED_BACK',
      dbPath: 'E:\\SHRM_HRIS\\Database.db',
      affectedCount: 0,
      timestamp: new Date().toISOString(),
      error: e?.message || 'Network / Server Error'
    };
  }
}

export async function verifyLocalDatabase() {
  try {
    const res = await fetch('/api/local/verify-db');
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

export async function purgeLocalTable(table: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/local/data/${table}/purge`, {
      method: 'POST'
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Documents API
export async function uploadLocalDocument(params: {
  employeeId: string;
  documentType: string;
  title: string;
  fileName: string;
  fileBase64: string;
  notes?: string;
  uploadedBy?: string;
}) {
  const res = await fetch('/api/local/documents/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return await res.json();
}

export async function fetchLocalEmployeeDocuments(employeeId: string) {
  try {
    const res = await fetch(`/api/local/documents/employee/${employeeId}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

export async function deleteLocalDocument(id: string) {
  const res = await fetch(`/api/local/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  return await res.json();
}

export async function triggerLocalBackup() {
  const res = await fetch('/api/local/backup', { method: 'POST' });
  if (!res.ok) throw new Error('Backup failed');
  return await res.json();
}

export async function migrateFirestoreToLocal(snapshot: any) {
  const res = await fetch('/api/local/migrate-from-firestore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot || {})
  });
  if (!res.ok) throw new Error('Migration failed');
  return await res.json();
}

export async function runPersistenceTest() {
  const res = await fetch('/api/local/persistence-test', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ persistenceStatus: 'FAILED', error: 'Request failed' }));
    return err;
  }
  return await res.json();
}
