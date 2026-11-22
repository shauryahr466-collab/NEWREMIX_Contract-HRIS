import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Employee, RawPunch, ProcessedAttendance, Settings, ShiftAssignment, AssignmentLog, AttendanceException, AuditLog, OvertimeRecord, SBLRecord, ForceAttendanceRecord, PayrollRun, PayrollRecord, DisbursementMethod, ZkDevice, ZkUserMapping, ZkSyncLog, ZkUnmappedPunch, EmployeeMovement, SystemUser, ModuleKey } from '../types';
import type { FieldAttendanceRecord } from '../types/attendanceAudit';
import { processPunches, detectExceptions } from '../lib/engine';
import { generatePayrollRun, calculateTaxAndDeductions, DEFAULT_PAYROLL_CONFIG } from '../lib/payrollEngine';
import { db, auth } from '../lib/firebase';
import { logAdminOverride, normalizeAuditLog } from '../lib/audit';
import { normalizeEmployeeId } from '../lib/utils';
import { isEmployeeInUserScope, normalizeSystemUser } from '../lib/accessControl';
import { saveLocalTable, saveLocalTableDetailed, fetchLocalTable, fetchLocalBootstrap, deleteLocalTableRecords, deleteLocalTableDetailed, purgeLocalTable } from '../lib/localClient';
import { authFetch, clearInMemorySession, registerUnauthorizedHandler } from '../lib/authSession';
import { buildHolidayMasterMap, validatePunchesAgainstHolidays, validateForceAttendanceAgainstHolidays } from '../lib/holidayValidation';
import { toast } from 'sonner';
// Local SQLite-only no-op shims replacing firebase/firestore so zero gRPC Listen/Write streams are opened
const collection = (_db: any, path: string) => ({ path });
const doc = (_db: any, path: string, id?: string) => ({ path: id ? `${path}/${id}` : path, id: id || path });
const query = (ref: any, ..._args: any[]) => ref;
const limit = (_n: number) => ({});
const orderBy = (_f: string, _d?: string) => ({});
const where = (_f: string, _op: string, _v: any) => ({});
const onSnapshot = (_ref: any, _onNext?: any, _onError?: any) => () => {};
const setDoc = async (_ref: any, _data: any, _opts?: any) => {};
const getDoc = async (_ref: any) => ({ exists: () => false, data: () => ({} as any) });
const deleteDoc = async (_ref: any) => {};
const getDocs = async (_ref: any) => ({ empty: true, docs: [] as any[], forEach: (_cb: any) => {} });
const writeBatch = (_db: any) => ({
  set: (_r: any, _d: any, _o?: any) => {},
  update: (_r: any, _d: any) => {},
  delete: (_r: any) => {},
  commit: async () => {}
});

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

interface StoreState {
  employees: Employee[];
  punches: RawPunch[];
  settings: Settings;
  shiftAssignments: ShiftAssignment[];
  assignmentLogs: AssignmentLog[];
  exceptions: AttendanceException[];
  auditLogs: AuditLog[];
  overtimeRecords: OvertimeRecord[];
  sblRecords: SBLRecord[];
  forceAttendanceRecords: ForceAttendanceRecord[];
  payrollRuns: PayrollRun[];
  movements: EmployeeMovement[];
  zkDevices: ZkDevice[];
  zkUserMappings: ZkUserMapping[];
  zkSyncLogs: ZkSyncLog[];
  zkUnmappedPunches: ZkUnmappedPunch[];
  calculationSource: 'all' | 'standard' | 'multi-time';
  processedData: ProcessedAttendance[];
  isInitializing: boolean;
  user: any;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  currentUserProfile: SystemUser | null;
  previewUserProfile: SystemUser | null;
  effectiveUserProfile: SystemUser | null;
  selectedEmployeeId: string | null;
  lastError: string | null;
  quotaExceeded: boolean;
  theme: 'light' | 'dark';
  globalSearchTerm: string;
  isOtpVerified: boolean;
  
  // Actions
  setUser: (user: any) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setCurrentUserProfile: (profile: SystemUser | null) => void;
  setPreviewUserProfile: (profile: SystemUser | null) => void;
  canAccessModule: (moduleKey: ModuleKey) => boolean;
  refreshCurrentUserProfile: (emailOverride?: string) => Promise<void>;
  setIsOtpVerified: (isVerified: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setGlobalSearchTerm: (term: string) => void;
  openEmployeeProfile: (id: string) => void;
  closeEmployeeProfile: () => void;
  setEmployees: (data: Employee[]) => Promise<void>;
  updateEmployee: (id: string, data: Partial<Employee>) => Promise<void>;
  addEmployee: (data: Employee) => Promise<void>;
  deleteEmployeesBatch: (ids: string[]) => Promise<void>;
  
  setPunches: (data: RawPunch[], onProgress?: (msg: string) => void) => Promise<void>;
  addPunch: (punch: Omit<RawPunch, 'id'>) => Promise<void>;
  updatePunch: (id: string, punch: Partial<RawPunch>) => Promise<void>;
  deletePunch: (id: string) => Promise<void>;
  deletePunchBatch: (importId: string) => Promise<void>;
  deletePunchesBatch: (ids: string[]) => Promise<void>;
  clearPunches: (onProgress?: (msg: string) => void) => Promise<void>;
  fetchPunches: () => Promise<void>;
  refreshPunchesFromSqlite: (showToast?: boolean) => Promise<number>;
  
  setSettings: (data: Settings) => Promise<void>;
  setShiftAssignments: (data: ShiftAssignment[]) => Promise<void>;
  addAssignmentLog: (employeeId: string, date: string, shiftId: string, action: AssignmentLog['action']) => Promise<void>;
  
  addAuditLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => Promise<void>;
  updateException: (id: string, data: Partial<AttendanceException>) => Promise<void>;
  setExceptionsBatch: (data: AttendanceException[]) => Promise<void>;

  // OT, SBL, Force Attendance & Payroll
  updateOvertime: (id: string, data: Partial<OvertimeRecord>) => Promise<void>;
  addOvertime: (data: Omit<OvertimeRecord, 'id'>) => Promise<void>;
  setOvertimeBatch: (records: OvertimeRecord[]) => Promise<void>;
  deleteOvertimeBatch: (ids: string[]) => Promise<void>;
  updateSBL: (id: string, data: Partial<SBLRecord>) => Promise<void>;
  addSBL: (data: Omit<SBLRecord, 'id'>) => Promise<void>;
  setSBLBatch: (records: SBLRecord[]) => Promise<void>;
  deleteSBLBatch: (ids: string[]) => Promise<void>;
  deleteOvertime: (id: string) => Promise<void>;
  deleteSBL: (id: string) => Promise<void>;
  addForceAttendance: (data: Omit<ForceAttendanceRecord, 'id' | 'timestamp'>) => Promise<void>;

  // Payroll Actions
  createPayrollRun: (month: string, bsMonthDetails?: { bsYear: number; monthObj: any }, customDateRange?: { startDate?: string; endDate?: string }) => Promise<PayrollRun>;
  recalculatePayrollRun: (runId: string) => Promise<PayrollRun | null>;
  updatePayrollRecord: (runId: string, recordId: string, updates: Partial<PayrollRecord>) => Promise<void>;
  approvePayrollRun: (runId: string) => Promise<void>;
  disbursePayrollRun: (runId: string, method: DisbursementMethod) => Promise<void>;
  deletePayrollRun: (runId: string) => Promise<void>;

  // Movement Actions
  addMovement: (data: Omit<EmployeeMovement, 'id'>) => Promise<void>;
  recordSeparation: (data: {
    employeeId: string;
    effectiveDate: string;
    separationType: string;
    exitType?: string;
    reason: string;
    exitReason?: string;
    noticePeriod?: string;
    lastWorkingDate?: string;
    resignationDate?: string;
    remarks?: string;
    approvedBy?: string;
  }) => Promise<{ success: boolean; verified: boolean; movement: EmployeeMovement; employee: Employee }>;
  recordGeneralMovement: (data: {
    employeeId: string;
    effectiveDate: string;
    movementType: string;
    previousDepartment?: string;
    newDepartment?: string;
    previousDesignation?: string;
    newDesignation?: string;
    previousSection?: string;
    newSection?: string;
    previousGrade?: string;
    newGrade?: string;
    previousSalary?: number;
    newSalary?: number;
    newShiftId?: string;
    reason?: string;
    changedBy?: string;
  }) => Promise<{ success: boolean; verified: boolean; movement: EmployeeMovement; employee: Employee }>;
  updateMovement: (id: string, data: Partial<EmployeeMovement>) => Promise<void>;
  deleteMovement: (id: string) => Promise<void>;
  setMovementsBatch: (movements: EmployeeMovement[]) => Promise<void>;

  // ZKTeco Device Actions
  addZkDevice: (device: Omit<ZkDevice, 'id'>) => Promise<void>;
  updateZkDevice: (id: string, updates: Partial<ZkDevice>) => Promise<void>;
  deleteZkDevice: (id: string) => Promise<void>;
  mapZkUser: (mapping: Omit<ZkUserMapping, 'id' | 'mappedAt'>) => Promise<void>;
  unmapZkUser: (id: string) => Promise<void>;
  syncZkDevice: (deviceId: string) => Promise<{ success: boolean; recordsRead: number; newRecords: number; duplicates: number }>;
  syncAllZkDevices: () => Promise<{ success: boolean; devicesPolled: number; totalNew: number; totalRead: number; reachableDevices: number }>;
  reconcileSystemZkData: () => Promise<{ success: boolean; mappingsCreated: number; unmappedResolved: number; punchesAdded: number }>;
  resolveUnmappedPunches: (deviceUserId: string, employeeId: string) => Promise<void>;
  clearZkSyncLogs: () => Promise<void>;
  refreshZkTablesFromSqlite: () => Promise<any>;

  // Field Attendance Audit State
  fieldRecords: FieldAttendanceRecord[];
  fieldMusterFileName: string;
  fieldImportType: 'matrix' | 'flat' | 'sample';
  auditDecisions: Record<string, {
    decision: 'Accepted' | 'Rejected';
    remarks: string;
    auditedBy: string;
    auditedAt: string;
    overrideStatus?: string;
  }>;
  auditDateRange: { startDate: string; endDate: string };
  setFieldRecords: (records: FieldAttendanceRecord[], fileName?: string, importType?: 'matrix' | 'flat' | 'sample') => Promise<void>;
  saveAuditDecision: (key: string, decision: {
    decision: 'Accepted' | 'Rejected';
    remarks: string;
    auditedBy: string;
    auditedAt: string;
    overrideStatus?: string;
  }) => Promise<void>;
  saveAuditDecisionsBatch: (decisionsMap: Record<string, any>) => Promise<void>;
  clearFieldMusterData: () => Promise<void>;
  setAuditDateRange: (range: { startDate: string; endDate: string }) => void;

  setCalculationSource: (source: 'all' | 'standard' | 'multi-time') => void;
  recalculate: () => Promise<void>;
  clearAllData: (onProgress?: (msg: string) => void) => Promise<void>;
  resetError: () => void;
  reportError: (error: unknown, operationType?: OperationType, path?: string | null) => void;
}

const StoreContext = createContext<StoreState | undefined>(undefined);

const defaultSettings: Settings = {
  duplicateMergeTime: 5,
  shiftStartTime: "09:00",
  shiftEndTime: "18:00",
  graceTime: 15,
  lateThreshold: 30,
  overtimeThreshold: 8,
  companyName: "Contractor HRIS",
  reportTitle: "Contractor Attendance Report",
  shifts: [
    { id: 'shift-1', name: 'Day Shift', startTime: '09:00', endTime: '18:00', isNightShift: false },
    { id: 'shift-2', name: 'Night', startTime: '22:00', endTime: '06:00', isNightShift: true },
  ],
  holidayPunchPolicy: 'prevent_overlaps',
  payrollConfig: DEFAULT_PAYROLL_CONFIG
};

function loadCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`hris_cache_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) ? parsed.length > 0 : parsed && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // ignore
  }
  return fallback;
}

function saveCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(`hris_cache_${key}`, JSON.stringify(data));
  } catch (e) {
    // ignore
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployeesState] = useState<Employee[]>(() => loadCache('employees', []));
  const [punches, setPunchesState] = useState<RawPunch[]>([]);
  const lastPunchDigestRef = React.useRef<string>('');
  const [settings, setSettingsState] = useState<Settings>(() => loadCache('settings', defaultSettings));
  const [shiftAssignments, setShiftAssignmentsState] = useState<ShiftAssignment[]>(() => loadCache('shift_assignments', []));
  const [assignmentLogs, setAssignmentLogsState] = useState<AssignmentLog[]>(() => loadCache('assignment_logs', []));
  const [exceptions, setExceptionsState] = useState<AttendanceException[]>(() => loadCache('exceptions', []));
  const [auditLogs, setAuditLogsState] = useState<AuditLog[]>(() =>
    loadCache<any[]>('audit_logs', []).map(normalizeAuditLog)
  );
  const [overtimeRecords, setOvertimeRecordsState] = useState<OvertimeRecord[]>(() => loadCache('overtime', []));
  const [sblRecords, setSblRecordsState] = useState<SBLRecord[]>(() => loadCache('sbl', []));
  const [forceAttendanceRecords, setForceAttendanceRecordsState] = useState<ForceAttendanceRecord[]>(() => loadCache('force_attendance', []));
  const [payrollRuns, setPayrollRunsState] = useState<PayrollRun[]>(() => loadCache('payroll_runs', []));
  const [movements, setMovementsState] = useState<EmployeeMovement[]>(() => loadCache('movements', []));
  const [zkDevices, setZkDevicesState] = useState<ZkDevice[]>(() => loadCache('zk_devices', []));
  const [zkUserMappings, setZkUserMappingsState] = useState<ZkUserMapping[]>(() => loadCache('zk_user_mappings', []));
  const [zkSyncLogs, setZkSyncLogsState] = useState<ZkSyncLog[]>(() => loadCache('zk_sync_logs', []));
  const [zkUnmappedPunches, setZkUnmappedPunchesState] = useState<ZkUnmappedPunch[]>(() => loadCache('zk_unmapped_punches', []));
  const [fieldRecords, setFieldRecordsState] = useState<FieldAttendanceRecord[]>(() => loadCache('field_records', []));
  const [fieldMusterFileName, setFieldMusterFileNameState] = useState<string>(() => localStorage.getItem('hris_cache_field_filename') || '');
  const [fieldImportType, setFieldImportTypeState] = useState<'matrix' | 'flat' | 'sample'>(() => (localStorage.getItem('hris_cache_field_import_type') as any) || 'matrix');
  const [auditDecisions, setAuditDecisionsState] = useState<Record<string, any>>(() => loadCache('audit_decisions', {}));
  const [auditDateRange, setAuditDateRangeState] = useState<{ startDate: string; endDate: string }>(() => loadCache('audit_date_range', { startDate: '', endDate: '' }));
  const [calculationSource, setCalculationSource] = useState<'all' | 'standard' | 'multi-time'>('all');
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserProfile, setCurrentUserProfileState] = useState<SystemUser | null>(null);
  const [previewUserProfile, setPreviewUserProfile] = useState<SystemUser | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [isOtpVerified, setIsOtpVerifiedState] = useState<boolean>(true);
  const hasAttemptedZkDeviceSeed = React.useRef(false);

  const setCurrentUserProfile = useCallback((profile: SystemUser | null) => {
    const normalized = profile ? normalizeSystemUser(profile) : null;
    setCurrentUserProfileState(normalized);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearInMemorySession();
      setUser(null);
      setCurrentUserProfileState(null);
      setPreviewUserProfile(null);
      setIsAdmin(false);
    });
    return () => registerUnauthorizedHandler(null);
  }, []);

  const refreshCurrentUserProfile = useCallback(async (emailOverride?: string) => {
    const emailToCheck = String(emailOverride || user?.email || '').trim();
    if (!emailToCheck) return;
    try {
      const res = await authFetch('/api/auth/session-profile');
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          setCurrentUserProfile(data.user);
        }
      }
    } catch {
      // ignore offline
    }
  }, [user?.email, setCurrentUserProfile]);

  useEffect(() => {
    const emailToCheck = String(user?.email || '').trim();
    if (!emailToCheck) {
      setCurrentUserProfile(null);
      setPreviewUserProfile(null);
    }
  }, [user?.email, setCurrentUserProfile]);

  const effectiveUserProfile = previewUserProfile || currentUserProfile;
  const isSuperAdmin = useMemo(() => {
    if (effectiveUserProfile) {
      return effectiveUserProfile.role === 'Super Admin' && effectiveUserProfile.status === 'Active';
    }
    return isAdmin;
  }, [effectiveUserProfile, isAdmin]);

  const canAccessModule = useCallback((moduleKey: ModuleKey): boolean => {
    if (!effectiveUserProfile) {
      if (moduleKey === 'admin' || moduleKey === 'userAccess') return isAdmin;
      return true;
    }
    if (effectiveUserProfile.status === 'Suspended') return false;
    if (effectiveUserProfile.role === 'Super Admin') return true;
    if (moduleKey === 'admin' || moduleKey === 'userAccess') return false;
    return Boolean(effectiveUserProfile.permissions?.modules?.[moduleKey]);
  }, [effectiveUserProfile, isAdmin]);

  const computePunchesDigest = useCallback((list: RawPunch[]): string => {
    if (!list || list.length === 0) return '0';
    let hash = 2166136261;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const sig = `${p.id}|${p.employeeId}|${p.punchDatetime}|${p.deviceId || ''}`;
      for (let j = 0; j < sig.length; j++) {
        hash ^= sig.charCodeAt(j);
        hash = Math.imul(hash, 16777619);
      }
    }
    return `${list.length}:${(hash >>> 0).toString(16)}`;
  }, []);

  const setIsOtpVerified = useCallback((isVerified: boolean) => {
    setIsOtpVerifiedState(isVerified);
  }, []);

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Initialize theme on mount
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const quotaExceeded = useMemo(() => 
    lastError?.toLowerCase().includes('quota') || 
    lastError?.toLowerCase().includes('resource-exhausted'), 
  [lastError]);

  const checkQuota = useCallback(() => {
    return !quotaExceeded;
  }, [quotaExceeded]);

  const handleFirestoreError = useCallback((error: any, operationType: OperationType, path: string | null) => {
    const code = error?.code || '';
    const message = error instanceof Error ? error.message : String(error);
    
    // Explicitly check for Firestore resource-exhausted code
    const isQuotaError = 
      code === 'resource-exhausted' || 
      message.toLowerCase().includes('quota') || 
      message.toLowerCase().includes('resource-exhausted');

    const isOfflineOrUnavailable = 
      code === 'unavailable' || 
      message.toLowerCase().includes('unavailable') || 
      message.toLowerCase().includes('could not reach cloud firestore');

    if (isOfflineOrUnavailable) {
      // Local mode takes precedence; suppress alarming offline warnings
      return new Error('Offline mode: Local SQLite database in use.');
    }
    
    const displayMessage = isQuotaError 
      ? "Firestore Quota Exceeded. Free daily write limit reached (20,000 writes/day). System is operating smoothly in Local Mode until midnight UTC reset."
      : message;

    const errInfo: FirestoreErrorInfo = {
      error: displayMessage,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
      },
      operationType,
      path
    };
    
    console.warn('Firestore Note: ', JSON.stringify(errInfo));
    if (isQuotaError) {
      setLastError(displayMessage);
    }
    return new Error(displayMessage);
  }, []);

  const refreshPunchesFromSqlite = useCallback(async (showToast = false): Promise<number> => {
    try {
      const freshPunches = await fetchLocalTable<RawPunch>('punches');
      const normalized = Array.isArray(freshPunches) ? freshPunches : [];
      lastPunchDigestRef.current = computePunchesDigest(normalized);
      setPunchesState(normalized);
      if (showToast) {
        toast.success(`Refreshed ${normalized.length} punch records from SQLite`);
      }
      return normalized.length;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'punches');
      return 0;
    }
  }, [computePunchesDigest, handleFirestoreError]);

  const fetchPunches = useCallback(async () => {
    await refreshPunchesFromSqlite(false);
  }, [refreshPunchesFromSqlite]);

  const processedData = useMemo(() => {
    if (employees.length === 0) return [];
    
    const filteredPunches = calculationSource === 'all' 
      ? punches 
      : punches.filter(p => !p.importFormat || p.importFormat === calculationSource || p.source === 'ZKTeco');
      
    const baseProcessed = processPunches(filteredPunches, employees, settings, shiftAssignments);

    if ((!forceAttendanceRecords || forceAttendanceRecords.length === 0) && (!auditDecisions || Object.keys(auditDecisions).length === 0)) {
      return baseProcessed;
    }

    const recordMap = new Map(baseProcessed.map(r => [`${r.employeeId}_${r.date}`, { ...r }]));
    const holidayMasterMap = buildHolidayMasterMap([], settings.holidays || []);
    const holidayPolicy = settings.holidayPunchPolicy || 'prevent_overlaps';

    // Apply forced attendance records (Admin Reconciliation)
    (forceAttendanceRecords || []).forEach(f => {
      const key = `${f.employeeId}_${f.date}`;
      const existing = recordMap.get(key);
      const holidayRec = holidayMasterMap.get(String(f.date || '').trim().slice(0, 10));
      const isLockedHoliday = Boolean(holidayRec && (holidayPolicy === 'block_all' || holidayRec.preventPunches));

      const statusMap: Record<string, ProcessedAttendance['status']> = {
        'Present': 'Present',
        'On Time': 'On Time',
        'Late': 'Late',
        'Forced': 'Present',
        'On Duty': 'Present',
        'Regularized': 'Present',
        'Half Day': 'Half Day',
        'Paid Leave': 'Paid Leave',
        'Weekly Off': 'Weekly Off',
        'Public Holiday': 'Public Holiday',
        'Holiday': 'Public Holiday',
        'PPH': 'PPH',
        'Absent': 'Absent'
      };
      const mappedStatus = f.status ? (statusMap[f.status] || 'Present') : 'Present';

      // Preserve Public Holiday when holiday is locked, or prevent force override from overlapping existing biometric holiday logs
      if (isLockedHoliday && mappedStatus !== 'Public Holiday') {
        if (existing) {
          existing.status = 'Public Holiday';
          existing.firstPunch = null;
          existing.lastPunch = null;
          existing.inTime = undefined;
          existing.outTime = undefined;
          existing.workingHours = 0;
          existing.workHours = 0;
          existing.overtime = 0;
          existing.lateMinutes = 0;
          existing.earlyMinutes = 0;
          existing.remarks = holidayRec?.name || 'Public Holiday';
        }
        return;
      }

      if (
        holidayRec &&
        holidayPolicy === 'prevent_overlaps' &&
        existing &&
        (existing.logs?.length || 0) > 0 &&
        (f.inTime || f.outTime) &&
        mappedStatus !== 'Public Holiday'
      ) {
        // Biometric holiday punches already exist; keep biometric status (Public Holiday / PPH) to prevent overlap
        return;
      }

      if (existing) {
        existing.status = mappedStatus;
        if (f.inTime) {
          existing.inTime = f.inTime;
          existing.firstPunch = `${f.date}T${f.inTime}:00`;
        }
        if (f.outTime) {
          existing.outTime = f.outTime;
          existing.lastPunch = `${f.date}T${f.outTime}:00`;
        }
        if (f.reason) existing.remarks = f.reason;

        // Recalculate workingHours and overtime accurately from manual times
        const effectiveIn = existing.inTime || (existing.firstPunch ? existing.firstPunch.substring(11, 16) : null);
        const effectiveOut = existing.outTime || (existing.lastPunch ? existing.lastPunch.substring(11, 16) : null);
        if (effectiveIn && effectiveOut) {
          const [ih, im] = effectiveIn.split(':').map(Number);
          const [oh, om] = effectiveOut.split(':').map(Number);
          if (!isNaN(ih) && !isNaN(im) && !isNaN(oh) && !isNaN(om)) {
            let diff = (oh * 60 + om) - (ih * 60 + im);
            if (diff < 0) diff += 24 * 60; // overnight shift
            const calcHours = Number((diff / 60).toFixed(2));
            existing.workingHours = calcHours;
            existing.workHours = calcHours;
            const expected = Number(existing.expectedHours) || 8;
            existing.overtime = Math.max(0, Number((calcHours - expected).toFixed(2)));
          }
        }
      } else {
        const emp = employees.find(e => e.id === f.employeeId);
        const inT = f.inTime || '09:00';
        const outT = f.outTime || '18:00';
        const [ih, im] = inT.split(':').map(Number);
        const [oh, om] = outT.split(':').map(Number);
        let diff = (oh * 60 + om) - (ih * 60 + im);
        if (diff < 0) diff += 24 * 60;
        const calcHours = Number((diff / 60).toFixed(2));
        const expected = Number(emp?.targetWorkingHours) || 8;
        const calcOt = Math.max(0, Number((calcHours - expected).toFixed(2)));

        recordMap.set(key, {
          id: key,
          employeeId: f.employeeId,
          employeeName: emp?.name || f.employeeId,
          department: emp?.department || 'General',
          date: f.date,
          inTime: inT,
          outTime: outT,
          firstPunch: f.inTime ? `${f.date}T${f.inTime}:00` : null,
          lastPunch: f.outTime ? `${f.date}T${f.outTime}:00` : null,
          workingHours: calcHours,
          overtime: calcOt,
          lateMinutes: 0,
          earlyMinutes: 0,
          logs: [f.inTime ? `${f.date}T${f.inTime}:00` : '', f.outTime ? `${f.date}T${f.outTime}:00` : ''].filter(Boolean),
          rawLogs: [],
          workHours: calcHours,
          status: mappedStatus,
          remarks: f.reason || 'Forced Attendance via Reconciliation'
        });
      }
    });

    // Apply audit decisions (Fresh Attendance Audit)
    Object.entries(auditDecisions || {}).forEach(([key, decisionObj]: [string, any]) => {
      const existing = recordMap.get(key);
      const dec = (decisionObj?.decision || decisionObj?.overrideStatus || '').toLowerCase();
      if (!dec) return;

      const dateMatch = key.match(/_(\d{4}-\d{2}-\d{2})$/);
      const holidayRec = dateMatch ? holidayMasterMap.get(dateMatch[1]) : undefined;
      const isLockedHoliday = Boolean(holidayRec && (holidayPolicy === 'block_all' || holidayRec.preventPunches));

      let mappedStatus: ProcessedAttendance['status'] = 'Present';
      if (dec === 'present' || dec === 'regularized' || dec === 'on_duty' || dec === 'accepted') mappedStatus = 'Present';
      else if (dec === 'half_day' || dec === 'half day') mappedStatus = 'Half Day';
      else if (dec === 'leave' || dec === 'paid leave') mappedStatus = 'Paid Leave';
      else if (dec === 'pwo') mappedStatus = 'PWO';
      else if (dec === 'pph') mappedStatus = 'PPH';
      else if (dec === 'public holiday' || dec === 'holiday') mappedStatus = 'Public Holiday';
      else if (dec === 'absent' || dec === 'rejected') mappedStatus = 'Absent';

      if (existing) {
        if (isLockedHoliday && mappedStatus !== 'Public Holiday') {
          existing.status = 'Public Holiday';
          existing.remarks = holidayRec?.name || 'Public Holiday';
          return;
        }
        existing.status = mappedStatus;
        if (decisionObj.remarks) existing.remarks = decisionObj.remarks;
      }
    });

    return Array.from(recordMap.values());
  }, [punches, employees, settings, shiftAssignments, calculationSource, forceAttendanceRecords, auditDecisions]);

  // Single-shot fast SQLite bootstrap strictly after authentication
  useEffect(() => {
    if (!user) {
      setIsInitializing(false);
      return;
    }

    let active = true;
    const startSync = async () => {
      try {
        setIsInitializing(true);
        try { localStorage.removeItem('hris_cache_punches'); } catch {}

        const boot = await fetchLocalBootstrap();
        if (!active) return;

        if (boot?.tables) {
          const t = boot.tables;

          if (Array.isArray(t.employees) && t.employees.length > 0) {
            setEmployeesState(t.employees);
            saveCache('employees', t.employees);
          }

          const safePunches = Array.isArray(t.punches) ? t.punches : [];
          lastPunchDigestRef.current = computePunchesDigest(safePunches);
          setPunchesState(safePunches);

          if (Array.isArray(t.settings) && t.settings.length > 0) {
            setSettingsState(t.settings[0]);
            saveCache('settings', t.settings[0]);
          }

          if (Array.isArray(t.shift_assignments)) {
            setShiftAssignmentsState(t.shift_assignments);
            saveCache('shift_assignments', t.shift_assignments);
          }

          if (Array.isArray(t.zk_devices) && t.zk_devices.length > 0) {
            setZkDevicesState(t.zk_devices);
            saveCache('zk_devices', t.zk_devices);
          }

          if (Array.isArray(t.zk_user_mappings)) {
            setZkUserMappingsState(t.zk_user_mappings);
            saveCache('zk_user_mappings', t.zk_user_mappings);
          }

          if (Array.isArray(t.zk_sync_logs)) {
            setZkSyncLogsState(t.zk_sync_logs);
            saveCache('zk_sync_logs', t.zk_sync_logs);
          }

          if (Array.isArray(t.zk_unmapped_punches)) {
            setZkUnmappedPunchesState(t.zk_unmapped_punches);
            saveCache('zk_unmapped_punches', t.zk_unmapped_punches);
          }

          if (Array.isArray(t.audit_logs)) {
            const normalizedAudit = t.audit_logs.map(normalizeAuditLog);
            setAuditLogsState(normalizedAudit);
            saveCache('audit_logs', normalizedAudit);
          }

          if (Array.isArray(t.assignment_logs)) {
            setAssignmentLogsState(t.assignment_logs);
            saveCache('assignment_logs', t.assignment_logs);
          }

          if (Array.isArray(t.exceptions)) {
            setExceptionsState(t.exceptions);
            saveCache('exceptions', t.exceptions);
          }

          if (Array.isArray(t.sbl)) {
            setSblRecordsState(t.sbl);
            saveCache('sbl', t.sbl);
          }

          if (Array.isArray(t.overtime)) {
            setOvertimeRecordsState(t.overtime);
            saveCache('overtime', t.overtime);
          }

          if (Array.isArray(t.force_attendance)) {
            setForceAttendanceRecordsState(t.force_attendance);
            saveCache('force_attendance', t.force_attendance);
          }

          if (Array.isArray(t.payroll_runs)) {
            setPayrollRunsState(t.payroll_runs);
            saveCache('payroll_runs', t.payroll_runs);
          }

          if (Array.isArray(t.employee_movements)) {
            setMovementsState(t.employee_movements);
            saveCache('movements', t.employee_movements);
          }

          if (Array.isArray(t.field_attendance_audit)) {
            setFieldRecordsState(t.field_attendance_audit);
            saveCache('field_records', t.field_attendance_audit);
          }

          if (Array.isArray(t.audit_decisions) && t.audit_decisions.length > 0) {
            const decMap: Record<string, any> = {};
            t.audit_decisions.forEach((item: any) => {
              if (item?.id) {
                const { id, ...rest } = item;
                decMap[id] = rest;
              }
            });
            setAuditDecisionsState(decMap);
            saveCache('audit_decisions', decMap);
          }
        }
      } catch (localErr) {
        console.warn('SQLite bootstrap load note:', localErr);
      } finally {
        if (active) setIsInitializing(false);
      }
    };

    startSync();
    return () => {
      active = false;
    };
  }, [user?.email, computePunchesDigest]);

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    setEmployeesState(prev => {
      const updatedList = prev.map(e => e.id === id ? { ...e, ...data } : e);
      const updatedDoc = updatedList.find(e => e.id === id);
      if (updatedDoc) saveLocalTable('employees', updatedDoc);
      return updatedList;
    });
    if (checkQuota()) {
      try {
        const existing = employees.find(e => e.id === id);
        if (existing) {
          await setDoc(doc(db, 'employees', id), { ...existing, ...data });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `employees/${id}`);
      }
    }
  }, [employees, handleFirestoreError, checkQuota]);

  const addEmployee = useCallback(async (data: Employee) => {
    setEmployeesState(prev => [...prev.filter(e => e.id !== data.id), data]);
    saveLocalTable('employees', data);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'employees', data.id), data);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `employees/${data.id}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const deleteEmployeesBatch = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setEmployeesState(prev => prev.filter(emp => !ids.includes(emp.id)));

    // Await primary local SQLite batch deletion
    const localRes = await deleteLocalTableDetailed('employees', ids);

    // Optional background cloud sync (guarded by checkQuota & timeout to prevent hangs)
    if (checkQuota()) {
      try {
        const batchSize = 300;
        const chunks = [];
        for (let i = 0; i < ids.length; i += batchSize) {
          chunks.push(ids.slice(i, i + batchSize));
        }
        const CONCURRENCY = 3;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const group = chunks.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            group.map(chunk =>
              Promise.race([
                (async () => {
                  const batch = writeBatch(db);
                  chunk.forEach(id => batch.delete(doc(db, 'employees', id)));
                  await batch.commit();
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 1000))
              ])
            )
          );
        }
      } catch (e) {
        console.warn('deleteEmployeesBatch cloud sync note:', e);
      }
    }
  }, [checkQuota]);

  const addPunch = useCallback(async (data: Omit<RawPunch, 'id'>) => {
    const id = `${data.employeeId}_${data.punchDatetime.replace(/[:.-]/g, '')}`;
    const newPunch: RawPunch = { ...data, id };

    const validation = validatePunchesAgainstHolidays({
      incomingPunches: [newPunch],
      existingPunches: punches.filter(p => p.id !== id),
      holidays: settings.holidays || [],
      employees,
      shifts: settings.shifts,
      shiftAssignments,
      mergeMinutes: settings.duplicateMergeTime ?? 5,
      policy: settings.holidayPunchPolicy || 'prevent_overlaps',
    });

    if (validation.acceptedPunches.length === 0) {
      toast.warning(validation.conflicts[0]?.message || 'Punch prevented by Public Holiday validation rules.');
      return;
    }

    const saveRes = await saveLocalTableDetailed('punches', newPunch);
    if (!saveRes.success) {
      toast.error(saveRes.error || 'Failed to save punch record to SQLite.');
      return;
    }
    if (saveRes.holidayValidation && saveRes.holidayValidation.rejectedCount > 0 && saveRes.affectedCount === 0) {
      toast.warning(saveRes.holidayValidation.conflicts?.[0]?.message || 'Punch prevented by Public Holiday validation.');
      return;
    }

    setPunchesState(prev => {
      const next = [...prev.filter(p => p.id !== id), newPunch];
      lastPunchDigestRef.current = computePunchesDigest(next);
      return next;
    });
  }, [computePunchesDigest, punches, settings, employees, shiftAssignments]);

  const updatePunch = useCallback(async (id: string, data: Partial<RawPunch>) => {
    const existing = punches.find(p => p.id === id);
    if (!existing) return;
    const updatedDoc = { ...existing, ...data };
    setPunchesState(prev => {
      const next = prev.map(p => p.id === id ? updatedDoc : p);
      lastPunchDigestRef.current = computePunchesDigest(next);
      return next;
    });
    await saveLocalTable('punches', updatedDoc);
  }, [punches, computePunchesDigest]);

  const deletePunch = useCallback(async (id: string) => {
    setPunchesState(prev => {
      const next = prev.filter(p => p.id !== id);
      lastPunchDigestRef.current = computePunchesDigest(next);
      return next;
    });
    await deleteLocalTableRecords('punches', [id]);
  }, [computePunchesDigest]);

  const deletePunchBatch = useCallback(async (importId: string) => {
    const ids = punches.filter(p => p.importId === importId).map(p => p.id);
    setPunchesState(prev => {
      const next = prev.filter(p => p.importId !== importId);
      lastPunchDigestRef.current = computePunchesDigest(next);
      return next;
    });
    if (ids.length > 0) {
      await deleteLocalTableRecords('punches', ids);
    }
  }, [punches, computePunchesDigest]);

  const deletePunchesBatch = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    setPunchesState(prev => {
      const next = prev.filter(p => !idSet.has(p.id));
      lastPunchDigestRef.current = computePunchesDigest(next);
      return next;
    });
    if (ids.length > 0) {
      await deleteLocalTableRecords('punches', ids);
    }
  }, [computePunchesDigest]);

  const clearPunches = useCallback(async (onProgress?: (msg: string) => void) => {
    setPunchesState([]);
    lastPunchDigestRef.current = '0';
    if (onProgress) onProgress('Purging punches from SQLite database...');
    await purgeLocalTable('punches');
    if (onProgress) onProgress('All punch records cleared from SQLite.');
  }, []);

  const clearAllData = useCallback(async (onProgress?: (msg: string) => void) => {
    setEmployeesState([]);
    setPunchesState([]);
    setShiftAssignmentsState([]);
    setExceptionsState([]);
    setOvertimeRecordsState([]);
    setSblRecordsState([]);
    setForceAttendanceRecordsState([]);
    setPayrollRunsState([]);
    window.localStorage.clear();

    const localTables = [
      'employees', 
      'punches', 
      'settings', 
      'shift_assignments', 
      'assignment_logs', 
      'exceptions', 
      'overtime', 
      'sbl', 
      'force_attendance', 
      'payroll_runs', 
      'zk_devices', 
      'zk_user_mappings',
      'zk_sync_logs',
      'zk_unmapped_punches'
    ];

    for (const tbl of localTables) {
      if (onProgress) onProgress(`Purging local table ${tbl}...`);
      await purgeLocalTable(tbl).catch(() => {});
    }

    const collectionsList = ['employees', 'punches', 'shiftAssignments', 'assignmentLogs', 'exceptions', 'overtime', 'sbl', 'forceAttendance', 'payrollRuns', 'zkDevices', 'zkUserMappings'];
    for (const coll of collectionsList) {
      if (onProgress) onProgress(`Purging cloud collection ${coll}...`);
      try {
        const q = collection(db, coll);
        const snapshot = await getDocs(q);
        const docs = snapshot.docs;
        const total = docs.length;
        if (total > 0) {
          const batchSize = 300;
          const chunks = [];
          for (let i = 0; i < total; i += batchSize) {
            chunks.push(docs.slice(i, i + batchSize));
          }
          const CONCURRENCY = 5;
          for (let i = 0; i < chunks.length; i += CONCURRENCY) {
            const group = chunks.slice(i, i + CONCURRENCY);
            await Promise.allSettled(
              group.map(async (chunk) => {
                const batch = writeBatch(db);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
              })
            );
          }
        }
      } catch (collErr) {
        console.warn(`Purge coll ${coll} note:`, collErr);
      }
    }
    try {
      await deleteDoc(doc(db, 'settings', 'config'));
    } catch (e) {
      console.warn('Config delete note:', e);
    }
    window.location.reload();
  }, []);

  const setEmployees = useCallback(async (data: Employee[]) => {
    setEmployeesState(prev => {
      const eMap = new Map(prev.map(e => [e.id, e]));
      data.forEach(e => eMap.set(e.id, e));
      const res = Array.from(eMap.values());
      saveCache('employees', res);
      return res;
    });

    // Save to local SQLite database asynchronously
    saveLocalTable('employees', data).catch(err => console.warn('SQLite employee save note:', err));

    try {
      const existingMap = new Map(employees.map(e => [e.id, e]));
      const recordsToWrite = data.filter(newE => {
        const existing = existingMap.get(newE.id);
        return !existing || JSON.stringify(existing) !== JSON.stringify(newE);
      });

      if (recordsToWrite.length === 0) return;

      const total = recordsToWrite.length;
      const batchSize = 300;
      const chunks: typeof recordsToWrite[] = [];
      for (let i = 0; i < total; i += batchSize) {
        chunks.push(recordsToWrite.slice(i, i + batchSize));
      }

      const CONCURRENCY = 5;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const group = chunks.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          group.map(async chunk => {
            const batch = writeBatch(db);
            chunk.forEach(emp => {
              batch.set(doc(db, 'employees', emp.id), emp);
            });
            await batch.commit();
          })
        );
      }
    } catch (e) {
      console.warn('setEmployees note:', e);
    }
  }, [employees]);

  const setPunches = useCallback(async (data: RawPunch[], onProgress?: (msg: string) => void) => {
    const incomingIds = new Set(data.map(p => p.id).filter(Boolean));
    const validation = validatePunchesAgainstHolidays({
      incomingPunches: data,
      existingPunches: punches.filter(p => !incomingIds.has(p.id)),
      holidays: settings.holidays || [],
      employees,
      shifts: settings.shifts,
      shiftAssignments,
      mergeMinutes: settings.duplicateMergeTime ?? 5,
      policy: settings.holidayPunchPolicy || 'prevent_overlaps',
    });

    const acceptedData = validation.acceptedPunches;
    if (validation.rejectedOverlaps.length > 0) {
      toast.warning(
        `Holiday validation prevented ${validation.rejectedOverlaps.length} overlapping holiday punch(es). ${validation.conflicts[0]?.message || ''}`
      );
    }

    if (acceptedData.length === 0) {
      if (onProgress) onProgress('All candidate punches on holiday were prevented by overlap rules.');
      return;
    }

    setPunchesState(prev => {
      const pMap = new Map(prev.map(p => [p.id, p]));
      acceptedData.forEach(p => {
        if (p && p.id) pMap.set(p.id, p);
      });
      const next = Array.from(pMap.values());
      lastPunchDigestRef.current = computePunchesDigest(next);
      return next;
    });

    if (onProgress) onProgress(`Saving ${acceptedData.length} validated punch records to SQLite...`);
    const chunkSize = 500;
    let serverRejected = 0;
    for (let i = 0; i < acceptedData.length; i += chunkSize) {
      const chunk = acceptedData.slice(i, i + chunkSize);
      const saveRes = await saveLocalTableDetailed('punches', chunk);
      if (saveRes.holidayValidation?.rejectedCount) {
        serverRejected += saveRes.holidayValidation.rejectedCount;
      }
      if (onProgress) {
        onProgress(`Saved ${Math.min(i + chunkSize, acceptedData.length)} / ${acceptedData.length} records to SQLite`);
      }
    }
    if (serverRejected > 0) {
      await refreshPunchesFromSqlite(false);
    }
    if (onProgress) onProgress(`Saved ${acceptedData.length} records to SQLite database.`);
  }, [computePunchesDigest, punches, settings, employees, shiftAssignments, refreshPunchesFromSqlite]);

  const setSettings = useCallback(async (data: Settings) => {
    setSettingsState(data);
    saveCache('settings', data);
    await saveLocalTable('settings', [data]);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'settings', 'config'), data);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'settings/config');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const setShiftAssignments = useCallback(async (data: ShiftAssignment[]) => {
    let finalList = data;
    if (effectiveUserProfile && effectiveUserProfile.role !== 'Super Admin') {
      const allowedIds = new Set(
        employees.filter(e => isEmployeeInUserScope(e, effectiveUserProfile)).map(e => String(e.id).trim())
      );
      const preservedOutOfScope = shiftAssignments.filter(a => !allowedIds.has(String(a.employeeId || '').trim()));
      const map = new Map<string, ShiftAssignment>();
      preservedOutOfScope.forEach(a => map.set(`${a.employeeId}_${a.date}`, a));
      data.forEach(a => map.set(`${a.employeeId}_${a.date}`, a));
      finalList = Array.from(map.values());
    }
    setShiftAssignmentsState(finalList);
    saveCache('shift_assignments', finalList);
    saveLocalTable('shift_assignments', data);
    if (checkQuota()) {
      try {
        const existingMap = new Map(shiftAssignments.map(a => [`${a.employeeId}_${a.date}`, a]));
        const recordsToWrite = data.filter(newA => {
          const id = `${newA.employeeId}_${newA.date}`;
          const existing = existingMap.get(id);
          return !existing || JSON.stringify(existing) !== JSON.stringify(newA);
        });

        if (recordsToWrite.length === 0) return;

        const total = recordsToWrite.length;
        const batchSize = 500;
        const chunks: typeof recordsToWrite[] = [];
        for (let i = 0; i < total; i += batchSize) {
          chunks.push(recordsToWrite.slice(i, i + batchSize));
        }

        const CONCURRENCY = 4;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const group = chunks.slice(i, i + CONCURRENCY);
          await Promise.all(
            group.map(chunk => {
              const batch = writeBatch(db);
              chunk.forEach(a => {
                const id = `${a.employeeId}_${a.date}`;
                batch.set(doc(db, 'shiftAssignments', id), a);
              });
              return batch.commit();
            })
          );
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'shiftAssignments');
      }
    }
  }, [shiftAssignments, handleFirestoreError, checkQuota]);

  const addAssignmentLog = useCallback(async (employeeId: string, date: string, shiftId: string, action: AssignmentLog['action']) => {
    const shift = settings.shifts?.find(s => s.id === shiftId);
    const newLog: AssignmentLog = {
      id: Math.random().toString(36).substr(2, 9),
      employeeId,
      date,
      shiftId,
      shiftName: shift?.name || 'No Shift',
      timestamp: new Date().toISOString(),
      action
    };
    setAssignmentLogsState(prev => [newLog, ...prev]);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'assignmentLogs', newLog.id), newLog);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'assignmentLogs');
      }
    }
  }, [settings.shifts, handleFirestoreError, checkQuota]);

  const addAuditLog = useCallback(async (log: Omit<AuditLog, 'id' | 'timestamp'>) => {
    const newLog: AuditLog = normalizeAuditLog({
      ...log,
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString()
    });
    setAuditLogsState(prev => {
      const updated = [newLog, ...prev];
      saveCache('audit_logs', updated);
      return updated;
    });
    saveLocalTable('audit_logs', [newLog]);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'auditLogs', newLog.id), newLog);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'auditLogs');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const updateException = useCallback(async (id: string, data: Partial<AttendanceException>) => {
    setExceptionsState(prev => {
      const updated = prev.map(ex => ex.id === id ? { ...ex, ...data } : ex);
      const target = updated.find(ex => ex.id === id);
      if (target) saveLocalTable('exceptions', [target]);
      return updated;
    });
    if (checkQuota()) {
      try {
        const existing = exceptions.find(ex => ex.id === id);
        if (existing) {
          await setDoc(doc(db, 'exceptions', id), { ...existing, ...data });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, `exceptions/${id}`);
      }
    }
  }, [exceptions, handleFirestoreError, checkQuota]);

  const setExceptionsBatch = useCallback(async (data: AttendanceException[]) => {
    setExceptionsState(data);
    saveLocalTable('exceptions', data);
    if (checkQuota()) {
      try {
        const batch = writeBatch(db);
        data.forEach(ex => {
          batch.set(doc(db, 'exceptions', ex.id), ex);
        });
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'exceptions/batch');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const updateOvertime = useCallback(async (id: string, data: Partial<OvertimeRecord>) => {
    setOvertimeRecordsState(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...data } : r);
      const target = updated.find(r => r.id === id);
      if (target) saveLocalTable('overtime', [target]);
      return updated;
    });
    if (checkQuota()) {
      try {
        const existing = overtimeRecords.find(r => r.id === id);
        if (existing) {
          await setDoc(doc(db, 'overtime', id), { ...existing, ...data });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `overtime/${id}`);
      }
    }
  }, [overtimeRecords, handleFirestoreError, checkQuota]);

  const addOvertime = useCallback(async (data: Omit<OvertimeRecord, 'id'>) => {
    const id = `ot_${Math.random().toString(36).substr(2, 9)}`;
    const newRecord = { ...data, id };
    setOvertimeRecordsState(prev => [newRecord, ...prev]);
    saveLocalTable('overtime', [newRecord]);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'overtime', id), newRecord);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'overtime');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const setOvertimeBatch = useCallback(async (records: OvertimeRecord[]) => {
    if (records.length === 0) return;

    setOvertimeRecordsState(prev => {
      const map = new Map(prev.map(r => [r.id, r]));
      records.forEach(r => map.set(r.id, r));
      const updated = Array.from(map.values());
      saveCache('overtime', updated);
      return updated;
    });

    saveLocalTable('overtime', records).catch(err => console.warn('SQLite overtime batch save note:', err));

    if (checkQuota()) {
      try {
        const batchSize = 300;
        const chunks: OvertimeRecord[][] = [];
        for (let i = 0; i < records.length; i += batchSize) {
          chunks.push(records.slice(i, i + batchSize));
        }
        const CONCURRENCY = 5;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const group = chunks.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            group.map(async chunk => {
              const batch = writeBatch(db);
              chunk.forEach(r => {
                batch.set(doc(db, 'overtime', r.id), r);
              });
              await batch.commit();
            })
          );
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'overtime/batch');
      }
    }
  }, [checkQuota, handleFirestoreError]);

  const deleteOvertimeBatch = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    setOvertimeRecordsState(prev => {
      const filtered = prev.filter(r => !ids.includes(r.id));
      saveCache('overtime', filtered);
      return filtered;
    });

    deleteLocalTableRecords('overtime', ids).catch(err => console.warn('SQLite overtime delete note:', err));

    if (checkQuota()) {
      try {
        const batchSize = 300;
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += batchSize) {
          chunks.push(ids.slice(i, i + batchSize));
        }
        const CONCURRENCY = 5;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const group = chunks.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            group.map(async chunk => {
              const batch = writeBatch(db);
              chunk.forEach(id => {
                batch.delete(doc(db, 'overtime', id));
              });
              await batch.commit();
            })
          );
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, 'overtime/batch_delete');
      }
    }
  }, [checkQuota, handleFirestoreError]);

  const updateSBL = useCallback(async (id: string, data: Partial<SBLRecord>) => {
    setSblRecordsState(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...data } : r);
      const target = updated.find(r => r.id === id);
      if (target) saveLocalTable('sbl', [target]);
      return updated;
    });
    if (checkQuota()) {
      try {
        const existing = sblRecords.find(r => r.id === id);
        if (existing) {
          await setDoc(doc(db, 'sbl', id), { ...existing, ...data });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `sbl/${id}`);
      }
    }
  }, [sblRecords, handleFirestoreError, checkQuota]);

  const addSBL = useCallback(async (data: Omit<SBLRecord, 'id'>) => {
    const id = `sbl_${Math.random().toString(36).substr(2, 9)}`;
    const newRecord = { ...data, id };
    setSblRecordsState(prev => [newRecord, ...prev]);
    saveLocalTable('sbl', [newRecord]);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'sbl', id), newRecord);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'sbl');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const setSBLBatch = useCallback(async (records: SBLRecord[]) => {
    if (records.length === 0) return;

    setSblRecordsState(prev => {
      const map = new Map(prev.map(r => [r.id, r]));
      records.forEach(r => map.set(r.id, r));
      const updated = Array.from(map.values());
      saveCache('sbl', updated);
      return updated;
    });

    saveLocalTable('sbl', records).catch(err => console.warn('SQLite sbl batch save note:', err));

    if (checkQuota()) {
      try {
        const batchSize = 300;
        const chunks: SBLRecord[][] = [];
        for (let i = 0; i < records.length; i += batchSize) {
          chunks.push(records.slice(i, i + batchSize));
        }
        const CONCURRENCY = 5;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const group = chunks.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            group.map(async chunk => {
              const batch = writeBatch(db);
              chunk.forEach(r => {
                batch.set(doc(db, 'sbl', r.id), r);
              });
              await batch.commit();
            })
          );
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'sbl/batch');
      }
    }
  }, [checkQuota, handleFirestoreError]);

  const deleteSBLBatch = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    setSblRecordsState(prev => {
      const filtered = prev.filter(r => !ids.includes(r.id));
      saveCache('sbl', filtered);
      return filtered;
    });

    deleteLocalTableRecords('sbl', ids).catch(err => console.warn('SQLite sbl delete note:', err));

    if (checkQuota()) {
      try {
        const batchSize = 300;
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += batchSize) {
          chunks.push(ids.slice(i, i + batchSize));
        }
        const CONCURRENCY = 5;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const group = chunks.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            group.map(async chunk => {
              const batch = writeBatch(db);
              chunk.forEach(id => {
                batch.delete(doc(db, 'sbl', id));
              });
              await batch.commit();
            })
          );
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, 'sbl/batch_delete');
      }
    }
  }, [checkQuota, handleFirestoreError]);

  const deleteOvertime = useCallback(async (id: string) => {
    setOvertimeRecordsState(prev => {
      const filtered = prev.filter(r => r.id !== id);
      saveCache('overtime', filtered);
      return filtered;
    });
    deleteLocalTableRecords('overtime', [id]);
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'overtime', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `overtime/${id}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const deleteSBL = useCallback(async (id: string) => {
    setSblRecordsState(prev => {
      const filtered = prev.filter(r => r.id !== id);
      saveCache('sbl', filtered);
      return filtered;
    });
    deleteLocalTableRecords('sbl', [id]);
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'sbl', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `sbl/${id}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  // Movement Handlers
  const recordSeparation = useCallback(async (data: {
    employeeId: string;
    effectiveDate: string;
    separationType: string;
    exitType?: string;
    reason: string;
    exitReason?: string;
    noticePeriod?: string;
    lastWorkingDate?: string;
    resignationDate?: string;
    remarks?: string;
    approvedBy?: string;
  }) => {
    try {
      const res = await authFetch('/api/local/movement/separation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Separation transaction failed on server');
      }

      const movementRecord: EmployeeMovement = result.movement;
      const updatedEmployee: Employee = result.employee;

      // Update movements state
      setMovementsState(prev => {
        const updated = [movementRecord, ...prev.filter(m => m.id !== movementRecord.id)];
        saveCache('movements', updated);
        return updated;
      });

      // Update employee master in state
      setEmployeesState(prev => {
        const updated = prev.map(e => e.id === updatedEmployee.id ? { ...e, ...updatedEmployee } : e);
        saveCache('employees', updated);
        return updated;
      });

      // Also record in audit logs state
      const nowIso = new Date().toISOString();
      const auditEntry: AuditLog = {
        id: `audit_sep_${Date.now()}`,
        employeeId: data.employeeId,
        employeeName: updatedEmployee.name,
        date: data.effectiveDate,
        field: 'status',
        oldValue: 'Active',
        newValue: 'Inactive',
        changedBy: data.approvedBy || 'HR Administrator',
        timestamp: nowIso,
        changedAt: nowIso,
        reason: `Separation recorded (${data.separationType}): ${data.reason}`
      };
      setAuditLogsState(prev => {
        const updated = [auditEntry, ...prev];
        saveCache('audit_logs', updated);
        return updated;
      });

      return {
        success: true,
        verified: result.verified ?? true,
        movement: movementRecord,
        employee: updatedEmployee
      };
    } catch (err: any) {
      console.error('[recordSeparation Error]:', err);
      // Fallback local processing
      const id = `move_sep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const targetEmp = employees.find(e => e.id === data.employeeId);
      const movementRecord: EmployeeMovement = {
        id,
        employeeId: data.employeeId,
        effectiveDate: data.effectiveDate,
        movementType: (data.separationType as any) || 'Resignation',
        exitType: (data.exitType as any) || (data.separationType === 'Resignation' ? 'Voluntary' : 'Involuntary'),
        exitReason: data.exitReason || data.reason,
        reason: data.reason,
        noticePeriod: data.noticePeriod,
        lastWorkingDate: data.lastWorkingDate || data.effectiveDate,
        resignationDate: data.resignationDate || data.effectiveDate,
        previousDepartment: targetEmp?.department || '',
        previousDesignation: targetEmp?.designation || '',
        newDepartment: targetEmp?.department || '',
        newDesignation: targetEmp?.designation || '',
        changedBy: data.approvedBy || 'HR Administrator',
        changedAt: new Date().toISOString()
      };

      const updatedEmp: Employee = targetEmp ? {
        ...targetEmp,
        status: 'Inactive',
        separationDate: data.effectiveDate,
        statusEffectiveDate: data.effectiveDate,
        exitType: movementRecord.exitType,
        exitReason: movementRecord.exitReason,
        lastWorkingDate: movementRecord.lastWorkingDate,
        resignationDate: movementRecord.resignationDate,
        noticePeriod: data.noticePeriod
      } : ({} as Employee);

      setMovementsState(prev => {
        const updated = [movementRecord, ...prev];
        saveCache('movements', updated);
        return updated;
      });
      if (targetEmp) {
        setEmployeesState(prev => {
          const updated = prev.map(e => e.id === targetEmp.id ? updatedEmp : e);
          saveCache('employees', updated);
          return updated;
        });
        saveLocalTable('employees', [updatedEmp]).catch(console.warn);
      }
      saveLocalTable('employee_movements', [movementRecord]).catch(console.warn);

      return {
        success: true,
        verified: true,
        movement: movementRecord,
        employee: updatedEmp
      };
    }
  }, [employees]);

  const recordGeneralMovement = useCallback(async (data: {
    employeeId: string;
    effectiveDate: string;
    movementType: string;
    previousDepartment?: string;
    newDepartment?: string;
    previousDesignation?: string;
    newDesignation?: string;
    previousSection?: string;
    newSection?: string;
    previousGrade?: string;
    newGrade?: string;
    previousSalary?: number;
    newSalary?: number;
    newShiftId?: string;
    reason?: string;
    changedBy?: string;
  }) => {
    try {
      const res = await authFetch('/api/local/movement/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Movement transaction failed on server');
      }

      const movementRecord: EmployeeMovement = result.movement;
      const updatedEmployee: Employee = result.employee;

      setMovementsState(prev => {
        const updated = [movementRecord, ...prev.filter(m => m.id !== movementRecord.id)];
        saveCache('movements', updated);
        return updated;
      });

      setEmployeesState(prev => {
        const updated = prev.map(e => e.id === updatedEmployee.id ? { ...e, ...updatedEmployee } : e);
        saveCache('employees', updated);
        return updated;
      });

      return {
        success: true,
        verified: result.verified ?? true,
        movement: movementRecord,
        employee: updatedEmployee
      };
    } catch (err: any) {
      console.error('[recordGeneralMovement Error]:', err);
      const id = `move_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const targetEmp = employees.find(e => e.id === data.employeeId);
      const movementRecord: EmployeeMovement = {
        id,
        employeeId: data.employeeId,
        effectiveDate: data.effectiveDate,
        movementType: data.movementType as any,
        previousDepartment: data.previousDepartment || targetEmp?.department || '',
        newDepartment: data.newDepartment || targetEmp?.department || '',
        previousDesignation: data.previousDesignation || targetEmp?.designation || '',
        newDesignation: data.newDesignation || targetEmp?.designation || '',
        previousSection: data.previousSection || targetEmp?.section || '',
        newSection: data.newSection || targetEmp?.section || '',
        previousGrade: data.previousGrade || targetEmp?.grade || '',
        newGrade: data.newGrade || targetEmp?.grade || '',
        previousSalary: data.previousSalary || targetEmp?.basicSalary || 0,
        newSalary: data.newSalary || targetEmp?.basicSalary || 0,
        reason: data.reason || `Movement: ${data.movementType}`,
        changedBy: data.changedBy || 'HR Administrator',
        changedAt: new Date().toISOString()
      };

      setMovementsState(prev => {
        const updated = [movementRecord, ...prev];
        saveCache('movements', updated);
        return updated;
      });
      saveLocalTable('employee_movements', [movementRecord]).catch(console.warn);

      let updatedEmp: Employee = targetEmp ? { ...targetEmp } : ({} as Employee);
      if (targetEmp) {
        if (data.newDepartment) updatedEmp.department = data.newDepartment;
        if (data.newDesignation) updatedEmp.designation = data.newDesignation;
        if (data.newSection) updatedEmp.section = data.newSection;
        if (data.newGrade) updatedEmp.grade = data.newGrade;
        if (data.newSalary) updatedEmp.basicSalary = data.newSalary;
        if (data.newShiftId) updatedEmp.shiftId = data.newShiftId;
        setEmployeesState(prev => {
          const updated = prev.map(e => e.id === targetEmp.id ? updatedEmp : e);
          saveCache('employees', updated);
          return updated;
        });
        saveLocalTable('employees', [updatedEmp]).catch(console.warn);
      }

      return {
        success: true,
        verified: true,
        movement: movementRecord,
        employee: updatedEmp
      };
    }
  }, [employees]);

  const addMovement = useCallback(async (data: Omit<EmployeeMovement, 'id'>) => {
    const isSep = ['Resignation', 'Termination', 'Retirement', 'Contract End', 'Other Separation', 'Separation'].includes(data.movementType);
    if (isSep) {
      await recordSeparation({
        employeeId: data.employeeId,
        effectiveDate: data.effectiveDate,
        separationType: data.movementType,
        exitType: data.exitType,
        reason: data.exitReason || data.reason || 'Separation recorded',
        exitReason: data.exitReason || data.reason,
        noticePeriod: data.noticePeriod,
        lastWorkingDate: data.lastWorkingDate,
        resignationDate: data.resignationDate,
        remarks: data.remarks,
        approvedBy: data.changedBy
      });
    } else {
      await recordGeneralMovement({
        employeeId: data.employeeId,
        effectiveDate: data.effectiveDate,
        movementType: data.movementType,
        previousDepartment: data.previousDepartment,
        newDepartment: data.newDepartment,
        previousDesignation: data.previousDesignation,
        newDesignation: data.newDesignation,
        previousSection: data.previousSection,
        newSection: data.newSection,
        previousGrade: data.previousGrade,
        newGrade: data.newGrade,
        previousSalary: data.previousSalary,
        newSalary: data.newSalary,
        reason: data.reason,
        changedBy: data.changedBy
      });
    }
  }, [recordSeparation, recordGeneralMovement]);

  const updateMovement = useCallback(async (id: string, updates: Partial<EmployeeMovement>) => {
    setMovementsState(prev => {
      const updated = prev.map(m => m.id === id ? { ...m, ...updates } : m);
      saveCache('movements', updated);
      return updated;
    });
    const existing = movements.find(m => m.id === id);
    if (existing) {
      const updated = { ...existing, ...updates };
      saveLocalTable('employee_movements', [updated]).catch(err => console.warn('SQLite movement update note:', err));
    }
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'employee_movements', id), updates, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `employee_movements/${id}`);
      }
    }
  }, [movements, checkQuota, handleFirestoreError]);

  const deleteMovement = useCallback(async (id: string) => {
    const existing = movements.find(m => m.id === id);
    if (existing) {
      const isSep = ['Resignation', 'Termination', 'Retirement', 'Contract End', 'Other Separation', 'Separation'].includes(existing.movementType);
      if (isSep && existing.employeeId) {
        const emp = employees.find(e => e.id === existing.employeeId);
        if (emp && emp.status === 'Inactive') {
          const restoredEmp: Employee = {
            ...emp,
            status: 'Active',
            separationDate: undefined,
            statusEffectiveDate: undefined,
            exitType: undefined,
            exitReason: undefined,
            lastWorkingDate: undefined,
            resignationDate: undefined
          };
          setEmployeesState(prev => {
            const updated = prev.map(e => e.id === emp.id ? restoredEmp : e);
            saveCache('employees', updated);
            return updated;
          });
          saveLocalTable('employees', [restoredEmp]).catch(console.warn);
        }
      }
    }

    setMovementsState(prev => {
      const updated = prev.filter(m => m.id !== id);
      saveCache('movements', updated);
      return updated;
    });
    deleteLocalTableRecords('employee_movements', [id]).catch(err => console.warn('SQLite movement delete note:', err));
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'employee_movements', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `employee_movements/${id}`);
      }
    }
  }, [movements, employees, checkQuota, handleFirestoreError]);

  const setMovementsBatch = useCallback(async (newMovements: EmployeeMovement[]) => {
    setMovementsState(newMovements);
    saveCache('movements', newMovements);
    saveLocalTable('employee_movements', newMovements).catch(err => console.warn('SQLite movement batch save note:', err));
  }, []);

  const addForceAttendance = useCallback(async (data: Omit<ForceAttendanceRecord, 'id' | 'timestamp'>) => {
    const valCheck = validateForceAttendanceAgainstHolidays({
      record: data,
      holidays: settings.holidays || [],
      existingPunches: punches,
      policy: settings.holidayPunchPolicy || 'prevent_overlaps',
    });

    if (!valCheck.allowed) {
      toast.error(valCheck.warning || 'Force Attendance entry conflicts with Public Holiday validation policy.');
      return;
    }

    const id = `force_${data.employeeId}_${data.date.replace(/-/g, '')}`;
    const timestamp = new Date().toISOString();
    const newRecord = { ...data, id, timestamp };
    const saveRes = await saveLocalTableDetailed('force_attendance', [newRecord]);
    if (!saveRes.success) {
      toast.error(saveRes.error || 'Force Attendance blocked by SQLite Public Holiday validation.');
      return;
    }
    setForceAttendanceRecordsState(prev => [newRecord, ...prev.filter(r => r.id !== id)]);

    const emp = employees.find(e => e.id === data.employeeId);

    addAuditLog({
      employeeId: data.employeeId,
      employeeName: emp?.name || 'Unknown',
      date: data.date,
      field: 'Attendance Override',
      oldValue: 'Calculated',
      newValue: `${data.inTime} - ${data.outTime}`,
      changedBy: data.approvedBy || auth.currentUser?.email?.split('@')[0] || 'Admin',
      remarks: data.remarks || data.reason
    });

    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'forceAttendance', id), newRecord);
        await logAdminOverride(
          auth.currentUser?.email || 'unknown@admin.com',
          { status: 'Calculated' },
          { status: 'Forced', inTime: data.inTime, outTime: data.outTime, reason: data.reason }
        );
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'forceAttendance');
      }
    }
  }, [handleFirestoreError, checkQuota, employees, addAuditLog, settings.holidays, settings.holidayPunchPolicy, punches]);

  const createPayrollRun = useCallback(async (
    month: string, 
    bsMonthDetails?: { bsYear: number; monthObj: any },
    customDateRange?: { startDate?: string; endDate?: string }
  ) => {
    // Check if run for this month already exists and is locked/finalized
    const existingForMonth = payrollRuns.find(r => r.month === month || r.id === `run_${month.replace(/[^a-zA-Z0-9]/g, '_')}`);
    if (existingForMonth && (existingForMonth.status === 'Finalized' || existingForMonth.status === 'Locked' || existingForMonth.status === 'Approved' || existingForMonth.status === 'Disbursed')) {
      throw new Error(`Payroll run for ${existingForMonth.monthName} is ${existingForMonth.status} and cannot be recalculated.`);
    }

    const createdBy = user?.email || auth.currentUser?.email || 'System Admin';
    const activeConfig = settings.payrollConfig || DEFAULT_PAYROLL_CONFIG;
    const run = generatePayrollRun(month, employees, processedData, overtimeRecords, createdBy, bsMonthDetails, activeConfig, customDateRange, existingForMonth?.id);
    
    // Clear deleted marker if re-created
    const deletedRunIds: string[] = JSON.parse(localStorage.getItem('deleted_payroll_run_ids') || '[]');
    if (deletedRunIds.includes(run.id)) {
      const updatedDeleted = deletedRunIds.filter(id => id !== run.id);
      localStorage.setItem('deleted_payroll_run_ids', JSON.stringify(updatedDeleted));
    }

    setPayrollRunsState(prev => {
      const updated = [run, ...prev.filter(r => r.id !== run.id)];
      saveCache('payroll_runs', updated);
      return updated;
    });
    saveLocalTable('payroll_runs', [run]);

    if (checkQuota()) {
      // Non-blocking firestore sync with safety timeout so local UX never hangs
      Promise.race([
        setDoc(doc(db, 'payrollRuns', run.id), run),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 600))
      ]).catch(e => {
        handleFirestoreError(e, OperationType.CREATE, `payrollRuns/${month}`);
      });
    }
    return run;
  }, [checkQuota, user, employees, processedData, overtimeRecords, payrollRuns, settings.payrollConfig, handleFirestoreError]);

  const recalculatePayrollRun = useCallback(async (runId: string) => {
    const existingRun = payrollRuns.find(r => r.id === runId);
    if (!existingRun) return null;

    if (existingRun.status === 'Finalized' || existingRun.status === 'Locked' || existingRun.status === 'Approved' || existingRun.status === 'Disbursed') {
      throw new Error(`Payroll run for ${existingRun.monthName} is ${existingRun.status} and cannot be recalculated.`);
    }

    const createdBy = existingRun.createdBy || user?.email || auth.currentUser?.email || 'System Admin';
    const activeConfig = settings.payrollConfig || DEFAULT_PAYROLL_CONFIG;
    const customDateRange = (existingRun.startDate && existingRun.endDate) ? { startDate: existingRun.startDate, endDate: existingRun.endDate } : undefined;
    
    // Regenerate run with fixed existingRun.id to ensure deterministic ID continuity
    const freshRun = generatePayrollRun(existingRun.month, employees, processedData, overtimeRecords, createdBy, undefined, activeConfig, customDateRange, existingRun.id);
    const updatedRun: PayrollRun = {
      ...freshRun,
      id: existingRun.id,
      status: existingRun.status,
      disbursedAt: existingRun.disbursedAt,
      disbursedBy: existingRun.disbursedBy,
      disbursementMethod: existingRun.disbursementMethod
    };

    setPayrollRunsState(prev => {
      const updated = prev.map(r => r.id === runId ? updatedRun : r);
      saveCache('payroll_runs', updated);
      return updated;
    });
    saveLocalTable('payroll_runs', [updatedRun]);

    if (checkQuota()) {
      Promise.race([
        setDoc(doc(db, 'payrollRuns', runId), updatedRun),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 600))
      ]).catch(e => {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      });
    }
    return updatedRun;
  }, [checkQuota, user, employees, processedData, overtimeRecords, payrollRuns, settings.payrollConfig, handleFirestoreError]);

  const updatePayrollRecord = useCallback(async (runId: string, recordId: string, updates: Partial<PayrollRecord>) => {
    const existingRun = payrollRuns.find(r => r.id === runId);
    if (!existingRun) return;

    const activeConfig = settings.payrollConfig || DEFAULT_PAYROLL_CONFIG;

    const updatedRecords = existingRun.records.map(rec => {
      if (rec.id !== recordId) return rec;
      const newRec = { ...rec, ...updates };

      // Check if any financial/calculation parameters are modified
      const isFinancialChange = 
        updates.earnedBasicSalary !== undefined ||
        updates.earnedAllowances !== undefined ||
        updates.overtimePay !== undefined ||
        updates.bonus !== undefined ||
        updates.incomeTaxTDS !== undefined ||
        updates.otherDeductions !== undefined ||
        updates.ssfEnrolled !== undefined ||
        updates.taxStatus !== undefined ||
        updates.maritalStatus !== undefined;

      // If purely updating transaction references, status, bank info or remarks, preserve financial fields intact
      if (!isFinancialChange) {
        return newRec;
      }

      const earnedBasicSalary = newRec.earnedBasicSalary ?? rec.earnedBasicSalary;
      const earnedAllowances = newRec.earnedAllowances ?? rec.earnedAllowances;
      const overtimePay = newRec.overtimePay ?? rec.overtimePay;
      const bonus = newRec.bonus ?? rec.bonus;
      const grossSalary = earnedBasicSalary + earnedAllowances + overtimePay + bonus;
      const taxStatus = (newRec.taxStatus || newRec.maritalStatus || 'Single') as 'Single' | 'Married';
      const ssfEnrolled = newRec.ssfEnrolled !== undefined ? newRec.ssfEnrolled : (rec.ssfEnrolled !== undefined ? rec.ssfEnrolled : true);

      // Find matching employee tax profile if any
      const emp = employees.find(e => e.id === rec.employeeId);

      const { 
        incomeTaxTDS, 
        socialSecurity, 
        healthInsurance, 
        otherDeductions, 
        totalDeductions,
        annualizedTaxableIncome,
        annualTaxLiability,
        taxSlabBreakdown
      } = calculateTaxAndDeductions(grossSalary, earnedBasicSalary, taxStatus, ssfEnrolled, activeConfig, emp?.taxProfile);

      newRec.grossSalary = grossSalary;
      newRec.earnedBasicSalary = earnedBasicSalary;
      newRec.earnedAllowances = earnedAllowances;
      newRec.overtimePay = overtimePay;
      newRec.bonus = bonus;
      newRec.ssfEnrolled = ssfEnrolled;
      newRec.taxStatus = taxStatus;
      newRec.maritalStatus = taxStatus;
      newRec.socialSecurity = socialSecurity;
      newRec.incomeTaxTDS = updates.incomeTaxTDS !== undefined ? updates.incomeTaxTDS : incomeTaxTDS;
      newRec.healthInsurance = healthInsurance;
      newRec.otherDeductions = updates.otherDeductions !== undefined ? (updates.otherDeductions || 0) : (newRec.otherDeductions || 0);
      newRec.totalDeductions = newRec.incomeTaxTDS + newRec.socialSecurity + (newRec.otherDeductions || 0);
      newRec.netSalary = Math.max(0, newRec.grossSalary - newRec.totalDeductions);
      newRec.taxableIncome = Math.max(0, newRec.grossSalary - newRec.socialSecurity);
      newRec.annualizedTaxableIncome = annualizedTaxableIncome;
      newRec.annualTaxLiability = annualTaxLiability;
      newRec.taxSlabBreakdown = taxSlabBreakdown;
      newRec.employerSSF = ssfEnrolled ? Math.round(earnedBasicSalary * (activeConfig.ssfEmployerRate ?? 0.20)) : 0;
      newRec.monthlyCTC = newRec.grossSalary + newRec.employerSSF;

      return newRec;
    });

    const updatedRun: PayrollRun = {
      ...existingRun,
      totalGrossSalary: updatedRecords.reduce((s, r) => s + r.grossSalary, 0),
      totalTaxTDS: updatedRecords.reduce((s, r) => s + r.incomeTaxTDS, 0),
      totalSocialSecurity: updatedRecords.reduce((s, r) => s + r.socialSecurity, 0),
      totalEmployerSSF: updatedRecords.reduce((s, r) => s + (r.employerSSF || 0), 0),
      totalCTC: updatedRecords.reduce((s, r) => s + (r.monthlyCTC || r.grossSalary), 0),
      totalDeductions: updatedRecords.reduce((s, r) => s + r.totalDeductions, 0),
      totalNetSalary: updatedRecords.reduce((s, r) => s + r.netSalary, 0),
      records: updatedRecords
    };

    setPayrollRunsState(prev => prev.map(r => r.id === runId ? updatedRun : r));
    saveLocalTable('payroll_runs', [updatedRun]);

    if (checkQuota()) {
      Promise.race([
        setDoc(doc(db, 'payrollRuns', runId), updatedRun),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 600))
      ]).catch(e => {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      });
    }
  }, [checkQuota, employees, payrollRuns, settings.payrollConfig, handleFirestoreError]);

  const approvePayrollRun = useCallback(async (runId: string) => {
    const existingRun = payrollRuns.find(r => r.id === runId);
    if (!existingRun) return;

    const updatedRun: PayrollRun = {
      ...existingRun,
      status: 'Approved',
      approvedAt: new Date().toISOString(),
      approvedBy: user?.email || auth.currentUser?.email || 'Admin'
    };

    setPayrollRunsState(prev => prev.map(r => r.id === runId ? updatedRun : r));
    saveLocalTable('payroll_runs', [updatedRun]);

    addAuditLog({
      employeeId: 'PAYROLL',
      employeeName: 'Payroll Run',
      date: existingRun.month,
      field: 'Payroll Status',
      oldValue: existingRun.status,
      newValue: 'Approved',
      changedBy: user?.email || 'Admin',
      remarks: `Approved payroll run for ${existingRun.monthName} (Total Net: NPR ${existingRun.totalNetSalary.toLocaleString()})`
    });

    if (checkQuota()) {
      Promise.race([
        setDoc(doc(db, 'payrollRuns', runId), updatedRun),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 600))
      ]).catch(e => {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      });
    }
  }, [checkQuota, payrollRuns, user, handleFirestoreError, addAuditLog]);

  const disbursePayrollRun = useCallback(async (runId: string, method: DisbursementMethod) => {
    const existingRun = payrollRuns.find(r => r.id === runId);
    if (!existingRun) return;

    const now = new Date().toISOString();
    const disbursedRecords = existingRun.records.map(rec => ({
      ...rec,
      disbursementStatus: 'Disbursed' as const,
      disbursementMethod: method,
      transactionRef: `TXN-${Math.floor(10000000 + Math.random() * 90000000)}`,
      disbursedAt: now
    }));

    const updatedRun: PayrollRun = {
      ...existingRun,
      status: 'Disbursed',
      disbursedAt: now,
      disbursedBy: user?.email || auth.currentUser?.email || 'HR Admin',
      disbursementMethod: method,
      records: disbursedRecords
    };

    setPayrollRunsState(prev => prev.map(r => r.id === runId ? updatedRun : r));
    saveLocalTable('payroll_runs', [updatedRun]);

    addAuditLog({
      employeeId: 'PAYROLL',
      employeeName: 'Payroll Disbursement',
      date: existingRun.month,
      field: 'Disbursement',
      oldValue: existingRun.status,
      newValue: 'Disbursed',
      changedBy: user?.email || 'HR Admin',
      remarks: `Disbursed ${existingRun.records.length} salaries via ${method} for ${existingRun.monthName}`
    });

    if (checkQuota()) {
      Promise.race([
        setDoc(doc(db, 'payrollRuns', runId), updatedRun),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 600))
      ]).catch(e => {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      });
    }
  }, [checkQuota, payrollRuns, user, handleFirestoreError, addAuditLog]);

  const deletePayrollRun = useCallback(async (runId: string) => {
    const existingRun = payrollRuns.find(r => r.id === runId);
    if (existingRun && (existingRun.status === 'Finalized' || existingRun.status === 'Locked' || existingRun.status === 'Approved' || existingRun.status === 'Disbursed')) {
      throw new Error(`Payroll run for ${existingRun.monthName} is ${existingRun.status} and cannot be deleted.`);
    }
    
    // Register deleted ID marker so onSnapshot never resurrects it
    const deletedRunIds: string[] = JSON.parse(localStorage.getItem('deleted_payroll_run_ids') || '[]');
    if (!deletedRunIds.includes(runId)) {
      deletedRunIds.push(runId);
      localStorage.setItem('deleted_payroll_run_ids', JSON.stringify(deletedRunIds));
    }

    setPayrollRunsState(prev => {
      const updated = prev.filter(r => r.id !== runId);
      saveCache('payroll_runs', updated);
      return updated;
    });

    await deleteLocalTableRecords('payroll_runs', [runId]);

    // Issue direct HTTP DELETE call to backend endpoint
    try {
      await authFetch(`/api/payroll/runs/${runId}`, { method: 'DELETE' });
    } catch (e) {
      // offline fallback handled by local storage
    }

    addAuditLog({
      employeeId: 'PAYROLL',
      employeeName: 'Payroll Deletion',
      date: existingRun?.month || new Date().toISOString().substring(0, 7),
      field: 'Payroll Run',
      oldValue: existingRun?.monthName || runId,
      newValue: 'DELETED',
      changedBy: user?.email || 'HR Admin',
      remarks: `Permanently deleted draft payroll run ${existingRun?.monthName || runId}`
    });

    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'payrollRuns', runId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `payrollRuns/${runId}`);
      }
    }
  }, [checkQuota, handleFirestoreError, payrollRuns, user, addAuditLog]);

  // ZKTeco Biometric Device Actions (100% SQLite)
  const addZkDevice = useCallback(async (deviceData: Omit<ZkDevice, 'id'>) => {
    const id = `dev_${Date.now()}`;
    const newDev: ZkDevice = {
      ...deviceData,
      id,
      status: 'online',
      lastConnection: new Date().toISOString(),
      lastSync: new Date().toISOString(),
      userCount: deviceData.userCount || 0,
      logCount: deviceData.logCount || 0
    };
    setZkDevicesState(prev => {
      const next = [...prev.filter(d => d.id !== id), newDev];
      saveCache('zk_devices', next);
      return next;
    });
    await saveLocalTable('zk_devices', newDev);
    toast.success(`ZKTeco device "${newDev.name}" saved to SQLite database`);
  }, []);

  const updateZkDevice = useCallback(async (id: string, updates: Partial<ZkDevice>) => {
    const existing = zkDevices.find(d => d.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    setZkDevicesState(prev => {
      const next = prev.map(d => d.id === id ? updated : d);
      saveCache('zk_devices', next);
      return next;
    });
    await saveLocalTable('zk_devices', updated);
    toast.success(`Device "${updated.name}" updated in SQLite`);
  }, [zkDevices]);

  const deleteZkDevice = useCallback(async (id: string) => {
    setZkDevicesState(prev => {
      const next = prev.filter(d => d.id !== id);
      saveCache('zk_devices', next);
      return next;
    });
    await deleteLocalTableRecords('zk_devices', [id]);
    toast.success('Device deleted from SQLite');
  }, []);

  const mapZkUser = useCallback(async (mappingData: Omit<ZkUserMapping, 'id' | 'mappedAt'>) => {
    const cleanDevId = String(mappingData.deviceUserId || '').trim();
    const id = `map_${cleanDevId}`;
    const emp = employees.find(e => e.id === mappingData.employeeId);
    const newMapping: ZkUserMapping = {
      ...mappingData,
      deviceUserId: cleanDevId,
      id,
      employeeName: emp?.name || mappingData.employeeName || mappingData.employeeId,
      department: emp?.department || mappingData.department || 'General',
      mappedAt: new Date().toISOString()
    };
    setZkUserMappingsState(prev => {
      const next = [...prev.filter(m => m.id !== id), newMapping];
      saveCache('zk_user_mappings', next);
      return next;
    });
    await saveLocalTable('zk_user_mappings', newMapping);
    toast.success(`Biometric User ${cleanDevId} mapped to ${newMapping.employeeName} (SQLite)`);
  }, [employees]);

  const unmapZkUser = useCallback(async (id: string) => {
    setZkUserMappingsState(prev => {
      const next = prev.filter(m => m.id !== id);
      saveCache('zk_user_mappings', next);
      return next;
    });
    await deleteLocalTableRecords('zk_user_mappings', [id]);
    toast.success('User mapping removed from SQLite');
  }, []);

  const refreshZkTablesFromSqlite = useCallback(async () => {
    const [freshPunches, freshDevs, freshLogs, freshUnmapped, freshMappings] = await Promise.all([
      fetchLocalTable<RawPunch>('punches'),
      fetchLocalTable<ZkDevice>('zk_devices'),
      fetchLocalTable<ZkSyncLog>('zk_sync_logs'),
      fetchLocalTable<ZkUnmappedPunch>('zk_unmapped_punches'),
      fetchLocalTable<ZkUserMapping>('zk_user_mappings')
    ]);

    const safePunches = Array.isArray(freshPunches) ? freshPunches : [];
    lastPunchDigestRef.current = computePunchesDigest(safePunches);
    setPunchesState(safePunches);

    if (freshDevs && freshDevs.length > 0) {
      setZkDevicesState(freshDevs);
      saveCache('zk_devices', freshDevs);
    }
    if (freshLogs) {
      setZkSyncLogsState(freshLogs);
      saveCache('zk_sync_logs', freshLogs);
    }
    if (freshUnmapped) {
      setZkUnmappedPunchesState(freshUnmapped);
      saveCache('zk_unmapped_punches', freshUnmapped);
    }
    if (freshMappings) {
      setZkUserMappingsState(freshMappings);
      saveCache('zk_user_mappings', freshMappings);
    }

    return {
      punches: safePunches,
      devices: freshDevs || [],
      logs: freshLogs || [],
      unmapped: freshUnmapped || [],
      mappings: freshMappings || []
    };
  }, [computePunchesDigest]);

  const syncZkDevice = useCallback(async (deviceId: string) => {
    const targetDev = zkDevices.find(d => d.id === deviceId);
    if (!targetDev) return { success: false, recordsRead: 0, newRecords: 0, duplicates: 0 };

    const tId = toast.loading(`Polling ZKTeco device "${targetDev.name}" (${targetDev.ip}) & syncing to SQLite...`);
    try {
      const response = await authFetch('/api/zk/fetch-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: targetDev.id,
          ip: targetDev.ip,
          mode: 'Manual Device Poll'
        })
      });
      const resData = await response.json();
      await refreshZkTablesFromSqlite();

      const recordsRead = Number(resData?.recordsRead || 0);
      const newRecords = Number(resData?.newRecords || 0);
      const duplicates = Number(resData?.duplicates || 0);

      if (resData?.success) {
        toast.success(
          resData.message || `Synced ${targetDev.name}: ${recordsRead} read, ${newRecords} new stored in SQLite (${duplicates} duplicates)`,
          { id: tId }
        );
      } else {
        toast.warning(
          resData?.error || `Device ${targetDev.name} unreachable from server host; status logged in SQLite`,
          { id: tId }
        );
      }

      return {
        success: Boolean(resData?.success),
        recordsRead,
        newRecords,
        duplicates
      };
    } catch (e: any) {
      toast.error(`Failed to poll ${targetDev.name}: ${e?.message || 'Network error'}`, { id: tId });
      return { success: false, recordsRead: 0, newRecords: 0, duplicates: 0 };
    }
  }, [zkDevices, refreshZkTablesFromSqlite]);

  const syncAllZkDevices = useCallback(async () => {
    const tId = toast.loading('Downloading attendance logs from ZKTeco terminals to SQLite...');
    try {
      const response = await authFetch('/api/zk/fetch-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'Manual Log Download' })
      });
      const resData = await response.json();
      await refreshZkTablesFromSqlite();

      const devicesPolled = Number(resData?.devicesPolled || 0);
      const totalNew = Number(resData?.totalNew || 0);
      const totalRead = Number(resData?.totalRead || 0);
      const reachableDevices = Number(resData?.reachableDevices || 0);

      if (resData?.success) {
        toast.success(
          resData.message || `Downloaded logs from ${devicesPolled} terminals (${reachableDevices} reachable) · ${totalNew} new punches saved to SQLite`,
          { id: tId }
        );
      } else {
        toast.error(resData?.error || 'Failed to download ZKTeco logs', { id: tId });
      }

      return {
        success: Boolean(resData?.success),
        devicesPolled,
        totalNew,
        totalRead,
        reachableDevices
      };
    } catch (e: any) {
      toast.error(`Batch ZKT poll error: ${e?.message || 'Network error'}`, { id: tId });
      return { success: false, devicesPolled: 0, totalNew: 0, totalRead: 0, reachableDevices: 0 };
    }
  }, [refreshZkTablesFromSqlite]);

  const reconcileSystemZkData = useCallback(async () => {
    const tId = toast.loading('Reconciling Active Employees, mappings, and unmapped punches in SQLite...');
    try {
      const response = await authFetch('/api/zk/reconcile-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const resData = await response.json();
      await refreshZkTablesFromSqlite();

      if (resData?.success) {
        toast.success(
          resData.message || `System synchronized: ${resData.mappingsCreated} mappings added, ${resData.punchesAdded} punches stored`,
          { id: tId }
        );
      } else {
        toast.error(resData?.error || 'System reconciliation failed', { id: tId });
      }

      return {
        success: Boolean(resData?.success),
        mappingsCreated: Number(resData?.mappingsCreated || 0),
        unmappedResolved: Number(resData?.unmappedResolved || 0),
        punchesAdded: Number(resData?.punchesAdded || 0)
      };
    } catch (e: any) {
      toast.error(`Reconciliation failed: ${e?.message || 'Network error'}`, { id: tId });
      return { success: false, mappingsCreated: 0, unmappedResolved: 0, punchesAdded: 0 };
    }
  }, [refreshZkTablesFromSqlite]);

  const resolveUnmappedPunches = useCallback(async (deviceUserId: string, employeeId: string) => {
    try {
      const cleanTargetId = String(deviceUserId).trim();
      const normTargetId = cleanTargetId.replace(/[^0-9]/g, '').replace(/^0+/, '');

      const emp = employees.find(e => e.id === employeeId);
      if (emp && emp.status && emp.status.toLowerCase() !== 'active') {
        toast.error(`Cannot fetch punches for inactive employee ${emp.name} (${emp.id}). Only Active Employees in Directory are synced.`);
        return;
      }

      // 1. Save mapping to SQLite
      await mapZkUser({ deviceUserId: cleanTargetId, employeeId });

      // 2. Fetch pending unmapped punches from SQLite
      const localUnmapped = await fetchLocalTable<ZkUnmappedPunch>('zk_unmapped_punches');
      const allUnmapped = (localUnmapped && localUnmapped.length > 0) ? localUnmapped : zkUnmappedPunches;

      const pendingPunches = allUnmapped.filter(p => {
        if (p.status && p.status !== 'pending') return false;
        const pClean = String(p.deviceUserId || '').trim();
        const pNorm = pClean.replace(/[^0-9]/g, '').replace(/^0+/, '');
        return pClean === cleanTargetId || (normTargetId && pNorm === normTargetId);
      });

      if (pendingPunches.length === 0) {
        toast.info(`Mapping saved to SQLite! No historical pending punches found for biometric user ${cleanTargetId}`);
        return;
      }

      const existingIds = new Set(punches.map(x => x.id));
      const existingEmpTimes = new Set(punches.map(x => `${x.employeeId}_${String(x.punchDatetime || '').replace(' ', 'T').slice(0, 19)}`));

      const newPunchesToSave: RawPunch[] = [];
      const updatedUnmappedToSave: ZkUnmappedPunch[] = [];

      for (const p of pendingPunches) {
        const punchDateTime = String(p.punchDateTime || '').replace(' ', 'T');
        const punchId = `zk_${p.transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const empTimeKey = `${employeeId}_${punchDateTime.slice(0, 19)}`;

        updatedUnmappedToSave.push({ ...p, status: 'resolved' });

        if (existingIds.has(punchId) || existingEmpTimes.has(empTimeKey)) {
          continue;
        }
        existingIds.add(punchId);
        existingEmpTimes.add(empTimeKey);

        newPunchesToSave.push({
          id: punchId,
          employeeId,
          punchDatetime: punchDateTime,
          deviceId: p.deviceId,
          deviceName: p.deviceName || 'ZKTeco Device',
          deviceIP: p.deviceIP || '192.168.117.200',
          deviceUserId: p.deviceUserId,
          source: 'ZKTeco',
          syncTime: new Date().toISOString(),
          transactionId: p.transactionId,
          location: `${p.deviceName || 'Biometric'} (${p.deviceIP || 'LAN'})`,
          importFormat: 'standard'
        });
      }

      if (newPunchesToSave.length > 0) {
        await saveLocalTable('punches', newPunchesToSave);
        setPunchesState(prev => {
          const pMap = new Map(prev.map(x => [x.id, x]));
          newPunchesToSave.forEach(p => pMap.set(p.id, p));
          const next = Array.from(pMap.values());
          lastPunchDigestRef.current = computePunchesDigest(next);
          return next;
        });
      }

      if (updatedUnmappedToSave.length > 0) {
        await saveLocalTable('zk_unmapped_punches', updatedUnmappedToSave);
      }

      setZkUnmappedPunchesState(prev => {
        const resolvedIds = new Set(updatedUnmappedToSave.map(u => u.id));
        const next = prev.map(u => resolvedIds.has(u.id) ? { ...u, status: 'resolved' as const } : u);
        saveCache('zk_unmapped_punches', next);
        return next;
      });

      toast.success(`Mapped ${newPunchesToSave.length} punches to ${emp?.name || employeeId} and stored in SQLite`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to resolve unmapped punches');
    }
  }, [mapZkUser, employees, zkUnmappedPunches, punches, computePunchesDigest]);

  // Auto-resolve pending unmapped punches ONLY against Active Employees in Directory
  useEffect(() => {
    if (!isAdmin || employees.length === 0 || zkUnmappedPunches.length === 0 || quotaExceeded) return;

    const pending = zkUnmappedPunches.filter(p => !p.status || p.status === 'pending');
    if (pending.length === 0) return;

    const activeEmps = employees.filter(e => !e.status || e.status.toLowerCase() === 'active');
    const activeEmpIdSet = new Set(activeEmps.map(e => String(e.id).trim()));

    const mappingMap = new Map<string, string>();
    zkUserMappings.forEach(m => {
      if (m.deviceUserId && m.employeeId && activeEmpIdSet.has(String(m.employeeId).trim())) {
        const raw = String(m.deviceUserId).trim();
        mappingMap.set(raw, m.employeeId);
        const norm = normalizeEmployeeId(raw);
        if (norm) mappingMap.set(norm, m.employeeId);
      }
    });

    const empNormMap = new Map<string, string>();
    activeEmps.forEach(emp => {
      if (!emp || !emp.id) return;
      const officialId = String(emp.id).trim();
      if (!officialId) return;

      empNormMap.set(officialId, officialId);
      empNormMap.set(officialId.toLowerCase(), officialId);

      const normId = normalizeEmployeeId(officialId);
      if (normId) {
        empNormMap.set(normId, officialId);
        empNormMap.set(`EMP${normId}`, officialId);
        empNormMap.set(`EMP-${normId}`, officialId);
      }
    });

    const itemsToResolve: { p: ZkUnmappedPunch; empId: string }[] = [];

    for (const p of pending) {
      const devUserId = String(p.deviceUserId || '').trim();
      if (!devUserId) continue;

      const normDevId = normalizeEmployeeId(devUserId);
      let targetEmpId = mappingMap.get(devUserId) || (normDevId ? mappingMap.get(normDevId) : undefined);

      if (!targetEmpId) {
        targetEmpId = empNormMap.get(devUserId) || 
                      (normDevId ? empNormMap.get(normDevId) : undefined) ||
                      empNormMap.get(`EMP${normDevId}`) ||
                      empNormMap.get(devUserId.toLowerCase());
      }

      if (targetEmpId && activeEmpIdSet.has(targetEmpId)) {
        itemsToResolve.push({ p, empId: targetEmpId });
      }
    }

    if (itemsToResolve.length === 0) return;

    const runAutoResolve = async () => {
      try {
        const existingIds = new Set(punches.map(x => x.id));
        const existingEmpTimes = new Set(punches.map(x => `${x.employeeId}_${String(x.punchDatetime || '').replace(' ', 'T').slice(0, 19)}`));
        const newPunches: RawPunch[] = [];
        const resolvedUnmapped: ZkUnmappedPunch[] = [];

        for (const item of itemsToResolve) {
          const rawDateTime = item.p.punchDateTime || new Date().toISOString();
          const punchDateTime = String(rawDateTime).replace(' ', 'T');
          const transactionId = item.p.transactionId || `auto_${item.p.deviceId}_${item.p.deviceUserId}_${punchDateTime}`;
          const punchId = `zk_${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const empTimeKey = `${item.empId}_${punchDateTime.slice(0, 19)}`;

          resolvedUnmapped.push({ ...item.p, status: 'resolved' });

          if (existingIds.has(punchId) || existingEmpTimes.has(empTimeKey)) {
            continue;
          }
          existingIds.add(punchId);
          existingEmpTimes.add(empTimeKey);

          newPunches.push({
            id: punchId,
            employeeId: item.empId,
            punchDatetime: punchDateTime,
            deviceId: item.p.deviceId || 'ZKTeco Device',
            deviceName: item.p.deviceName || 'ZKTeco Device',
            deviceIP: item.p.deviceIP || '192.168.117.200',
            deviceUserId: item.p.deviceUserId,
            source: 'ZKTeco',
            syncTime: new Date().toISOString(),
            transactionId,
            location: item.p.deviceName ? `${item.p.deviceName} (${item.p.deviceIP || 'LAN'})` : 'Biometric Device',
            importFormat: 'standard'
          });
        }

        if (newPunches.length > 0) {
          await saveLocalTable('punches', newPunches);
          setPunchesState(prev => {
            const pMap = new Map(prev.map(x => [x.id, x]));
            newPunches.forEach(p => pMap.set(p.id, p));
            const next = Array.from(pMap.values());
            lastPunchDigestRef.current = computePunchesDigest(next);
            return next;
          });
        }

        if (resolvedUnmapped.length > 0) {
          await saveLocalTable('zk_unmapped_punches', resolvedUnmapped);
        }

        setZkUnmappedPunchesState(prev => {
          const resIds = new Set(resolvedUnmapped.map(u => u.id));
          const next = prev.map(u => resIds.has(u.id) ? { ...u, status: 'resolved' as const } : u);
          saveCache('zk_unmapped_punches', next);
          return next;
        });
      } catch (err) {
        console.error('Error during SQLite auto-resolve of unmapped punches:', err);
      }
    };

    runAutoResolve();
  }, [isAdmin, employees, zkUserMappings, zkUnmappedPunches, punches, quotaExceeded, checkQuota, computePunchesDigest]);

  const clearZkSyncLogs = useCallback(async () => {
    setZkSyncLogsState([]);
    saveCache('zk_sync_logs', []);
    await purgeLocalTable('zk_sync_logs').catch(() => {});
    toast.success('Sync logs cleared from SQLite');
  }, []);

  const recalculate = useCallback(async () => {
    const tId = toast.loading('Synchronizing system state with local database...');
    try {
      // 1. Fetch local SQLite database records first to protect local disk state
      const [localPunches, localEmps, localSettings, localShifts, localEx, localOt, localSbl, localForce, localPayroll] = await Promise.all([
        fetchLocalTable<RawPunch>('punches'),
        fetchLocalTable<Employee>('employees'),
        fetchLocalTable<Settings>('settings'),
        fetchLocalTable<ShiftAssignment>('shift_assignments'),
        fetchLocalTable<AttendanceException>('exceptions'),
        fetchLocalTable<OvertimeRecord>('overtime'),
        fetchLocalTable<SBLRecord>('sbl'),
        fetchLocalTable<ForceAttendanceRecord>('force_attendance'),
        fetchLocalTable<PayrollRun>('payroll_runs')
      ]);

      // 2. Query Firestore (if available)
      let fsPunches: RawPunch[] = [];
      let fsEmps: Employee[] = [];
      let fsSettings: Settings | null = null;
      let fsShifts: ShiftAssignment[] = [];
      let fsEx: AttendanceException[] = [];
      let fsOt: OvertimeRecord[] = [];
      let fsSbl: SBLRecord[] = [];
      let fsForce: ForceAttendanceRecord[] = [];
      let fsPayroll: PayrollRun[] = [];

      try {
        const results = await Promise.allSettled([
          getDocs(collection(db, 'punches')),
          getDocs(collection(db, 'employees')),
          getDoc(doc(db, 'settings', 'config')),
          getDocs(collection(db, 'shiftAssignments')),
          getDocs(collection(db, 'exceptions')),
          getDocs(collection(db, 'overtime')),
          getDocs(collection(db, 'sbl')),
          getDocs(collection(db, 'forceAttendance')),
          getDocs(collection(db, 'payrollRuns'))
        ]);

        if (results[0].status === 'fulfilled') fsPunches = results[0].value.docs.map(d => d.data() as RawPunch);
        if (results[1].status === 'fulfilled') fsEmps = results[1].value.docs.map(d => d.data() as Employee);
        if (results[2].status === 'fulfilled' && results[2].value.exists()) fsSettings = results[2].value.data() as Settings;
        if (results[3].status === 'fulfilled') fsShifts = results[3].value.docs.map(d => d.data() as ShiftAssignment);
        if (results[4].status === 'fulfilled') fsEx = results[4].value.docs.map(d => d.data() as AttendanceException);
        if (results[5].status === 'fulfilled') fsOt = results[5].value.docs.map(d => d.data() as OvertimeRecord);
        if (results[6].status === 'fulfilled') fsSbl = results[6].value.docs.map(d => d.data() as SBLRecord);
        if (results[7].status === 'fulfilled') fsForce = results[7].value.docs.map(d => d.data() as ForceAttendanceRecord);
        if (results[8].status === 'fulfilled') fsPayroll = results[8].value.docs.map(d => d.data() as PayrollRun);
      } catch (fsErr) {
        console.warn('Firestore optional query note:', fsErr);
      }

      // 3. Refresh SQLite punches directly
      const safeLocalPunches = Array.isArray(localPunches) ? localPunches : [];
      lastPunchDigestRef.current = computePunchesDigest(safeLocalPunches);
      setPunchesState(safeLocalPunches);

      setEmployeesState(prev => {
        const eMap = new Map<string, Employee>();
        prev.forEach(e => eMap.set(e.id, e));
        (localEmps || []).forEach(e => eMap.set(e.id, e));
        fsEmps.forEach(e => eMap.set(e.id, e));
        const merged = Array.from(eMap.values());
        saveCache('employees', merged);
        return merged;
      });

      if (fsSettings) {
        setSettingsState(fsSettings);
        saveCache('settings', fsSettings);
      } else if (localSettings && localSettings.length > 0) {
        setSettingsState(localSettings[0]);
        saveCache('settings', localSettings[0]);
      }

      setShiftAssignmentsState(prev => {
        const map = new Map<string, ShiftAssignment>();
        prev.forEach(a => map.set(`${a.employeeId}_${a.date}`, a));
        (localShifts || []).forEach(a => map.set(`${a.employeeId}_${a.date}`, a));
        fsShifts.forEach(a => map.set(`${a.employeeId}_${a.date}`, a));
        const merged = Array.from(map.values());
        saveCache('shift_assignments', merged);
        return merged;
      });

      setExceptionsState(prev => {
        const map = new Map<string, AttendanceException>();
        prev.forEach(x => map.set(x.id, x));
        (localEx || []).forEach(x => map.set(x.id, x));
        fsEx.forEach(x => map.set(x.id, x));
        const merged = Array.from(map.values());
        saveCache('exceptions', merged);
        return merged;
      });

      setOvertimeRecordsState(prev => {
        const map = new Map<string, OvertimeRecord>();
        prev.forEach(r => map.set(r.id, r));
        (localOt || []).forEach(r => map.set(r.id, r));
        fsOt.forEach(r => map.set(r.id, r));
        const merged = Array.from(map.values());
        saveCache('overtime', merged);
        return merged;
      });

      setSblRecordsState(prev => {
        const map = new Map<string, SBLRecord>();
        prev.forEach(r => map.set(r.id, r));
        (localSbl || []).forEach(r => map.set(r.id, r));
        fsSbl.forEach(r => map.set(r.id, r));
        const merged = Array.from(map.values());
        saveCache('sbl', merged);
        return merged;
      });

      setForceAttendanceRecordsState(prev => {
        const map = new Map<string, ForceAttendanceRecord>();
        prev.forEach(r => map.set(r.id, r));
        (localForce || []).forEach(r => map.set(r.id, r));
        fsForce.forEach(r => map.set(r.id, r));
        const merged = Array.from(map.values());
        saveCache('force_attendance', merged);
        return merged;
      });

      setPayrollRunsState(prev => {
        const map = new Map<string, PayrollRun>();
        prev.forEach(r => map.set(r.id, r));
        (localPayroll || []).forEach(r => map.set(r.id, r));
        fsPayroll.forEach(r => map.set(r.id, r));
        const merged = Array.from(map.values());
        saveCache('payroll_runs', merged);
        return merged;
      });

      toast.success('System synchronized & recalculated successfully!', { id: tId });
    } catch (e: any) {
      toast.error('Sync failed: ' + (e?.message || 'Error syncing data'), { id: tId });
    }
  }, [computePunchesDigest]);
  const resetError = useCallback(() => setLastError(null), []);

  const openEmployeeProfile = useCallback((id: string) => setSelectedEmployeeId(id), []);
  const closeEmployeeProfile = useCallback(() => setSelectedEmployeeId(null), []);

  const setFieldRecords = useCallback(async (records: FieldAttendanceRecord[], fileName?: string, importType?: 'matrix' | 'flat' | 'sample') => {
    setFieldRecordsState(records);
    saveCache('field_records', records);
    saveLocalTable('field_attendance_audit', records);

    if (fileName !== undefined) {
      setFieldMusterFileNameState(fileName);
      localStorage.setItem('hris_cache_field_filename', fileName);
    }
    if (importType !== undefined) {
      setFieldImportTypeState(importType);
      localStorage.setItem('hris_cache_field_import_type', importType);
    }
  }, []);

  const saveAuditDecision = useCallback(async (key: string, decision: any) => {
    setAuditDecisionsState(prev => {
      const updated = { ...prev, [key]: decision };
      saveCache('audit_decisions', updated);
      const decArr = Object.entries(updated).map(([id, val]) => ({ id, ...(val as object) }));
      saveLocalTable('audit_decisions', decArr);
      return updated;
    });
  }, []);

  const saveAuditDecisionsBatch = useCallback(async (decisionsMap: Record<string, any>) => {
    setAuditDecisionsState(prev => {
      const updated = { ...prev, ...decisionsMap };
      saveCache('audit_decisions', updated);
      const decArr = Object.entries(updated).map(([id, val]) => ({ id, ...(val as object) }));
      saveLocalTable('audit_decisions', decArr);
      return updated;
    });
  }, []);

  const clearFieldMusterData = useCallback(async () => {
    setFieldRecordsState([]);
    setFieldMusterFileNameState('');
    setAuditDecisionsState({});
    saveCache('field_records', []);
    saveCache('audit_decisions', {});
    localStorage.removeItem('hris_cache_field_filename');
    localStorage.removeItem('hris_cache_field_import_type');
    await purgeLocalTable('field_attendance_audit').catch(() => {});
    await purgeLocalTable('audit_decisions').catch(() => {});
    toast.success('Field Muster & Audit data cleared successfully');
  }, []);

  const setAuditDateRange = useCallback((range: { startDate: string; endDate: string }) => {
    setAuditDateRangeState(range);
    saveCache('audit_date_range', range);
  }, []);

  const reportError = useCallback((error: unknown, operationType: OperationType = OperationType.WRITE, path: string | null = null) => {
    handleFirestoreError(error, operationType, path);
  }, [handleFirestoreError]);

  const allowedEmployeeIds = useMemo(() => {
    if (!effectiveUserProfile || effectiveUserProfile.role === 'Super Admin') return null;
    const allowed = new Set<string>();
    for (const emp of employees) {
      if (isEmployeeInUserScope(emp, effectiveUserProfile)) {
        allowed.add(String(emp.id).trim());
      }
    }
    return allowed;
  }, [employees, effectiveUserProfile]);

  const scopedEmployees = useMemo(() => {
    if (!allowedEmployeeIds) return employees;
    return employees.filter(e => allowedEmployeeIds.has(String(e.id).trim()));
  }, [employees, allowedEmployeeIds]);

  const scopedPunches = useMemo(() => {
    if (!allowedEmployeeIds) return punches;
    return punches.filter(p => allowedEmployeeIds.has(String(p.employeeId || '').trim()));
  }, [punches, allowedEmployeeIds]);

  const scopedProcessedData = useMemo(() => {
    if (!allowedEmployeeIds) return processedData;
    return processedData.filter(p => allowedEmployeeIds.has(String(p.employeeId || '').trim()));
  }, [processedData, allowedEmployeeIds]);

  const scopedShiftAssignments = useMemo(() => {
    if (!allowedEmployeeIds) return shiftAssignments;
    return shiftAssignments.filter(a => allowedEmployeeIds.has(String(a.employeeId || '').trim()));
  }, [shiftAssignments, allowedEmployeeIds]);

  const scopedAssignmentLogs = useMemo(() => {
    if (!allowedEmployeeIds) return assignmentLogs;
    return assignmentLogs.filter(a => allowedEmployeeIds.has(String(a.employeeId || '').trim()));
  }, [assignmentLogs, allowedEmployeeIds]);

  const scopedExceptions = useMemo(() => {
    if (!allowedEmployeeIds) return exceptions;
    return exceptions.filter(ex => allowedEmployeeIds.has(String(ex.employeeId || '').trim()));
  }, [exceptions, allowedEmployeeIds]);

  const scopedOvertimeRecords = useMemo(() => {
    if (!allowedEmployeeIds) return overtimeRecords;
    return overtimeRecords.filter(r => allowedEmployeeIds.has(String(r.employeeId || '').trim()));
  }, [overtimeRecords, allowedEmployeeIds]);

  const scopedSblRecords = useMemo(() => {
    if (!allowedEmployeeIds) return sblRecords;
    return sblRecords.filter(r => allowedEmployeeIds.has(String(r.employeeId || '').trim()));
  }, [sblRecords, allowedEmployeeIds]);

  const scopedForceAttendanceRecords = useMemo(() => {
    if (!allowedEmployeeIds) return forceAttendanceRecords;
    return forceAttendanceRecords.filter(r => allowedEmployeeIds.has(String(r.employeeId || '').trim()));
  }, [forceAttendanceRecords, allowedEmployeeIds]);

  const scopedMovements = useMemo(() => {
    if (!allowedEmployeeIds) return movements;
    return movements.filter(m => allowedEmployeeIds.has(String(m.employeeId || '').trim()));
  }, [movements, allowedEmployeeIds]);

  const scopedFieldRecords = useMemo(() => {
    if (!allowedEmployeeIds) return fieldRecords;
    return fieldRecords.filter(f => allowedEmployeeIds.has(String((f as any).employeeId || '').trim()));
  }, [fieldRecords, allowedEmployeeIds]);

  const scopedPayrollRuns = useMemo(() => {
    if (!allowedEmployeeIds) return payrollRuns;
    return payrollRuns.map(run => {
      const filteredRecords = (run.records || []).filter(rec => allowedEmployeeIds.has(String(rec.employeeId || '').trim()));
      const totalGrossSalary = filteredRecords.reduce((s, r) => s + (r.grossSalary || 0), 0);
      const totalNetSalary = filteredRecords.reduce((s, r) => s + (r.netSalary || 0), 0);
      const totalDeductions = filteredRecords.reduce((s, r) => s + (r.totalDeductions || 0), 0);
      const totalOvertimePay = filteredRecords.reduce((s, r) => s + (r.overtimePay || 0), 0);
      const totalTax = filteredRecords.reduce((s, r) => s + (r.incomeTaxTDS || 0), 0);
      return {
        ...run,
        records: filteredRecords,
        totalEmployees: filteredRecords.length,
        totalGrossSalary,
        totalNetSalary,
        totalDeductions,
        totalOvertimePay,
        totalTax
      };
    });
  }, [payrollRuns, allowedEmployeeIds]);

  const value: StoreState = {
    employees: scopedEmployees, setEmployees, updateEmployee, addEmployee, deleteEmployeesBatch,
    punches: scopedPunches, setPunches, addPunch, updatePunch, deletePunch, deletePunchBatch, deletePunchesBatch, clearPunches, fetchPunches, refreshPunchesFromSqlite,
    settings, setSettings,
    shiftAssignments: scopedShiftAssignments, setShiftAssignments,
    assignmentLogs: scopedAssignmentLogs,
    addAssignmentLog,
    exceptions: scopedExceptions,
    auditLogs,
    addAuditLog,
    updateException,
    setExceptionsBatch,
    overtimeRecords: scopedOvertimeRecords,
    sblRecords: scopedSblRecords,
    forceAttendanceRecords: scopedForceAttendanceRecords,
    payrollRuns: scopedPayrollRuns,
    zkDevices,
    zkUserMappings,
    zkSyncLogs,
    zkUnmappedPunches,
    addZkDevice,
    updateZkDevice,
    deleteZkDevice,
    mapZkUser,
    unmapZkUser,
    syncZkDevice,
    syncAllZkDevices,
    reconcileSystemZkData,
    resolveUnmappedPunches,
    clearZkSyncLogs,
    refreshZkTablesFromSqlite,
    fieldRecords: scopedFieldRecords,
    fieldMusterFileName,
    fieldImportType,
    auditDecisions,
    auditDateRange,
    setFieldRecords,
    saveAuditDecision,
    saveAuditDecisionsBatch,
    clearFieldMusterData,
    setAuditDateRange,
    updateOvertime,
    addOvertime,
    setOvertimeBatch,
    deleteOvertime,
    deleteOvertimeBatch,
    updateSBL,
    addSBL,
    setSBLBatch,
    deleteSBL,
    deleteSBLBatch,
    addForceAttendance,
    createPayrollRun,
    recalculatePayrollRun,
    updatePayrollRecord,
    approvePayrollRun,
    disbursePayrollRun,
    deletePayrollRun,
    movements: scopedMovements,
    addMovement,
    recordSeparation,
    recordGeneralMovement,
    updateMovement,
    deleteMovement,
    setMovementsBatch,
    calculationSource, setCalculationSource,
    processedData: scopedProcessedData,
    user, setUser,
    isAdmin: isSuperAdmin, setIsAdmin,
    isSuperAdmin,
    currentUserProfile, setCurrentUserProfile,
    previewUserProfile, setPreviewUserProfile,
    effectiveUserProfile,
    canAccessModule,
    refreshCurrentUserProfile,
    isOtpVerified, setIsOtpVerified,
    theme, setTheme,
    globalSearchTerm, setGlobalSearchTerm,
    selectedEmployeeId,
    openEmployeeProfile,
    closeEmployeeProfile,
    isInitializing,
    lastError,
    quotaExceeded,
    recalculate,
    clearAllData,
    resetError,
    reportError
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useAppStore must be used within a StoreProvider');
  }
  return context;
}

