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

export async function saveLocalTable<T>(table: string, data: T | T[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/local/data/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function deleteLocalTableRecords(table: string, ids: string[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/local/data/${table}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    return res.ok;
  } catch (e) {
    return false;
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
    body: JSON.stringify(snapshot)
  });
  if (!res.ok) throw new Error('Migration failed');
  return await res.json();
}
