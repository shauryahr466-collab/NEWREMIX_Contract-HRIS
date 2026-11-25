import { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { format, parseISO, addDays, subDays } from 'date-fns';
import {
  Users, UserCheck, UserX, Clock, CalendarClock, ShieldAlert,
  RefreshCw, ChevronLeft, ChevronRight, SlidersHorizontal, X, Building2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { detectExceptions } from '../lib/engine';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { DepartmentInsights } from '../components/DepartmentInsights';
import { BiometricHealth } from '../components/BiometricHealth';
import { DashboardSummary } from '../components/DashboardSummary';
import { PageHeader, Card, KPICard, Button, Badge } from '../components/ui';
import { getNepaliDate } from '../utils/dateHelper';

type WidgetKey =
  | 'dashboardSummary'
  | 'kpiStrip'
  | 'attendanceTrend'
  | 'staffDistribution'
  | 'departmentBreakdown'
  | 'biometricHealth'
  | 'recentActivity'
  | 'auditFlags';

const WIDGET_LABELS: Array<{ key: WidgetKey; label: string; description: string }> = [
  { key: 'dashboardSummary', label: 'Executive Workforce Summary', description: "Today's Present, Pending Leave Requests, Late Arrivals, and approval queues" },
  { key: 'kpiStrip', label: 'Manpower KPI Cards', description: 'Total staff, present, absent, and approved OT summary' },
  { key: 'attendanceTrend', label: '30-Day Attendance & OT Chart', description: 'Rolling 30-day attendance headcount and overtime hours' },
  { key: 'staffDistribution', label: 'Daily Staff Distribution', description: 'Present vs Absent vs Approved Leave donut chart' },
  { key: 'departmentBreakdown', label: 'Department Attendance Breakdown', description: 'Live department-wise headcount and attendance rate' },
  { key: 'biometricHealth', label: 'Biometric Terminal Health', description: 'ZKTeco terminal polling and connection status' },
  { key: 'recentActivity', label: 'Recent OT & Leave Activity', description: 'Latest overtime and SBL leave workflow updates' },
  { key: 'auditFlags', label: 'Audit Exception Flags', description: 'Single punch failures and missing punch alerts' },
];

const DEFAULT_WIDGET_VISIBILITY: Record<WidgetKey, boolean> = {
  dashboardSummary: true,
  kpiStrip: true,
  attendanceTrend: true,
  staffDistribution: true,
  departmentBreakdown: true,
  biometricHealth: true,
  recentActivity: true,
  auditFlags: true,
};

const WIDGET_STORAGE_KEY = 'hris_dashboard_widgets';

export function Dashboard() {
  const navigate = useNavigate();
  const {
    employees, processedData, settings, overtimeRecords, sblRecords,
    openEmployeeProfile, recalculate, isInitializing, theme
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'insights'>('overview');
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [widgets, setWidgets] = useState<Record<WidgetKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem(WIDGET_STORAGE_KEY);
      if (saved) return { ...DEFAULT_WIDGET_VISIBILITY, ...JSON.parse(saved) };
    } catch {
      // ignore invalid JSON
    }
    return DEFAULT_WIDGET_VISIBILITY;
  });

  useEffect(() => {
    try {
      localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgets));
    } catch {
      // ignore storage quota errors
    }
  }, [widgets]);

  const toggleWidget = (key: WidgetKey) => {
    setWidgets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetWidgets = () => setWidgets(DEFAULT_WIDGET_VISIBILITY);

  const availableDates = useMemo(() => {
    return [...new Set(processedData.map((p) => p.date))].sort().reverse();
  }, [processedData]);

  const [dashboardDate, setDashboardDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(dashboardDate)) {
      setDashboardDate(availableDates[0]);
    }
  }, [availableDates]);

  const handlePrevDay = () => setDashboardDate((prev) => format(subDays(parseISO(prev), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setDashboardDate((prev) => format(addDays(parseISO(prev), 1), 'yyyy-MM-dd'));

  const bsDateLabel = useMemo(() => {
    const bs = getNepaliDate(dashboardDate);
    return bs !== '0000-00-00' ? `BS ${bs}` : '';
  }, [dashboardDate]);

  const processedByDate = useMemo(() => {
    const map = new Map<string, typeof processedData>();
    processedData.forEach((p) => {
      const list = map.get(p.date) || [];
      list.push(p);
      map.set(p.date, list);
    });
    return map;
  }, [processedData]);

  const todaysData = useMemo(() => processedByDate.get(dashboardDate) || [], [processedByDate, dashboardDate]);

  const auditSummary = useMemo(() => {
    const todaysExceptions = detectExceptions(todaysData, employees, settings);
    return {
      total: todaysExceptions.length,
      spf: todaysExceptions.filter((e) => e.type === 'SPF').length,
      missingOut: todaysExceptions.filter((e) => e.type === 'SPF' || e.type === 'Missing Out').length,
      mismatch: todaysExceptions.filter((e) => e.type === 'Punch Outside Shift' || e.type === 'Shift Mismatch').length,
    };
  }, [todaysData, employees, settings]);

  const stats = useMemo(() => {
    const present = todaysData.filter((d) =>
      ['Present', 'Late', 'SPF', 'On Time', 'Early', 'PWO'].includes(d.status)
    ).length;
    const todaysOT = overtimeRecords
      .filter((r) => r.date === dashboardDate && r.status === 'Approved')
      .reduce((acc, curr) => acc + curr.hours, 0);
    const todaysSBL = sblRecords.filter(
      (r) => r.date === dashboardDate && (r.status === 'Approved' || r.status === 'Final Confirmed')
    ).length;
    const activeEmployeesCount = employees.filter((e) => e.status === 'Active').length;
    const absent = Math.max(0, activeEmployeesCount - present - todaysSBL);
    const contractorCount = new Set(employees.filter((e) => e.contractorName).map((e) => e.contractorName)).size;

    return {
      activeEmployees: activeEmployeesCount,
      contractorCount,
      present,
      absent,
      late: todaysData.filter((d) => d.lateMinutes > 0).length,
      spf: todaysData.filter((d) => d.status === 'SPF').length,
      early: todaysData.filter((d) => d.status === 'Early').length,
      todaysOT,
      todaysSBL,
      attendanceRate: activeEmployeesCount > 0 ? Math.round((present / activeEmployeesCount) * 100) : 0,
    };
  }, [todaysData, employees, dashboardDate, overtimeRecords, sblRecords]);

  const departmentBreakdown = useMemo(() => {
    const activeEmps = employees.filter((e) => e.status === 'Active');
    const presentIds = new Set(
      todaysData
        .filter((d) => ['Present', 'Late', 'SPF', 'On Time', 'Early', 'PWO'].includes(d.status))
        .map((d) => d.employeeId)
    );
    const deptMap = new Map<string, { name: string; total: number; present: number }>();
    activeEmps.forEach((emp) => {
      const dept = emp.department?.trim() || 'Unassigned';
      const entry = deptMap.get(dept) || { name: dept, total: 0, present: 0 };
      entry.total += 1;
      if (presentIds.has(emp.id)) entry.present += 1;
      deptMap.set(dept, entry);
    });
    return Array.from(deptMap.values())
      .map((d) => ({
        ...d,
        rate: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [employees, todaysData]);

  const dailyBreakdownData = useMemo(
    () =>
      [
        { name: 'Present', value: stats.present, color: '#E54F38' },
        { name: 'Absent', value: stats.absent, color: '#DC2626' },
        { name: 'On Leave', value: stats.todaysSBL, color: '#0284C7' },
      ].filter((d) => d.value > 0),
    [stats]
  );

  const recentActivities = useMemo(() => {
    const activities: any[] = [];
    overtimeRecords.slice(-10).forEach((ot) => {
      activities.push({
        id: `ot-${ot.id}`,
        type: 'OT',
        title: ot.status === 'Approved' ? 'OT Approved' : 'OT Request',
        subtitle: `${ot.hours}h for ${ot.date}`,
        timestamp: ot.reviewedDate || ot.date,
        status: ot.status,
        employeeId: ot.employeeId,
        icon: Clock,
        variant: ot.status === 'Approved' ? 'success' : 'warning',
      });
    });
    sblRecords.slice(-10).forEach((sbl) => {
      activities.push({
        id: `sbl-${sbl.id}`,
        type: 'SBL',
        title: `${sbl.leaveType} ${sbl.status}`,
        subtitle: `${sbl.duration} - ${sbl.reason}`,
        timestamp: sbl.date,
        status: sbl.status,
        employeeId: sbl.employeeId,
        icon: CalendarClock,
        variant: 'info',
      });
    });
    return activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [overtimeRecords, sblRecords]);

  const chartData = useMemo(() => {
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      last30Days.push(format(subDays(parseISO(dashboardDate), i), 'yyyy-MM-dd'));
    }
    return last30Days.map((date) => {
      const dayData = processedByDate.get(date) || [];
      const present = dayData.filter((d) =>
        ['Present', 'Late', 'SPF', 'On Time', 'Early', 'PWO'].includes(d.status)
      ).length;
      return {
        date,
        display: format(parseISO(date), 'dd MMM'),
        Attendance: present,
        OT: overtimeRecords
          .filter((r) => r.date === date && r.status === 'Approved')
          .reduce((acc, curr) => acc + curr.hours, 0),
      };
    });
  }, [processedByDate, dashboardDate, overtimeRecords]);

  const isDark = theme === 'dark';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        description="Workforce attendance, overtime, and departmental overview"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={handlePrevDay}
                aria-label="Previous day"
                className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 border-r border-slate-200 dark:border-slate-800 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="px-4 py-1 min-w-[190px] text-center">
                <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight tabular-nums">
                  {format(parseISO(dashboardDate), 'EEE, dd MMM yyyy')}
                </p>
                {bsDateLabel && (
                  <p className="text-[10px] font-semibold text-primary tabular-nums leading-tight mt-0.5">
                    {bsDateLabel}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleNextDay}
                aria-label="Next day"
                className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 border-l border-slate-200 dark:border-slate-800 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <Button variant="outline" onClick={() => setIsCustomizeOpen(true)}>
              <SlidersHorizontal size={14} />
              Customize
            </Button>

            <Button variant="outline" onClick={() => recalculate()} disabled={isInitializing}>
              <RefreshCw size={14} className={isInitializing ? 'animate-spin' : ''} />
              {isInitializing ? 'Syncing' : 'Sync'}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800/80 p-1 rounded-lg w-fit border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all',
            activeTab === 'overview'
              ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('insights')}
          className={cn(
            'px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all',
            activeTab === 'insights'
              ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          Department Insights
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          {widgets.dashboardSummary && <DashboardSummary date={dashboardDate} />}

          {widgets.kpiStrip && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                label="Total Manpower"
                value={stats.activeEmployees}
                icon={Users}
                trend="up"
                trendValue="Active Workforce"
                onClick={() => navigate('/employees')}
              />
              <KPICard
                label="Present Staff"
                value={stats.present}
                icon={UserCheck}
                trend="up"
                trendValue={`${stats.attendanceRate}% Attendance`}
                onClick={() => navigate(`/attendance?date=${dashboardDate}&status=Present`)}
              />
              <KPICard
                label="Absent Manpower"
                value={stats.absent}
                icon={UserX}
                trend="down"
                trendValue={`${stats.todaysSBL} On Approved Leave`}
                onClick={() => navigate(`/attendance?date=${dashboardDate}&status=Absent`)}
              />
              <KPICard
                label="Approved Overtime"
                value={`${stats.todaysOT}h`}
                icon={Clock}
                trend="up"
                trendValue="Allocated Hours"
                onClick={() => navigate('/overtime')}
              />
            </div>
          )}

          {(widgets.attendanceTrend || widgets.staffDistribution) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {widgets.attendanceTrend && (
                <Card
                  title="Attendance & Overtime Trend (30 Days)"
                  className={widgets.staffDistribution ? 'lg:col-span-2' : 'lg:col-span-3'}
                >
                  <div className="h-[300px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorAttHorilla" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#E54F38" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="#E54F38" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke={isDark ? '#1E293B' : '#E2E8F0'}
                        />
                        <XAxis
                          dataKey="display"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }}
                          minTickGap={30}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: isDark ? '#94A3B8' : '#64748B', fontSize: 11 }}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '10px',
                            border: isDark ? '1px solid #1E293B' : '1px solid #E2E8F0',
                            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                            color: isDark ? '#F8FAFC' : '#0F172A',
                            padding: '10px 12px',
                          }}
                          itemStyle={{ fontSize: '13px', fontWeight: '600' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="Attendance"
                          stroke="#E54F38"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorAttHorilla)"
                        />
                        <Area type="monotone" dataKey="OT" stroke="#16A34A" strokeWidth={2} fill="transparent" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}

              {widgets.staffDistribution && (
                <Card title="Staff Distribution" className={!widgets.attendanceTrend ? 'lg:col-span-3' : undefined}>
                  <div className="h-[250px] w-full flex flex-col items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dailyBreakdownData}
                          cx="50%"
                          cy="50%"
                          innerRadius={68}
                          outerRadius={88}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          {dailyBreakdownData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '10px',
                            border: isDark ? '1px solid #1E293B' : '1px solid #E2E8F0',
                            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                            color: isDark ? '#F8FAFC' : '#0F172A',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-3xl font-bold text-slate-900 dark:text-white leading-none tabular-nums">
                        {stats.activeEmployees}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1.5 uppercase tracking-wider font-semibold">
                        Staff Total
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {dailyBreakdownData.map((d) => (
                      <div
                        key={d.name}
                        className="text-center p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                      >
                        <p className="text-[15px] font-bold text-slate-900 dark:text-white leading-none tabular-nums">
                          {d.value}
                        </p>
                        <p className="text-[10px] text-slate-500 font-semibold uppercase mt-1.5">{d.name}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {widgets.departmentBreakdown && departmentBreakdown.length > 0 && (
            <Card
              title="Department Attendance Breakdown"
              actions={
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('insights')}>
                  Full Analytics
                </Button>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {departmentBreakdown.map((dept) => (
                  <div
                    key={dept.name}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 size={14} className="text-primary shrink-0" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {dept.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
                        {dept.present}/{dept.total}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${dept.rate}%` }}
                      />
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
                      {dept.rate}% present today
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {widgets.biometricHealth && <BiometricHealth />}

          {(widgets.recentActivity || (widgets.auditFlags && auditSummary.total > 0)) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {widgets.recentActivity && (
                <Card
                  title="System Activity"
                  actions={
                    <Link to="/audit-logs">
                      <Button variant="ghost" size="sm">
                        View All
                      </Button>
                    </Link>
                  }
                >
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-5 -mb-5">
                    {recentActivities.length > 0 ? (
                      recentActivities.map((activity) => {
                        const emp = employees.find((e) => e.id === activity.employeeId);
                        const Icon = activity.icon;
                        return (
                          <div
                            key={activity.id}
                            className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors flex items-center justify-between group cursor-pointer"
                            onClick={() => activity.employeeId && openEmployeeProfile(activity.employeeId)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                                <Icon size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-tight truncate">
                                  {activity.title}
                                </p>
                                <p className="text-[12px] text-slate-500 mt-0.5 truncate">
                                  {emp?.name || 'System'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <Badge variant={activity.variant}>{activity.status}</Badge>
                              <p className="text-[11px] text-slate-400 mt-1 tabular-nums">{activity.timestamp}</p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-xs text-slate-400">
                        No recent overtime or leave activity recorded.
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {widgets.auditFlags && auditSummary.total > 0 && (
                <Card title="Audit Flags" className="border-danger/30">
                  <div className="flex items-center gap-4 p-4 bg-danger/5 rounded-lg border border-danger/15 mb-6">
                    <div className="w-11 h-11 bg-danger text-white rounded-lg flex items-center justify-center shrink-0">
                      <ShieldAlert size={22} />
                    </div>
                    <div>
                      <h4 className="text-[15px] font-bold text-danger">Anomalies Detected</h4>
                      <p className="text-[13px] text-danger/80">
                        Review single-punch failures and missing clock-out logs.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-danger tabular-nums">{auditSummary.spf}</p>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase">SPF</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-600 tabular-nums">{auditSummary.missingOut}</p>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase">Missing Out</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                        {auditSummary.total}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase">Total</p>
                    </div>
                  </div>
                  <Link to={`/auditor?date=${dashboardDate}`}>
                    <Button variant="danger" className="w-full">
                      Start Investigation
                    </Button>
                  </Link>
                </Card>
              )}
            </div>
          )}
        </>
      ) : (
        <DepartmentInsights />
      )}

      {/* Horilla-style Dashboard Widget Customizer Drawer */}
      {isCustomizeOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Customize Dashboard</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Show or hide workspace widgets for your view
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCustomizeOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                {WIDGET_LABELS.map((item) => {
                  const enabled = widgets[item.key];
                  return (
                    <label
                      key={item.key}
                      className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/40 cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/40"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleWidget(item.key)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 mt-6 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Button variant="outline" className="flex-1" onClick={resetWidgets}>
                Reset Defaults
              </Button>
              <Button className="flex-1" onClick={() => setIsCustomizeOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
