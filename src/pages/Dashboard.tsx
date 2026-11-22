import { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { 
  Users, UserCheck, UserX, Clock, Fingerprint, CalendarClock, ShieldAlert, 
  ArrowRight, TrendingUp, Activity, Briefcase, History, RefreshCw, ChevronLeft, ChevronRight,
  Shield, Cog, Building2
} from 'lucide-react';
import { formatDuration, cn } from '../lib/utils';
import { detectExceptions } from '../lib/engine';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { DepartmentInsights } from '../components/DepartmentInsights';
import { BiometricHealth } from '../components/BiometricHealth';
import { PageHeader, Card, KPICard, Button, Badge } from '../components/ui';

export function Dashboard() {
  const navigate = useNavigate();
  const { 
    employees, processedData, settings, overtimeRecords, sblRecords, 
    forceAttendanceRecords, assignmentLogs, auditLogs, punches,
    openEmployeeProfile, recalculate, isInitializing
  } = useAppStore();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'insights'>('overview');
  const availableDates = useMemo(() => {
    return [...new Set(processedData.map(p => p.date))].sort().reverse();
  }, [processedData]);

  const [dashboardDate, setDashboardDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  useEffect(() => {
    if (availableDates.length > 0 && !availableDates.includes(dashboardDate)) {
      setDashboardDate(availableDates[0]);
    }
  }, [availableDates]);

  const handlePrevDay = () => setDashboardDate(prev => format(subDays(parseISO(prev), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setDashboardDate(prev => format(addDays(parseISO(prev), 1), 'yyyy-MM-dd'));

  const processedByDate = useMemo(() => {
    const map = new Map<string, typeof processedData>();
    processedData.forEach(p => {
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
       spf: todaysExceptions.filter(e => e.type === 'SPF').length,
       missingOut: todaysExceptions.filter(e => e.type === 'SPF' || e.type === 'Missing Out').length,
       mismatch: todaysExceptions.filter(e => e.type === 'Punch Outside Shift' || e.type === 'Shift Mismatch').length,
     };
  }, [todaysData, employees, settings]);

  const stats = useMemo(() => {
    const present = todaysData.filter(d => ['Present', 'Late', 'SPF', 'On Time', 'Early', 'PWO'].includes(d.status)).length;
    const todaysOT = overtimeRecords.filter(r => r.date === dashboardDate && r.status === 'Approved').reduce((acc, curr) => acc + curr.hours, 0);
    const todaysSBL = sblRecords.filter(r => r.date === dashboardDate && (r.status === 'Approved' || r.status === 'Final Confirmed')).length;
    const activeEmployeesCount = employees.filter(e => e.status === 'Active').length;
    const absent = Math.max(0, activeEmployeesCount - present - todaysSBL);
    const contractorCount = new Set(employees.filter(e => e.contractorName).map(e => e.contractorName)).size;

    return {
      activeEmployees: activeEmployeesCount,
      contractorCount,
      present,
      absent,
      late: todaysData.filter(d => d.lateMinutes > 0).length,
      spf: todaysData.filter(d => d.status === 'SPF').length,
      early: todaysData.filter(d => d.status === 'Early').length,
      todaysOT,
      todaysSBL,
      attendanceRate: activeEmployeesCount > 0 ? Math.round((present / activeEmployeesCount) * 100) : 0
    };
  }, [todaysData, employees, dashboardDate, overtimeRecords, sblRecords]);

  const dailyBreakdownData = useMemo(() => [
    { name: 'Present', value: stats.present, color: '#1D4ED8' },
    { name: 'Absent', value: stats.absent, color: '#DC2626' },
    { name: 'On Leave', value: stats.todaysSBL, color: '#6366f1' },
  ].filter(d => d.value > 0), [stats]);

  const recentActivities = useMemo(() => {
    const activities: any[] = [];
    overtimeRecords.slice(-10).forEach(ot => {
      activities.push({
        id: `ot-${ot.id}`,
        type: 'OT',
        title: ot.status === 'Approved' ? 'OT Approved' : 'OT Request',
        subtitle: `${ot.hours}h for ${ot.date}`,
        timestamp: ot.reviewedDate || ot.date,
        status: ot.status,
        employeeId: ot.employeeId,
        icon: Clock,
        variant: ot.status === 'Approved' ? 'success' : 'warning'
      });
    });
    sblRecords.slice(-10).forEach(sbl => {
      activities.push({
        id: `sbl-${sbl.id}`,
        type: 'SBL',
        title: `${sbl.leaveType} ${sbl.status}`,
        subtitle: `${sbl.duration} - ${sbl.reason}`,
        timestamp: sbl.date,
        status: sbl.status,
        employeeId: sbl.employeeId,
        icon: CalendarClock,
        variant: 'info'
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
     return last30Days.map(date => {
       const dayData = processedByDate.get(date) || [];
       const present = dayData.filter(d => ['Present', 'Late', 'SPF', 'On Time', 'Early'].includes(d.status)).length;
       return {
         date,
         display: format(parseISO(date), 'dd MMM'),
         Attendance: present,
         OT: overtimeRecords.filter(r => r.date === date && r.status === 'Approved').reduce((acc, curr) => acc + curr.hours, 0)
       };
     });
  }, [processedByDate, dashboardDate, overtimeRecords]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Operations Dashboard" 
        description="Real-time manpower tracking and operational oversight"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded overflow-hidden shadow-sm">
              <button onClick={handlePrevDay} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 border-r border-slate-200 dark:border-slate-800">
                <ChevronLeft size={16} />
              </button>
              <div className="px-4 py-1.5 min-w-[180px] text-center">
                <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  {format(parseISO(dashboardDate), 'EEE, dd MMM yyyy')}
                </span>
              </div>
              <button onClick={handleNextDay} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-400 border-l border-slate-200 dark:border-slate-800">
                <ChevronRight size={16} />
              </button>
            </div>
            <Button variant="outline" onClick={() => recalculate()} disabled={isInitializing}>
              <RefreshCw size={14} className={isInitializing ? "animate-spin" : ""} />
              {isInitializing ? 'Syncing' : 'Sync'}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800 p-1 rounded-lg w-fit">
        <button 
          onClick={() => setActiveTab('overview')}
          className={cn(
            "px-4 py-1.5 rounded text-[13px] font-semibold transition-all",
            activeTab === 'overview' ? "bg-white dark:bg-slate-900 text-primary shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          Overview
        </button>
        <button 
          onClick={() => setActiveTab('insights')}
          className={cn(
            "px-4 py-1.5 rounded text-[13px] font-semibold transition-all",
            activeTab === 'insights' ? "bg-white dark:bg-slate-900 text-primary shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          )}
        >
          Insights
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard 
              label="Total Manpower" 
              value={stats.activeEmployees} 
              icon={Users} 
              trend="up" 
              trendValue="Active Staff" 
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
              trendValue="Manpower Deficit" 
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card title="Attendance Performance" className="lg:col-span-2">
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorAtt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis 
                      dataKey="display" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#64748B', fontSize: 11}}
                      minTickGap={30}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 11}} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }} 
                      itemStyle={{ fontSize: '13px', fontWeight: '600' }}
                    />
                    <Area type="monotone" dataKey="Attendance" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAtt)" />
                    <Area type="monotone" dataKey="OT" stroke="#16A34A" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Staff Distribution">
              <div className="h-[300px] w-full flex flex-col items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dailyBreakdownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {dailyBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                   <p className="text-3xl font-bold text-slate-900 dark:text-white leading-none">{stats.activeEmployees}</p>
                   <p className="text-[11px] text-slate-500 mt-2 uppercase tracking-wider font-semibold">Staff Total</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {dailyBreakdownData.map((d) => (
                  <div key={d.name} className="text-center p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                     <p className="text-[15px] font-bold text-slate-900 dark:text-white leading-none">{d.value}</p>
                     <p className="text-[10px] text-slate-500 font-semibold uppercase mt-1.5">{d.name}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <BiometricHealth />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="System Activity" actions={<Link to="/audit-logs"><Button variant="ghost" size="sm">View All</Button></Link>}>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-5 -mb-5">
                {recentActivities.map((activity) => {
                  const emp = employees.find(e => e.id === activity.employeeId);
                  const Icon = activity.icon;
                  return (
                    <div 
                      key={activity.id} 
                      className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between group cursor-pointer"
                      onClick={() => activity.employeeId && openEmployeeProfile(activity.employeeId)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500")}>
                          <Icon size={16} />
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-slate-900 dark:text-white leading-tight">{activity.title}</p>
                          <p className="text-[12px] text-slate-500 mt-0.5">{emp?.name || 'System'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={activity.variant}>{activity.status}</Badge>
                        <p className="text-[11px] text-slate-400 mt-1">{activity.timestamp}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {auditSummary.total > 0 && (
              <Card title="Audit Flags" className="border-danger/30">
                <div className="flex items-center gap-6 p-4 bg-danger/5 rounded-lg border border-danger/10 mb-6">
                  <div className="w-12 h-12 bg-danger text-white rounded flex items-center justify-center">
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-bold text-danger italic">Anomalies Detected</h4>
                    <p className="text-[13px] text-danger/80">Investigations required for biometric data.</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-danger">{auditSummary.spf}</p>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase">SPF</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-600">{auditSummary.missingOut}</p>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase">Missing Out</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{auditSummary.total}</p>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase">Total</p>
                  </div>
                </div>
                <Link to={`/auditor?date=${dashboardDate}`}>
                  <Button variant="danger" className="w-full">Start Investigation</Button>
                </Link>
              </Card>
            )}
          </div>
        </>
      ) : (
        <DepartmentInsights />
      )}
    </div>
  );
}
