import { format, getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Employee, OvertimeRecord, ProcessedAttendance, Settings, ShiftAssignment } from '../types';
import { formatAMPM, toDeviceWallClockIso } from './utils';

export type IsoReportModule = 'daily' | 'iso_summary' | 'overtime' | 'missing' | 'zk_biodata';
export type TimeStandardMode = 'iso' | 'legacy';

export interface IsoDocumentMeta {
  documentId: string;
  standardReference: string;
  classification: string;
  organization: string;
  reportTitle: string;
  reportCode: string;
  periodStart: string;
  periodEnd: string;
  scopeSummary: string;
  preparedBy: string;
  timeStandard: TimeStandardMode;
  timezoneLabel: string;
  generatedAtIso: string;
  totalRecords: number;
}

export interface IsoDailyRegisterRow {
  isoDate: string;
  isoWeek: string;
  weekday: string;
  employeeId: string;
  employeeName: string;
  department: string;
  section: string;
  designation: string;
  shiftName: string;
  shiftWindow: string;
  firstIn: string;
  lastOut: string;
  punchCount: number;
  lateMinutes: number;
  earlyMinutes: number;
  workedHoursDecimal: number;
  workedHoursFormatted: string;
  overtimeHoursDecimal: number;
  overtimeHoursFormatted: string;
  status: string;
  rawLogsSummary: string;
}

export interface IsoDepartmentComplianceRow {
  department: string;
  section: string;
  headcount: number;
  scheduledDays: number;
  presentDays: number;
  onTimeDays: number;
  lateDays: number;
  spfExceptions: number;
  absentDays: number;
  offLeaveDays: number;
  attendanceRatePct: number;
  punctualityRatePct: number;
  absenceRatePct: number;
  totalWorkedHours: number;
  rawBioOtHours: number;
  approvedOtHours: number;
}

export interface IsoOvertimeAuditRow {
  isoDate: string;
  isoWeek: string;
  employeeId: string;
  employeeName: string;
  department: string;
  section: string;
  inTime: string;
  outTime: string;
  workedHoursDecimal: number;
  bioOtHours: number;
  supervisorOtHours: number;
  eligibleOtHours: number;
  otBasis: string;
  otRate: number;
  otAmount: number;
  status: string;
  approvedBy: string;
}

export interface IsoMissingPunchRow {
  isoDate: string;
  isoWeek: string;
  employeeId: string;
  employeeName: string;
  department: string;
  section: string;
  designation: string;
  shiftName: string;
  recordedPunch: string;
  punchCount: number;
  exceptionCode: string;
  exceptionDescription: string;
  severity: string;
}

export interface IsoWorkforceSummary {
  totalRecords: number;
  uniqueEmployees: number;
  scheduledWorkDays: number;
  presentCount: number;
  onTimeCount: number;
  lateCount: number;
  spfCount: number;
  absentCount: number;
  offOrLeaveCount: number;
  attendanceRatePct: number;
  punctualityRatePct: number;
  absenceRatePct: number;
  overtimeIntensityPct: number;
  totalWorkedHours: number;
  totalBioOtHours: number;
  approvedOtHours: number;
  approvedOtAmount: number;
  departmentBreakdown: IsoDepartmentComplianceRow[];
}

export function getLocalIsoTimezoneLabel(): string {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  let tzName = '';
  try {
    tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    tzName = '';
  }
  return tzName ? `UTC${sign}${hh}:${mm} (${tzName})` : `UTC${sign}${hh}:${mm}`;
}

export function formatIsoWeekCode(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '-';
  try {
    const parsed = parseISO(isoDate);
    const wy = getISOWeekYear(parsed);
    const w = String(getISOWeek(parsed)).padStart(2, '0');
    return `${wy}-W${w}`;
  } catch {
    return '-';
  }
}

export function formatTimeByStandard(
  val: string | null | undefined,
  standard: TimeStandardMode = 'iso',
  includeSeconds = true
): string {
  if (!val) return '-';
  const str = String(val).trim();
  if (!str || str === '--' || str === '--:--' || str === '-') return '-';

  if (standard === 'legacy') {
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(str)) {
      const [hRaw, mRaw] = str.split(':').map(Number);
      const ampm = hRaw >= 12 ? 'PM' : 'AM';
      const h12 = hRaw % 12 || 12;
      return `${h12}:${String(mRaw).padStart(2, '0')} ${ampm}`;
    }
    return formatAMPM(str);
  }

  // ISO 8601 24-hour clock
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) {
    const [h, m, s] = str.split(':');
    return includeSeconds ? `${h.padStart(2, '0')}:${m}:${s}` : `${h.padStart(2, '0')}:${m}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':');
    return includeSeconds ? `${h.padStart(2, '0')}:${m}:00` : `${h.padStart(2, '0')}:${m}`;
  }

  const wall = toDeviceWallClockIso(str);
  const m = wall.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const hh = m[1].padStart(2, '0');
    const mm = m[2];
    const ss = (m[3] || '00').padStart(2, '0');
    return includeSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  }

  return str;
}

export function formatIsoHoursHHMM(decimalHours: number): string {
  if (!decimalHours || decimalHours <= 0) return '00:00';
  const totalMins = Math.round(decimalHours * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildIsoDocumentMeta(params: {
  companyName: string;
  reportModule: IsoReportModule;
  startDate: string;
  endDate: string;
  scopeSummary: string;
  preparedBy: string;
  timeStandard: TimeStandardMode;
  totalRecords: number;
}): IsoDocumentMeta {
  const now = new Date();
  const codeMap: Record<IsoReportModule, string> = {
    daily: 'HR-ISO-ATT-01',
    iso_summary: 'HR-ISO-30414-02',
    overtime: 'HR-ISO-OT-03',
    missing: 'HR-ISO-EXC-04',
    zk_biodata: 'HR-ISO-BIO-05'
  };
  const titleMap: Record<IsoReportModule, string> = {
    daily: 'Daily Time & Attendance Register',
    iso_summary: 'Workforce Compliance & Productivity Summary (ISO 30414)',
    overtime: 'Overtime Hours & Authorization Audit',
    missing: 'Missing Punch & Exception Register (SPF)',
    zk_biodata: 'Biometric Device Raw Punch Sequence Log'
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const genIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const seq = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

  return {
    documentId: `${codeMap[params.reportModule]}-${seq}`,
    standardReference: 'ISO 8601:2019 (Date/Time) · ISO 216 (A4) · ISO 30414 (HR Reporting)',
    classification: 'CONFIDENTIAL — INTERNAL HR & AUDIT',
    organization: params.companyName || 'Organization HRIS',
    reportTitle: titleMap[params.reportModule],
    reportCode: codeMap[params.reportModule],
    periodStart: params.startDate,
    periodEnd: params.endDate,
    scopeSummary: params.scopeSummary,
    preparedBy: params.preparedBy,
    timeStandard: params.timeStandard,
    timezoneLabel: getLocalIsoTimezoneLabel(),
    generatedAtIso: genIso,
    totalRecords: params.totalRecords
  };
}

const PRESENT_STATUSES = new Set([
  'Present',
  'On Time',
  'Late',
  'Early',
  'Overtime',
  'PWO',
  'PPH',
  'Forced',
  'Regularized',
  'On Duty',
  'Half Day'
]);

const OFF_LEAVE_STATUSES = new Set(['Weekly Off', 'Public Holiday', 'Holiday', 'Leave', 'Paid Leave', 'On Leave']);

export function buildIsoDailyRows(
  filteredAttendance: ProcessedAttendance[],
  employees: Employee[],
  settings: Settings,
  shiftAssignments: ShiftAssignment[],
  timeStandard: TimeStandardMode
): IsoDailyRegisterRow[] {
  const empMap = new Map(employees.map(e => [e.id, e]));
  return filteredAttendance.map(d => {
    const emp = empMap.get(d.employeeId);
    const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
    const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || d.shiftId || emp?.shiftId));
    const logs = (d.rawLogs && d.rawLogs.length > 0) ? d.rawLogs : (d.logs || []);
    const shiftIn = shift?.startTime ? formatTimeByStandard(shift.startTime, timeStandard, false) : '-';
    const shiftOut = shift?.endTime ? formatTimeByStandard(shift.endTime, timeStandard, false) : '-';
    const workedDec = Number((d.workingHours || 0).toFixed(2));
    const otDec = Number((d.overtime || 0).toFixed(2));

    let weekday = '-';
    try {
      weekday = format(parseISO(d.date), 'EEE');
    } catch {}

    const firstIn = d.inTime
      ? formatTimeByStandard(d.inTime, timeStandard, true)
      : formatTimeByStandard(d.firstPunch, timeStandard, true);

    const hasDistinctOut = Boolean(d.outTime || (d.lastPunch && d.lastPunch !== d.firstPunch));
    const lastOut = hasDistinctOut
      ? formatTimeByStandard(d.outTime || d.lastPunch, timeStandard, true)
      : '-';

    return {
      isoDate: d.date,
      isoWeek: formatIsoWeekCode(d.date),
      weekday,
      employeeId: d.employeeId,
      employeeName: emp?.name || d.employeeName || d.employeeId,
      department: emp?.department || d.department || 'General',
      section: emp?.section || '-',
      designation: emp?.designation || '-',
      shiftName: shift?.name || d.shiftName || 'Standard Shift',
      shiftWindow: shift ? `${shiftIn}–${shiftOut}` : '-',
      firstIn,
      lastOut,
      punchCount: logs.length,
      lateMinutes: Math.max(0, Math.round(d.lateMinutes || 0)),
      earlyMinutes: Math.max(0, Math.round(d.earlyMinutes || 0)),
      workedHoursDecimal: workedDec,
      workedHoursFormatted: formatIsoHoursHHMM(d.workingHours || 0),
      overtimeHoursDecimal: otDec,
      overtimeHoursFormatted: formatIsoHoursHHMM(d.overtime || 0),
      status: d.status,
      rawLogsSummary: logs.map(l => formatTimeByStandard(l, timeStandard, false)).join(', ') || '-'
    };
  });
}

export function buildIsoOvertimeRows(
  filteredAttendance: ProcessedAttendance[],
  overtimeRecords: OvertimeRecord[],
  employees: Employee[],
  startDate: string,
  endDate: string,
  timeStandard: TimeStandardMode
): IsoOvertimeAuditRow[] {
  const empMap = new Map(employees.map(e => [e.id, e]));
  const attMap = new Map<string, ProcessedAttendance>();
  for (const a of filteredAttendance) {
    attMap.set(`${a.employeeId}_${a.date}`, a);
  }

  const scopedEmpIds = new Set(employees.map(e => e.id));
  const matchingOt = (overtimeRecords || []).filter(r => {
    if (!scopedEmpIds.has(r.employeeId)) return false;
    if (startDate && r.date < startDate) return false;
    if (endDate && r.date > endDate) return false;
    return (r.hours > 0 || r.bioOtHours > 0 || r.supervisorOtHours > 0);
  });

  if (matchingOt.length > 0) {
    return matchingOt
      .map(r => {
        const emp = empMap.get(r.employeeId);
        const att = attMap.get(`${r.employeeId}_${r.date}`);
        return {
          isoDate: r.date,
          isoWeek: formatIsoWeekCode(r.date),
          employeeId: r.employeeId,
          employeeName: emp?.name || r.employeeId,
          department: emp?.department || 'General',
          section: emp?.section || '-',
          inTime: formatTimeByStandard(r.inTime || att?.firstPunch, timeStandard, false),
          outTime: formatTimeByStandard(r.outTime || att?.lastPunch, timeStandard, false),
          workedHoursDecimal: Number((att?.workingHours || 0).toFixed(2)),
          bioOtHours: Number((r.bioOtHours || 0).toFixed(2)),
          supervisorOtHours: Number((r.supervisorOtHours || 0).toFixed(2)),
          eligibleOtHours: Number((r.hours || 0).toFixed(2)),
          otBasis: r.otBasis ? r.otBasis.toUpperCase() : 'BASIC',
          otRate: Number((r.otRate || 0).toFixed(2)),
          otAmount: Number((r.otAmount || 0).toFixed(2)),
          status: r.status || 'Pending',
          approvedBy: r.approvedBy || r.reviewedBy || '-'
        };
      })
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.employeeId.localeCompare(b.employeeId));
  }

  // Fallback from attendance records with OT > 0
  return filteredAttendance
    .filter(a => a.overtime > 0)
    .map(a => {
      const emp = empMap.get(a.employeeId);
      return {
        isoDate: a.date,
        isoWeek: formatIsoWeekCode(a.date),
        employeeId: a.employeeId,
        employeeName: emp?.name || a.employeeName || a.employeeId,
        department: emp?.department || a.department || 'General',
        section: emp?.section || '-',
        inTime: formatTimeByStandard(a.firstPunch, timeStandard, false),
        outTime: formatTimeByStandard(a.lastPunch && a.lastPunch !== a.firstPunch ? a.lastPunch : null, timeStandard, false),
        workedHoursDecimal: Number((a.workingHours || 0).toFixed(2)),
        bioOtHours: Number((a.overtime || 0).toFixed(2)),
        supervisorOtHours: 0,
        eligibleOtHours: Number((a.overtime || 0).toFixed(2)),
        otBasis: 'BIO',
        otRate: 0,
        otAmount: 0,
        status: 'Unreviewed',
        approvedBy: '-'
      };
    });
}

export function buildIsoMissingPunchRows(
  filteredAttendance: ProcessedAttendance[],
  employees: Employee[],
  settings: Settings,
  shiftAssignments: ShiftAssignment[],
  timeStandard: TimeStandardMode
): IsoMissingPunchRow[] {
  const empMap = new Map(employees.map(e => [e.id, e]));
  return filteredAttendance
    .filter(d => d.status === 'SPF' || ((d.firstPunch && (!d.lastPunch || d.lastPunch === d.firstPunch)) && !OFF_LEAVE_STATUSES.has(d.status)))
    .map(d => {
      const emp = empMap.get(d.employeeId);
      const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
      const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || d.shiftId || emp?.shiftId));
      const logs = (d.rawLogs && d.rawLogs.length > 0) ? d.rawLogs : (d.logs || []);
      return {
        isoDate: d.date,
        isoWeek: formatIsoWeekCode(d.date),
        employeeId: d.employeeId,
        employeeName: emp?.name || d.employeeName || d.employeeId,
        department: emp?.department || d.department || 'General',
        section: emp?.section || '-',
        designation: emp?.designation || '-',
        shiftName: shift?.name || d.shiftName || 'Standard Shift',
        recordedPunch: formatTimeByStandard(d.firstPunch || logs[0], timeStandard, true),
        punchCount: logs.length,
        exceptionCode: 'SPF-01',
        exceptionDescription: 'Single Biometric Punch — Missing Out/In Pair',
        severity: 'HIGH'
      };
    });
}

export function computeIsoWorkforceSummary(
  filteredAttendance: ProcessedAttendance[],
  employees: Employee[],
  overtimeRecords: OvertimeRecord[],
  startDate: string,
  endDate: string
): IsoWorkforceSummary {
  const empMap = new Map(employees.map(e => [e.id, e]));
  const uniqueEmployeesSet = new Set<string>();
  const deptGroups = new Map<
    string,
    {
      department: string;
      section: string;
      empSet: Set<string>;
      scheduledDays: number;
      presentDays: number;
      onTimeDays: number;
      lateDays: number;
      spfExceptions: number;
      absentDays: number;
      offLeaveDays: number;
      totalWorkedHours: number;
      rawBioOtHours: number;
      approvedOtHours: number;
    }
  >();

  let presentCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let spfCount = 0;
  let absentCount = 0;
  let offOrLeaveCount = 0;
  let totalWorkedHours = 0;
  let totalBioOtHours = 0;

  for (const r of filteredAttendance) {
    const emp = empMap.get(r.employeeId);
    const dept = emp?.department || r.department || 'General';
    const section = emp?.section || 'General';
    const key = `${dept}|||${section}`;
    uniqueEmployeesSet.add(r.employeeId);

    let g = deptGroups.get(key);
    if (!g) {
      g = {
        department: dept,
        section,
        empSet: new Set<string>(),
        scheduledDays: 0,
        presentDays: 0,
        onTimeDays: 0,
        lateDays: 0,
        spfExceptions: 0,
        absentDays: 0,
        offLeaveDays: 0,
        totalWorkedHours: 0,
        rawBioOtHours: 0,
        approvedOtHours: 0
      };
      deptGroups.set(key, g);
    }
    g.empSet.add(r.employeeId);

    const isOffOrLeave = OFF_LEAVE_STATUSES.has(r.status);
    const isPresent = PRESENT_STATUSES.has(r.status);
    const isSpf = r.status === 'SPF';
    const isAbsent = r.status === 'Absent';

    if (isOffOrLeave) {
      offOrLeaveCount++;
      g.offLeaveDays++;
    } else {
      g.scheduledDays++;
    }

    if (isPresent) {
      presentCount++;
      g.presentDays++;
      if ((r.lateMinutes || 0) > 0 || r.status === 'Late') {
        lateCount++;
        g.lateDays++;
      } else {
        onTimeCount++;
        g.onTimeDays++;
      }
    } else if (isSpf) {
      spfCount++;
      g.spfExceptions++;
    } else if (isAbsent) {
      absentCount++;
      g.absentDays++;
    }

    totalWorkedHours += r.workingHours || 0;
    totalBioOtHours += r.overtime || 0;
    g.totalWorkedHours += r.workingHours || 0;
    g.rawBioOtHours += r.overtime || 0;
  }

  let approvedOtHours = 0;
  let approvedOtAmount = 0;
  for (const ot of overtimeRecords || []) {
    if (ot.status !== 'Approved') continue;
    const emp = empMap.get(ot.employeeId);
    if (!emp) continue;
    if (startDate && ot.date < startDate) continue;
    if (endDate && ot.date > endDate) continue;
    approvedOtHours += ot.hours || 0;
    approvedOtAmount += ot.otAmount || 0;
    const key = `${emp.department || 'General'}|||${emp.section || 'General'}`;
    const g = deptGroups.get(key);
    if (g) {
      g.approvedOtHours += ot.hours || 0;
    }
  }

  const scheduledWorkDays = Math.max(0, filteredAttendance.length - offOrLeaveCount);
  const attendanceRatePct = scheduledWorkDays > 0 ? Number(((presentCount / scheduledWorkDays) * 100).toFixed(1)) : 0;
  const punctualityRatePct = presentCount > 0 ? Number(((onTimeCount / presentCount) * 100).toFixed(1)) : 0;
  const absenceRatePct = scheduledWorkDays > 0 ? Number(((absentCount / scheduledWorkDays) * 100).toFixed(1)) : 0;
  const overtimeIntensityPct = totalWorkedHours > 0 ? Number((((approvedOtHours || totalBioOtHours) / totalWorkedHours) * 100).toFixed(1)) : 0;

  const departmentBreakdown: IsoDepartmentComplianceRow[] = Array.from(deptGroups.values())
    .map(g => {
      const attPct = g.scheduledDays > 0 ? Number(((g.presentDays / g.scheduledDays) * 100).toFixed(1)) : 0;
      const punctPct = g.presentDays > 0 ? Number(((g.onTimeDays / g.presentDays) * 100).toFixed(1)) : 0;
      const absPct = g.scheduledDays > 0 ? Number(((g.absentDays / g.scheduledDays) * 100).toFixed(1)) : 0;
      return {
        department: g.department,
        section: g.section,
        headcount: g.empSet.size,
        scheduledDays: g.scheduledDays,
        presentDays: g.presentDays,
        onTimeDays: g.onTimeDays,
        lateDays: g.lateDays,
        spfExceptions: g.spfExceptions,
        absentDays: g.absentDays,
        offLeaveDays: g.offLeaveDays,
        attendanceRatePct: attPct,
        punctualityRatePct: punctPct,
        absenceRatePct: absPct,
        totalWorkedHours: Number(g.totalWorkedHours.toFixed(2)),
        rawBioOtHours: Number(g.rawBioOtHours.toFixed(2)),
        approvedOtHours: Number(g.approvedOtHours.toFixed(2))
      };
    })
    .sort((a, b) => a.department.localeCompare(b.department) || a.section.localeCompare(b.section));

  return {
    totalRecords: filteredAttendance.length,
    uniqueEmployees: uniqueEmployeesSet.size,
    scheduledWorkDays,
    presentCount,
    onTimeCount,
    lateCount,
    spfCount,
    absentCount,
    offOrLeaveCount,
    attendanceRatePct,
    punctualityRatePct,
    absenceRatePct,
    overtimeIntensityPct,
    totalWorkedHours: Number(totalWorkedHours.toFixed(2)),
    totalBioOtHours: Number(totalBioOtHours.toFixed(2)),
    approvedOtHours: Number(approvedOtHours.toFixed(2)),
    approvedOtAmount: Number(approvedOtAmount.toFixed(2)),
    departmentBreakdown
  };
}

function autoFitSheetCols(rows: Record<string, any>[], minWidth = 11, maxWidth = 48): XLSX.ColInfo[] {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(k => {
    let maxLen = k.length;
    for (const r of rows.slice(0, 500)) {
      const val = r[k] !== undefined && r[k] !== null ? String(r[k]) : '';
      if (val.length > maxLen) maxLen = val.length;
    }
    return { wch: Math.max(minWidth, Math.min(maxWidth, maxLen + 3)) };
  });
}

export function exportIsoWorkbookExcel(params: {
  meta: IsoDocumentMeta;
  summary: IsoWorkforceSummary;
  detailRows: Record<string, any>[];
  detailSheetName: string;
  fileName: string;
}) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Document Control & Executive KPI Summary
  const docControlRows = [
    { Field: 'Document ID', Value: params.meta.documentId },
    { Field: 'Standard Reference', Value: params.meta.standardReference },
    { Field: 'Classification', Value: params.meta.classification },
    { Field: 'Organization', Value: params.meta.organization },
    { Field: 'Report Title', Value: params.meta.reportTitle },
    { Field: 'Reporting Period (ISO 8601)', Value: `${params.meta.periodStart} to ${params.meta.periodEnd}` },
    { Field: 'Data Scope', Value: params.meta.scopeSummary },
    { Field: 'Prepared By', Value: params.meta.preparedBy },
    { Field: 'Time Notation', Value: params.meta.timeStandard === 'iso' ? 'ISO 8601 24-Hour (HH:mm:ss)' : '12-Hour AM/PM' },
    { Field: 'Local Timezone', Value: params.meta.timezoneLabel },
    { Field: 'Generated At (ISO 8601)', Value: params.meta.generatedAtIso },
    { Field: '---', Value: '---' },
    { Field: 'ISO 30414 Workforce KPIs', Value: 'Value' },
    { Field: 'Unique Employees in Scope', Value: params.summary.uniqueEmployees },
    { Field: 'Total Scheduled Work Days', Value: params.summary.scheduledWorkDays },
    { Field: 'Present Employee-Days', Value: params.summary.presentCount },
    { Field: 'Absent Employee-Days', Value: params.summary.absentCount },
    { Field: 'Single-Punch Exceptions (SPF)', Value: params.summary.spfCount },
    { Field: 'Attendance Rate (%)', Value: `${params.summary.attendanceRatePct}%` },
    { Field: 'Punctuality Rate (%)', Value: `${params.summary.punctualityRatePct}%` },
    { Field: 'Absence Rate (%)', Value: `${params.summary.absenceRatePct}%` },
    { Field: 'Total Worked Hours (Decimal)', Value: params.summary.totalWorkedHours },
    { Field: 'Approved Overtime Hours', Value: params.summary.approvedOtHours },
    { Field: 'Overtime Intensity (%)', Value: `${params.summary.overtimeIntensityPct}%` }
  ];
  const wsMeta = XLSX.utils.json_to_sheet(docControlRows);
  wsMeta['!cols'] = [{ wch: 32 }, { wch: 58 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, '1_ISO_Document_Control');

  // Sheet 2: Department & Section Compliance Summary
  const deptExport = params.summary.departmentBreakdown.map(d => ({
    'Department': d.department,
    'Section': d.section,
    'Headcount': d.headcount,
    'Scheduled Days': d.scheduledDays,
    'Present Days': d.presentDays,
    'On-Time Days': d.onTimeDays,
    'Late Days': d.lateDays,
    'SPF Exceptions': d.spfExceptions,
    'Absent Days': d.absentDays,
    'Off / Leave Days': d.offLeaveDays,
    'Attendance Rate (%)': d.attendanceRatePct,
    'Punctuality Rate (%)': d.punctualityRatePct,
    'Absence Rate (%)': d.absenceRatePct,
    'Total Worked Hours': d.totalWorkedHours,
    'Bio OT Hours': d.rawBioOtHours,
    'Approved OT Hours': d.approvedOtHours
  }));
  if (deptExport.length > 0) {
    const wsDept = XLSX.utils.json_to_sheet(deptExport);
    wsDept['!cols'] = autoFitSheetCols(deptExport, 12, 30);
    XLSX.utils.book_append_sheet(wb, wsDept, '2_ISO30414_Compliance');
  }

  // Sheet 3: Detailed Register
  if (params.detailRows.length > 0) {
    const wsDetail = XLSX.utils.json_to_sheet(params.detailRows);
    wsDetail['!cols'] = autoFitSheetCols(params.detailRows, 11, 45);
    const refRange = wsDetail['!ref'];
    if (refRange) {
      wsDetail['!autofilter'] = { ref: refRange };
    }
    XLSX.utils.book_append_sheet(wb, wsDetail, params.detailSheetName.slice(0, 31));
  }

  XLSX.writeFile(wb, params.fileName);
}

export function exportIsoCsvUtf8Bom(rows: Record<string, any>[], fileName: string) {
  if (!rows || rows.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const csvContent = XLSX.utils.sheet_to_csv(ws);
  // Prepend UTF-8 BOM so international spreadsheet apps & ERPs preserve Unicode and ISO columns cleanly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportIsoStandardPDF(params: {
  meta: IsoDocumentMeta;
  summary: IsoWorkforceSummary;
  headers: string[];
  body: (string | number)[][];
  columnStyles?: Record<number, any>;
  fileName: string;
}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 8;

  // Top ISO Document Control Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(marginX, 7, pageWidth - marginX * 2, 16, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(params.meta.organization.toUpperCase(), marginX + 4, 13);

  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(params.meta.reportTitle, marginX + 4, 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`DOC ID: ${params.meta.documentId}`, pageWidth - marginX - 4, 12, { align: 'right' });
  doc.text(params.meta.classification, pageWidth - marginX - 4, 16.5, { align: 'right' });
  doc.text(params.meta.standardReference, pageWidth - marginX - 4, 21, { align: 'right' });

  // Metadata Sub-strip
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.rect(marginX, 24, pageWidth - marginX * 2, 11, 'FD');

  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Reporting Period (ISO 8601): ${params.meta.periodStart} to ${params.meta.periodEnd}`, marginX + 3, 28.5);
  doc.text(`Scope: ${params.meta.scopeSummary}`, marginX + 3, 33);
  doc.text(`Prepared By: ${params.meta.preparedBy}`, pageWidth / 2, 28.5);
  doc.text(`TZ: ${params.meta.timezoneLabel}`, pageWidth / 2, 33);
  doc.text(`Generated: ${params.meta.generatedAtIso}`, pageWidth - marginX - 3, 28.5, { align: 'right' });
  doc.text(
    `Attendance: ${params.summary.attendanceRatePct}% · Punctuality: ${params.summary.punctualityRatePct}% · SPF: ${params.summary.spfCount}`,
    pageWidth - marginX - 3,
    33,
    { align: 'right' }
  );

  autoTable(doc, {
    startY: 38,
    head: [params.headers],
    body: params.body,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.2,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: 1.4,
      lineColor: [148, 163, 184],
      lineWidth: 0.1
    },
    bodyStyles: {
      fontSize: 6.8,
      textColor: [30, 41, 59],
      cellPadding: 1.2,
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.1
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    columnStyles: params.columnStyles || {},
    margin: { left: marginX, right: marginX, top: 10, bottom: 14 },
    styles: {
      font: 'helvetica',
      overflow: 'linebreak'
    },
    showHead: 'everyPage',
    didParseCell: (data) => {
      if (data.section === 'body') {
        const val = String(data.cell.raw ?? '').trim();
        if (['Present', 'On Time', 'Approved', 'PWO', 'Regularized'].includes(val)) {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fontStyle = 'bold';
        } else if (['Absent', 'Rejected', 'HIGH'].includes(val)) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (['SPF', 'SPF-01', 'Late', 'Pending'].includes(val)) {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, pageHeight - 10.5, pageWidth - marginX, pageHeight - 10.5);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${params.meta.documentId} · ${params.meta.standardReference}`, marginX, pageHeight - 6.5);
    doc.text(`ISO 216 A4 · Page ${i} of ${pageCount}`, pageWidth - marginX, pageHeight - 6.5, { align: 'right' });
  }

  doc.save(params.fileName);
}
