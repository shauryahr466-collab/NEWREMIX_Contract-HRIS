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


export interface EmployeeTaxProfile {
  taxpayerType: 'Resident' | 'Non-Resident';
  femaleRebateEligible: boolean;
  disabilityStatus: boolean;
  incomeFromPension: boolean;
  retirementFundContributor: boolean;
  lifeInsurancePremium: number; // Actual premium paid
  healthInsurancePremium: number; // Actual premium paid
  privateBuildingInsurance: number; // Actual premium paid
  educationFee: number; // Eligible education fee
  remoteAreaCategory?: 'A' | 'B' | 'C' | 'D' | 'E' | 'None';
  approvedMedicalExpense: number; // Actual approved medical expense
  previousEmployerIncome: number;
  previousEmployerTDS: number;
  otherEligibleDeductions: number;
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
  // Personal Information
  gender?: 'Male' | 'Female' | 'Other';
  dobBS?: string;
  dobAD?: string;
  address?: string;
  emergencyContact?: string;

  // Employment Information
  section?: string;
  location?: string;
  employmentType?: 'Permanent' | 'Contract' | 'Probation' | 'Temporary';
  grade?: string;
  level?: string;
  reportingManager?: string;

  // Payroll & Salary extensions
  basicSalary?: number;
  dearnessAllowance?: number;
  otherAllowance?: number;
  grossSalary?: number;
  employeeSSF?: number;
  employerSSF?: number;
  monthlyCTC?: number;
  allowances?: number;
  panNumber?: string;
  ssfNumber?: string;
  citNumber?: string;
  bankName?: string;
  accountNumber?: string;
  branchName?: string;
  ifscCode?: string;
  paymentMethod?: 'Bank Transfer' | 'Cheque' | 'Cash';
  taxExemptionLimit?: number;
  maritalStatus?: 'Single' | 'Married';
  ssfEnrolled?: boolean;
  taxProfile?: EmployeeTaxProfile;
  companyType?: 'SCIL' | 'ISTS';

  // Complete HR Master Data Fields
  nationality?: string;
  citizenshipNumber?: string;
  currentAddress?: string;
  taxCategory?: string;

  // Exit & Movement Information
  statusEffectiveDate?: string;
  separationDate?: string;
  exitType?: 'Voluntary' | 'Involuntary' | 'Retirement' | 'Contract End' | 'Other';
  exitReason?: string;
  resignationDate?: string;
  noticePeriod?: string;
  lastWorkingDate?: string;
  transferDate?: string;
  previousDepartment?: string;
  previousSection?: string;
  previousDesignation?: string;
  previousGrade?: string;
  newDepartment?: string;
  newSection?: string;
  newDesignation?: string;
  newGrade?: string;
}

export type MovementType = 
  | 'New Joiner'
  | 'Promotion'
  | 'Transfer'
  | 'Department Change'
  | 'Section Change'
  | 'Designation Change'
  | 'Grade Change'
  | 'Salary Change'
  | 'Shift Change'
  | 'Location Change'
  | 'Resignation'
  | 'Termination'
  | 'Retirement'
  | 'Contract End'
  | 'Other Separation'
  | 'Demotion'
  | 'Status Change';

export interface EmployeeMovement {
  id: string;
  employeeId: string; // Numeric Bio ID / Employee ID
  effectiveDate: string; // YYYY-MM-DD
  movementType: MovementType;
  previousValue?: string;
  newValue?: string;
  previousDepartment?: string;
  newDepartment?: string;
  previousSection?: string;
  newSection?: string;
  previousDesignation?: string;
  newDesignation?: string;
  previousGrade?: string;
  newGrade?: string;
  previousSalary?: number;
  newSalary?: number;
  reason?: string;
  changedBy?: string;
  changedAt?: string;
  exitType?: 'Voluntary' | 'Involuntary' | 'Retirement' | 'Contract End' | 'Other';
  exitReason?: string;
  noticePeriod?: string;
  lastWorkingDate?: string;
  resignationDate?: string;
}

export type PayrollStatus = 'Draft' | 'Calculated' | 'Review' | 'Approved' | 'Finalized' | 'Locked' | 'Disbursed';
export type DisbursementMethod = 'Bank Transfer' | 'Cheque' | 'Cash' | 'Direct Deposit';
export type RecordDisbursementStatus = 'Pending' | 'Processing' | 'Disbursed' | 'Failed';

export interface TaxSlabDetail {
  slabName: string;
  taxableAmount: number;
  rate: number;
  taxAmount: number;
}

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
  taxStatus?: 'Single' | 'Married';
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
  
  // Statutory & Employer contributions
  employerSSF?: number;
  monthlyCTC?: number;

  // Statutory & Tax deductions
  taxableIncome: number;
  annualizedTaxableIncome?: number;
  annualTaxLiability?: number;
  taxSlabBreakdown?: TaxSlabDetail[];
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
  startDate?: string;
  endDate?: string;
  status: PayrollStatus;
  
  totalEmployees: number;
  totalGrossSalary: number;
  totalTaxTDS: number;
  totalSocialSecurity: number;
  totalDeductions: number;
  totalNetSalary: number;
  totalEmployerSSF?: number;
  totalCTC?: number;
  
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
  status: 'Present' | 'Absent' | 'Late' | 'SPF' | 'Weekly Off' | 'Early' | 'On Time' | 'Overtime' | 'PWO' | 'Half Day' | 'Paid Leave' | 'Leave' | 'On Leave' | 'Forced' | 'On Duty' | 'Regularized';
  employeeName?: string;
  department?: string;
  inTime?: string;
  outTime?: string;
  workHours?: number;
  remarks?: string;
  shiftSource?: 'Manual Override' | 'Approved Roster' | 'Imported Roster' | 'Employee Default' | 'Auto Detected';
  shiftCode?: string;
  shiftName?: string;
  lateMinutes: number;
  earlyMinutes: number;
  logs: string[]; // Array of ISO strings (filtered punches)
  rawLogs: string[]; // Array of ISO strings (unfiltered punches)
}

export type ShiftSource = 'Manual Override' | 'Approved Roster' | 'Imported Roster' | 'Employee Default' | 'Auto Detected';

export interface ShiftAssignment {
  id?: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  shiftId: string;
  shiftCode?: string;
  source?: ShiftSource;
  rosterBatchId?: string;
  status?: string;
  changedBy?: string;
  changedAt?: string;
  reason?: string;
}

export interface RosterBatch {
  id: string;
  rosterName: string;
  periodStart: string;
  periodEnd: string;
  totalDays: number;
  importedAt: string;
  importedBy?: string;
  sourceFileName?: string;
  status: 'Active' | 'Archived' | 'Draft';
  createdAt: string;
  updatedAt: string;
}

export interface RosterAssignment {
  id: string;
  rosterBatchId: string;
  employeeId: string;
  rosterDate: string;
  shiftCode: string;
  shiftStart?: string;
  shiftEnd?: string;
  source: ShiftSource;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftAuditLog {
  id: string;
  employeeId: string;
  date: string;
  oldShift?: string;
  newShift: string;
  changedBy: string;
  changedAt: string;
  reason?: string;
  source: ShiftSource;
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
  leaveType: 'SBL' | 'Short Break' | 'PWO' | 'Comp Leave';
  duration: string; // e.g., "Full Day" | "Half Day" | "2 hours"
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Final Confirmed' | 'Not Approved';
  approvedBy?: string;
  workingHours?: number;
  source?: string;
  inTime?: string;
  outTime?: string;
  dayName?: string;
  weeklyOffName?: string;
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
