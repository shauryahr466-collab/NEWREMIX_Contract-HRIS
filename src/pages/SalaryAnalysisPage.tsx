import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { 
  SalaryFilterState, 
  SalaryBand, 
  DrillDownData 
} from '../types/salaryAnalysis';
import { 
  DEFAULT_SALARY_BANDS, 
  filterEmployees, 
  getSalaryStructureRows, 
  getDepartmentSalarySummary, 
  getDesignationSalarySummary, 
  getSectionSalarySummary, 
  getSalaryEquityAnalysis, 
  getDataQualityAudit 
} from '../utils/salaryCalculations';
import { GlobalFilterBar } from '../components/salaryAnalysis/GlobalFilterBar';
import { SalaryBandModal } from '../components/salaryAnalysis/SalaryBandModal';
import { DrillDownModal } from '../components/salaryAnalysis/DrillDownModal';
import { DataQualityModal } from '../components/salaryAnalysis/DataQualityModal';
import { SalaryAnalysisTab } from '../components/salaryAnalysis/SalaryAnalysisTab';
import { CostAnalysisTab } from '../components/salaryAnalysis/CostAnalysisTab';
import { Download, Printer, RefreshCw, FileSpreadsheet, Layers } from 'lucide-react';
import { NepaliRupeeIcon } from '../components/ui';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

export function SalaryAnalysisPage() {
  const { employees, payrollRuns } = useAppStore();

  // Dual Main Tabs
  const [mainTab, setMainTab] = useState<'salary' | 'cost'>('salary');

  // Filter State
  const [filters, setFilters] = useState<SalaryFilterState>({
    effectiveDate: new Date().toISOString().split('T')[0],
    fiscalYear: 'FY 2082/83',
    department: 'All',
    section: 'All',
    designation: 'All',
    grade: 'All',
    employmentType: 'All',
    status: 'Active', // Default Active
    location: 'All',
    gender: 'All',
    experienceBand: 'All',
    minSalary: 0,
    maxSalary: Infinity,
    searchTerm: ''
  });

  // Dynamic Salary Bands
  const [salaryBands, setSalaryBands] = useState<SalaryBand[]>(DEFAULT_SALARY_BANDS);

  // Modals
  const [isBandModalOpen, setIsBandModalOpen] = useState(false);
  const [drillDownData, setDrillDownData] = useState<DrillDownData | null>(null);
  const [isDataQualityModalOpen, setIsDataQualityModalOpen] = useState(false);

  // Filtered employees memoized
  const filteredEmployees = useMemo(() => {
    return filterEmployees(employees, filters);
  }, [employees, filters]);

  // Actions
  const handleResetFilters = () => {
    setFilters({
      effectiveDate: new Date().toISOString().split('T')[0],
      fiscalYear: 'FY 2082/83',
      department: 'All',
      section: 'All',
      designation: 'All',
      grade: 'All',
      employmentType: 'All',
      status: 'Active',
      location: 'All',
      gender: 'All',
      experienceBand: 'All',
      minSalary: 0,
      maxSalary: Infinity,
      searchTerm: ''
    });
    toast.success('Analytics filters reset to default active view');
  };

  const handleRefresh = () => {
    toast.success('Workforce salary analytics refreshed successfully');
  };

  // Requirement 29: Export Workbook Excel (.xlsx)
  const handleExportExcel = () => {
    const rows = getSalaryStructureRows(filteredEmployees);
    const depts = getDepartmentSalarySummary(rows);
    const desgs = getDesignationSalarySummary(rows);
    const secs = getSectionSalarySummary(rows);
    const equity = getSalaryEquityAnalysis(rows);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Salary Structure
    const wsStructure = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Employee ID': r.employeeId,
      'Name': r.employeeName,
      'Department': r.department,
      'Section': r.section,
      'Designation': r.designation,
      'Grade': r.grade,
      'DOJ': r.joiningDate,
      'Basic Salary': r.basicSalary,
      'DA': r.dearnessAllowance,
      'Other Allowance': r.otherAllowance,
      'Gross Salary': r.grossSalary,
      'Employee SSF': r.employeeSSF,
      'Employer SSF': r.employerSSF,
      'Monthly CTC': r.monthlyCTC,
      'Annual CTC': r.annualCTC,
      'Status': r.employmentStatus
    })));
    XLSX.utils.book_append_sheet(wb, wsStructure, 'Salary Structure');

    // Sheet 2: Department Summary
    const wsDept = XLSX.utils.json_to_sheet(depts.map(d => ({
      'Department': d.department,
      'Employee Count': d.employeeCount,
      'Total Basic': d.totalBasic,
      'Avg Basic': d.avgBasic,
      'Median Basic': d.medianBasic,
      'Total Gross': d.totalGross,
      'Avg Gross': d.avgGross,
      'Median Gross': d.medianGross,
      'Total Employer SSF': d.totalEmployerSSF,
      'Total Monthly CTC': d.totalMonthlyCTC,
      'Avg Monthly CTC': d.avgMonthlyCTC,
      'Annual CTC': d.annualCTC,
      '% of Total CTC': d.pctOfTotalCTC
    })));
    XLSX.utils.book_append_sheet(wb, wsDept, 'Dept Summary');

    // Sheet 3: Designation Summary
    const wsDesg = XLSX.utils.json_to_sheet(desgs.map(d => ({
      'Designation': d.designation,
      'Employee Count': d.employeeCount,
      'Avg Basic': d.avgBasic,
      'Median Basic': d.medianBasic,
      'Avg Gross': d.avgGross,
      'Median Gross': d.medianGross,
      'Total Gross Cost': d.totalGrossCost,
      'Avg CTC': d.avgCTC,
      'Total CTC': d.totalCTC,
      '% Share': d.pctOfTotalCost
    })));
    XLSX.utils.book_append_sheet(wb, wsDesg, 'Designation Summary');

    // Sheet 4: Section Summary
    const wsSec = XLSX.utils.json_to_sheet(secs.map(s => ({
      'Section': s.section,
      'Employee Count': s.employeeCount,
      'Avg Basic': s.avgBasic,
      'Avg Gross': s.avgGross,
      'Total Gross': s.totalGross,
      'Employer SSF': s.employerSSF,
      'Total CTC': s.totalCTC,
      'Annual CTC': s.annualCTC
    })));
    XLSX.utils.book_append_sheet(wb, wsSec, 'Section Summary');

    // Sheet 5: Salary Equity & Compa Ratio
    const wsEquity = XLSX.utils.json_to_sheet(equity.map(e => ({
      'Employee ID': e.employeeId,
      'Name': e.employeeName,
      'Designation': e.designation,
      'Department': e.department,
      'Tenure': e.experience,
      'Gross Salary': e.grossSalary,
      'Peer Group Avg': e.groupAverage,
      'Variance Amount': e.varianceAmount,
      'Variance %': e.variancePct,
      'Compa Ratio': e.compaRatio
    })));
    XLSX.utils.book_append_sheet(wb, wsEquity, 'Salary Equity');

    XLSX.writeFile(wb, `Salary_Analysis_Workforce_Cost_Analytics_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Comprehensive Excel Analytics Workbook downloaded');
  };

  // Requirement 29: Export CSV
  const handleExportCSV = () => {
    const rows = getSalaryStructureRows(filteredEmployees);
    const csvHeader = `As Of Date: ${filters.effectiveDate}, Fiscal Year: ${filters.fiscalYear}, Department: ${filters.department}, Section: ${filters.section}\n`;
    const headers = 'Employee ID,Employee Name,Department,Section,Designation,Grade,Basic Salary,Gross Salary,Employer SSF,Monthly CTC,Annual CTC,Status\n';
    const csvBody = rows.map(r => 
      `"${r.employeeId}","${r.employeeName}","${r.department}","${r.section}","${r.designation}","${r.grade}",${r.basicSalary},${r.grossSalary},${r.employerSSF},${r.monthlyCTC},${r.annualCTC},"${r.employmentStatus}"`
    ).join('\n');

    const blob = new Blob([csvHeader + headers + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Salary_Analysis_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV Report exported successfully');
  };

  // Requirement 29: Print Report
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12 print:p-0">
      {/* Header Section */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 print:border-none">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-md shadow-indigo-600/20 flex items-center justify-center">
              <NepaliRupeeIcon size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Salary Analysis & Workforce Cost Analytics
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                Salary structure, employee cost, equity, benchmark and workforce cost analysis
              </p>
            </div>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2 print:hidden">
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

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm flex items-center gap-2"
          >
            <Printer size={16} className="text-slate-600 dark:text-slate-400" />
            Print Report
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="print:hidden">
        <GlobalFilterBar
          filters={filters}
          onChange={setFilters}
          onReset={handleResetFilters}
          onRefresh={handleRefresh}
          employees={employees}
        />
      </div>

      {/* Main Dual Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 print:hidden">
        <button
          type="button"
          onClick={() => setMainTab('salary')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            mainTab === 'salary'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <NepaliRupeeIcon size={18} />
          1. Salary Analysis
        </button>

        <button
          type="button"
          onClick={() => setMainTab('cost')}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            mainTab === 'cost'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers size={18} />
          2. Cost Analysis
        </button>
      </div>

      {/* Tab Content Rendering */}
      <div>
        {mainTab === 'salary' ? (
          <SalaryAnalysisTab
            employees={employees}
            filteredEmployees={filteredEmployees}
            filters={filters}
            salaryBands={salaryBands}
            onOpenBandModal={() => setIsBandModalOpen(true)}
            onOpenDrillDown={data => setDrillDownData(data)}
          />
        ) : (
          <CostAnalysisTab
            employees={employees}
            filteredEmployees={filteredEmployees}
            payrollRuns={payrollRuns}
            filters={filters}
            onOpenDrillDown={data => setDrillDownData(data)}
            onOpenDataQualityModal={() => setIsDataQualityModalOpen(true)}
          />
        )}
      </div>

      {/* Modals */}
      <SalaryBandModal
        isOpen={isBandModalOpen}
        onClose={() => setIsBandModalOpen(false)}
        bands={salaryBands}
        onSave={newBands => {
          setSalaryBands(newBands);
          toast.success('Custom salary bands updated');
        }}
      />

      <DrillDownModal
        data={drillDownData}
        onClose={() => setDrillDownData(null)}
      />

      <DataQualityModal
        isOpen={isDataQualityModalOpen}
        onClose={() => setIsDataQualityModalOpen(false)}
        issues={getDataQualityAudit(employees, getSalaryStructureRows(filteredEmployees))}
      />
    </div>
  );
}
