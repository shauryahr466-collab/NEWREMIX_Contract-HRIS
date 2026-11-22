import { saveLocalTable } from './localClient';
import type { AuditLog } from '../types';

/**
 * Normalizes any raw audit_logs row (including nested ActionStatusContext payloads,
 * SQLite column rows, or legacy entries) into a strict, crash-proof AuditLog object.
 */
export function normalizeAuditLog(raw: any): AuditLog {
  let payload: Record<string, any> = {};
  if (raw && typeof raw.data === 'string' && raw.data.trim().startsWith('{')) {
    try {
      payload = JSON.parse(raw.data);
    } catch {
      payload = {};
    }
  } else if (raw && typeof raw.data === 'object' && raw.data !== null) {
    payload = raw.data;
  }

  const merged = { ...payload, ...(raw || {}) };

  const employeeId = String(
    merged.employeeId || merged.employee_id || payload.recordId || 'SYSTEM'
  ).trim() || 'SYSTEM';

  const employeeName = String(
    merged.employeeName ||
    merged.employee_name ||
    payload.recordName ||
    (employeeId === 'ALL' ? 'All Employees' : employeeId === 'SYSTEM' ? 'System Operation' : employeeId)
  ).trim();

  const changedFieldsList = Array.isArray(payload.changedFields) && payload.changedFields.length > 0
    ? payload.changedFields.map((c: any) => c?.label || c?.field || '').filter(Boolean).join(', ')
    : '';

  const field = String(
    merged.field ||
    (payload.module ? `${payload.module}${payload.action ? ` (${payload.action})` : ''}` : '') ||
    merged.action ||
    'System Event'
  ).trim();

  const oldValue =
    merged.oldValue !== undefined && merged.oldValue !== null
      ? String(merged.oldValue)
      : (merged.old_value !== undefined && merged.old_value !== null ? String(merged.old_value) : '');

  const newValue =
    merged.newValue !== undefined && merged.newValue !== null
      ? String(merged.newValue)
      : (merged.new_value !== undefined && merged.new_value !== null
          ? String(merged.new_value)
          : (payload.status ? `${payload.status}${payload.affectedCount !== undefined ? ` (${payload.affectedCount} records)` : ''}` : 'Recorded'));

  const changedBy = String(
    merged.changedBy || merged.changed_by || merged.user || payload.user || 'System Admin'
  ).trim();

  const rawTs =
    merged.timestamp ||
    merged.changedAt ||
    merged.changed_at ||
    merged.created_at ||
    payload.timestamp ||
    (merged.date ? `${String(merged.date).slice(0, 10)}T00:00:00.000Z` : '');

  const parsedTs = safeParseAuditDate(rawTs);
  const timestamp = parsedTs ? parsedTs.toISOString() : new Date(0).toISOString();

  const remarks = String(
    merged.remarks ||
    merged.reason ||
    (changedFieldsList ? `Changed: ${changedFieldsList}` : '') ||
    (payload.operationId ? `Operation ${payload.operationId}` : '') ||
    ''
  ).trim();

  return {
    id: String(merged.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    employeeId,
    employeeName,
    date: merged.date ? String(merged.date).slice(0, 10) : timestamp.slice(0, 10),
    field,
    oldValue,
    newValue,
    changedBy,
    timestamp,
    changedAt: merged.changedAt || timestamp,
    remarks,
    action: merged.action ? String(merged.action) : undefined,
    reason: merged.reason ? String(merged.reason) : undefined,
    user: changedBy,
  };
}

export function safeParseAuditDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  if (!str) return null;
  const isoCandidate = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  const ms = Date.parse(isoCandidate);
  if (!isNaN(ms)) return new Date(ms);
  const fallbackMs = Date.parse(str);
  return isNaN(fallbackMs) ? null : new Date(fallbackMs);
}

/**
 * Logs administrative overrides on employee records to the SQLite audit_logs table.
 * Designed to be called before or after record updates to maintain a history of changes.
 */
export async function logAdminOverride(
  adminEmail: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>
): Promise<void> {
  try {
    const id = `audit_override_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    await saveLocalTable('audit_logs', {
      id,
      employeeId: String(newValues?.id || oldValues?.id || 'ADMIN'),
      employeeName: String(newValues?.name || oldValues?.name || 'Admin Override'),
      date: now.split('T')[0],
      field: 'Admin Override',
      oldValue: JSON.stringify(oldValues || {}),
      newValue: JSON.stringify(newValues || {}),
      changedBy: adminEmail || 'Admin',
      timestamp: now,
      remarks: 'Administrative record override'
    });
  } catch (error) {
    console.error('SQLite Audit Logging error:', error);
  }
}
