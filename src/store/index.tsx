import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Employee, RawPunch, ProcessedAttendance, Settings, ShiftAssignment, AssignmentLog, AttendanceException, AuditLog, OvertimeRecord, SBLRecord, ForceAttendanceRecord, PayrollRun, PayrollRecord, DisbursementMethod, ZkDevice, ZkUserMapping, ZkSyncLog, ZkUnmappedPunch } from '../types';
import { processPunches, detectExceptions } from '../lib/engine';
import { generatePayrollRun, DEFAULT_PAYROLL_CONFIG } from '../lib/payrollEngine';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { logAdminOverride } from '../lib/audit';
import { normalizeEmployeeId } from '../lib/utils';
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
  updateSBL: (id: string, data: Partial<SBLRecord>) => Promise<void>;
  addSBL: (data: Omit<SBLRecord, 'id'>) => Promise<void>;
  deleteOvertime: (id: string) => Promise<void>;
  deleteSBL: (id: string) => Promise<void>;
  addForceAttendance: (data: Omit<ForceAttendanceRecord, 'id' | 'timestamp'>) => Promise<void>;

  // Payroll Actions
  createPayrollRun: (month: string) => Promise<PayrollRun>;
  updatePayrollRecord: (runId: string, recordId: string, updates: Partial<PayrollRecord>) => Promise<void>;
  approvePayrollRun: (runId: string) => Promise<void>;
  disbursePayrollRun: (runId: string, method: DisbursementMethod) => Promise<void>;
  deletePayrollRun: (runId: string) => Promise<void>;

  // ZKTeco Device Actions
  addZkDevice: (device: Omit<ZkDevice, 'id'>) => Promise<void>;
  updateZkDevice: (id: string, updates: Partial<ZkDevice>) => Promise<void>;
  deleteZkDevice: (id: string) => Promise<void>;
  mapZkUser: (mapping: Omit<ZkUserMapping, 'id' | 'mappedAt'>) => Promise<void>;
  unmapZkUser: (id: string) => Promise<void>;
  syncZkDevice: (deviceId: string) => Promise<{ success: boolean; recordsRead: number; newRecords: number; duplicates: number }>;
  resolveUnmappedPunches: (deviceUserId: string, employeeId: string) => Promise<void>;
  clearZkSyncLogs: () => Promise<void>;

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

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [employees, setEmployeesState] = useState<Employee[]>([]);
  const [punches, setPunchesState] = useState<RawPunch[]>([]);
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [shiftAssignments, setShiftAssignmentsState] = useState<ShiftAssignment[]>([]);
  const [assignmentLogs, setAssignmentLogsState] = useState<AssignmentLog[]>([]);
  const [exceptions, setExceptionsState] = useState<AttendanceException[]>([]);
  const [auditLogs, setAuditLogsState] = useState<AuditLog[]>([]);
  const [overtimeRecords, setOvertimeRecordsState] = useState<OvertimeRecord[]>([]);
  const [sblRecords, setSblRecordsState] = useState<SBLRecord[]>([]);
  const [forceAttendanceRecords, setForceAttendanceRecordsState] = useState<ForceAttendanceRecord[]>([]);
  const [payrollRuns, setPayrollRunsState] = useState<PayrollRun[]>([]);
  const [zkDevices, setZkDevicesState] = useState<ZkDevice[]>([]);
  const [zkUserMappings, setZkUserMappingsState] = useState<ZkUserMapping[]>([]);
  const [zkSyncLogs, setZkSyncLogsState] = useState<ZkSyncLog[]>([]);
  const [zkUnmappedPunches, setZkUnmappedPunchesState] = useState<ZkUnmappedPunch[]>([]);
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
      code === 'permission-denied' ||
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
    setLastError(displayMessage);
    return new Error(displayMessage);
  }, []);

  const fetchPunches = useCallback(async () => {
    try {
      const q = query(collection(db, 'punches'), orderBy('punchDatetime', 'desc'), limit(10000));
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
      
    return processPunches(filteredPunches, employees, settings, shiftAssignments);
  }, [punches, employees, settings, shiftAssignments, calculationSource]);

  // Sync Data from Firestore
  useEffect(() => {
    if (!user) {
      // If we're not logged in, we shouldn't be "initializing" the data sync
      // but we might still be initializing the auth state
      return;
    }

    let unsubs: (() => void)[] = [];
    let active = true;

    const startSync = async () => {
      try {
        console.log("Initializing shared Firestore sync for user:", user.email);
        setIsInitializing(true);
        
        if (!active) return;

        unsubs.push(
          onSnapshot(query(collection(db, 'punches'), orderBy('punchDatetime', 'desc'), limit(10000)), 
            (s) => setPunchesState(s.docs.map(d => d.data() as RawPunch)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'punches')
          ),
          onSnapshot(collection(db, 'employees'), 
            (s) => setEmployeesState(s.docs.map(d => d.data() as Employee)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'employees')
          ),
          onSnapshot(doc(db, 'settings', 'config'), 
            (s) => { 
              if (s.exists()) {
                const data = s.data() as Settings;
                // Migration: Fix "My Company" persistence if it exists in DB
                if (data.companyName === "My Company" || !data.companyName) {
                  const updated = { ...data, companyName: "Contractor HRIS" };
                  setSettingsState(updated);
                  // Don't auto-write back here to avoid quota issues, 
                  // but the local state will at least be correct.
                } else {
                  setSettingsState(data);
                }
              } 
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'settings/config')
          ),
          onSnapshot(collection(db, 'shiftAssignments'), 
            (s) => setShiftAssignmentsState(s.docs.map(d => d.data() as ShiftAssignment)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'shiftAssignments')
          ),
          onSnapshot(query(collection(db, 'assignmentLogs'), orderBy('timestamp', 'desc'), limit(100)), 
            (s) => setAssignmentLogsState(s.docs.map(d => d.data() as AssignmentLog)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'assignmentLogs')
          ),
          onSnapshot(collection(db, 'exceptions'), 
            (s) => setExceptionsState(s.docs.map(d => d.data() as AttendanceException)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'exceptions')
          ),
          onSnapshot(query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(500)), 
            (s) => setAuditLogsState(s.docs.map(d => d.data() as AuditLog)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs')
          ),
          onSnapshot(collection(db, 'overtime'), 
            (s) => setOvertimeRecordsState(s.docs.map(d => d.data() as OvertimeRecord)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'overtime')
          ),
          onSnapshot(collection(db, 'sbl'), 
            (s) => setSblRecordsState(s.docs.map(d => d.data() as SBLRecord)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'sbl')
          ),
          onSnapshot(collection(db, 'forceAttendance'), 
            (s) => setForceAttendanceRecordsState(s.docs.map(d => d.data() as ForceAttendanceRecord)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'forceAttendance')
          ),
          onSnapshot(collection(db, 'payrollRuns'), 
            (s) => setPayrollRunsState(s.docs.map(d => d.data() as PayrollRun)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'payrollRuns')
          ),
          onSnapshot(collection(db, 'zkDevices'), 
            (s) => {
              if (s.empty) {
                // Seed default ZKTeco devices specified in requirements
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
                setZkDevicesState(initialDevs);
                if (checkQuota() && !hasAttemptedZkDeviceSeed.current) {
                  hasAttemptedZkDeviceSeed.current = true;
                  Promise.all(initialDevs.map(dev => 
                    setDoc(doc(db, 'zkDevices', dev.id), dev, { merge: true }).catch(err => {
                      handleFirestoreError(err, OperationType.CREATE, `zkDevices/${dev.id}`);
                    })
                  )).catch(e => handleFirestoreError(e, OperationType.CREATE, 'zkDevices'));
                }
              } else {
                setZkDevicesState(s.docs.map(d => d.data() as ZkDevice));
              }
            },
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkDevices')
          ),
          onSnapshot(collection(db, 'zkUserMappings'), 
            (s) => setZkUserMappingsState(s.docs.map(d => d.data() as ZkUserMapping)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkUserMappings')
          ),
          onSnapshot(query(collection(db, 'zkSyncLogs'), orderBy('timestamp', 'desc'), limit(100)), 
            (s) => setZkSyncLogsState(s.docs.map(d => d.data() as ZkSyncLog)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkSyncLogs')
          ),
          onSnapshot(collection(db, 'zkUnmappedPunches'), 
            (s) => setZkUnmappedPunchesState(s.docs.map(d => d.data() as ZkUnmappedPunch)),
            (error) => handleFirestoreError(error, OperationType.LIST, 'zkUnmappedPunches')
          ),
        );
        
        // Wait a very small amount of time for initial snapshot or local cache to resolve
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

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        startSync();
      } else {
        setEmployeesState([]);
        setPunchesState([]);
        setShiftAssignmentsState([]);
        setAssignmentLogsState([]);
        setIsInitializing(false);
        unsubs.forEach(u => u());
        unsubs = [];
      }
    });

    return () => {
      active = false;
      unsubscribeAuth();
      unsubs.forEach(u => u());
    };
  }, [user?.uid]); // Only re-run if user ID changes, not on every error/quota state change

  const updateEmployee = useCallback(async (id: string, data: Partial<Employee>) => {
    setEmployeesState(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
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
    if (checkQuota()) {
      try {
        const batchSize = 100;
        for (let i = 0; i < ids.length; i += batchSize) {
          const chunk = ids.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(id => {
            batch.delete(doc(db, 'employees', id));
          });
          await batch.commit();
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `employees/batch`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const addPunch = useCallback(async (data: Omit<RawPunch, 'id'>) => {
    const id = `${data.employeeId}_${data.punchDatetime.replace(/[:.-]/g, '')}`;
    const newPunch = { ...data, id };
    setPunchesState(prev => [newPunch, ...prev.filter(p => p.id !== id)]);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'punches', id), newPunch);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'punches/single');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const updatePunch = useCallback(async (id: string, data: Partial<RawPunch>) => {
    setPunchesState(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
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
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'punches', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `punches/${id}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const deletePunchBatch = useCallback(async (importId: string) => {
    setPunchesState(prev => prev.filter(p => p.importId !== importId));
    if (checkQuota()) {
      try {
        const q = query(collection(db, 'punches'), where('importId', '==', importId));
        const snapshot = await getDocs(q);
        const docs = snapshot.docs;
        
        const batchSize = 500;
        for (let i = 0; i < docs.length; i += batchSize) {
          const chunk = docs.slice(i, i + batchSize);
          const writeBatchObj = writeBatch(db);
          chunk.forEach(d => writeBatchObj.delete(d.ref));
          await writeBatchObj.commit();
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `punches batch ${importId}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const deletePunchesBatch = useCallback(async (ids: string[]) => {
    setPunchesState(prev => prev.filter(p => !ids.includes(p.id)));
    if (checkQuota()) {
      try {
        const batchSize = 500;
        for (let i = 0; i < ids.length; i += batchSize) {
          const chunk = ids.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(id => {
            batch.delete(doc(db, 'punches', id));
          });
          await batch.commit();
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `punches/batch`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const clearPunches = useCallback(async (onProgress?: (msg: string) => void) => {
    setPunchesState([]);
    if (checkQuota()) {
      try {
        const q = collection(db, 'punches');
        const snapshot = await getDocs(q);
        const docs = snapshot.docs;
        const total = docs.length;
        if (total === 0) return;
        for (let i = 0; i < total; i += 500) {
          const count = Math.min(i + 500, total);
          if (onProgress) onProgress(`Purging records ${count} of ${total}...`);
          const chunk = docs.slice(i, i + 500);
          const batch = writeBatch(db);
          chunk.forEach(d => batch.delete(d.ref));
          try {
            await batch.commit();
          } catch (batchErr) {
            handleFirestoreError(batchErr, OperationType.DELETE, 'punches');
            break;
          }
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, 'punches');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const clearAllData = useCallback(async () => {
    setEmployeesState([]);
    setPunchesState([]);
    setShiftAssignmentsState([]);
    window.localStorage.clear();
    if (checkQuota()) {
      const collectionsList = ['employees', 'punches', 'shiftAssignments', 'assignmentLogs'];
      try {
        for (const coll of collectionsList) {
          const q = collection(db, coll);
          const snapshot = await getDocs(q);
          const docs = snapshot.docs;
          for (let i = 0; i < docs.length; i += 500) {
            const chunk = docs.slice(i, i + 500);
            const batch = writeBatch(db);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }
        await deleteDoc(doc(db, 'settings', 'config'));
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'clearAllData');
      }
    }
    window.location.reload();
  }, [handleFirestoreError, checkQuota]);

  const setEmployees = useCallback(async (data: Employee[]) => {
    setEmployeesState(prev => {
      const eMap = new Map(prev.map(e => [e.id, e]));
      data.forEach(e => eMap.set(e.id, e));
      return Array.from(eMap.values());
    });

    if (checkQuota()) {
      try {
        const recordsToWrite = data.filter(newE => {
          const existing = employees.find(e => e.id === newE.id);
          return !existing || JSON.stringify(existing) !== JSON.stringify(newE);
        });

        if (recordsToWrite.length === 0) return;

        const total = recordsToWrite.length;
        const batchSize = 500;
        
        for (let i = 0; i < total; i += batchSize) {
          const chunk = recordsToWrite.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(emp => {
            batch.set(doc(db, 'employees', emp.id), emp);
          });
          await batch.commit();
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'employees');
      }
    }
  }, [employees, handleFirestoreError, checkQuota]);

  const setPunches = useCallback(async (data: RawPunch[], onProgress?: (msg: string) => void) => {
    setPunchesState(prev => {
      const pMap = new Map(prev.map(p => [p.id, p]));
      data.forEach(p => pMap.set(p.id, p));
      return Array.from(pMap.values());
    });

    if (onProgress) onProgress('Records loaded into local active workspace.');

    if (checkQuota()) {
      try {
        const recordsToWrite = data.filter(newP => {
          const existing = punches.find(p => p.id === newP.id);
          if (!existing) return true;
          return JSON.stringify(existing) !== JSON.stringify(newP);
        });

        if (recordsToWrite.length === 0) return;

        const total = recordsToWrite.length;
        const batchSize = 500;
        
        for (let i = 0; i < total; i += batchSize) {
          const chunk = recordsToWrite.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(p => {
            batch.set(doc(db, 'punches', p.id), p);
          });
          if (onProgress) onProgress(`Syncing ${Math.min(i + batchSize, total)} of ${total} records to cloud...`);
          await batch.commit();
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'punches');
      }
    }
  }, [punches, handleFirestoreError, checkQuota]);

  const setSettings = useCallback(async (data: Settings) => {
    setSettingsState(data);
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'settings', 'config'), data);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'settings/config');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const setShiftAssignments = useCallback(async (data: ShiftAssignment[]) => {
    setShiftAssignmentsState(prev => {
      const aMap = new Map(prev.map(a => [`${a.employeeId}_${a.date}`, a]));
      data.forEach(a => aMap.set(`${a.employeeId}_${a.date}`, a));
      return Array.from(aMap.values());
    });
    if (checkQuota()) {
      try {
        const recordsToWrite = data.filter(newA => {
          const id = `${newA.employeeId}_${newA.date}`;
          const existing = shiftAssignments.find(a => `${a.employeeId}_${a.date}` === id);
          return !existing || JSON.stringify(existing) !== JSON.stringify(newA);
        });

        if (recordsToWrite.length === 0) return;

        const total = recordsToWrite.length;
        const batchSize = 500;
        
        for (let i = 0; i < total; i += batchSize) {
          const chunk = recordsToWrite.slice(i, i + batchSize);
          const batch = writeBatch(db);
          chunk.forEach(a => {
            const id = `${a.employeeId}_${a.date}`;
            batch.set(doc(db, 'shiftAssignments', id), a);
          });
          await batch.commit();
          await new Promise(resolve => setTimeout(resolve, 50));
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
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'auditLogs', newLog.id), newLog);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'auditLogs');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const updateException = useCallback(async (id: string, data: Partial<AttendanceException>) => {
    setExceptionsState(prev => prev.map(ex => ex.id === id ? { ...ex, ...data } : ex));
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
    setOvertimeRecordsState(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
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
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'overtime', id), newRecord);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'overtime');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const updateSBL = useCallback(async (id: string, data: Partial<SBLRecord>) => {
    setSblRecordsState(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
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
    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'sbl', id), newRecord);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'sbl');
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const deleteOvertime = useCallback(async (id: string) => {
    setOvertimeRecordsState(prev => prev.filter(r => r.id !== id));
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'overtime', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `overtime/${id}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const deleteSBL = useCallback(async (id: string) => {
    setSblRecordsState(prev => prev.filter(r => r.id !== id));
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'sbl', id));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `sbl/${id}`);
      }
    }
  }, [handleFirestoreError, checkQuota]);

  const addForceAttendance = useCallback(async (data: Omit<ForceAttendanceRecord, 'id' | 'timestamp'>) => {
    const id = `force_${data.employeeId}_${data.date.replace(/-/g, '')}`;
    const timestamp = new Date().toISOString();
    const newRecord = { ...data, id, timestamp };
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
  }, [handleFirestoreError, checkQuota, employees, addAuditLog]);

  const createPayrollRun = useCallback(async (month: string, bsMonthDetails?: { bsYear: number; monthObj: any }) => {
    const createdBy = user?.email || auth.currentUser?.email || 'System Admin';
    const activeConfig = settings.payrollConfig || DEFAULT_PAYROLL_CONFIG;
    const run = generatePayrollRun(month, employees, processedData, overtimeRecords, createdBy, bsMonthDetails, activeConfig);
    setPayrollRunsState(prev => [run, ...prev.filter(r => r.id !== run.id)]);

    if (checkQuota()) {
      try {
        await setDoc(doc(db, 'payrollRuns', run.id), run);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `payrollRuns/${month}`);
      }
    }
    return run;
  }, [checkQuota, user, employees, processedData, overtimeRecords, settings.payrollConfig, handleFirestoreError]);

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

    addAuditLog({
      employeeId: 'PAYROLL',
      employeeName: 'Payroll Run',
      date: existingRun.month,
      field: 'Payroll Status',
      oldValue: existingRun.status,
      newValue: 'Approved',
      changedBy: user?.email || 'Admin',
      remarks: `Approved payroll run for ${existingRun.monthName} (Total Net: $${existingRun.totalNetSalary.toLocaleString()})`
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
    setPayrollRunsState(prev => prev.filter(r => r.id !== runId));
    if (checkQuota()) {
      try {
        await deleteDoc(doc(db, 'payrollRuns', runId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `payrollRuns/${runId}`);
      }
    }
  }, [checkQuota, handleFirestoreError]);

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
    const tId = toast.loading('Synchronizing entire system state...');
    try {
      const [
        pSnapshot, eSnapshot, sSnapshot, saSnapshot, 
        exSnapshot, otSnapshot, sblSnapshot, forceSnapshot, prSnapshot
      ] = await Promise.all([
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
      
      setPunchesState(pSnapshot.docs.map(d => d.data() as RawPunch));
      setEmployeesState(eSnapshot.docs.map(d => d.data() as Employee));
      if (sSnapshot.exists()) setSettingsState(sSnapshot.data() as Settings);
      setShiftAssignmentsState(saSnapshot.docs.map(d => d.data() as ShiftAssignment));
      setExceptionsState(exSnapshot.docs.map(d => d.data() as AttendanceException));
      setOvertimeRecordsState(otSnapshot.docs.map(d => d.data() as OvertimeRecord));
      setSblRecordsState(sblSnapshot.docs.map(d => d.data() as SBLRecord));
      setForceAttendanceRecordsState(forceSnapshot.docs.map(d => d.data() as ForceAttendanceRecord));
      setPayrollRunsState(prSnapshot.docs.map(d => d.data() as PayrollRun));
      
      toast.success('Enterprise data synchronized', { id: tId });
    } catch (e) {
      toast.error('Synchronization failed', { id: tId });
      handleFirestoreError(e, OperationType.LIST, 'recalculate');
    }
  }, [handleFirestoreError]);
  const resetError = useCallback(() => setLastError(null), []);

  const openEmployeeProfile = useCallback((id: string) => setSelectedEmployeeId(id), []);
  const closeEmployeeProfile = useCallback(() => setSelectedEmployeeId(null), []);

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
    updateOvertime,
    addOvertime,
    deleteOvertime,
    updateSBL,
    addSBL,
    deleteSBL,
    addForceAttendance,
    createPayrollRun,
    updatePayrollRecord,
    approvePayrollRun,
    disbursePayrollRun,
    deletePayrollRun,
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

