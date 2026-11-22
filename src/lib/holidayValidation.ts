import type {
  Employee,
  ForceAttendanceRecord,
  HolidayMasterRecord,
  HolidayOverlapConflict,
  HolidayPunchPolicy,
  HolidayValidationReport,
  ProcessedAttendance,
  RawPunch,
  Settings,
  ShiftAssignment,
  ShiftMaster,
} from '../types';
import { normalizeEmployeeId } from './utils';

export function toExactLocalWallClock(dt: string | undefined | null): string {
  if (!dt) return '';
  const trimmed = String(dt).trim().replace(' ', 'T');
  if (/Z$/i.test(trimmed)) {
    const utcMs = Date.parse(trimmed);
    if (!isNaN(utcMs)) {
      const nptDate = new Date(utcMs + 345 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${nptDate.getUTCFullYear()}-${pad(nptDate.getUTCMonth() + 1)}-${pad(nptDate.getUTCDate())}T${pad(nptDate.getUTCHours())}:${pad(nptDate.getUTCMinutes())}:${pad(nptDate.getUTCSeconds())}`;
    }
  }
  return trimmed.replace(/(\.\d+)?Z$/i, '');
}

export function extractPunchDateKey(dt: string | undefined | null): string {
  const clean = toExactLocalWallClock(dt);
  const match = clean.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function parseWallClockMs(dt: string | undefined | null): number {
  const clean = toExactLocalWallClock(dt);
  if (!clean) return NaN;
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0)
    ).getTime();
  }
  return Date.parse(clean);
}

function getPrevDateStr(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildHolidayMasterMap(
  masterHolidays: HolidayMasterRecord[] = [],
  settingsHolidays: HolidayMasterRecord[] = []
): Map<string, HolidayMasterRecord> {
  const map = new Map<string, HolidayMasterRecord>();
  const addItem = (raw: any, preferNewer: boolean) => {
    if (!raw || !raw.date) return;
    const dateKey = String(raw.date).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    const name = String(raw.name || 'Public Holiday').trim() || 'Public Holiday';
    const existing = map.get(dateKey);
    if (!existing || preferNewer) {
      map.set(dateKey, {
        id: String(raw.id || `hol_${dateKey.replace(/-/g, '')}`),
        date: dateKey,
        name,
        type: raw.type || existing?.type || 'National',
        preventPunches: raw.preventPunches !== undefined ? Boolean(raw.preventPunches) : Boolean(existing?.preventPunches),
        allowWorkedPph: raw.allowWorkedPph !== undefined ? Boolean(raw.allowWorkedPph) : (existing?.allowWorkedPph ?? true),
      });
    }
  };

  for (const h of settingsHolidays) addItem(h, false);
  for (const h of masterHolidays) addItem(h, true);
  return map;
}

export function isNightShiftOvernightOutPunch(params: {
  punchDatetime: string;
  employeeId: string;
  holidayMap: Map<string, HolidayMasterRecord>;
  allPunches: Array<{ employeeId: string; punchDatetime: string }>;
  employees?: Employee[];
  shifts?: ShiftMaster[];
  shiftAssignments?: ShiftAssignment[];
}): boolean {
  const clean = toExactLocalWallClock(params.punchDatetime);
  const dateKey = extractPunchDateKey(clean);
  if (!dateKey || !params.holidayMap.has(dateKey)) return false;

  const ms = parseWallClockMs(clean);
  if (isNaN(ms)) return false;
  const d = new Date(ms);
  const hour = d.getHours() + d.getMinutes() / 60;
  // Overnight shift OUT punches fall early AM before 09:30 AM
  if (hour > 9.5) return false;

  const prevDate = getPrevDateStr(dateKey);
  if (!prevDate || params.holidayMap.has(prevDate)) return false;

  const normEmp = normalizeEmployeeId(params.employeeId);
  const emp = params.employees?.find(e => normalizeEmployeeId(e.id) === normEmp);
  const assign = params.shiftAssignments?.find(
    a => normalizeEmployeeId(a.employeeId) === normEmp && a.date === prevDate
  );
  const shiftId = assign?.shiftId || emp?.shiftId;
  const shift = params.shifts?.find(s => s.id === shiftId);
  const isNightShift = Boolean(shift?.isNightShift) || (shift ? shift.endTime < shift.startTime : false);

  const hasPriorEveningPunch = params.allPunches.some(p => {
    if (normalizeEmployeeId(p.employeeId) !== normEmp) return false;
    const pDate = extractPunchDateKey(p.punchDatetime);
    if (pDate !== prevDate) return false;
    const pMs = parseWallClockMs(p.punchDatetime);
    if (isNaN(pMs)) return false;
    const pHour = new Date(pMs).getHours();
    return pHour >= 17;
  });

  return hasPriorEveningPunch && (isNightShift || hour <= 8.5);
}

export interface ValidatePunchesAgainstHolidaysParams {
  incomingPunches: RawPunch[];
  existingPunches: RawPunch[];
  holidays: HolidayMasterRecord[];
  employees?: Employee[];
  shifts?: ShiftMaster[];
  shiftAssignments?: ShiftAssignment[];
  mergeMinutes?: number;
  policy?: HolidayPunchPolicy;
}

export interface ValidatePunchesAgainstHolidaysResult {
  acceptedPunches: RawPunch[];
  rejectedOverlaps: RawPunch[];
  conflicts: HolidayOverlapConflict[];
  holidayMatchedCount: number;
}

export function validatePunchesAgainstHolidays(
  params: ValidatePunchesAgainstHolidaysParams
): ValidatePunchesAgainstHolidaysResult {
  const holidayMap = buildHolidayMasterMap(params.holidays);
  if (holidayMap.size === 0 || params.incomingPunches.length === 0) {
    return {
      acceptedPunches: params.incomingPunches,
      rejectedOverlaps: [],
      conflicts: [],
      holidayMatchedCount: 0,
    };
  }

  const mergeMinutes = Math.max(1, Number(params.mergeMinutes ?? 5));
  const policy: HolidayPunchPolicy = params.policy || 'prevent_overlaps';
  const empNameMap = new Map<string, { name: string; department: string }>();
  for (const emp of params.employees || []) {
    empNameMap.set(normalizeEmployeeId(emp.id), {
      name: emp.name || emp.id,
      department: emp.department || 'General',
    });
  }

  // Index existing punches by normalized empId + date for holiday overlap checking
  const existingByEmpDate = new Map<string, Array<{ ms: number; dt: string; source: string; id: string }>>();
  for (const p of params.existingPunches) {
    const dKey = extractPunchDateKey(p.punchDatetime);
    if (!dKey || !holidayMap.has(dKey)) continue;
    const ms = parseWallClockMs(p.punchDatetime);
    if (isNaN(ms)) continue;
    const normEmp = normalizeEmployeeId(p.employeeId);
    const bucketKey = `${normEmp}|${dKey}`;
    const list = existingByEmpDate.get(bucketKey) || [];
    list.push({ ms, dt: toExactLocalWallClock(p.punchDatetime), source: p.source || 'ZKTeco', id: p.id });
    existingByEmpDate.set(bucketKey, list);
  }

  const allKnownPunches = [...params.existingPunches, ...params.incomingPunches];
  const acceptedPunches: RawPunch[] = [];
  const rejectedOverlaps: RawPunch[] = [];
  const conflicts: HolidayOverlapConflict[] = [];
  let holidayMatchedCount = 0;

  for (const punch of params.incomingPunches) {
    const cleanDt = toExactLocalWallClock(punch.punchDatetime);
    const dateKey = extractPunchDateKey(cleanDt);
    const holiday = holidayMap.get(dateKey);

    if (!holiday) {
      acceptedPunches.push(punch);
      continue;
    }

    // Legitimate overnight shift checkout in early morning of a holiday does not overlap holiday punches
    if (
      isNightShiftOvernightOutPunch({
        punchDatetime: cleanDt,
        employeeId: punch.employeeId,
        holidayMap,
        allPunches: allKnownPunches,
        employees: params.employees,
        shifts: params.shifts,
        shiftAssignments: params.shiftAssignments,
      })
    ) {
      acceptedPunches.push(punch);
      continue;
    }

    holidayMatchedCount++;
    const normEmp = normalizeEmployeeId(punch.employeeId);
    const empInfo = empNameMap.get(normEmp);
    const incomingMs = parseWallClockMs(cleanDt);
    const incomingSource = String(punch.source || 'Manual');

    // 1. Strict Public Holiday punch lock (global or per-holiday)
    if (policy === 'block_all' || holiday.preventPunches) {
      rejectedOverlaps.push(punch);
      conflicts.push({
        id: `holconf_${normEmp}_${dateKey}_${cleanDt.replace(/[^0-9]/g, '')}`,
        employeeId: punch.employeeId,
        employeeName: empInfo?.name || punch.employeeId,
        department: empInfo?.department,
        date: dateKey,
        holidayName: holiday.name,
        reason: 'BLOCKED_HOLIDAY_PUNCH',
        message: `Blocked punch on Public Holiday "${holiday.name}" (${dateKey}) — attendance auto-marked Public Holiday.`,
        incomingPunchDatetime: cleanDt,
        source: incomingSource,
        severity: 'high',
      });
      continue;
    }

    // 2. Check intra-holiday overlaps (duplicate window or cross-source overlap)
    const bucketKey = `${normEmp}|${dateKey}`;
    const existingList = existingByEmpDate.get(bucketKey) || [];

    const duplicateHit = !isNaN(incomingMs)
      ? existingList.find(ex => Math.abs(incomingMs - ex.ms) / 60000 <= mergeMinutes)
      : undefined;

    if (duplicateHit) {
      rejectedOverlaps.push(punch);
      conflicts.push({
        id: `holdup_${normEmp}_${dateKey}_${cleanDt.replace(/[^0-9]/g, '')}`,
        employeeId: punch.employeeId,
        employeeName: empInfo?.name || punch.employeeId,
        department: empInfo?.department,
        date: dateKey,
        holidayName: holiday.name,
        reason: 'HOLIDAY_DUPLICATE_OVERLAP',
        message: `Prevented overlapping duplicate punch at ${cleanDt.slice(11, 16)} on Public Holiday "${holiday.name}" (within ${mergeMinutes}m of ${duplicateHit.dt.slice(11, 16)}).`,
        incomingPunchDatetime: cleanDt,
        conflictingPunchDatetime: duplicateHit.dt,
        source: incomingSource,
        conflictingSource: duplicateHit.source,
        severity: 'medium',
      });
      continue;
    }

    // 3. Cross-source overlap: Manual / FileImport punch cannot overlap an existing Biometric ZKTeco log on the same holiday
    const isIncomingManual = incomingSource === 'Manual' || incomingSource === 'FileImport';
    const existingZkt = existingList.find(ex => ex.source === 'ZKTeco');
    if (isIncomingManual && existingZkt && policy === 'prevent_overlaps') {
      rejectedOverlaps.push(punch);
      conflicts.push({
        id: `holsrc_${normEmp}_${dateKey}_${cleanDt.replace(/[^0-9]/g, '')}`,
        employeeId: punch.employeeId,
        employeeName: empInfo?.name || punch.employeeId,
        department: empInfo?.department,
        date: dateKey,
        holidayName: holiday.name,
        reason: 'HOLIDAY_CROSS_SOURCE_OVERLAP',
        message: `Prevented ${incomingSource} punch on Public Holiday "${holiday.name}" (${dateKey}) because ZKTeco biometric log (${existingZkt.dt.slice(11, 16)}) already exists.`,
        incomingPunchDatetime: cleanDt,
        conflictingPunchDatetime: existingZkt.dt,
        source: incomingSource,
        conflictingSource: existingZkt.source,
        severity: 'high',
      });
      continue;
    }

    // Accepted non-overlapping holiday punch -> add to bucket so later punches in same batch are also checked against it
    if (!isNaN(incomingMs)) {
      existingList.push({ ms: incomingMs, dt: cleanDt, source: incomingSource, id: punch.id });
      existingByEmpDate.set(bucketKey, existingList);
    }
    acceptedPunches.push(punch);
  }

  return {
    acceptedPunches,
    rejectedOverlaps,
    conflicts,
    holidayMatchedCount,
  };
}

export function validateForceAttendanceAgainstHolidays(params: {
  record: Pick<ForceAttendanceRecord, 'employeeId' | 'date' | 'status' | 'inTime' | 'outTime'>;
  holidays: HolidayMasterRecord[];
  existingPunches: RawPunch[];
  policy?: HolidayPunchPolicy;
}): { allowed: boolean; warning?: string; holidayName?: string; effectiveStatus?: string } {
  const dateKey = String(params.record.date || '').trim().slice(0, 10);
  const holidayMap = buildHolidayMasterMap(params.holidays);
  const holiday = holidayMap.get(dateKey);
  if (!holiday) return { allowed: true };

  const policy = params.policy || 'prevent_overlaps';
  const requestedStatus = String(params.record.status || 'Present').trim();
  const isMarkingHolidayOff = requestedStatus === 'Public Holiday' || requestedStatus === 'Holiday';

  if ((policy === 'block_all' || holiday.preventPunches) && !isMarkingHolidayOff) {
    return {
      allowed: false,
      holidayName: holiday.name,
      effectiveStatus: 'Public Holiday',
      warning: `${dateKey} is a locked Public Holiday ("${holiday.name}"). Punch/Present overrides are blocked to preserve Public Holiday status.`,
    };
  }

  const normEmp = normalizeEmployeeId(params.record.employeeId);
  const bioOnDay = params.existingPunches.filter(
    p => normalizeEmployeeId(p.employeeId) === normEmp && extractPunchDateKey(p.punchDatetime) === dateKey
  );

  if (bioOnDay.length > 0 && (params.record.inTime || params.record.outTime) && policy === 'prevent_overlaps' && !isMarkingHolidayOff) {
    return {
      allowed: false,
      holidayName: holiday.name,
      warning: `Employee ${params.record.employeeId} already has ${bioOnDay.length} punch log(s) on Public Holiday "${holiday.name}" (${dateKey}). Clear or reconcile existing punches first to prevent overlaps.`,
    };
  }

  return { allowed: true, holidayName: holiday.name };
}

export function auditAttendanceAgainstHolidays(params: {
  punches: RawPunch[];
  employees: Employee[];
  holidays: HolidayMasterRecord[];
  settings: Partial<Settings>;
  shiftAssignments?: ShiftAssignment[];
  processedAttendance?: ProcessedAttendance[];
  forceAttendanceRecords?: ForceAttendanceRecord[];
  holidaysSyncedToTable?: number;
}): HolidayValidationReport {
  const holidayMap = buildHolidayMasterMap(params.holidays, params.settings.holidays);
  const policy: HolidayPunchPolicy = params.settings.holidayPunchPolicy || 'prevent_overlaps';
  const mergeMinutes = Math.max(1, Number(params.settings.duplicateMergeTime ?? 5));

  const activeEmployees = params.employees.filter(
    e => !e.status || e.status.toLowerCase() === 'active'
  );
  const empByNorm = new Map<string, Employee>();
  for (const emp of activeEmployees) {
    empByNorm.set(normalizeEmployeeId(emp.id), emp);
  }

  const conflicts: HolidayOverlapConflict[] = [];
  const redundantIdsSet = new Set<string>();
  const punchesByHolidayDate = new Map<string, RawPunch[]>();

  for (const p of params.punches) {
    const dKey = extractPunchDateKey(p.punchDatetime);
    if (!dKey || !holidayMap.has(dKey)) continue;
    const list = punchesByHolidayDate.get(dKey) || [];
    list.push(p);
    punchesByHolidayDate.set(dKey, list);
  }

  const processedByEmpDate = new Map<string, ProcessedAttendance>();
  for (const rec of params.processedAttendance || []) {
    processedByEmpDate.set(`${normalizeEmployeeId(rec.employeeId)}|${rec.date}`, rec);
  }

  let punchesOnHolidays = 0;
  let autoMarkedPublicHolidayDays = 0;
  let workedHolidayPphDays = 0;
  let statusMismatchCount = 0;

  const sortedHolidays = Array.from(holidayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const holidayBreakdown: HolidayValidationReport['holidayBreakdown'] = [];

  for (const holiday of sortedHolidays) {
    const dayPunches = punchesByHolidayDate.get(holiday.date) || [];
    punchesOnHolidays += dayPunches.length;

    // Group punches on this holiday by normalized employee ID
    const punchesByEmp = new Map<string, RawPunch[]>();
    for (const p of dayPunches) {
      const normEmp = normalizeEmployeeId(p.employeeId);
      const list = punchesByEmp.get(normEmp) || [];
      list.push(p);
      punchesByEmp.set(normEmp, list);
    }

    let phCount = 0;
    let pphCount = 0;
    let overlapCount = 0;

    for (const emp of activeEmployees) {
      const normEmp = normalizeEmployeeId(emp.id);
      const proc = processedByEmpDate.get(`${normEmp}|${holiday.date}`);
      if (proc) {
        if (proc.status === 'Public Holiday' || proc.status === 'Holiday') {
          phCount++;
          autoMarkedPublicHolidayDays++;
        } else if (proc.status === 'PPH') {
          pphCount++;
          workedHolidayPphDays++;
        } else {
          // Status should NEVER silently become Absent/Present/Weekly Off on a configured Public Holiday
          statusMismatchCount++;
          conflicts.push({
            id: `holstat_${normEmp}_${holiday.date}`,
            employeeId: emp.id,
            employeeName: emp.name,
            department: emp.department,
            date: holiday.date,
            holidayName: holiday.name,
            reason: 'FORCE_ATTENDANCE_HOLIDAY_CONFLICT',
            message: `Attendance status on Public Holiday "${holiday.name}" is "${proc.status}" instead of "Public Holiday" / "PPH".`,
            severity: 'high',
          });
          overlapCount++;
        }
      } else {
        // Every active employee gets automatically marked Public Holiday on a holiday date
        phCount++;
        autoMarkedPublicHolidayDays++;
      }
    }

    for (const [normEmp, empDayPunches] of punchesByEmp.entries()) {
      const emp = empByNorm.get(normEmp);
      const sorted = [...empDayPunches].sort(
        (a, b) => parseWallClockMs(a.punchDatetime) - parseWallClockMs(b.punchDatetime)
      );

      // Filter out legitimate overnight shift OUT punches before scanning overlaps
      const intraHolidayPunches = sorted.filter(
        p =>
          !isNightShiftOvernightOutPunch({
            punchDatetime: p.punchDatetime,
            employeeId: p.employeeId,
            holidayMap,
            allPunches: params.punches,
            employees: params.employees,
            shifts: params.settings.shifts,
            shiftAssignments: params.shiftAssignments,
          })
      );

      if (intraHolidayPunches.length === 0) continue;

      if (policy === 'block_all' || holiday.preventPunches) {
        intraHolidayPunches.forEach(p => redundantIdsSet.add(p.id));
        overlapCount += intraHolidayPunches.length;
        conflicts.push({
          id: `holblk_${normEmp}_${holiday.date}`,
          employeeId: emp?.id || intraHolidayPunches[0].employeeId,
          employeeName: emp?.name || intraHolidayPunches[0].employeeId,
          department: emp?.department,
          date: holiday.date,
          holidayName: holiday.name,
          reason: 'BLOCKED_HOLIDAY_PUNCH',
          message: `${intraHolidayPunches.length} punch log(s) detected on locked Public Holiday "${holiday.name}". Policy requires auto-marking Public Holiday with zero punch logs.`,
          incomingPunchDatetime: toExactLocalWallClock(intraHolidayPunches[0].punchDatetime),
          source: intraHolidayPunches[0].source || 'ZKTeco',
          redundantPunchIds: intraHolidayPunches.map(p => p.id),
          severity: 'high',
        });
        continue;
      }

      // Check close-window duplicate overlaps & multi-source collisions
      let anchor = intraHolidayPunches[0];
      let anchorMs = parseWallClockMs(anchor.punchDatetime);
      const dupIdsForEmp: string[] = [];

      for (let i = 1; i < intraHolidayPunches.length; i++) {
        const cur = intraHolidayPunches[i];
        const curMs = parseWallClockMs(cur.punchDatetime);
        const diffMin = (curMs - anchorMs) / 60000;
        const isCloseDup = diffMin <= mergeMinutes;
        const isCrossSourceClose =
          (cur.source || 'ZKTeco') !== (anchor.source || 'ZKTeco') && diffMin <= 30;

        if (isCloseDup || isCrossSourceClose) {
          dupIdsForEmp.push(cur.id);
          redundantIdsSet.add(cur.id);
          overlapCount++;
          conflicts.push({
            id: `holovl_${normEmp}_${holiday.date}_${cur.id}`,
            employeeId: emp?.id || cur.employeeId,
            employeeName: emp?.name || cur.employeeId,
            department: emp?.department,
            date: holiday.date,
            holidayName: holiday.name,
            reason: isCrossSourceClose ? 'HOLIDAY_CROSS_SOURCE_OVERLAP' : 'HOLIDAY_DUPLICATE_OVERLAP',
            message: isCrossSourceClose
              ? `Cross-source punch overlap on "${holiday.name}": ${cur.source || 'Manual'} (${toExactLocalWallClock(cur.punchDatetime).slice(11, 16)}) collides with ${anchor.source || 'ZKTeco'} (${toExactLocalWallClock(anchor.punchDatetime).slice(11, 16)}).`
              : `Duplicate punch bounce on "${holiday.name}": ${toExactLocalWallClock(cur.punchDatetime).slice(11, 16)} is ${diffMin.toFixed(1)}m after ${toExactLocalWallClock(anchor.punchDatetime).slice(11, 16)}.`,
            incomingPunchDatetime: toExactLocalWallClock(cur.punchDatetime),
            conflictingPunchDatetime: toExactLocalWallClock(anchor.punchDatetime),
            source: cur.source || 'ZKTeco',
            conflictingSource: anchor.source || 'ZKTeco',
            redundantPunchIds: [cur.id],
            severity: isCrossSourceClose ? 'high' : 'medium',
          });
        } else {
          anchor = cur;
          anchorMs = curMs;
        }
      }
    }

    // Check Force Attendance conflicts on holiday
    for (const fa of params.forceAttendanceRecords || []) {
      if (String(fa.date || '').slice(0, 10) !== holiday.date) continue;
      const faStatus = String(fa.status || '').trim();
      const normEmp = normalizeEmployeeId(fa.employeeId);
      const emp = empByNorm.get(normEmp);
      const hasBioPunches = (punchesByEmp.get(normEmp)?.length || 0) > 0;
      if (
        (policy === 'block_all' || holiday.preventPunches) &&
        faStatus !== 'Public Holiday' &&
        faStatus !== 'Holiday'
      ) {
        overlapCount++;
        conflicts.push({
          id: `holfa_${normEmp}_${holiday.date}`,
          employeeId: emp?.id || fa.employeeId,
          employeeName: emp?.name || fa.employeeId,
          department: emp?.department,
          date: holiday.date,
          holidayName: holiday.name,
          reason: 'FORCE_ATTENDANCE_HOLIDAY_CONFLICT',
          message: `Force Attendance entry (${faStatus || 'Present'} ${fa.inTime}-${fa.outTime}) conflicts with locked Public Holiday "${holiday.name}".`,
          source: 'Force Attendance',
          severity: 'high',
        });
      } else if (hasBioPunches && (fa.inTime || fa.outTime) && faStatus !== 'Public Holiday') {
        overlapCount++;
        conflicts.push({
          id: `holfabio_${normEmp}_${holiday.date}`,
          employeeId: emp?.id || fa.employeeId,
          employeeName: emp?.name || fa.employeeId,
          department: emp?.department,
          date: holiday.date,
          holidayName: holiday.name,
          reason: 'HOLIDAY_CROSS_SOURCE_OVERLAP',
          message: `Force Attendance (${fa.inTime}-${fa.outTime}) overlaps existing biometric punches on Public Holiday "${holiday.name}".`,
          source: 'Force Attendance',
          conflictingSource: 'ZKTeco',
          severity: 'high',
        });
      }
    }

    holidayBreakdown.push({
      date: holiday.date,
      name: holiday.name,
      type: holiday.type || 'National',
      preventPunches: Boolean(holiday.preventPunches || policy === 'block_all'),
      punchCount: dayPunches.length,
      employeeCount: punchesByEmp.size,
      publicHolidayCount: phCount,
      pphCount,
      overlapCount,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    policy,
    totalMasterHolidays: sortedHolidays.length,
    holidaysSyncedToTable: params.holidaysSyncedToTable ?? sortedHolidays.length,
    activeEmployeesCovered: activeEmployees.length,
    punchesOnHolidays,
    autoMarkedPublicHolidayDays,
    workedHolidayPphDays,
    overlapConflictsCount: conflicts.length,
    statusMismatchCount,
    redundantPunchIdsToClean: Array.from(redundantIdsSet),
    holidayBreakdown,
    conflicts,
  };
}
