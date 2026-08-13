import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { 
  DEFAULT_MOVEMENT_FILTERS, 
  MovementFilterState, 
  calculateMovementKPIs, 
  calculateMonthlyTrend, 
  calculateDepartmentAttrition, 
  calculateDesignationAttrition, 
  calculateSectionMovement, 
  calculateTenureAnalysis, 
  calculateExitReasonAnalysis, 
  getPromotionRecords, 
  getDepartmentTransferMatrix, 
  getMovementDataQualityAudit, 
  generateMovementManagementInsights 
} from '../utils/movementCalculations';
import { EmployeeMovement, MovementType } from '../types';
import { 
  Users, UserCheck, UserX, TrendingUp, TrendingDown, ArrowRightLeft, 
  Award, ShieldAlert, FileSpreadsheet, Download, RefreshCw, Filter, 
  Search, Plus, CheckCircle2, AlertTriangle, Info, Calendar, Building2, Briefcase
} from 'lucide-react';
import { Modal } from '../components/ui';
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell 
} from 'recharts';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

export function MovementAttritionPage() {
  const { employees, movements, addMovement, deleteMovement } = useAppStore();

  const [filters, setFilters] = useState<MovementFilterState>(DEFAULT_MOVEMENT_FILTERS);
  const [activeTab, setActiveTab] = useState<'trends' | 'departments' | 'promotions' | 'tenure' | 'audit'>('trends');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form state for adding new movement
  const [newMove, setNewMove] = useState<{
    employeeId: string;
    effectiveDate: string;
    movementType: MovementType;
    previousDepartment: string;
    newDepartment: string;
    previousDesignation: string;
    newDesignation: string;
    previousGrade: string;
    newGrade: string;
    previousSalary: number;
    newSalary: number;
    reason: string;
    exitType: 'Voluntary' | 'Involuntary' | 'Retirement' | 'Contract End' | 'Other';
    exitReason: string;
  }>({
    employeeId: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    movementType: 'Promotion',
    previousDepartment: '',
    newDepartment: '',
    previousDesignation: '',
    newDesignation: '',
    previousGrade: '',
    newGrade: '',
    previousSalary: 0,
    newSalary: 0,
    reason: '',
    exitType: 'Voluntary',
    exitReason: 'Better Opportunity',
  });

  // Calculate Metrics
  const kpis = useMemo(() => calculateMovementKPIs(employees, movements, filters), [employees, movements, filters]);
  const monthlyTrends = useMemo(() => calculateMonthlyTrend(employees, movements, filters), [employees, movements, filters]);
  const deptAttrition = useMemo(() => calculateDepartmentAttrition(employees, movements, filters), [employees, movements, filters]);
  const desgAttrition = useMemo(() => calculateDesignationAttrition(employees, movements, filters), [employees, movements, filters]);
  const sectionMovement = useMemo(() => calculateSectionMovement(employees, movements, filters), [employees, movements, filters]);
  const tenureBands = useMemo(() => calculateTenureAnalysis(employees, movements, filters), [employees, movements, filters]);
  const exitReasons = useMemo(() => calculateExitReasonAnalysis(employees, movements, filters), [employees, movements, filters]);
  const promotionRecords = useMemo(() => getPromotionRecords(employees, movements, filters), [employees, movements, filters]);
  const transferMatrix = useMemo(() => getDepartmentTransferMatrix(movements, filters), [movements, filters]);
  const auditIssues = useMemo(() => getMovementDataQualityAudit(employees, movements), [employees, movements]);
  const insightsAndFlags = useMemo(() => generateMovementManagementInsights(kpis, deptAttrition, exitReasons), [kpis, deptAttrition, exitReasons]);

  // Unique Lists for Filter Dropdowns
  const uniqueDepts = useMemo(() => Array.from(new Set(employees.map(e => e.department || 'General'))).sort(), [employees]);
  const uniqueSections = useMemo(() => Array.from(new Set(employees.map(e => e.section || 'General'))).sort(), [employees]);
  const uniqueDesgs = useMemo(() => Array.from(new Set(employees.map(e => e.designation || 'Staff'))).sort(), [employees]);

  // Export handlers
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // KPIs Sheet
      const kpiData = [
        { Metric: 'Opening Headcount', Value: kpis.openingHeadcount },
        { Metric: 'Closing Headcount', Value: kpis.closingHeadcount },
        { Metric: 'Average Headcount', Value: kpis.averageHeadcount },
        { Metric: 'New Joiners', Value: kpis.newJoiners },
        { Metric: 'Separations', Value: kpis.separations },
        { Metric: 'Net Movement', Value: kpis.netMovement },
        { Metric: 'Attrition Rate (%)', Value: `${kpis.attritionRate}%` },
        { Metric: 'Voluntary Attrition (%)', Value: `${kpis.voluntaryAttritionRate}%` },
        { Metric: 'Involuntary Attrition (%)', Value: `${kpis.involuntaryAttritionRate}%` },
        { Metric: 'Retention Rate (%)', Value: `${kpis.retentionRate}%` },
        { Metric: 'Promotions Count', Value: kpis.promotionCount },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiData), 'KPI Summary');

      // Dept Attrition Sheet
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deptAttrition), 'Department Attrition');

      // Monthly Trend Sheet
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyTrends), 'Monthly Trend');

      // Promotions Sheet
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(promotionRecords), 'Promotions');

      XLSX.writeFile(wb, `Employee_Movement_Attrition_Report_${filters.fiscalYear.replace('/', '_')}.xlsx`);
      toast.success('Excel report exported successfully!');
    } catch (err) {
      toast.error('Failed to export Excel file');
    }
  };

  const handleExportCSV = () => {
    try {
      const csvData = deptAttrition.map(d => ({
        Department: d.department,
        'Opening HC': d.openingHC,
        Joiners: d.joiners,
        Separations: d.separations,
        'Closing HC': d.closingHC,
        'Average HC': d.averageHC,
        'Attrition Rate %': d.attritionRate,
        'Net Movement': d.netMovement,
      }));

      const ws = XLSX.utils.json_to_sheet(csvData);
      const csvStr = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Department_Attrition_${filters.fiscalYear.replace('/', '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV exported successfully!');
    } catch (err) {
      toast.error('Failed to export CSV file');
    }
  };

  const handleAddMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMove.employeeId) {
      toast.error('Please select an employee Bio ID');
      return;
    }

    const emp = employees.find(e => e.id === newMove.employeeId);

    await addMovement({
      employeeId: newMove.employeeId,
      effectiveDate: newMove.effectiveDate,
      movementType: newMove.movementType,
      previousDepartment: newMove.previousDepartment || emp?.department || 'General',
      newDepartment: newMove.newDepartment || emp?.department || 'General',
      previousDesignation: newMove.previousDesignation || emp?.designation || 'Staff',
      newDesignation: newMove.newDesignation || emp?.designation || 'Staff',
      previousGrade: newMove.previousGrade || emp?.grade || 'G-1',
      newGrade: newMove.newGrade || emp?.grade || 'G-1',
      previousSalary: newMove.previousSalary || emp?.basicSalary || 0,
      newSalary: newMove.newSalary || emp?.basicSalary || 0,
      reason: newMove.reason || 'Management Action',
      exitType: newMove.exitType,
      exitReason: newMove.exitReason,
      changedBy: 'Admin HR',
    });

    toast.success(`Movement recorded successfully for Employee ID #${newMove.employeeId}!`);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6 pb-12 print:p-0">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 print:border-none">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white rounded-2xl shadow-lg shadow-indigo-600/20">
            <TrendingUp size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Employee Movement & Attrition Analytics
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Workforce headcount movement, attrition rates, promotions, transfers, exit reasons, and tenure analytics
            </p>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setShowAuditModal(true)}
            className="px-3.5 py-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40 rounded-xl hover:bg-amber-100 transition-all shadow-sm flex items-center gap-2"
          >
            <ShieldAlert size={16} />
            Data Quality Audit ({auditIssues.length})
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2"
          >
            <Plus size={16} />
            Record Movement
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm flex items-center gap-2"
          >
            <FileSpreadsheet size={16} className="text-emerald-600" />
            Export Excel
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm flex items-center gap-2"
          >
            <Download size={16} className="text-indigo-600" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Filter size={14} className="text-indigo-600" />
            Analytics Filters & Fiscal Period
          </span>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_MOVEMENT_FILTERS)}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} /> Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Fiscal Year</label>
            <select
              value={filters.fiscalYear}
              onChange={(e) => setFilters(f => ({ ...f, fiscalYear: e.target.value }))}
              className="w-full h-8 px-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="2080/81">FY 2080/81 (2023-2024)</option>
              <option value="2079/80">FY 2079/80 (2022-2023)</option>
              <option value="2081/82">FY 2081/82 (2024-2025)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
              className="w-full h-8 px-2 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
              className="w-full h-8 px-2 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Department</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters(f => ({ ...f, department: e.target.value }))}
              className="w-full h-8 px-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
            >
              <option value="all">All Departments</option>
              {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Section</label>
            <select
              value={filters.section}
              onChange={(e) => setFilters(f => ({ ...f, section: e.target.value }))}
              className="w-full h-8 px-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
            >
              <option value="all">All Sections</option>
              {uniqueSections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Designation</label>
            <select
              value={filters.designation}
              onChange={(e) => setFilters(f => ({ ...f, designation: e.target.value }))}
              className="w-full h-8 px-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
            >
              <option value="all">All Designations</option>
              {uniqueDesgs.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Management HR Insights Banner */}
      {insightsAndFlags.flags.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {insightsAndFlags.flags.map((fl, idx) => (
                <span
                  key={idx}
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    fl.type === 'danger' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                    fl.type === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                    'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  {fl.label}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-300 font-medium">
              {insightsAndFlags.insights.join(' ')}
            </p>
          </div>
        </div>
      )}

      {/* Top 16 KPI Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPICard label="Opening HC" value={kpis.openingHeadcount} icon={Users} color="indigo" />
        <KPICard label="New Joiners" value={`+${kpis.newJoiners}`} icon={UserCheck} color="emerald" />
        <KPICard label="Separations" value={`-${kpis.separations}`} icon={UserX} color="rose" />
        <KPICard label="Closing HC" value={kpis.closingHeadcount} icon={Users} color="slate" />
        <KPICard label="Avg Headcount" value={kpis.averageHeadcount} icon={Building2} color="amber" />
        <KPICard label="Net Movement" value={kpis.netMovement >= 0 ? `+${kpis.netMovement}` : `${kpis.netMovement}`} icon={ArrowRightLeft} color={kpis.netMovement >= 0 ? 'emerald' : 'rose'} />
        <KPICard label="Attrition Rate" value={`${kpis.attritionRate}%`} icon={TrendingDown} color={kpis.attritionRate > 10 ? 'rose' : 'indigo'} />
        <KPICard label="Retention Rate" value={`${kpis.retentionRate}%`} icon={CheckCircle2} color="emerald" />

        <KPICard label="Voluntary Attr." value={`${kpis.voluntaryAttritionRate}%`} icon={UserX} color="amber" />
        <KPICard label="Involuntary Attr." value={`${kpis.involuntaryAttritionRate}%`} icon={AlertTriangle} color="rose" />
        <KPICard label="Turnover Rate" value={`${kpis.turnoverRate}%`} icon={RefreshCw} color="slate" />
        <KPICard label="Joiner Rate" value={`${kpis.newJoinerRate}%`} icon={UserCheck} color="emerald" />
        <KPICard label="Promotions" value={kpis.promotionCount} icon={Award} color="indigo" />
        <KPICard label="Transfers" value={kpis.transferCount} icon={ArrowRightLeft} color="amber" />
        <KPICard label="Dept Changes" value={kpis.departmentChangeCount} icon={Building2} color="slate" />
        <KPICard label="Promotion Rate" value={`${kpis.promotionRate}%`} icon={Award} color="emerald" />
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 print:hidden overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('trends')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'trends'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <TrendingUp size={16} />
          1. Headcount & Monthly Trends
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('departments')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'departments'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 size={16} />
          2. Department & Section Attrition
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('promotions')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'promotions'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Award size={16} />
          3. Promotions & Internal Transfers
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tenure')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'tenure'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Briefcase size={16} />
          4. Tenure & Exit Reasons
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-5 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Users size={16} />
          5. Movement Audit Log
        </button>
      </div>

      {/* TAB 1: Headcount & Monthly Trends */}
      {activeTab === 'trends' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Joiners vs Separations Chart */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Monthly Joiners vs Separations
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="monthKey" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="newJoiners" name="New Joiners" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="separations" name="Separations" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Monthly Headcount & Attrition Rate % */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Closing Headcount Trend
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="monthKey" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="closingHC" name="Closing Headcount" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Monthly Movement Trend Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Monthly Movement Breakdown ({filters.fiscalYear})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Month</th>
                    <th className="p-3 text-right">Opening HC</th>
                    <th className="p-3 text-right">New Joiners</th>
                    <th className="p-3 text-right">Separations</th>
                    <th className="p-3 text-right">Closing HC</th>
                    <th className="p-3 text-right">Net Movement</th>
                    <th className="p-3 text-right">Attrition %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlyTrends.map((row) => (
                    <tr key={row.monthKey} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{row.monthName}</td>
                      <td className="p-3 text-right text-slate-600 dark:text-slate-300">{row.openingHC}</td>
                      <td className="p-3 text-right font-bold text-emerald-600">+{row.newJoiners}</td>
                      <td className="p-3 text-right font-bold text-rose-600">-{row.separations}</td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white">{row.closingHC}</td>
                      <td className={`p-3 text-right font-bold ${row.netMovement >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {row.netMovement >= 0 ? `+${row.netMovement}` : row.netMovement}
                      </td>
                      <td className="p-3 text-right font-black text-indigo-600">{row.attritionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Department & Section Attrition */}
      {activeTab === 'departments' && (
        <div className="space-y-6">
          {/* Department Attrition Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Department-Wise Attrition & Headcount Summary
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Sorted from Highest Attrition Rate to Lowest</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Department</th>
                    <th className="p-3 text-right">Opening HC</th>
                    <th className="p-3 text-right">Joiners</th>
                    <th className="p-3 text-right">Separations</th>
                    <th className="p-3 text-right">Closing HC</th>
                    <th className="p-3 text-right">Average HC</th>
                    <th className="p-3 text-right">Net Movement</th>
                    <th className="p-3 text-right">Attrition %</th>
                    <th className="p-3 text-right">Voluntary %</th>
                    <th className="p-3 text-right">Involuntary %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {deptAttrition.map((d) => (
                    <tr key={d.department} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{d.department}</td>
                      <td className="p-3 text-right text-slate-600 dark:text-slate-300">{d.openingHC}</td>
                      <td className="p-3 text-right font-bold text-emerald-600">+{d.joiners}</td>
                      <td className="p-3 text-right font-bold text-rose-600">-{d.separations}</td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white">{d.closingHC}</td>
                      <td className="p-3 text-right text-slate-600 dark:text-slate-300">{d.averageHC}</td>
                      <td className={`p-3 text-right font-bold ${d.netMovement >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {d.netMovement >= 0 ? `+${d.netMovement}` : d.netMovement}
                      </td>
                      <td className="p-3 text-right">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-black ${
                          d.attritionRate > 10 ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/30' :
                          d.attritionRate > 5 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30' :
                          'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                        }`}>
                          {d.attritionRate}%
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-600">{d.voluntaryAttritionRate}%</td>
                      <td className="p-3 text-right text-slate-600">{d.involuntaryAttritionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Designation Attrition Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Designation Attrition & Retention
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Designation</th>
                      <th className="p-3 text-right">Staff</th>
                      <th className="p-3 text-right">Separations</th>
                      <th className="p-3 text-right">Attrition %</th>
                      <th className="p-3 text-right">Retention %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {desgAttrition.map((row) => (
                      <tr key={row.designation} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{row.designation}</td>
                        <td className="p-3 text-right text-slate-600 dark:text-slate-300">{row.employeeCount}</td>
                        <td className="p-3 text-right font-bold text-rose-600">-{row.separations}</td>
                        <td className="p-3 text-right font-bold text-indigo-600">{row.attritionRate}%</td>
                        <td className="p-3 text-right font-bold text-emerald-600">{row.retentionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section Movement Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Section-Wise Movement
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Section</th>
                      <th className="p-3 text-right">Opening HC</th>
                      <th className="p-3 text-right">Transfers In</th>
                      <th className="p-3 text-right">Transfers Out</th>
                      <th className="p-3 text-right">Closing HC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sectionMovement.map((s) => (
                      <tr key={s.section} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{s.section}</td>
                        <td className="p-3 text-right text-slate-600">{s.openingHC}</td>
                        <td className="p-3 text-right font-bold text-emerald-600">+{s.transfersIn}</td>
                        <td className="p-3 text-right font-bold text-rose-600">-{s.transfersOut}</td>
                        <td className="p-3 text-right font-bold text-slate-900 dark:text-white">{s.closingHC}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Promotions & Internal Transfers */}
      {activeTab === 'promotions' && (
        <div className="space-y-6">
          {/* Promotion Records Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Employee Promotions & Progression Log ({promotionRecords.length})
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Designation, Grade, and Salary Increments</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Bio ID</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Effective Date</th>
                    <th className="p-3">Designation Progression</th>
                    <th className="p-3">Grade Change</th>
                    <th className="p-3 text-right">Salary Increment</th>
                    <th className="p-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {promotionRecords.length > 0 ? (
                    promotionRecords.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{p.employeeId}</td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{p.employeeName}</td>
                        <td className="p-3 text-slate-600">{p.department}</td>
                        <td className="p-3 text-slate-500">{p.effectiveDate}</td>
                        <td className="p-3 text-slate-700 dark:text-slate-300">
                          <span className="text-slate-400">{p.previousDesignation}</span> → <strong className="text-indigo-600 dark:text-indigo-400">{p.newDesignation}</strong>
                        </td>
                        <td className="p-3 text-slate-600">
                          {p.previousGrade} → <strong className="text-slate-900 dark:text-white">{p.newGrade}</strong>
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-600">
                          NPR {p.newSalary.toLocaleString()} <span className="text-[10px] text-emerald-500">(+{p.incrementPercentage}%)</span>
                        </td>
                        <td className="p-3 text-slate-500 italic">{p.reason}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                        No promotion records found for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Department Transfer Matrix */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Inter-Departmental Transfer Matrix
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {transferMatrix.length > 0 ? (
                transferMatrix.map((tm, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Transfer Route</p>
                      <p className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                        {tm.fromDepartment} → {tm.toDepartment}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 rounded-lg font-black text-xs">
                      {tm.count} Employees
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs font-semibold text-slate-400">No cross-departmental transfers recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Tenure & Exit Reasons */}
      {activeTab === 'tenure' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tenure Band Distribution Chart */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Workforce Tenure Band Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tenureBands}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="band" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="employeeCount" name="Active Staff" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Exit Reasons Chart */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Primary Exit Reasons
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={exitReasons} dataKey="count" nameKey="reason" cx="50%" cy="50%" outerRadius={80} label>
                      {exitReasons.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Tenure Bands Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Tenure Band Analysis & Average Salary
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Tenure Band</th>
                    <th className="p-3 text-right">Active Employee Count</th>
                    <th className="p-3 text-right">Average Monthly Salary</th>
                    <th className="p-3 text-right">Joiners</th>
                    <th className="p-3 text-right">Separations</th>
                    <th className="p-3 text-right">Attrition %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tenureBands.map((tb) => (
                    <tr key={tb.band} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{tb.label}</td>
                      <td className="p-3 text-right font-bold text-indigo-600">{tb.employeeCount}</td>
                      <td className="p-3 text-right text-slate-700 dark:text-slate-300 font-semibold">
                        NPR {tb.averageSalary.toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-emerald-600 font-bold">+{tb.joiners}</td>
                      <td className="p-3 text-right text-rose-600 font-bold">-{tb.separations}</td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white">{tb.attritionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Movement Audit Log */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Bio ID, Name, Movement Type, Department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3">Bio ID</th>
                    <th className="p-3">Effective Date</th>
                    <th className="p-3">Movement Type</th>
                    <th className="p-3">Previous Department</th>
                    <th className="p-3">New Department</th>
                    <th className="p-3">Previous Designation</th>
                    <th className="p-3">New Designation</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements.length > 0 ? (
                    movements
                      .filter(m => {
                        if (!searchTerm) return true;
                        const s = searchTerm.toLowerCase();
                        return (
                          m.employeeId.toLowerCase().includes(s) ||
                          m.movementType.toLowerCase().includes(s) ||
                          (m.newDepartment || '').toLowerCase().includes(s) ||
                          (m.newDesignation || '').toLowerCase().includes(s)
                        );
                      })
                      .map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{m.employeeId}</td>
                          <td className="p-3 text-slate-600">{m.effectiveDate}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] rounded uppercase">
                              {m.movementType}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500">{m.previousDepartment || '-'}</td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{m.newDepartment || '-'}</td>
                          <td className="p-3 text-slate-500">{m.previousDesignation || '-'}</td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{m.newDesignation || '-'}</td>
                          <td className="p-3 text-slate-500 italic">{m.reason || '-'}</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                deleteMovement(m.id);
                                toast.success('Movement record deleted');
                              }}
                              className="text-rose-600 hover:text-rose-700 font-bold text-[11px]"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                        No movement audit records found. Click "Record Movement" to add employee changes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record Movement Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Record Employee Movement / Status Change"
      >
        <form onSubmit={handleAddMovementSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Select Employee (Bio ID / Name) *
            </label>
            <select
              value={newMove.employeeId}
              onChange={(e) => {
                const id = e.target.value;
                const emp = employees.find(x => x.id === id);
                setNewMove(m => ({
                  ...m,
                  employeeId: id,
                  previousDepartment: emp?.department || 'General',
                  newDepartment: emp?.department || 'General',
                  previousDesignation: emp?.designation || 'Staff',
                  newDesignation: emp?.designation || 'Staff',
                  previousGrade: emp?.grade || 'G-1',
                  newGrade: emp?.grade || 'G-1',
                  previousSalary: emp?.basicSalary || 0,
                  newSalary: emp?.basicSalary || 0,
                }));
              }}
              required
              className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium outline-none"
            >
              <option value="">-- Choose Employee Master --</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  #{e.id} - {e.name} ({e.department || 'General'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Effective Date *
              </label>
              <input
                type="date"
                value={newMove.effectiveDate}
                onChange={(e) => setNewMove(m => ({ ...m, effectiveDate: e.target.value }))}
                required
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Movement Type *
              </label>
              <select
                value={newMove.movementType}
                onChange={(e) => setNewMove(m => ({ ...m, movementType: e.target.value as any }))}
                required
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none font-medium"
              >
                <option value="Promotion">Promotion</option>
                <option value="Transfer">Transfer</option>
                <option value="Department Change">Department Change</option>
                <option value="Designation Change">Designation Change</option>
                <option value="Salary Change">Salary Change</option>
                <option value="Resignation">Resignation (Exit)</option>
                <option value="Termination">Termination (Exit)</option>
                <option value="Retirement">Retirement</option>
                <option value="Contract End">Contract End</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Previous Department</label>
              <input
                type="text"
                value={newMove.previousDepartment}
                onChange={(e) => setNewMove(m => ({ ...m, previousDepartment: e.target.value }))}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">New Department</label>
              <input
                type="text"
                value={newMove.newDepartment}
                onChange={(e) => setNewMove(m => ({ ...m, newDepartment: e.target.value }))}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Previous Designation</label>
              <input
                type="text"
                value={newMove.previousDesignation}
                onChange={(e) => setNewMove(m => ({ ...m, previousDesignation: e.target.value }))}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">New Designation</label>
              <input
                type="text"
                value={newMove.newDesignation}
                onChange={(e) => setNewMove(m => ({ ...m, newDesignation: e.target.value }))}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Previous Basic Salary</label>
              <input
                type="number"
                value={newMove.previousSalary}
                onChange={(e) => setNewMove(m => ({ ...m, previousSalary: Number(e.target.value) }))}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">New Basic Salary</label>
              <input
                type="number"
                value={newMove.newSalary}
                onChange={(e) => setNewMove(m => ({ ...m, newSalary: Number(e.target.value) }))}
                className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Reason / Remarks</label>
            <input
              type="text"
              placeholder="e.g. Annual Appraisal, Relocation, Personal Resignation"
              value={newMove.reason}
              onChange={(e) => setNewMove(m => ({ ...m, reason: e.target.value }))}
              className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md"
            >
              Save Movement
            </button>
          </div>
        </form>
      </Modal>

      {/* Data Quality Audit Modal */}
      <Modal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        title="Movement & Master Data Quality Audit"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Audit checks for Employee Directory master consistency, missing dates, and separation anomalies:
          </p>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {auditIssues.length > 0 ? (
              auditIssues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border text-xs flex items-start gap-3 ${
                    issue.severity === 'high' ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-900/40' :
                    'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-900/40'
                  }`}
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-500" />
                  <div>
                    <div className="flex items-center gap-2 font-bold">
                      <span>#{issue.employeeId} - {issue.employeeName}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-black bg-white/60">
                        {issue.issueType}
                      </span>
                    </div>
                    <p className="text-[11px] opacity-90 mt-0.5">{issue.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-emerald-600 font-bold text-xs bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                ✓ All employee master data passed movement consistency checks!
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// KPI Card Sub-component
function KPICard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  const colorStyles: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-900/30',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900/30',
    rose: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/40 dark:border-rose-900/30',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/40 dark:border-amber-900/30',
    slate: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:border-slate-700',
  };

  return (
    <div className={`p-3 rounded-2xl border shadow-sm ${colorStyles[color] || colorStyles.indigo} flex flex-col justify-between`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</span>
        <Icon size={14} className="opacity-70" />
      </div>
      <h4 className="text-lg font-black text-slate-900 dark:text-white mt-2 truncate">{value}</h4>
    </div>
  );
}
