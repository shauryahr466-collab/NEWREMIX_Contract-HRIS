import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Logs administrative overrides on employee records to the audit_logs collection.
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
    const auditLogsRef = collection(db, 'auditLogs');
    
    await addDoc(auditLogsRef, {
      adminEmail,
      oldValues,
      newValues,
      timestamp: serverTimestamp()
    });
    
    console.log(`Audit log documented for override by ${adminEmail}`);
  } catch (error) {
    // Explicitly catching and logging to prevent breaking the main application logic
    console.error('CRITICAL: Firestore Audit Logging Failure:', error);
  }
}
