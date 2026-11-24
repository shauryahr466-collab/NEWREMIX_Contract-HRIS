export type SystemRole =
  | 'Super Admin'
  | 'Department Head'
  | 'Supervisor'
  | 'Section Incharge'
  | 'Employee';

export type Role = SystemRole | 'Admin' | 'Editor' | 'HR';

export type ModuleKey =
  | 'dashboard'
  | 'employees'
  | 'recruitment'
  | 'onboarding'
  | 'movementAttrition'
  | 'salaryAnalysis'
  | 'devices'
  | 'import'
  | 'attendance'
  | 'auditor'
  | 'auditLogs'
  | 'overtime'
  | 'sbl'
  | 'forceAttendance'
  | 'performance'
  | 'assets'
  | 'helpdesk'
  | 'projects'
  | 'documentRequests'
  | 'payroll'
  | 'reports'
  | 'automations'
  | 'integrations'
  | 'settings'
  | 'userAccess'
  | 'admin';

export interface UserPermissions {
  modules: Record<ModuleKey, boolean>;
  canViewSalary: boolean;
  canEditAttendance: boolean;
  canSubmitSupervisorOt: boolean;
  canApproveOt: boolean;
  canApprovePayroll: boolean;
  canExportReports: boolean;
  canManageShifts: boolean;
}

export interface SystemUser {
  id: string;
  username: string;
  email: string;
  role: SystemRole;
  status: 'Active' | 'Suspended';
  assignedDepartments: string[];
  assignedSections: string[];
  linkedEmployeeId?: string;
  permissions: UserPermissions;
  notes?: string;
  createdBy?: string;
  createdAt?: string | { _seconds: number };
  updatedAt?: string;
}

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
  id: string; // Numeric Employee ID / Bio ID
  bioId?: string | number; // Biometric ID (same as numeric Employee ID)
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
  otEligibilityType?: 'Regular OT' | 'Shift OT' | 'Special OT' | 'Not Eligible';
  otEffectiveDate?: string;
  targetWorkingHours?: number; // e.g., 8
  requiredWorkingHoursPerDay?: number; // e.g., 8 or 12
  requiredWorkingHoursPerWeek?: number; // e.g., 48 or 72
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
  permanentAddress?: string;
  currentAddress?: string;
  emergencyContact?: string;
  emergencyContactNumber?: string;
  nationality?: string;
  citizenshipNumber?: string;

  // Employment Information
  section?: string;
  location?: string;
  plantLocation?: string;
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
  annualCTC?: number;
  salaryEffectiveDate?: string;
  allowances?: number;
  panNumber?: string;
  ssfNumber?: string;
  citNumber?: string;
  taxCategory?: string;
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
  remarks?: string;
  approvedBy?: string;
}

export type PayrollStatus = 'Draft' | 'Calculated' | 'Review' | 'Approved' | 'Finalized' | 'Locked' | 'Disbursed';
export type DisbursementMethod = 'Bank Transfer' | 'Cheque' | 'Cash' | 'Direct Deposit';
export type RecordDisbursementStatus = 'Pending' | 'Processing' | 'Disbursed' | 'Failed';

export interface TaxSlabDetail {
  slabName: string;
  taxableAmount: number;
  rate: number;
  taxAmount: number;
  minAmount?: number;
  maxAmount?: number;
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

export type ZkProtocolMode = 'Auto' | 'TCP' | 'UDP' | 'ADMS' | 'Web-HTTP' | 'USB-Disk';

export interface ZkDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  model: string;
  serialNumber?: string;
  deviceNumber?: number;
  commType?: 'Ethernet' | 'USB' | 'Serial' | 'WiFi';
  enabled: boolean;
  status: 'online' | 'offline';
  protocolMode?: ZkProtocolMode;
  commKey?: number;
  lastProtocolUsed?: string;
  lastConnection?: string;
  lastSync?: string;
  lastSuccessfulSync?: string;
  lastLatencyMs?: number;
  lastProbeAt?: string;
  userCount?: number;
  logCount?: number;
  autoSyncMinutes?: number; // 5, 15, 30, 60, 0 (0 = manual)
  lastError?: string;
  deviceCapacityUsers?: number;
  deviceCapacityLogs?: number;
  adminCount?: number;
  fpCount?: number;
  faceCount?: number;
  palmCount?: number;
  userFaceCount?: number;
  passwordCount?: number;
  opLogCount?: number;
  activeDirectoryUsers?: number;
  totalSystemLogs?: number;
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
  unmappedCount?: number;
  inactiveSkipped?: number;
  holidayOverlapsSkipped?: number;
  mode?: string;
  message?: string;
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

export interface HolidayMasterRecord {
  id?: string;
  date: string; // YYYY-MM-DD
  name: string;
  type?: 'National' | 'Festival' | 'Restricted' | 'Company';
  preventPunches?: boolean;
  allowWorkedPph?: boolean;
}

export type HolidayPunchPolicy = 'prevent_overlaps' | 'block_all' | 'allow_worked_pph';

export type HolidayOverlapReason =
  | 'BLOCKED_HOLIDAY_PUNCH'
  | 'HOLIDAY_DUPLICATE_OVERLAP'
  | 'HOLIDAY_CROSS_SOURCE_OVERLAP'
  | 'FORCE_ATTENDANCE_HOLIDAY_CONFLICT';

export interface HolidayOverlapConflict {
  id: string;
  employeeId: string;
  employeeName?: string;
  department?: string;
  date: string;
  holidayName: string;
  reason: HolidayOverlapReason;
  message: string;
  incomingPunchDatetime?: string;
  conflictingPunchDatetime?: string;
  source?: string;
  conflictingSource?: string;
  redundantPunchIds?: string[];
  severity: 'high' | 'medium';
}

export interface HolidayValidationReport {
  generatedAt: string;
  policy: HolidayPunchPolicy;
  totalMasterHolidays: number;
  holidaysSyncedToTable: number;
  activeEmployeesCovered: number;
  punchesOnHolidays: number;
  autoMarkedPublicHolidayDays: number;
  workedHolidayPphDays: number;
  overlapConflictsCount: number;
  statusMismatchCount: number;
  redundantPunchIdsToClean: string[];
  holidayBreakdown: Array<{
    date: string;
    name: string;
    type?: string;
    preventPunches: boolean;
    punchCount: number;
    employeeCount: number;
    publicHolidayCount: number;
    pphCount: number;
    overlapCount: number;
  }>;
  conflicts: HolidayOverlapConflict[];
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
  status: 'Present' | 'Absent' | 'Late' | 'SPF' | 'Weekly Off' | 'Public Holiday' | 'Holiday' | 'PPH' | 'Early' | 'On Time' | 'Overtime' | 'PWO' | 'Half Day' | 'Paid Leave' | 'Leave' | 'On Leave' | 'Forced' | 'On Duty' | 'Regularized';
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
  | 'No Punch Attendance'
  | 'Holiday Punch Overlap';

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

export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DEACTIVATE' 
  | 'IMPORT' 
  | 'SALARY_CHANGE' 
  | 'TRANSFER' 
  | 'PROMOTION' 
  | 'STATUS_CHANGE';

export interface AuditLog {
  id: string;
  employeeId: string;
  employeeName?: string;
  date?: string; // The date of the record being audited
  field: string; // e.g., 'firstPunch', 'lastPunch', 'shiftId', 'department', 'salary'
  oldValue: string;
  newValue: string;
  changedBy: string;
  timestamp: string; // ISO string
  changedAt?: string;
  remarks?: string;
  action?: AuditAction | string;
  reason?: string;
  user?: string;
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
  inTime?: string; // Reconciled In Time (HH:mm)
  outTime?: string; // Reconciled Out Time (HH:mm)
  type: 'Regular' | 'Holiday' | 'Weekly Off';
  status: 'Pending' | 'Approved' | 'Rejected';
  auditStatus?: 'PASS' | 'WARNING' | 'MISMATCH' | 'ERROR';
  auditReason?: string;
  approvedBy?: string;
  reviewedBy?: string;
  reviewedDate?: string;
  remarks: string;
  shiftId?: string;
  otBasis?: 'basic' | 'gross';
  otRate?: number;
  otAmount?: number;
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
  status?: string;
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
  taxType?: 'Social Security Tax' | 'Income Tax';
  cumulativeCheckpoint?: number;
  description?: string;
}

export interface TaxRuleItem {
  id: string;
  fiscalYear: string;
  taxpayerType: 'RESIDENT_INDIVIDUAL' | 'NON_RESIDENT' | 'COUPLE';
  maritalStatusApplicable: boolean;
  slabOrder: number;
  label: string;
  lowerLimit: number;
  upperLimit: number;
  rate: number;
  taxType: 'Social Security Tax' | 'Income Tax';
  cumulativeTaxCheckpoint: number;
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
  sourceReference: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeductionRuleItem {
  id: string;
  name: string;
  code: string;
  type: 'RETIREMENT_FUND' | 'INSURANCE' | 'REMOTE_AREA' | 'REBATE' | 'OTHER';
  annualLimit: number;
  monthlyLimit?: number;
  incomePercentageCap?: number; // e.g. 0.3333 for 1/3 assessable income
  eligible: boolean;
  fiscalYear: string;
  effectiveDate: string;
  active: boolean;
  description?: string;
}

export interface SalaryComponentConfig {
  id: string;
  name: string;
  code: string;
  type: 'Earning' | 'Deduction' | 'EmployerCost';
  taxable: boolean;
  ssfApplicable: boolean;
  ctcApplicable: boolean;
  description: string;
}

export interface PayrollConfigAuditLog {
  id: string;
  timestamp: string;
  user: string;
  fiscalYear: string;
  ruleVersion: string;
  changesSummary: string;
  reason?: string;
  diff?: FieldDiff[];
}

export interface PayrollConfig {
  fiscalYear: string; // "FY 2083/84"
  gregorianYear?: string; // "2026/27"
  effectiveBsYear: number; // 2083
  effectiveFrom?: string; // "2083-04-01" (Shrawan 1, 2083)
  taxpayerType?: string; // "RESIDENT_INDIVIDUAL"
  maritalStatusApplicable?: boolean; // false for unified slabs in FY 2083/84
  
  // Tax Slabs & Rules
  singleSlabs: TaxSlabConfig[];
  marriedSlabs: TaxSlabConfig[];
  taxRules?: TaxRuleItem[];
  
  // Social Security Tax & SSF
  ssfEmployeeRate: number; // 0.11 (11% of Basic)
  ssfEmployerRate: number; // 0.20 (20% of Basic)
  pfNonSsfRate: number; // 0.10 (10% for non-SSF)
  healthInsuranceRate: number; // 0 (covered under SSF)
  firstBandSstApplicable?: boolean; // true (1% SST on first 10 Lakhs)
  ssfSlab1SstWaiver: boolean; // true (100% waiver for SSF contributors)
  
  // Deductions Master Caps
  retirementFundMaxCap?: number; // 500,000
  retirementFundIncomeRatioCap?: number; // 0.33333333 (1/3 of assessable income)
  lifeInsuranceAnnualLimit?: number; // 40,000
  healthInsuranceAnnualLimit?: number; // 20,000
  privateBuildingInsuranceLimit?: number; // 10,000
  
  // Tax Rebates & Concessions
  femaleRebateEnabled?: boolean; // false or true
  femaleRebateRate?: number; // 0.10 (10%)
  disabilityFirstSlabExpansionRate?: number; // 0.50 (+50% to Slab 1 limit)
  
  // Working Hours, OT & General
  standardDaysInMonth: number; // 31 for Shrawan / standard
  overtimeMultiplier: number; // 1.5
  overtimeCalculationBasis?: 'basic' | 'gross'; // 'basic' = Basic Salary, 'gross' = Gross Salary (Basic + Allowances)
  currencySymbol: string; // "NPR"
  
  // Master Versioning & Source Reference
  ruleVersion?: string; // "1.0"
  sourceReference?: string; // "Nepal Finance Act 2083 & IRD Unified Resident Individual Guidelines"
  lastUpdated?: string;
  updatedBy?: string;
  auditLogs?: PayrollConfigAuditLog[];
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
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyRegistrationNo?: string;
  defaultWeeklyOff?: string;
  trackLateCome?: boolean;
  trackEarlyOut?: boolean;
  autoApproveDeviceLogs?: boolean;
  showNepaliDateEverywhere?: boolean;
  ipRestrictionEnabled?: boolean;
  allowedNetworkCidr?: string;
  payslipPrefix?: string;
  shifts: ShiftMaster[];
  calculationStartDate?: string; // YYYY-MM-DD
  calculationEndDate?: string; // YYYY-MM-DD
  holidays?: HolidayMasterRecord[];
  holidayPunchPolicy?: HolidayPunchPolicy;
  payrollConfig?: PayrollConfig;
  platformConfig?: PlatformIntegrationsConfig;
}

export type ActionState = 
  | 'IDLE' 
  | 'CONFIRMATION_REQUIRED' 
  | 'CONFIRMED'
  | 'PROCESSING' 
  | 'VERIFYING'
  | 'SUCCESS' 
  | 'WARNING' 
  | 'FAILED' 
  | 'CANCELLED';

export interface FieldDiff {
  field: string;
  label?: string;
  oldValue: any;
  newValue: any;
}

export interface ActionConfirmationConfig {
  title: string;
  subtitle?: string;
  actionType: 'save' | 'delete' | 'bulk_delete' | 'import' | 'purge' | 'payroll_run' | 'payroll_approve' | 'payroll_lock' | 'shift_change' | 'general';
  module: string;
  recordId?: string;
  recordName?: string;
  affectedCount?: number;
  changedFields?: FieldDiff[];
  details?: Record<string, any>;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  severity?: 'danger' | 'warning' | 'info';
  operationId?: string;
  autoCloseDelayMs?: number;
  onConfirm?: () => Promise<any>;
}

export interface ActionStatusResult {
  success: boolean;
  verified: boolean;
  verificationStatus: 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';
  transaction: 'COMMITTED' | 'ROLLED_BACK' | 'N/A';
  dbPath: string;
  affectedCount: number;
  module: string;
  recordId?: string;
  recordName?: string;
  changedFieldsCount?: number;
  timestamp: string;
  error?: string;
  errorRefId?: string;
  operationId?: string;
  breakdown?: Record<string, any>;
}

// =====================================================
// Horilla Core HR & Platform Domain Models
// =====================================================

export interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  employmentType: 'Full-Time' | 'Contract' | 'Part-Time' | 'Intern';
  vacancies: number;
  salaryRange?: string;
  closingDate?: string;
  status: 'Open' | 'On Hold' | 'Closed';
  description?: string;
  createdAt: string;
}

export type CandidateStage = 'Applied' | 'Screening' | 'Interview' | 'Offer' | 'Hired' | 'Rejected';

export interface CandidateApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  experienceYears: number;
  expectedSalary?: string;
  source?: string;
  stage: CandidateStage;
  interviewDate?: string;
  meetLink?: string;
  notes?: string;
  hiredEmployeeId?: string;
  appliedAt: string;
}

export interface LifecycleChecklistItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  workflowType: 'Onboarding' | 'Offboarding';
  title: string;
  ownerRole: 'HR' | 'IT' | 'Admin' | 'Manager' | 'Payroll';
  dueDate?: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  notes?: string;
  completedAt?: string;
  createdAt: string;
}

export interface PerformanceGoal {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  title: string;
  metricTarget: string;
  cycle: string; // e.g., "FY 2083/84 Q2"
  dueDate: string;
  progressPct: number;
  selfRating?: number;
  managerRating?: number;
  feedback?: string;
  status: 'Not Started' | 'On Track' | 'At Risk' | 'Completed';
  updatedAt: string;
}

export interface CompanyAsset {
  id: string;
  assetTag: string;
  name: string;
  category: 'Laptop' | 'Desktop' | 'Mobile' | 'Access Card' | 'Uniform & PPE' | 'Vehicle' | 'Tool / Equipment' | 'Other';
  serialNumber: string;
  purchaseDate?: string;
  purchaseCost?: number;
  condition: 'New' | 'Good' | 'Fair' | 'Needs Repair' | 'Retired';
  status: 'Available' | 'Assigned' | 'Under Maintenance' | 'Retired';
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  assignedDate?: string;
  notes?: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  author: string;
  message: string;
  timestamp: string;
}

export interface HelpdeskTicket {
  id: string;
  ticketNumber: string;
  employeeId?: string;
  requesterName: string;
  department?: string;
  category: 'Payroll' | 'Attendance' | 'Leave' | 'IT & Biometrics' | 'Documents' | 'Workplace';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  subject: string;
  description: string;
  assignedTo?: string;
  comments: TicketComment[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  assigneeId?: string;
  assigneeName?: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'To Do' | 'In Progress' | 'Done';
  dueDate?: string;
}

export interface ProjectRecord {
  id: string;
  code: string;
  name: string;
  department: string;
  managerName: string;
  startDate: string;
  endDate?: string;
  status: 'Planning' | 'Active' | 'On Hold' | 'Completed';
  budget?: number;
  tasks: ProjectTask[];
  createdAt: string;
}

export interface TimesheetEntry {
  id: string;
  projectId: string;
  projectName: string;
  taskTitle: string;
  employeeId: string;
  employeeName: string;
  date: string;
  hours: number;
  billable: boolean;
  notes?: string;
  status: 'Submitted' | 'Approved';
  createdAt: string;
}

export interface DocumentRequestRecord {
  id: string;
  requestNumber: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation?: string;
  documentType:
    | 'Experience Certificate'
    | 'Salary Certificate'
    | 'Employment Verification / NOC'
    | 'Tax Clearance Summary'
    | 'ID Card Reissue'
    | 'Bank / PAN Letter';
  purpose: string;
  status: 'Pending' | 'Processing' | 'Approved' | 'Rejected';
  reviewedBy?: string;
  remarks?: string;
  requestedAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: 'Recruitment' | 'Attendance' | 'Leave' | 'Payroll' | 'Asset' | 'Helpdesk' | 'Document' | 'System';
  severity: 'info' | 'success' | 'warning';
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface AutomationRule {
  id: string;
  eventKey: string;
  label: string;
  description: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  recipients: string;
}

export interface ApiTokenRecord {
  id: string;
  name: string;
  prefix: string;
  scope: 'Read-Only' | 'Mobile Check-In' | 'Full Admin';
  createdAt: string;
  lastUsedAt?: string;
  active: boolean;
}

export interface PlatformIntegrationsConfig {
  ldapEnabled?: boolean;
  ldapHost?: string;
  ldapPort?: number;
  ldapBaseDn?: string;
  ldapBindUser?: string;
  smtpEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpFromEmail?: string;
  whatsappEnabled?: boolean;
  whatsappBusinessNumber?: string;
  googleMeetDefaultRoom?: string;
  googleDriveBackupFolderUrl?: string;
  scheduledReportEnabled?: boolean;
  scheduledReportEmail?: string;
  scheduledReportFrequency?: 'Daily' | 'Weekly' | 'Monthly';
  automationRules?: AutomationRule[];
  apiTokens?: ApiTokenRecord[];
}

