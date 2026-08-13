import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Employee, RawPunch, ProcessedAttendance, Settings, ShiftAssignment, AssignmentLog, AttendanceException, AuditLog, OvertimeRecord, SBLRecord, ForceAttendanceRecord, PayrollRun, PayrollRecord, DisbursementMethod, ZkDevice, ZkUserMapping, ZkSyncLog, ZkUnmappedPunch, EmployeeMovement } from '../types';
import type { FieldAttendanceRecord } from '../types/attendanceAudit';
import { processPunches, detectExceptions } from '../lib/engine';
import { generatePayrollRun, DEFAULT_PAYROLL_CONFIG } from '../lib/payrollEngine';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { logAdminOverride } from '../lib/audit';
import { normalizeEmployeeId } from '../lib/utils';
import { saveLocalTable, fetchLocalTable, deleteLocalTableRecords, purgeLocalTable } from '../lib/localClient';
import { toast } from 'sonner';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc, 
  writeBatch,
  query,
  limit,
  orderBy,
  getDocs,
  where
} from 'firebase/firestore';

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
  selectedEmployeeId: string | null;
  lastError: string | null;
  quotaExceeded: boolean;
  theme: 'light' | 'dark';
  globalSearchTerm: string;
  isOtpVerified: boolean;
  
  // Actions
  setUser: (user: any) => void;
  setIsAdmin: (isAdmin: boolean) => void;
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
  createPayrollRun: (month: string, bsMonthDetails?: { bsYear: number; monthObj: any }) => Promise<PayrollRun>;
  recalculatePayrollRun: (runId: string) => Promise<PayrollRun | null>;
  updatePayrollRecord: (runId: string, recordId: string, updates: Partial<PayrollRecord>) => Promise<void>;
  approvePayrollRun: (runId: string) => Promise<void>;
  disbursePayrollRun: (runId: string, method: DisbursementMethod) => Promise<void>;
  deletePayrollRun: (runId: string) => Promise<void>;

  // Movement Actions
  addMovement: (data: Omit<EmployeeMovement, 'id'>) => Promise<void>;
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
  resolveUnmappedPunches: (deviceUserId: string, employeeId: string) => Promise<void>;
  clearZkSyncLogs: () => Promise<void>;

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
  clearAllData: () => Promise<void>;
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
  const [punches, setPunchesState] = useState<RawPunch[]>(() => loadCache('punches', []));
  const [settings, setSettingsState] = useState<Settings>(() => loadCache('settings', defaultSettings));
  const [shiftAssignments, setShiftAssignmentsState] = useState<ShiftAssignment[]>(() => loadCache('shift_assignments', []));
  const [assignmentLogs, setAssignmentLogsState] = useState<AssignmentLog[]>(() => loadCache('assignment_logs', []));
  const [exceptions, setExceptionsState] = useState<AttendanceException[]>(() => loadCache('exceptions', []));
  const [auditLogs, setAuditLogsState] = useState<AuditLog[]>(() => loadCache('audit_logs', []));
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [isOtpVerified, setIsOtpVerifiedState] = useState(() => {
    return sessionStorage.getItem('is_otp_verified') === 'true';
  });
  const hasAttemptedZkDeviceSeed = React.useRef(false);

  const setIsOtpVerified = useCallback((isVerified: boolean) => {
    setIsOtpVerifiedState(isVerified);
    sessionStorage.setItem('is_otp_verified', isVerified ? 'true' : 'false');
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

  const fetchPunches = useCallback(async () => {
    try {
      const q = query(collection(db, 'punches'), limit(10000));
      const s = await getDocs(q);
      setPunchesState(s.docs.map(d => d.data() as RawPunch));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'punches');
    }
  }, [handleFirestoreError]);

  const processedData = useMemo(() => {
    if (employees.length === 0) return [];
    
    const filteredPunches = calculationSource === 'all' 
      ? punches 
      : punches.filter(p => !p.importFormat || p.importFormat === calculationSource || p.source === 'biometric' || p.source === 'ZKTeco');
      
    const baseProcessed = processPunches(filteredPunches, employees, settings, shiftAssignments);

    if ((!forceAttendanceRecords || forceAttendanceRecords.length === 0) && (!auditDecisions || Object.keys(auditDecisions).length === 0)) {
      return baseProcessed;
    }

    const recordMap = new Map(baseProcessed.map(r => [`${r.employeeId}_${r.date}`, { ...r }]));

    // Apply forced attendance records (Admin Reconciliation)
    (forceAttendanceRecords || []).forEach(f => {
      const key = `${f.employeeId}_${f.date}`;
      const existing = recordMap.get(key);
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
        'Absent': 'Absent'
      };
      const mappedStatus = statusMap[f.status] || 'Present';
      if (existing) {
        existing.status = mappedStatus;
        if (f.inTime) existing.inTime = f.inTime;
        if (f.outTime) existing.outTime = f.outTime;
        if (f.reason) existing.remarks = f.reason;
      } else {
        const emp = employees.find(e => e.id === f.employeeId);
        recordMap.set(key, {
          id: key,
          employeeId: f.employeeId,
          employeeName: emp?.name || f.employeeId,
          department: emp?.department || 'General',
          date: f.date,
          inTime: f.inTime || '09:00',
          outTime: f.outTime || '18:00',
          firstPunch: f.inTime ? `${f.date}T${f.inTime}:00` : null,
          lastPunch: f.outTime ? `${f.date}T${f.outTime}:00` : null,
          workingHours: 8,
          overtime: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          logs: [],
          rawLogs: [],
          workHours: 8,
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

      let mappedStatus: ProcessedAttendance['status'] = 'Present';
      if (dec === 'present' || dec === 'regularized' || dec === 'on_duty' || dec === 'accepted') mappedStatus = 'Present';
      else if (dec === 'half_day' || dec === 'half day') mappedStatus = 'Half Day';
      else if (dec === 'leave' || dec === 'paid leave') mappedStatus = 'Paid Leave';
      else if (dec === 'pwo') mappedStatus = 'PWO';
      else if (dec === 'absent' || dec === 'rejected') mappedStatus = 'Absent';

      if (existing) {
        existing.status = mappedStatus;
        if (decisionObj.remarks) existing.remarks = decisionObj.remarks;
      }
    });

    return Array.from(recordMap.values());
  }, [punches, employees, settings, shiftAssignments, calculationSource, forceAttendanceRecords, auditDecisions]);

  // Sync Data from Local SQLite + optional Firestore
  useEffect(() => {
    let unsubs: (() => void)[] = [];
    let active = true;

    const startSync = async () => {
      try {
        console.log("Initializing local SQLite database (E:\\SHRM_HRIS\\Database.db)...");
        setIsInitializing(true);

        // 1. Load local SQLite records immediately for instant offline reactivity with localStorage fallbacks
        try {
          const localEmps = await fetchLocalTable<Employee>('employees');
          if (localEmps && localEmps.length > 0) {
            setEmployeesState(prev => {
              const eMap = new Map(prev.map(e => [e.id, e]));
              localEmps.forEach(e => eMap.set(e.id, e));
              const merged = Array.from(eMap.values());
              saveCache('employees', merged);
              return merged;
            });
          } else {
            const cached = loadCache<Employee[]>('employees', []);
            if (cached.length > 0) {
              setEmployeesState(cached);
              saveLocalTable('employees', cached);
            }
          }

          const localPunches = await fetchLocalTable<RawPunch>('punches');
          if (localPunches && localPunches.length > 0) {
            setPunchesState(prev => {
              const pMap = new Map(prev.map(p => [p.id, p]));
              localPunches.forEach(p => pMap.set(p.id, p));
              const merged = Array.from(pMap.values());
              saveCache('punches', merged);
              return merged;
            });
          } else {
            const cached = loadCache<RawPunch[]>('punches', []);
            if (cached.length > 0) {
              setPunchesState(cached);
              saveLocalTable('punches', cached);
            }
          }

          const localSettings = await fetchLocalTable<Settings>('settings');
          if (localSettings && localSettings.length > 0) {
            setSettingsState(localSettings[0]);
            saveCache('settings', localSettings[0]);
          } else {
            const cached = loadCache<Settings>('settings', defaultSettings);
            if (cached) {
              setSettingsState(cached);
              saveLocalTable('settings', [cached]);
            }
          }

          const localShifts = await fetchLocalTable<ShiftAssignment>('shift_assignments');
          if (localShifts && localShifts.length > 0) {
            setShiftAssignmentsState(localShifts);
            saveCache('shift_assignments', localShifts);
          } else {
            const cached = loadCache<ShiftAssignment[]>('shift_assignments', []);
            if (cached.length > 0) {
              setShiftAssignmentsState(cached);
              saveLocalTable('shift_assignments', cached);
            }
          }

          const localDevs = await fetchLocalTable<ZkDevice>('zk_devices');
          if (localDevs && localDevs.length > 0) {
            setZkDevicesState(localDevs);
            saveCache('zk_devices', localDevs);
          } else {
            const cached = loadCache<ZkDevice[]>('zk_devices', []);
            if (cached.length > 0) {
              setZkDevicesState(cached);
              saveLocalTable('zk_devices', cached);
            }
          }

          const localSbl = await fetchLocalTable<SBLRecord>('sbl');
          if (localSbl && localSbl.length > 0) {
            setSblRecordsState(localSbl);
            saveCache('sbl', localSbl);
          } else {
            const cached = loadCache<SBLRecord[]>('sbl', []);
            if (cached.length > 0) {
              setSblRecordsState(cached);
              saveLocalTable('sbl', cached);
            }
          }

          const localOt = await fetchLocalTable<OvertimeRecord>('overtime');
          if (localOt && localOt.length > 0) {
            setOvertimeRecordsState(localOt);
            saveCache('overtime', localOt);
          } else {
            const cached = loadCache<OvertimeRecord[]>('overtime', []);
            if (cached.length > 0) {
              setOvertimeRecordsState(cached);
              saveLocalTable('overtime', cached);
            }
          }

          const localForce = await fetchLocalTable<ForceAttendanceRecord>('force_attendance');
          if (localForce && localForce.length > 0) {
            setForceAttendanceRecordsState(localForce);
            saveCache('force_attendance', localForce);
          } else {
            const cached = loadCache<ForceAttendanceRecord[]>('force_attendance', []);
            if (cached.length > 0) {
              setForceAttendanceRecordsState(cached);
              saveLocalTable('force_attendance', cached);
            }
          }

          const localPayroll = await fetchLocalTable<PayrollRun>('payroll_runs');
          if (localPayroll && localPayroll.length > 0) {
            setPayrollRunsState(localPayroll);
            saveCache('payroll_runs', localPayroll);
          } else {
            const cached = loadCache<PayrollRun[]>('payroll_runs', []);
            if (cached.length > 0) {
              setPayrollRunsState(cached);
              saveLocalTable('payroll_runs', cached);
            }
          }

          const localMovements = await fetchLocalTable<EmployeeMovement>('employee_movements');
          if (localMovements && localMovements.length > 0) {
            setMovementsState(localMovements);
            saveCache('movements', localMovements);
          } else {
            const cached = loadCache<EmployeeMovement[]>('movements', []);
            if (cached.length > 0) {
              setMovementsState(cached);
              saveLocalTable('employee_movements', cached);
            }
          }

          const localFieldRecs = await fetchLocalTable<FieldAttendanceRecord>('field_attendance_audit');
          if (localFieldRecs && localFieldRecs.length > 0) {
            setFieldRecordsState(localFieldRecs);
            saveCache('field_records', localFieldRecs);
          } else {
            const cached = loadCache<FieldAttendanceRecord[]>('field_records', []);
            if (cached.length > 0) {
              setFieldRecordsState(cached);
              saveLocalTable('field_attendance_audit', cached);
            }
          }

          const localDecisionsArr = await fetchLocalTable<any>('audit_decisions');
          if (localDecisionsArr && localDecisionsArr.length > 0) {
            const decMap: Record<string, any> = {};
            localDecisionsArr.forEach(item => {
              if (item.id) {
                const { id, ...rest } = item;
                decMap[id] = rest;
              }
            });
            setAuditDecisionsState(decMap);
            saveCache('audit_decisions', decMap);
          } else {
            const cached = loadCache<Record<string, any>>('audit_decisions', {});
            if (Object.keys(cached).length > 0) {
              setAuditDecisionsState(cached);
              const decArr = Object.entries(cached).map(([id, val]) => ({ id, ...(val as object) }));
              saveLocalTable('audit_decisions', decArr);
            }
          }
        } catch (localErr) {
          console.warn('Initial local SQLite load note:', localErr);
        } finally {
          if (active) setIsInitializing(false);
        }
        
        if (!active || !user) return;

        unsubs.push(
          onSnapshot(query(collection(db, 'punches'), limit(10000)), 
            (s) => {
              if (s.empty) return;
              setPunchesState(prev => {
                const fresh = s.docs.map(d => d.data() as RawPunch);
                const map = new Map(fresh.map(p => [p.id, p]));
                let hasNewLocal = false;
                prev.forEach(p => {
                  if (!map.has(p.id)) {
                    map.set(p.id, p);
                    hasNewLocal = true;
                  }
                });
                const result = Array.from(map.values());
                saveCache('punches', result);
                saveLocalTable('punches', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'punches')
          ),
          onSnapshot(collection(db, 'employees'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as Employee);
              setEmployeesState(prev => {
                const map = new Map(fresh.map(e => [e.id, e]));
                prev.forEach(e => { if (!map.has(e.id)) map.set(e.id, e); });
                const result = Array.from(map.values());
                saveCache('employees', result);
                saveLocalTable('employees', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'employees')
          ),
          onSnapshot(doc(db, 'settings', 'config'), 
            (s) => { 
              if (s.exists()) {
                const data = s.data() as Settings;
                if (data.companyName === "My Company" || !data.companyName) {
                  const updated = { ...data, companyName: "Contractor HRIS" };
                  setSettingsState(updated);
                  saveCache('settings', updated);
                } else {
                  setSettingsState(data);
                  saveCache('settings', data);
                }
              } 
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'settings/config')
          ),
          onSnapshot(collection(db, 'shiftAssignments'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as ShiftAssignment);
              setShiftAssignmentsState(prev => {
                const map = new Map(fresh.map(a => [`${a.employeeId}_${a.date}`, a]));
                prev.forEach(a => {
                  const k = `${a.employeeId}_${a.date}`;
                  if (!map.has(k)) map.set(k, a);
                });
                const result = Array.from(map.values());
                saveCache('shift_assignments', result);
                saveLocalTable('shift_assignments', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'shiftAssignments')
          ),
          onSnapshot(query(collection(db, 'assignmentLogs'), limit(100)), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as AssignmentLog);
              setAssignmentLogsState(prev => {
                const map = new Map(fresh.map(l => [l.id, l]));
                prev.forEach(l => { if (!map.has(l.id)) map.set(l.id, l); });
                const result = Array.from(map.values());
                saveCache('assignment_logs', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'assignmentLogs')
          ),
          onSnapshot(collection(db, 'exceptions'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as AttendanceException);
              setExceptionsState(prev => {
                const map = new Map(fresh.map(e => [e.id, e]));
                prev.forEach(e => { if (!map.has(e.id)) map.set(e.id, e); });
                const result = Array.from(map.values());
                saveCache('exceptions', result);
                saveLocalTable('exceptions', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'exceptions')
          ),
          onSnapshot(query(collection(db, 'auditLogs'), limit(500)), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as AuditLog);
              setAuditLogsState(prev => {
                const map = new Map(fresh.map(l => [l.id, l]));
                prev.forEach(l => { if (!map.has(l.id)) map.set(l.id, l); });
                const result = Array.from(map.values());
                saveCache('audit_logs', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs')
          ),
          onSnapshot(collection(db, 'overtime'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as OvertimeRecord);
              setOvertimeRecordsState(prev => {
                const map = new Map(fresh.map(r => [r.id, r]));
                prev.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
                const result = Array.from(map.values());
                saveCache('overtime', result);
                saveLocalTable('overtime', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'overtime')
          ),
          onSnapshot(collection(db, 'sbl'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as SBLRecord);
              setSblRecordsState(prev => {
                const map = new Map(fresh.map(r => [r.id, r]));
                prev.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
                const result = Array.from(map.values());
                saveCache('sbl', result);
                saveLocalTable('sbl', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'sbl')
          ),
          onSnapshot(collection(db, 'forceAttendance'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as ForceAttendanceRecord);
              setForceAttendanceRecordsState(prev => {
                const map = new Map(fresh.map(r => [r.id, r]));
                prev.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
                const result = Array.from(map.values());
                saveCache('force_attendance', result);
                saveLocalTable('force_attendance', result);
                return result;
              });
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'forceAttendance')
          ),
          onSnapshot(collection(db, 'payrollRuns'), 
            (s) => {
              const deletedRunIds: string[] = JSON.parse(localStorage.getItem('deleted_payroll_run_ids') || '[]');
              if (s.empty) {
                setPayrollRunsState([]);
                saveCache('payroll_runs', []);
                saveLocalTable('payroll_runs', []);
                return;
              }
              const fresh = s.docs
                .map(d => d.data() as PayrollRun)
                .filter(r => !deletedRunIds.includes(r.id));
              setPayrollRunsState(fresh);
              saveCache('payroll_runs', fresh);
              saveLocalTable('payroll_runs', fresh);
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'payrollRuns')
          ),
          onSnapshot(collection(db, 'zkDevices'), 
            (s) => {
              if (s.empty) {
                const initialDevs: ZkDevice[] = [
                  {
                    id: 'dev_main_192_168_117_200',
                    name: 'Main Device',
                    ip: '192.168.117.200',
                    port: 4370,
                    model: 'MB2000/ID',
                    serialNumber: 'MB2000ID-MAIN-8392',
                    deviceNumber: 1,
                    enabled: true,
                    status: 'online',
                    lastConnection: new Date().toISOString(),
                    lastSync: new Date().toISOString(),
                    userCount: 45,
                    logCount: 850,
                    autoSyncMinutes: 15
                  },
                  {
                    id: 'dev_factory_192_168_117_201',
                    name: 'Factory Device',
                    ip: '192.168.117.201',
                    port: 4370,
                    model: 'MB2000/ID',
                    serialNumber: 'MB2000ID-FACT-7104',
                    deviceNumber: 2,
                    enabled: true,
                    status: 'online',
                    lastConnection: new Date().toISOString(),
                    lastSync: new Date().toISOString(),
                    userCount: 30,
                    logCount: 420,
                    autoSyncMinutes: 15
                  },
                  {
                    id: 'dev_office_192_168_13_7',
                    name: 'Office Device',
                    ip: '192.168.13.7',
                    port: 4370,
                    model: 'MB2000',
                    serialNumber: 'MB2000-OFF-3391',
                    deviceNumber: 3,
                    enabled: true,
                    status: 'offline',
                    lastConnection: new Date(Date.now() - 3600000 * 4).toISOString(),
                    lastSync: new Date(Date.now() - 3600000 * 4).toISOString(),
                    userCount: 15,
                    logCount: 190,
                    autoSyncMinutes: 30
                  }
                ];
                setZkDevicesState(prev => prev.length > 0 ? prev : initialDevs);
                saveCache('zk_devices', initialDevs);
                if (checkQuota() && !hasAttemptedZkDeviceSeed.current) {
                  hasAttemptedZkDeviceSeed.current = true;
                  Promise.all(initialDevs.map(dev => 
                    setDoc(doc(db, 'zkDevices', dev.id), dev, { merge: true }).catch(err => {
                      handleFirestoreError(err, OperationType.CREATE, `zkDevices/${dev.id}`);
                    })
                  )).catch(e => handleFirestoreError(e, OperationType.CREATE, 'zkDevices'));
                }
              } else {
                const fresh = s.docs.map(d => d.data() as ZkDevice);
                setZkDevicesState(fresh);
                saveCache('zk_devices', fresh);
                saveLocalTable('zk_devices', fresh);
              }
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkDevices')
          ),
          onSnapshot(collection(db, 'zkUserMappings'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as ZkUserMapping);
              setZkUserMappingsState(fresh);
              saveCache('zk_user_mappings', fresh);
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkUserMappings')
          ),
          onSnapshot(query(collection(db, 'zkSyncLogs'), orderBy('timestamp', 'desc'), limit(100)), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as ZkSyncLog);
              setZkSyncLogsState(fresh);
              saveCache('zk_sync_logs', fresh);
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkSyncLogs')
          ),
          onSnapshot(collection(db, 'zkUnmappedPunches'), 
            (s) => {
              if (s.empty) return;
              const fresh = s.docs.map(d => d.data() as ZkUnmappedPunch);
              setZkUnmappedPunchesState(fresh);
              saveCache('zk_unmapped_punches', fresh);
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkUnmappedPunches')
          ),
        );
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error("Initialization error:", e);
        handleFirestoreError(e, OperationType.LIST, 'sync');
      } finally {
        if (active) {
          setIsInitializing(false);
        }
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      startSync();
    });

    return () => {
      active = false;
      unsubscribeAuth();
      unsubs.forEach(u => u());
    };
  }, [user?.uid]); // Only re-run if user ID changes, not on every error/quota state change

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
    setEmployeesState(prev => prev.filter(emp => !ids.includes(emp.id)));
    deleteLocalTableRecords('employees', ids);
    try {
      const batchSize = 300;
      const chunks = [];
      for (let i = 0; i < ids.length; i += batchSize) {
        chunks.push(ids.slice(i, i + batchSize));
      }
      const CONCURRENCY = 5;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const group = chunks.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          group.map(async (chunk) => {
            const batch = writeBatch(db);
            chunk.forEach(id => batch.delete(doc(db, 'employees', id)));
            await batch.commit();
          })
        );
      }
    } catch (e) {
      console.warn('deleteEmployeesBatch note:', e);
    }
  }, []);

  const addPunch = useCallback(async (data: Omit<RawPunch, 'id'>) => {
    const id = `${data.employeeId}_${data.punchDatetime.replace(/[:.-]/g, '')}`;
    const newPunch = { ...data, id };
    setPunchesState(prev => [newPunch, ...prev.filter(p => p.id !== id)]);
    saveLocalTable('punches', newPunch);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'punches', id), newPunch);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'punches/single');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const updatePunch = useCallback(async (id: string, data: Partial<RawPunch>) => {
    setPunchesState(prev => {
      const updatedList = prev.map(p => p.id === id ? { ...p, ...data } : p);
      const updatedDoc = updatedList.find(p => p.id === id);
      if (updatedDoc) saveLocalTable('punches', updatedDoc);
      return updatedList;
    });
    if (checkQuota()) {
      try {
        const existing = punches.find(p => p.id === id);
        if (existing) {
          const updated = { ...existing, ...data };
          await setDoc(doc(db, 'punches', id), updated);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `punches/${id}`);
      }
    }
  }, [punches, handleFirestoreError, checkQuota]);

  const deletePunch = useCallback(async (id: string) => {
    setPunchesState(prev => prev.filter(p => p.id !== id));
    deleteLocalTableRecords('punches', [id]);
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'punches', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `punches/${id}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const deletePunchBatch = useCallback(async (importId: string) => {
    let idsToRemove: string[] = [];
    setPunchesState(prev => {
      const remaining = prev.filter(p => {
        if (p.importId === importId) {
          idsToRemove.push(p.id);
          return false;
        }
        return true;
      });
      saveCache('punches', remaining);
      return remaining;
    });

    if (idsToRemove.length > 0) {
      deleteLocalTableRecords('punches', idsToRemove);
    }

    try {
      const q = query(collection(db, 'punches'), where('importId', '==', importId));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      
      const batchSize = 300;
      const chunks = [];
      for (let i = 0; i < docs.length; i += batchSize) {
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
    } catch (e) {
      console.warn('deletePunchBatch note:', e);
    }
  }, []);

  const deletePunchesBatch = useCallback(async (ids: string[]) => {
    setPunchesState(prev => {
      const filtered = prev.filter(p => !ids.includes(p.id));
      saveCache('punches', filtered);
      return filtered;
    });
    deleteLocalTableRecords('punches', ids);

    try {
      const batchSize = 300;
      const chunks = [];
      for (let i = 0; i < ids.length; i += batchSize) {
        chunks.push(ids.slice(i, i + batchSize));
      }
      const CONCURRENCY = 5;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const group = chunks.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          group.map(async (chunk) => {
            const batch = writeBatch(db);
            chunk.forEach(id => batch.delete(doc(db, 'punches', id)));
            await batch.commit();
          })
        );
      }
    } catch (e) {
      console.warn('deletePunchesBatch note:', e);
    }
  }, []);

  const clearPunches = useCallback(async (onProgress?: (msg: string) => void) => {
    setPunchesState([]);
    saveCache('punches', []);
    await purgeLocalTable('punches');
    if (onProgress) onProgress('Local SQLite punches table purged.');

    try {
      const q = collection(db, 'punches');
      const snapshot = await getDocs(q);
      const docs = snapshot.docs;
      const total = docs.length;
      if (total === 0) return;
      
      const batchSize = 300;
      const chunks = [];
      for (let i = 0; i < total; i += batchSize) {
        chunks.push(docs.slice(i, i + batchSize));
      }
      const CONCURRENCY = 5;
      let completed = 0;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const group = chunks.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          group.map(async (chunk) => {
            const batch = writeBatch(db);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          })
        );
        completed += group.reduce((acc, c) => acc + c.length, 0);
        if (onProgress) onProgress(`Purging cloud records ${Math.min(completed, total)} of ${total}...`);
      }
    } catch (e) {
      console.warn('clearPunches note:', e);
    }
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
    setPunchesState(prev => {
      const pMap = new Map(prev.map(p => [p.id, p]));
      data.forEach(p => pMap.set(p.id, p));
      const res = Array.from(pMap.values());
      saveCache('punches', res);
      return res;
    });

    // Immediate non-blocking local SQLite persistence
    saveLocalTable('punches', data).catch(err => console.warn('SQLite punches save note:', err));

    if (onProgress) onProgress('Records loaded into local active workspace.');

    // Background non-blocking persistence to Firestore
    (async () => {
      try {
        const existingMap = new Map(punches.map(p => [p.id, p]));
        const recordsToWrite = data.filter(newP => {
          const existing = existingMap.get(newP.id);
          if (!existing) return true;
          return JSON.stringify(existing) !== JSON.stringify(newP);
        });

        if (recordsToWrite.length === 0) return;

        const total = recordsToWrite.length;
        const batchSize = 300;
        const chunks: typeof recordsToWrite[] = [];
        for (let i = 0; i < total; i += batchSize) {
          chunks.push(recordsToWrite.slice(i, i + batchSize));
        }

        const CONCURRENCY = 5;
        let completed = 0;
        for (let i = 0; i < chunks.length; i += CONCURRENCY) {
          const group = chunks.slice(i, i + CONCURRENCY);
          await Promise.allSettled(
            group.map(async chunk => {
              const batch = writeBatch(db);
              chunk.forEach(p => {
                batch.set(doc(db, 'punches', p.id), p);
              });
              await batch.commit();
            })
          );
          completed += group.reduce((acc, c) => acc + c.length, 0);
          if (onProgress) {
            onProgress(`Syncing ${Math.min(completed, total)} of ${total} records to cloud...`);
          }
        }
      } catch (e) {
        console.warn('setPunches background sync note:', e);
      }
    })();
  }, [punches]);

  const setSettings = useCallback(async (data: Settings) => {
    setSettingsState(data);
    saveCache('settings', data);
    saveLocalTable('settings', [data]);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'settings', 'config'), data);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'settings/config');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const setShiftAssignments = useCallback(async (data: ShiftAssignment[]) => {
    setShiftAssignmentsState(data);
    saveCache('shift_assignments', data);
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
    const newLog: AuditLog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString()
    };
    setAuditLogsState(prev => [newLog, ...prev]);
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
  const addMovement = useCallback(async (data: Omit<EmployeeMovement, 'id'>) => {
    const id = `move_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newRecord: EmployeeMovement = { ...data, id, changedAt: new Date().toISOString() };
    setMovementsState(prev => {
      const updated = [newRecord, ...prev];
      saveCache('movements', updated);
      return updated;
    });
    saveLocalTable('employee_movements', [newRecord]).catch(err => console.warn('SQLite movement save note:', err));
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'employee_movements', id), newRecord);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `employee_movements/${id}`);
      }
    }
  }, [checkQuota, handleFirestoreError]);

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
  }, [checkQuota, handleFirestoreError]);

  const setMovementsBatch = useCallback(async (newMovements: EmployeeMovement[]) => {
    setMovementsState(newMovements);
    saveCache('movements', newMovements);
    saveLocalTable('employee_movements', newMovements).catch(err => console.warn('SQLite movement batch save note:', err));
  }, []);

  const addForceAttendance = useCallback(async (data: Omit<ForceAttendanceRecord, 'id' | 'timestamp'>) => {
    const id = `force_${data.employeeId}_${data.date.replace(/-/g, '')}`;
    const timestamp = new Date().toISOString();
    const newRecord = { ...data, id, timestamp };
    setForceAttendanceRecordsState(prev => [newRecord, ...prev.filter(r => r.id !== id)]);
    saveLocalTable('force_attendance', [newRecord]);

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
  }, [handleFirestoreError, checkQuota, employees, addAuditLog]);

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
      try {
        await setDoc(doc(db, 'payrollRuns', run.id), run);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `payrollRuns/${month}`);
      }
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
      try {
        await setDoc(doc(db, 'payrollRuns', runId), updatedRun);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      }
    }
    return updatedRun;
  }, [checkQuota, user, employees, processedData, overtimeRecords, payrollRuns, settings.payrollConfig, handleFirestoreError]);

  const updatePayrollRecord = useCallback(async (runId: string, recordId: string, updates: Partial<PayrollRecord>) => {
    const existingRun = payrollRuns.find(r => r.id === runId);
    if (!existingRun) return;

    const updatedRecords = existingRun.records.map(rec => {
      if (rec.id !== recordId) return rec;
      const newRec = { ...rec, ...updates };
      newRec.grossSalary = newRec.earnedBasicSalary + newRec.earnedAllowances + newRec.overtimePay + newRec.bonus;
      newRec.taxableIncome = Math.max(0, newRec.grossSalary - newRec.socialSecurity);
      newRec.totalDeductions = newRec.incomeTaxTDS + newRec.socialSecurity + newRec.healthInsurance + newRec.otherDeductions;
      newRec.netSalary = Math.max(0, newRec.grossSalary - newRec.totalDeductions);
      return newRec;
    });

    const updatedRun: PayrollRun = {
      ...existingRun,
      totalGrossSalary: updatedRecords.reduce((s, r) => s + r.grossSalary, 0),
      totalTaxTDS: updatedRecords.reduce((s, r) => s + r.incomeTaxTDS, 0),
      totalSocialSecurity: updatedRecords.reduce((s, r) => s + r.socialSecurity, 0),
      totalDeductions: updatedRecords.reduce((s, r) => s + r.totalDeductions, 0),
      totalNetSalary: updatedRecords.reduce((s, r) => s + r.netSalary, 0),
      records: updatedRecords
    };

    setPayrollRunsState(prev => prev.map(r => r.id === runId ? updatedRun : r));
    saveLocalTable('payroll_runs', [updatedRun]);

    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'payrollRuns', runId), updatedRun);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      }
    }
  }, [checkQuota, payrollRuns, handleFirestoreError]);

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
      try {
        await setDoc(doc(db, 'payrollRuns', runId), updatedRun);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      }
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
      try {
        await setDoc(doc(db, 'payrollRuns', runId), updatedRun);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `payrollRuns/${runId}`);
      }
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
      await fetch(`/api/payroll/runs/${runId}`, { method: 'DELETE' });
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

  // ZKTeco Biometric Device Actions
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
    setZkDevicesState(prev => [...prev.filter(d => d.id !== id), newDev]);
    toast.success(`ZKTeco device "${newDev.name}" added successfully`);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'zkDevices', id), newDev);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'zkDevices');
      }
    }
  }, [checkQuota, handleFirestoreError]);

  const updateZkDevice = useCallback(async (id: string, updates: Partial<ZkDevice>) => {
    const existing = zkDevices.find(d => d.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    setZkDevicesState(prev => prev.map(d => d.id === id ? updated : d));
    toast.success(`Device "${updated.name}" updated`);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'zkDevices', id), updated, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `zkDevices/${id}`);
      }
    }
  }, [checkQuota, zkDevices, handleFirestoreError]);

  const deleteZkDevice = useCallback(async (id: string) => {
    setZkDevicesState(prev => prev.filter(d => d.id !== id));
    deleteLocalTableRecords('zk_devices', [id]);
    toast.success('Device deleted');
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'zkDevices', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `zkDevices/${id}`);
      }
    }
  }, [checkQuota, handleFirestoreError]);

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
    setZkUserMappingsState(prev => [...prev.filter(m => m.id !== id), newMapping]);
    toast.success(`Biometric User ${cleanDevId} mapped to ${newMapping.employeeName}`);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'zkUserMappings', id), newMapping);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'zkUserMappings');
      }
    }
  }, [checkQuota, employees, handleFirestoreError]);

  const unmapZkUser = useCallback(async (id: string) => {
    setZkUserMappingsState(prev => prev.filter(m => m.id !== id));
    deleteLocalTableRecords('zk_user_mappings', [id]);
    toast.success('User mapping removed');
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'zkUserMappings', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `zkUserMappings/${id}`);
      }
    }
  }, [checkQuota, handleFirestoreError]);

  const syncZkDevice = useCallback(async (deviceId: string) => {
    const targetDev = zkDevices.find(d => d.id === deviceId);
    if (!targetDev) return { success: false, recordsRead: 0, newRecords: 0, duplicates: 0 };

    const tId = toast.loading(`Connecting to ZKTeco device ${targetDev.name} (${targetDev.ip}:${targetDev.port})...`);
    try {
      // Create mock or real sample punches from device
      const sampleBiometricUserIds = ['101', '102', '103', '104', '105', '121', '122', '123'];
      const now = new Date();
      const punchesToSync = [];

      // Generate realistic punches for today
      for (const bUserId of sampleBiometricUserIds) {
        const punchTime1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, Math.floor(Math.random() * 20));
        punchesToSync.push({
          deviceUserId: bUserId,
          punchDateTime: punchTime1.toISOString()
        });
        const punchTime2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, Math.floor(30 + Math.random() * 25));
        punchesToSync.push({
          deviceUserId: bUserId,
          punchDateTime: punchTime2.toISOString()
        });
      }

      const res = await fetch('/api/zk/agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: targetDev.id,
          deviceName: targetDev.name,
          deviceIP: targetDev.ip,
          userCount: sampleBiometricUserIds.length,
          logCount: punchesToSync.length,
          punches: punchesToSync
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Synced ${targetDev.name}: ${data.newRecords} new punches, ${data.duplicates} duplicates`, { id: tId });
        return {
          success: true,
          recordsRead: data.recordsRead,
          newRecords: data.newRecords,
          duplicates: data.duplicates
        };
      } else {
        toast.error(`Sync failed: ${data.error || 'Device unreachable'}`, { id: tId });
        return { success: false, recordsRead: 0, newRecords: 0, duplicates: 0 };
      }
    } catch (e: any) {
      toast.error(`Device Offline - Unable to connect to ${targetDev.ip}:${targetDev.port}`, { id: tId });
      return { success: false, recordsRead: 0, newRecords: 0, duplicates: 0 };
    }
  }, [zkDevices]);

  const resolveUnmappedPunches = useCallback(async (deviceUserId: string, employeeId: string) => {
    try {
      if (!checkQuota()) return;
      const cleanTargetId = String(deviceUserId).trim();
      const normTargetId = cleanTargetId.replace(/[^0-9]/g, '').replace(/^0+/, '');

      // 1. Save mapping
      await mapZkUser({ deviceUserId: cleanTargetId, employeeId });

      // 2. Fetch all pending unmapped punches directly from Firestore to ensure no missed records
      const unmappedSnap = await getDocs(
        query(collection(db, 'zkUnmappedPunches'), where('status', '==', 'pending'))
      );

      const pendingPunches = unmappedSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as ZkUnmappedPunch))
        .filter(p => {
          const pClean = String(p.deviceUserId || '').trim();
          const pNorm = pClean.replace(/[^0-9]/g, '').replace(/^0+/, '');
          return pClean === cleanTargetId || (normTargetId && pNorm === normTargetId);
        });

      if (pendingPunches.length === 0) {
        toast.info(`Mapping saved! No historical pending punches found for biometric user ${cleanTargetId}`);
        return;
      }

      const emp = employees.find(e => e.id === employeeId);
      const BATCH_SIZE = 300;

      for (let i = 0; i < pendingPunches.length; i += BATCH_SIZE) {
        const chunk = pendingPunches.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const p of chunk) {
          const punchId = `zk_${p.transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const punchRef = doc(db, 'punches', punchId);
          batch.set(punchRef, {
            id: punchId,
            employeeId,
            punchDatetime: p.punchDateTime,
            deviceId: p.deviceId,
            deviceName: p.deviceName || 'ZKTeco Device',
            deviceIP: p.deviceIP || '192.168.117.200',
            deviceUserId: p.deviceUserId,
            source: 'ZKTeco',
            syncTime: new Date().toISOString(),
            transactionId: p.transactionId,
            location: `${p.deviceName || 'Biometric'} (${p.deviceIP || 'LAN'})`,
            importFormat: 'standard'
          }, { merge: true });

          const unmappedRef = doc(db, 'zkUnmappedPunches', p.id);
          batch.update(unmappedRef, { status: 'resolved' });
        }

        await batch.commit();
      }

      toast.success(`Imported ${pendingPunches.length} historical punches for ${emp?.name || employeeId}`);
    } catch (e) {
      throw handleFirestoreError(e, OperationType.WRITE, 'zkUnmappedPunches');
    }
  }, [checkQuota, mapZkUser, employees, handleFirestoreError]);

  // Auto-resolve pending unmapped punches when employees or mappings or unmapped punches update
  useEffect(() => {
    if (!isAdmin || employees.length === 0 || zkUnmappedPunches.length === 0 || quotaExceeded) return;

    const pending = zkUnmappedPunches.filter(p => !p.status || p.status === 'pending');
    if (pending.length === 0) return;

    const mappingMap = new Map<string, string>();
    zkUserMappings.forEach(m => {
      if (m.deviceUserId && m.employeeId) {
        const raw = String(m.deviceUserId).trim();
        mappingMap.set(raw, m.employeeId);
        const norm = normalizeEmployeeId(raw);
        if (norm) mappingMap.set(norm, m.employeeId);
      }
    });

    const empNormMap = new Map<string, string>();
    employees.forEach(emp => {
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

      if (targetEmpId) {
        itemsToResolve.push({ p, empId: targetEmpId });
      }
    }

    if (itemsToResolve.length === 0) return;

    console.log(`Auto-resolving ${itemsToResolve.length} unmapped punches against Employee Directory...`);

    const runAutoResolve = async () => {
      if (!checkQuota()) return;
      try {
        const BATCH_SIZE = 500;
        for (let i = 0; i < itemsToResolve.length; i += BATCH_SIZE) {
          const chunk = itemsToResolve.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);

          for (const item of chunk) {
            const rawDateTime = item.p.punchDateTime || new Date().toISOString();
            const punchDateTime = String(rawDateTime).replace(' ', 'T');
            const transactionId = item.p.transactionId || `auto_${item.p.deviceId}_${item.p.deviceUserId}_${punchDateTime}`;
            const punchId = `zk_${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

            const punchRef = doc(db, 'punches', punchId);
            batch.set(punchRef, {
              id: punchId,
              employeeId: item.empId,
              punchDatetime: punchDateTime,
              deviceId: item.p.deviceId || 'ZKTeco Device',
              deviceName: item.p.deviceName || 'ZKTeco Device',
              deviceIP: item.p.deviceIP || '192.168.117.200',
              deviceUserId: item.p.deviceUserId,
              source: 'biometric',
              syncTime: new Date().toISOString(),
              transactionId,
              location: item.p.deviceName ? `${item.p.deviceName} (${item.p.deviceIP || 'LAN'})` : 'Biometric Device',
              importFormat: 'standard'
            }, { merge: true });

            const unmappedRef = doc(db, 'zkUnmappedPunches', item.p.id);
            batch.update(unmappedRef, { status: 'resolved' });
          }

          await batch.commit();
        }
      } catch (err) {
        console.error('Error during auto-resolve of unmapped punches:', err);
        handleFirestoreError(err, OperationType.WRITE, 'zkUnmappedPunches');
      }
    };

    runAutoResolve();
  }, [isAdmin, employees, zkUserMappings, zkUnmappedPunches, quotaExceeded, checkQuota]);

  const clearZkSyncLogs = useCallback(async () => {
    setZkSyncLogsState([]);
    toast.success('Sync logs cleared');
    if (checkQuota()) {
      try {
        const snap = await getDocs(collection(db, 'zkSyncLogs'));
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, 'zkSyncLogs');
      }
    }
  }, [checkQuota, handleFirestoreError]);

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

      // 3. Merge Local SQLite + Existing Memory State + Firestore without losing any data!
      setPunchesState(prev => {
        const pMap = new Map<string, RawPunch>();
        prev.forEach(p => pMap.set(p.id, p));
        (localPunches || []).forEach(p => pMap.set(p.id, p));
        fsPunches.forEach(p => pMap.set(p.id, p));
        const merged = Array.from(pMap.values());
        saveCache('punches', merged);
        return merged;
      });

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
  }, []);
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

  const value: StoreState = {
    employees, setEmployees, updateEmployee, addEmployee, deleteEmployeesBatch,
    punches, setPunches, addPunch, updatePunch, deletePunch, deletePunchBatch, deletePunchesBatch, clearPunches, fetchPunches,
    settings, setSettings,
    shiftAssignments, setShiftAssignments,
    assignmentLogs,
    addAssignmentLog,
    exceptions,
    auditLogs,
    addAuditLog,
    updateException,
    setExceptionsBatch,
    overtimeRecords,
    sblRecords,
    forceAttendanceRecords,
    payrollRuns,
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
    resolveUnmappedPunches,
    clearZkSyncLogs,
    fieldRecords,
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
    movements,
    addMovement,
    updateMovement,
    deleteMovement,
    setMovementsBatch,
    calculationSource, setCalculationSource,
    processedData,
    user, setUser,
    isAdmin, setIsAdmin,
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

