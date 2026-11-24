import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO, startOfMonth, subDays } from 'date-fns';
import {
  Archive,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  LayoutDashboard,
  ShieldCheck
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { MultiSelect } from '../components/MultiSelect';
import { Button, Card, Input, PageHeader } from '../components/ui';
import { cn } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import {
  buildIsoDailyRows,
  buildIsoDocumentMeta,
  buildIsoMissingPunchRows,
  buildIsoOvertimeRows,
  computeIsoWorkforceSummary,
  exportIsoCsvUtf8Bom,
  exportIsoStandardPDF,
  exportIsoWorkbookExcel,
  type IsoReportModule,
  type TimeStandardMode
} from '../lib/isoReportExporter';
import {
  exportZkBioDataCSV,
  exportZkBioDataExcel,
  exportZkBioDataPDF,
  generateZkBioDataRows
} from '../lib/zktReportHelper';

const REPORT_MODULE_OPTIONS: Array<{ id: IsoReportModule; label: string; code: string }> = [
  { id: 'daily', label: 'ISO Daily Attendance Register', code: 'HR-ISO-ATT-01' },
  { id: 'iso_summary', label: 'ISO 30414 Compliance Summary', code: 'HR-ISO-30414-02' },
  { id: 'overtime', label: 'Overtime Calculation Audit', code: 'HR-ISO-OT-03' },
  { id: 'missing', label: 'Missing Punch Exceptions (SPF)', code: 'HR-ISO-EXC-04' },
  { id: 'zk_biodata', label: 'ZKT Bio Data Punch Log', code: 'HR-ISO-BIO-05' }
];

function StatusText({ status }: { status: string }) {
  const s = (status || '').trim();
  let cls = 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  if (['Present', 'On Time', 'Approved', 'PWO', 'PPH', 'Regularized', 'Forced'].includes(s)) {
    cls = 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60';
  } else if (['Absent', 'Rejected', 'HIGH'].includes(s)) {
    cls = 'text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/60';
  } else if (['SPF', 'SPF-01', 'Late', 'Pending', 'Early'].includes(s)) {
    cls = 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/60';
  } else if (['Weekly Off', 'Public Holiday', 'Holiday', 'Leave', 'Paid Leave', 'On Leave'].includes(s)) {
    cls = 'text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/60';
  }
  return (
    <span className={cn('inline-block px-2 py-0.5 text-[11px] font-semibold rounded border whitespace-nowrap', cls)}>
      {s || '-'}
    </span>
  );
}

export function Reports() {
  const {
    processedData,
    employees,
    settings,
    calculationSource,
    setCalculationSource,
    punches,
    shiftAssignments,
    overtimeRecords,
    globalSearchTerm,
    effectiveUserProfile,
    isAdmin
  } = useAppStore();

  const canViewSalary = effectiveUserProfile
    ? effectiveUserProfile.permissions?.canViewSalary !== false
    : isAdmin;

  const [reportType, setReportType] = useState<IsoReportModule>('daily');
  const [timeStandard, setTimeStandard] = useState<TimeStandardMode>('iso');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hasAlignedReportDates, setHasAlignedReportDates] = useState(false);
  const [showCharts, setShowCharts] = useState(false);

  React.useEffect(() => {
    if (hasAlignedReportDates || punches.length === 0) return;
    let minDt = '';
    let maxDt = '';
    let anyInRange = false;
    for (const p of punches) {
      if (!p.punchDatetime) continue;
      const dStr = String(p.punchDatetime).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) continue;
      if (!minDt || dStr < minDt) minDt = dStr;
      if (!maxDt || dStr > maxDt) maxDt = dStr;
      if (dStr >= startDate && dStr <= endDate) anyInRange = true;
    }
    if (!anyInRange && minDt && maxDt) {
      setStartDate(minDt);
      setEndDate(maxDt);
    }
    setHasAlignedReportDates(true);
  }, [punches, hasAlignedReportDates, startDate, endDate]);

  const [deptFilter, setDeptFilter] = useState<string[]>(['All']);
  const [sectionFilter, setSectionFilter] = useState<string[]>(['All']);
  const [designationFilter, setDesignationFilter] = useState<string[]>(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'id'>('date');
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const activeSearch = searchTerm || globalSearchTerm;

  const departments = useMemo(() => {
    const depts = employees.map(e => e.department).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(depts)).sort()];
  }, [employees]);

  const sections = useMemo(() => {
    const secs = employees.map(e => e.section).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(secs)).sort()];
  }, [employees]);

  const designations = useMemo(() => {
    const des = employees.map(e => e.designation).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(des)).sort()];
  }, [employees]);

  const scopedEmployees = useMemo(() => {
    return employees.filter(emp => {
      const okDept = deptFilter.includes('All') || (emp.department && deptFilter.includes(emp.department));
      const okSec = sectionFilter.includes('All') || (emp.section && sectionFilter.includes(emp.section));
      const okDes = designationFilter.includes('All') || (emp.designation && designationFilter.includes(emp.designation));
      const okSearch =
        !activeSearch ||
        emp.name.toLowerCase().includes(activeSearch.toLowerCase()) ||
        emp.id.toLowerCase().includes(activeSearch.toLowerCase()) ||
        (emp.department || '').toLowerCase().includes(activeSearch.toLowerCase()) ||
        (emp.section || '').toLowerCase().includes(activeSearch.toLowerCase());
      return okDept && okSec && okDes && okSearch;
    });
  }, [employees, deptFilter, sectionFilter, designationFilter, activeSearch]);

  const scopedEmployeeIds = useMemo(() => new Set(scopedEmployees.map(e => e.id)), [scopedEmployees]);

  const filteredAttendance = useMemo(() => {
    const empMap = new Map(employees.map(e => [e.id, e]));
    const rows = processedData.filter(d => {
      if (!scopedEmployeeIds.has(d.employeeId)) return false;
      const matchesDate = (!startDate || d.date >= startDate) && (!endDate || d.date <= endDate);
      return matchesDate;
    });

    return rows.sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = empMap.get(a.employeeId)?.name || a.employeeId;
        const nameB = empMap.get(b.employeeId)?.name || b.employeeId;
        return nameA.localeCompare(nameB) || a.date.localeCompare(b.date);
      }
      if (sortBy === 'id') {
        return a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }) || a.date.localeCompare(b.date);
      }
      return b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true });
    });
  }, [processedData, scopedEmployeeIds, startDate, endDate, sortBy, employees]);

  const workforceSummary = useMemo(
    () => computeIsoWorkforceSummary(filteredAttendance, scopedEmployees, overtimeRecords, startDate, endDate),
    [filteredAttendance, scopedEmployees, overtimeRecords, startDate, endDate]
  );

  const isoDailyRows = useMemo(
    () => buildIsoDailyRows(filteredAttendance, employees, settings, shiftAssignments, timeStandard),
    [filteredAttendance, employees, settings, shiftAssignments, timeStandard]
  );

  const isoOvertimeRows = useMemo(
    () => buildIsoOvertimeRows(filteredAttendance, overtimeRecords, scopedEmployees, startDate, endDate, timeStandard),
    [filteredAttendance, overtimeRecords, scopedEmployees, startDate, endDate, timeStandard]
  );

  const isoMissingRows = useMemo(
    () => buildIsoMissingPunchRows(filteredAttendance, employees, settings, shiftAssignments, timeStandard),
    [filteredAttendance, employees, settings, shiftAssignments, timeStandard]
  );

  const zkBioRows = useMemo(
    () =>
      generateZkBioDataRows(
        punches,
        scopedEmployees,
        filteredAttendance,
        startDate,
        endDate,
        deptFilter,
        activeSearch,
        timeStandard,
        sectionFilter
      ),
    [punches, scopedEmployees, filteredAttendance, startDate, endDate, deptFilter, activeSearch, timeStandard, sectionFilter]
  );

  const activeRecordCount = useMemo(() => {
    if (reportType === 'daily') return isoDailyRows.length;
    if (reportType === 'iso_summary') return workforceSummary.departmentBreakdown.length;
    if (reportType === 'overtime') return isoOvertimeRows.length;
    if (reportType === 'missing') return isoMissingRows.length;
    return zkBioRows.length;
  }, [reportType, isoDailyRows.length, workforceSummary.departmentBreakdown.length, isoOvertimeRows.length, isoMissingRows.length, zkBioRows.length]);

  const totalPages = Math.max(1, Math.ceil(activeRecordCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const sliceStart = (safePage - 1) * pageSize;
  const sliceEnd = sliceStart + pageSize;

  React.useEffect(() => {
    setPage(1);
  }, [reportType, startDate, endDate, deptFilter, sectionFilter, designationFilter, activeSearch]);

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (effectiveUserProfile?.role) {
      parts.push(`Role: ${effectiveUserProfile.role}`);
    }
    if (!deptFilter.includes('All')) parts.push(`Dept: ${deptFilter.join(', ')}`);
    if (!sectionFilter.includes('All')) parts.push(`Sec: ${sectionFilter.join(', ')}`);
    if (deptFilter.includes('All') && sectionFilter.includes('All')) {
      parts.push(effectiveUserProfile?.assignedDepartments?.length ? `Assigned: ${effectiveUserProfile.assignedDepartments.join(', ')}` : 'All Authorized Units');
    }
    return parts.join(' | ');
  }, [effectiveUserProfile, deptFilter, sectionFilter]);

  const docMeta = useMemo(
    () =>
      buildIsoDocumentMeta({
        companyName: settings.companyName,
        reportModule: reportType,
        startDate,
        endDate,
        scopeSummary: scopeLabel,
        preparedBy: effectiveUserProfile ? `${effectiveUserProfile.username} (${effectiveUserProfile.role})` : 'HRIS Administrator',
        timeStandard,
        totalRecords: activeRecordCount
      }),
    [settings.companyName, reportType, startDate, endDate, scopeLabel, effectiveUserProfile, timeStandard, activeRecordCount]
  );

  // Analytics Charts (bounded height & interactive toggle)
  const attendanceTrends = useMemo(() => {
    const last10Days = Array.from({ length: 10 })
      .map((_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'))
      .reverse();
    return last10Days.map(date => ({
      date,
      present: filteredAttendance.filter(d => d.date === date && (d.status === 'Present' || d.status === 'On Time' || d.status === 'Late')).length
    }));
  }, [filteredAttendance]);

  const deptOTChartData = useMemo(() => {
    return workforceSummary.departmentBreakdown
      .map(d => ({ name: `${d.department}${d.section && d.section !== 'General' ? ` (${d.section})` : ''}`, hours: d.approvedOtHours || d.rawBioOtHours }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 12);
  }, [workforceSummary.departmentBreakdown]);

  // Build flat table export objects for Excel / CSV / Sheets
  const getExportObjects = () => {
    if (reportType === 'daily') {
      return isoDailyRows.map(r => ({
        'ISO Date': r.isoDate,
        'BS Date': getNepaliDate(r.isoDate),
        'ISO Week': r.isoWeek,
        'Day': r.weekday,
        'Employee ID': r.employeeId,
        'Legal Name': r.employeeName,
        'Department': r.department,
        'Section': r.section,
        'Designation': r.designation,
        'Shift': r.shiftName,
        'Shift Window': r.shiftWindow,
        'First In': r.firstIn,
        'Last Out': r.lastOut,
        'Punches': r.punchCount,
        'Late (min)': r.lateMinutes,
        'Early Out (min)': r.earlyMinutes,
        'Worked (HH:mm)': r.workedHoursFormatted,
        'Worked (Decimal Hrs)': r.workedHoursDecimal,
        'Overtime (HH:mm)': r.overtimeHoursFormatted,
        'Overtime (Decimal Hrs)': r.overtimeHoursDecimal,
        'Status': r.status
      }));
    }
    if (reportType === 'iso_summary') {
      return workforceSummary.departmentBreakdown.map(d => ({
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
        'Total Worked Hrs': d.totalWorkedHours,
        'Bio OT Hrs': d.rawBioOtHours,
        'Approved OT Hrs': d.approvedOtHours
      }));
    }
    if (reportType === 'overtime') {
      return isoOvertimeRows.map(r => {
        const base: Record<string, any> = {
          'ISO Date': r.isoDate,
          'ISO Week': r.isoWeek,
          'Employee ID': r.employeeId,
          'Legal Name': r.employeeName,
          'Department': r.department,
          'Section': r.section,
          'In Time': r.inTime,
          'Out Time': r.outTime,
          'Worked Hrs': r.workedHoursDecimal,
          'Bio OT Hrs': r.bioOtHours,
          'Supervisor OT Hrs': r.supervisorOtHours,
          'Eligible OT Hrs': r.eligibleOtHours,
          'OT Basis': r.otBasis
        };
        if (canViewSalary) {
          base['OT Rate'] = r.otRate;
          base['OT Amount'] = r.otAmount;
        }
        base['Status'] = r.status;
        base['Approved By'] = r.approvedBy;
        return base;
      });
    }
    if (reportType === 'missing') {
      return isoMissingRows.map(r => ({
        'ISO Date': r.isoDate,
        'ISO Week': r.isoWeek,
        'Employee ID': r.employeeId,
        'Legal Name': r.employeeName,
        'Department': r.department,
        'Section': r.section,
        'Shift': r.shiftName,
        'Recorded Punch': r.recordedPunch,
        'Punch Count': r.punchCount,
        'Exception Code': r.exceptionCode,
        'Exception Description': r.exceptionDescription,
        'Severity': r.severity
      }));
    }
    return [];
  };

  const handleExportExcel = () => {
    if (reportType === 'zk_biodata') {
      if (zkBioRows.length === 0) {
        toast.error('No biometric log records found for selected filters.');
        return;
      }
      exportZkBioDataExcel(zkBioRows, settings.companyName, docMeta);
      toast.success(`Exported ${zkBioRows.length} ISO ZKT Bio Data records to Excel.`);
      return;
    }

    const detailRows = getExportObjects();
    if (detailRows.length === 0) {
      toast.error('No records available for the selected filters.');
      return;
    }

    exportIsoWorkbookExcel({
      meta: docMeta,
      summary: workforceSummary,
      detailRows,
      detailSheetName: `3_${reportType.toUpperCase()}`,
      fileName: `${settings.companyName}_${docMeta.reportCode}_${format(new Date(), 'yyyyMMdd')}.xlsx`
    });
    toast.success(`Exported multi-sheet ISO Excel workbook (${detailRows.length} rows).`);
  };

  const handleExportCSV = () => {
    if (reportType === 'zk_biodata') {
      if (zkBioRows.length === 0) {
        toast.error('No biometric log records found for selected filters.');
        return;
      }
      exportZkBioDataCSV(zkBioRows, settings.companyName);
      toast.success(`Exported ${zkBioRows.length} ZKT Bio Data records to UTF-8 CSV.`);
      return;
    }

    const rows = getExportObjects();
    if (rows.length === 0) {
      toast.error('No records available for the selected filters.');
      return;
    }
    exportIsoCsvUtf8Bom(rows, `${settings.companyName}_${docMeta.reportCode}_${format(new Date(), 'yyyyMMdd')}.csv`);
    toast.success(`Exported ${rows.length} ISO records to UTF-8 BOM CSV.`);
  };

  const handlePrintPDF = () => {
    if (reportType === 'zk_biodata') {
      if (zkBioRows.length === 0) {
        toast.error('No biometric log records found for selected filters.');
        return;
      }
      exportZkBioDataPDF(zkBioRows, settings.companyName, docMeta);
      toast.success('Generated ISO 216 A4 ZKT Bio Data PDF.');
      return;
    }

    if (reportType === 'daily') {
      if (isoDailyRows.length === 0) {
        toast.error('No attendance records available.');
        return;
      }
      const asc = [...isoDailyRows].sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }));
      exportIsoStandardPDF({
        meta: docMeta,
        summary: workforceSummary,
        headers: ['ISO Date', 'Week', 'Emp ID', 'Employee Name', 'Department', 'Section', 'Shift', 'In', 'Out', 'Late', 'Early', 'Work', 'OT', 'Status'],
        body: asc.map(r => [
          r.isoDate,
          r.isoWeek,
          r.employeeId,
          r.employeeName,
          r.department,
          r.section,
          r.shiftName,
          r.firstIn,
          r.lastOut,
          r.lateMinutes > 0 ? `${r.lateMinutes}m` : '-',
          r.earlyMinutes > 0 ? `${r.earlyMinutes}m` : '-',
          r.workedHoursFormatted,
          r.overtimeHoursDecimal > 0 ? r.overtimeHoursFormatted : '-',
          r.status
        ]),
        columnStyles: {
          0: { cellWidth: 19, halign: 'center' },
          1: { cellWidth: 15, halign: 'center' },
          2: { cellWidth: 15, halign: 'center' },
          3: { cellWidth: 'auto', minCellWidth: 32 },
          4: { cellWidth: 24 },
          5: { cellWidth: 22 },
          6: { cellWidth: 20 },
          7: { cellWidth: 16, halign: 'center' },
          8: { cellWidth: 16, halign: 'center' },
          9: { cellWidth: 11, halign: 'center' },
          10: { cellWidth: 11, halign: 'center' },
          11: { cellWidth: 13, halign: 'center' },
          12: { cellWidth: 12, halign: 'center' },
          13: { cellWidth: 18, halign: 'center' }
        },
        fileName: `${settings.companyName}_${docMeta.reportCode}_${format(new Date(), 'yyyyMMdd')}.pdf`
      });
      toast.success('Generated ISO 216 A4 Attendance PDF.');
      return;
    }

    if (reportType === 'iso_summary') {
      if (workforceSummary.departmentBreakdown.length === 0) {
        toast.error('No summary data available.');
        return;
      }
      exportIsoStandardPDF({
        meta: docMeta,
        summary: workforceSummary,
        headers: ['Department', 'Section', 'Headcount', 'Scheduled', 'Present', 'On Time', 'Late', 'SPF', 'Absent', 'Off/Leave', 'Attend %', 'Punct %', 'Worked Hrs', 'Appr OT'],
        body: workforceSummary.departmentBreakdown.map(d => [
          d.department,
          d.section,
          d.headcount,
          d.scheduledDays,
          d.presentDays,
          d.onTimeDays,
          d.lateDays,
          d.spfExceptions,
          d.absentDays,
          d.offLeaveDays,
          `${d.attendanceRatePct}%`,
          `${d.punctualityRatePct}%`,
          d.totalWorkedHours.toFixed(2),
          d.approvedOtHours.toFixed(2)
        ]),
        fileName: `${settings.companyName}_${docMeta.reportCode}_${format(new Date(), 'yyyyMMdd')}.pdf`
      });
      toast.success('Generated ISO 30414 Workforce Compliance PDF.');
      return;
    }

    if (reportType === 'overtime') {
      if (isoOvertimeRows.length === 0) {
        toast.error('No overtime records found.');
        return;
      }
      const headers = ['ISO Date', 'Emp ID', 'Employee Name', 'Department', 'Section', 'In', 'Out', 'Worked', 'Bio OT', 'Sup OT', 'Eligible OT', 'Basis'];
      if (canViewSalary) headers.push('Rate', 'Amount');
      headers.push('Status', 'Approved By');

      exportIsoStandardPDF({
        meta: docMeta,
        summary: workforceSummary,
        headers,
        body: isoOvertimeRows.map(r => {
          const row: (string | number)[] = [
            r.isoDate,
            r.employeeId,
            r.employeeName,
            r.department,
            r.section,
            r.inTime,
            r.outTime,
            r.workedHoursDecimal.toFixed(2),
            r.bioOtHours.toFixed(2),
            r.supervisorOtHours.toFixed(2),
            r.eligibleOtHours.toFixed(2),
            r.otBasis
          ];
          if (canViewSalary) {
            row.push(r.otRate.toFixed(2), r.otAmount.toFixed(2));
          }
          row.push(r.status, r.approvedBy);
          return row;
        }),
        fileName: `${settings.companyName}_${docMeta.reportCode}_${format(new Date(), 'yyyyMMdd')}.pdf`
      });
      toast.success('Generated ISO Overtime Audit PDF.');
      return;
    }

    if (reportType === 'missing') {
      if (isoMissingRows.length === 0) {
        toast.error('No missing punch exceptions found.');
        return;
      }
      exportIsoStandardPDF({
        meta: docMeta,
        summary: workforceSummary,
        headers: ['ISO Date', 'Week', 'Emp ID', 'Employee Name', 'Department', 'Section', 'Shift', 'Recorded Punch', 'Code', 'Description', 'Severity'],
        body: isoMissingRows.map(r => [
          r.isoDate,
          r.isoWeek,
          r.employeeId,
          r.employeeName,
          r.department,
          r.section,
          r.shiftName,
          r.recordedPunch,
          r.exceptionCode,
          r.exceptionDescription,
          r.severity
        ]),
        fileName: `${settings.companyName}_${docMeta.reportCode}_${format(new Date(), 'yyyyMMdd')}.pdf`
      });
      toast.success('Generated ISO Exception Audit PDF.');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="ISO Workforce & Attendance Reports"
        description="ISO 8601 Date/Time · ISO 216 A4 PDF · ISO 30414 Compliance Analytics"
        icon={FileText}
      />

      {/* ISO Document Control Header & Scoped KPI Summary */}
      <Card className="p-4 sm:p-5 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
              <ShieldCheck size={15} />
              <span>{docMeta.documentId}</span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="text-slate-500 dark:text-slate-400">{docMeta.standardReference}</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{docMeta.reportTitle}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scope: <span className="font-medium text-slate-700 dark:text-slate-200">{docMeta.scopeSummary}</span> · Prepared By:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">{docMeta.preparedBy}</span> · TZ: <span className="font-mono">{docMeta.timezoneLabel}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCharts(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
            >
              <BarChart3 size={14} className="text-indigo-600" />
              {showCharts ? 'Hide Analytics' : 'Show Analytics'}
            </button>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900 text-xs">
              <button
                type="button"
                onClick={() => setTimeStandard('iso')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-semibold transition-colors',
                  timeStandard === 'iso'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                ISO 8601 (24h · YYYY-MM-DD)
              </button>
              <button
                type="button"
                onClick={() => setTimeStandard('legacy')}
                className={cn(
                  'px-2.5 py-1 rounded-md font-semibold transition-colors',
                  timeStandard === 'legacy'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                Legacy AM/PM
              </button>
            </div>
          </div>
        </div>

        {/* ISO 30414 Executive Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">Attendance Rate</span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{workforceSummary.attendanceRatePct}%</span>
            <span className="text-[11px] text-slate-500 block tabular-nums">{workforceSummary.presentCount} / {workforceSummary.scheduledWorkDays} days</span>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">Punctuality Rate</span>
            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{workforceSummary.punctualityRatePct}%</span>
            <span className="text-[11px] text-slate-500 block tabular-nums">{workforceSummary.lateCount} late arrivals</span>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">Employees Scoped</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{workforceSummary.uniqueEmployees}</span>
            <span className="text-[11px] text-slate-500 block tabular-nums">{workforceSummary.departmentBreakdown.length} units</span>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">Worked Hours</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{workforceSummary.totalWorkedHours.toLocaleString()} h</span>
            <span className="text-[11px] text-slate-500 block tabular-nums">Bio OT: {workforceSummary.totalBioOtHours.toFixed(1)} h</span>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">Approved OT</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{workforceSummary.approvedOtHours.toFixed(1)} h</span>
            <span className="text-[11px] text-slate-500 block tabular-nums">Intensity: {workforceSummary.overtimeIntensityPct}%</span>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">Exceptions (SPF)</span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">{workforceSummary.spfCount}</span>
            <span className="text-[11px] text-slate-500 block tabular-nums">{workforceSummary.absentCount} absent</span>
          </div>
        </div>
      </Card>

      {showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="p-5 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <LayoutDashboard size={14} className="text-indigo-600" />
                10-Day Scoped Present Trend (ISO Dates)
              </h3>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceTrends}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="present" stroke="#4f46e5" fill="#e0e7ff" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart3 size={14} className="text-indigo-600" />
                Overtime Hours by Unit
              </h3>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptOTChartData} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="hours" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Main Split: Filters & Actions Sidebar + Live Formatted Report Table */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <div className="xl:col-span-1">
          <Card className="p-5 border border-slate-200 dark:border-slate-800 space-y-5 sticky top-20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Filter size={14} className="text-indigo-600" />
              Report Configuration
            </h3>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Report Standard</label>
              <select
                value={reportType}
                onChange={e => setReportType(e.target.value as IsoReportModule)}
                className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {REPORT_MODULE_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Calculation Engine</label>
              <div className="flex bg-slate-50 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 gap-1">
                <button
                  onClick={() => setCalculationSource('standard')}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                    calculationSource === 'standard' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-400'
                  )}
                >
                  Standard
                </button>
                <button
                  onClick={() => setCalculationSource('multi-time')}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                    calculationSource === 'multi-time' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-400'
                  )}
                >
                  Multi
                </button>
                <button
                  onClick={() => setCalculationSource('all')}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                    calculationSource === 'all' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-400'
                  )}
                >
                  Merged
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Employee / Unit Search</label>
              <Input
                placeholder="ID, Name, Department..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Department</label>
              <MultiSelect options={departments} selected={deptFilter} onChange={setDeptFilter} placeholder="All Departments" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Section</label>
              <MultiSelect options={sections} selected={sectionFilter} onChange={setSectionFilter} placeholder="All Sections" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sort Order</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'date' | 'name' | 'id')}
                className="w-full h-9 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              >
                <option value="date">ISO Date (Latest First)</option>
                <option value="name">Legal Name (A–Z)</option>
                <option value="id">Employee ID (Numeric)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ISO Date Period</label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9 text-[11px] font-mono" />
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9 text-[11px] font-mono" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setStartDate('2020-01-01');
                  setEndDate('2099-12-31');
                }}
                className="w-full text-right text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pt-1 flex items-center justify-end gap-1"
              >
                <Archive size={12} /> All-Time SQLite Period
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={handleExportExcel} className="gap-1.5 h-9 text-xs">
                  <Download size={14} /> ISO Excel
                </Button>
                <Button variant="outline" onClick={handleExportCSV} className="gap-1.5 h-9 text-xs">
                  <FileSpreadsheet size={14} /> UTF-8 CSV
                </Button>
              </div>
              <Button variant="outline" onClick={handlePrintPDF} className="w-full gap-1.5 h-9 text-xs">
                <FileText size={14} /> Export ISO 216 A4 PDF
              </Button>
            </div>
          </Card>
        </div>

        <div className="xl:col-span-3 space-y-4">
          {/* Interactive Report Tabs */}
          <div className="flex flex-wrap gap-1.5 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
            {REPORT_MODULE_OPTIONS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReportType(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  reportType === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Card className="border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60 dark:bg-slate-900">
              <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>
                  Showing <strong className="tabular-nums text-slate-900 dark:text-white">{activeRecordCount.toLocaleString()}</strong> formatted records ({timeStandard === 'iso' ? 'ISO 8601' : 'Legacy'})
                </span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-2 text-xs tabular-nums">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800"
                  >
                    Prev
                  </button>
                  <span className="text-slate-500">
                    Page {safePage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {activeRecordCount === 0 ? (
              <div className="py-16 text-center space-y-2">
                <Info size={28} className="mx-auto text-slate-300" />
                <p className="text-sm font-medium text-slate-500">No records match the current report filters and ISO date range.</p>
                <p className="text-xs text-slate-400">Adjust department/section filters or click "All-Time SQLite Period".</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* 1. ISO DAILY ATTENDANCE REGISTER */}
                {reportType === 'daily' && (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold">
                        <th className="py-2.5 px-3">ISO Date</th>
                        <th className="py-2.5 px-3">Week</th>
                        <th className="py-2.5 px-3">Emp ID</th>
                        <th className="py-2.5 px-3">Employee Name</th>
                        <th className="py-2.5 px-3">Dept / Section</th>
                        <th className="py-2.5 px-3">Shift</th>
                        <th className="py-2.5 px-3">First In</th>
                        <th className="py-2.5 px-3">Last Out</th>
                        <th className="py-2.5 px-3 text-right">Worked</th>
                        <th className="py-2.5 px-3 text-right">OT</th>
                        <th className="py-2.5 px-3 text-right">Late/Early</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {isoDailyRows.slice(sliceStart, sliceEnd).map((r, i) => (
                        <tr key={`${r.employeeId}_${r.isoDate}_${i}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">{r.isoDate}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-400 whitespace-nowrap">{r.isoWeek}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white tabular-nums">{r.employeeId}</td>
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{r.employeeName}</td>
                          <td className="py-2 px-3 text-slate-500">
                            {r.department}
                            {r.section !== '-' ? ` · ${r.section}` : ''}
                          </td>
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{r.shiftName}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{r.firstIn}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">{r.lastOut}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-white">{r.workedHoursFormatted}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-indigo-600 dark:text-indigo-400">
                            {r.overtimeHoursDecimal > 0 ? r.overtimeHoursFormatted : '-'}
                          </td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-500">
                            {r.lateMinutes > 0 || r.earlyMinutes > 0 ? `${r.lateMinutes}m / ${r.earlyMinutes}m` : '-'}
                          </td>
                          <td className="py-2 px-3 text-center"><StatusText status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 2. ISO 30414 WORKFORCE COMPLIANCE SUMMARY */}
                {reportType === 'iso_summary' && (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold">
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Section</th>
                        <th className="py-2.5 px-3 text-right">Headcount</th>
                        <th className="py-2.5 px-3 text-right">Scheduled</th>
                        <th className="py-2.5 px-3 text-right">Present</th>
                        <th className="py-2.5 px-3 text-right">Late</th>
                        <th className="py-2.5 px-3 text-right">SPF</th>
                        <th className="py-2.5 px-3 text-right">Absent</th>
                        <th className="py-2.5 px-3 text-right">Attend %</th>
                        <th className="py-2.5 px-3 text-right">Punct %</th>
                        <th className="py-2.5 px-3 text-right">Worked Hrs</th>
                        <th className="py-2.5 px-3 text-right">Appr OT Hrs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {workforceSummary.departmentBreakdown.slice(sliceStart, sliceEnd).map((d, i) => (
                        <tr key={`${d.department}_${d.section}_${i}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{d.department}</td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{d.section}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right">{d.headcount}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right">{d.scheduledDays}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-emerald-700 dark:text-emerald-400 font-semibold">{d.presentDays}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-amber-600">{d.lateDays}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-amber-600">{d.spfExceptions}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-rose-600">{d.absentDays}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right font-bold text-slate-900 dark:text-white">{d.attendanceRatePct}%</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right">{d.punctualityRatePct}%</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right">{d.totalWorkedHours.toFixed(1)}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-right text-indigo-600 dark:text-indigo-400 font-semibold">{d.approvedOtHours.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 3. OVERTIME CALCULATION AUDIT */}
                {reportType === 'overtime' && (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold">
                        <th className="py-2.5 px-3">ISO Date</th>
                        <th className="py-2.5 px-3">Emp ID</th>
                        <th className="py-2.5 px-3">Employee Name</th>
                        <th className="py-2.5 px-3">Dept / Section</th>
                        <th className="py-2.5 px-3">In – Out</th>
                        <th className="py-2.5 px-3 text-right">Bio OT</th>
                        <th className="py-2.5 px-3 text-right">Sup OT</th>
                        <th className="py-2.5 px-3 text-right">Eligible OT</th>
                        <th className="py-2.5 px-3">Basis</th>
                        {canViewSalary && <th className="py-2.5 px-3 text-right">OT Amount</th>}
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3">Approved By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {isoOvertimeRows.slice(sliceStart, sliceEnd).map((r, i) => (
                        <tr key={`${r.employeeId}_${r.isoDate}_${i}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">{r.isoDate}</td>
                          <td className="py-2 px-3 font-mono font-bold tabular-nums">{r.employeeId}</td>
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{r.employeeName}</td>
                          <td className="py-2 px-3 text-slate-500">{r.department}{r.section !== '-' ? ` · ${r.section}` : ''}</td>
                          <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">{r.inTime} – {r.outTime}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right">{r.bioOtHours.toFixed(2)}h</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right">{r.supervisorOtHours.toFixed(2)}h</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right font-bold text-indigo-600 dark:text-indigo-400">{r.eligibleOtHours.toFixed(2)}h</td>
                          <td className="py-2 px-3 font-mono text-slate-500">{r.otBasis}</td>
                          {canViewSalary && (
                            <td className="py-2 px-3 font-mono tabular-nums text-right font-semibold">{r.otAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          )}
                          <td className="py-2 px-3 text-center"><StatusText status={r.status} /></td>
                          <td className="py-2 px-3 text-slate-500">{r.approvedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 4. MISSING PUNCH EXCEPTIONS (SPF) */}
                {reportType === 'missing' && (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold">
                        <th className="py-2.5 px-3">ISO Date</th>
                        <th className="py-2.5 px-3">Week</th>
                        <th className="py-2.5 px-3">Emp ID</th>
                        <th className="py-2.5 px-3">Employee Name</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Section</th>
                        <th className="py-2.5 px-3">Shift</th>
                        <th className="py-2.5 px-3">Recorded Punch</th>
                        <th className="py-2.5 px-3">Code</th>
                        <th className="py-2.5 px-3 text-center">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {isoMissingRows.slice(sliceStart, sliceEnd).map((r, i) => (
                        <tr key={`${r.employeeId}_${r.isoDate}_${i}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono tabular-nums">{r.isoDate}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-400">{r.isoWeek}</td>
                          <td className="py-2 px-3 font-mono font-bold tabular-nums">{r.employeeId}</td>
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{r.employeeName}</td>
                          <td className="py-2 px-3 text-slate-500">{r.department}</td>
                          <td className="py-2 px-3 text-slate-500">{r.section}</td>
                          <td className="py-2 px-3 text-slate-500">{r.shiftName}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-amber-700 dark:text-amber-400 font-semibold">{r.recordedPunch}</td>
                          <td className="py-2 px-3 font-mono">{r.exceptionCode}</td>
                          <td className="py-2 px-3 text-center"><StatusText status={r.severity} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 5. ZKT BIO DATA PUNCH LOG */}
                {reportType === 'zk_biodata' && (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase font-bold">
                        <th className="py-2.5 px-3">Emp No.</th>
                        <th className="py-2.5 px-3">Employee Name</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Section</th>
                        <th className="py-2.5 px-3">BS Date</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-right">Punches</th>
                        <th className="py-2.5 px-3">Punch Time Sequence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {zkBioRows.slice(sliceStart, sliceEnd).map((r, i) => (
                        <tr key={`${r.employeeNo}_${r.dateStr}_${i}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono font-bold tabular-nums">{r.employeeNo}</td>
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{r.name}</td>
                          <td className="py-2 px-3 text-slate-500">{r.department}</td>
                          <td className="py-2 px-3 text-slate-500">{r.section}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-300">{r.bsDate}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">{r.formattedDate}</td>
                          <td className="py-2 px-3 font-mono tabular-nums text-right">{r.punchCount}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-indigo-700 dark:text-indigo-400">{r.timeString}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
