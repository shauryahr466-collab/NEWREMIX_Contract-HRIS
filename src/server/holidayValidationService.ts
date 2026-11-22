import {
  getSqliteDb,
  saveSqliteDb,
  createDatabaseBackup,
  withSqliteWriteLock,
  withReadOnlySqliteSnapshot,
} from './sqliteDb.js';
import type {
  Employee,
  ForceAttendanceRecord,
  HolidayMasterRecord,
  HolidayPunchPolicy,
  HolidayValidationReport,
  RawPunch,
  Settings,
  ShiftAssignment,
} from '../types.js';
import {
  auditAttendanceAgainstHolidays,
  buildHolidayMasterMap,
  validatePunchesAgainstHolidays,
  validateForceAttendanceAgainstHolidays,
} from '../lib/holidayValidation.js';
import { processPunches } from '../lib/engine.js';

function readConfigAndMasterHolidaysFromDb(db: any): {
  settingsObj: Partial<Settings>;
  masterRows: HolidayMasterRecord[];
  holidaysSyncedToTable: number;
  unifiedHolidays: HolidayMasterRecord[];
} {
  let settingsObj: Partial<Settings> = {};
  try {
    const sRes = db.exec("SELECT data FROM settings WHERE id = 'config' LIMIT 1");
    if (sRes.length > 0 && sRes[0].values.length > 0 && sRes[0].values[0][0]) {
      settingsObj = JSON.parse(String(sRes[0].values[0][0]));
    }
  } catch {}

  const masterRows: HolidayMasterRecord[] = [];
  let holidaysSyncedToTable = 0;
  try {
    const hRes = db.exec('SELECT id, date, name, data FROM holidays');
    if (hRes.length > 0) {
      holidaysSyncedToTable = hRes[0].values.length;
      for (const r of hRes[0].values) {
        const id = String(r[0] || '');
        const date = String(r[1] || '').trim().slice(0, 10);
        const name = String(r[2] || '').trim();
        let dataObj: any = {};
        if (r[3]) {
          try {
            dataObj = JSON.parse(String(r[3]));
          } catch {}
        }
        const finalDate = String(dataObj.date || date).trim().slice(0, 10);
        if (!finalDate) continue;
        masterRows.push({
          id: id || dataObj.id || `hol_${finalDate.replace(/-/g, '')}`,
          date: finalDate,
          name: String(dataObj.name || name || 'Public Holiday').trim(),
          type: dataObj.type || 'National',
          preventPunches: Boolean(dataObj.preventPunches),
          allowWorkedPph: dataObj.allowWorkedPph !== undefined ? Boolean(dataObj.allowWorkedPph) : true,
        });
      }
    }
  } catch {}

  const unifiedMap = buildHolidayMasterMap(
    masterRows,
    Array.isArray(settingsObj.holidays) ? settingsObj.holidays : []
  );
  const unifiedHolidays = Array.from(unifiedMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    settingsObj,
    masterRows,
    holidaysSyncedToTable,
    unifiedHolidays,
  };
}

/**
 * Synchronizes SQLite `holidays` master table <-> `settings.holidays`.
 * Ensures Public Holidays added in Settings always live in the dedicated `holidays` table.
 */
export function syncHolidaysMasterTableInDb(
  db: any,
  overrideHolidays?: HolidayMasterRecord[]
): { syncedCount: number; holidays: HolidayMasterRecord[] } {
  const { settingsObj, masterRows } = readConfigAndMasterHolidaysFromDb(db);

  const nextSource =
    Array.isArray(overrideHolidays)
      ? buildHolidayMasterMap(overrideHolidays, [])
      : buildHolidayMasterMap(masterRows, Array.isArray(settingsObj.holidays) ? settingsObj.holidays : []);

  const unified = Array.from(nextSource.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Rewrite master holidays table cleanly so deletions and updates match authoritative settings
  db.run('DELETE FROM holidays');
  const stmt = db.prepare('INSERT INTO holidays (id, date, name, data) VALUES (?, ?, ?, ?)');
  for (const h of unified) {
    const id = h.id || `hol_${h.date.replace(/-/g, '')}`;
    const payload: HolidayMasterRecord = {
      id,
      date: h.date,
      name: h.name,
      type: h.type || 'National',
      preventPunches: Boolean(h.preventPunches),
      allowWorkedPph: h.allowWorkedPph !== undefined ? Boolean(h.allowWorkedPph) : true,
    };
    stmt.run([id, payload.date, payload.name, JSON.stringify(payload)]);
  }
  stmt.free();

  // Keep settings.holidays synchronized if missing or out of sync
  if (!overrideHolidays && Object.keys(settingsObj).length > 0) {
    const existingLen = Array.isArray(settingsObj.holidays) ? settingsObj.holidays.length : 0;
    if (existingLen !== unified.length) {
      const updatedSettings = { ...settingsObj, holidays: unified };
      const now = new Date().toISOString();
      const sStmt = db.prepare(`
        INSERT INTO settings (id, data, updated_at)
        VALUES ('config', ?, ?)
        ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
      `);
      sStmt.run([JSON.stringify(updatedSettings), now]);
      sStmt.free();
    }
  }

  return { syncedCount: unified.length, holidays: unified };
}

export async function syncHolidaysMasterTableWithLock(
  overrideHolidays?: HolidayMasterRecord[]
): Promise<{ syncedCount: number; holidays: HolidayMasterRecord[] }> {
  return withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');
    const result = syncHolidaysMasterTableInDb(db, overrideHolidays);
    db.run('COMMIT');
    saveSqliteDb();
    return result;
  });
}

function loadSqliteAttendanceSnapshotData(db: any) {
  const { settingsObj, holidaysSyncedToTable, unifiedHolidays } = readConfigAndMasterHolidaysFromDb(db);

  const employees: Employee[] = [];
  try {
    const empRes = db.exec('SELECT id, name, department, designation, shift_id, joining_date, status, data FROM employees');
    if (empRes.length > 0) {
      for (const r of empRes[0].values) {
        let dataObj: any = {};
        if (r[7]) {
          try { dataObj = JSON.parse(String(r[7])); } catch {}
        }
        employees.push({
          ...dataObj,
          id: String(r[0] || dataObj.id || '').trim(),
          name: String(dataObj.name || r[1] || r[0] || '').trim(),
          department: String(dataObj.department || r[2] || '').trim(),
          designation: String(dataObj.designation || r[3] || '').trim(),
          shiftId: String(dataObj.shiftId || r[4] || '').trim(),
          joiningDate: String(dataObj.joiningDate || r[5] || '').trim(),
          status: (dataObj.status || r[6] || 'Active') as any,
        });
      }
    }
  } catch {}

  const punches: RawPunch[] = [];
  try {
    const pRes = db.exec('SELECT id, employee_id, punch_datetime, device_id, source, data FROM attendance_punches');
    if (pRes.length > 0) {
      for (const r of pRes[0].values) {
        let dataObj: any = {};
        if (r[5]) {
          try { dataObj = JSON.parse(String(r[5])); } catch {}
        }
        const dt = String(dataObj.punchDatetime || r[2] || '').trim().replace(' ', 'T');
        const empId = String(dataObj.employeeId || r[1] || '').trim();
        if (!empId || !dt) continue;
        punches.push({
          ...dataObj,
          id: String(dataObj.id || r[0] || `${empId}_${dt}`),
          employeeId: empId,
          punchDatetime: dt,
          deviceId: String(dataObj.deviceId ?? r[3] ?? ''),
          source: (dataObj.source || r[4] || 'ZKTeco') as any,
        });
      }
    }
  } catch {}

  const shiftAssignments: ShiftAssignment[] = [];
  try {
    const saRes = db.exec('SELECT employee_id, date, shift_id, data FROM shift_assignments');
    if (saRes.length > 0) {
      for (const r of saRes[0].values) {
        let dataObj: any = {};
        if (r[3]) {
          try { dataObj = JSON.parse(String(r[3])); } catch {}
        }
        const empId = String(dataObj.employeeId || r[0] || '').trim();
        const date = String(dataObj.date || r[1] || '').trim();
        const shiftId = String(dataObj.shiftId || r[2] || '').trim();
        if (empId && date) {
          shiftAssignments.push({ ...dataObj, employeeId: empId, date, shiftId });
        }
      }
    }
  } catch {}

  const forceAttendanceRecords: ForceAttendanceRecord[] = [];
  try {
    const faRes = db.exec('SELECT data FROM force_attendance');
    if (faRes.length > 0) {
      for (const r of faRes[0].values) {
        try {
          const obj = JSON.parse(String(r[0] || '{}'));
          if (obj && obj.employeeId && obj.date) forceAttendanceRecords.push(obj);
        } catch {}
      }
    }
  } catch {}

  const fullSettings: Settings = {
    duplicateMergeTime: Number(settingsObj.duplicateMergeTime ?? 5),
    shiftStartTime: settingsObj.shiftStartTime || '09:00',
    shiftEndTime: settingsObj.shiftEndTime || '18:00',
    graceTime: Number(settingsObj.graceTime ?? 15),
    lateThreshold: Number(settingsObj.lateThreshold ?? 30),
    overtimeThreshold: Number(settingsObj.overtimeThreshold ?? 8),
    companyName: settingsObj.companyName || 'Contractor HRIS',
    reportTitle: settingsObj.reportTitle || 'Contractor Attendance Report',
    shifts: Array.isArray(settingsObj.shifts) ? settingsObj.shifts : [],
    calculationStartDate: settingsObj.calculationStartDate,
    calculationEndDate: settingsObj.calculationEndDate,
    holidays: unifiedHolidays,
    holidayPunchPolicy: (settingsObj.holidayPunchPolicy || 'prevent_overlaps') as HolidayPunchPolicy,
    payrollConfig: settingsObj.payrollConfig,
  };

  return {
    settings: fullSettings,
    holidays: unifiedHolidays,
    holidaysSyncedToTable,
    employees,
    punches,
    shiftAssignments,
    forceAttendanceRecords,
  };
}

export function validateIncomingPunchesAgainstDb(
  db: any,
  incomingPunches: RawPunch[],
  options?: { policy?: HolidayPunchPolicy }
) {
  const snapshot = loadSqliteAttendanceSnapshotData(db);
  return validatePunchesAgainstHolidays({
    incomingPunches,
    existingPunches: snapshot.punches,
    holidays: snapshot.holidays,
    employees: snapshot.employees,
    shifts: snapshot.settings.shifts,
    shiftAssignments: snapshot.shiftAssignments,
    mergeMinutes: snapshot.settings.duplicateMergeTime,
    policy: options?.policy || snapshot.settings.holidayPunchPolicy,
  });
}

export function validateForceAttendanceAgainstDb(
  db: any,
  record: ForceAttendanceRecord
) {
  const snapshot = loadSqliteAttendanceSnapshotData(db);
  return validateForceAttendanceAgainstHolidays({
    record,
    holidays: snapshot.holidays,
    existingPunches: snapshot.punches,
    policy: snapshot.settings.holidayPunchPolicy,
  });
}

export async function generateSqliteHolidayValidationReport(): Promise<HolidayValidationReport> {
  return withReadOnlySqliteSnapshot((db) => {
    const snapshot = loadSqliteAttendanceSnapshotData(db);

    // Compute processed attendance across configured period + any holiday dates so status correctness is audited
    const holidayDates = snapshot.holidays.map(h => h.date).sort();
    const minHoliday = holidayDates[0];
    const maxHoliday = holidayDates[holidayDates.length - 1];

    const effectiveStart =
      snapshot.settings.calculationStartDate && minHoliday
        ? (snapshot.settings.calculationStartDate < minHoliday ? snapshot.settings.calculationStartDate : minHoliday)
        : (snapshot.settings.calculationStartDate || minHoliday);

    const effectiveEnd =
      snapshot.settings.calculationEndDate && maxHoliday
        ? (snapshot.settings.calculationEndDate > maxHoliday ? snapshot.settings.calculationEndDate : maxHoliday)
        : (snapshot.settings.calculationEndDate || maxHoliday);

    const auditSettings: Settings = {
      ...snapshot.settings,
      calculationStartDate: effectiveStart,
      calculationEndDate: effectiveEnd,
    };

    const processedAttendance =
      snapshot.holidays.length > 0 && snapshot.employees.length > 0
        ? processPunches(snapshot.punches, snapshot.employees, auditSettings, snapshot.shiftAssignments)
        : [];

    return auditAttendanceAgainstHolidays({
      punches: snapshot.punches,
      employees: snapshot.employees,
      holidays: snapshot.holidays,
      settings: snapshot.settings,
      shiftAssignments: snapshot.shiftAssignments,
      processedAttendance,
      forceAttendanceRecords: snapshot.forceAttendanceRecords,
      holidaysSyncedToTable: snapshot.holidaysSyncedToTable,
    });
  });
}

export async function reconcileHolidaysAndPreventOverlapsInSqlite(options?: {
  removeConflictingForceAttendance?: boolean;
  reconcileByUser?: string;
}): Promise<{
  success: boolean;
  holidaysSynced: number;
  redundantPunchesRemoved: number;
  conflictingForceAttendanceRemoved: number;
  report: HolidayValidationReport;
}> {
  const reconResult = await withSqliteWriteLock(async () => {
    try {
      createDatabaseBackup('before_holiday_overlap_reconcile');
    } catch {}

    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

    const syncRes = syncHolidaysMasterTableInDb(db);
    const snapshot = loadSqliteAttendanceSnapshotData(db);

    const auditBefore = auditAttendanceAgainstHolidays({
      punches: snapshot.punches,
      employees: snapshot.employees,
      holidays: syncRes.holidays,
      settings: snapshot.settings,
      shiftAssignments: snapshot.shiftAssignments,
      forceAttendanceRecords: snapshot.forceAttendanceRecords,
      holidaysSyncedToTable: syncRes.syncedCount,
    });

    let redundantPunchesRemoved = 0;
    if (auditBefore.redundantPunchIdsToClean.length > 0) {
      const delStmt = db.prepare('DELETE FROM attendance_punches WHERE id = ?');
      for (const punchId of auditBefore.redundantPunchIdsToClean) {
        delStmt.run([punchId]);
        redundantPunchesRemoved++;
      }
      delStmt.free();
    }

    let conflictingForceAttendanceRemoved = 0;
    if (options?.removeConflictingForceAttendance !== false) {
      const holidaySet = new Set(syncRes.holidays.map(h => h.date));
      const lockedSet = new Set(
        syncRes.holidays
          .filter(h => h.preventPunches || snapshot.settings.holidayPunchPolicy === 'block_all')
          .map(h => h.date)
      );
      const delFaStmt = db.prepare('DELETE FROM force_attendance WHERE id = ?');
      for (const fa of snapshot.forceAttendanceRecords) {
        const dKey = String(fa.date || '').slice(0, 10);
        if (!holidaySet.has(dKey)) continue;
        const status = String(fa.status || '').trim();
        if (lockedSet.has(dKey) && status !== 'Public Holiday' && status !== 'Holiday') {
          delFaStmt.run([fa.id]);
          conflictingForceAttendanceRemoved++;
        }
      }
      delFaStmt.free();
    }

    // Write reconciliation entry to audit_logs
    const now = new Date().toISOString();
    const auditId = `audit_hol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const auditPayload = {
      id: auditId,
      employeeId: 'SYSTEM',
      employeeName: 'Public Holiday Validation Service',
      date: now.slice(0, 10),
      field: 'Holiday Validation & Overlap Cleanup',
      oldValue: `${auditBefore.overlapConflictsCount} holiday conflicts`,
      newValue: `${redundantPunchesRemoved} redundant punches removed, ${syncRes.syncedCount} holidays synced`,
      changedBy: options?.reconcileByUser || 'System Admin',
      timestamp: now,
      changedAt: now,
      action: 'UPDATE',
      remarks: 'Cross-referenced punch logs with Public Holiday master database and pruned overlapping holiday punches.',
    };
    const auditStmt = db.prepare(
      'INSERT INTO audit_logs (id, employee_id, date, data, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    auditStmt.run([auditId, 'SYSTEM', now.slice(0, 10), JSON.stringify(auditPayload), now]);
    auditStmt.free();

    db.run('COMMIT');
    saveSqliteDb();

    return {
      holidaysSynced: syncRes.syncedCount,
      redundantPunchesRemoved,
      conflictingForceAttendanceRemoved,
    };
  });

  const report = await generateSqliteHolidayValidationReport();
  return {
    success: true,
    ...reconResult,
    report,
  };
}
