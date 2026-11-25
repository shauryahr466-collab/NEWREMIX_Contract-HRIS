import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCheck,
  CalendarClock,
  ClockAlert,
  ClipboardCheck,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import { useAppStore } from '../store';
import { getNepaliDate } from '../utils/dateHelper';
import { Badge, Button, Card } from './ui';
import { cn } from '../lib/utils';

const PRESENT_STATUSES = new Set([
  'Present',
  'Late',
  'SPF',
  'On Time',
  'Early',
  'PWO',
  'Overtime',
  'Forced',
  'Half Day',
]);

interface DashboardSummaryProps {
  date: string;
}

export function DashboardSummary({ date }: DashboardSummaryProps) {
  const navigate = useNavigate();
  const {
    employees,
    processedData,
    sblRecords,
    overtimeRecords,
    forceAttendanceRecords,
    zkDevices,
    openEmployeeProfile,
  } = useAppStore();

  const bsDate = useMemo(() => {
    const val = getNepaliDate(date);
    return val !== '0000-00-00' ? val : null;
  }, [date]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, (typeof employees)[number]>();
    employees.forEach((emp) => map.set(emp.id, emp));
    return map;
  }, [employees]);

  const summary = useMemo(() => {
    const activeEmployees = employees.filter(
      (e) => !e.status || e.status.toLowerCase() === 'active'
    );
    const activeCount = activeEmployees.length;

    const dayRecords = processedData.filter((d) => d.date === date);
    const presentRecords = dayRecords.filter((d) => PRESENT_STATUSES.has(d.status));
    const presentCount = presentRecords.length;
    const onTimeCount = presentRecords.filter(
      (d) => d.status === 'On Time' || d.status === 'Early' || d.status === 'Present'
    ).length;
    const attendanceRate =
      activeCount > 0 ? Math.round((presentCount / activeCount) * 100) : 0;

    const lateRecords = dayRecords
      .filter((d) => d.lateMinutes > 0 || d.status === 'Late')
      .sort((a, b) => (b.lateMinutes || 0) - (a.lateMinutes || 0));

    const totalLateMins = lateRecords.reduce((acc, r) => acc + (r.lateMinutes || 0), 0);
    const avgLateMinutes =
      lateRecords.length > 0 ? Math.round(totalLateMins / lateRecords.length) : 0;
    const maxLateMinutes =
      lateRecords.length > 0 ? lateRecords[0].lateMinutes || 0 : 0;

    const pendingLeaves = sblRecords
      .filter((r) => r.status === 'Pending')
      .sort((a, b) => b.date.localeCompare(a.date));

    const pendingFormalLeaves = pendingLeaves.filter(
      (r) => r.leaveType !== 'SBL' && r.leaveType !== 'Short Break'
    ).length;
    const pendingShortBreaks = pendingLeaves.length - pendingFormalLeaves;

    const pendingOtCount = overtimeRecords.filter((r) => r.status === 'Pending').length;
    const pendingForceCount = forceAttendanceRecords.filter(
      (r) => r.status === 'Pending'
    ).length;

    const enabledReaders = zkDevices.filter((d) => d.enabled);
    const onlineReaders = enabledReaders.filter((d) => d.status === 'online');

    return {
      activeCount,
      presentCount,
      onTimeCount,
      attendanceRate,
      lateRecords,
      avgLateMinutes,
      maxLateMinutes,
      pendingLeaves,
      pendingFormalLeaves,
      pendingShortBreaks,
      pendingOtCount,
      pendingForceCount,
      totalQueue: pendingOtCount + pendingForceCount,
      enabledReadersCount: enabledReaders.length,
      onlineReadersCount: onlineReaders.length,
    };
  }, [
    employees,
    processedData,
    sblRecords,
    overtimeRecords,
    forceAttendanceRecords,
    zkDevices,
    date,
  ]);

  const topLateArrivals = summary.lateRecords.slice(0, 5);
  const topPendingLeaves = summary.pendingLeaves.slice(0, 5);

  return (
    <section aria-label="Daily Workforce Summary" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">
            Executive Workforce Summary
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
            Live attendance, leave approvals, and punctuality snapshot for {date}
            {bsDate ? ` · BS ${bsDate}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/devices')}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300 hover:text-primary dark:hover:text-primary transition-colors cursor-pointer"
        >
          <Cpu size={14} className="text-slate-400" />
          <span className="tabular-nums">
            {summary.onlineReadersCount}/{summary.enabledReadersCount} Readers Online
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => navigate(`/attendance?date=${date}&status=Present`)}
          className="text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:shadow-sm transition-all duration-150 cursor-pointer flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              Today&apos;s Present
            </p>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.presentCount}
              </span>
              <span className="text-[12px] font-medium text-slate-400 tabular-nums">
                / {summary.activeCount} active
              </span>
            </div>
            <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 mt-3 tabular-nums">
              {summary.attendanceRate}% rate · {summary.onTimeCount} on time
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck size={18} />
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/sbl')}
          className="text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:shadow-sm transition-all duration-150 cursor-pointer flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              Pending Leave Requests
            </p>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.pendingLeaves.length}
              </span>
              <span className="text-[12px] font-medium text-slate-400">
                awaiting review
              </span>
            </div>
            <p
              className={cn(
                'text-[12px] font-semibold mt-3 tabular-nums',
                summary.pendingLeaves.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {summary.pendingFormalLeaves} Leave · {summary.pendingShortBreaks} SBL
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 flex items-center justify-center shrink-0">
            <CalendarClock size={18} />
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate(`/attendance?date=${date}&status=Late`)}
          className="text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:shadow-sm transition-all duration-150 cursor-pointer flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              Late Arrivals
            </p>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.lateRecords.length}
              </span>
              <span className="text-[12px] font-medium text-slate-400">
                employees late
              </span>
            </div>
            <p
              className={cn(
                'text-[12px] font-semibold mt-3 tabular-nums',
                summary.lateRecords.length > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {summary.lateRecords.length > 0
                ? `Avg ${summary.avgLateMinutes}m · Max ${summary.maxLateMinutes}m`
                : 'Zero late arrivals'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 flex items-center justify-center shrink-0">
            <ClockAlert size={18} />
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            navigate(summary.pendingForceCount > 0 ? '/force-attendance' : '/overtime')
          }
          className="text-left bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/40 hover:shadow-sm transition-all duration-150 cursor-pointer flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              Pending Requests Queue
            </p>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {summary.totalQueue}
              </span>
              <span className="text-[12px] font-medium text-slate-400">
                OT &amp; corrections
              </span>
            </div>
            <p className="text-[12px] font-semibold text-sky-600 dark:text-sky-400 mt-3 tabular-nums">
              {summary.pendingOtCount} Overtime · {summary.pendingForceCount} Attendance
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400 flex items-center justify-center shrink-0">
            <ClipboardCheck size={18} />
          </div>
        </button>
      </div>

      {(topLateArrivals.length > 0 || topPendingLeaves.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card
            title="Late Arrivals Watchlist"
            subtitle={`Ranked by late duration on ${date}`}
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/attendance?date=${date}&status=Late`)}
              >
                View All <ArrowRight size={13} />
              </Button>
            }
          >
            {topLateArrivals.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-5 -my-5">
                {topLateArrivals.map((rec) => {
                  const emp = employeeMap.get(rec.employeeId);
                  return (
                    <div
                      key={rec.id}
                      onClick={() => openEmployeeProfile(rec.employeeId)}
                      className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                          {emp?.name || rec.employeeName || `Emp #${rec.employeeId}`}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                          #{rec.employeeId} · {emp?.department || rec.department || 'Unassigned'} · In{' '}
                          {rec.inTime || '--:--'}
                        </p>
                      </div>
                      <Badge variant="danger" className="tabular-nums shrink-0">
                        +{rec.lateMinutes} min
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-slate-400 py-4 text-center">
                All present employees arrived within shift grace window.
              </p>
            )}
          </Card>

          <Card
            title="Pending Leave Requests"
            subtitle="Open leave & short-break requests awaiting approval"
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate('/sbl')}>
                Review Queue <ArrowRight size={13} />
              </Button>
            }
          >
            {topPendingLeaves.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-5 -my-5">
                {topPendingLeaves.map((req) => {
                  const emp = employeeMap.get(req.employeeId);
                  return (
                    <div
                      key={req.id}
                      onClick={() => navigate('/sbl')}
                      className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                          {emp?.name || `Emp #${req.employeeId}`}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                          {req.leaveType} · {req.duration} · {req.date}
                          {req.reason ? ` — ${req.reason}` : ''}
                        </p>
                      </div>
                      <Badge variant="warning" className="shrink-0">
                        Pending
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-slate-400 py-4 text-center">
                No pending leave or short-break requests.
              </p>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
