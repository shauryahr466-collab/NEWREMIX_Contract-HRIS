export interface FieldAttendanceRecord {
  id: string; // e.g. "field_EMP001_2026-08-01"
  employeeId: string;
  employeeName: string;
  department?: string;
  date: string; // YYYY-MM-DD
  fieldStatus: string; // "Present", "Absent", "Half Day", "Leave", "Official Duty", etc.
  shift?: string;
  inTime?: string;
  outTime?: string;
  remarks?: string;
  supervisor?: string;
  approvalStatus?: string;
  importedAt?: string;
}

export type AuditResultCategory =
  | 'VALID - BIO MATCH'
  | 'VALID - APPROVED NON-BIO'
  | 'INVALID - FIELD NOT SUPPORTED'
  | 'REVIEW - FIELD MISSING'
  | 'REVIEW - BIO MISSING'
  | 'REVIEW - MISS PUNCH'
  | 'REVIEW - STATUS MISMATCH'
  | 'REVIEW - MASTER DATA MISMATCH'
  | 'REVIEW - DUPLICATE'
  | 'WEEKLY OFF / HOLIDAY EXCEPTION';

export type AuditGroupType = 'VALID' | 'INVALID' | 'REVIEW REQUIRED' | 'NOT APPLICABLE';

export interface AuditRecordComparison {
  id: string; // employeeId_date
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  date: string; // YYYY-MM-DD
  bsDate: string; // YYYY-MM-DD in B.S.
  shiftName: string;
  
  fieldStatus: string | null;
  fieldInTime?: string;
  fieldOutTime?: string;
  fieldRemarks?: string;
  
  bioStatus: string | null;
  bioInTime?: string;
  bioOutTime?: string;
  bioRawLogsCount: number;
  
  dayName?: string;
  weeklyOffDay?: string;
  shiftDetails?: string;
  expectedHours?: number;
  workingHours?: number;
  lateMinutes?: number;
  earlyMinutes?: number;
  rawPunchesStr?: string;
  compiledPunchesStr?: string;
  
  isWeeklyOff: boolean;
  isPublicHoliday: boolean;
  
  auditResult: AuditResultCategory;
  auditGroup: AuditGroupType;
  issueReason: string;
  
  decision: 'Pending' | 'Accepted' | 'Rejected';
  hrRemarks?: string;
  auditedBy?: string;
  auditedAt?: string;
}

export interface AuditActionLog {
  id: string;
  recordId: string;
  employeeId: string;
  date: string;
  auditResult: AuditResultCategory;
  decision: 'Accepted' | 'Rejected';
  hrRemarks: string;
  auditedBy: string;
  timestamp: string;
}
