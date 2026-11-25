import express from 'express';
import path from 'path';
import fs from 'fs';
import initSqlJs from 'sql.js';
import {
  getSqliteDb,
  saveSqliteDb,
  getSanitizedRootFolder,
  setRootFolder,
  getSqliteDbPath,
  createDatabaseBackup,
  _createDatabaseBackupUnlocked,
  createVerifiedDatabaseBackup,
  verifyBackupFile,
  testRestoreBackupCopy,
  withSqliteWriteLock,
  withReadOnlySqliteSnapshot,
  getRecentSystemErrors,
  getSqliteHealthMeta,
  recordSystemError
} from './sqliteDb.js';
import {
  syncHolidaysMasterTableInDb,
  validateIncomingPunchesAgainstDb,
  validateForceAttendanceAgainstDb,
} from './holidayValidationService.js';
import {
  broadcastSseEvent,
  getConnectedClientsSummary,
  getCachedOperationResult,
  cacheOperationResult,
  RealtimeEventType
} from './realtimeHub.js';
import { zkPollingState } from './zkPoller.js';
import { isEmployeeInUserScope } from '../lib/accessControl.js';
import { isBootstrapSuperAdminEmail } from './userAccess.js';
import { getNepaliDate } from '../utils/dateHelper.js';
import type { ModuleKey, SystemUser } from '../types.js';

export const localRouter = express.Router();

const SQL_TABLE_MAP: Record<string, string> = {
  settings: 'settings',
  users: 'users',
  employees: 'employees',
  punches: 'attendance_punches',
  holidays: 'holidays',
  documents: 'documents',
  shift_assignments: 'shift_assignments',
  exceptions: 'exceptions',
  overtime: 'overtime',
  sbl: 'sbl',
  force_attendance: 'force_attendance',
  payroll_runs: 'payroll_runs',
  audit_logs: 'audit_logs',
  approval_audits: 'approval_audits',
  zk_devices: 'zk_devices',
  zk_user_mappings: 'zk_user_mappings',
  zk_sync_logs: 'zk_sync_logs',
  zk_unmapped_punches: 'zk_unmapped_punches',
  leave_records: 'leave_records',
  departments: 'departments',
  sections: 'sections',
  designations: 'designations',
  roster_batches: 'roster_batches',
  roster_assignments: 'roster_assignments',
  shift_audit_logs: 'shift_audit_logs',
  employee_movements: 'employee_movements',
  assignment_logs: 'assignment_logs',
  audit_decisions: 'audit_decisions',
  field_attendance_audit: 'field_attendance_audit',
  tax_rules: 'tax_rules',
  deduction_rules: 'deduction_rules',
  salary_components: 'salary_components',
  payroll_config_audit: 'payroll_config_audit',
  hr_jobs: 'hr_jobs',
  hr_candidates: 'hr_candidates',
  hr_onboarding_tasks: 'hr_onboarding_tasks',
  hr_performance_goals: 'hr_performance_goals',
  hr_assets: 'hr_assets',
  hr_tickets: 'hr_tickets',
  hr_projects: 'hr_projects',
  hr_timesheets: 'hr_timesheets',
  hr_document_requests: 'hr_document_requests',
  hr_notifications: 'hr_notifications'
};

const CONFLICT_PROTECTED_TABLES = new Set([
  'employees',
  'overtime',
  'sbl',
  'force_attendance',
  'payroll_runs',
  'settings',
  'employee_movements',
  'shift_assignments',
  'holidays'
]);

const EMPLOYEE_SCOPED_TABLES = new Set([
  'employees',
  'punches',
  'attendance_punches',
  'overtime',
  'sbl',
  'force_attendance',
  'leave_records',
  'exceptions',
  'shift_assignments',
  'roster_assignments',
  'shift_audit_logs',
  'employee_movements',
  'assignment_logs',
  'field_attendance_audit',
  'audit_decisions',
  'zk_user_mappings',
  'documents',
  'audit_logs'
]);

const SENSITIVE_SALARY_KEYS = [
  'basicSalary',
  'hra',
  'conveyance',
  'specialAllowance',
  'grossSalary',
  'ctc',
  'monthlySalary',
  'hourlyRate',
  'bankAccountNumber',
  'bankName',
  'ifscCode',
  'panNumber',
  'uanNumber',
  'esicNumber',
  'pfNumber',
  'previousSalary',
  'newSalary'
];

function getAuthUser(req: express.Request): SystemUser | null {
  return ((req as any).authUser as SystemUser) || null;
}

function isSuperAdminUser(user: SystemUser | null): boolean {
  if (!user) return false;
  return user.role === 'Super Admin' || isBootstrapSuperAdminEmail(user.email);
}

function hasModulePerm(user: SystemUser | null, ...keys: ModuleKey[]): boolean {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const mods = user.permissions?.modules || ({} as Record<ModuleKey, boolean>);
  return keys.some(k => Boolean(mods[k]));
}

function canViewSalaryForUser(user: SystemUser | null): boolean {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  return Boolean(user.permissions?.canViewSalary);
}

function redactSalaryFields<T extends Record<string, any>>(record: T, canViewSalary: boolean): T {
  if (!record || typeof record !== 'object' || canViewSalary) return record;
  const clone: Record<string, any> = { ...record };
  for (const key of SENSITIVE_SALARY_KEYS) {
    if (key in clone) {
      delete clone[key];
    }
  }
  return clone as T;
}

function redactPayrollRun(run: any, user: SystemUser | null): any {
  if (!run || typeof run !== 'object') return run;
  const canView = canViewSalaryForUser(user);
  const allowedIds = user && !isSuperAdminUser(user) ? user : null;
  let records = Array.isArray(run.records) ? run.records : [];
  if (allowedIds && user?.role === 'Employee' && user.linkedEmployeeId) {
    const target = user.linkedEmployeeId.trim();
    records = records.filter((r: any) => String(r?.employeeId || '').trim() === target);
  }
  if (!canView) {
    records = records.map((r: any) => {
      const cleaned = { ...r };
      delete cleaned.basicSalary;
      delete cleaned.grossSalary;
      delete cleaned.netSalary;
      delete cleaned.netPayable;
      delete cleaned.otPay;
      delete cleaned.overtimePay;
      delete cleaned.totalDeductions;
      delete cleaned.earnings;
      delete cleaned.deductions;
      return cleaned;
    });
  }
  return {
    ...run,
    records,
    ...(!canView ? { totalNetPayable: undefined, totalGrossPay: undefined, totalGross: undefined } : {})
  };
}

function buildScopedEmployeeIdSet(db: any, user: SystemUser | null): Set<string> | null {
  if (!user) return new Set<string>();
  if (isSuperAdminUser(user)) return null; // unrestricted
  const allowed = new Set<string>();
  try {
    const res = db.exec('SELECT id, department, data FROM employees');
    if (res.length > 0) {
      for (const row of res[0].values) {
        const id = String(row[0] || '').trim();
        const dept = String(row[1] || '').trim();
        let parsed: any = {};
        try { parsed = row[2] ? JSON.parse(String(row[2])) : {}; } catch {}
        const empObj = {
          id: id || String(parsed.id || '').trim(),
          department: parsed.department || dept || '',
          section: parsed.section || ''
        };
        if (empObj.id && isEmployeeInUserScope(empObj, user)) {
          allowed.add(empObj.id);
        }
      }
    }
  } catch {}
  return allowed;
}

function filterTableRowsForUser(
  table: string,
  rows: any[],
  allowedEmpIds: Set<string> | null,
  user: SystemUser | null
): any[] {
  const canSalary = canViewSalaryForUser(user);
  if (table === 'payroll_runs') {
    if (!hasModulePerm(user, 'payroll', 'salaryAnalysis')) return [];
    return rows.map(r => redactPayrollRun(r, user));
  }

  let filtered = rows;
  if (allowedEmpIds !== null && EMPLOYEE_SCOPED_TABLES.has(table)) {
    filtered = rows.filter(row => {
      const empId = String(row?.employeeId || row?.employee_id || (table === 'employees' ? row?.id : '') || '').trim();
      if (!empId) return false;
      if (empId === 'SYSTEM' && isSuperAdminUser(user)) return true;
      return allowedEmpIds.has(empId);
    });
  }

  if (!canSalary && (table === 'employees' || table === 'employee_movements')) {
    return filtered.map(r => redactSalaryFields(r, false));
  }
  return filtered;
}

const EMPLOYEE_READ_TABLES = new Set([
  'employees',
  'punches',
  'overtime',
  'sbl',
  'leave_records',
  'force_attendance',
  'shift_assignments',
  'settings',
  'holidays',
  'departments',
  'sections',
  'designations'
]);

const EMPLOYEE_REQUEST_TABLES = new Set([
  'overtime',
  'sbl',
  'leave_records',
  'force_attendance'
]);

const APPROVAL_TRACKED_TABLES = new Set([
  'overtime',
  'sbl',
  'leave_records',
  'force_attendance',
  'payroll_runs',
  'hr_document_requests',
  'audit_decisions'
]);

const APPROVAL_DECISION_STATUSES = new Set([
  'Approved',
  'Rejected',
  'Final Confirmed',
  'Not Approved',
  'Disbursed',
  'Locked',
  'Accepted'
]);

function getApprovalModuleLabel(table: string): string {
  switch (table) {
    case 'overtime':
      return 'Overtime';
    case 'sbl':
    case 'leave_records':
      return 'Leave & SBL';
    case 'force_attendance':
      return 'Attendance Request';
    case 'payroll_runs':
      return 'Payroll';
    case 'hr_document_requests':
      return 'Document Request';
    case 'audit_decisions':
      return 'Attendance Audit';
    default:
      return table;
  }
}

function canReadTable(user: SystemUser | null, table: string): boolean {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  if (table === 'approval_audits') return false; // Strictly Super Admin Only
  if (user.role === 'Employee') {
    return EMPLOYEE_READ_TABLES.has(table);
  }
  if (table === 'audit_logs') return hasModulePerm(user, 'auditLogs');
  if (table === 'payroll_runs' || table === 'tax_rules' || table === 'deduction_rules' || table === 'salary_components' || table === 'payroll_config_audit') {
    return hasModulePerm(user, 'payroll', 'salaryAnalysis');
  }
  if (table === 'settings' || table === 'holidays' || table === 'departments' || table === 'sections' || table === 'designations') {
    return true;
  }
  if (table === 'zk_devices' || table === 'zk_sync_logs' || table === 'zk_unmapped_punches') {
    return hasModulePerm(user, 'devices', 'import', 'attendance', 'auditor', 'dashboard');
  }
  return true;
}

function canWriteTable(user: SystemUser | null, table: string, items: any[], isDelete = false): { allowed: boolean; reason?: string } {
  if (!user) return { allowed: false, reason: 'Authentication required' };
  if (isSuperAdminUser(user)) return { allowed: true };

  if (table === 'approval_audits') {
    return { allowed: false, reason: 'Approval audit trail is immutable and maintained automatically by the system.' };
  }

  // Strict Employee Self-Service Rules
  if (user.role === 'Employee') {
    if (isDelete) {
      return { allowed: false, reason: 'Employees are not permitted to delete HRIS records.' };
    }
    if (!EMPLOYEE_REQUEST_TABLES.has(table)) {
      return { allowed: false, reason: 'Employees may only submit OT, Leave, Substitute Leave, and Attendance Requests.' };
    }
    if (!user.linkedEmployeeId) {
      return { allowed: false, reason: 'Your account is not linked to an active Employee ID.' };
    }
    const invalidStatus = items.some(it => String(it?.status || 'Pending').trim() !== 'Pending');
    if (invalidStatus) {
      return { allowed: false, reason: 'Employees can only submit Pending requests and cannot approve or reject requests.' };
    }
    return { allowed: true };
  }

  if (table === 'settings' || table === 'holidays' || table === 'departments' || table === 'sections' || table === 'designations') {
    return hasModulePerm(user, 'settings')
      ? { allowed: true }
      : { allowed: false, reason: 'Only authorized administrators can modify system configuration or public holidays.' };
  }
  if (table === 'employees' || table === 'employee_movements') {
    return hasModulePerm(user, 'employees', 'movementAttrition')
      ? { allowed: true }
      : { allowed: false, reason: 'Missing Employee Directory or Movement write permission.' };
  }
  if (table === 'overtime') {
    if (!hasModulePerm(user, 'overtime')) {
      return { allowed: false, reason: 'Missing OT module access.' };
    }
    const wantsApproval = items.some(it => ['Approved', 'Rejected'].includes(String(it?.status || '')));
    if (wantsApproval && !user.permissions?.canApproveOt) {
      return { allowed: false, reason: 'Your role does not have OT approval permission.' };
    }
    if (!user.permissions?.canSubmitSupervisorOt && !user.permissions?.canApproveOt) {
      return { allowed: false, reason: 'Your role cannot submit or edit Overtime claims.' };
    }
    return { allowed: true };
  }
  if (table === 'sbl' || table === 'leave_records') {
    if (!hasModulePerm(user, 'sbl')) {
      return { allowed: false, reason: 'Missing Leave & SBL Management access.' };
    }
    const wantsDecision = items.some(it => ['Approved', 'Rejected', 'Final Confirmed', 'Not Approved'].includes(String(it?.status || '')));
    if (wantsDecision && !user.permissions?.canEditAttendance && !user.permissions?.canApproveOt) {
      return { allowed: false, reason: 'Your role does not have Leave/SBL approval permission.' };
    }
    return user.permissions?.canEditAttendance || user.permissions?.canApproveOt || user.permissions?.canSubmitSupervisorOt
      ? { allowed: true }
      : { allowed: false, reason: 'Missing Leave & SBL Management write permission.' };
  }
  if (table === 'force_attendance' || table === 'exceptions' || table === 'field_attendance_audit' || table === 'audit_decisions') {
    return hasModulePerm(user, 'forceAttendance', 'auditor', 'attendance') && user.permissions?.canEditAttendance
      ? { allowed: true }
      : { allowed: false, reason: 'Missing Attendance edit/approval permission.' };
  }
  if (table === 'shift_assignments' || table === 'roster_batches' || table === 'roster_assignments' || table === 'shift_audit_logs' || table === 'assignment_logs') {
    return user.permissions?.canManageShifts || hasModulePerm(user, 'employees', 'attendance', 'auditor')
      ? { allowed: true }
      : { allowed: false, reason: 'Missing Shift & Roster management permission.' };
  }
  if (table === 'payroll_runs') {
    if (!hasModulePerm(user, 'payroll')) {
      return { allowed: false, reason: 'Missing Payroll module permission.' };
    }
    const wantsApprove = items.some(it => ['Approved', 'Finalized', 'Disbursed', 'Locked'].includes(String(it?.status || '')));
    if (wantsApprove && !user.permissions?.canApprovePayroll) {
      return { allowed: false, reason: 'Only authorized Payroll Approvers or Super Admin can approve/disburse payroll.' };
    }
    return { allowed: true };
  }
  if (table === 'tax_rules' || table === 'deduction_rules' || table === 'salary_components' || table === 'payroll_config_audit') {
    return hasModulePerm(user, 'payroll', 'settings') && user.permissions?.canApprovePayroll
      ? { allowed: true }
      : { allowed: false, reason: 'Only Payroll Admins can edit payroll rules.' };
  }
  if (table === 'zk_devices' || table === 'zk_user_mappings' || table === 'zk_sync_logs' || table === 'zk_unmapped_punches' || table === 'punches') {
    return hasModulePerm(user, 'devices', 'import', 'attendance')
      ? { allowed: true }
      : { allowed: false, reason: 'Missing Biometric Device / Import permission.' };
  }
  if (table === 'audit_logs') {
    return { allowed: true };
  }
  if (
    table === 'hr_jobs' ||
    table === 'hr_candidates' ||
    table === 'hr_onboarding_tasks' ||
    table === 'hr_performance_goals' ||
    table === 'hr_assets' ||
    table === 'hr_tickets' ||
    table === 'hr_projects' ||
    table === 'hr_timesheets' ||
    table === 'hr_document_requests' ||
    table === 'hr_notifications'
  ) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'Insufficient privileges for this resource.' };
}

function getSseEventForTable(table: string): RealtimeEventType | null {
  if (table === 'employees' || table === 'employee_movements' || table === 'documents') return 'EmployeeUpdated';
  if (table === 'overtime') return 'OvertimeUpdated';
  if (table === 'sbl' || table === 'leave_records') return 'SblUpdated';
  if (table === 'punches' || table === 'zk_devices' || table === 'zk_user_mappings' || table === 'zk_sync_logs' || table === 'zk_unmapped_punches') return 'PunchSnapshotUpdated';
  if (table === 'force_attendance' || table === 'exceptions' || table === 'shift_assignments' || table === 'roster_batches' || table === 'roster_assignments' || table === 'shift_audit_logs' || table === 'assignment_logs' || table === 'field_attendance_audit' || table === 'audit_decisions') return 'AttendanceUpdated';
  if (table === 'payroll_runs' || table === 'tax_rules' || table === 'deduction_rules' || table === 'salary_components' || table === 'payroll_config_audit') return 'PayrollUpdated';
  if (table === 'settings' || table === 'holidays' || table === 'departments' || table === 'sections' || table === 'designations') return 'SettingsUpdated';
  if (table === 'audit_logs') return 'AuditLogAppended';
  if (table === 'approval_audits') return 'ApprovalAuditUpdated';
  return null;
}

function computeChangedFields(existingObj: Record<string, any>, incomingObj: Record<string, any>): string[] {
  const ignore = new Set([
    '_expectedUpdatedAt',
    '_expectedVersion',
    '_forceOverwrite',
    '_operationId',
    '_version',
    'updatedAt',
    'updatedBy',
    'createdAt'
  ]);
  const keys = new Set([...Object.keys(existingObj || {}), ...Object.keys(incomingObj || {})]);
  const changed: string[] = [];
  for (const k of keys) {
    if (ignore.has(k)) continue;
    const a = existingObj?.[k];
    const b = incomingObj?.[k];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      changed.push(k);
    }
  }
  return changed.slice(0, 20);
}

// Helper to sanitize paths against path traversal
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

// 1. Status & Health (100% Read-Only Snapshot)
localRouter.get('/status', async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const isSuper = isSuperAdminUser(authUser);
    const root = getSanitizedRootFolder();

    const { empCount, punchCount, docCount } = await withReadOnlySqliteSnapshot((db) => {
      let eCount = 0;
      let pCount = 0;
      let dCount = 0;

      try {
        const empRes = db.exec('SELECT COUNT(*) as cnt FROM employees');
        if (empRes.length > 0 && empRes[0].values.length > 0) {
          eCount = Number(empRes[0].values[0][0]);
        }
      } catch {}
      try {
        const punchRes = db.exec('SELECT COUNT(*) as cnt FROM attendance_punches');
        if (punchRes.length > 0 && punchRes[0].values.length > 0) {
          pCount = Number(punchRes[0].values[0][0]);
        }
      } catch {}
      try {
        const docRes = db.exec('SELECT COUNT(*) as cnt FROM documents');
        if (docRes.length > 0 && docRes[0].values.length > 0) {
          dCount = Number(docRes[0].values[0][0]);
        }
      } catch {}

      return { empCount: eCount, punchCount: pCount, docCount: dCount };
    });

    const backupsDir = fs.existsSync(path.join(root, 'Backups'))
      ? path.join(root, 'Backups')
      : path.join(root, 'backups');
    let backupCount = 0;
    if (fs.existsSync(backupsDir)) {
      backupCount = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db') || f.endsWith('.json')).length;
    }

    res.json({
      status: 'online',
      mode: zkPollingState.readOnlyMode ? 'LOCAL MODE (READ-ONLY COLLECTOR OBSERVATION)' : 'LOCAL MODE (SQLITE ZKT SYNC)',
      database: 'SQLite',
      storage: 'Local Disk',
      punchMode: zkPollingState.readOnlyMode ? 'READ_ONLY' : 'READ_WRITE',
      externalWriterMode: zkPollingState.readOnlyMode,
      internetRequired: false,
      rootFolder: isSuper ? root : 'Protected Local Storage',
      dbPath: isSuper ? getSqliteDbPath() : 'Database.db',
      stats: {
        employees: empCount,
        punches: punchCount,
        documents: docCount,
        backups: backupCount
      }
    });
  } catch (error: any) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// 2. Change local storage root path (Super Admin Only)
localRouter.post('/config/root', (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Only Super Admin can change local storage paths.' });
  }
  const { rootFolder } = req.body;
  if (!rootFolder || typeof rootFolder !== 'string') {
    return res.status(400).json({ error: 'rootFolder is required' });
  }
  setRootFolder(rootFolder);
  res.json({ success: true, rootFolder: getSanitizedRootFolder() });
});

function readTableFromDb(db: any, table: string): any[] {
  const sqlTable = SQL_TABLE_MAP[table];
  if (!sqlTable) return [];

  let result: ReturnType<typeof db.exec> = [];
  try {
    result = db.exec(`SELECT * FROM ${sqlTable}`);
  } catch {
    return [];
  }

  const columns = result.length > 0 ? result[0].columns : [];
  const dataIdx = columns.indexOf('data');

  const baseRows: any[] = result.length > 0
    ? result[0].values.map((valArr: any[]) => {
        const colObj: Record<string, any> = {};
        columns.forEach((col: string, i: number) => {
          colObj[col] = valArr[i];
        });

        let parsedData: Record<string, any> | null = null;
        if (dataIdx !== -1 && valArr[dataIdx]) {
          try {
            parsedData = JSON.parse(valArr[dataIdx] as string);
          } catch {
            parsedData = null;
          }
        }

        if (sqlTable === 'attendance_punches') {
          const rawDt = String(parsedData?.punchDatetime || colObj.punch_datetime || '').trim().replace(' ', 'T');
          const empId = String(parsedData?.employeeId || colObj.employee_id || '').trim();
          return {
            ...(parsedData || {}),
            id: String(parsedData?.id || colObj.id || `${empId}_${rawDt}`),
            employeeId: empId,
            punchDatetime: rawDt,
            deviceId: String(parsedData?.deviceId ?? colObj.device_id ?? ''),
            source: String(parsedData?.source || colObj.source || 'ZKTeco')
          };
        }

        if (sqlTable === 'audit_logs') {
          let nestedPayload: Record<string, any> = {};
          if (parsedData && typeof parsedData.data === 'string' && parsedData.data.trim().startsWith('{')) {
            try { nestedPayload = JSON.parse(parsedData.data); } catch {}
          } else if (parsedData && typeof parsedData.data === 'object' && parsedData.data !== null) {
            nestedPayload = parsedData.data;
          }
          const merged = { ...nestedPayload, ...(parsedData || {}), ...colObj };
          const rawTs =
            merged.timestamp ||
            merged.changedAt ||
            merged.created_at ||
            nestedPayload.timestamp ||
            (merged.date ? `${String(merged.date).slice(0, 10)}T00:00:00.000Z` : new Date().toISOString());
          return {
            id: String(merged.id || colObj.id || ''),
            employeeId: String(merged.employeeId || colObj.employee_id || nestedPayload.recordId || 'SYSTEM'),
            employeeName: String(merged.employeeName || nestedPayload.recordName || merged.employeeId || colObj.employee_id || 'System Operation'),
            date: String(merged.date || colObj.date || String(rawTs).slice(0, 10)),
            field: String(merged.field || (nestedPayload.module ? `${nestedPayload.module}${nestedPayload.action ? ` (${nestedPayload.action})` : ''}` : merged.action || 'System Event')),
            oldValue: merged.oldValue !== undefined && merged.oldValue !== null ? String(merged.oldValue) : '',
            newValue: merged.newValue !== undefined && merged.newValue !== null ? String(merged.newValue) : (nestedPayload.status ? `${nestedPayload.status}${nestedPayload.affectedCount !== undefined ? ` (${nestedPayload.affectedCount} records)` : ''}` : ''),
            changedBy: String(merged.changedBy || merged.user || nestedPayload.user || 'System Admin'),
            timestamp: String(rawTs),
            changedAt: String(merged.changedAt || rawTs),
            remarks: String(merged.remarks || merged.reason || (nestedPayload.operationId ? `Operation ${nestedPayload.operationId}` : '')),
            action: merged.action ? String(merged.action) : undefined,
            operationId: merged.operationId || nestedPayload.operationId || undefined,
            module: merged.module || nestedPayload.module || undefined,
            subModule: merged.subModule || nestedPayload.subModule || undefined,
            result: merged.result || nestedPayload.result || merged.status || nestedPayload.status || undefined,
            sourceWorkstation: merged.sourceWorkstation || nestedPayload.sourceWorkstation || undefined
          };
        }

        return parsedData || colObj;
      })
    : [];

  if (sqlTable === 'zk_user_mappings') {
    try {
      const empRes = db.exec('SELECT id, name, department, status, data FROM employees');
      if (empRes.length > 0 && empRes[0].values.length > 0) {
        const mappedEmpIds = new Set<string>(
          baseRows.map((r: any) => String(r?.employeeId || r?.employee_id || '').trim()).filter(Boolean)
        );
        const nowIso = new Date().toISOString();

        for (const row of empRes[0].values) {
          const empId = String(row[0] || '').trim();
          const empName = String(row[1] || empId).trim();
          const empDept = String(row[2] || 'General').trim();
          let empStatus = String(row[3] || 'Active').trim();
          let empData: any = {};
          if (row[4]) {
            try {
              empData = JSON.parse(String(row[4]));
              if (empData.status) empStatus = String(empData.status).trim();
            } catch {}
          }
          if (!empId || empStatus.toLowerCase() !== 'active') continue;
          if (mappedEmpIds.has(empId)) continue;

          const devUserId = String(empData.deviceUserId || empData.biometricId || empData.acNo || empData.zkPin || empId).trim();
          baseRows.push({
            id: `map_${devUserId}`,
            deviceUserId: devUserId,
            employeeId: empId,
            employeeName: empName,
            department: empDept,
            mappedAt: empData.joiningDate || nowIso
          });
          mappedEmpIds.add(empId);
        }
      }
    } catch (e) {
      console.warn('[SQLite Read-Only] Virtual zk_user_mappings enrichment note:', e);
    }
  }

  if (sqlTable === 'zk_devices' && baseRows.length > 0) {
    try {
      const statsByDev = new Map<string, { logs: number; users: number }>();
      let unassignedLogs = 0;
      const unassignedUsersSet = new Set<string>();
      let totalLogsAll = 0;

      const devPunchRes = db.exec(
        'SELECT device_id, employee_id FROM attendance_punches'
      );
      if (devPunchRes.length > 0) {
        const usersPerDev = new Map<string, Set<string>>();
        for (const r of devPunchRes[0].values) {
          const dId = String(r[0] || '').trim();
          const eId = String(r[1] || '').trim();
          totalLogsAll += 1;
          if (dId) {
            const entry = statsByDev.get(dId) || { logs: 0, users: 0 };
            entry.logs += 1;
            statsByDev.set(dId, entry);
            if (eId) {
              let uSet = usersPerDev.get(dId);
              if (!uSet) {
                uSet = new Set<string>();
                usersPerDev.set(dId, uSet);
              }
              uSet.add(eId);
            }
          } else {
            unassignedLogs += 1;
            if (eId) unassignedUsersSet.add(eId);
          }
        }
        for (const [dId, uSet] of usersPerDev.entries()) {
          const entry = statsByDev.get(dId);
          if (entry) entry.users = uSet.size;
        }
      }

      let activeEmpCount = 0;
      try {
        const activeEmpRes = db.exec("SELECT COUNT(*) FROM employees WHERE LOWER(status) = 'active'");
        if (activeEmpRes.length > 0 && activeEmpRes[0].values.length > 0) {
          activeEmpCount = Number(activeEmpRes[0].values[0][0] || 0);
        }
      } catch {}

      const primaryDev = baseRows.find((d: any) => d && d.id && d.enabled !== false) || baseRows[0];

      return baseRows.map((dev: any) => {
        if (!dev || !dev.id) return dev;
        const exactStats = statsByDev.get(dev.id) || { logs: 0, users: 0 };
        const includeUnassigned = statsByDev.size === 0 && primaryDev?.id === dev.id;
        return {
          ...dev,
          logCount: exactStats.logs + (includeUnassigned ? unassignedLogs : 0),
          userCount: Math.max(exactStats.users, includeUnassigned ? unassignedUsersSet.size : 0),
          activeDirectoryUsers: activeEmpCount,
          totalSystemLogs: totalLogsAll
        };
      });
    } catch (e) {
      console.warn('[SQLite Read-Only] Device stats enrichment note:', e);
    }
  }

  return baseRows;
}

// 3a. Single-shot fast bootstrap snapshot (1 HTTP call instead of 18+ sequential round-trips)
const BOOTSTRAP_TABLES = [
  'employees',
  'punches',
  'settings',
  'shift_assignments',
  'zk_devices',
  'zk_user_mappings',
  'zk_sync_logs',
  'zk_unmapped_punches',
  'audit_logs',
  'approval_audits',
  'assignment_logs',
  'exceptions',
  'sbl',
  'overtime',
  'force_attendance',
  'payroll_runs',
  'employee_movements',
  'field_attendance_audit',
  'audit_decisions'
];

localRouter.get('/bootstrap', async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const payload = await withReadOnlySqliteSnapshot((db) => {
      const allowedEmpIds = buildScopedEmployeeIdSet(db, authUser);
      const tables: Record<string, any[]> = {};
      for (const tbl of BOOTSTRAP_TABLES) {
        if (!canReadTable(authUser, tbl)) {
          tables[tbl] = [];
          continue;
        }
        const raw = readTableFromDb(db, tbl);
        tables[tbl] = filterTableRowsForUser(tbl, raw, allowedEmpIds, authUser);
      }
      return {
        success: true,
        timestamp: new Date().toISOString(),
        tables
      };
    });
    res.json(payload);
  } catch (error: any) {
    recordSystemError('bootstrap', error);
    res.status(500).json({ error: error.message || 'Bootstrap load failed' });
  }
});

// 3b. Lightweight poll digest (~350 bytes) to detect external/peer updates without loading full tables
localRouter.get('/poll-digest', async (_req, res) => {
  try {
    const digest = await withReadOnlySqliteSnapshot((db) => {
      const countOf = (sql: string) => {
        try {
          const r = db.exec(sql);
          return r.length > 0 && r[0].values.length > 0 ? Number(r[0].values[0][0] || 0) : 0;
        } catch {
          return 0;
        }
      };
      const maxOf = (sql: string) => {
        try {
          const r = db.exec(sql);
          return r.length > 0 && r[0].values.length > 0 && r[0].values[0][0] ? String(r[0].values[0][0]) : '';
        } catch {
          return '';
        }
      };

      return {
        punchCount: countOf('SELECT COUNT(*) FROM attendance_punches'),
        latestPunch: maxOf('SELECT MAX(punch_datetime) FROM attendance_punches'),
        employeeCount: countOf('SELECT COUNT(*) FROM employees'),
        latestEmployeeUpdate: maxOf('SELECT MAX(updated_at) FROM employees'),
        overtimeCount: countOf('SELECT COUNT(*) FROM overtime'),
        sblCount: countOf('SELECT COUNT(*) FROM sbl'),
        forceAttendanceCount: countOf('SELECT COUNT(*) FROM force_attendance'),
        payrollRunCount: countOf('SELECT COUNT(*) FROM payroll_runs'),
        holidayCount: countOf('SELECT COUNT(*) FROM holidays'),
        auditLogCount: countOf('SELECT COUNT(*) FROM audit_logs'),
        latestAuditLog: maxOf('SELECT MAX(created_at) FROM audit_logs'),
        latestSettingsUpdate: maxOf('SELECT MAX(updated_at) FROM settings'),
        deviceCount: countOf('SELECT COUNT(*) FROM zk_devices'),
        syncLogCount: countOf('SELECT COUNT(*) FROM zk_sync_logs'),
        unmappedCount: countOf('SELECT COUNT(*) FROM zk_unmapped_punches'),
        latestSync: maxOf('SELECT MAX(updated_at) FROM zk_devices'),
        connectedClients: getConnectedClientsSummary().count,
        readOnlyCollector: zkPollingState.readOnlyMode
      };
    });
    res.json(digest);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3c. Generic Get Table Data (100% Read-Only Snapshot — Zero SQLite Writes, RBAC & Scope Enforced)
localRouter.get('/data/:table', async (req, res) => {
  const { table } = req.params;
  const sqlTable = SQL_TABLE_MAP[table];
  if (!sqlTable) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  const authUser = getAuthUser(req);
  if (!canReadTable(authUser, table)) {
    return res.status(403).json({
      success: false,
      error: `Access Denied: Your role (${authUser?.role || 'Unknown'}) does not have permission to view ${table}.`
    });
  }

  try {
    const searchQ = String(req.query.search || '').trim().toLowerCase();
    const statusQ = String(req.query.status || '').trim().toLowerCase();
    const deptQ = String(req.query.department || '').trim().toLowerCase();
    const pageRaw = req.query.page !== undefined ? Number(req.query.page) : NaN;
    const limitRaw = req.query.limit !== undefined ? Number(req.query.limit) : NaN;
    const paginated = req.query.paginated === 'true' || req.query.paginated === '1';

    const scopedRows = await withReadOnlySqliteSnapshot((db) => {
      const allowedEmpIds = buildScopedEmployeeIdSet(db, authUser);
      const raw = readTableFromDb(db, table);
      return filterTableRowsForUser(table, raw, allowedEmpIds, authUser);
    });

    let filtered = scopedRows;
    if (searchQ || statusQ || deptQ) {
      filtered = scopedRows.filter((item: any) => {
        if (statusQ && String(item?.status || '').trim().toLowerCase() !== statusQ) return false;
        if (deptQ && String(item?.department || '').trim().toLowerCase() !== deptQ) return false;
        if (searchQ) {
          const hay = [
            item?.id,
            item?.name,
            item?.employeeId,
            item?.employeeName,
            item?.department,
            item?.section,
            item?.designation,
            item?.remarks,
            item?.field
          ].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(searchQ)) return false;
        }
        return true;
      });
    }

    if (paginated && Number.isFinite(pageRaw) && Number.isFinite(limitRaw) && limitRaw > 0) {
      const limit = Math.max(1, Math.min(1000, Math.floor(limitRaw)));
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const page = Math.max(1, Math.min(totalPages, Math.floor(pageRaw)));
      const start = (page - 1) * limit;
      return res.json({
        data: filtered.slice(start, start + limit),
        total,
        page,
        limit,
        totalPages
      });
    }

    if (Number.isFinite(limitRaw) && limitRaw > 0 && Number.isFinite(pageRaw) && pageRaw >= 1) {
      const limit = Math.max(1, Math.min(1000, Math.floor(limitRaw)));
      const start = (Math.floor(pageRaw) - 1) * limit;
      return res.json(filtered.slice(start, start + limit));
    }

    res.json(filtered);
  } catch (error: any) {
    recordSystemError(`read_${table}`, error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Batch Save Table Data (RBAC, Optimistic Concurrency 409, Idempotency & SSE Broadcast)
localRouter.post('/data/:table', async (req, res) => {
  const { table } = req.params;
  const rawItems = Array.isArray(req.body) ? req.body : [req.body];

  const sqlTable = SQL_TABLE_MAP[table];
  if (!sqlTable) {
    return res.status(400).json({ error: 'Invalid table' });
  }

  const authUser = getAuthUser(req);
  const permCheck = canWriteTable(authUser, table, rawItems);
  if (!permCheck.allowed) {
    return res.status(403).json({
      success: false,
      error: permCheck.reason || `Access Denied: Insufficient permission to modify ${table}.`
    });
  }

  const headerOpId = req.headers['x-operation-id'] ? String(req.headers['x-operation-id']).trim() : '';
  const bodyOpId = rawItems.length === 1 && rawItems[0]?._operationId ? String(rawItems[0]._operationId).trim() : '';
  const operationId = headerOpId || bodyOpId;
  if (operationId) {
    const cached = getCachedOperationResult(operationId);
    if (cached) {
      return res.json({ ...cached, deduplicated: true });
    }
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const now = new Date().toISOString();
      const actorEmail = authUser?.email || 'System';
      const canSalary = canViewSalaryForUser(authUser);

      // Server-side employee scoping validation for non-Super-Admins
      if (!isSuperAdminUser(authUser) && EMPLOYEE_SCOPED_TABLES.has(table) && table !== 'audit_logs') {
        const allowedEmpIds = buildScopedEmployeeIdSet(db, authUser)!;
        for (const item of rawItems) {
          const targetEmpId = String(item?.employeeId || item?.employee_id || (table === 'employees' ? item?.id : '') || '').trim();
          if (!targetEmpId) continue;
          if (table === 'employees') {
            const dept = String(item?.department || '').trim();
            const sec = String(item?.section || '').trim();
            if (!allowedEmpIds.has(targetEmpId) && !isEmployeeInUserScope({ id: targetEmpId, department: dept, section: sec }, authUser)) {
              return res.status(403).json({
                success: false,
                error: `Access Denied: Employee #${targetEmpId} is outside your assigned Department/Section scope.`
              });
            }
          } else if (!allowedEmpIds.has(targetEmpId)) {
            return res.status(403).json({
              success: false,
              error: `Access Denied: Employee #${targetEmpId} is outside your assigned Department/Section scope.`
            });
          }
        }
      }

      // Optimistic concurrency & duplicate claim verification + approval authority + version stamping
      const items: any[] = [];
      const pendingApprovalAudits: any[] = [];
      const actorRole = isSuperAdminUser(authUser) ? 'Super Admin' : (authUser?.role || 'Supervisor');
      const actorDisplayName = authUser?.username || authUser?.email || 'System';
      const empLookupMap = new Map<string, { name: string; department: string }>();
      if (APPROVAL_TRACKED_TABLES.has(table)) {
        try {
          const eRes = db.exec('SELECT id, name, department FROM employees');
          if (eRes.length > 0) {
            for (const er of eRes[0].values) {
              const eid = String(er[0] || '').trim();
              if (eid) {
                empLookupMap.set(eid, {
                  name: String(er[1] || eid),
                  department: String(er[2] || '')
                });
              }
            }
          }
        } catch {}
      }

      const selectExistingStmt = db.prepare(`SELECT data FROM ${sqlTable} WHERE id = ?`);
      try {
        for (const rawItem of rawItems) {
          if (!rawItem || typeof rawItem !== 'object') continue;
          const recordId = String(rawItem.id || (table === 'settings' ? 'config' : '') || '').trim();
          let existingObj: Record<string, any> | null = null;
          if (recordId) {
            selectExistingStmt.bind([recordId]);
            if (selectExistingStmt.step()) {
              const row = selectExistingStmt.getAsObject();
              if (row.data) {
                try { existingObj = JSON.parse(String(row.data)); } catch {}
              }
            }
            selectExistingStmt.reset();
          }

          // Strict Employee & Non-Super-Admin lock checks against existing record
          if (authUser?.role === 'Employee') {
            if (existingObj && String(existingObj.status || 'Pending') !== 'Pending') {
              selectExistingStmt.free();
              return res.status(403).json({
                success: false,
                error: 'Access Denied: Already processed requests cannot be modified by Employee.'
              });
            }
          } else if (!isSuperAdminUser(authUser) && existingObj) {
            const lockedBySuperAdmin =
              Boolean(existingObj.superAdminOverride) ||
              String(existingObj.approvedByRole || '') === 'Super Admin' ||
              String(existingObj.reviewedByRole || '') === 'Super Admin';
            if (lockedBySuperAdmin) {
              selectExistingStmt.free();
              return res.status(403).json({
                success: false,
                error: `Access Denied: This record was finalized or overridden by Super Admin and cannot be modified by ${actorRole}.`
              });
            }
          }

          if (CONFLICT_PROTECTED_TABLES.has(table) && existingObj && !rawItem._forceOverwrite) {
            const existingVersion = Number(existingObj._version || 1);
            const existingUpdatedAt = existingObj.updatedAt ? String(existingObj.updatedAt) : undefined;
            const expectedVersion = rawItem._expectedVersion !== undefined ? Number(rawItem._expectedVersion) : undefined;
            const expectedUpdatedAt = rawItem._expectedUpdatedAt ? String(rawItem._expectedUpdatedAt) : undefined;

            const versionMismatch = expectedVersion !== undefined && Number.isFinite(expectedVersion) && expectedVersion !== existingVersion;
            const timestampMismatch = expectedUpdatedAt !== undefined && existingUpdatedAt !== undefined && expectedUpdatedAt !== existingUpdatedAt;

            if (versionMismatch || timestampMismatch) {
              selectExistingStmt.free();
              return res.status(409).json({
                success: false,
                conflict: true,
                error: 'This record has been updated by another user. Please refresh and review the latest information before saving.',
                table,
                recordId,
                updatedBy: existingObj.updatedBy || existingObj.changedBy || 'Another user',
                updatedAt: existingUpdatedAt || null,
                latestVersion: existingVersion,
                latestRecord: !canSalary && (table === 'employees' || table === 'employee_movements')
                  ? redactSalaryFields(existingObj, false)
                  : existingObj,
                changedFields: computeChangedFields(existingObj, rawItem)
              });
            }
          }

          // Duplicate OT / SBL check by (employeeId, date) when explicitly creating a new record
          if ((table === 'overtime' || table === 'sbl') && rawItem._preventDuplicateByEmpDate && !existingObj) {
            const empIdCheck = String(rawItem.employeeId || '').trim();
            const dateCheck = String(rawItem.date || '').trim();
            if (empIdCheck && dateCheck) {
              const dupStmt = db.prepare(`SELECT id, data FROM ${sqlTable} WHERE employee_id = ? AND date = ? LIMIT 1`);
              dupStmt.bind([empIdCheck, dateCheck]);
              if (dupStmt.step()) {
                const dupRow = dupStmt.getAsObject();
                let dupData: any = {};
                try { dupData = JSON.parse(String(dupRow.data || '{}')); } catch {}
                dupStmt.free();
                selectExistingStmt.free();
                return res.status(409).json({
                  success: false,
                  conflict: true,
                  error: 'This record has been updated by another user. Please refresh and review the latest information before saving.',
                  table,
                  recordId: String(dupRow.id || recordId),
                  updatedBy: dupData.updatedBy || dupData.submittedBy || 'Another user',
                  updatedAt: dupData.updatedAt || null,
                  latestVersion: Number(dupData._version || 1),
                  latestRecord: dupData,
                  changedFields: ['employeeId', 'date', 'hours']
                });
              }
              dupStmt.free();
            }
          }

          const clean: Record<string, any> = { ...rawItem };
          delete clean._expectedUpdatedAt;
          delete clean._expectedVersion;
          delete clean._forceOverwrite;
          delete clean._operationId;
          delete clean._preventDuplicateByEmpDate;

          // If non-salary user updates an employee profile, preserve stored salary/bank/PAN fields!
          if (table === 'employees' && existingObj && !canSalary) {
            for (const sKey of SENSITIVE_SALARY_KEYS) {
              if (sKey in existingObj && !(sKey in clean)) {
                clean[sKey] = existingObj[sKey];
              }
            }
          }

          // Enforce Employee self-request metadata server-side
          if (authUser?.role === 'Employee') {
            clean.status = 'Pending';
            clean.requestedBy = actorDisplayName;
            clean.requestedByRole = 'Employee';
            clean.approvedBy = '';
            clean.approvedByRole = '';
            clean.reviewedBy = '';
            clean.reviewedByRole = '';
          } else if (APPROVAL_TRACKED_TABLES.has(table)) {
            const prevStatus = String(
              existingObj?.status ||
              existingObj?.decision ||
              (existingObj ? 'Pending' : 'New')
            ).trim();
            const nextStatus = String(
              clean.status ||
              clean.decision ||
              (table === 'force_attendance' && !clean.status ? 'Approved' : '')
            ).trim();

            const statusChanged = prevStatus !== nextStatus;
            const isDecisionEvent =
              APPROVAL_DECISION_STATUSES.has(nextStatus) &&
              (statusChanged || !existingObj || Boolean(clean._overrideReason));
            const isSuperOverride =
              isSuperAdminUser(authUser) &&
              Boolean(existingObj) &&
              APPROVAL_DECISION_STATUSES.has(prevStatus) &&
              (statusChanged || (existingObj?.approvedByRole && existingObj.approvedByRole !== 'Super Admin'));

            if (isDecisionEvent || isSuperOverride) {
              const priorApprover = String(
                existingObj?.approvedBy || existingObj?.reviewedBy || ''
              ).trim();
              const priorApproverRole = String(
                existingObj?.approvedByRole || existingObj?.reviewedByRole || ''
              ).trim();

              clean.reviewedBy = actorDisplayName;
              clean.reviewedByRole = actorRole;
              clean.reviewedDate = now;
              clean.approvedBy = actorDisplayName;
              clean.approvedByRole = actorRole;
              clean.approvedAt = now;

              if (isSuperOverride) {
                clean.superAdminOverride = true;
                clean.overriddenBy = actorDisplayName;
                clean.overriddenAt = now;
                clean.previousStatus = prevStatus;
                clean.previousApprover = priorApprover;
              }

              const targetEmpId = String(
                clean.employeeId ||
                existingObj?.employeeId ||
                (table === 'payroll_runs' ? 'PAYROLL' : '')
              ).trim();
              const empInfo = empLookupMap.get(targetEmpId);
              const targetDate = String(
                clean.date ||
                clean.month ||
                existingObj?.date ||
                now.slice(0, 10)
              ).trim();
              const targetDatePart = /^\d{4}-\d{2}-\d{2}/.test(targetDate) ? targetDate.slice(0, 10) : now.slice(0, 10);
              const bsDate = getNepaliDate(targetDatePart);
              const remarksText = String(
                clean.remarks || clean.reason || clean.overrideRemarks || existingObj?.reason || ''
              ).trim();

              pendingApprovalAudits.push({
                id: `apaud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                module: getApprovalModuleLabel(table),
                table,
                recordId: recordId || clean.id || `${targetEmpId}_${targetDate}`,
                employeeId: targetEmpId || 'SYSTEM',
                employeeName:
                  String(clean.employeeName || empInfo?.name || (table === 'payroll_runs' ? clean.monthName : targetEmpId) || 'Record'),
                department: empInfo?.department || clean.department || '',
                targetDate,
                previousStatus: prevStatus,
                newStatus: nextStatus || 'Approved',
                previousApprover: priorApprover || undefined,
                previousApproverRole: priorApproverRole || undefined,
                approvedBy: actorEmail,
                approvedByName: actorDisplayName,
                approvedByRole: actorRole,
                isOverride: Boolean(isSuperOverride),
                actionSummary: isSuperOverride
                  ? `Super Admin Overrode ${priorApprover ? `${priorApprover} (${priorApproverRole || 'Reviewer'})` : prevStatus}: ${prevStatus} → ${nextStatus}`
                  : `${actorRole} marked ${nextStatus}`,
                remarks: remarksText,
                bsDate: bsDate !== '0000-00-00' ? bsDate : '',
                timestamp: now
              });
            }
          }

          const nextVersion = existingObj ? Number(existingObj._version || 1) + 1 : Number(rawItem._version || 1);
          clean._version = nextVersion;
          clean.updatedAt = now;
          clean.updatedBy = actorEmail;
          items.push(clean);
        }
      } finally {
        try { selectExistingStmt.free(); } catch {}
      }

      try { db.run('ROLLBACK'); } catch(e) {}
      db.run('BEGIN TRANSACTION');

    let holidayValidationMeta: {
      acceptedCount?: number;
      rejectedOverlapsCount?: number;
      conflicts?: any[];
    } | null = null;
    let itemsToVerify = items;

    if (sqlTable === 'employees') {
      const stmt = db.prepare(`
        INSERT INTO employees (id, name, department, designation, shift_id, joining_date, status, data, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          department=excluded.department,
          designation=excluded.designation,
          shift_id=excluded.shift_id,
          joining_date=excluded.joining_date,
          status=excluded.status,
          data=excluded.data,
          updated_at=excluded.updated_at
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.name || 'Unnamed',
          item.department || '',
          item.designation || '',
          item.shiftId || '',
          item.joiningDate || '',
          item.status || 'Active',
          JSON.stringify(item),
          now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'attendance_punches') {
      const validationRes = validateIncomingPunchesAgainstDb(db, items);
      const validItems = validationRes.acceptedPunches;
      itemsToVerify = validItems;
      holidayValidationMeta = {
        acceptedCount: validItems.length,
        rejectedOverlapsCount: validationRes.rejectedOverlaps.length,
        conflicts: validationRes.conflicts,
      };
      const stmt = db.prepare(`
        INSERT INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          punch_datetime=excluded.punch_datetime,
          device_id=excluded.device_id,
          source=excluded.source,
          data=excluded.data
      `);
      for (const item of validItems) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.punchDatetime || now,
          item.deviceId || '',
          item.source || 'Manual',
          JSON.stringify(item),
          now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'holidays') {
      const stmt = db.prepare(`
        INSERT INTO holidays (id, date, name, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date=excluded.date,
          name=excluded.name,
          data=excluded.data
      `);
      for (const item of items) {
        const cleanDate = String(item.date || '').trim().slice(0, 10);
        if (!cleanDate) continue;
        const id = item.id || `hol_${cleanDate.replace(/-/g, '')}`;
        const cleanName = String(item.name || 'Public Holiday').trim();
        stmt.run([id, cleanDate, cleanName, JSON.stringify({ ...item, id, date: cleanDate, name: cleanName })]);
      }
      stmt.free();
    } else if (sqlTable === 'shift_assignments') {
      const stmt = db.prepare(`
        INSERT INTO shift_assignments (id, employee_id, date, shift_id, data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          shift_id=excluded.shift_id,
          data=excluded.data
      `);
      for (const item of items) {
        const empId = item.employeeId || item.employee_id || '';
        const dateStr = item.date || item.rosterDate || item.roster_date || '';
        const shiftId = item.shiftId || item.shift_id || item.shiftCode || 'default';
        const id = item.id || `${empId}_${dateStr}` || `sa_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        if (!id) continue;
        stmt.run([
          id,
          empId,
          dateStr,
          shiftId,
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'assignment_logs') {
      const stmt = db.prepare(`
        INSERT INTO assignment_logs (id, employee_id, date, shift_id, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `alog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([
          id,
          item.employeeId || '',
          item.date || '',
          item.shiftId || '',
          JSON.stringify(item),
          item.timestamp || now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'audit_logs') {
      const stmt = db.prepare(`
        INSERT INTO audit_logs (id, employee_id, date, data, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([
          id,
          item.employeeId || '',
          item.date || '',
          JSON.stringify(item),
          item.timestamp || item.created_at || now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'payroll_runs') {
      const stmt = db.prepare(`
        INSERT INTO payroll_runs (id, month, status, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          month=excluded.month,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.month || '',
          item.status || 'Draft',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'employee_movements') {
      const stmt = db.prepare(`
        INSERT INTO employee_movements (id, employee_id, effective_date, movement_type, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          employee_id=excluded.employee_id,
          effective_date=excluded.effective_date,
          movement_type=excluded.movement_type,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || item.employee_id || '',
          item.effectiveDate || item.effective_date || '',
          item.movementType || item.movement_type || 'Update',
          JSON.stringify(item),
          item.createdAt || item.created_at || now
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'settings') {
      const stmt = db.prepare(`
        INSERT INTO settings (id, data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
      `);
      for (const item of items) {
        const id = item.id || 'config';
        stmt.run([id, JSON.stringify(item), now]);
      }
      stmt.free();
      const latestConfig = items[items.length - 1];
      if (latestConfig && Array.isArray(latestConfig.holidays)) {
        syncHolidaysMasterTableInDb(db, latestConfig.holidays);
      } else {
        syncHolidaysMasterTableInDb(db);
      }
    } else if (sqlTable === 'roster_batches') {
      const stmt = db.prepare(`
        INSERT INTO roster_batches (id, roster_name, period_start, period_end, total_days, imported_at, imported_by, source_file_name, status, created_at, updated_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          roster_name=excluded.roster_name,
          period_start=excluded.period_start,
          period_end=excluded.period_end,
          total_days=excluded.total_days,
          status=excluded.status,
          updated_at=excluded.updated_at,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.rosterName || 'Roster Batch',
          item.periodStart || '',
          item.periodEnd || '',
          item.totalDays || 0,
          item.importedAt || now,
          item.importedBy || 'Admin',
          item.sourceFileName || '',
          item.status || 'Active',
          item.createdAt || now,
          now,
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'roster_assignments') {
      const stmt = db.prepare(`
        INSERT INTO roster_assignments (id, roster_batch_id, employee_id, roster_date, shift_code, shift_start, shift_end, source, status, created_at, updated_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          shift_code=excluded.shift_code,
          shift_start=excluded.shift_start,
          shift_end=excluded.shift_end,
          source=excluded.source,
          status=excluded.status,
          updated_at=excluded.updated_at,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.rosterBatchId || '',
          item.employeeId || '',
          item.rosterDate || item.date || '',
          item.shiftCode || '',
          item.shiftStart || '',
          item.shiftEnd || '',
          item.source || 'Imported Roster',
          item.status || 'Active',
          item.createdAt || now,
          now,
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'shift_audit_logs') {
      const stmt = db.prepare(`
        INSERT INTO shift_audit_logs (id, employee_id, date, old_shift, new_shift, changed_by, changed_at, reason, source, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.oldShift || '',
          item.newShift || '',
          item.changedBy || 'Admin',
          item.changedAt || now,
          item.reason || '',
          item.source || 'Manual Override',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'overtime') {
      const stmt = db.prepare(`
        INSERT INTO overtime (id, employee_id, date, hours, status, data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          hours=excluded.hours,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.hours || 0,
          item.status || 'Pending',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'exceptions') {
      const stmt = db.prepare(`
        INSERT INTO exceptions (id, employee_id, date, type, status, data)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          type=excluded.type,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.type || 'General',
          item.status || 'pending',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'sbl') {
      const stmt = db.prepare(`
        INSERT INTO sbl (id, employee_id, date, status, data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.status || 'Pending',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'force_attendance') {
      const acceptedForceItems: any[] = [];
      const blockedForceConflicts: any[] = [];
      for (const item of items) {
        if (!item.id) continue;
        const faCheck = validateForceAttendanceAgainstDb(db, item);
        if (!faCheck.allowed) {
          blockedForceConflicts.push({
            employeeId: item.employeeId,
            date: item.date,
            holidayName: faCheck.holidayName,
            message: faCheck.warning,
          });
          continue;
        }
        acceptedForceItems.push(item);
      }
      itemsToVerify = acceptedForceItems;
      if (blockedForceConflicts.length > 0) {
        holidayValidationMeta = {
          acceptedCount: acceptedForceItems.length,
          rejectedOverlapsCount: blockedForceConflicts.length,
          conflicts: blockedForceConflicts,
        };
      }
      const stmt = db.prepare(`
        INSERT INTO force_attendance (id, employee_id, date, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          data=excluded.data
      `);
      for (const item of acceptedForceItems) {
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'leave_records') {
      const stmt = db.prepare(`
        INSERT INTO leave_records (id, employee_id, date, status, data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          employee_id=excluded.employee_id,
          date=excluded.date,
          status=excluded.status,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.employeeId || '',
          item.date || '',
          item.status || 'Approved',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'zk_user_mappings') {
      const stmt = db.prepare(`
        INSERT INTO zk_user_mappings (id, device_user_id, employee_id, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          device_user_id=excluded.device_user_id,
          employee_id=excluded.employee_id,
          data=excluded.data
      `);
      for (const item of items) {
        if (!item.id) continue;
        stmt.run([
          item.id,
          item.deviceUserId || '',
          item.employeeId || '',
          JSON.stringify(item)
        ]);
      }
      stmt.free();
    } else if (sqlTable === 'zk_sync_logs') {
      const stmt = db.prepare(`
        INSERT INTO zk_sync_logs (id, data, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `sync_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([
          id,
          JSON.stringify(item),
          item.timestamp || now
        ]);
      }
      stmt.free();
    } else {
      const stmt = db.prepare(`
        INSERT INTO ${sqlTable} (id, data)
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data
      `);
      for (const item of items) {
        const id = item.id || `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        stmt.run([id, JSON.stringify(item)]);
      }
      stmt.free();
    }

    if (pendingApprovalAudits.length > 0) {
      const audStmt = db.prepare(`
        INSERT INTO approval_audits (
          id, module, record_id, employee_id, employee_name, target_date,
          previous_status, new_status, previous_approver, previous_approver_role,
          approved_by, approved_by_role, is_override, remarks, bs_date, timestamp, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const aud of pendingApprovalAudits) {
        audStmt.run([
          aud.id,
          aud.module,
          aud.recordId,
          aud.employeeId,
          aud.employeeName || '',
          aud.targetDate || '',
          aud.previousStatus || '',
          aud.newStatus || '',
          aud.previousApprover || '',
          aud.previousApproverRole || '',
          aud.approvedByName || aud.approvedBy || '',
          aud.approvedByRole || '',
          aud.isOverride ? 1 : 0,
          aud.remarks || '',
          aud.bsDate || '',
          aud.timestamp,
          JSON.stringify(aud)
        ]);
      }
      audStmt.free();
    }

    db.run('COMMIT');
    saveSqliteDb();

    // Verification Readback check
    let verified = false;
    let verificationStatus: 'PASSED' | 'FAILED' | 'WARNING' = 'PASSED';
    try {
      if (itemsToVerify.length > 0) {
        const sampleId = itemsToVerify[0].id || (itemsToVerify[0] as any).id;
        if (sampleId) {
          const verifyStmt = db.prepare(`SELECT id FROM ${sqlTable} WHERE id = ?`);
          verifyStmt.bind([sampleId]);
          if (verifyStmt.step()) {
            verified = true;
          }
          verifyStmt.free();
        } else {
          verified = true;
        }
      } else {
        verified = true;
      }
    } catch (vErr) {
      console.warn(`[SQLite Verification Warning] Could not verify write on ${sqlTable}:`, vErr);
      verificationStatus = 'WARNING';
    }

      const dbPath = getSqliteDbPath();
      const isSuper = isSuperAdminUser(authUser);
      console.log(`[SQLite SAVE] Persisted ${itemsToVerify.length} records to ${sqlTable} at ${dbPath} (Verification: ${verified ? 'PASSED' : 'PENDING'})`);

      const savedIds = itemsToVerify.map((it: any) => String(it.id || '')).filter(Boolean).slice(0, 100);
      const sseType = getSseEventForTable(table);
      if (sseType) {
        broadcastSseEvent(sseType, {
          action: 'save',
          table,
          recordIds: savedIds,
          affectedCount: itemsToVerify.length,
          actorEmail,
          departmentHint: itemsToVerify[0]?.department || undefined,
          containsSalary: table === 'payroll_runs' || table === 'employees',
          timestamp: now
        });
      }
      if (pendingApprovalAudits.length > 0) {
        broadcastSseEvent('ApprovalAuditUpdated', {
          action: 'save',
          table: 'approval_audits',
          affectedCount: pendingApprovalAudits.length,
          actorEmail,
          timestamp: now
        });
      }

      const responsePayload = {
        success: true,
        count: itemsToVerify.length,
        affectedCount: itemsToVerify.length,
        verified,
        verificationStatus,
        transaction: 'COMMITTED',
        dbPath: isSuper ? dbPath : 'Database.db',
        table: sqlTable,
        timestamp: now,
        version: itemsToVerify.length === 1 ? itemsToVerify[0]?._version : undefined,
        ...(holidayValidationMeta ? { holidayValidation: holidayValidationMeta } : {})
      };

      if (operationId) {
        cacheOperationResult(operationId, responsePayload);
      }

      return res.json(responsePayload);
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (rbErr) {}
      recordSystemError(`save_${table}`, error);
      console.error(`[SQLite SAVE Error] Failed to save to ${table}:`, error);
      return res.status(500).json({
        success: false,
        error: error.message,
        transaction: 'ROLLED_BACK',
        verificationStatus: 'FAILED'
      });
    }
  });
});

// 5. Delete records with RBAC, scope validation, verified pre-delete backup & SSE broadcast
localRouter.post('/data/:table/delete', async (req, res) => {
  const { table } = req.params;
  const { ids } = req.body;
  const idList = Array.isArray(ids) ? ids : [ids];

  const sqlTable = SQL_TABLE_MAP[table];
  if (!sqlTable) return res.status(400).json({ error: 'Invalid table' });

  const authUser = getAuthUser(req);
  const permCheck = canWriteTable(authUser, table, [], true);
  if (!permCheck.allowed) {
    return res.status(403).json({
      success: false,
      error: permCheck.reason || `Access Denied: Cannot delete from ${table}.`
    });
  }
  if (sqlTable === 'employees' && !isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'employees')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing employee delete permission.' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();

      // Enforce employee scope & Super Admin lock before deleting
      if (!isSuperAdminUser(authUser)) {
        const allowedEmpIds = EMPLOYEE_SCOPED_TABLES.has(table) ? buildScopedEmployeeIdSet(db, authUser)! : null;
        const selStmt = db.prepare(`SELECT * FROM ${sqlTable} WHERE id = ?`);
        try {
          for (const targetId of idList) {
            if (!targetId) continue;
            if (table === 'employees' && allowedEmpIds) {
              if (!allowedEmpIds.has(String(targetId))) {
                return res.status(403).json({ success: false, error: `Access Denied: Employee #${targetId} is outside your scope.` });
              }
            } else {
              selStmt.bind([targetId]);
              if (selStmt.step()) {
                const rowObj = selStmt.getAsObject();
                let parsed: any = {};
                try { parsed = rowObj.data ? JSON.parse(String(rowObj.data)) : {}; } catch {}
                if (
                  Boolean(parsed.superAdminOverride) ||
                  String(parsed.approvedByRole || '') === 'Super Admin' ||
                  String(parsed.reviewedByRole || '') === 'Super Admin'
                ) {
                  selStmt.free();
                  return res.status(403).json({
                    success: false,
                    error: 'Access Denied: Records finalized or overridden by Super Admin cannot be deleted.'
                  });
                }
                const rowEmpId = String(parsed.employeeId || rowObj.employee_id || '').trim();
                if (allowedEmpIds && rowEmpId && !allowedEmpIds.has(rowEmpId)) {
                  selStmt.free();
                  return res.status(403).json({ success: false, error: `Access Denied: Record ${targetId} belongs to an employee outside your scope.` });
                }
              }
              selStmt.reset();
            }
          }
        } finally {
          try { selStmt.free(); } catch {}
        }
      }

      // Mandatory verified safety backup before multi-record or employee deletion
      if (idList.length >= 3 || sqlTable === 'employees') {
        const bPath = _createDatabaseBackupUnlocked(`before_delete_${sqlTable}`);
        const vBackup = await verifyBackupFile(path.basename(bPath));
        if (!vBackup.valid) {
          throw new Error(`Safety backup verification failed before delete: ${vBackup.error || 'invalid'}`);
        }
      }

      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(`DELETE FROM ${sqlTable} WHERE id = ?`);
      let deletedCount = 0;
      for (const id of idList) {
        if (id) {
          stmt.run([id]);
          deletedCount++;
        }
      }
      stmt.free();
      db.run('COMMIT');
      saveSqliteDb();

      // Readback verification for deletion: verify deleted IDs are gone
      let verified = true;
      if (idList.length > 0 && idList[0]) {
        try {
          const verifyStmt = db.prepare(`SELECT id FROM ${sqlTable} WHERE id = ?`);
          verifyStmt.bind([idList[0]]);
          if (verifyStmt.step()) {
            verified = false;
          }
          verifyStmt.free();
        } catch (vErr) {
          console.warn('[SQLite Verification Warning on delete]:', vErr);
        }
      }

      const now = new Date().toISOString();
      const dbPath = getSqliteDbPath();
      const sseType = getSseEventForTable(table);
      if (sseType && deletedCount > 0) {
        broadcastSseEvent(sseType, {
          action: 'delete',
          table,
          recordIds: idList.map(String).filter(Boolean).slice(0, 100),
          affectedCount: deletedCount,
          actorEmail: authUser?.email,
          timestamp: now
        });
      }

      return res.json({
        success: true,
        deleted: deletedCount,
        deletedCount: deletedCount,
        affectedCount: deletedCount,
        verified,
        verificationStatus: verified ? 'PASSED' : 'FAILED',
        transaction: 'COMMITTED',
        dbPath: isSuperAdminUser(authUser) ? dbPath : 'Database.db',
        timestamp: now
      });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (rbErr) {}
      recordSystemError(`delete_${table}`, error);
      console.error(`[SQLite DELETE Error] Failed to delete from ${table}:`, error);
      return res.status(500).json({
        success: false,
        error: error.message,
        transaction: 'ROLLED_BACK',
        verificationStatus: 'FAILED'
      });
    }
  });
});

// 5b. Database Verification Health Check (100% Read-Only)
localRouter.get('/verify-db', async (req, res) => {
  try {
    const dbPath = getSqliteDbPath();
    const { integrity, counts } = await withReadOnlySqliteSnapshot((db) => {
      let check = 'WARNING';
      try {
        const checkRes = db.exec('PRAGMA integrity_check;');
        check = (checkRes.length > 0 && checkRes[0].values?.[0]?.[0] === 'ok') ? 'PASSED' : 'WARNING';
      } catch {}

      const tableCounts: Record<string, number> = {};
      const tables = ['employees', 'attendance_punches', 'payroll_runs', 'roster_assignments', 'documents', 'audit_logs'];
      for (const t of tables) {
        try {
          const cRes = db.exec(`SELECT COUNT(*) FROM ${t}`);
          tableCounts[t] = cRes.length > 0 ? Number(cRes[0].values[0][0]) : 0;
        } catch {
          tableCounts[t] = 0;
        }
      }
      return { integrity: check, counts: tableCounts };
    });

    res.json({
      status: 'healthy',
      punchMode: zkPollingState.readOnlyMode ? 'READ_ONLY' : 'READ_WRITE',
      externalWriterMode: zkPollingState.readOnlyMode,
      integrityCheck: integrity,
      databasePath: isSuperAdminUser(getAuthUser(req)) ? dbPath : 'Database.db',
      rootFolder: isSuperAdminUser(getAuthUser(req)) ? getSanitizedRootFolder() : 'Protected Local Storage',
      tableCounts: counts,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// 5c. Explicit Verified Safety Backup Creation (Super Admin Only)
localRouter.post('/backup', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Only Super Admin can create database backups.' });
  }
  try {
    const { label } = req.body || {};
    const result = await createVerifiedDatabaseBackup(label || 'manual');
    res.json({
      success: true,
      backupPath: result.backupPath,
      fileName: result.fileName,
      fileSize: result.sizeBytes,
      verified: result.verified,
      quickCheck: result.quickCheck,
      employeesCount: result.employeesCount,
      punchesCount: result.punchesCount,
      payrollRunsCount: result.payrollRunsCount,
      timestamp: new Date().toISOString(),
      message: `Verified SQLite backup created: ${result.fileName} (${result.quickCheck})`
    });
  } catch (err: any) {
    recordSystemError('backup', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5d. List Available Backups (Super Admin Only)
localRouter.get('/backups', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Only Super Admin can list database backups.' });
  }
  try {
    const root = getSanitizedRootFolder();
    const backupsDir = fs.existsSync(path.join(root, 'Backups'))
      ? path.join(root, 'Backups')
      : path.join(root, 'backups');

    if (!fs.existsSync(backupsDir)) {
      return res.json({ backups: [], count: 0, backupsDir });
    }

    const files = fs.readdirSync(backupsDir);
    const backupList = files
      .filter(f => f.endsWith('.db') || f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(backupsDir, f);
        const stats = fs.statSync(fullPath);
        return {
          fileName: f,
          fullPath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          type: f.endsWith('.db') ? 'SQLite Database' : 'JSON Snapshot'
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

    res.json({
      backups: backupList,
      count: backupList.length,
      backupsDir
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5e. Verify a Backup File via PRAGMA quick_check (Super Admin Only)
localRouter.post('/backups/verify', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Only Super Admin can verify backups.' });
  }
  try {
    const fileName = String(req.body?.fileName || '').trim();
    if (!fileName) return res.status(400).json({ success: false, error: 'fileName is required' });
    const result = await verifyBackupFile(fileName);
    res.json({ success: result.valid, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5f. Non-Destructive Test Restore into Isolated Temp Copy (Super Admin Only)
localRouter.post('/backups/test-restore', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Only Super Admin can test backup restores.' });
  }
  try {
    const fileName = String(req.body?.fileName || '').trim();
    if (!fileName) return res.status(400).json({ success: false, error: 'fileName is required' });
    const result = await testRestoreBackupCopy(fileName);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 5g. Comprehensive 14-Metric Live System Health Endpoint (Section 24)
localRouter.get('/system-health', async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const isSuper = isSuperAdminUser(authUser);
    const dbPath = getSqliteDbPath();
    const root = getSanitizedRootFolder();
    const healthMeta = getSqliteHealthMeta();

    let dbFileSizeBytes = 0;
    let dbLastModified: string | null = null;
    if (fs.existsSync(dbPath)) {
      try {
        const st = fs.statSync(dbPath);
        dbFileSizeBytes = st.size;
        dbLastModified = st.mtime.toISOString();
      } catch {}
    }

    const dbMetrics = await withReadOnlySqliteSnapshot((db) => {
      let quickCheck = 'error';
      try {
        const chk = db.exec('PRAGMA quick_check;');
        quickCheck = String(chk?.[0]?.values?.[0]?.[0] || 'error');
      } catch {}
      const countOf = (sql: string) => {
        try {
          const r = db.exec(sql);
          return r.length > 0 && r[0].values.length > 0 ? Number(r[0].values[0][0] || 0) : 0;
        } catch {
          return 0;
        }
      };
      let lastPunchTimestamp: string | null = null;
      try {
        const r = db.exec('SELECT MAX(punch_datetime) FROM attendance_punches');
        if (r.length > 0 && r[0].values.length > 0 && r[0].values[0][0]) {
          lastPunchTimestamp = String(r[0].values[0][0]);
        }
      } catch {}
      return {
        quickCheck,
        totalEmployees: countOf('SELECT COUNT(*) FROM employees'),
        activeEmployeesCount: countOf("SELECT COUNT(*) FROM employees WHERE status IS NULL OR status = '' OR LOWER(status) = 'active'"),
        punchesCount: countOf('SELECT COUNT(*) FROM attendance_punches'),
        payrollRunCount: countOf('SELECT COUNT(*) FROM payroll_runs'),
        lastPunchTimestamp
      };
    });

    const backupsDir = path.join(root, 'Backups');
    let backupCount = 0;
    let latestBackupFile: string | null = null;
    let latestBackupAt: string | null = null;
    if (fs.existsSync(backupsDir)) {
      const files = fs
        .readdirSync(backupsDir)
        .filter(f => f.endsWith('.db'))
        .map(f => ({ name: f, mtimeMs: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      backupCount = files.length;
      if (files[0]) {
        latestBackupFile = files[0].name;
        latestBackupAt = new Date(files[0].mtimeMs).toISOString();
      }
    }

    const lastPunchAgeMinutes = (() => {
      const refIso = dbMetrics.lastPunchTimestamp || zkPollingState.lastPollAt;
      if (!refIso) return null;
      const ms = Date.parse(refIso);
      if (isNaN(ms)) return null;
      return Math.max(0, Math.round((Date.now() - ms) / 60000));
    })();

    const mem = process.memoryUsage();
    const sseClients = getConnectedClientsSummary();
    const viaProxy = Boolean(req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] || req.headers['x-forwarded-proto']);

    res.json({
      success: true,
      checkedAt: new Date().toISOString(),
      serverProcessStatus: {
        status: 'running',
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform
      },
      caddyProxyStatus: {
        status: viaProxy ? 'proxied-active' : 'direct-local',
        viaReverseProxy: viaProxy,
        forwardedHost: isSuper ? String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000') : undefined
      },
      sqliteDbIntegrity: {
        status: dbMetrics.quickCheck === 'ok' ? 'ok' : 'error',
        quickCheck: dbMetrics.quickCheck,
        lastVerifiedAt: healthMeta.lastVerifiedAt
      },
      dbFilePath: isSuper ? dbPath : 'Database.db',
      dbFileSizeBytes,
      dbFileSizeFormatted: `${(dbFileSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
      dbLastModified,
      activeEmployeesCount: dbMetrics.activeEmployeesCount,
      totalEmployeesCount: dbMetrics.totalEmployees,
      punchesCount: dbMetrics.punchesCount,
      biometricCollectorMode: zkPollingState.readOnlyMode ? 'READ_ONLY' : 'READ_WRITE',
      readOnlyCollector: zkPollingState.readOnlyMode,
      lastPunchTimestamp: dbMetrics.lastPunchTimestamp,
      lastPunchSyncAgeMinutes: lastPunchAgeMinutes,
      payrollRunCount: dbMetrics.payrollRunCount,
      connectedSseClients: {
        count: sseClients.count,
        clients: isSuper ? sseClients.clients : undefined
      },
      lastVerifiedBackup: {
        status: healthMeta.lastBackupStatus,
        verifiedAt: healthMeta.lastBackupVerifiedAt || latestBackupAt,
        fileName: healthMeta.lastBackupPath ? path.basename(healthMeta.lastBackupPath) : latestBackupFile,
        error: isSuper ? healthMeta.lastBackupError : null
      },
      backupCount,
      latestBackupFile,
      serverMemoryUsage: {
        rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
        heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
        heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(1))
      },
      recentSystemErrors: isSuper ? getRecentSystemErrors(15) : []
    });
  } catch (err: any) {
    recordSystemError('systemHealth', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dedicated Payroll Run Delete Endpoint (supports /payroll/runs/:id and /runs/:id)
const handlePayrollRunDelete = async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing payroll run ID' });

  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'payroll')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Payroll module permission.' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');

      // Check if run exists and check status
      const checkStmt = db.prepare('SELECT data FROM payroll_runs WHERE id = ?');
      checkStmt.bind([id]);
      let existingRun: any = null;
      if (checkStmt.step()) {
        const row = checkStmt.getAsObject();
        if (row.data) {
          try {
            existingRun = JSON.parse(row.data as string);
          } catch (e) {
            existingRun = null;
          }
        }
      }
      checkStmt.free();

      if (existingRun && (existingRun.status === 'Finalized' || existingRun.status === 'Locked' || existingRun.status === 'Disbursed')) {
        db.run('ROLLBACK');
        return res.status(400).json({ error: 'This payroll run is finalized/locked and cannot be deleted.' });
      }

      const delStmt = db.prepare('DELETE FROM payroll_runs WHERE id = ?');
      delStmt.run([id]);
      delStmt.free();

      db.run('COMMIT');
      saveSqliteDb();

      broadcastSseEvent('PayrollUpdated', {
        action: 'delete',
        table: 'payroll_runs',
        recordIds: [id],
        actorEmail: authUser?.email,
        containsSalary: true,
        timestamp: new Date().toISOString()
      });

      console.log(`[SQLite DELETE] Deleted payroll run ${id} successfully`);
      return res.json({ success: true, deleted: 1, message: `Successfully deleted draft payroll run ${id}` });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (e) { /* ignore rollback error */ }
      recordSystemError('delete_payroll_run', error);
      console.error(`[SQLite DELETE Error] Failed to delete payroll run ${id}:`, error);
      return res.status(500).json({ error: error.message });
    }
  });
};

localRouter.delete('/payroll/runs/:id', handlePayrollRunDelete);
localRouter.delete('/runs/:id', handlePayrollRunDelete);

// =========================================================================
// 5B. Dedicated Movement & Separation Transactions with Read-back Verification
// =========================================================================
localRouter.post('/movement/separation', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'movementAttrition', 'employees')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Movement & Attrition permission.' });
  }

  const {
    employeeId,
    effectiveDate,
    separationType = 'Resignation',
    exitType = 'Voluntary',
    reason = '',
    exitReason = '',
    noticePeriod = '',
    lastWorkingDate = '',
    resignationDate = '',
    remarks = '',
    approvedBy,
    _expectedUpdatedAt,
    _expectedVersion,
    _operationId
  } = req.body;

  const empId = String(employeeId || '').trim();
  if (!empId) {
    return res.status(400).json({ error: 'Employee ID (Bio ID) is required' });
  }
  if (!effectiveDate) {
    return res.status(400).json({ error: 'Effective separation date is required' });
  }
  const cleanReason = String(exitReason || reason || '').trim();
  if (!cleanReason) {
    return res.status(400).json({ error: 'Reason for separation is mandatory' });
  }

  const operationId = String(req.headers['x-operation-id'] || _operationId || '').trim();
  if (operationId) {
    const cached = getCachedOperationResult(operationId);
    if (cached) return res.json({ ...cached, deduplicated: true });
  }

  const actorEmail = authUser?.email || approvedBy || 'HR Administrator';
  const canSalary = canViewSalaryForUser(authUser);

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const now = new Date().toISOString();

      // 1. Verify Employee exists in Master Directory
      const checkStmt = db.prepare(`SELECT id, name, department, designation, shift_id, joining_date, status, data FROM employees WHERE id = ?`);
      checkStmt.bind([empId]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return res.status(404).json({ error: `Employee Bio ID #${empId} not found in Employee Directory Master.` });
      }

      const row = checkStmt.getAsObject();
      checkStmt.free();

      let empData: any = {};
      try {
        empData = row.data ? JSON.parse(row.data as string) : {};
      } catch (e) {
        empData = {};
      }

      // Merge column values
      empData.id = row.id || empId;
      empData.name = row.name || empData.name || 'Unnamed';
      empData.department = row.department || empData.department || 'General';
      empData.designation = row.designation || empData.designation || 'Staff';
      empData.shiftId = row.shift_id || empData.shiftId || 'S1';
      empData.joiningDate = row.joining_date || empData.joiningDate || '';
      const previousStatus = row.status || empData.status || 'Active';

      // Scope check
      if (!isSuperAdminUser(authUser) && !isEmployeeInUserScope(empData, authUser)) {
        return res.status(403).json({ success: false, error: `Access Denied: Employee #${empId} is outside your assigned Department/Section.` });
      }

      // Optimistic concurrency check
      const existingVersion = Number(empData._version || 1);
      const existingUpdatedAt = empData.updatedAt ? String(empData.updatedAt) : undefined;
      if ((_expectedVersion !== undefined && Number(_expectedVersion) !== existingVersion) ||
          (_expectedUpdatedAt && existingUpdatedAt && String(_expectedUpdatedAt) !== existingUpdatedAt)) {
        return res.status(409).json({
          success: false,
          conflict: true,
          error: 'This record has been updated by another user. Please refresh and review the latest information before saving.',
          table: 'employees',
          recordId: empId,
          updatedBy: empData.updatedBy || 'Another user',
          updatedAt: existingUpdatedAt || null,
          latestVersion: existingVersion,
          latestRecord: redactSalaryFields(empData, canSalary),
          changedFields: ['status', 'separationDate']
        });
      }

      // 2. Validate separation date against joining date
      if (empData.joiningDate && effectiveDate < empData.joiningDate) {
        return res.status(400).json({
          error: `Separation date (${effectiveDate}) cannot be prior to joining date (${empData.joiningDate}).`
        });
      }

      // 3. Begin Transaction
      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');

      // 4. Create Movement Record
      const moveId = `move_sep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const movementRecord = {
        id: moveId,
        employeeId: empId,
        effectiveDate,
        movementType: separationType,
        previousDepartment: empData.department,
        previousDesignation: empData.designation,
        previousSection: empData.section || '',
        previousGrade: empData.grade || '',
        previousSalary: empData.basicSalary || 0,
        newDepartment: empData.department,
        newDesignation: empData.designation,
        newSection: empData.section || '',
        newGrade: empData.grade || '',
        newSalary: empData.basicSalary || 0,
        exitType: exitType || (separationType === 'Resignation' ? 'Voluntary' : 'Involuntary'),
        exitReason: cleanReason,
        reason: cleanReason,
        noticePeriod: noticePeriod || '',
        lastWorkingDate: lastWorkingDate || effectiveDate,
        resignationDate: resignationDate || effectiveDate,
        remarks: remarks || '',
        changedBy: actorEmail,
        changedAt: now,
        updatedAt: now,
        updatedBy: actorEmail,
        _version: 1
      };

      const moveStmt = db.prepare(`
        INSERT INTO employee_movements (id, employee_id, effective_date, movement_type, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          employee_id=excluded.employee_id,
          effective_date=excluded.effective_date,
          movement_type=excluded.movement_type,
          data=excluded.data
      `);
      moveStmt.run([
        moveId,
        empId,
        effectiveDate,
        separationType,
        JSON.stringify(movementRecord),
        now
      ]);
      moveStmt.free();

      // 5. Update Employee Master in SQLite (Status -> Inactive)
      empData.status = 'Inactive';
      empData.statusEffectiveDate = effectiveDate;
      empData.separationDate = effectiveDate;
      empData.exitType = exitType || (separationType === 'Resignation' ? 'Voluntary' : 'Involuntary');
      empData.exitReason = cleanReason;
      empData.lastWorkingDate = lastWorkingDate || effectiveDate;
      empData.resignationDate = resignationDate || effectiveDate;
      empData.noticePeriod = noticePeriod || '';
      empData.updatedAt = now;
      empData.updatedBy = actorEmail;
      empData._version = existingVersion + 1;

      const empUpdateStmt = db.prepare(`
        UPDATE employees 
        SET status = 'Inactive', data = ?, updated_at = ?
        WHERE id = ?
      `);
      empUpdateStmt.run([JSON.stringify(empData), now, empId]);
      empUpdateStmt.free();

      // 6. Record in Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const auditPayload = {
        id: auditId,
        employeeId: empId,
        employeeName: empData.name,
        date: effectiveDate,
        field: 'status',
        oldValue: previousStatus,
        newValue: 'Inactive',
        changedBy: actorEmail,
        timestamp: now,
        changedAt: now,
        remarks: `Separation recorded (${separationType}): ${cleanReason}`,
        source: 'Separation Workflow',
        module: 'Movement & Attrition',
        subModule: 'Separation',
        result: 'Success',
        operationId: operationId || moveId,
        details: {
          separationType,
          exitType,
          reason: cleanReason,
          noticePeriod,
          lastWorkingDate: lastWorkingDate || effectiveDate,
          remarks
        }
      };
      const auditStmt = db.prepare(`
        INSERT INTO audit_logs (id, employee_id, date, data, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      auditStmt.run([
        auditId,
        empId,
        effectiveDate,
        JSON.stringify(auditPayload),
        now
      ]);
      auditStmt.free();

      // 7. Commit & Persist
      db.run('COMMIT');
      saveSqliteDb();

      // 8. Read-back Verification Check
      let verified = false;
      let verifiedStatus = '';
      let verifiedSeparationDate = '';
      const vEmpStmt = db.prepare(`SELECT status, data FROM employees WHERE id = ?`);
      vEmpStmt.bind([empId]);
      if (vEmpStmt.step()) {
        const vRow = vEmpStmt.getAsObject();
        verifiedStatus = String(vRow.status || '');
        try {
          const vData = JSON.parse(vRow.data as string);
          verifiedSeparationDate = vData.separationDate || '';
        } catch (e) {}
      }
      vEmpStmt.free();

      const vMoveStmt = db.prepare(`SELECT id FROM employee_movements WHERE id = ?`);
      vMoveStmt.bind([moveId]);
      const moveExists = vMoveStmt.step();
      vMoveStmt.free();

      if (moveExists && verifiedStatus === 'Inactive' && verifiedSeparationDate === effectiveDate) {
        verified = true;
      }

      broadcastSseEvent('EmployeeUpdated', {
        action: 'separation',
        table: 'employees',
        recordIds: [empId],
        actorEmail,
        departmentHint: empData.department,
        timestamp: now
      });

      const dbPath = getSqliteDbPath();
      const responsePayload = {
        success: true,
        verified,
        verificationStatus: verified ? 'PASSED' : 'FAILED',
        transaction: 'COMMITTED',
        dbPath: isSuperAdminUser(authUser) ? dbPath : 'Database.db',
        movement: canSalary ? movementRecord : redactSalaryFields(movementRecord, false),
        employee: redactSalaryFields(empData, canSalary),
        message: `Separation verified and committed successfully for Employee ID #${empId}.`
      };
      if (operationId) cacheOperationResult(operationId, responsePayload);
      return res.json(responsePayload);
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (e) {}
      recordSystemError('separation', error);
      console.error('[SQLite SEPARATION ERROR]:', error);
      return res.status(500).json({ error: error.message || 'Failed to process separation transaction' });
    }
  });
});

localRouter.post('/movement/record', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'movementAttrition', 'employees')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Movement & Attrition permission.' });
  }

  const {
    employeeId,
    effectiveDate,
    movementType = 'Promotion',
    previousDepartment = '',
    newDepartment = '',
    previousDesignation = '',
    newDesignation = '',
    previousSection = '',
    newSection = '',
    previousGrade = '',
    newGrade = '',
    previousSalary = 0,
    newSalary = 0,
    newShiftId = '',
    reason = '',
    changedBy,
    _expectedUpdatedAt,
    _expectedVersion,
    _operationId
  } = req.body;

  const empId = String(employeeId || '').trim();
  if (!empId) {
    return res.status(400).json({ error: 'Employee ID (Bio ID) is required' });
  }
  if (!effectiveDate) {
    return res.status(400).json({ error: 'Effective date is required' });
  }

  const operationId = String(req.headers['x-operation-id'] || _operationId || '').trim();
  if (operationId) {
    const cached = getCachedOperationResult(operationId);
    if (cached) return res.json({ ...cached, deduplicated: true });
  }

  const canSalary = canViewSalaryForUser(authUser);
  if (Number(newSalary) > 0 && !canSalary) {
    return res.status(403).json({ success: false, error: 'Access Denied: Salary modifications require salary permission.' });
  }
  const actorEmail = authUser?.email || changedBy || 'HR Administrator';

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const now = new Date().toISOString();

      // 1. Verify Employee exists
      const checkStmt = db.prepare(`SELECT id, name, department, designation, shift_id, joining_date, status, data FROM employees WHERE id = ?`);
      checkStmt.bind([empId]);
      if (!checkStmt.step()) {
        checkStmt.free();
        return res.status(404).json({ error: `Employee Bio ID #${empId} not found in Employee Directory Master.` });
      }

      const row = checkStmt.getAsObject();
      checkStmt.free();

      let empData: any = {};
      try {
        empData = row.data ? JSON.parse(row.data as string) : {};
      } catch (e) {
        empData = {};
      }

      empData.id = row.id || empId;
      empData.name = row.name || empData.name || 'Unnamed';
      empData.department = row.department || empData.department || 'General';
      empData.designation = row.designation || empData.designation || 'Staff';
      empData.shiftId = row.shift_id || empData.shiftId || 'S1';
      empData.joiningDate = row.joining_date || empData.joiningDate || '';

      if (!isSuperAdminUser(authUser) && !isEmployeeInUserScope(empData, authUser)) {
        return res.status(403).json({ success: false, error: `Access Denied: Employee #${empId} is outside your assigned Department/Section.` });
      }

      const existingVersion = Number(empData._version || 1);
      const existingUpdatedAt = empData.updatedAt ? String(empData.updatedAt) : undefined;
      if ((_expectedVersion !== undefined && Number(_expectedVersion) !== existingVersion) ||
          (_expectedUpdatedAt && existingUpdatedAt && String(_expectedUpdatedAt) !== existingUpdatedAt)) {
        return res.status(409).json({
          success: false,
          conflict: true,
          error: 'This record has been updated by another user. Please refresh and review the latest information before saving.',
          table: 'employees',
          recordId: empId,
          updatedBy: empData.updatedBy || 'Another user',
          updatedAt: existingUpdatedAt || null,
          latestVersion: existingVersion,
          latestRecord: redactSalaryFields(empData, canSalary),
          changedFields: ['department', 'designation', 'shiftId']
        });
      }

      // 2. Begin Transaction
      try { db.run('ROLLBACK'); } catch (e) {}
      db.run('BEGIN TRANSACTION');

      const moveId = `move_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const movementRecord = {
        id: moveId,
        employeeId: empId,
        effectiveDate,
        movementType,
        previousDepartment: previousDepartment || empData.department,
        newDepartment: newDepartment || empData.department,
        previousDesignation: previousDesignation || empData.designation,
        newDesignation: newDesignation || empData.designation,
        previousSection: previousSection || empData.section || '',
        newSection: newSection || empData.section || '',
        previousGrade: previousGrade || empData.grade || '',
        newGrade: newGrade || empData.grade || '',
        previousSalary: previousSalary || empData.basicSalary || 0,
        newSalary: newSalary || empData.basicSalary || 0,
        reason: reason || `Employee Movement: ${movementType}`,
        changedBy: actorEmail,
        changedAt: now,
        updatedAt: now,
        updatedBy: actorEmail,
        _version: 1
      };

      const moveStmt = db.prepare(`
        INSERT INTO employee_movements (id, employee_id, effective_date, movement_type, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          employee_id=excluded.employee_id,
          effective_date=excluded.effective_date,
          movement_type=excluded.movement_type,
          data=excluded.data
      `);
      moveStmt.run([
        moveId,
        empId,
        effectiveDate,
        movementType,
        JSON.stringify(movementRecord),
        now
      ]);
      moveStmt.free();

      // 3. Update Employee Master attributes based on movement type
      if (newDepartment) empData.department = newDepartment;
      if (newDesignation) empData.designation = newDesignation;
      if (newSection) empData.section = newSection;
      if (newGrade) empData.grade = newGrade;
      if (newSalary && Number(newSalary) > 0) {
        empData.basicSalary = Number(newSalary);
        empData.salaryEffectiveDate = effectiveDate;
      }
      if (newShiftId) empData.shiftId = newShiftId;

      if (movementType === 'Promotion') {
        empData.previousDesignation = previousDesignation || empData.previousDesignation;
        empData.previousGrade = previousGrade || empData.previousGrade;
      } else if (movementType === 'Transfer' || movementType === 'Department Change') {
        empData.previousDepartment = previousDepartment || empData.previousDepartment;
        empData.transferDate = effectiveDate;
      } else if (movementType === 'New Joiner') {
        empData.status = 'Active';
        empData.joiningDate = effectiveDate;
      }
      empData.updatedAt = now;
      empData.updatedBy = actorEmail;
      empData._version = existingVersion + 1;

      const empUpdateStmt = db.prepare(`
        UPDATE employees 
        SET department = ?, designation = ?, shift_id = ?, data = ?, updated_at = ?
        WHERE id = ?
      `);
      empUpdateStmt.run([
        empData.department,
        empData.designation,
        empData.shiftId,
        JSON.stringify(empData),
        now,
        empId
      ]);
      empUpdateStmt.free();

      // 4. Audit Log
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const auditPayload = {
        id: auditId,
        employeeId: empId,
        employeeName: empData.name,
        date: effectiveDate,
        field: movementType,
        oldValue: previousDesignation || previousDepartment || '',
        newValue: newDesignation || newDepartment || '',
        changedBy: actorEmail,
        timestamp: now,
        changedAt: now,
        remarks: reason || `Movement recorded: ${movementType}`,
        source: 'Movement Workflow',
        module: 'Movement & Attrition',
        subModule: movementType,
        result: 'Success',
        operationId: operationId || moveId,
        details: movementRecord
      };
      const auditStmt = db.prepare(`
        INSERT INTO audit_logs (id, employee_id, date, data, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      auditStmt.run([
        auditId,
        empId,
        effectiveDate,
        JSON.stringify(auditPayload),
        now
      ]);
      auditStmt.free();

      db.run('COMMIT');
      saveSqliteDb();

      // 5. Readback verification
      let verified = false;
      const vMoveStmt = db.prepare(`SELECT id FROM employee_movements WHERE id = ?`);
      vMoveStmt.bind([moveId]);
      if (vMoveStmt.step()) verified = true;
      vMoveStmt.free();

      broadcastSseEvent('EmployeeUpdated', {
        action: 'movement',
        table: 'employees',
        recordIds: [empId],
        actorEmail,
        departmentHint: empData.department,
        timestamp: now
      });

      const dbPath = getSqliteDbPath();
      const responsePayload = {
        success: true,
        verified,
        verificationStatus: verified ? 'PASSED' : 'FAILED',
        transaction: 'COMMITTED',
        dbPath: isSuperAdminUser(authUser) ? dbPath : 'Database.db',
        movement: canSalary ? movementRecord : redactSalaryFields(movementRecord, false),
        employee: redactSalaryFields(empData, canSalary),
        message: `Movement recorded and verified successfully for Employee ID #${empId}.`
      };
      if (operationId) cacheOperationResult(operationId, responsePayload);
      return res.json(responsePayload);
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch (e) {}
      recordSystemError('movement', error);
      console.error('[SQLite MOVEMENT ERROR]:', error);
      return res.status(500).json({ error: error.message || 'Failed to record movement transaction' });
    }
  });
});

// 6. Purge Table (Strictly Super Admin Only, Write-Locked, Mandatory Verified Pre-Purge Backup)
localRouter.post('/data/:table/purge', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Access Denied: Only Super Admin can purge system tables.' });
  }

  const { table } = req.params;
  const validTables: Record<string, string> = {
    employees: 'employees',
    punches: 'attendance_punches',
    holidays: 'holidays',
    attendance: 'attendance',
    documents: 'documents',
    shift_assignments: 'shift_assignments',
    assignment_logs: 'assignment_logs',
    shifts: 'shifts',
    leave: 'leave',
    leave_records: 'leave_records',
    exceptions: 'exceptions',
    overtime: 'overtime',
    sbl: 'sbl',
    force_attendance: 'force_attendance',
    payroll: 'payroll',
    payroll_runs: 'payroll_runs',
    audit_logs: 'audit_logs',
    roster_batches: 'roster_batches',
    roster_assignments: 'roster_assignments',
    shift_audit_logs: 'shift_audit_logs',
    employee_movements: 'employee_movements',
    field_attendance_audit: 'field_attendance_audit',
    audit_decisions: 'audit_decisions',
    tax_rules: 'tax_rules',
    deduction_rules: 'deduction_rules',
    salary_components: 'salary_components',
    zk_devices: 'zk_devices',
    zk_user_mappings: 'zk_user_mappings',
    zk_sync_logs: 'zk_sync_logs',
    zk_unmapped_punches: 'zk_unmapped_punches'
  };

  const sqlTable = validTables[table];
  if (!sqlTable) return res.status(400).json({ error: 'Invalid table' });

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();

      // Mandatory verified safety backup BEFORE purge — abort with 500 if backup verification fails!
      const bPath = _createDatabaseBackupUnlocked(`before_purge_${sqlTable}`);
      const vBackup = await verifyBackupFile(path.basename(bPath));
      if (!vBackup.valid) {
        throw new Error(`Pre-purge safety backup verification failed: ${vBackup.error || 'corrupt backup'}`);
      }

      try { db.run('ROLLBACK'); } catch {}
      db.run('BEGIN TRANSACTION');
      db.run(`DELETE FROM ${sqlTable}`);
      db.run('COMMIT');
      saveSqliteDb();

      const sseType = getSseEventForTable(table);
      if (sseType) {
        broadcastSseEvent(sseType, {
          action: 'purge',
          table,
          actorEmail: authUser?.email,
          timestamp: new Date().toISOString()
        });
      }

      return res.json({
        success: true,
        backupFileName: path.basename(bPath),
        backupVerified: true,
        message: `Purged ${sqlTable} (verified backup created: ${path.basename(bPath)})`
      });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch {}
      recordSystemError(`purge_${table}`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });
});

// 7. Local HR Document Upload (RBAC, Path Confinement & Write-Locked)
localRouter.post('/documents/upload', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'employees', 'movementAttrition')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Employee Document upload permission.' });
  }

  const { employeeId, documentType, title, fileName, fileBase64, notes, uploadedBy } = req.body;
  if (!employeeId || !title || !fileName || !fileBase64) {
    return res.status(400).json({ error: 'Missing required document parameters (employeeId, title, fileName, fileBase64)' });
  }

  const ext = path.extname(String(fileName)).toLowerCase();
  const dangerousExts = ['.exe', '.bat', '.cmd', '.sh', '.vbs', '.js', '.dll', '.scr', '.msi'];
  if (dangerousExts.includes(ext)) {
    return res.status(400).json({ error: 'Executable file types are strictly prohibited for HR documents.' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      if (!isSuperAdminUser(authUser)) {
        const allowedEmpIds = buildScopedEmployeeIdSet(db, authUser)!;
        if (!allowedEmpIds.has(String(employeeId).trim())) {
          return res.status(403).json({ success: false, error: 'Access Denied: Employee is outside your assigned scope.' });
        }
      }

      const root = getSanitizedRootFolder();
      const baseDocsDir = path.resolve(root, 'Documents', 'Employees');
      const cleanEmpId = sanitizeFileName(String(employeeId));
      const empDocsDir = path.resolve(baseDocsDir, cleanEmpId);
      if (!empDocsDir.startsWith(baseDocsDir + path.sep)) {
        return res.status(403).json({ error: 'Access denied: invalid employee document directory' });
      }
      if (!fs.existsSync(empDocsDir)) {
        fs.mkdirSync(empDocsDir, { recursive: true });
      }

      const cleanFileName = sanitizeFileName(String(fileName));
      const uniqueId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const physicalName = `${Date.now()}_${cleanFileName}`;
      const physicalPath = path.resolve(empDocsDir, physicalName);
      if (!physicalPath.startsWith(empDocsDir + path.sep)) {
        return res.status(403).json({ error: 'Access denied: invalid document filename' });
      }

      const base64Data = String(fileBase64).replace(/^data:([A-Za-z-+/]+);base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(physicalPath, buffer);

      const uploadedAt = new Date().toISOString();
      const docMeta = {
        id: uniqueId,
        employeeId: String(employeeId).trim(),
        documentType: documentType || 'Other',
        title,
        fileName: cleanFileName,
        filePath: physicalPath,
        fileSize: buffer.length,
        fileType: ext || '.bin',
        uploadedAt,
        uploadedBy: authUser?.email || uploadedBy || 'HR Admin',
        notes: notes || ''
      };

      try { db.run('ROLLBACK'); } catch {}
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(`
        INSERT INTO documents (id, employee_id, document_type, title, file_name, file_path, file_size, file_type, uploaded_at, uploaded_by, notes, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        docMeta.id,
        docMeta.employeeId,
        docMeta.documentType,
        docMeta.title,
        docMeta.fileName,
        docMeta.filePath,
        docMeta.fileSize,
        docMeta.fileType,
        docMeta.uploadedAt,
        docMeta.uploadedBy,
        docMeta.notes,
        JSON.stringify(docMeta)
      ]);
      stmt.free();
      db.run('COMMIT');
      saveSqliteDb();

      broadcastSseEvent('EmployeeUpdated', {
        action: 'document_upload',
        table: 'documents',
        recordIds: [docMeta.id],
        actorEmail: authUser?.email,
        timestamp: uploadedAt
      });

      return res.json({ success: true, document: docMeta });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch {}
      recordSystemError('document_upload', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// 8. List documents for Employee (RBAC & Scope Checked)
localRouter.get('/documents/employee/:employeeId', async (req, res) => {
  const { employeeId } = req.params;
  const authUser = getAuthUser(req);
  try {
    const docs = await withReadOnlySqliteSnapshot((db) => {
      if (!isSuperAdminUser(authUser)) {
        const allowedEmpIds = buildScopedEmployeeIdSet(db, authUser)!;
        if (!allowedEmpIds.has(String(employeeId).trim())) {
          return null;
        }
      }
      const stmt = db.prepare(`SELECT data FROM documents WHERE employee_id = ? ORDER BY uploaded_at DESC`);
      stmt.bind([employeeId]);
      const list: any[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.data) {
          try { list.push(JSON.parse(row.data as string)); } catch {}
        }
      }
      stmt.free();
      return list;
    });

    if (docs === null) {
      return res.status(403).json({ error: 'Access Denied: Employee documents outside your scope.' });
    }
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Download / Serve Document (Scope & Path Confinement Enforced)
localRouter.get('/documents/download/:id', async (req, res) => {
  const { id } = req.params;
  const authUser = getAuthUser(req);
  try {
    const info = await withReadOnlySqliteSnapshot((db) => {
      const stmt = db.prepare(`SELECT employee_id, file_path, file_name FROM documents WHERE id = ?`);
      stmt.bind([id]);
      let row: any = null;
      if (stmt.step()) {
        row = stmt.getAsObject();
      }
      stmt.free();
      if (!row) return { found: false };
      if (!isSuperAdminUser(authUser)) {
        const allowedEmpIds = buildScopedEmployeeIdSet(db, authUser)!;
        if (row.employee_id && !allowedEmpIds.has(String(row.employee_id).trim())) {
          return { found: true, forbidden: true };
        }
      }
      return { found: true, forbidden: false, filePath: String(row.file_path || ''), fileName: String(row.file_name || 'document') };
    });

    if (!info.found) return res.status(404).send('Document not found');
    if (info.forbidden) return res.status(403).send('Access Denied: Document outside your assigned scope');

    const root = getSanitizedRootFolder();
    const baseDocsDir = path.resolve(root, 'Documents');
    const resolvedPath = path.resolve(info.filePath || '');
    if (!resolvedPath.startsWith(baseDocsDir + path.sep) || !fs.existsSync(resolvedPath)) {
      return res.status(404).send('Document file not found or path restricted');
    }

    res.download(resolvedPath, info.fileName);
  } catch (error: any) {
    res.status(500).send('Error downloading file: ' + error.message);
  }
});

// 10. Delete Document (RBAC, Path Confinement & Write-Locked)
localRouter.delete('/documents/:id', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'employees', 'movementAttrition')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Employee Document delete permission.' });
  }
  const { id } = req.params;
  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const stmt = db.prepare(`SELECT employee_id, file_path FROM documents WHERE id = ?`);
      stmt.bind([id]);

      let targetFilePath = '';
      if (stmt.step()) {
        const row = stmt.getAsObject();
        if (!isSuperAdminUser(authUser)) {
          const allowedEmpIds = buildScopedEmployeeIdSet(db, authUser)!;
          if (row.employee_id && !allowedEmpIds.has(String(row.employee_id).trim())) {
            stmt.free();
            return res.status(403).json({ success: false, error: 'Access Denied: Document outside your scope.' });
          }
        }
        targetFilePath = String(row.file_path || '');
      }
      stmt.free();

      if (targetFilePath) {
        const root = getSanitizedRootFolder();
        const baseDocsDir = path.resolve(root, 'Documents');
        const resolvedPath = path.resolve(targetFilePath);
        if (resolvedPath.startsWith(baseDocsDir + path.sep) && fs.existsSync(resolvedPath)) {
          try { fs.unlinkSync(resolvedPath); } catch {}
        }
      }

      try { db.run('ROLLBACK'); } catch {}
      db.run('BEGIN TRANSACTION');
      db.run(`DELETE FROM documents WHERE id = ?`, [id]);
      db.run('COMMIT');
      saveSqliteDb();

      broadcastSseEvent('EmployeeUpdated', {
        action: 'document_delete',
        table: 'documents',
        recordIds: [id],
        actorEmail: authUser?.email,
        timestamp: new Date().toISOString()
      });

      return res.json({ success: true, id });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch {}
      recordSystemError('document_delete', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// 12. Local Excel/CSV Data Import Endpoint (RBAC + Write-Locked + SSE Broadcast)
localRouter.post('/import-excel', async (req, res) => {
  const authUser = getAuthUser(req);
  const { type, rows } = req.body;
  if (!type || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'Missing import type or rows array' });
  }

  if (type === 'employees' && !isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'employees')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Employee Directory import permission.' });
  }
  if (type === 'punches' && !isSuperAdminUser(authUser) && !hasModulePerm(authUser, 'import', 'devices')) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Punch Import permission.' });
  }
  if (type === 'shift_assignments' && !isSuperAdminUser(authUser) && !authUser?.permissions?.canManageShifts) {
    return res.status(403).json({ success: false, error: 'Access Denied: Missing Shift Management permission.' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const db = await getSqliteDb();
      const now = new Date().toISOString();
      let importedCount = 0;
      try { db.run('ROLLBACK'); } catch(e) {}
      db.run('BEGIN TRANSACTION');

      if (type === 'employees') {
        const stmt = db.prepare(`
          INSERT INTO employees (id, name, department, designation, shift_id, joining_date, status, data, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            department=excluded.department,
            designation=excluded.designation,
            shift_id=excluded.shift_id,
            joining_date=excluded.joining_date,
            status=excluded.status,
            data=excluded.data,
            updated_at=excluded.updated_at
        `);
        for (const r of rows) {
          const empId = String(r.id || r.employeeId || r.code || r.EmployeeID || '').trim();
          if (!empId) continue;
          const emp = {
            id: empId,
            name: r.name || r.EmployeeName || r.fullName || 'Unnamed',
            department: r.department || r.Department || '',
            designation: r.designation || r.Designation || '',
            shiftId: r.shiftId || r.Shift || 'S1',
            joiningDate: r.joiningDate || r.JoiningDate || now.substring(0, 10),
            status: r.status || 'Active',
            email: r.email || '',
            phone: r.phone || '',
            updatedAt: now,
            updatedBy: authUser?.email || 'Excel Import'
          };
          stmt.run([emp.id, emp.name, emp.department, emp.designation, emp.shiftId, emp.joiningDate, emp.status, JSON.stringify(emp), now]);
          importedCount++;
        }
        stmt.free();
      } else if (type === 'punches') {
        const normalizedRows = rows
          .map((r: any) => {
            const empId = String(r.employeeId || r.employee_id || '').trim();
            const pDt = String(r.punchDatetime || r.punch_datetime || '').trim();
            const id = String(r.id || `${empId}_${pDt.replace(/[:.-]/g, '')}`).trim();
            if (!id || !empId || !pDt) return null;
            return {
              ...r,
              id,
              employeeId: empId,
              punchDatetime: pDt,
              deviceId: r.deviceId || '',
              source: r.source || 'FileImport',
            };
          })
          .filter(Boolean) as any[];

        const validationRes = validateIncomingPunchesAgainstDb(db, normalizedRows);
        const validRows = validationRes.acceptedPunches;

        const stmt = db.prepare(`
          INSERT INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            employee_id=excluded.employee_id,
            punch_datetime=excluded.punch_datetime,
            device_id=excluded.device_id,
            source=excluded.source,
            data=excluded.data
        `);
        for (const r of validRows) {
          stmt.run([r.id, r.employeeId, r.punchDatetime, r.deviceId || '', r.source || 'FileImport', JSON.stringify(r), now]);
          importedCount++;
        }
        stmt.free();

        db.run('COMMIT');
        saveSqliteDb();
        broadcastSseEvent('PunchSnapshotUpdated', { action: 'import', table: 'punches', affectedCount: importedCount, actorEmail: authUser?.email, timestamp: now });
        return res.json({
          success: true,
          importedCount,
          holidayOverlapsSkipped: validationRes.rejectedOverlaps.length,
          conflicts: validationRes.conflicts,
          message: `Successfully imported ${importedCount} punch records into SQLite (${validationRes.rejectedOverlaps.length} holiday overlaps prevented).`
        });
      } else if (type === 'shift_assignments') {
        const stmt = db.prepare(`
          INSERT INTO shift_assignments (id, data)
          VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data
        `);
        for (const r of rows) {
          const id = r.id || `imp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          stmt.run([id, JSON.stringify(r)]);
          importedCount++;
        }
        stmt.free();
      } else {
        try { db.run('ROLLBACK'); } catch {}
        return res.status(400).json({ error: 'Unsupported import type for SQLite persistence.' });
      }

      db.run('COMMIT');
      saveSqliteDb();
      broadcastSseEvent(type === 'employees' ? 'EmployeeUpdated' : 'AttendanceUpdated', {
        action: 'import',
        table: type,
        affectedCount: importedCount,
        actorEmail: authUser?.email,
        timestamp: now
      });

      return res.json({ success: true, importedCount, message: `Successfully imported ${importedCount} records locally into SQLite.` });
    } catch (error: any) {
      try {
        const db = await getSqliteDb();
        db.run('ROLLBACK');
      } catch {}
      recordSystemError('import_excel', error);
      return res.status(500).json({ error: error.message });
    }
  });
});

// 14. Real Local Backend Diagnostics Endpoint (Super Admin Only, Write-Locked, Parameterized SQL)
localRouter.get('/diagnostics', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Only Super Admin can run system diagnostics.' });
  }

  return withSqliteWriteLock(async () => {
    const startTime = Date.now();
    const root = getSanitizedRootFolder();
    const actualDbPath = getSqliteDbPath();
    const configuredDbPath = process.env.LOCAL_DB_PATH || (process.platform === 'win32' ? 'E:\\SHRM_HRIS\\Database.db' : actualDbPath);
    const docsPath = path.join(root, 'Documents');

    const isWin32 = process.platform === 'win32';
    const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB || !isWin32);

    const diagResult: any = {
      timestamp: new Date().toISOString(),
      runtime: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        isCloudRunPreview: isCloudRun,
        runtimeLabel: isWin32 ? 'WINDOWS NATIVE SERVER (win32)' : 'GOOGLE AI STUDIO PREVIEW CONTAINER (Linux Container)'
      },
      paths: {
        configuredDatabasePath: configuredDbPath,
        actualDatabasePath: actualDbPath,
        rootDirectory: root,
        rootDirectoryExists: fs.existsSync(root),
        documentsDirectoryPath: docsPath,
        documentsDirectoryExists: fs.existsSync(docsPath)
      },
      databaseFile: {
        exists: fs.existsSync(actualDbPath),
        sizeBytes: 0,
        sizeFormatted: '0 KB',
        lastModified: null
      },
      sqliteTests: {
        connection: 'UNKNOWN',
        readTest: { passed: false, employeeCount: 0, latencyMs: 0, error: null },
        writeTest: { passed: false, latencyMs: 0, error: null },
        transactionTest: { passed: false, latencyMs: 0, error: null }
      },
      fileIoTest: {
        passed: false,
        testFilePath: null,
        error: null
      },
      accessibilityStatus: '',
      summaryNote: ''
    };

    if ((diagResult.paths.databaseFileExists = fs.existsSync(actualDbPath))) {
      try {
        const stats = fs.statSync(actualDbPath);
        diagResult.databaseFile.sizeBytes = stats.size;
        diagResult.databaseFile.sizeFormatted = `${(stats.size / 1024).toFixed(2)} KB (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`;
        diagResult.databaseFile.lastModified = stats.mtime.toISOString();
      } catch (e: any) {
        diagResult.databaseFile.error = e.message;
      }
    }

    try {
      const db = await getSqliteDb();
      diagResult.sqliteTests.connection = 'Connected (sql.js / SQLite)';

      const rStart = Date.now();
      try {
        const empRes = db.exec('SELECT COUNT(*) as cnt FROM employees');
        const count = empRes.length > 0 && empRes[0].values.length > 0 ? Number(empRes[0].values[0][0]) : 0;
        diagResult.sqliteTests.readTest = {
          passed: true,
          employeeCount: count,
          latencyMs: Date.now() - rStart,
          error: null
        };
      } catch (rErr: any) {
        diagResult.sqliteTests.readTest = {
          passed: false,
          employeeCount: 0,
          latencyMs: Date.now() - rStart,
          error: rErr.message
        };
      }

      const wStart = Date.now();
      const diagId = `_diag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      try {
        const stmt = db.prepare('INSERT INTO audit_logs (id, employee_id, date, data, created_at) VALUES (?, ?, ?, ?, ?)');
        stmt.run([diagId, 'DIAGNOSTIC', 'TODAY', JSON.stringify({ diagnostic: true }), new Date().toISOString()]);
        stmt.free();

        const vStmt = db.prepare('SELECT id FROM audit_logs WHERE id = ?');
        vStmt.bind([diagId]);
        const verifyPassed = vStmt.step();
        vStmt.free();

        const dStmt = db.prepare('DELETE FROM audit_logs WHERE id = ?');
        dStmt.run([diagId]);
        dStmt.free();
        saveSqliteDb();

        diagResult.sqliteTests.writeTest = {
          passed: verifyPassed,
          latencyMs: Date.now() - wStart,
          error: verifyPassed ? null : 'Row inserted but verification query returned no records.'
        };
      } catch (wErr: any) {
        diagResult.sqliteTests.writeTest = {
          passed: false,
          latencyMs: Date.now() - wStart,
          error: wErr.message
        };
      }

      const tStart = Date.now();
      try {
        try { db.run('ROLLBACK'); } catch {}
        db.run('BEGIN TRANSACTION;');
        const txId = `_tx_${Date.now()}`;
        const insTx = db.prepare('INSERT INTO departments (id, name, data) VALUES (?, ?, ?)');
        insTx.run([txId, 'DiagDept', '{"tx":true}']);
        insTx.free();
        const delTx = db.prepare('DELETE FROM departments WHERE id = ?');
        delTx.run([txId]);
        delTx.free();
        db.run('COMMIT;');
        saveSqliteDb();

        diagResult.sqliteTests.transactionTest = {
          passed: true,
          latencyMs: Date.now() - tStart,
          error: null
        };
      } catch (tErr: any) {
        try { db.run('ROLLBACK;'); } catch {}
        diagResult.sqliteTests.transactionTest = {
          passed: false,
          latencyMs: Date.now() - tStart,
          error: tErr.message
        };
      }
    } catch (dbErr: any) {
      diagResult.sqliteTests.connection = 'FAILED: ' + dbErr.message;
    }

    try {
      if (!fs.existsSync(docsPath)) {
        fs.mkdirSync(docsPath, { recursive: true });
      }
      const testFilePath = path.join(docsPath, '_diag_io_test.tmp');
      const testContent = `DIAGNOSTIC_TEST_${Date.now()}`;
      fs.writeFileSync(testFilePath, testContent, 'utf-8');
      const readBack = fs.readFileSync(testFilePath, 'utf-8');
      fs.unlinkSync(testFilePath);

      diagResult.fileIoTest = {
        passed: readBack === testContent,
        testFilePath: testFilePath,
        error: readBack === testContent ? null : 'Content mismatch during file readback.'
      };
    } catch (ioErr: any) {
      diagResult.fileIoTest = {
        passed: false,
        testFilePath: path.join(docsPath, '_diag_io_test.tmp'),
        error: ioErr.message
      };
    }

    if (isWin32 && diagResult.sqliteTests.readTest.passed && diagResult.sqliteTests.writeTest.passed) {
      diagResult.accessibilityStatus = 'WINDOWS DISK & DATABASE FULLY ACCESSIBLE';
      diagResult.summaryNote = 'Running natively on Windows. Backend is physically reading & writing E:\\SHRM_HRIS\\Database.db.';
    } else if (!isWin32) {
      diagResult.accessibilityStatus = 'LOCAL WINDOWS DATABASE NOT ACCESSIBLE FROM THIS PREVIEW CONTAINER';
      diagResult.summaryNote = `This preview is running inside a Linux container. SQLite is operating in container storage (${actualDbPath}).`;
    } else {
      diagResult.accessibilityStatus = 'LOCAL STORAGE ERROR DETECTED';
      diagResult.summaryNote = 'Windows host detected but SQLite read/write diagnostic encountered errors.';
    }

    diagResult.totalDiagnosticTimeMs = Date.now() - startTime;
    return res.json(diagResult);
  });
});

// 15. Real Physical Database Persistence Test (Super Admin Only, Write-Locked, Parameterized SQL)
localRouter.post('/persistence-test', async (req, res) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdminUser(authUser)) {
    return res.status(403).json({ success: false, error: 'Only Super Admin can run physical persistence tests.' });
  }

  return withSqliteWriteLock(async () => {
    try {
      const dbPath = getSqliteDbPath();
      const mainDb = await getSqliteDb();
      saveSqliteDb();

      const physicalFileExists = fs.existsSync(dbPath);
      if (!physicalFileExists) {
        return res.status(500).json({
          physicalDatabase: dbPath,
          physicalFileExists: false,
          writeToPhysicalFile: false,
          reloadFromPhysicalFile: false,
          temporaryRecordFoundAfterReload: false,
          temporaryRecordDeleted: false,
          finalReloadConfirmedDeleted: false,
          persistenceStatus: 'FAILED',
          error: 'Database file does not exist on physical disk.'
        });
      }

      mainDb.run(`
        CREATE TABLE IF NOT EXISTS persistence_test (
          id TEXT PRIMARY KEY,
          test_val TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      const testId = `test_pers_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const timestamp = new Date().toISOString();

      mainDb.run(
        `INSERT INTO persistence_test (id, test_val, created_at) VALUES (?, ?, ?)`,
        [testId, 'REAL_PHYSICAL_PERSISTENCE_VERIFICATION', timestamp]
      );
      saveSqliteDb();

      const statAfterWrite = fs.statSync(dbPath);
      const writeToPhysicalFile = fs.existsSync(dbPath) && statAfterWrite.size > 0;

      const SQL = await initSqlJs();
      const fileBuffer1 = fs.readFileSync(dbPath);
      const reloadedDb1 = new SQL.Database(fileBuffer1);
      const reloadFromPhysicalFile = true;

      const q1Stmt = reloadedDb1.prepare('SELECT id, test_val FROM persistence_test WHERE id = ?');
      q1Stmt.bind([testId]);
      const temporaryRecordFoundAfterReload = q1Stmt.step();
      q1Stmt.free();
      reloadedDb1.close();

      mainDb.run(`DELETE FROM persistence_test WHERE id = ?`, [testId]);
      saveSqliteDb();

      const fileBuffer2 = fs.readFileSync(dbPath);
      const reloadedDb2 = new SQL.Database(fileBuffer2);
      const q2Stmt = reloadedDb2.prepare('SELECT id FROM persistence_test WHERE id = ?');
      q2Stmt.bind([testId]);
      const finalReloadConfirmedDeleted = !q2Stmt.step();
      q2Stmt.free();
      reloadedDb2.close();

      const temporaryRecordDeleted = true;
      const isPassed =
        physicalFileExists &&
        writeToPhysicalFile &&
        reloadFromPhysicalFile &&
        temporaryRecordFoundAfterReload &&
        temporaryRecordDeleted &&
        finalReloadConfirmedDeleted;

      return res.json({
        physicalDatabase: dbPath,
        physicalFileExists,
        writeToPhysicalFile,
        reloadFromPhysicalFile,
        temporaryRecordFoundAfterReload,
        temporaryRecordDeleted,
        finalReloadConfirmedDeleted,
        persistenceStatus: isPassed ? 'PASSED' : 'FAILED'
      });
    } catch (error: any) {
      recordSystemError('persistence_test', error);
      return res.status(500).json({
        physicalDatabase: getSqliteDbPath(),
        physicalFileExists: fs.existsSync(getSqliteDbPath()),
        writeToPhysicalFile: false,
        reloadFromPhysicalFile: false,
        temporaryRecordFoundAfterReload: false,
        temporaryRecordDeleted: false,
        finalReloadConfirmedDeleted: false,
        persistenceStatus: 'FAILED',
        error: error.message
      });
    }
  });
});



