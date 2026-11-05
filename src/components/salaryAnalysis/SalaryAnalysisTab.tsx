import React, { useState, useMemo } from 'react';
import { Employee } from '../../types';
import { 
  SalaryFilterState, 
  SalaryBand, 
  DrillDownData 
} from '../../types/salaryAnalysis';
import { 
  getSalaryStructureRows, 
  getDepartmentSalarySummary, 
  getDesignationSalarySummary, 
  getSectionSalarySummary, 
  getSalaryDistribution, 
  getAvgVsMedianAnalysis, 
  getSalaryPercentilesByDesignation, 
  getSalaryEquityAnalysis, 
  getCompaRatioAnalysis, 
  getSalaryCompressionRisks, 
  getExperienceBandAnalysis, 
  calculatePercentile 
} from '../../utils/salaryCalculations';
import { 
  formatUniversalDate, 
  getNepaliDate 
} from '../../utils/dateHelper';
import { 
  Users, TrendingUp, AlertTriangle, ShieldAlert,
  BarChart2, Settings2, Search, ArrowUpDown, ChevronRight, HelpCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ComposedChart, Line
} from 'recharts';

interface SalaryAnalysisTabProps {
  employees: Employee[];
  filteredEmployees: Employee[];
  filters: SalaryFilterState;
  salaryBands: SalaryBand[];
  onOpenBandModal: () => void;
  onOpenDrillDown: (data: DrillDownData) => void;
}

export function SalaryAnalysisTab({
  employees,
  filteredEmployees,
  filters,
  salaryBands,
  onOpenBandModal,
  onOpenDrillDown
}: SalaryAnalysisTabProps) {
  const [subTab, setSubTab] = useState<
    | 'structure'
    | 'department'
    | 'designation'
    | 'section'
    | 'distribution'
    | 'avgVsMedian'
    | 'range'
    | 'equity'
    | 'comparatio'
    | 'compression'
    | 'experience'
  >('structure');

  const [searchTerm, setSearchTerm] = useState('');
  const [avgVsMedianType, setAvgVsMedianType] = useState<'Department' | 'Designation'>('Department');

  // Base calculated salary structure rows
  const structureRows = useMemo(() => {
    return getSalaryStructureRows(filteredEmployees);
  }, [filteredEmployees]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const count = structureRows.length;
    if (count === 0) {
      return {
        totalEmps: 0,
        avgBasic: 0,
        medianBasic: 0,
        avgGross: 0,
        medianGross: 0,
        minGross: 0,
        maxGross: 0,
        avgMonthlyCTC: 0,
        totalMonthlyGross: 0,
        totalMonthlyCTC: 0,
        annualGross: 0,
        annualCTC: 0,
        avgEmployerSSF: 0,
        totalEmployerSSF: 0
      };
    }

    const basicList = structureRows.map(r => r.basicSalary).sort((a, b) => a - b);
    const grossList = structureRows.map(r => r.grossSalary).sort((a, b) => a - b);
    const ctcList = structureRows.map(r => r.monthlyCTC).sort((a, b) => a - b);
    const emprSsfList = structureRows.map(r => r.employerSSF);

    const totalBasic = basicList.reduce((a, b) => a + b, 0);
    const totalGross = grossList.reduce((a, b) => a + b, 0);
    const totalCTC = ctcList.reduce((a, b) => a + b, 0);
    const totalEmprSSF = emprSsfList.reduce((a, b) => a + b, 0);

    return {
      totalEmps: count,
      avgBasic: Math.round(totalBasic / count),
      medianBasic: calculatePercentile(basicList, 50),
      avgGross: Math.round(totalGross / count),
      medianGross: calculatePercentile(grossList, 50),
      minGross: grossList[0] || 0,
      maxGross: grossList[count - 1] || 0,
      avgMonthlyCTC: Math.round(totalCTC / count),
      totalMonthlyGross: totalGross,
      totalMonthlyCTC: totalCTC,
      annualGross: totalGross * 12,
      annualCTC: totalCTC * 12,
      avgEmployerSSF: Math.round(totalEmprSSF / count),
      totalEmployerSSF: totalEmprSSF
    };
  }, [structureRows]);

  // Summaries
  const deptSummary = useMemo(() => getDepartmentSalarySummary(structureRows), [structureRows]);
  const desgSummary = useMemo(() => getDesignationSalarySummary(structureRows), [structureRows]);
  const sectionSummary = useMemo(() => getSectionSalarySummary(structureRows), [structureRows]);
  const distributionRows = useMemo(() => getSalaryDistribution(structureRows, salaryBands), [structureRows, salaryBands]);
  const avgVsMedianRows = useMemo(() => getAvgVsMedianAnalysis(structureRows, avgVsMedianType), [structureRows, avgVsMedianType]);
  const percentileRows = useMemo(() => getSalaryPercentilesByDesignation(structureRows), [structureRows]);
  const equityRows = useMemo(() => getSalaryEquityAnalysis(structureRows), [structureRows]);
  const compaRows = useMemo(() => getCompaRatioAnalysis(structureRows), [structureRows]);
  const compressionRisks = useMemo(() => getSalaryCompressionRisks(structureRows), [structureRows]);
  const experienceRows = useMemo(() => getExperienceBandAnalysis(structureRows), [structureRows]);

  // Filtered rows for table search
  const filteredStructureRows = useMemo(() => {
    if (!searchTerm) return structureRows;
    const term = searchTerm.toLowerCase();
    return structureRows.filter(r =>
      r.employeeId.toLowerCase().includes(term) ||
      r.employeeName.toLowerCase().includes(term) ||
      r.department.toLowerCase().includes(term) ||
      r.designation.toLowerCase().includes(term)
    );
  }, [structureRows, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Requirement 3: 15 Primary KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Active Emps</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{kpis.totalEmps.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Matched Filters</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Basic Salary</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">Rs. {kpis.avgBasic.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Monthly Basic Mean</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Median Basic Salary</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">Rs. {kpis.medianBasic.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">50th Percentile Basic</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Gross Salary</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">Rs. {kpis.avgGross.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Monthly Gross Mean</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Median Gross Salary</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">Rs. {kpis.medianGross.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">50th Percentile Gross</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Min Gross Salary</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {kpis.minGross.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Lowest Salary</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Max Gross Salary</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {kpis.maxGross.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Highest Salary</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Monthly CTC</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">Rs. {kpis.avgMonthlyCTC.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Average Cost Per Employee</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Gross Payroll</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {(kpis.totalMonthlyGross / 100000).toFixed(2)} Lakhs</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Total Monthly Salary</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Monthly CTC</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">Rs. {(kpis.totalMonthlyCTC / 100000).toFixed(2)} Lakhs</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Monthly Total CTC</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Annual Gross Payroll</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {(kpis.annualGross / 10000000).toFixed(2)} Crore</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Gross * 12 Months</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Annualized CTC</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">Rs. {(kpis.annualCTC / 10000000).toFixed(2)} Crore</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Total Monthly CTC * 12</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Employer SSF</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">Rs. {kpis.avgEmployerSSF.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Average Employer Contribution</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Employer SSF</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">Rs. {kpis.totalEmployerSSF.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Monthly Total Employer SSF</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setSubTab('structure')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'structure'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Salary Structure ({structureRows.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('department')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'department'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          By Department ({deptSummary.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('designation')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'designation'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          By Designation ({desgSummary.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('section')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'section'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          By Section ({sectionSummary.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('distribution')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'distribution'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Salary Distribution & Bands
        </button>

        <button
          type="button"
          onClick={() => setSubTab('avgVsMedian')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'avgVsMedian'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Average vs Median
        </button>

        <button
          type="button"
          onClick={() => setSubTab('range')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'range'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Salary Ranges & Percentiles
        </button>

        <button
          type="button"
          onClick={() => setSubTab('equity')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'equity'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Salary Equity Analysis
        </button>

        <button
          type="button"
          onClick={() => setSubTab('comparatio')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'comparatio'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Compa-Ratio
        </button>

        <button
          type="button"
          onClick={() => setSubTab('compression')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
            subTab === 'compression'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Compression Risks
          {compressionRisks.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {compressionRisks.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubTab('experience')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
            subTab === 'experience'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Experience vs Salary
        </button>
      </div>

      {/* SubTab 1: Salary Structure Table */}
      {subTab === 'structure' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Individual Employee Salary Structure</h3>
              <p className="text-xs text-slate-500">Calculated directly from actual Employee Directory & Salary Master configurations</p>
            </div>

            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter salary records..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Emp ID</th>
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Grade</th>
                  <th className="p-3">DOJ</th>
                  <th className="p-3 text-center">Experience</th>
                  <th className="p-3 text-right">Basic Salary</th>
                  <th className="p-3 text-right">Dearness Allow.</th>
                  <th className="p-3 text-right">Other Allow.</th>
                  <th className="p-3 text-right">Gross Salary</th>
                  <th className="p-3 text-right">Emp SSF</th>
                  <th className="p-3 text-right">Empr SSF</th>
                  <th className="p-3 text-right">Monthly CTC</th>
                  <th className="p-3 text-right">Annual CTC</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {filteredStructureRows.map(row => (
                  <tr key={row.employeeId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-400">{row.employeeId}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.employeeName}</td>
                    <td className="p-3">{row.department}</td>
                    <td className="p-3">{row.designation}</td>
                    <td className="p-3">{row.grade}</td>
                    <td className="p-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {formatUniversalDate(row.joiningDate, 'yyyy-MM-dd')}
                      </div>
                      {row.joiningDateBS ? (
                        <div className="text-[10px] text-slate-400 font-sans tracking-tight">
                          BS {row.joiningDateBS}
                        </div>
                      ) : (getNepaliDate(row.joiningDate) !== '0000-00-00' ? (
                        <div className="text-[10px] text-slate-400 font-sans tracking-tight">
                          BS {getNepaliDate(row.joiningDate)}
                        </div>
                      ) : null)}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 whitespace-nowrap">
                        {row.experience || `${row.experienceYears || 0} yrs`}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">Rs. {row.basicSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.dearnessAllowance.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.otherAllowance.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.grossSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.employeeSSF.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">Rs. {row.employerSSF.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      <button
                        type="button"
                        onClick={() => onOpenDrillDown({
                          title: `CTC Components - ${row.employeeName} (${row.employeeId})`,
                          type: 'ctc',
                          filterKey: row.employeeId,
                          employees: employees.filter(e => e.id === row.employeeId),
                          totalGross: row.grossSalary,
                          totalCTC: row.monthlyCTC
                        })}
                        className="hover:underline"
                      >
                        Rs. {row.monthlyCTC.toLocaleString()}
                      </button>
                    </td>
                    <td className="p-3 text-right font-mono text-purple-600 dark:text-purple-400 font-bold">Rs. {row.annualCTC.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        row.employmentStatus === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {row.employmentStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 2: By Department */}
      {subTab === 'department' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Department Salary Analysis</h3>
            <span className="text-xs text-slate-500">{deptSummary.length} Departments Analyzed</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-center">Emp Count</th>
                  <th className="p-3 text-right">Total Basic</th>
                  <th className="p-3 text-right">Avg Basic</th>
                  <th className="p-3 text-right">Median Basic</th>
                  <th className="p-3 text-right">Min Basic</th>
                  <th className="p-3 text-right">Max Basic</th>
                  <th className="p-3 text-right">Total Gross</th>
                  <th className="p-3 text-right">Avg Gross</th>
                  <th className="p-3 text-right">Median Gross</th>
                  <th className="p-3 text-right">Min Gross</th>
                  <th className="p-3 text-right">Max Gross</th>
                  <th className="p-3 text-right">Total Empr SSF</th>
                  <th className="p-3 text-right">Total Monthly CTC</th>
                  <th className="p-3 text-right">Avg Monthly CTC</th>
                  <th className="p-3 text-right">Annual CTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {deptSummary.map(row => (
                  <tr key={row.department} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      <button
                        type="button"
                        onClick={() => onOpenDrillDown({
                          title: `Department Drill-Down: ${row.department}`,
                          type: 'department',
                          filterKey: row.department,
                          employees: filteredEmployees.filter(e => e.department === row.department),
                          totalGross: row.totalGross,
                          totalCTC: row.totalMonthlyCTC
                        })}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        {row.department}
                        <ChevronRight size={12} />
                      </button>
                    </td>
                    <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.totalBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.medianBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.minBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.maxBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.totalGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.medianGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.minGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.maxGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-amber-600 font-bold">Rs. {row.totalEmployerSSF.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.totalMonthlyCTC.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgMonthlyCTC.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-purple-600 font-bold">Rs. {row.annualCTC.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 3: By Designation */}
      {subTab === 'designation' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Designation Salary Analysis</h3>
            <span className="text-xs text-slate-500">{desgSummary.length} Designations Analyzed</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Designation</th>
                  <th className="p-3 text-center">Emp Count</th>
                  <th className="p-3 text-right">Avg Basic</th>
                  <th className="p-3 text-right">Median Basic</th>
                  <th className="p-3 text-right">Min Basic</th>
                  <th className="p-3 text-right">Max Basic</th>
                  <th className="p-3 text-right">Avg Gross</th>
                  <th className="p-3 text-right">Median Gross</th>
                  <th className="p-3 text-right">Min Gross</th>
                  <th className="p-3 text-right">Max Gross</th>
                  <th className="p-3 text-right">Total Gross Cost</th>
                  <th className="p-3 text-right">Avg CTC</th>
                  <th className="p-3 text-right">Total CTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {desgSummary.map(row => (
                  <tr key={row.designation} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      <button
                        type="button"
                        onClick={() => onOpenDrillDown({
                          title: `Designation Drill-Down: ${row.designation}`,
                          type: 'designation',
                          filterKey: row.designation,
                          employees: filteredEmployees.filter(e => e.designation === row.designation),
                          totalGross: row.totalGrossCost,
                          totalCTC: row.totalCTC
                        })}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        {row.designation}
                        <ChevronRight size={12} />
                      </button>
                    </td>
                    <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.medianBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.minBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.maxBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.avgGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.medianGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.minGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.maxGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">Rs. {row.totalGrossCost.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgCTC.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.totalCTC.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 4: By Section */}
      {subTab === 'section' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Section Salary Analysis</h3>
            <span className="text-xs text-slate-500">{sectionSummary.length} Sections Analyzed</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Section</th>
                  <th className="p-3 text-center">Emp Count</th>
                  <th className="p-3 text-right">Avg Basic</th>
                  <th className="p-3 text-right">Avg Gross</th>
                  <th className="p-3 text-right">Median Gross</th>
                  <th className="p-3 text-right">Total Gross</th>
                  <th className="p-3 text-right">Employer SSF</th>
                  <th className="p-3 text-right">Avg CTC</th>
                  <th className="p-3 text-right">Total CTC</th>
                  <th className="p-3 text-right">Annual CTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {sectionSummary.map(row => (
                  <tr key={row.section} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.section}</td>
                    <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.avgGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.medianGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold">Rs. {row.totalGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-amber-600">Rs. {row.employerSSF.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgCTC.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.totalCTC.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-purple-600 font-bold">Rs. {row.annualCTC.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 5: Salary Distribution & Bands */}
      {subTab === 'distribution' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Configurable Salary Distribution Bands</h3>
                <p className="text-xs text-slate-500">Configure salary thresholds dynamically for organizational workforce distribution</p>
              </div>

              <button
                type="button"
                onClick={onOpenBandModal}
                className="px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-xl transition-all flex items-center gap-1.5"
              >
                <Settings2 size={14} />
                Configure Salary Bands
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Salary Band</th>
                    <th className="p-3 text-center">Employee Count</th>
                    <th className="p-3 text-center">% of Workforce</th>
                    <th className="p-3 text-right">Total Salary Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {distributionRows.map(row => (
                    <tr key={row.bandId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{row.bandLabel}</td>
                      <td className="p-3 text-center font-bold">
                        <button
                          type="button"
                          onClick={() => onOpenDrillDown({
                            title: `Salary Band Drill-Down: ${row.bandLabel}`,
                            type: 'band',
                            filterKey: row.bandLabel,
                            employees: filteredEmployees.filter(e => {
                              const g = Number(e.grossSalary || (Number(e.basicSalary || 0) + Number(e.dearnessAllowance || 0) + Number(e.otherAllowance || 0)));
                              return g >= row.min && g <= row.max;
                            }),
                            totalGross: row.totalSalaryCost,
                            totalCTC: row.totalSalaryCost * 1.2
                          })}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {row.employeeCount}
                        </button>
                      </td>
                      <td className="p-3 text-center font-bold">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                          {row.pctEmployees}%
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.totalSalaryCost.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Salary Distribution Visual Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Salary Distribution Chart</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distributionRows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="bandLabel" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: any, name: any) => [name === 'employeeCount' ? `${value} Employees` : `Rs. ${Number(value).toLocaleString()}`, name === 'employeeCount' ? 'Emp Count' : 'Total Cost']} />
                  <Bar dataKey="employeeCount" name="Employee Count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 6: Average vs Median Analysis */}
      {subTab === 'avgVsMedian' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Average vs Median Salary Analysis</h3>
                <p className="text-xs text-slate-500">Detect skews and outliers where average diverges significantly from median</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAvgVsMedianType('Department')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    avgVsMedianType === 'Department' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                  }`}
                >
                  By Department
                </button>
                <button
                  type="button"
                  onClick={() => setAvgVsMedianType('Designation')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                    avgVsMedianType === 'Designation' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                  }`}
                >
                  By Designation
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">{avgVsMedianType}</th>
                    <th className="p-3 text-center">Emp Count</th>
                    <th className="p-3 text-right">Average Salary</th>
                    <th className="p-3 text-right">Median Salary</th>
                    <th className="p-3 text-right">Difference (Avg - Median)</th>
                    <th className="p-3 text-right">Difference %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {avgVsMedianRows.map(row => (
                    <tr key={row.groupName} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{row.groupName}</td>
                      <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                      <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.avgSalary.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.medianSalary.toLocaleString()}</td>
                      <td className={`p-3 text-right font-mono font-bold ${row.difference >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {row.difference >= 0 ? '+' : ''}Rs. {row.difference.toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          Math.abs(row.differencePct) > 15 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {row.differencePct > 0 ? '+' : ''}{row.differencePct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Average vs Median Visual Comparison</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={avgVsMedianRows.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="groupName" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: any) => [`Rs. ${Number(value).toLocaleString()}`, 'Amount']} />
                  <Legend />
                  <Bar dataKey="avgSalary" name="Average Salary" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="medianSalary" name="Median Salary" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* SubTab 7: Salary Range Analysis (Percentiles) */}
      {subTab === 'range' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Designation Salary Range & Percentiles</h3>
            <p className="text-xs text-slate-500">Includes Minimum, Q1 (25th), Median (50th), Q3 (75th), and Maximum salary spread</p>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Designation</th>
                  <th className="p-3 text-center">Emp Count</th>
                  <th className="p-3 text-right">Min Salary</th>
                  <th className="p-3 text-right">Q1 (25th)</th>
                  <th className="p-3 text-right">Median (50th)</th>
                  <th className="p-3 text-right">Q3 (75th)</th>
                  <th className="p-3 text-right">Max Salary</th>
                  <th className="p-3 text-right">Spread</th>
                  <th className="p-3 text-center">Status Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {percentileRows.map(row => (
                  <tr key={row.designation} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.designation}</td>
                    <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.minSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.q1.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.median.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.q3.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold">Rs. {row.maxSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.spread.toLocaleString()}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        row.flagStatus === 'Review Required' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {row.flagStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 8: Salary Equity Analysis */}
      {subTab === 'equity' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Salary Equity & Peer Group Variance</h3>
            <p className="text-xs text-slate-500">Compares individual gross salary against peer group average (Designation + Department + Grade)</p>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Emp ID</th>
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-right">Tenure</th>
                  <th className="p-3 text-right">Basic Salary</th>
                  <th className="p-3 text-right">Gross Salary</th>
                  <th className="p-3 text-right">Peer Group Avg</th>
                  <th className="p-3 text-right">Variance</th>
                  <th className="p-3 text-right">Variance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {equityRows.map(row => (
                  <tr key={row.employeeId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-400">{row.employeeId}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.employeeName}</td>
                    <td className="p-3">{row.designation}</td>
                    <td className="p-3">{row.department}</td>
                    <td className="p-3 text-right">{row.experience}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.basicSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.grossSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.groupAverage.toLocaleString()}</td>
                    <td className={`p-3 text-right font-mono font-bold ${row.varianceAmount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {row.varianceAmount >= 0 ? '+' : ''}Rs. {row.varianceAmount.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        row.variancePct < -15 ? 'bg-rose-100 text-rose-700' :
                        row.variancePct > 15 ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {row.variancePct > 0 ? '+' : ''}{row.variancePct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 9: Compa-Ratio Analysis */}
      {subTab === 'comparatio' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Compa-Ratio Analytical Review</h3>
            <p className="text-xs text-slate-500">Formula: (Employee Salary / Designation Benchmark Median) * 100</p>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Emp ID</th>
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-right">Current Salary</th>
                  <th className="p-3 text-right">Benchmark</th>
                  <th className="p-3 text-right">Compa-Ratio</th>
                  <th className="p-3 text-center">Status Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {compaRows.map(row => (
                  <tr key={row.employeeId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-400">{row.employeeId}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.employeeName}</td>
                    <td className="p-3">{row.designation}</td>
                    <td className="p-3">{row.department}</td>
                    <td className="p-3 text-right font-mono font-bold">Rs. {row.currentSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.benchmark.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">{row.compaRatio}%</td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        row.status === 'Below Range' ? 'bg-rose-100 text-rose-700' :
                        row.status === 'Low Range' ? 'bg-amber-100 text-amber-700' :
                        row.status === 'Mid Range' ? 'bg-emerald-100 text-emerald-700' :
                        row.status === 'High Range' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {row.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 10: Compression Risks */}
      {subTab === 'compression' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Potential Salary Compression Analysis</h3>
              <p className="text-xs text-slate-500">Identifies cases where junior employee gross salary equals or exceeds senior peers with &gt;1.5 years tenure</p>
            </div>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg">
              {compressionRisks.length} Risk Pair(s)
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Senior Employee (Higher Tenure)</th>
                  <th className="p-3 text-right">Senior Gross</th>
                  <th className="p-3">Junior Employee (Lower Tenure)</th>
                  <th className="p-3 text-right">Junior Gross</th>
                  <th className="p-3 text-right">Inversion Gap</th>
                  <th className="p-3 text-center">HR Review Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {compressionRisks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      No salary compression risks detected across current employee records.
                    </td>
                  </tr>
                ) : (
                  compressionRisks.map((risk, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{risk.designation}</td>
                      <td className="p-3">
                        <span className="font-bold">{risk.seniorEmployeeName}</span> ({risk.seniorEmployeeId})
                        <div className="text-[10px] text-slate-400">DOJ: {formatUniversalDate(risk.seniorDOJ, 'yyyy-MM-dd')} ({risk.seniorExpYears} yrs)</div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">Rs. {risk.seniorGross.toLocaleString()}</td>
                      <td className="p-3">
                        <span className="font-bold">{risk.juniorEmployeeName}</span> ({risk.juniorEmployeeId})
                        <div className="text-[10px] text-slate-400">DOJ: {formatUniversalDate(risk.juniorDOJ, 'yyyy-MM-dd')} ({risk.juniorExpYears} yrs)</div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">Rs. {risk.juniorGross.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600">+Rs. {risk.salaryDiff.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Potential Salary Compression
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 11: Experience vs Salary */}
      {subTab === 'experience' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Experience / Tenure vs Salary Progress</h3>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Experience Band</th>
                    <th className="p-3 text-center">Emp Count</th>
                    <th className="p-3 text-right">Avg Basic</th>
                    <th className="p-3 text-right">Avg Gross</th>
                    <th className="p-3 text-right">Median Gross</th>
                    <th className="p-3 text-right">Avg CTC</th>
                    <th className="p-3 text-right">Total CTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {experienceRows.map(row => (
                    <tr key={row.bandLabel} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{row.bandLabel}</td>
                      <td className="p-3 text-center font-bold">{row.employeeCount}</td>
                      <td className="p-3 text-right font-mono">Rs. {row.avgBasic.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.avgGross.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">Rs. {row.medianGross.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono">Rs. {row.avgCTC.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {row.totalCTC.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Experience vs Average Salary Progression</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={experienceRows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="bandLabel" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: any, name: any) => [name === 'employeeCount' ? `${value} Emps` : `Rs. ${Number(value).toLocaleString()}`, name]} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="avgGross" name="Avg Gross Salary" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="avgBasic" name="Avg Basic Salary" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="employeeCount" name="Employee Count" stroke="#F59E0B" strokeWidth={3} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
