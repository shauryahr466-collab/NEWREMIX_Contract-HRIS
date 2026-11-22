import { differenceInMinutes, parseISO, format, subHours, addMinutes, isAfter, isBefore, addHours, subMinutes, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';
import type { RawPunch, ProcessedAttendance, Settings, Employee, ShiftAssignment, AttendanceException } from '../types';
import { generateId, normalizeEmployeeId } from './utils';

export function detectExceptions(
  processed: ProcessedAttendance[],
  employees: Employee[],
  settings: Settings
): AttendanceException[] {
  const exceptions: AttendanceException[] = [];
  const shiftMap = new Map(settings.shifts?.map(s => [s.id, s]) || []);

  processed.forEach(p => {
    // 1. SPF (Single Punch Found)
    if (p.status === 'SPF') {
      exceptions.push({
        id: `ex_${p.id}_spf`,
        employeeId: p.employeeId,
        date: p.date,
        type: 'SPF',
        description: 'Single punch detected. Missing either In or Out punch.',
        severity: 'medium',
        status: 'pending'
      });
    }

    // 2. Short Hours
    if (p.workingHours > 0 && p.expectedHours && p.workingHours < p.expectedHours * 0.5 && p.workingHours < 4) {
      exceptions.push({
        id: `ex_${p.id}_short`,
        employeeId: p.employeeId,
        date: p.date,
        type: 'Short Hours',
        description: `Working hours (${p.workingHours}h) are less than 50% of shift (${p.expectedHours}h).`,
        severity: 'medium',
        status: 'pending'
      });
    }

    // 3. Excessively Long Hours
    if (p.workingHours > 16) {
      exceptions.push({
        id: `ex_${p.id}_long`,
        employeeId: p.employeeId,
        date: p.date,
        type: 'Long Hours',
        description: `Working hours (${p.workingHours}h) are abnormally high. Potentially missed out punch from previous day.`,
        severity: 'high',
        status: 'pending'
      });
    }

    // 4. Duplicate/Extra Punches
    if (p.rawLogs.length > 10) {
      exceptions.push({
        id: `ex_${p.id}_extra`,
        employeeId: p.employeeId,
        date: p.date,
        type: 'Duplicate Punch',
        description: `Excessive number of punches (${p.rawLogs.length}) detected for a single day.`,
        severity: 'low',
        status: 'pending'
      });
    }

    // 5. Punch Outside Shift
    if (p.firstPunch && p.shiftId) {
      const shift = shiftMap.get(p.shiftId);
      if (shift) {
        const [h, m] = shift.startTime.split(':').map(Number);
        const [y, mon, d] = p.date.split('-').map(Number);
        const expectedStart = new Date(y, mon - 1, d, h, m, 0);
        const firstPunch = parseISO(p.firstPunch);
        
        const diff = Math.abs(differenceInMinutes(firstPunch, expectedStart));
        if (diff > 240) { // More than 4 hours early/late
          exceptions.push({
            id: `ex_${p.id}_timing`,
            employeeId: p.employeeId,
            date: p.date,
            type: 'Punch Outside Shift',
            description: `First punch is too far (${Math.round(diff/60)}h) from scheduled shift start.`,
            severity: 'medium',
            status: 'pending'
          });
        }
      }
    }
  });

  return exceptions;
}

// Helper to get shift start for an employee on a given date (Returns Local Date)
function getShiftStart(id: string, dateStr: string, employees: Employee[], settings: Settings, shiftAssignments: ShiftAssignment[]) {
  const emp = employees.find(e => e.id === id);
  const assignment = shiftAssignments.find(a => a.employeeId === id && a.date === dateStr);
  
  // Try to find shift by ID, or fallback to employee's default shift, or final system fallback
  let shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp?.shiftId));
  
  // If no shift found by ID, try a fuzzy match by name if stored or just use first available shift if it's the only one
  if (!shift && settings.shifts && settings.shifts.length > 0) {
    // If employee has a shift name but no valid ID, try to find by name (case insensitive)
    const empShiftName = (assignment?.shiftId || emp?.shiftId); 
    if (empShiftName) {
      shift = settings.shifts.find(s => s.name?.toLowerCase() === empShiftName.toLowerCase() || s.id === empShiftName);
    }
  }

  const startTime = shift?.startTime || settings.shiftStartTime || '09:00';
  const [h, m] = startTime.split(':').map(Number);
  const [y, month, day] = dateStr.split('-').map(Number);
  const expectedStart = new Date(y, month - 1, day, h, m, 0);
  
  return { expectedStart, shift };
}

export function processPunches(
  punches: RawPunch[],
  employees: Employee[],
  settings: Settings,
  shiftAssignments: ShiftAssignment[] = []
): ProcessedAttendance[] {
  if (employees.length === 0) return [];

  const empMap = new Map(employees.map(e => [e.id, e]));
  const assignmentMap = new Map(shiftAssignments.map(a => [`${normalizeEmployeeId(a.employeeId)}_${a.date}`, a]));
  const shiftMap = new Map(settings.shifts?.map(s => [s.id, s]) || []);
  const shiftNameMap = new Map(settings.shifts?.map(s => [s.name?.toLowerCase() || '', s]) || []);
  const holidayMap = new Map<string, string>(
    (settings.holidays || [])
      .filter(h => h && h.date)
      .map(h => [String(h.date).trim().slice(0, 10), String(h.name || 'Public Holiday').trim() || 'Public Holiday'])
  );

  // Helper to ensure every punch timestamp is in exact local device wall-clock time (DIA accuracy).
  // Note: Legacy Excel imports created via new Date("YYYY-MM-DD HH:mm").toISOString() in Nepal (+05:45)
  // stored UTC strings ending in ".000Z" (shifted back by 5h 45m, e.g. 07:40 NPT -> 01:55:00.000Z).
  // Convert those legacy UTC strings back to Nepal local wall-clock time (+05:45 = +345 minutes),
  // while keeping non-Z local timestamps untouched!
  const toExactLocalTimeString = (dt: string | undefined | null): string => {
    if (!dt) return '';
    const trimmed = String(dt).trim().replace(' ', 'T');
    if (/Z$/i.test(trimmed)) {
      const utcMs = Date.parse(trimmed);
      if (!isNaN(utcMs)) {
        // Shift UTC timestamp by +05:45 (345 minutes) to restore exact Nepal device wall-clock time
        const nptDate = new Date(utcMs + 345 * 60 * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${nptDate.getUTCFullYear()}-${pad(nptDate.getUTCMonth() + 1)}-${pad(nptDate.getUTCDate())}T${pad(nptDate.getUTCHours())}:${pad(nptDate.getUTCMinutes())}:${pad(nptDate.getUTCSeconds())}`;
      }
    }
    return trimmed.replace(/(\.\d+)?Z$/i, '');
  };

  // Deduplicate and sort all punches globally first for optimization
  const sortedPunches = Array.from(new Map(punches.map(p => [p.employeeId + toExactLocalTimeString(p.punchDatetime), p])).values())
    .map(p => {
      const cleanIso = toExactLocalTimeString(p.punchDatetime);
      const m = cleanIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
      let t = NaN;
      if (m) {
        t = new Date(
          Number(m[1]),
          Number(m[2]) - 1,
          Number(m[3]),
          Number(m[4]),
          Number(m[5]),
          Number(m[6] || 0)
        ).getTime();
      } else {
        t = new Date(cleanIso).getTime();
      }
      return { ...p, punchDatetime: cleanIso, _time: isNaN(t) ? 0 : t };
    })
    .filter(p => p._time > 0)
    .sort((a, b) => a._time - b._time);

  // Group punches by employee AND date for faster lookup
  const punchesByEmpAndDate = new Map<string, Map<string, typeof sortedPunches>>();
  sortedPunches.forEach(p => {
    const normId = normalizeEmployeeId(p.employeeId);
    const empPunches = punchesByEmpAndDate.get(normId) || new Map<string, typeof sortedPunches>();
    const cleanIso = p.punchDatetime;
    const dateStr = cleanIso.includes('T') ? cleanIso.split('T')[0] : cleanIso.split(' ')[0];
    
    // We need to be careful with night shifts - a punch at 1 AM on the 10th might belong to the 9th.
    // However, for grouping, we first group by literal date.
    const dateList = empPunches.get(dateStr) || [];
    dateList.push(p);
    empPunches.set(dateStr, dateList);
    punchesByEmpAndDate.set(normId, empPunches);
  });

  const finalStartDate = settings.calculationStartDate ? startOfDay(parseISO(settings.calculationStartDate)) : null;
  const finalEndDate = settings.calculationEndDate ? endOfDay(parseISO(settings.calculationEndDate)) : null;

  // Determine date range for reporting
  let startMs = Date.now();
  let endMs = Date.now();

  const todayEnd = endOfDay(new Date()).getTime();
  const lastPunchTime = sortedPunches.length > 0 ? sortedPunches[sortedPunches.length - 1]._time : 0;

  if (finalEndDate) {
    endMs = Math.max(finalEndDate.getTime(), todayEnd, lastPunchTime);
  } else {
    endMs = Math.max(todayEnd, lastPunchTime);
  }

  if (finalStartDate) {
    startMs = finalStartDate.getTime();
  } else if (sortedPunches.length > 0) {
    startMs = sortedPunches[0]._time;
  } else {
    startMs = Date.now() - (30 * 86400 * 1000);
  }

  const current = new Date(startMs);
  const endLimit = new Date(endMs);
  const allDatesList: string[] = [];
  const d = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  while (d <= endLimit) {
    allDatesList.push(format(d, 'yyyy-MM-dd'));
    d.setDate(d.getDate() + 1);
  }

  // Pre-calculate date metadata to avoid repeated Date parsing inside loop
  const dateInfoMap = new Map<string, {
    y: number;
    m: number;
    day: number;
    dayName: string;
    prevDate: string;
    nextDate: string;
  }>();

  allDatesList.forEach(dateStr => {
    const [y, m, day] = dateStr.split('-').map(Number);
    const dObj = new Date(y, m - 1, day);
    const dayName = format(dObj, 'EEEE').toLowerCase();
    const prevDate = format(subMinutes(dObj, 1440), 'yyyy-MM-dd');
    const nextDate = format(addMinutes(dObj, 1440), 'yyyy-MM-dd');
    dateInfoMap.set(dateStr, { y, m, day, dayName, prevDate, nextDate });
  });

  const processed: ProcessedAttendance[] = [];
  const mergeTime = settings.duplicateMergeTime || 5;

  employees.forEach(emp => {
    if (emp.status && emp.status.toLowerCase() === 'inactive') return;
    
    const normId = normalizeEmployeeId(emp.id);
    const empData = punchesByEmpAndDate.get(normId);
    const empWO = (emp.weeklyOff || 'Sunday').trim().toLowerCase();
    
    allDatesList.forEach(dateStr => {
      const dateInfo = dateInfoMap.get(dateStr)!;
      const isWeeklyOff = empWO.includes(dateInfo.dayName);
      const holidayName = holidayMap.get(dateStr);
      const isPublicHoliday = Boolean(holidayName);

      const assignment = assignmentMap.get(`${normId}_${dateStr}`);
      
      let targetShiftId = '';
      let shiftSource: 'Manual Override' | 'Approved Roster' | 'Imported Roster' | 'Employee Default' | 'Auto Detected' = 'Employee Default';

      if (assignment) {
        targetShiftId = assignment.shiftId;
        if (assignment.source === 'Manual Override' || (assignment as any).isManual) {
          shiftSource = 'Manual Override';
        } else if (assignment.source === 'Approved Roster' || assignment.status === 'Approved') {
          shiftSource = 'Approved Roster';
        } else {
          shiftSource = 'Imported Roster';
        }
      } else if (emp.shiftId) {
        targetShiftId = emp.shiftId;
        shiftSource = 'Employee Default';
      } else {
        shiftSource = 'Auto Detected';
      }

      let shift = shiftMap.get(targetShiftId || '');
      if (!shift && targetShiftId) shift = shiftNameMap.get(targetShiftId.toLowerCase());

      // Default Logic: If roster is blank (no assignment and no employee default shift), use first shift in master or Day Shift
      if (!shift && !targetShiftId) {
        shift = settings.shifts?.[0];
      }
      
      // Final fallback if still no shift
      if (!shift) {
        shift = {
          id: 'shift-1',
          name: 'Day Shift',
          startTime: '09:00',
          endTime: '18:00',
          isNightShift: false,
          graceTime: 15
        } as any;
      }

      const startTimeStr = shift?.startTime || settings.shiftStartTime || '09:00';
      const endTimeStr = shift?.endTime || settings.shiftEndTime || '18:00';
      const [hStart, mStart] = startTimeStr.split(':').map(Number);
      const [hEnd, mEnd] = endTimeStr.split(':').map(Number);
      
      const expectedStart = new Date(dateInfo.y, dateInfo.m - 1, dateInfo.day, hStart, mStart, 0);
      let expectedEnd = new Date(dateInfo.y, dateInfo.m - 1, dateInfo.day, hEnd, mEnd, 0);
      
      if (shift?.isNightShift || isBefore(expectedEnd, expectedStart)) {
        expectedEnd = addHours(expectedEnd, 24);
      }

      const shiftDuration = differenceInMinutes(expectedEnd, expectedStart) / 60;
      
      // Define punch window: 6 hours before start to 10 hours after start (or 6 hours after end)
      const windowStart = subHours(expectedStart, 6).getTime();
      const windowEnd = addHours(expectedEnd, 6).getTime();

      // Group punches by shift window - OPTIMIZED: only check punches from current and adjacent dates
      const candidatePunches = [
        ...(empData?.get(dateInfo.prevDate) || []),
        ...(empData?.get(dateStr) || []),
        ...(empData?.get(dateInfo.nextDate) || [])
      ];

      const dayPunches = candidatePunches.filter(p => p._time >= windowStart && p._time < windowEnd);

      // Generate the attendance record
      if (dayPunches.length > 0) {
        const firstPunchObj = dayPunches[0];
        const lastPunchObj = dayPunches[dayPunches.length - 1];

        // Deduplicate logs within same window based on mergeTime
        const validLogs: string[] = [];
        dayPunches.forEach(p => {
          if (validLogs.length === 0) validLogs.push(p.punchDatetime);
          else {
            const lastLogTime = parseISO(validLogs[validLogs.length - 1]).getTime();
            if ((p._time - lastLogTime) / 60000 > mergeTime) {
              validLogs.push(p.punchDatetime);
            } else if (p.punchDatetime === lastPunchObj.punchDatetime) {
              validLogs[validLogs.length - 1] = p.punchDatetime;
            }
          }
        });

        // Determine if a single punch is an IN or OUT based on proximity to shift boundaries
        let firstPunchStr: string | null = null;
        let lastPunchStr: string | null = null;

        if (dayPunches.length === 1) {
          const singlePunch = dayPunches[0];
          const distToStart = Math.abs(singlePunch._time - expectedStart.getTime());
          const distToEnd = Math.abs(singlePunch._time - expectedEnd.getTime());

          if (distToEnd < distToStart && distToEnd < 360 * 60000) { // Closer to end and within 6 hours
            firstPunchStr = null;
            lastPunchStr = singlePunch.punchDatetime;
          } else {
            firstPunchStr = singlePunch.punchDatetime;
            lastPunchStr = null;
          }
        } else {
          firstPunchStr = dayPunches[0].punchDatetime;
          lastPunchStr = dayPunches[dayPunches.length - 1].punchDatetime;
        }

        let workHours = 0;
        let overtime = 0;
        let lateMinutes = 0;
        let earlyMinutes = 0;
        let status: ProcessedAttendance['status'] = 'Absent';

        const threshold = emp.targetWorkingHours || shiftDuration || settings.overtimeThreshold || 8;
        const isOtEligible = emp.otEligible !== false;

        workHours = (lastPunchObj._time - firstPunchObj._time) / 3600000;

        const effectiveGraceTime = shift?.graceTime ?? settings.graceTime ?? 15;
        const lateLimit = addMinutes(expectedStart, effectiveGraceTime);
        const punchIn = firstPunchStr ? parseISO(firstPunchStr) : null;
        const punchOut = lastPunchStr ? parseISO(lastPunchStr) : null;

        if (punchIn && isAfter(punchIn, lateLimit) && shift?.id !== 'DS') {
          lateMinutes = Math.max(0, differenceInMinutes(punchIn, expectedStart));
        }

        if (punchOut && isBefore(punchOut, expectedEnd) && shift?.id !== 'DS') {
          earlyMinutes = Math.max(0, differenceInMinutes(expectedEnd, punchOut));
        }

        const isSameOrSinglePunch = dayPunches.length === 1 || !firstPunchStr || !lastPunchStr || firstPunchObj._time === lastPunchObj._time;

        if (isSameOrSinglePunch) {
          status = isPublicHoliday ? 'Public Holiday' : (isWeeklyOff ? 'Weekly Off' : 'SPF');
        } else if (isPublicHoliday && workHours < 4) {
          // Short duration on Public Holiday (< 4 hours) remains Public Holiday, not PPH
          status = 'Public Holiday';
        } else if (isWeeklyOff && !isPublicHoliday && workHours < 4) {
          // Short duration on Weekly Off (< 4 hours) is counted as Weekly Off (WO), not PWO
          status = 'Weekly Off';
        } else if (workHours < 1 && !isWeeklyOff && !isPublicHoliday) {
          status = 'SPF';
        } else {
          if (isPublicHoliday) {
            status = 'PPH';
            if (isOtEligible && workHours > threshold) {
              overtime = workHours - threshold;
            }
          } else if (isWeeklyOff) {
            status = 'PWO';
            if (isOtEligible && workHours > threshold) {
              overtime = workHours - threshold;
            }
          } else {
            if (isOtEligible && workHours > threshold) {
              overtime = workHours - threshold;
            }
            status = 'Present';
            if (lateMinutes > 0) status = 'Late';
            if (earlyMinutes > 0 && lateMinutes === 0) status = 'Early';
          }
        }

        processed.push({
          id: `${emp.id}_${dateStr}`,
          employeeId: emp.id,
          date: dateStr,
          firstPunch: firstPunchStr,
          lastPunch: lastPunchStr,
          workingHours: Number(workHours.toFixed(2)),
          overtime: Number(overtime.toFixed(2)),
          lateMinutes,
          earlyMinutes,
          shiftId: shift?.id,
          shiftCode: shift?.id || 'DS',
          shiftName: shift?.name || 'Day Shift',
          shiftSource,
          expectedHours: Number(shiftDuration.toFixed(2)),
          status,
          remarks: isPublicHoliday ? holidayName : undefined,
          logs: validLogs,
          rawLogs: dayPunches.map(p => p.punchDatetime)
        });
      } else {
        // Absent, Public Holiday, or Weekly Off
        processed.push({
          id: `${emp.id}_${dateStr}`,
          employeeId: emp.id,
          date: dateStr,
          firstPunch: null,
          lastPunch: null,
          workingHours: 0,
          overtime: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          shiftId: shift?.id,
          shiftCode: shift?.id || 'DS',
          shiftName: shift?.name || 'Day Shift',
          shiftSource,
          expectedHours: Number(shiftDuration.toFixed(2)),
          status: isPublicHoliday ? 'Public Holiday' : (isWeeklyOff ? 'Weekly Off' : 'Absent'),
          remarks: isPublicHoliday ? holidayName : undefined,
          logs: [],
          rawLogs: []
        });
      }
    });
  });

  // Post-processing: Apply Sandwich Rule & Minimum 5 Working Days Requirement for Weekly Offs
  const validWorkedStatuses = new Set(['Present', 'Late', 'Early', 'On Time', 'PWO', 'PPH', 'Overtime', 'Public Holiday', 'Holiday']);
  const empRecordsGrouped = new Map<string, ProcessedAttendance[]>();
  processed.forEach(p => {
    const list = empRecordsGrouped.get(p.employeeId) || [];
    list.push(p);
    empRecordsGrouped.set(p.employeeId, list);
  });

  empRecordsGrouped.forEach((empRecords, empId) => {
    const emp = empMap.get(empId);
    const empWO = (emp?.weeklyOff || 'Sunday').trim().toLowerCase();

    // Sort employee records ascending by date
    empRecords.sort((a, b) => a.date.localeCompare(b.date));

    empRecords.forEach((rec, idx) => {
      if (rec.status === 'Weekly Off') {
        const curDate = parseISO(rec.date);

        // 1. Calculate valid worked days in the 7-day week (Mon-Sun)
        const weekStartStr = format(startOfWeek(curDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const weekEndStr = format(endOfWeek(curDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        const weekRecords = empRecords.filter(r => r.date >= weekStartStr && r.date <= weekEndStr);
        const workedDaysInWeek = weekRecords.filter(r => validWorkedStatuses.has(r.status) || r.workingHours >= 4).length;

        // 2. Sandwich Rule: Check working days immediately before and after the Weekly Off
        let prevWorkingDayRec: ProcessedAttendance | undefined;
        let nextWorkingDayRec: ProcessedAttendance | undefined;

        // Search backward for the closest scheduled working day
        for (let i = idx - 1; i >= 0; i--) {
          const prev = empRecords[i];
          const prevDayName = format(parseISO(prev.date), 'EEEE');
          const isPrevScheduledWO = empWO.includes(prevDayName.toLowerCase()) || holidayMap.has(prev.date);
          if (!isPrevScheduledWO) {
            prevWorkingDayRec = prev;
            break;
          }
        }

        // Search forward for the closest scheduled working day
        for (let i = idx + 1; i < empRecords.length; i++) {
          const next = empRecords[i];
          const nextDayName = format(parseISO(next.date), 'EEEE');
          const isNextScheduledWO = empWO.includes(nextDayName.toLowerCase()) || holidayMap.has(next.date);
          if (!isNextScheduledWO) {
            nextWorkingDayRec = next;
            break;
          }
        }

        // Sandwich rule applies ONLY if both preceding and succeeding working day records exist and employee was absent on both
        if (prevWorkingDayRec && nextWorkingDayRec) {
          const isAbsentBefore = !validWorkedStatuses.has(prevWorkingDayRec.status) && prevWorkingDayRec.workingHours < 4;
          const isAbsentAfter = !validWorkedStatuses.has(nextWorkingDayRec.status) && nextWorkingDayRec.workingHours < 4;

          if (isAbsentBefore && isAbsentAfter) {
            rec.status = 'Absent';
          }
        }
      }
    });
  });

  return processed.sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId));
}
