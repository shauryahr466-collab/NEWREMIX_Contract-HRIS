export type Role = 'Admin' | 'Editor' | 'HR' | 'Supervisor';

export interface User {
  id: string;
  username: string;
  role: Role;
}

export interface ShiftMaster {
  id: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isNightShift: boolean;
  graceTime?: number; // minutes
  lateThreshold?: number; // minutes
}

export interface Employee {
  id: string; // Employee ID
  name: string;
  department: string;
  designation: string;
  shiftId?: string; // Reference to ShiftMaster
  joiningDate: string;
  status: 'Active' | 'Inactive';
  contractorName?: string;
  contactNumber?: string;
  weeklyOff?: string; // e.g., "Sunday"
  otEligible?: boolean;
  targetWorkingHours?: number; // e.g., 8
  profilePicture?: string;
  accommodation?: string;
  email?: string;
  phone?: string;
  aadharNumber?: string;
  // Payroll & Salary extensions
  basicSalary?: number;
  allowances?: number;
  panNumber?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  taxExemptionLimit?: number;
  maritalStatus?: 'Single' | 'Married';
  ssfEnrolled?: boolean;
}

export type PayrollStatus = 'Draft' | 'Calculated' | 'Approved' | 'Disbursed';
export type DisbursementMethod = 'Bank Transfer' | 'Cheque' | 'Cash' | 'Direct Deposit';
export type RecordDisbursementStatus = 'Pending' | 'Processing' | 'Disbursed' | 'Failed';

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  panNumber?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  maritalStatus?: 'Single' | 'Married';
  ssfEnrolled?: boolean;
  
  // Attendance & Time metrics
  totalDaysInMonth: number;
  presentDays: number;
  absentDays: number;
  paidLeaveDays: number;
  payableDays: number;
  overtimeHours: number;
  
  // Pay breakdown
  monthlyBasicSalary: number;
  monthlyAllowances: number;
  earnedBasicSalary: number;
  earnedAllowances: number;
  overtimeRate: number; // rate per hour
  overtimePay: number;
  bonus: number;
  grossSalary: number;
  
  // Statutory & Tax deductions
  taxableIncome: number;
  incomeTaxTDS: number; // Income tax / TDS
  socialSecurity: number; // SSF / PF employee contribution
  healthInsurance: number;
  otherDeductions: number;
  totalDeductions: number;
  
  // Net salary
  netSalary: number;
  
  // Disbursement metadata
  disbursementStatus: RecordDisbursementStatus;
  disbursementMethod?: DisbursementMethod;
  transactionRef?: string;
  disbursedAt?: string;
  remarks?: string;
}

export interface PayrollRun {
  id: string;
  month: string; // YYYY-MM
  year: number;
  monthName: string; // e.g. "August 2026"
  nepaliMonth?: string; // e.g. "Shrawan (श्रावण)"
  fiscalYear?: string; // e.g. "FY 2083/84"
  status: PayrollStatus;
  
  totalEmployees: number;
  totalGrossSalary: number;
  totalTaxTDS: number;
  totalSocialSecurity: number;
  totalDeductions: number;
  totalNetSalary: number;
  
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: string;
  disbursedAt?: string;
  disbursedBy?: string;
  disbursementMethod?: DisbursementMethod;
  
  records: PayrollRecord[];
}

export interface RawPunch {
  id: string;
  employeeId: string; // Maps to Employee.id
  punchDatetime: string; // ISO string
  deviceId?: string;
  location?: string;
  importFormat?: 'standard' | 'multi-time';
  importId?: string;
  importDate?: string;
  fileName?: string;
  // ZKTeco integration metadata
  source?: 'ZKTeco' | 'Manual' | 'FileImport';
  deviceName?: string;
  deviceIP?: string;
  deviceUserId?: string;
  syncTime?: string;
  transactionId?: string;
}

export interface ZkDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  model: string;
  serialNumber?: string;
  deviceNumber?: number;
  enabled: boolean;
  status: 'online' | 'offline';
  lastConnection?: string;
  lastSync?: string;
  userCount?: number;
  logCount?: number;
  autoSyncMinutes?: number; // 5, 15, 30, 60, 0 (0 = manual)
  createdAt?: string;
}

export interface ZkUserMapping {
  id: string;
  deviceId?: string; // Optional (if mapped globally or per device)
  deviceUserId: string; // Biometric User ID e.g. "121"
  employeeId: string; // HRIS Employee ID e.g. "EMP001"
  employeeName?: string;
  department?: string;
  mappedAt: string;
  mappedBy?: string;
}

export interface ZkSyncLog {
  id: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  status: 'Success' | 'Failed' | 'Partial';
  recordsRead: number;
  newRecords: number;
  duplicates: number;
  errors: number;
  durationMs: number;
  errorMessage?: string;
}

export interface ZkUnmappedPunch {
  id: string;
  transactionId: string;
  deviceId: string;
  deviceName: string;
  deviceIP: string;
  deviceUserId: string;
  punchDateTime: string;
  syncTime: string;
  status: 'pending' | 'resolved' | 'ignored';
}

export interface ProcessedAttendance {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD logical date
  firstPunch: string | null; // ISO string
  lastPunch: string | null; // ISO string
  workingHours: number; // in hours
  overtime: number; // in hours
  shiftId?: string; // Assigned or default shift ID
  expectedHours?: number; // Duration of the shift in hours
  status: 'Present' | 'Absent' | 'Late' | 'SPF' | 'Weekly Off' | 'Early' | 'On Time' | 'Overtime' | 'PWO'; // SPF = Single Punch Found, PWO = Present on Weekly Off
  lateMinutes: number;
  earlyMinutes: number;
  logs: string[]; // Array of ISO strings (filtered punches)
  rawLogs: string[]; // Array of ISO strings (unfiltered punches)
}

export interface ShiftAssignment {
  employeeId: string;
  date: string; // YYYY-MM-DD
  shiftId: string;
}

export type ExceptionType = 
  | 'SPF' 
  | 'Missing In' 
  | 'Missing Out' 
  | 'Duplicate Punch' 
  | 'Shift Mismatch' 
  | 'Short Hours' 
  | 'Long Hours' 
  | 'Punch Outside Shift'
  | 'No Punch Attendance';

export interface AttendanceException {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  type: ExceptionType;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'pending' | 'resolved' | 'ignored';
  resolvedBy?: string;
  resolvedAt?: string;
  remarks?: string;
}

export interface AuditLog {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // The date of the record being audited
  field: string; // e.g., 'firstPunch', 'lastPunch', 'shiftId'
  oldValue: string;
  newValue: string;
  changedBy: string;
  timestamp: string; // ISO string
  remarks: string;
}

export interface OvertimeRecord {
  id: string;
  employeeId: string;
  date: string;
  hours: number; // This will be the Final OT Eligible
  bioOtHours: number;
  supervisorOtHours: number;
  hrSaving: number;
  standardDutyHours: number;
  otStartTime?: string; // HH:mm
  otEndTime?: string; // HH:mm
  type: 'Regular' | 'Holiday' | 'Weekly Off';
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  reviewedBy?: string;
  reviewedDate?: string;
  remarks: string;
  shiftId?: string;
}

export interface SBLRecord {
  id: string;
  employeeId: string;
  date: string;
  leaveType: 'SBL' | 'Short Break';
  duration: string; // e.g., "2 hours"
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Final Confirmed' | 'Not Approved';
  approvedBy?: string;
}

export interface ForceAttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  inTime: string; // HH:mm
  outTime: string; // HH:mm
  reason: string;
  approvedBy: string;
  remarks: string;
  timestamp: string;
}

export interface AssignmentLog {
  id: string;
  employeeId: string;
  date: string;
  shiftId: string;
  shiftName: string;
  timestamp: string;
  action: 'Assigned' | 'Updated' | 'Removed';
}

export interface TaxSlabConfig {
  id: string;
  label: string;
  limitSingle: number;
  limitMarried: number;
  rate: number;
}

export interface PayrollConfig {
  fiscalYear: string;
  effectiveBsYear: number;
  singleSlabs: TaxSlabConfig[];
  marriedSlabs: TaxSlabConfig[];
  ssfEmployeeRate: number;
  ssfEmployerRate: number;
  pfNonSsfRate: number;
  healthInsuranceRate: number;
  ssfSlab1SstWaiver: boolean;
  standardDaysInMonth: number;
  overtimeMultiplier: number;
  currencySymbol: string;
}

export interface Settings {
  duplicateMergeTime: number; // minutes, default 5
  shiftStartTime: string; // "09:00"
  shiftEndTime: string; // "18:00"
  graceTime: number; // minutes, default 15
  lateThreshold: number; // minutes, default 30
  overtimeThreshold: number; // working hours after which OT starts
  companyName: string;
  reportTitle: string;
  shifts: ShiftMaster[];
  calculationStartDate?: string; // YYYY-MM-DD
  calculationEndDate?: string; // YYYY-MM-DD
  holidays?: { date: string; name: string }[];
  payrollConfig?: PayrollConfig;
}
