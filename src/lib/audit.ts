import { saveLocalTable } from './localClient';

/**
 * Logs administrative overrides on employee records to the SQLite audit_logs table.
 * Designed to be called before or after record updates to maintain a history of changes.
 * 
 * @param adminEmail The email address of the administrator performing the override
 * @param oldValues The state of the record before the modification
 * @param newValues The updated state of the record
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
      changedBy: adminEmail,
      timestamp: now,
      remarks: 'Administrative record override'
    });
  } catch (error) {
    console.error('SQLite Audit Logging error:', error);
  }
}
