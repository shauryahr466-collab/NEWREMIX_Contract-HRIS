import { Employee } from '../types';

export interface SalaryFilterState {
  effectiveDate: string;
  fiscalYear: string;
  department: string;
  section: string;
  designation: string;
  grade: string;
  employmentType: string;
  status: string; // 'Active' | 'Inactive' | 'All'
  location: string;
  gender: string;
  experienceBand: string;
  minSalary: number;
  maxSalary: number;
  searchTerm: string;
}

export interface SalaryBand {
  id: string;
  label: string;
  min: number;
  max: number; // Infinity for 'Above X'
}

export interface SalaryStructureRow {
  employeeId: string;
  employeeName: string;
  department: string;
  section: string;
  designation: string;
  grade: string;
  joiningDate: string;
  joiningDateBS?: string;
  experienceYears: number;
  experience: string;
  basicSalary: number;
  dearnessAllowance: number;
  otherAllowance: number;
  grossSalary: number;
  employeeSSF: number;
  employerSSF: number;
  monthlyCTC: number;
  annualCTC: number;
  effectiveDate: string;
  employmentStatus: string;
  gender?: string;
  location?: string;
  employmentType?: string;
}

export interface DepartmentSalarySummary {
  department: string;
  employeeCount: number;
  totalBasic: number;
  avgBasic: number;
  medianBasic: number;
  minBasic: number;
  maxBasic: number;
  totalGross: number;
  avgGross: number;
  medianGross: number;
  minGross: number;
  maxGross: number;
  totalEmployeeSSF: number;
  totalEmployerSSF: number;
  totalMonthlyCTC: number;
  avgMonthlyCTC: number;
  annualCTC: number;
  pctOfTotalCTC: number;
}

export interface DesignationSalarySummary {
  designation: string;
  employeeCount: number;
  avgBasic: number;
  medianBasic: number;
  minBasic: number;
  maxBasic: number;
  avgGross: number;
  medianGross: number;
  minGross: number;
  maxGross: number;
  totalGrossCost: number;
  avgCTC: number;
  totalCTC: number;
  pctOfTotalCost: number;
}

export interface SectionSalarySummary {
  section: string;
  employeeCount: number;
  avgBasic: number;
  avgGross: number;
  medianGross: number;
  totalGross: number;
  employerSSF: number;
  avgCTC: number;
  totalCTC: number;
  annualCTC: number;
}

export interface SalaryDistributionRow {
  bandId: string;
  bandLabel: string;
  employeeCount: number;
  pctEmployees: number;
  totalSalaryCost: number;
  min: number;
  max: number;
}

export interface AvgVsMedianRow {
  groupName: string; // Dept or Designation
  type: 'Department' | 'Designation';
  employeeCount: number;
  avgSalary: number;
  medianSalary: number;
  difference: number; // Avg - Median
  differencePct: number; // ((Avg - Median) / Median) * 100
}

export interface SalaryPercentileRow {
  designation: string;
  employeeCount: number;
  minSalary: number;
  q1: number; // 25th percentile
  median: number; // 50th percentile
  q3: number; // 75th percentile
  maxSalary: number;
  spread: number;
  flagStatus: 'Normal Range' | 'Review Required';
  outliersCount: number;
}

export interface SalaryEquityRow {
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  grade: string;
  experience: string; // e.g. "4.2 yrs"
  experienceYears: number;
  basicSalary: number;
  grossSalary: number;
  groupAverage: number;
  varianceAmount: number;
  variancePct: number;
  compaRatio: number;
}

export interface CompaRatioRow {
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  currentSalary: number;
  benchmark: number;
  compaRatio: number;
  status: 'Below Range' | 'Low Range' | 'Mid Range' | 'High Range' | 'Above Range';
  statusLabel: string;
  reviewRequired: boolean;
}

export interface CompressionRiskRow {
  designation: string;
  grade: string;
  seniorEmployeeId: string;
  seniorEmployeeName: string;
  seniorDOJ: string;
  seniorExpYears: number;
  seniorBasic: number;
  seniorGross: number;
  juniorEmployeeId: string;
  juniorEmployeeName: string;
  juniorDOJ: string;
  juniorExpYears: number;
  juniorBasic: number;
  juniorGross: number;
  salaryDiff: number;
  flag: 'Potential Salary Compression';
}

export interface ExperienceBandRow {
  bandLabel: string;
  employeeCount: number;
  avgBasic: number;
  avgGross: number;
  medianGross: number;
  avgCTC: number;
  totalCTC: number;
}

export interface CostTrendRow {
  month: string; // YYYY-MM or Month Name
  employeeCount: number;
  grossPayroll: number;
  employerSSF: number;
  totalCTC: number;
  momChange: number;
  momPct: number;
}

export interface IncrementAnalysisRow {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  previousSalary: number;
  currentSalary: number;
  incrementAmount: number;
  incrementPct: number;
  effectiveDate: string;
}

export interface DataQualityIssue {
  id: string; // issue unique key
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  issueType: 
    | 'Missing Basic Salary' 
    | 'Missing Gross Salary' 
    | 'Missing Date of Joining' 
    | 'Missing Department' 
    | 'Missing Designation' 
    | 'Missing Grade' 
    | 'Missing SSF Information' 
    | 'Duplicate Employee ID' 
    | 'Incorrect Gross Calculation' 
    | 'Incorrect Employer SSF' 
    | 'Incorrect CTC';
  severity: 'High' | 'Medium' | 'Low';
  description: string;
}

export interface DrillDownData {
  title: string;
  type: 'department' | 'designation' | 'section' | 'review' | 'compression' | 'ctc' | 'band';
  filterKey: string;
  employees: Employee[];
  totalGross: number;
  totalCTC: number;
}
