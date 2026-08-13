import React, { useMemo } from 'react';
import { Employee, PayrollRun } from '../../types';
import { SalaryFilterState, DrillDownData } from '../../types/salaryAnalysis';
import { 
  getSalaryStructureRows, 
  getDepartmentSalarySummary, 
  getDesignationSalarySummary, 
  getSectionSalarySummary, 
  getCostTrendAnalysis, 
  getDataQualityAudit, 
  generateManagementInsights 
} from '../../utils/salaryCalculations';
import { 
  Building2, Briefcase, TrendingUp, PieChart as PieChartIcon, 
  BarChart2, ShieldAlert, Sparkles, AlertCircle, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';

interface CostAnalysisTabProps {
  employees: Employee[];
  filteredEmployees: Employee[];
  payrollRuns: PayrollRun[];
  filters: SalaryFilterState;
  onOpenDrillDown: (data: DrillDownData) => void;
  onOpenDataQualityModal: () => void;
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#6366F1', '#14B8A6'];

export function CostAnalysisTab({
  employees,
  filteredEmployees,
  payrollRuns,
  filters,
  onOpenDrillDown,
  onOpenDataQualityModal
}: CostAnalysisTabProps) {
  const structureRows = useMemo(() => getSalaryStructureRows(filteredEmployees), [filteredEmployees]);
  const deptSummary = useMemo(() => getDepartmentSalarySummary(structureRows), [structureRows]);
  const desgSummary = useMemo(() => getDesignationSalarySummary(structureRows), [structureRows]);
  const sectionSummary = useMemo(() => getSectionSalarySummary(structureRows), [structureRows]);
  const costTrends = useMemo(() => getCostTrendAnalysis(payrollRuns, structureRows), [payrollRuns, structureRows]);
  const qualityIssues = useMemo(() => getDataQualityAudit(employees, structureRows), [employees, structureRows]);
  const insights = useMemo(() => generateManagementInsights(structureRows, deptSummary, desgSummary, [], qualityIssues), [structureRows, deptSummary, desgSummary, qualityIssues]);

  // Overall KPI metrics for Cost Analysis
  const totalEmps = structureRows.length;
  const totalMonthlyBasic = structureRows.reduce((a, b) => a + b.basicSalary, 0);
  const totalMonthlyGross = structureRows.reduce((a, b) => a + b.grossSalary, 0);
  const totalEmpSSF = structureRows.reduce((a, b) => a + b.employeeSSF, 0);
  const totalEmprSSF = structureRows.reduce((a, b) => a + b.employerSSF, 0);
  const totalMonthlyCTC = structureRows.reduce((a, b) => a + b.monthlyCTC, 0);

  const annualBasic = totalMonthlyBasic * 12;
  const annualGross = totalMonthlyGross * 12;
  const annualEmprSSF = totalEmprSSF * 12;
  const annualCTC = totalMonthlyCTC * 12;

  const avgCostPerEmp = totalEmps > 0 ? Math.round(totalMonthlyCTC / totalEmps) : 0;
  const avgAnnualCostPerEmp = totalEmps > 0 ? Math.round(annualCTC / totalEmps) : 0;

  return (
    <div className="space-y-6">
      {/* Management Insights Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-950 rounded-2xl p-5 text-white shadow-lg space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={20} />
            <h3 className="font-bold text-sm tracking-wide">Automated Strategic Workforce Cost Insights</h3>
          </div>
          <span className="text-[10px] bg-white/10 px-2.5 py-0.5 rounded-full font-medium text-slate-300">
            Real Data Analytics Engine
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {insights.map((insight, idx) => (
            <div key={idx} className="flex items-start gap-2 bg-white/5 p-2.5 rounded-xl border border-white/10">
              <span className="text-amber-400 font-bold shrink-0">•</span>
              <p className="text-slate-200 leading-relaxed">{insight}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Requirement 15: Cost Analysis KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Active Staff</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{totalEmps}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Headcount</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Basic Cost</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">Rs. {totalMonthlyBasic.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Basic Salary Payroll</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Gross Cost</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">Rs. {totalMonthlyGross.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Gross Payroll Outflow</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Employer SSF</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">Rs. {totalEmprSSF.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Statutory Employer SSF</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Total CTC</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">Rs. {totalMonthlyCTC.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Gross + Employer SSF</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Cost / Employee</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {avgCostPerEmp.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Monthly Avg CTC</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Annual Basic Cost</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {(annualBasic / 100000).toFixed(2)} Lakhs</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Basic * 12</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Annual Gross Cost</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">Rs. {(annualGross / 100000).toFixed(2)} Lakhs</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Gross * 12</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Annual Employer SSF</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">Rs. {(annualEmprSSF / 100000).toFixed(2)} Lakhs</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Employer SSF * 12</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Annual Total CTC</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">Rs. {(annualCTC / 10000000).toFixed(2)} Crore</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Annual Total CTC</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Annual Cost / Employee</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {avgAnnualCostPerEmp.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Annual Avg CTC</p>
        </div>

        {/* Data Quality Audit Trigger Button */}
        <button
          type="button"
          onClick={onOpenDataQualityModal}
          className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3.5 rounded-2xl shadow-sm text-left hover:bg-rose-100 transition-all group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Data Audit</p>
            <ShieldAlert size={16} className="text-rose-500 group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-xl font-bold text-rose-700 dark:text-rose-300 mt-1">{qualityIssues.length} Issue(s)</p>
          <p className="text-[10px] text-rose-600/80 font-medium mt-0.5">View Audit Details →</p>
        </button>
      </div>

      {/* Requirement 16: Department-Wise Cost Analysis */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Department-Wise Workforce Cost Breakdown</h3>
            <p className="text-xs text-slate-500">Sorted from highest total CTC cost to lowest</p>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Department</th>
                <th className="p-3 text-center">Emp Count</th>
                <th className="p-3 text-right">Basic Cost</th>
                <th className="p-3 text-right">Gross Salary Cost</th>
                <th className="p-3 text-right">Employee SSF</th>
                <th className="p-3 text-right">Employer SSF</th>
                <th className="p-3 text-right">Monthly CTC</th>
                <th className="p-3 text-right">Annual CTC</th>
                <th className="p-3 text-center">% Share of Total CTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {deptSummary.map(row => (
                <tr key={row.department} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                    <button
                      type="button"
                      onClick={() => onOpenDrillDown({
                        title: `Department Cost Drill-Down: ${row.department}`,
                        type: 'department',
                        filterKey: row.department,
                        employees: filteredEmployees.filter(e => e.department === row.department),
                        totalGross: row.totalGross,
                        totalCTC: row.totalMonthlyCTC
                      })}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {row.department}
                    </button>
                  </td>
                  <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                  <td className="p-3 text-right font-mono">Rs. {row.totalBasic.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.totalGross.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-slate-500">Rs. {row.totalEmployeeSSF.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-amber-600 font-bold">Rs. {row.totalEmployerSSF.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.totalMonthlyCTC.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-purple-600 font-bold">Rs. {row.annualCTC.toLocaleString()}</td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                      {row.pctOfTotalCTC}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Requirement 17 & 18: Designation & Section Cost Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Designation Cost */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Designation-Wise Cost Analysis</h3>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Designation</th>
                  <th className="p-3 text-center">Emps</th>
                  <th className="p-3 text-right">Gross Cost</th>
                  <th className="p-3 text-right">Employer SSF</th>
                  <th className="p-3 text-right">Monthly CTC</th>
                  <th className="p-3 text-right">Avg CTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {desgSummary.map(row => (
                  <tr key={row.designation} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.designation}</td>
                    <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.totalGrossCost.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-amber-600">Rs. {Math.round(row.totalCTC - row.totalGrossCost).toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">Rs. {row.totalCTC.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgCTC.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section Cost */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Section-Wise Cost Analysis</h3>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Section</th>
                  <th className="p-3 text-center">Emps</th>
                  <th className="p-3 text-right">Monthly Gross</th>
                  <th className="p-3 text-right">Employer SSF</th>
                  <th className="p-3 text-right">Monthly CTC</th>
                  <th className="p-3 text-right">Annual CTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {sectionSummary.map(row => (
                  <tr key={row.section} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.section}</td>
                    <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.totalGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-amber-600">Rs. {row.employerSSF.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600">Rs. {row.totalCTC.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-purple-600 font-bold">Rs. {row.annualCTC.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Requirement 20: 7 Payroll Cost Distribution Charts */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Workforce Cost Analytics Charts</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chart 1: CTC by Department */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">1. Total CTC by Department</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptSummary}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, 'Total CTC']} />
                  <Bar dataKey="totalMonthlyCTC" name="Total CTC" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Gross Salary by Department */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">2. Gross Salary by Department</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptSummary}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, 'Gross Salary']} />
                  <Bar dataKey="totalGross" name="Gross Salary" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Employee Count by Department */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">3. Employee Headcount by Department</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deptSummary} dataKey="employeeCount" nameKey="department" cx="50%" cy="50%" outerRadius={80} label={(entry) => `${entry.department}: ${entry.employeeCount}`}>
                    {deptSummary.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${val} Employees`, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Average CTC by Designation */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">4. Average CTC by Designation</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={desgSummary.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="designation" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, 'Avg CTC']} />
                  <Bar dataKey="avgCTC" name="Avg CTC" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 5: Employer SSF Cost by Department */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">5. Employer SSF Cost by Department</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptSummary}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, 'Employer SSF']} />
                  <Bar dataKey="totalEmployerSSF" name="Employer SSF" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 6: Cost Trend MoM */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">6. Payroll Cost MoM Trend</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={costTrends}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, 'Total CTC']} />
                  <Line type="monotone" dataKey="totalCTC" name="Total CTC" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Requirement 21: Cost Trend Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Historical Payroll Cost Trend & MoM Variation</h3>
          <p className="text-xs text-slate-500">Tracks monthly gross payroll, employer SSF contributions, and MoM variance</p>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Month</th>
                <th className="p-3 text-center">Headcount</th>
                <th className="p-3 text-right">Gross Payroll</th>
                <th className="p-3 text-right">Employer SSF</th>
                <th className="p-3 text-right">Total CTC</th>
                <th className="p-3 text-right">MoM Change (Rs.)</th>
                <th className="p-3 text-right">MoM %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {costTrends.map(row => (
                <tr key={row.month} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-bold text-slate-900 dark:text-white">{row.month}</td>
                  <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                  <td className="p-3 text-right font-mono">Rs. {row.grossPayroll.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-amber-600">Rs. {row.employerSSF.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.totalCTC.toLocaleString()}</td>
                  <td className={`p-3 text-right font-mono font-bold ${row.momChange >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {row.momChange >= 0 ? '+' : ''}Rs. {row.momChange.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-mono font-bold">
                    {row.momPct > 0 ? '+' : ''}{row.momPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
