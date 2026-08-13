import { Employee, PayrollRun } from '../types';
import { 
  SalaryFilterState, 
  SalaryBand, 
  SalaryStructureRow, 
  DepartmentSalarySummary, 
  DesignationSalarySummary, 
  SectionSalarySummary, 
  SalaryDistributionRow, 
  AvgVsMedianRow, 
  SalaryPercentileRow, 
  SalaryEquityRow, 
  CompaRatioRow, 
  CompressionRiskRow, 
  ExperienceBandRow, 
  CostTrendRow, 
  IncrementAnalysisRow, 
  DataQualityIssue 
} from '../types/salaryAnalysis';
import { differenceInMonths } from 'date-fns';

// Helper: Calculate Experience in Years from DOJ
export function calculateExperienceYears(joiningDate?: string): number {
  if (!joiningDate) return 0;
  try {
    const d = new Date(joiningDate);
    if (isNaN(d.getTime())) return 0;
    const months = differenceInMonths(new Date(), d);
    return Math.max(0, Number((months / 12).toFixed(1)));
  } catch (e) {
    return 0;
  }
}

// Helper: Get Experience Band Label
export function getExperienceBandLabel(years: number): string {
  if (years < 1) return '0–1 Year';
  if (years < 3) return '1–3 Years';
  if (years < 5) return '3–5 Years';
  if (years < 10) return '5–10 Years';
  return '10+ Years';
}

// Helper: Math Percentile (Q1, Median, Q3)
export function calculatePercentile(sortedArray: number[], percentile: number): number {
  if (sortedArray.length === 0) return 0;
  if (sortedArray.length === 1) return sortedArray[0];
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Math.round(sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight);
}

// Default Salary Bands Configuration
export const DEFAULT_SALARY_BANDS: SalaryBand[] = [
  { id: 'b1', label: 'Below Rs. 20,000', min: 0, max: 20000 },
  { id: 'b2', label: 'Rs. 20,001–30,000', min: 20001, max: 30000 },
  { id: 'b3', label: 'Rs. 30,001–40,000', min: 30001, max: 40000 },
  { id: 'b4', label: 'Rs. 40,001–50,000', min: 40001, max: 50000 },
  { id: 'b5', label: 'Rs. 50,001–75,000', min: 50001, max: 75000 },
  { id: 'b6', label: 'Rs. 75,001–100,000', min: 75001, max: 100000 },
  { id: 'b7', label: 'Above Rs. 100,000', min: 100001, max: Infinity },
];

// Helper: Filter Employees according to SalaryFilterState
export function filterEmployees(employees: Employee[], filters: SalaryFilterState): Employee[] {
  return employees.filter(emp => {
    // Status Filter (Default Active)
    if (filters.status === 'Active' && emp.status !== 'Active') return false;
    if (filters.status === 'Inactive' && emp.status !== 'Inactive') return false;

    // Dropdown Filters
    if (filters.department !== 'All' && emp.department !== filters.department) return false;
    if (filters.section !== 'All' && emp.section !== filters.section) return false;
    if (filters.designation !== 'All' && emp.designation !== filters.designation) return false;
    if (filters.grade !== 'All' && emp.grade !== filters.grade) return false;
    if (filters.employmentType !== 'All' && emp.employmentType !== filters.employmentType) return false;
    if (filters.location !== 'All' && emp.location !== filters.location) return false;
    if (filters.gender !== 'All' && emp.gender !== filters.gender) return false;

    // Experience Band Filter
    const exp = calculateExperienceYears(emp.joiningDate);
    if (filters.experienceBand !== 'All' && getExperienceBandLabel(exp) !== filters.experienceBand) return false;

    // Salary Range Filter
    const gross = Number(emp.grossSalary || (Number(emp.basicSalary || 0) + Number(emp.dearnessAllowance || 0) + Number(emp.otherAllowance || emp.allowances || 0)));
    if (filters.minSalary > 0 && gross < filters.minSalary) return false;
    if (filters.maxSalary < Infinity && filters.maxSalary > 0 && gross > filters.maxSalary) return false;

    // Search Term
    if (filters.searchTerm) {
      const term = filters.searchTerm.trim().toLowerCase();
      const matchName = emp.name?.toLowerCase().includes(term);
      const matchId = emp.id?.toLowerCase().includes(term);
      const matchDesg = emp.designation?.toLowerCase().includes(term);
      const matchDept = emp.department?.toLowerCase().includes(term);
      if (!matchName && !matchId && !matchDesg && !matchDept) return false;
    }

    return true;
  });
}

// 1. Calculate Individual Salary Structure Rows
export function getSalaryStructureRows(employees: Employee[], ssfEmployerRate = 0.20, ssfEmployeeRate = 0.11): SalaryStructureRow[] {
  return employees.map(emp => {
    const basicSalary = Number(emp.basicSalary || 0);
    const dearnessAllowance = Number(emp.dearnessAllowance || 0);
    const otherAllowance = Number(emp.otherAllowance || emp.allowances || 0);
    
    // Formula: Gross = Basic + DA + Other Allowance
    const computedGross = basicSalary + dearnessAllowance + otherAllowance;
    const grossSalary = emp.grossSalary && emp.grossSalary > 0 ? Number(emp.grossSalary) : computedGross;

    // Formula: SSF
    const employeeSSF = emp.employeeSSF && emp.employeeSSF > 0 ? Number(emp.employeeSSF) : Math.round(basicSalary * ssfEmployeeRate);
    const employerSSF = emp.employerSSF && emp.employerSSF > 0 ? Number(emp.employerSSF) : Math.round(basicSalary * ssfEmployerRate);

    // Formula: Monthly CTC & Annual CTC
    const monthlyCTC = emp.monthlyCTC && emp.monthlyCTC > 0 ? Number(emp.monthlyCTC) : (grossSalary + employerSSF);
    const annualCTC = monthlyCTC * 12;

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department || 'Unassigned',
      section: emp.section || 'General',
      designation: emp.designation || 'Staff',
      grade: emp.grade || 'N/A',
      joiningDate: emp.joiningDate || 'Unrecorded',
      basicSalary,
      dearnessAllowance,
      otherAllowance,
      grossSalary,
      employeeSSF,
      employerSSF,
      monthlyCTC,
      annualCTC,
      effectiveDate: emp.joiningDate || new Date().toISOString().split('T')[0],
      employmentStatus: emp.status,
      gender: emp.gender,
      location: emp.location,
      employmentType: emp.employmentType
    };
  });
}

// 2. Aggregate Department Salary Summary
export function getDepartmentSalarySummary(rows: SalaryStructureRow[]): DepartmentSalarySummary[] {
  const map = new Map<string, SalaryStructureRow[]>();
  rows.forEach(r => {
    const dept = r.department || 'Unassigned';
    const list = map.get(dept) || [];
    list.push(r);
    map.set(dept, list);
  });

  const totalCompanyCTC = rows.reduce((acc, r) => acc + r.monthlyCTC, 0);

  return Array.from(map.entries()).map(([department, list]) => {
    const count = list.length;
    const basicList = list.map(r => r.basicSalary).sort((a, b) => a - b);
    const grossList = list.map(r => r.grossSalary).sort((a, b) => a - b);

    const totalBasic = basicList.reduce((a, b) => a + b, 0);
    const totalGross = grossList.reduce((a, b) => a + b, 0);
    const totalEmpSSF = list.reduce((a, b) => a + b.employeeSSF, 0);
    const totalEmprSSF = list.reduce((a, b) => a + b.employerSSF, 0);
    const totalMonthlyCTC = list.reduce((a, b) => a + b.monthlyCTC, 0);

    const avgBasic = Math.round(totalBasic / count);
    const avgGross = Math.round(totalGross / count);
    const avgMonthlyCTC = Math.round(totalMonthlyCTC / count);

    const medianBasic = calculatePercentile(basicList, 50);
    const medianGross = calculatePercentile(grossList, 50);

    const minBasic = basicList[0] || 0;
    const maxBasic = basicList[count - 1] || 0;
    const minGross = grossList[0] || 0;
    const maxGross = grossList[count - 1] || 0;

    const annualCTC = totalMonthlyCTC * 12;
    const pctOfTotalCTC = totalCompanyCTC > 0 ? Number(((totalMonthlyCTC / totalCompanyCTC) * 100).toFixed(1)) : 0;

    return {
      department,
      employeeCount: count,
      totalBasic,
      avgBasic,
      medianBasic,
      minBasic,
      maxBasic,
      totalGross,
      avgGross,
      medianGross,
      minGross,
      maxGross,
      totalEmployeeSSF: totalEmpSSF,
      totalEmployerSSF: totalEmprSSF,
      totalMonthlyCTC,
      avgMonthlyCTC,
      annualCTC,
      pctOfTotalCTC
    };
  }).sort((a, b) => b.totalMonthlyCTC - a.totalMonthlyCTC);
}

// 3. Aggregate Designation Salary Summary
export function getDesignationSalarySummary(rows: SalaryStructureRow[]): DesignationSalarySummary[] {
  const map = new Map<string, SalaryStructureRow[]>();
  rows.forEach(r => {
    const desg = r.designation || 'Unassigned';
    const list = map.get(desg) || [];
    list.push(r);
    map.set(desg, list);
  });

  const totalCompanyGross = rows.reduce((acc, r) => acc + r.grossSalary, 0);

  return Array.from(map.entries()).map(([designation, list]) => {
    const count = list.length;
    const basicList = list.map(r => r.basicSalary).sort((a, b) => a - b);
    const grossList = list.map(r => r.grossSalary).sort((a, b) => a - b);

    const totalBasic = basicList.reduce((a, b) => a + b, 0);
    const totalGross = grossList.reduce((a, b) => a + b, 0);
    const totalCTC = list.reduce((a, b) => a + b.monthlyCTC, 0);

    const avgBasic = Math.round(totalBasic / count);
    const avgGross = Math.round(totalGross / count);
    const avgCTC = Math.round(totalCTC / count);

    const medianBasic = calculatePercentile(basicList, 50);
    const medianGross = calculatePercentile(grossList, 50);

    const minBasic = basicList[0] || 0;
    const maxBasic = basicList[count - 1] || 0;
    const minGross = grossList[0] || 0;
    const maxGross = grossList[count - 1] || 0;

    const pctOfTotalCost = totalCompanyGross > 0 ? Number(((totalGross / totalCompanyGross) * 100).toFixed(1)) : 0;

    return {
      designation,
      employeeCount: count,
      avgBasic,
      medianBasic,
      minBasic,
      maxBasic,
      avgGross,
      medianGross,
      minGross,
      maxGross,
      totalGrossCost: totalGross,
      avgCTC,
      totalCTC,
      pctOfTotalCost
    };
  }).sort((a, b) => b.totalGrossCost - a.totalGrossCost);
}

// 4. Aggregate Section Salary Summary
export function getSectionSalarySummary(rows: SalaryStructureRow[]): SectionSalarySummary[] {
  const map = new Map<string, SalaryStructureRow[]>();
  rows.forEach(r => {
    const sec = r.section || 'General';
    const list = map.get(sec) || [];
    list.push(r);
    map.set(sec, list);
  });

  return Array.from(map.entries()).map(([section, list]) => {
    const count = list.length;
    const basicList = list.map(r => r.basicSalary).sort((a, b) => a - b);
    const grossList = list.map(r => r.grossSalary).sort((a, b) => a - b);

    const totalBasic = basicList.reduce((a, b) => a + b, 0);
    const totalGross = grossList.reduce((a, b) => a + b, 0);
    const totalEmprSSF = list.reduce((a, b) => a + b.employerSSF, 0);
    const totalCTC = list.reduce((a, b) => a + b.monthlyCTC, 0);

    const avgBasic = Math.round(totalBasic / count);
    const avgGross = Math.round(totalGross / count);
    const avgCTC = Math.round(totalCTC / count);
    const medianGross = calculatePercentile(grossList, 50);

    return {
      section,
      employeeCount: count,
      avgBasic,
      avgGross,
      medianGross,
      totalGross,
      employerSSF: totalEmprSSF,
      avgCTC,
      totalCTC,
      annualCTC: totalCTC * 12
    };
  }).sort((a, b) => b.totalGross - a.totalGross);
}

// 5. Calculate Salary Distribution across Bands
export function getSalaryDistribution(rows: SalaryStructureRow[], bands: SalaryBand[]): SalaryDistributionRow[] {
  const totalEmployees = rows.length;

  return bands.map(band => {
    const matches = rows.filter(r => r.grossSalary >= band.min && r.grossSalary <= band.max);
    const count = matches.length;
    const pct = totalEmployees > 0 ? Number(((count / totalEmployees) * 100).toFixed(1)) : 0;
    const totalCost = matches.reduce((acc, r) => acc + r.grossSalary, 0);

    return {
      bandId: band.id,
      bandLabel: band.label,
      employeeCount: count,
      pctEmployees: pct,
      totalSalaryCost: totalCost,
      min: band.min,
      max: band.max
    };
  });
}

// 6. Average vs Median Analysis (by Dept and Designation)
export function getAvgVsMedianAnalysis(rows: SalaryStructureRow[], type: 'Department' | 'Designation'): AvgVsMedianRow[] {
  const map = new Map<string, number[]>();
  rows.forEach(r => {
    const key = type === 'Department' ? r.department : r.designation;
    const list = map.get(key) || [];
    list.push(r.grossSalary);
    map.set(key, list);
  });

  return Array.from(map.entries()).map(([groupName, grossList]) => {
    grossList.sort((a, b) => a - b);
    const count = grossList.length;
    const sum = grossList.reduce((a, b) => a + b, 0);
    const avgSalary = Math.round(sum / count);
    const medianSalary = calculatePercentile(grossList, 50);
    
    // Formula: Diff = Avg - Median
    const difference = avgSalary - medianSalary;
    // Formula: Diff % = ((Avg - Median) / Median) * 100
    const differencePct = medianSalary > 0 ? Number(((difference / medianSalary) * 100).toFixed(1)) : 0;

    return {
      groupName,
      type,
      employeeCount: count,
      avgSalary,
      medianSalary,
      difference,
      differencePct
    };
  }).sort((a, b) => Math.abs(b.differencePct) - Math.abs(a.differencePct));
}

// 7. Salary Percentiles & Range Analysis by Designation
export function getSalaryPercentilesByDesignation(rows: SalaryStructureRow[]): SalaryPercentileRow[] {
  const map = new Map<string, number[]>();
  rows.forEach(r => {
    const key = r.designation;
    const list = map.get(key) || [];
    list.push(r.grossSalary);
    map.set(key, list);
  });

  return Array.from(map.entries()).map(([designation, grossList]) => {
    grossList.sort((a, b) => a - b);
    const count = grossList.length;
    const minSalary = grossList[0];
    const maxSalary = grossList[count - 1];
    const q1 = calculatePercentile(grossList, 25);
    const median = calculatePercentile(grossList, 50);
    const q3 = calculatePercentile(grossList, 75);
    const spread = maxSalary - minSalary;

    // Outlier / Review check
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const outliers = grossList.filter(g => g < lowerBound || g > upperBound);

    return {
      designation,
      employeeCount: count,
      minSalary,
      q1,
      median,
      q3,
      maxSalary,
      spread,
      flagStatus: (outliers.length > 0 || (spread > median * 0.8) ? 'Review Required' : 'Normal Range') as 'Normal Range' | 'Review Required',
      outliersCount: outliers.length
    };
  }).sort((a, b) => b.spread - a.spread);
}

// 8. Salary Equity Analysis (Peer Group = Designation + Department + Grade)
export function getSalaryEquityAnalysis(rows: SalaryStructureRow[]): SalaryEquityRow[] {
  // Group averages
  const groupMap = new Map<string, number[]>();
  rows.forEach(r => {
    const groupKey = `${r.designation}_${r.department}_${r.grade}`;
    const list = groupMap.get(groupKey) || [];
    list.push(r.grossSalary);
    groupMap.set(groupKey, list);
  });

  return rows.map(r => {
    const groupKey = `${r.designation}_${r.department}_${r.grade}`;
    const groupSalaries = groupMap.get(groupKey) || [r.grossSalary];
    const groupAvg = Math.round(groupSalaries.reduce((a, b) => a + b, 0) / groupSalaries.length);

    // Formula: Variance = Employee Gross - Group Average Gross
    const varianceAmount = r.grossSalary - groupAvg;
    // Formula: Variance % = (Employee Gross - Group Average Gross) / Group Average Gross * 100
    const variancePct = groupAvg > 0 ? Number(((varianceAmount / groupAvg) * 100).toFixed(1)) : 0;
    const compaRatio = groupAvg > 0 ? Number(((r.grossSalary / groupAvg) * 100).toFixed(1)) : 100;

    const expYears = calculateExperienceYears(r.joiningDate);

    return {
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      designation: r.designation,
      department: r.department,
      grade: r.grade,
      experience: `${expYears} yrs`,
      experienceYears: expYears,
      basicSalary: r.basicSalary,
      grossSalary: r.grossSalary,
      groupAverage: groupAvg,
      varianceAmount,
      variancePct,
      compaRatio
    };
  }).sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));
}

// 9. Compa-Ratio Analysis
export function getCompaRatioAnalysis(rows: SalaryStructureRow[]): CompaRatioRow[] {
  // Benchmark per designation = Median Gross
  const desgMedianMap = new Map<string, number>();
  const desgGroups = new Map<string, number[]>();
  rows.forEach(r => {
    const list = desgGroups.get(r.designation) || [];
    list.push(r.grossSalary);
    desgGroups.set(r.designation, list);
  });

  desgGroups.forEach((salaries, desg) => {
    salaries.sort((a, b) => a - b);
    desgMedianMap.set(desg, calculatePercentile(salaries, 50));
  });

  return rows.map(r => {
    const benchmark = desgMedianMap.get(r.designation) || r.grossSalary || 1;
    // Formula: Compa Ratio = Employee Salary / Benchmark * 100
    const compaRatio = Number(((r.grossSalary / benchmark) * 100).toFixed(1));

    let status: CompaRatioRow['status'] = 'Mid Range';
    let statusLabel = 'Mid Range (90–110%)';
    let reviewRequired = false;

    if (compaRatio < 80) {
      status = 'Below Range';
      statusLabel = 'Below Range (<80%) - Review Required';
      reviewRequired = true;
    } else if (compaRatio < 90) {
      status = 'Low Range';
      statusLabel = 'Low Range (80–90%)';
    } else if (compaRatio <= 110) {
      status = 'Mid Range';
      statusLabel = 'Mid Range (90–110%)';
    } else if (compaRatio <= 120) {
      status = 'High Range';
      statusLabel = 'High Range (110–120%)';
    } else {
      status = 'Above Range';
      statusLabel = 'Above Range (>120%) - Review Required';
      reviewRequired = true;
    }

    return {
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      designation: r.designation,
      department: r.department,
      currentSalary: r.grossSalary,
      benchmark,
      compaRatio,
      status,
      statusLabel,
      reviewRequired
    };
  }).sort((a, b) => a.compaRatio - b.compaRatio);
}

// 10. Salary Compression Risks
export function getSalaryCompressionRisks(rows: SalaryStructureRow[]): CompressionRiskRow[] {
  const risks: CompressionRiskRow[] = [];
  
  // Group by designation
  const desgMap = new Map<string, SalaryStructureRow[]>();
  rows.forEach(r => {
    const list = desgMap.get(r.designation) || [];
    list.push(r);
    desgMap.set(r.designation, list);
  });

  desgMap.forEach((list, desg) => {
    if (list.length < 2) return;
    
    // Sort by tenure/experience descending
    const sorted = [...list].sort((a, b) => calculateExperienceYears(b.joiningDate) - calculateExperienceYears(a.joiningDate));

    for (let i = 0; i < sorted.length - 1; i++) {
      const senior = sorted[i];
      const seniorExp = calculateExperienceYears(senior.joiningDate);

      for (let j = i + 1; j < sorted.length; j++) {
        const junior = sorted[j];
        const juniorExp = calculateExperienceYears(junior.joiningDate);

        // If senior has >= 1.5 years more experience than junior, but junior gross >= senior gross
        if ((seniorExp - juniorExp >= 1.5) && (junior.grossSalary >= senior.grossSalary)) {
          risks.push({
            designation: desg,
            grade: senior.grade,
            seniorEmployeeId: senior.employeeId,
            seniorEmployeeName: senior.employeeName,
            seniorDOJ: senior.joiningDate,
            seniorExpYears: seniorExp,
            seniorBasic: senior.basicSalary,
            seniorGross: senior.grossSalary,
            juniorEmployeeId: junior.employeeId,
            juniorEmployeeName: junior.employeeName,
            juniorDOJ: junior.joiningDate,
            juniorExpYears: juniorExp,
            juniorBasic: junior.basicSalary,
            juniorGross: junior.grossSalary,
            salaryDiff: junior.grossSalary - senior.grossSalary,
            flag: 'Potential Salary Compression'
          });
        }
      }
    }
  });

  return risks;
}

// 11. Experience vs Salary Analysis
export function getExperienceBandAnalysis(rows: SalaryStructureRow[]): ExperienceBandRow[] {
  const bands = ['0–1 Year', '1–3 Years', '3–5 Years', '5–10 Years', '10+ Years'];

  return bands.map(bandLabel => {
    const list = rows.filter(r => getExperienceBandLabel(calculateExperienceYears(r.joiningDate)) === bandLabel);
    const count = list.length;
    if (count === 0) {
      return {
        bandLabel,
        employeeCount: 0,
        avgBasic: 0,
        avgGross: 0,
        medianGross: 0,
        avgCTC: 0,
        totalCTC: 0
      };
    }

    const basicList = list.map(r => r.basicSalary).sort((a, b) => a - b);
    const grossList = list.map(r => r.grossSalary).sort((a, b) => a - b);

    const totalBasic = basicList.reduce((a, b) => a + b, 0);
    const totalGross = grossList.reduce((a, b) => a + b, 0);
    const totalCTC = list.reduce((a, b) => a + b.monthlyCTC, 0);

    return {
      bandLabel,
      employeeCount: count,
      avgBasic: Math.round(totalBasic / count),
      avgGross: Math.round(totalGross / count),
      medianGross: calculatePercentile(grossList, 50),
      avgCTC: Math.round(totalCTC / count),
      totalCTC
    };
  });
}

// 12. Monthly Cost Trend from Payroll Runs
export function getCostTrendAnalysis(payrollRuns: PayrollRun[], currentRows: SalaryStructureRow[]): CostTrendRow[] {
  if (!payrollRuns || payrollRuns.length === 0) {
    // Current snapshot row
    const totalGross = currentRows.reduce((a, b) => a + b.grossSalary, 0);
    const totalEmprSSF = currentRows.reduce((a, b) => a + b.employerSSF, 0);
    const totalCTC = currentRows.reduce((a, b) => a + b.monthlyCTC, 0);

    return [{
      month: 'Current Month',
      employeeCount: currentRows.length,
      grossPayroll: totalGross,
      employerSSF: totalEmprSSF,
      totalCTC,
      momChange: 0,
      momPct: 0
    }];
  }

  // Sort payroll runs chronologically
  const sortedRuns = [...payrollRuns].sort((a, b) => a.month.localeCompare(b.month));

  let prevCTC = 0;
  return sortedRuns.map((run, idx) => {
    const gross = run.totalGrossSalary || 0;
    const emprSSF = run.totalEmployerSSF || Math.round((run.totalSocialSecurity || 0) * 0.65);
    const ctc = run.totalCTC || (gross + emprSSF);
    const momChange = idx > 0 ? ctc - prevCTC : 0;
    const momPct = (idx > 0 && prevCTC > 0) ? Number(((momChange / prevCTC) * 100).toFixed(1)) : 0;
    prevCTC = ctc;

    return {
      month: run.monthName || run.month,
      employeeCount: run.totalEmployees || 0,
      grossPayroll: gross,
      employerSSF: emprSSF,
      totalCTC: ctc,
      momChange,
      momPct
    };
  });
}

// 13. Data Quality Check Audit
export function getDataQualityAudit(employees: Employee[], rows: SalaryStructureRow[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const seenIds = new Set<string>();

  employees.forEach(emp => {
    // Duplicate ID check
    if (seenIds.has(emp.id)) {
      issues.push({
        id: `dup_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        designation: emp.designation || 'Staff',
        issueType: 'Duplicate Employee ID',
        severity: 'High',
        description: `Employee ID "${emp.id}" is assigned to multiple records.`
      });
    }
    seenIds.add(emp.id);

    const basic = Number(emp.basicSalary || 0);
    const da = Number(emp.dearnessAllowance || 0);
    const other = Number(emp.otherAllowance || emp.allowances || 0);
    const recordedGross = Number(emp.grossSalary || 0);

    if (basic <= 0) {
      issues.push({
        id: `basic_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        designation: emp.designation || 'Staff',
        issueType: 'Missing Basic Salary',
        severity: 'High',
        description: 'Basic salary is zero or unrecorded.'
      });
    }

    if (recordedGross <= 0) {
      issues.push({
        id: `gross_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        designation: emp.designation || 'Staff',
        issueType: 'Missing Gross Salary',
        severity: 'High',
        description: 'Gross salary is zero or unrecorded.'
      });
    }

    if (!emp.joiningDate) {
      issues.push({
        id: `doj_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        designation: emp.designation || 'Staff',
        issueType: 'Missing Date of Joining',
        severity: 'Medium',
        description: 'Date of Joining is missing; tenure cannot be accurately calculated.'
      });
    }

    if (!emp.department) {
      issues.push({
        id: `dept_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: 'Unassigned',
        designation: emp.designation || 'Staff',
        issueType: 'Missing Department',
        severity: 'Low',
        description: 'Department field is blank.'
      });
    }

    if (!emp.designation) {
      issues.push({
        id: `desg_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        designation: 'Staff',
        issueType: 'Missing Designation',
        severity: 'Low',
        description: 'Designation field is blank.'
      });
    }

    if (!emp.grade) {
      issues.push({
        id: `grade_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        designation: emp.designation || 'Staff',
        issueType: 'Missing Grade',
        severity: 'Low',
        description: 'Grade field is unassigned.'
      });
    }

    // Calculation Mismatch Audit
    const computedGross = basic + da + other;
    if (recordedGross > 0 && computedGross > 0 && Math.abs(recordedGross - computedGross) > 10) {
      issues.push({
        id: `gross_mismatch_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department || 'Unassigned',
        designation: emp.designation || 'Staff',
        issueType: 'Incorrect Gross Calculation',
        severity: 'High',
        description: `Basic (${basic.toLocaleString()}) + DA (${da.toLocaleString()}) + Other (${other.toLocaleString()}) = ${computedGross.toLocaleString()}, but recorded Gross is ${recordedGross.toLocaleString()}.`
      });
    }
  });

  return issues;
}

// 14. Management Insights Auto Generation
export function generateManagementInsights(
  rows: SalaryStructureRow[], 
  deptSummaries: DepartmentSalarySummary[], 
  desgSummaries: DesignationSalarySummary[], 
  compressionRisks: CompressionRiskRow[], 
  qualityIssues: DataQualityIssue[]
): string[] {
  const insights: string[] = [];

  if (rows.length === 0) {
    return ['Insufficient data for salary analysis.'];
  }

  // Insight 1: Department CTC Concentration
  if (deptSummaries.length > 0) {
    const topDept = deptSummaries[0];
    insights.push(`The ${topDept.department} department represents ${topDept.pctOfTotalCTC}% of the total monthly CTC (Rs. ${topDept.totalMonthlyCTC.toLocaleString()}).`);
  }

  // Insight 2: Designation Average CTC Leader
  if (desgSummaries.length > 0) {
    const highestCTCDesg = [...desgSummaries].sort((a, b) => b.avgCTC - a.avgCTC)[0];
    insights.push(`${highestCTCDesg.designation} commands the highest average CTC at Rs. ${highestCTCDesg.avgCTC.toLocaleString()} per employee.`);
  }

  // Insight 3: Employer SSF Cost Contribution
  const totalGross = rows.reduce((a, b) => a + b.grossSalary, 0);
  const totalEmprSSF = rows.reduce((a, b) => a + b.employerSSF, 0);
  const totalCTC = rows.reduce((a, b) => a + b.monthlyCTC, 0);
  const ssfShare = totalCTC > 0 ? ((totalEmprSSF / totalCTC) * 100).toFixed(1) : '0';
  insights.push(`Employer SSF contributions account for ${ssfShare}% (Rs. ${totalEmprSSF.toLocaleString()}) of the total workforce cost.`);

  // Insight 4: Compression Risks
  if (compressionRisks.length > 0) {
    insights.push(`${compressionRisks.length} potential salary compression case(s) detected where junior staff gross salary matches or exceeds senior peers with >1.5 years tenure.`);
  } else {
    insights.push('No critical salary compression risks detected across designations.');
  }

  // Insight 5: Data Quality Action
  if (qualityIssues.length > 0) {
    const highSev = qualityIssues.filter(q => q.severity === 'High').length;
    insights.push(`Salary data audit identified ${qualityIssues.length} quality issue(s) (${highSev} high severity) requiring HR master data correction.`);
  }

  return insights;
}
