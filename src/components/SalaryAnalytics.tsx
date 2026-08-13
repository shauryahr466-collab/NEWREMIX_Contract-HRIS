import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { Employee } from '../types';
import { Card, Button, Input, Badge } from './ui';
import { 
  DollarSign, TrendingUp, TrendingDown, Users, AlertTriangle, ShieldAlert,
  Download, Filter, RefreshCw, BarChart2, PieChart as PieChartIcon, HelpCircle,
  Briefcase, Award, ArrowUpDown, ChevronRight, CheckCircle2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, ComposedChart
} from 'recharts';
import * as XLSX from 'xlsx';
import { format, differenceInYears, differenceInMonths, parseISO } from 'date-fns';

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

export function SalaryAnalytics() {
  const { employees, settings } = useAppStore();

  // Filters
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedSection, setSelectedSection] = useState<string>('All');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('All');
  const [selectedGrade, setSelectedGrade] = useState<string>('All');
  const [selectedEmpType, setSelectedEmpType] = useState<string>('All');
  const [selectedGender, setSelectedGender] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('Active');
  const [selectedExpBand, setSelectedExpBand] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'kpi' | 'designation' | 'department' | 'equity' | 'comparatio' | 'compression' | 'experience' | 'quality'>('kpi');

  // Extract filter options
  const departments = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.department).filter(Boolean)))], [employees]);
  const sections = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.section).filter(Boolean)))], [employees]);
  const designations = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.designation).filter(Boolean)))], [employees]);
  const grades = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.grade).filter(Boolean)))], [employees]);

  // Helper experience calculator
  const getExperienceYears = (doj?: string) => {
    if (!doj) return 0;
    try {
      const d = new Date(doj);
      if (isNaN(d.getTime())) return 0;
      return Number((differenceInMonths(new Date(), d) / 12).toFixed(1));
    } catch (e) {
      return 0;
    }
  };

  const getExpBand = (exp: number) => {
    if (exp < 1) return '0-1 Year';
    if (exp < 3) return '1-3 Years';
    if (exp < 5) return '3-5 Years';
    if (exp < 10) return '5-10 Years';
    return '10+ Years';
  };

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (statusFilter === 'Active' && emp.status !== 'Active') return false;
      if (statusFilter === 'Inactive' && emp.status !== 'Inactive') return false;

      if (selectedDept !== 'All' && emp.department !== selectedDept) return false;
      if (selectedSection !== 'All' && emp.section !== selectedSection) return false;
      if (selectedDesignation !== 'All' && emp.designation !== selectedDesignation) return false;
      if (selectedGrade !== 'All' && emp.grade !== selectedGrade) return false;
      if (selectedEmpType !== 'All' && emp.employmentType !== selectedEmpType) return false;
      if (selectedGender !== 'All' && emp.gender !== selectedGender) return false;

      const exp = getExperienceYears(emp.joiningDate);
      if (selectedExpBand !== 'All' && getExpBand(exp) !== selectedExpBand) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = emp.name?.toLowerCase().includes(term);
        const matchId = emp.id?.toLowerCase().includes(term);
        const matchDesg = emp.designation?.toLowerCase().includes(term);
        if (!matchName && !matchId && !matchDesg) return false;
      }

      return true;
    });
  }, [employees, statusFilter, selectedDept, selectedSection, selectedDesignation, selectedGrade, selectedEmpType, selectedGender, selectedExpBand, searchTerm]);

  // Summary Metrics
  const summaryKPIs = useMemo(() => {
    const active = filteredEmployees;
    const count = active.length;
    if (count === 0) {
      return {
        totalEmps: 0,
        monthlyGross: 0,
        avgGross: 0,
        medianGross: 0,
        minGross: 0,
        maxGross: 0,
        annualGross: 0,
        avgBasic: 0,
        avgEmployerSSF: 0,
        monthlyCTC: 0,
        annualCTC: 0,
        costPerEmp: 0
      };
    }

    const grossList = active.map(e => Number(e.grossSalary || e.basicSalary || 0)).sort((a, b) => a - b);
    const basicList = active.map(e => Number(e.basicSalary || 0));
    const ssfList = active.map(e => Number(e.employerSSF || 0));
    const ctcList = active.map(e => Number(e.monthlyCTC || (Number(e.grossSalary || 0) + Number(e.employerSSF || 0))));

    const totalGross = grossList.reduce((acc, v) => acc + v, 0);
    const totalBasic = basicList.reduce((acc, v) => acc + v, 0);
    const totalSSF = ssfList.reduce((acc, v) => acc + v, 0);
    const totalCTC = ctcList.reduce((acc, v) => acc + v, 0);

    const avgGross = Math.round(totalGross / count);
    const avgBasic = Math.round(totalBasic / count);
    const avgSSF = Math.round(totalSSF / count);

    const minGross = grossList[0];
    const maxGross = grossList[count - 1];

    let medianGross = 0;
    const mid = Math.floor(count / 2);
    if (count % 2 === 0) {
      medianGross = Math.round((grossList[mid - 1] + grossList[mid]) / 2);
    } else {
      medianGross = grossList[mid];
    }

    return {
      totalEmps: count,
      monthlyGross: totalGross,
      avgGross,
      medianGross,
      minGross,
      maxGross,
      annualGross: totalGross * 12,
      avgBasic,
      avgEmployerSSF: avgSSF,
      monthlyCTC: totalCTC,
      annualCTC: totalCTC * 12,
      costPerEmp: Math.round(totalCTC / count)
    };
  }, [filteredEmployees]);

  // Designation Benchmark
  const designationBenchmark = useMemo(() => {
    const map = new Map<string, Employee[]>();
    filteredEmployees.forEach(e => {
      const desg = e.designation || 'Unassigned';
      const list = map.get(desg) || [];
      list.push(e);
      map.set(desg, list);
    });

    return Array.from(map.entries()).map(([desg, emps]) => {
      const count = emps.length;
      const grossList = emps.map(e => Number(e.grossSalary || e.basicSalary || 0)).sort((a, b) => a - b);
      const basicList = emps.map(e => Number(e.basicSalary || 0));
      
      const totalGross = grossList.reduce((a, b) => a + b, 0);
      const totalBasic = basicList.reduce((a, b) => a + b, 0);

      const min = grossList[0];
      const max = grossList[count - 1];
      const avgGross = Math.round(totalGross / count);
      const avgBasic = Math.round(totalBasic / count);

      let median = 0;
      const mid = Math.floor(count / 2);
      if (count % 2 === 0) median = Math.round((grossList[mid - 1] + grossList[mid]) / 2);
      else median = grossList[mid];

      return {
        designation: desg,
        count,
        min,
        max,
        avgGross,
        median,
        spread: max - min,
        avgBasic,
        monthlyPayrollCost: totalGross
      };
    }).sort((a, b) => b.monthlyPayrollCost - a.monthlyPayrollCost);
  }, [filteredEmployees]);

  // Department Benchmark
  const departmentBenchmark = useMemo(() => {
    const map = new Map<string, Employee[]>();
    filteredEmployees.forEach(e => {
      const dept = e.department || 'Unassigned';
      const list = map.get(dept) || [];
      list.push(e);
      map.set(dept, list);
    });

    return Array.from(map.entries()).map(([dept, emps]) => {
      const count = emps.length;
      const grossList = emps.map(e => Number(e.grossSalary || e.basicSalary || 0)).sort((a, b) => a - b);
      const basicList = emps.map(e => Number(e.basicSalary || 0));

      const totalGross = grossList.reduce((a, b) => a + b, 0);
      const totalBasic = basicList.reduce((a, b) => a + b, 0);

      const min = grossList[0];
      const max = grossList[count - 1];
      const avgGross = Math.round(totalGross / count);
      const avgBasic = Math.round(totalBasic / count);

      let median = 0;
      const mid = Math.floor(count / 2);
      if (count % 2 === 0) median = Math.round((grossList[mid - 1] + grossList[mid]) / 2);
      else median = grossList[mid];

      return {
        department: dept,
        count,
        min,
        max,
        avgGross,
        median,
        avgBasic,
        monthlyPayrollCost: totalGross
      };
    }).sort((a, b) => b.monthlyPayrollCost - a.monthlyPayrollCost);
  }, [filteredEmployees]);

  // Salary Equity Analysis
  const salaryEquityData = useMemo(() => {
    // Group by designation + grade
    const groupAvgMap = new Map<string, { totalGross: number; count: number }>();
    filteredEmployees.forEach(e => {
      const key = `${e.designation || 'General'}_${e.grade || 'Default'}`;
      const curr = groupAvgMap.get(key) || { totalGross: 0, count: 0 };
      curr.totalGross += Number(e.grossSalary || e.basicSalary || 0);
      curr.count += 1;
      groupAvgMap.set(key, curr);
    });

    return filteredEmployees.map(emp => {
      const key = `${emp.designation || 'General'}_${emp.grade || 'Default'}`;
      const groupInfo = groupAvgMap.get(key)!;
      const groupAvg = groupInfo.count > 0 ? Math.round(groupInfo.totalGross / groupInfo.count) : 0;
      const empGross = Number(emp.grossSalary || emp.basicSalary || 0);
      const variance = empGross - groupAvg;
      const variancePct = groupAvg > 0 ? Number(((variance / groupAvg) * 100).toFixed(1)) : 0;
      const exp = getExperienceYears(emp.joiningDate);

      return {
        id: emp.id,
        name: emp.name,
        designation: emp.designation || 'General',
        department: emp.department || 'General',
        grade: emp.grade || 'N/A',
        experience: `${exp} yrs`,
        basicSalary: Number(emp.basicSalary || 0),
        grossSalary: empGross,
        groupAvg,
        variance,
        variancePct
      };
    }).sort((a, b) => a.variancePct - b.variancePct);
  }, [filteredEmployees]);

  // Compa-Ratio Analysis
  const compaRatioData = useMemo(() => {
    // Benchmark per designation
    const desgBenchMap = new Map<string, number>();
    designationBenchmark.forEach(d => desgBenchMap.set(d.designation, d.median || d.avgGross));

    return filteredEmployees.map(emp => {
      const benchmark = desgBenchMap.get(emp.designation || 'Unassigned') || 1;
      const empGross = Number(emp.grossSalary || emp.basicSalary || 0);
      const compaRatio = Number(((empGross / benchmark) * 100).toFixed(1));

      let statusCategory = 'Normal Range';
      let statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      if (compaRatio < 80) {
        statusCategory = 'Significant Review (<80%)';
        statusColor = 'bg-red-50 text-red-700 border-red-200';
      } else if (compaRatio < 90) {
        statusCategory = 'Below Range (80-90%)';
        statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
      } else if (compaRatio <= 110) {
        statusCategory = 'Normal Range (90-110%)';
        statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      } else if (compaRatio <= 120) {
        statusCategory = 'Above Range (110-120%)';
        statusColor = 'bg-blue-50 text-blue-700 border-blue-200';
      } else {
        statusCategory = 'High Review (>120%)';
        statusColor = 'bg-purple-50 text-purple-700 border-purple-200';
      }

      return {
        id: emp.id,
        name: emp.name,
        designation: emp.designation || 'General',
        department: emp.department || 'General',
        grossSalary: empGross,
        benchmark,
        compaRatio,
        statusCategory,
        statusColor
      };
    }).sort((a, b) => a.compaRatio - b.compaRatio);
  }, [filteredEmployees, designationBenchmark]);

  // Salary Compression Analysis
  const compressionFlags = useMemo(() => {
    const flags: any[] = [];
    // Group by designation
    const desgMap = new Map<string, Employee[]>();
    filteredEmployees.forEach(e => {
      const d = e.designation || 'General';
      const list = desgMap.get(d) || [];
      list.push(e);
      desgMap.set(d, list);
    });

    desgMap.forEach((emps, desg) => {
      if (emps.length < 2) return;
      // Sort by experience descending
      const sorted = [...emps].sort((a, b) => getExperienceYears(b.joiningDate) - getExperienceYears(a.joiningDate));
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const senior = sorted[i];
        const seniorExp = getExperienceYears(senior.joiningDate);
        const seniorGross = Number(senior.grossSalary || senior.basicSalary || 0);

        for (let j = i + 1; j < sorted.length; j++) {
          const junior = sorted[j];
          const juniorExp = getExperienceYears(junior.joiningDate);
          const juniorGross = Number(junior.grossSalary || junior.basicSalary || 0);

          // If senior has >=2 years more experience than junior, but junior gross >= senior gross
          if ((seniorExp - juniorExp >= 2) && (juniorGross >= seniorGross)) {
            flags.push({
              designation: desg,
              seniorId: senior.id,
              seniorName: senior.name,
              seniorExp: `${seniorExp} yrs`,
              seniorGross,
              juniorId: junior.id,
              juniorName: junior.name,
              juniorExp: `${juniorExp} yrs`,
              juniorGross,
              diff: juniorGross - seniorGross,
              diffPct: seniorGross > 0 ? Number((((juniorGross - seniorGross) / seniorGross) * 100).toFixed(1)) : 0
            });
          }
        }
      }
    });

    return flags;
  }, [filteredEmployees]);

  // Experience Band Analysis
  const experienceBandAnalysis = useMemo(() => {
    const bands = ['0-1 Year', '1-3 Years', '3-5 Years', '5-10 Years', '10+ Years'];
    return bands.map(band => {
      const emps = filteredEmployees.filter(e => getExpBand(getExperienceYears(e.joiningDate)) === band);
      const count = emps.length;
      if (count === 0) return { band, count: 0, avgBasic: 0, avgGross: 0, medianGross: 0, minGross: 0, maxGross: 0 };

      const grossList = emps.map(e => Number(e.grossSalary || e.basicSalary || 0)).sort((a, b) => a - b);
      const basicList = emps.map(e => Number(e.basicSalary || 0));

      const avgGross = Math.round(grossList.reduce((a, b) => a + b, 0) / count);
      const avgBasic = Math.round(basicList.reduce((a, b) => a + b, 0) / count);
      const minGross = grossList[0];
      const maxGross = grossList[count - 1];

      let medianGross = 0;
      const mid = Math.floor(count / 2);
      if (count % 2 === 0) medianGross = Math.round((grossList[mid - 1] + grossList[mid]) / 2);
      else medianGross = grossList[mid];

      return {
        band,
        count,
        avgBasic,
        avgGross,
        medianGross,
        minGross,
        maxGross
      };
    });
  }, [filteredEmployees]);

  // Data Quality Audit
  const dataQualityIssues = useMemo(() => {
    const issues: any[] = [];
    filteredEmployees.forEach(emp => {
      const basic = Number(emp.basicSalary || 0);
      const da = Number(emp.dearnessAllowance || 0);
      const other = Number(emp.otherAllowance || emp.allowances || 0);
      const recordedGross = Number(emp.grossSalary || 0);
      const expectedGross = basic + da + other;

      if (!emp.basicSalary || emp.basicSalary <= 0) {
        issues.push({ id: emp.id, name: emp.name, type: 'Missing Basic Salary', severity: 'high', detail: 'Basic salary is 0 or unrecorded.' });
      }

      if (!emp.grossSalary || emp.grossSalary <= 0) {
        issues.push({ id: emp.id, name: emp.name, type: 'Missing Gross Salary', severity: 'high', detail: 'Gross salary is 0 or unrecorded.' });
      }

      if (!emp.joiningDate) {
        issues.push({ id: emp.id, name: emp.name, type: 'Missing Date of Joining', severity: 'medium', detail: 'DOJ is missing. Cannot calculate tenure.' });
      }

      if (!emp.department) {
        issues.push({ id: emp.id, name: emp.name, type: 'Missing Department', severity: 'low', detail: 'Department is unassigned.' });
      }

      if (!emp.designation) {
        issues.push({ id: emp.id, name: emp.name, type: 'Missing Designation', severity: 'low', detail: 'Designation is unassigned.' });
      }

      if (recordedGross > 0 && expectedGross > 0 && Math.abs(recordedGross - expectedGross) > 10) {
        issues.push({ 
          id: emp.id, 
          name: emp.name, 
          type: 'Gross Salary Mismatch', 
          severity: 'high', 
          detail: `Sum of Basic (${basic.toLocaleString()}) + DA (${da.toLocaleString()}) + Other (${other.toLocaleString()}) = ${expectedGross.toLocaleString()}, but recorded Gross is ${recordedGross.toLocaleString()}.` 
        });
      }
    });

    return issues;
  }, [filteredEmployees]);

  // Export functions
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['SALARY BENCHMARK & EQUITY ANALYSIS SUMMARY'],
      ['Total Active Employees', summaryKPIs.totalEmps],
      ['Total Monthly Gross Salary', summaryKPIs.monthlyGross],
      ['Average Gross Salary', summaryKPIs.avgGross],
      ['Median Gross Salary', summaryKPIs.medianGross],
      ['Minimum Gross Salary', summaryKPIs.minGross],
      ['Maximum Gross Salary', summaryKPIs.maxGross],
      ['Total Annualized Gross', summaryKPIs.annualGross],
      ['Total Monthly CTC', summaryKPIs.monthlyCTC],
      ['Total Annualized CTC', summaryKPIs.annualCTC],
      ['Cost Per Employee', summaryKPIs.costPerEmp]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Designation sheet
    const wsDesg = XLSX.utils.json_to_sheet(designationBenchmark);
    XLSX.utils.book_append_sheet(wb, wsDesg, 'By Designation');

    // Department sheet
    const wsDept = XLSX.utils.json_to_sheet(departmentBenchmark);
    XLSX.utils.book_append_sheet(wb, wsDept, 'By Department');

    // Equity sheet
    const wsEquity = XLSX.utils.json_to_sheet(salaryEquityData);
    XLSX.utils.book_append_sheet(wb, wsEquity, 'Salary Equity');

    // Compa Ratio sheet
    const wsCompa = XLSX.utils.json_to_sheet(compaRatioData);
    XLSX.utils.book_append_sheet(wb, wsCompa, 'Compa Ratio');

    XLSX.writeFile(wb, `Salary_Benchmark_Analysis_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card className="p-4 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Salary Analysis Filters</h3>
              <p className="text-xs text-slate-500">Analyze real employee compensation metrics in real time</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              setSelectedDept('All');
              setSelectedSection('All');
              setSelectedDesignation('All');
              setSelectedGrade('All');
              setSelectedEmpType('All');
              setSelectedGender('All');
              setStatusFilter('Active');
              setSelectedExpBand('All');
              setSearchTerm('');
            }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Reset Filters
            </Button>
            <Button size="sm" variant="primary" onClick={handleExportExcel}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Export Excel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Department</label>
            <select 
              value={selectedDept} 
              onChange={e => setSelectedDept(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Section</label>
            <select 
              value={selectedSection} 
              onChange={e => setSelectedSection(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Designation</label>
            <select 
              value={selectedDesignation} 
              onChange={e => setSelectedDesignation(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              {designations.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Grade</label>
            <select 
              value={selectedGrade} 
              onChange={e => setSelectedGrade(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              {grades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Tenure Band</label>
            <select 
              value={selectedExpBand} 
              onChange={e => setSelectedExpBand(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              <option value="All">All Experience</option>
              <option value="0-1 Year">0-1 Year</option>
              <option value="1-3 Years">1-3 Years</option>
              <option value="3-5 Years">3-5 Years</option>
              <option value="5-10 Years">5-10 Years</option>
              <option value="10+ Years">10+ Years</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Primary KPI Header Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Active Employees</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{summaryKPIs.totalEmps}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Matched Filter</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Avg Monthly Gross</p>
          <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">Rs. {summaryKPIs.avgGross.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Median: Rs. {summaryKPIs.medianGross.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Monthly Gross Payroll</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">Rs. {(summaryKPIs.monthlyGross / 100000).toFixed(2)}L</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Annual: Rs. {(summaryKPIs.annualGross / 10000000).toFixed(2)}Cr</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Monthly CTC</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">Rs. {(summaryKPIs.monthlyCTC / 100000).toFixed(2)}L</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Annual: Rs. {(summaryKPIs.annualCTC / 10000000).toFixed(2)}Cr</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Min / Max Range</p>
          <p className="text-base font-bold text-slate-900 dark:text-white mt-1">Rs. {summaryKPIs.minGross.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Max: Rs. {summaryKPIs.maxGross.toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl shadow-sm">
          <p className="text-xs text-slate-500 font-medium">Cost / Employee</p>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">Rs. {summaryKPIs.costPerEmp.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Monthly CTC / Head count</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('kpi')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'kpi' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Overview Charts
        </button>

        <button
          onClick={() => setActiveTab('designation')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'designation' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          By Designation ({designationBenchmark.length})
        </button>

        <button
          onClick={() => setActiveTab('department')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'department' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          By Department ({departmentBenchmark.length})
        </button>

        <button
          onClick={() => setActiveTab('equity')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'equity' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Salary Equity Analysis
        </button>

        <button
          onClick={() => setActiveTab('comparatio')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'comparatio' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Compa-Ratio
        </button>

        <button
          onClick={() => setActiveTab('compression')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'compression' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Compression Risks
          {compressionFlags.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {compressionFlags.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('experience')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
            activeTab === 'experience' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Tenure & Progression
        </button>

        <button
          onClick={() => setActiveTab('quality')}
          className={`px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'quality' 
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Data Quality
          {dataQualityIssues.length > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {dataQualityIssues.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'kpi' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Average Salary by Department</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentBenchmark.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: any) => [`Rs. ${Number(value).toLocaleString()}`, 'Avg Gross']} />
                  <Bar dataKey="avgGross" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Top Designations Payroll Share</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={designationBenchmark.slice(0, 6)}
                    dataKey="monthlyPayrollCost"
                    nameKey="designation"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ designation, percent }) => `${designation} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {designationBenchmark.slice(0, 6).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [`Rs. ${Number(value).toLocaleString()}`, 'Payroll Cost']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 lg:col-span-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Salary Progression by Tenure Band</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={experienceBandAnalysis}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="band" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: any, name: any) => [name === 'count' ? value : `Rs. ${Number(value).toLocaleString()}`, name]} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="avgGross" name="Avg Gross Salary" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="avgBasic" name="Avg Basic Salary" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="count" name="Employee Count" stroke="#F59E0B" strokeWidth={3} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'designation' && (
        <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Designation Benchmark Analysis</h4>
            <span className="text-xs text-slate-500">{designationBenchmark.length} Designations Analyzed</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3">Designation</th>
                  <th className="p-3 text-center">Emp Count</th>
                  <th className="p-3 text-right">Min Gross</th>
                  <th className="p-3 text-right">Avg Gross</th>
                  <th className="p-3 text-right">Median Gross</th>
                  <th className="p-3 text-right">Max Gross</th>
                  <th className="p-3 text-right">Salary Spread</th>
                  <th className="p-3 text-right">Monthly Payroll</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {designationBenchmark.map(row => (
                  <tr key={row.designation} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.designation}</td>
                    <td className="p-3 text-center">{row.count}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.min.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.avgGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.median.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.max.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.spread.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">Rs. {row.monthlyPayrollCost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'department' && (
        <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Department Benchmark Analysis</h4>
            <span className="text-xs text-slate-500">{departmentBenchmark.length} Departments Analyzed</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-center">Emp Count</th>
                  <th className="p-3 text-right">Avg Basic</th>
                  <th className="p-3 text-right">Avg Gross</th>
                  <th className="p-3 text-right">Median Gross</th>
                  <th className="p-3 text-right">Min Gross</th>
                  <th className="p-3 text-right">Max Gross</th>
                  <th className="p-3 text-right">Total Monthly Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {departmentBenchmark.map(row => (
                  <tr key={row.department} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.department}</td>
                    <td className="p-3 text-center">{row.count}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.avgGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.median.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.min.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.max.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">Rs. {row.monthlyPayrollCost.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'equity' && (
        <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Salary Equity & Peer Group Variance</h4>
              <p className="text-xs text-slate-500">Comparing individual salaries against peer group averages (Designation + Grade)</p>
            </div>
            <span className="text-xs text-slate-500">{salaryEquityData.length} Records</span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold sticky top-0 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3">Emp ID</th>
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-right">Tenure</th>
                  <th className="p-3 text-right">Employee Gross</th>
                  <th className="p-3 text-right">Group Avg</th>
                  <th className="p-3 text-right">Variance</th>
                  <th className="p-3 text-right">Variance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {salaryEquityData.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-400">{row.id}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.name}</td>
                    <td className="p-3">{row.designation}</td>
                    <td className="p-3">{row.department}</td>
                    <td className="p-3 text-right">{row.experience}</td>
                    <td className="p-3 text-right font-mono font-bold">Rs. {row.grossSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.groupAvg.toLocaleString()}</td>
                    <td className={`p-3 text-right font-mono font-bold ${row.variance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {row.variance >= 0 ? '+' : ''}Rs. {row.variance.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        row.variancePct < -15 ? 'bg-red-100 text-red-700' :
                        row.variancePct > 15 ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {row.variancePct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'comparatio' && (
        <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Compa-Ratio Review Analysis</h4>
              <p className="text-xs text-slate-500">Compa-Ratio = (Employee Gross / Designation Benchmark Median) * 100</p>
            </div>
            <span className="text-xs text-slate-500">{compaRatioData.length} Employees</span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold sticky top-0 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3">Emp ID</th>
                  <th className="p-3">Employee Name</th>
                  <th className="p-3">Designation</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-right">Employee Gross</th>
                  <th className="p-3 text-right">Benchmark</th>
                  <th className="p-3 text-right">Compa-Ratio</th>
                  <th className="p-3 text-center">Review Indicator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {compaRatioData.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-400">{row.id}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.name}</td>
                    <td className="p-3">{row.designation}</td>
                    <td className="p-3">{row.department}</td>
                    <td className="p-3 text-right font-mono font-bold">Rs. {row.grossSalary.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-500">Rs. {row.benchmark.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">{row.compaRatio}%</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full border font-bold text-[10px] ${row.statusColor}`}>
                        {row.statusCategory}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'compression' && (
        <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Salary Compression Risk Indicators</h4>
              <p className="text-xs text-slate-500">Flags instances where employees with lower tenure earn equal to or more than senior peers in the same designation</p>
            </div>
          </div>

          {compressionFlags.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              No significant salary compression risks detected across current employee directory filters.
            </div>
          ) : (
            <div className="space-y-3">
              {compressionFlags.map((flag, idx) => (
                <div key={idx} className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-bold text-amber-900 dark:text-amber-300">Designation: {flag.designation}</span>
                    <div className="mt-1 flex items-center gap-4 text-slate-700 dark:text-slate-300">
                      <span><strong>Senior:</strong> {flag.seniorName} ({flag.seniorId}) — {flag.seniorExp} (Rs. {flag.seniorGross.toLocaleString()})</span>
                      <span>vs</span>
                      <span><strong>Junior:</strong> {flag.juniorName} ({flag.juniorId}) — {flag.juniorExp} (Rs. {flag.juniorGross.toLocaleString()})</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded font-bold">
                      +Rs. {flag.diff.toLocaleString()} ({flag.diffPct}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'experience' && (
        <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Tenure & Experience Band Breakdown</h4>
            <p className="text-xs text-slate-500">Comparing salary growth across organizational tenure cohorts</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3">Tenure Cohort</th>
                  <th className="p-3 text-center">Emp Count</th>
                  <th className="p-3 text-right">Avg Basic</th>
                  <th className="p-3 text-right">Avg Gross</th>
                  <th className="p-3 text-right">Median Gross</th>
                  <th className="p-3 text-right">Min Gross</th>
                  <th className="p-3 text-right">Max Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {experienceBandAnalysis.map(row => (
                  <tr key={row.band} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{row.band}</td>
                    <td className="p-3 text-center font-bold">{row.count}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.avgBasic.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {row.avgGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.medianGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.minGross.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">Rs. {row.maxGross.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'quality' && (
        <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Salary Data Quality Audit</h4>
              <p className="text-xs text-slate-500">Detects missing salary master attributes and formula inconsistencies</p>
            </div>
            <Badge variant={dataQualityIssues.length === 0 ? 'success' : 'danger'}>
              {dataQualityIssues.length} Issues Detected
            </Badge>
          </div>

          {dataQualityIssues.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              All employee salary records passed consistency checks with zero missing fields or gross mismatches.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {dataQualityIssues.map((issue, idx) => (
                <div key={idx} className="py-2.5 flex items-start justify-between text-xs gap-3">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{issue.name} ({issue.id})</span>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      issue.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {issue.type}
                    </span>
                    <p className="text-slate-500 text-[11px] mt-0.5">{issue.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
