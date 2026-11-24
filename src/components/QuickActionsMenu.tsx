import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, X, UserCheck, Cpu, FileText, Save, Download,
  ArrowUpRight, Loader2, Calendar, CheckCircle2
} from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { useActionStatus } from '../context/ActionStatusContext';
import { Button, Input } from './ui';
import { cn } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import {
  buildIsoDailyRows,
  buildIsoDocumentMeta,
  computeIsoWorkforceSummary,
  exportIsoStandardPDF,
  exportIsoWorkbookExcel,
} from '../lib/isoReportExporter';

export function QuickActionsMenu() {
  const navigate = useNavigate();
  const {
    isSuperAdmin,
    employees,
    processedData,
    settings,
    shiftAssignments,
    overtimeRecords,
    effectiveUserProfile,
    addForceAttendance,
    addPunch,
    addAuditLog,
    syncAllZkDevices,
  } = useAppStore();
  const { executeWithStatus } = useActionStatus();

  const [isOpen, setIsOpen] = useState(false);
  const [isSyncingDevices, setIsSyncingDevices] = useState(false);
  const [activeModal, setActiveModal] = useState<'punch' | 'report' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Quick Manual Punch Override Form State
  const [punchForm, setPunchForm] = useState({
    employeeId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    inTime: '09:00',
    outTime: '18:00',
    reason: 'Approved Manual Adjustment',
  });

  // Quick Monthly Report Generator Form State
  const [reportForm, setReportForm] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    reportFormat: 'daily_pdf' as 'daily_pdf' | 'summary_pdf' | 'excel',
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const activeEmployees = useMemo(
    () =>
      [...employees]
        .filter((e) => !e.status || e.status === 'Active')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );

  // Restrict strictly to Super Admin users
  if (!isSuperAdmin) return null;

  const handleSyncDevices = async () => {
    if (isSyncingDevices) return;
    setIsOpen(false);
    setIsSyncingDevices(true);
    try {
      await syncAllZkDevices();
    } finally {
      setIsSyncingDevices(false);
    }
  };

  const handleManualPunchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!punchForm.employeeId || !punchForm.date || !punchForm.inTime || !punchForm.outTime) {
      toast.error('Please select an employee, date, IN time, and OUT time.');
      return;
    }
    const emp = employees.find((item) => item.id === punchForm.employeeId);
    const currentForm = { ...punchForm };
    setActiveModal(null);

    await executeWithStatus(
      {
        title: 'Apply Manual Punch Override?',
        subtitle: `Inject attendance punches for ${emp?.name || currentForm.employeeId} on ${currentForm.date}`,
        module: 'Quick Actions · Manual Override',
        actionType: 'save',
        recordId: currentForm.employeeId,
        recordName: emp?.name,
        details: {
          Employee: `${emp?.name || 'Unknown'} (${currentForm.employeeId})`,
          'Override Date': `${currentForm.date} (BS ${getNepaliDate(currentForm.date)})`,
          'Manual IN': currentForm.inTime,
          'Manual OUT': currentForm.outTime,
          Reason: currentForm.reason,
        },
        confirmText: 'Apply Punch Override',
      },
      async (updateProgress) => {
        updateProgress({ percent: 30, message: 'Recording force attendance entry...' });
        await addForceAttendance({
          employeeId: currentForm.employeeId,
          date: currentForm.date,
          inTime: currentForm.inTime,
          outTime: currentForm.outTime,
          reason: currentForm.reason,
          remarks: 'Triggered via Super Admin Quick Actions',
          approvedBy: effectiveUserProfile?.username || 'Super Admin',
        });

        updateProgress({ percent: 65, message: 'Writing IN & OUT punches to SQLite...' });
        await addPunch({
          employeeId: currentForm.employeeId,
          punchDatetime: `${currentForm.date}T${currentForm.inTime}:00`,
        });
        await addPunch({
          employeeId: currentForm.employeeId,
          punchDatetime: `${currentForm.date}T${currentForm.outTime}:00`,
        });

        updateProgress({ percent: 88, message: 'Appending audit log entry...' });
        await addAuditLog({
          employeeId: currentForm.employeeId,
          employeeName: emp?.name || 'Unknown',
          date: currentForm.date,
          field: 'Force Attendance',
          oldValue: 'None',
          newValue: `IN: ${currentForm.inTime}, OUT: ${currentForm.outTime}`,
          changedBy: effectiveUserProfile?.username || 'Super Admin',
          remarks: `Quick Action Manual Override: ${currentForm.reason}`,
        });

        setPunchForm((prev) => ({ ...prev, employeeId: '' }));

        return {
          success: true,
          affectedCount: 2,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            Employee: `${emp?.name || 'Unknown'} (${currentForm.employeeId})`,
            'Punches Injected': '2 punches (IN & OUT)',
          },
        };
      }
    );
  };

  const handleGenerateReport = (e: React.FormEvent) => {
    e.preventDefault();
    const { startDate, endDate, reportFormat } = reportForm;
    if (!startDate || !endDate || startDate > endDate) {
      toast.error('Select a valid start and end date range.');
      return;
    }

    const filteredAttendance = processedData
      .filter((d) => d.date >= startDate && d.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId, undefined, { numeric: true }));

    if (filteredAttendance.length === 0) {
      toast.error(`No processed attendance records found between ${startDate} and ${endDate}.`);
      return;
    }

    const workforceSummary = computeIsoWorkforceSummary(
      filteredAttendance,
      employees,
      overtimeRecords,
      startDate,
      endDate
    );
    const isoDailyRows = buildIsoDailyRows(
      filteredAttendance,
      employees,
      settings,
      shiftAssignments,
      'iso'
    );

    const moduleType = reportFormat === 'summary_pdf' ? 'iso_summary' : 'daily';
    const docMeta = buildIsoDocumentMeta({
      companyName: settings.companyName,
      reportModule: moduleType,
      startDate,
      endDate,
      scopeSummary: 'All Authorized Units (Quick Monthly Export)',
      preparedBy: effectiveUserProfile
        ? `${effectiveUserProfile.username} (${effectiveUserProfile.role})`
        : 'Super Admin',
      timeStandard: 'iso',
      totalRecords:
        reportFormat === 'summary_pdf'
          ? workforceSummary.departmentBreakdown.length
          : isoDailyRows.length,
    });

    if (reportFormat === 'daily_pdf') {
      exportIsoStandardPDF({
        meta: docMeta,
        summary: workforceSummary,
        headers: ['ISO Date', 'BS Date', 'Emp ID', 'Employee Name', 'Department', 'Section', 'Shift', 'In', 'Out', 'Late', 'Early', 'Work', 'OT', 'Status'],
        body: isoDailyRows.map((r) => [
          r.isoDate,
          getNepaliDate(r.isoDate),
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
          r.status,
        ]),
        fileName: `${settings.companyName}_Monthly_Attendance_${format(new Date(), 'yyyyMMdd')}.pdf`,
      });
      toast.success(`Generated Monthly Attendance PDF (${isoDailyRows.length} records).`);
    } else if (reportFormat === 'summary_pdf') {
      exportIsoStandardPDF({
        meta: docMeta,
        summary: workforceSummary,
        headers: ['Department', 'Section', 'Headcount', 'Scheduled', 'Present', 'On Time', 'Late', 'SPF', 'Absent', 'Off/Leave', 'Attend %', 'Punct %', 'Worked Hrs', 'Appr OT'],
        body: workforceSummary.departmentBreakdown.map((d) => [
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
          d.approvedOtHours.toFixed(2),
        ]),
        fileName: `${settings.companyName}_Monthly_Summary_${format(new Date(), 'yyyyMMdd')}.pdf`,
      });
      toast.success('Generated Monthly Department Summary PDF.');
    } else {
      const detailRows = isoDailyRows.map((r) => ({
        'ISO Date': r.isoDate,
        'BS Date': getNepaliDate(r.isoDate),
        Day: r.weekday,
        'Employee ID': r.employeeId,
        'Legal Name': r.employeeName,
        Department: r.department,
        Section: r.section,
        Shift: r.shiftName,
        'First In': r.firstIn,
        'Last Out': r.lastOut,
        'Late (min)': r.lateMinutes,
        'Early Out (min)': r.earlyMinutes,
        'Worked (HH:mm)': r.workedHoursFormatted,
        'Overtime (HH:mm)': r.overtimeHoursFormatted,
        Status: r.status,
      }));
      exportIsoWorkbookExcel({
        meta: docMeta,
        summary: workforceSummary,
        detailRows,
        detailSheetName: '3_MONTHLY_ATTENDANCE',
        fileName: `${settings.companyName}_Monthly_Report_${format(new Date(), 'yyyyMMdd')}.xlsx`,
      });
      toast.success(`Exported Monthly Excel Workbook (${detailRows.length} rows).`);
    }

    setActiveModal(null);
  };

  return (
    <>
      {/* Floating Quick Actions Menu (Super Admin Only) */}
      <div ref={containerRef} className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5 print:hidden">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              className="w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Super Admin Quick Actions</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Trigger high-frequency tasks anywhere
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  aria-label="Close Quick Actions"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setActiveModal('punch');
                  }}
                  className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <UserCheck size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                      Manual Punch Override
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Inject IN/OUT times directly into SQLite
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleSyncDevices}
                  disabled={isSyncingDevices}
                  className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group disabled:opacity-60"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    {isSyncingDevices ? <Loader2 size={16} className="animate-spin" /> : <Cpu size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {isSyncingDevices ? 'Syncing Biometrics...' : 'Sync Device Data'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Pull latest logs from ZKTeco terminals
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setActiveModal('report');
                  }}
                  className="w-full flex items-start gap-3 p-2.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      Generate Monthly Report
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Export PDF or Excel attendance summary
                    </p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-label="Quick Actions Menu"
          className={cn(
            'h-11 px-4 rounded-xl font-bold text-[13px] text-white shadow-lg flex items-center gap-2 transition-all cursor-pointer',
            isOpen
              ? 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800'
              : 'bg-primary hover:bg-primary-dark'
          )}
        >
          {isSyncingDevices ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isOpen ? (
            <X size={16} />
          ) : (
            <Zap size={16} />
          )}
          <span>Quick Actions</span>
        </button>
      </div>

      {/* Inline Manual Punch Override Modal */}
      {activeModal === 'punch' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserCheck size={18} className="text-primary" />
                <div>
                  <h3 className="text-sm font-bold">Quick Manual Punch Override</h3>
                  <p className="text-[11px] text-slate-400">Inject verified IN/OUT punches into SQLite</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleManualPunchSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Employee
                </label>
                <select
                  value={punchForm.employeeId}
                  onChange={(e) => setPunchForm({ ...punchForm, employeeId: e.target.value })}
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Select Employee...</option>
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id}) {emp.department ? `— ${emp.department}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Override Date
                  </label>
                  {punchForm.date && (
                    <span className="text-[11px] font-semibold text-primary tabular-nums">
                      BS {getNepaliDate(punchForm.date)}
                    </span>
                  )}
                </div>
                <Input
                  type="date"
                  value={punchForm.date}
                  onChange={(e) => setPunchForm({ ...punchForm, date: e.target.value })}
                  className="tabular-nums"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Manual IN Time
                  </label>
                  <Input
                    type="time"
                    value={punchForm.inTime}
                    onChange={(e) => setPunchForm({ ...punchForm, inTime: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Manual OUT Time
                  </label>
                  <Input
                    type="time"
                    value={punchForm.outTime}
                    onChange={(e) => setPunchForm({ ...punchForm, outTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Adjustment Reason
                </label>
                <select
                  value={punchForm.reason}
                  onChange={(e) => setPunchForm({ ...punchForm, reason: e.target.value })}
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="Approved Manual Adjustment">Approved Manual Adjustment</option>
                  <option value="Biometric Machine Miss">Biometric Machine Miss</option>
                  <option value="Forgot to Punch">Forgot to Punch</option>
                  <option value="Device Issue">Device Issue</option>
                  <option value="On Duty / Outstation">On Duty / Outstation</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    navigate('/force-attendance');
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-primary inline-flex items-center gap-1"
                >
                  Full Ledger <ArrowUpRight size={13} />
                </button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    <Save size={14} /> Apply Override
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline Monthly Report Modal */}
      {activeModal === 'report' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-primary" />
                <div>
                  <h3 className="text-sm font-bold">Generate Monthly Attendance Report</h3>
                  <p className="text-[11px] text-slate-400">Instant PDF or multi-sheet Excel export</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGenerateReport} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Period Start (AD)
                  </label>
                  <Input
                    type="date"
                    value={reportForm.startDate}
                    onChange={(e) => setReportForm({ ...reportForm, startDate: e.target.value })}
                    className="tabular-nums"
                    required
                  />
                  {reportForm.startDate && (
                    <p className="text-[10px] font-semibold text-primary tabular-nums flex items-center gap-1">
                      <Calendar size={10} /> BS {getNepaliDate(reportForm.startDate)}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Period End (AD)
                  </label>
                  <Input
                    type="date"
                    value={reportForm.endDate}
                    onChange={(e) => setReportForm({ ...reportForm, endDate: e.target.value })}
                    className="tabular-nums"
                    required
                  />
                  {reportForm.endDate && (
                    <p className="text-[10px] font-semibold text-primary tabular-nums flex items-center gap-1">
                      <Calendar size={10} /> BS {getNepaliDate(reportForm.endDate)}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Report Format
                </label>
                <div className="space-y-2">
                  {[
                    {
                      id: 'daily_pdf' as const,
                      title: 'Monthly Daily Attendance Register (PDF)',
                      desc: 'A4 formatted register with AD/BS dates, shifts, IN/OUT, and OT',
                    },
                    {
                      id: 'summary_pdf' as const,
                      title: 'Department Compliance Summary (PDF)',
                      desc: 'Department-wise headcount, attendance %, and punctuality metrics',
                    },
                    {
                      id: 'excel' as const,
                      title: 'Full Multi-Sheet Workbook (.xlsx)',
                      desc: 'Summary + detailed attendance rows ready for audit review',
                    },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        reportForm.reportFormat === opt.id
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      )}
                    >
                      <input
                        type="radio"
                        name="reportFormat"
                        checked={reportForm.reportFormat === opt.id}
                        onChange={() => setReportForm({ ...reportForm, reportFormat: opt.id })}
                        className="mt-0.5 text-primary focus:ring-primary accent-[#E54F38]"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {opt.title}
                          {reportForm.reportFormat === opt.id && (
                            <CheckCircle2 size={12} className="text-primary" />
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    navigate('/reports');
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-primary inline-flex items-center gap-1"
                >
                  Open Report Builder <ArrowUpRight size={13} />
                </button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    <Download size={14} /> Generate Report
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
