import { authFetch } from './authSession';

export interface LocalStatus {
  status: string;
  mode: string;
  database: string;
  storage: string;
  internetRequired: boolean;
  rootFolder: string;
  dbPath?: string;
  stats: {
    employees: number;
    punches: number;
    documents: number;
    backups: number;
  };
}

export interface LocalPollDigest {
  punchCount: number;
  latestPunch: string;
  deviceCount: number;
  syncLogCount: number;
  unmappedCount: number;
  latestSync: string;
}

export interface LocalBootstrapPayload {
  success: boolean;
  timestamp: string;
  tables: Record<string, any[]>;
}

export interface SystemHealthMetrics {
  appStatus: string;
  nodeStatus: string;
  caddyStatus: string;
  databaseStatus: string;
  activeSqlitePath: string;
  databaseAccessible: boolean;
  lastSuccessfulDbVerification: string | null;
  zkDeviceConnection: string;
  lastPunchPollingTime: string | null;
  externalPunchRecordCount: number;
  connectedUserCount: number;
  activeAppVersion: string;
  latestBackupStatus: string;
  recentSystemErrors: Array<{ timestamp: string; module: string; message: string }>;
  punchMode: string;
  uptimeSeconds: number;
}

export async function fetchLocalStatus(): Promise<LocalStatus | null> {
  try {
    const res = await authFetch('/api/local/status');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLocalBootstrap(): Promise<LocalBootstrapPayload | null> {
  try {
    const res = await authFetch('/api/local/bootstrap');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchLocalPollDigest(): Promise<LocalPollDigest | null> {
  try {
    const res = await authFetch('/api/local/poll-digest');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSystemHealth(): Promise<SystemHealthMetrics | null> {
  try {
    const res = await authFetch('/api/local/system-health');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function setLocalRootFolder(rootFolder: string): Promise<boolean> {
  try {
    const res = await authFetch('/api/local/config/root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootFolder })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchLocalTable<T>(table: string, params?: { page?: number; limit?: number; search?: string; department?: string; status?: string }): Promise<T[]> {
  try {
    const queryParts: string[] = [];
    if (params) {
      if (params.page !== undefined) queryParts.push(`page=${params.page}`);
      if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);
      if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
      if (params.department && params.department !== 'All') queryParts.push(`department=${encodeURIComponent(params.department)}`);
      if (params.status && params.status !== 'All') queryParts.push(`status=${encodeURIComponent(params.status)}`);
    }
    const queryStr = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const res = await authFetch(`/api/local/data/${table}${queryStr}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);
  } catch {
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
  conflict?: boolean;
  conflictData?: any;
  holidayValidation?: {
    rejectedCount: number;
    conflicts: any[];
  };
}

export async function saveLocalTable<T>(table: string, data: T | T[]): Promise<boolean> {
  const res = await saveLocalTableDetailed(table, data);
  return res.success;
}

export async function saveLocalTableDetailed<T>(
  table: string, 
  data: T | T[], 
  options?: { expectedVersion?: number; expectedUpdatedAt?: string; operationId?: string }
): Promise<LocalSaveResult> {
  const items = Array.isArray(data) ? data : [data];
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.operationId) headers['X-Operation-Id'] = options.operationId;
    if (options?.expectedVersion !== undefined) headers['X-Expected-Version'] = String(options.expectedVersion);
    if (options?.expectedUpdatedAt) headers['X-Expected-Updated-At'] = options.expectedUpdatedAt;

    const res = await authFetch(`/api/local/data/${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    const result = await res.json();

    if (res.status === 409 || result?.conflict) {
      return {
        success: false,
        verified: false,
        verificationStatus: 'FAILED',
        transaction: 'ROLLED_BACK',
        dbPath: result.dbPath || 'Database.db',
        affectedCount: 0,
        table,
        timestamp: new Date().toISOString(),
        conflict: true,
        conflictData: result,
        error: result.error || 'Conflict detected: record has been updated by another user.'
      };
    }

    if (!res.ok) {
      return {
        success: false,
        verified: false,
        verificationStatus: 'FAILED',
        transaction: 'ROLLED_BACK',
        dbPath: 'Database.db',
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
      dbPath: result.dbPath || 'Database.db',
      affectedCount: result.affectedCount ?? items.length,
      table: table,
      timestamp: result.timestamp || new Date().toISOString(),
      ...(result.holidayValidation ? { holidayValidation: result.holidayValidation } : {})
    };
  } catch (e: any) {
    return {
      success: false,
      verified: false,
      verificationStatus: 'FAILED',
      transaction: 'ROLLED_BACK',
      dbPath: 'Database.db',
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
    const res = await authFetch(`/api/local/data/${table}/delete`, {
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
        dbPath: 'Database.db',
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
      dbPath: result.dbPath || 'Database.db',
      affectedCount: result.deletedCount || ids.length,
      timestamp: result.timestamp || new Date().toISOString()
    };
  } catch (e: any) {
    return {
      success: false,
      verified: false,
      verificationStatus: 'FAILED',
      transaction: 'ROLLED_BACK',
      dbPath: 'Database.db',
      affectedCount: 0,
      timestamp: new Date().toISOString(),
      error: e?.message || 'Network / Server Error'
    };
  }
}

export async function verifyLocalDatabase() {
  try {
    const res = await authFetch('/api/local/verify-db');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function verifyBackupFile(fileName: string) {
  try {
    const res = await authFetch('/api/backups/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function testRestoreBackup(fileName: string) {
  try {
    const res = await authFetch('/api/backups/test-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function setZkCollectorModeApi(allowDirectWrite: boolean) {
  try {
    const res = await authFetch('/api/zk/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowDirectWrite })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function purgeLocalTable(table: string): Promise<boolean> {
  try {
    const res = await authFetch(`/api/local/data/${table}/purge`, {
      method: 'POST'
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadLocalDocument(params: {
  employeeId: string;
  documentType: string;
  title: string;
  fileName: string;
  fileBase64: string;
  notes?: string;
  uploadedBy?: string;
}) {
  const res = await authFetch('/api/local/documents/upload', {
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
    const res = await authFetch(`/api/local/documents/employee/${employeeId}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function deleteLocalDocument(id: string) {
  const res = await authFetch(`/api/local/documents/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  return await res.json();
}

export async function triggerLocalBackup() {
  const res = await authFetch('/api/local/backup', { method: 'POST' });
  if (!res.ok) throw new Error('Backup failed');
  return await res.json();
}

export async function fetchHolidayValidationReport() {
  const res = await authFetch('/api/validation/holidays/report');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to generate holiday validation report' }));
    throw new Error(err.error || 'Failed to generate holiday validation report');
  }
  return await res.json();
}

export async function reconcileHolidaysAndOverlaps() {
  const res = await authFetch('/api/validation/holidays/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Holiday reconciliation failed' }));
    throw new Error(err.error || 'Holiday reconciliation failed');
  }
  return await res.json();
}
