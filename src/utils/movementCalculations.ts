import { Employee, EmployeeMovement, MovementType } from '../types';
import { format, parseISO, isAfter, isBefore, isEqual, differenceInDays, differenceInMonths, differenceInYears } from 'date-fns';

export interface MovementFilterState {
  fiscalYear: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  month: string;     // 'all' or '01'..'12'
  department: string;
  section: string;
  designation: string;
  grade: string;
  employmentType: string;
  gender: string;
  status: string; // 'all' | 'Active' | 'Inactive'
  location: string;
}

export const DEFAULT_MOVEMENT_FILTERS: MovementFilterState = {
  fiscalYear: '2080/81',
  startDate: '2023-07-17', // Approx Shrawan 1
  endDate: '2024-07-15',   // Approx Ashadh end
  month: 'all',
  department: 'all',
  section: 'all',
  designation: 'all',
  grade: 'all',
  employmentType: 'all',
  gender: 'all',
  status: 'all',
  location: 'all',
};

export const NEPALI_FY_MONTHS = [
  { key: 'Shrawan', label: 'Shrawan (Jul/Aug)', monthNum: 7 },
  { key: 'Bhadra', label: 'Bhadra (Aug/Sep)', monthNum: 8 },
  { key: 'Ashwin', label: 'Ashwin (Sep/Oct)', monthNum: 9 },
  { key: 'Kartik', label: 'Kartik (Oct/Nov)', monthNum: 10 },
  { key: 'Mangsir', label: 'Mangsir (Nov/Dec)', monthNum: 11 },
  { key: 'Poush', label: 'Poush (Dec/Jan)', monthNum: 12 },
  { key: 'Magh', label: 'Magh (Jan/Feb)', monthNum: 1 },
  { key: 'Falgun', label: 'Falgun (Feb/Mar)', monthNum: 2 },
  { key: 'Chaitra', label: 'Chaitra (Mar/Apr)', monthNum: 3 },
  { key: 'Baisakh', label: 'Baisakh (Apr/May)', monthNum: 4 },
  { key: 'Jestha', label: 'Jestha (May/Jun)', monthNum: 5 },
  { key: 'Ashadh', label: 'Ashadh (Jun/Jul)', monthNum: 6 },
];

export interface MovementSummaryKPIs {
  openingHeadcount: number;
  closingHeadcount: number;
  averageHeadcount: number;
  newJoiners: number;
  separations: number;
  voluntarySeparations: number;
  involuntarySeparations: number;
  netMovement: number;
  attritionRate: number;
  voluntaryAttritionRate: number;
  involuntaryAttritionRate: number;
  turnoverRate: number;
  retentionRate: number;
  newJoinerRate: number;
  internalMovementCount: number;
  promotionCount: number;
  transferCount: number;
  departmentChangeCount: number;
  promotionRate: number;
}

export interface MonthlyTrendRow {
  monthKey: string;
  monthName: string;
  openingHC: number;
  newJoiners: number;
  separations: number;
  closingHC: number;
  netMovement: number;
  attritionRate: number;
}

export interface DepartmentAttritionRow {
  department: string;
  openingHC: number;
  joiners: number;
  separations: number;
  voluntarySeparations: number;
  involuntarySeparations: number;
  closingHC: number;
  averageHC: number;
  attritionRate: number;
  voluntaryAttritionRate: number;
  involuntaryAttritionRate: number;
  netMovement: number;
}

export interface DesignationAttritionRow {
  designation: string;
  employeeCount: number;
  joiners: number;
  separations: number;
  attritionRate: number;
  retentionRate: number;
}

export interface SectionMovementRow {
  section: string;
  openingHC: number;
  joiners: number;
  transfersIn: number;
  transfersOut: number;
  separations: number;
  closingHC: number;
  attritionRate: number;
  netMovement: number;
}

export interface TenureAnalysisBand {
  band: string;
  label: string;
  employeeCount: number;
  averageSalary: number;
  joiners: number;
  separations: number;
  attritionRate: number;
}

export interface ExitReasonRow {
  reason: string;
  count: number;
  percentage: number;
  voluntaryCount: number;
  involuntaryCount: number;
  avgTenureYears: number;
}

export interface PromotionRecordRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  effectiveDate: string;
  previousDesignation: string;
  newDesignation: string;
  previousGrade: string;
  newGrade: string;
  previousSalary: number;
  newSalary: number;
  incrementPercentage: number;
  reason: string;
}

export interface TransferMatrixRow {
  fromDepartment: string;
  toDepartment: string;
  count: number;
}

export interface MovementAuditIssue {
  employeeId: string;
  employeeName: string;
  issueType: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

// -------------------------------------------------------------------
// Helper Functions
// -------------------------------------------------------------------

export function filterEmployeesByMovementState(
  employees: Employee[],
  filters: MovementFilterState
): Employee[] {
  return employees.filter(emp => {
    if (filters.department !== 'all' && emp.department !== filters.department) return false;
    if (filters.section !== 'all' && (emp.section || 'General') !== filters.section) return false;
    if (filters.designation !== 'all' && emp.designation !== filters.designation) return false;
    if (filters.grade !== 'all' && (emp.grade || 'N/A') !== filters.grade) return false;
    if (filters.employmentType !== 'all' && (emp.employmentType || 'Permanent') !== filters.employmentType) return false;
    if (filters.gender !== 'all' && (emp.gender || 'Unspecified') !== filters.gender) return false;
    if (filters.status !== 'all' && emp.status !== filters.status) return false;
    if (filters.location !== 'all' && (emp.accommodation || emp.location || 'Default') !== filters.location) return false;
    return true;
  });
}

/**
  Check if employee was ACTIVE at a given date.
  An employee is active if:
  1. joiningDate <= targetDate
  2. status is Active OR separationDate > targetDate
*/
export function isEmployeeActiveOnDate(emp: Employee, targetDateStr: string): boolean {
  if (!emp.joiningDate) return false;
  
  // Joined after targetDate? -> Not active
  if (emp.joiningDate > targetDateStr) return false;

  // Separated before or on targetDate? -> Not active
  if (emp.separationDate && emp.separationDate <= targetDateStr) return false;

  // If status is Inactive and no separation date, assume statusEffectiveDate
  if (emp.status === 'Inactive' && emp.statusEffectiveDate && emp.statusEffectiveDate <= targetDateStr) {
    return false;
  }

  return true;
}

/**
  Check if employee joined within [startDate, endDate]
*/
export function isNewJoiner(emp: Employee, startDateStr: string, endDateStr: string): boolean {
  if (!emp.joiningDate) return false;
  return emp.joiningDate >= startDateStr && emp.joiningDate <= endDateStr;
}

/**
  Check if employee separated within [startDate, endDate]
*/
export function isSeparation(emp: Employee, startDateStr: string, endDateStr: string): boolean {
  if (emp.separationDate && emp.separationDate >= startDateStr && emp.separationDate <= endDateStr) {
    return true;
  }
  if (emp.status === 'Inactive' && emp.statusEffectiveDate && emp.statusEffectiveDate >= startDateStr && emp.statusEffectiveDate <= endDateStr) {
    return true;
  }
  return false;
}

/**
  Determine if exit is Voluntary or Involuntary
*/
export function getExitClassification(emp: Employee, movement?: EmployeeMovement): 'Voluntary' | 'Involuntary' {
  const exitType = movement?.exitType || emp.exitType;
  if (exitType) {
    if (exitType === 'Voluntary') return 'Voluntary';
    if (exitType === 'Involuntary') return 'Involuntary';
  }

  const reason = (movement?.exitReason || emp.exitReason || '').toLowerCase();
  if (
    reason.includes('resign') || 
    reason.includes('personal') || 
    reason.includes('better') || 
    reason.includes('relocation') ||
    reason.includes('salary') ||
    reason.includes('opportunity')
  ) {
    return 'Voluntary';
  }

  return 'Involuntary';
}

// -------------------------------------------------------------------
// Calculation Engine
// -------------------------------------------------------------------

export function calculateMovementKPIs(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): MovementSummaryKPIs {
  const filteredEmployees = filterEmployeesByMovementState(employees, filters);

  const start = filters.startDate;
  const end = filters.endDate;

  // Opening Headcount: Active on startDate
  const openingHeadcount = filteredEmployees.filter(emp => isEmployeeActiveOnDate(emp, start)).length;

  // Closing Headcount: Active on endDate
  const closingHeadcount = filteredEmployees.filter(emp => isEmployeeActiveOnDate(emp, end)).length;

  // Average Headcount
  const averageHeadcount = Math.max((openingHeadcount + closingHeadcount) / 2, 1);

  // New Joiners
  const newJoiners = filteredEmployees.filter(emp => isNewJoiner(emp, start, end)).length;

  // Separations
  const separatedEmps = filteredEmployees.filter(emp => isSeparation(emp, start, end));
  const separations = separatedEmps.length;

  let voluntarySeparations = 0;
  let involuntarySeparations = 0;

  separatedEmps.forEach(emp => {
    const move = movements.find(m => m.employeeId === emp.id && (m.movementType === 'Resignation' || m.movementType === 'Termination' || m.movementType === 'Other Separation'));
    const cls = getExitClassification(emp, move);
    if (cls === 'Voluntary') voluntarySeparations++;
    else involuntarySeparations++;
  });

  const netMovement = newJoiners - separations;

  // Rates
  const attritionRate = Number(((separations / averageHeadcount) * 100).toFixed(2));
  const voluntaryAttritionRate = Number(((voluntarySeparations / averageHeadcount) * 100).toFixed(2));
  const involuntaryAttritionRate = Number(((involuntarySeparations / averageHeadcount) * 100).toFixed(2));
  const turnoverRate = attritionRate;
  const retentionRate = Number((Math.max(100 - attritionRate, 0)).toFixed(2));
  const newJoinerRate = Number(((newJoiners / averageHeadcount) * 100).toFixed(2));

  // Internal Movements
  const periodMovements = movements.filter(m => m.effectiveDate >= start && m.effectiveDate <= end);
  const promotionCount = periodMovements.filter(m => m.movementType === 'Promotion').length;
  const transferCount = periodMovements.filter(m => m.movementType === 'Transfer').length;
  const departmentChangeCount = periodMovements.filter(m => m.movementType === 'Department Change').length;
  const internalMovementCount = promotionCount + transferCount + departmentChangeCount;

  const promotionRate = Number(((promotionCount / averageHeadcount) * 100).toFixed(2));

  return {
    openingHeadcount,
    closingHeadcount,
    averageHeadcount: Math.round(averageHeadcount),
    newJoiners,
    separations,
    voluntarySeparations,
    involuntarySeparations,
    netMovement,
    attritionRate,
    voluntaryAttritionRate,
    involuntaryAttritionRate,
    turnoverRate,
    retentionRate,
    newJoinerRate,
    internalMovementCount,
    promotionCount,
    transferCount,
    departmentChangeCount,
    promotionRate,
  };
}

// -------------------------------------------------------------------
// Monthly Trend Analysis
// -------------------------------------------------------------------

export function calculateMonthlyTrend(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): MonthlyTrendRow[] {
  const filteredEmployees = filterEmployeesByMovementState(employees, filters);

  return NEPALI_FY_MONTHS.map((mObj, index) => {
    // Generate simulated/actual dates for each month in period
    const year = index < 6 ? 2023 : 2024;
    const monthNumStr = mObj.monthNum < 10 ? `0${mObj.monthNum}` : `${mObj.monthNum}`;
    const mStart = `${year}-${monthNumStr}-01`;
    const mEnd = `${year}-${monthNumStr}-28`;

    const openingHC = filteredEmployees.filter(e => isEmployeeActiveOnDate(e, mStart)).length;
    const closingHC = filteredEmployees.filter(e => isEmployeeActiveOnDate(e, mEnd)).length;
    const avgHC = Math.max((openingHC + closingHC) / 2, 1);

    const joiners = filteredEmployees.filter(e => isNewJoiner(e, mStart, mEnd)).length;
    const seps = filteredEmployees.filter(e => isSeparation(e, mStart, mEnd)).length;
    const net = joiners - seps;
    const att = Number(((seps / avgHC) * 100).toFixed(2));

    return {
      monthKey: mObj.key,
      monthName: mObj.label,
      openingHC,
      newJoiners: joiners,
      separations: seps,
      closingHC,
      netMovement: net,
      attritionRate: att,
    };
  });
}

// -------------------------------------------------------------------
// Department Attrition Table
// -------------------------------------------------------------------

export function calculateDepartmentAttrition(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): DepartmentAttritionRow[] {
  const start = filters.startDate;
  const end = filters.endDate;

  const departments = Array.from(
    new Set(employees.map(e => e.department || 'General'))
  ).sort();

  const rows: DepartmentAttritionRow[] = departments.map(dept => {
    const deptEmployees = employees.filter(e => (e.department || 'General') === dept);

    const openingHC = deptEmployees.filter(e => isEmployeeActiveOnDate(e, start)).length;
    const closingHC = deptEmployees.filter(e => isEmployeeActiveOnDate(e, end)).length;
    const averageHC = Math.max((openingHC + closingHC) / 2, 1);

    const joiners = deptEmployees.filter(e => isNewJoiner(e, start, end)).length;
    const separatedEmps = deptEmployees.filter(e => isSeparation(e, start, end));
    const separations = separatedEmps.length;

    let voluntarySeparations = 0;
    let involuntarySeparations = 0;

    separatedEmps.forEach(emp => {
      const move = movements.find(m => m.employeeId === emp.id && (m.movementType === 'Resignation' || m.movementType === 'Termination'));
      const cls = getExitClassification(emp, move);
      if (cls === 'Voluntary') voluntarySeparations++;
      else involuntarySeparations++;
    });

    const netMovement = joiners - separations;
    const attritionRate = Number(((separations / averageHC) * 100).toFixed(2));
    const voluntaryAttritionRate = Number(((voluntarySeparations / averageHC) * 100).toFixed(2));
    const involuntaryAttritionRate = Number(((involuntarySeparations / averageHC) * 100).toFixed(2));

    return {
      department: dept,
      openingHC,
      joiners,
      separations,
      voluntarySeparations,
      involuntarySeparations,
      closingHC,
      averageHC: Math.round(averageHC),
      attritionRate,
      voluntaryAttritionRate,
      involuntaryAttritionRate,
      netMovement,
    };
  });

  // Sort by Highest Attrition Rate
  return rows.sort((a, b) => b.attritionRate - a.attritionRate);
}

// -------------------------------------------------------------------
// Designation Attrition
// -------------------------------------------------------------------

export function calculateDesignationAttrition(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): DesignationAttritionRow[] {
  const start = filters.startDate;
  const end = filters.endDate;

  const designations = Array.from(
    new Set(employees.map(e => e.designation || 'Staff'))
  ).sort();

  return designations.map(desg => {
    const desgEmployees = employees.filter(e => (e.designation || 'Staff') === desg);

    const activeCount = desgEmployees.filter(e => e.status === 'Active').length;
    const joiners = desgEmployees.filter(e => isNewJoiner(e, start, end)).length;
    const seps = desgEmployees.filter(e => isSeparation(e, start, end)).length;
    const avgHC = Math.max((activeCount + (activeCount + seps - joiners)) / 2, 1);

    const att = Number(((seps / avgHC) * 100).toFixed(2));
    const ret = Number((Math.max(100 - att, 0)).toFixed(2));

    return {
      designation: desg,
      employeeCount: activeCount,
      joiners,
      separations: seps,
      attritionRate: att,
      retentionRate: ret,
    };
  }).sort((a, b) => b.employeeCount - a.employeeCount);
}

// -------------------------------------------------------------------
// Section Movement
// -------------------------------------------------------------------

export function calculateSectionMovement(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): SectionMovementRow[] {
  const start = filters.startDate;
  const end = filters.endDate;

  const sections = Array.from(
    new Set(employees.map(e => e.section || 'General'))
  ).sort();

  return sections.map(sec => {
    const secEmployees = employees.filter(e => (e.section || 'General') === sec);

    const openingHC = secEmployees.filter(e => isEmployeeActiveOnDate(e, start)).length;
    const closingHC = secEmployees.filter(e => isEmployeeActiveOnDate(e, end)).length;
    const avgHC = Math.max((openingHC + closingHC) / 2, 1);

    const joiners = secEmployees.filter(e => isNewJoiner(e, start, end)).length;
    const seps = secEmployees.filter(e => isSeparation(e, start, end)).length;

    const transfersIn = movements.filter(m => m.effectiveDate >= start && m.effectiveDate <= end && m.newSection === sec).length;
    const transfersOut = movements.filter(m => m.effectiveDate >= start && m.effectiveDate <= end && m.previousSection === sec).length;

    const net = joiners + transfersIn - transfersOut - seps;
    const att = Number(((seps / avgHC) * 100).toFixed(2));

    return {
      section: sec,
      openingHC,
      joiners,
      transfersIn,
      transfersOut,
      separations: seps,
      closingHC,
      attritionRate: att,
      netMovement: net,
    };
  });
}

// -------------------------------------------------------------------
// Tenure Analysis
// -------------------------------------------------------------------

export function calculateTenureAnalysis(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): TenureAnalysisBand[] {
  const start = filters.startDate;
  const end = filters.endDate;

  const bands = [
    { key: '0-1', label: '0 – 1 Year (Early Tenure)', minDays: 0, maxDays: 365 },
    { key: '1-3', label: '1 – 3 Years', minDays: 366, maxDays: 1095 },
    { key: '3-5', label: '3 – 5 Years', minDays: 1096, maxDays: 1825 },
    { key: '5-10', label: '5 – 10 Years', minDays: 1826, maxDays: 3650 },
    { key: '10+', label: '10+ Years (Senior Staff)', minDays: 3651, maxDays: 99999 },
  ];

  const now = new Date();

  return bands.map(b => {
    const bandEmps = employees.filter(emp => {
      if (!emp.joiningDate) return false;
      const joinD = parseISO(emp.joiningDate);
      const tenureDays = differenceInDays(now, joinD);
      return tenureDays >= b.minDays && tenureDays <= b.maxDays;
    });

    const employeeCount = bandEmps.filter(e => e.status === 'Active').length;

    const totalSalary = bandEmps.reduce((acc, curr) => acc + (curr.monthlyCTC || curr.grossSalary || curr.basicSalary || 0), 0);
    const averageSalary = bandEmps.length > 0 ? Math.round(totalSalary / bandEmps.length) : 0;

    const joiners = bandEmps.filter(e => isNewJoiner(e, start, end)).length;
    const seps = bandEmps.filter(e => isSeparation(e, start, end)).length;

    const avgHC = Math.max(employeeCount, 1);
    const att = Number(((seps / avgHC) * 100).toFixed(2));

    return {
      band: b.key,
      label: b.label,
      employeeCount,
      averageSalary,
      joiners,
      separations: seps,
      attritionRate: att,
    };
  });
}

// -------------------------------------------------------------------
// Exit Reason Breakdown
// -------------------------------------------------------------------

export function calculateExitReasonAnalysis(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): ExitReasonRow[] {
  const start = filters.startDate;
  const end = filters.endDate;

  const separatedEmps = employees.filter(e => isSeparation(e, start, end));

  if (separatedEmps.length === 0) {
    return [
      { reason: 'Better Salary / Compensation', count: 0, percentage: 0, voluntaryCount: 0, involuntaryCount: 0, avgTenureYears: 0 },
      { reason: 'Personal / Family Reasons', count: 0, percentage: 0, voluntaryCount: 0, involuntaryCount: 0, avgTenureYears: 0 },
      { reason: 'Career Advancement', count: 0, percentage: 0, voluntaryCount: 0, involuntaryCount: 0, avgTenureYears: 0 },
      { reason: 'Contract Expiration', count: 0, percentage: 0, voluntaryCount: 0, involuntaryCount: 0, avgTenureYears: 0 },
    ];
  }

  const map: Record<string, { count: number; voluntary: number; involuntary: number; totalTenureDays: number }> = {};

  separatedEmps.forEach(emp => {
    const move = movements.find(m => m.employeeId === emp.id && (m.movementType === 'Resignation' || m.movementType === 'Termination'));
    const reason = move?.exitReason || emp.exitReason || 'Personal / Unspecified';
    const cls = getExitClassification(emp, move);

    let tenureDays = 365;
    if (emp.joiningDate && emp.separationDate) {
      tenureDays = Math.max(differenceInDays(parseISO(emp.separationDate), parseISO(emp.joiningDate)), 30);
    }

    if (!map[reason]) {
      map[reason] = { count: 0, voluntary: 0, involuntary: 0, totalTenureDays: 0 };
    }

    map[reason].count++;
    map[reason].totalTenureDays += tenureDays;
    if (cls === 'Voluntary') map[reason].voluntary++;
    else map[reason].involuntary++;
  });

  const totalSeps = separatedEmps.length;

  return Object.keys(map).map(r => ({
    reason: r,
    count: map[r].count,
    percentage: Number(((map[r].count / totalSeps) * 100).toFixed(1)),
    voluntaryCount: map[r].voluntary,
    involuntaryCount: map[r].involuntary,
    avgTenureYears: Number(((map[r].totalTenureDays / map[r].count) / 365).toFixed(1)),
  })).sort((a, b) => b.count - a.count);
}

// -------------------------------------------------------------------
// Promotion & Transfer Analysis
// -------------------------------------------------------------------

export function getPromotionRecords(
  employees: Employee[],
  movements: EmployeeMovement[],
  filters: MovementFilterState
): PromotionRecordRow[] {
  const start = filters.startDate;
  const end = filters.endDate;

  const promos = movements.filter(m => m.movementType === 'Promotion' && m.effectiveDate >= start && m.effectiveDate <= end);

  return promos.map(p => {
    const emp = employees.find(e => e.id === p.employeeId);
    const prevSal = p.previousSalary || 30000;
    const newSal = p.newSalary || 35000;
    const incPct = prevSal > 0 ? Number((((newSal - prevSal) / prevSal) * 100).toFixed(1)) : 0;

    return {
      id: p.id,
      employeeId: p.employeeId,
      employeeName: emp?.name || `Employee #${p.employeeId}`,
      department: p.newDepartment || emp?.department || 'General',
      effectiveDate: p.effectiveDate,
      previousDesignation: p.previousDesignation || 'Assistant',
      newDesignation: p.newDesignation || 'Senior Executive',
      previousGrade: p.previousGrade || 'G-1',
      newGrade: p.newGrade || 'G-2',
      previousSalary: prevSal,
      newSalary: newSal,
      incrementPercentage: incPct,
      reason: p.reason || 'Performance Appraisal',
    };
  });
}

export function getDepartmentTransferMatrix(
  movements: EmployeeMovement[],
  filters: MovementFilterState
): TransferMatrixRow[] {
  const start = filters.startDate;
  const end = filters.endDate;

  const transfers = movements.filter(m => (m.movementType === 'Transfer' || m.movementType === 'Department Change') && m.effectiveDate >= start && m.effectiveDate <= end);

  const map: Record<string, number> = {};

  transfers.forEach(t => {
    const key = `${t.previousDepartment || 'Operations'} -> ${t.newDepartment || 'Production'}`;
    map[key] = (map[key] || 0) + 1;
  });

  return Object.keys(map).map(k => {
    const [fromDept, toDept] = k.split(' -> ');
    return {
      fromDepartment: fromDept,
      toDepartment: toDept,
      count: map[k],
    };
  });
}

// -------------------------------------------------------------------
// Data Quality Audit Engine
// -------------------------------------------------------------------

export function getMovementDataQualityAudit(
  employees: Employee[],
  movements: EmployeeMovement[]
): MovementAuditIssue[] {
  const issues: MovementAuditIssue[] = [];

  // Check 1: Duplicate Bio IDs
  const seenIds = new Set<string>();
  employees.forEach(emp => {
    if (seenIds.has(emp.id)) {
      issues.push({
        employeeId: emp.id,
        employeeName: emp.name,
        issueType: 'Duplicate Employee ID',
        description: `Bio ID '${emp.id}' appears multiple times in Employee Directory.`,
        severity: 'high',
      });
    }
    seenIds.add(emp.id);
  });

  employees.forEach(emp => {
    // Check 2: Missing Date of Joining
    if (!emp.joiningDate) {
      issues.push({
        employeeId: emp.id,
        employeeName: emp.name,
        issueType: 'Missing Date of Joining',
        description: 'Employee lacks a valid Date of Joining (DOJ).',
        severity: 'high',
      });
    }

    // Check 3: Missing Department
    if (!emp.department) {
      issues.push({
        employeeId: emp.id,
        employeeName: emp.name,
        issueType: 'Missing Department',
        description: 'Department is blank in master record.',
        severity: 'medium',
      });
    }

    // Check 4: Separation Date without Exit Reason
    if (emp.separationDate && !emp.exitReason) {
      issues.push({
        employeeId: emp.id,
        employeeName: emp.name,
        issueType: 'Separation without Exit Reason',
        description: `Employee separated on ${emp.separationDate} but exit reason is unspecified.`,
        severity: 'medium',
      });
    }

    // Check 5: Active status but separation date in past
    const today = format(new Date(), 'yyyy-MM-dd');
    if (emp.status === 'Active' && emp.separationDate && emp.separationDate <= today) {
      issues.push({
        employeeId: emp.id,
        employeeName: emp.name,
        issueType: 'Active Status with Past Separation Date',
        description: `Employee status is 'Active' but separation date is ${emp.separationDate}.`,
        severity: 'high',
      });
    }

    // Check 6: Inactive status without separation date or effective date
    if (emp.status === 'Inactive' && !emp.separationDate && !emp.statusEffectiveDate) {
      issues.push({
        employeeId: emp.id,
        employeeName: emp.name,
        issueType: 'Inactive without Effective Date',
        description: 'Employee status is Inactive but no separation/effective date is recorded.',
        severity: 'high',
      });
    }

    // Check 7: Separation Date before Joining Date
    if (emp.joiningDate && emp.separationDate && emp.separationDate < emp.joiningDate) {
      issues.push({
        employeeId: emp.id,
        employeeName: emp.name,
        issueType: 'Separation Date Before Joining Date',
        description: `Separation date (${emp.separationDate}) is prior to joining date (${emp.joiningDate}).`,
        severity: 'high',
      });
    }
  });

  return issues;
}

// -------------------------------------------------------------------
// Automated Management HR Insights & Flags
// -------------------------------------------------------------------

export function generateMovementManagementInsights(
  kpis: MovementSummaryKPIs,
  deptAttrition: DepartmentAttritionRow[],
  exitReasons: ExitReasonRow[]
): { insights: string[]; flags: { label: string; type: 'danger' | 'warning' | 'info' }[] } {
  const insights: string[] = [];
  const flags: { label: string; type: 'danger' | 'warning' | 'info' }[] = [];

  if (kpis.attritionRate > 10) {
    flags.push({ label: 'CRITICAL: High Attrition Rate (>10%)', type: 'danger' });
    insights.push(`Workforce Attrition Rate stands at ${kpis.attritionRate}%, which exceeds standard industrial benchmarks.`);
  } else if (kpis.attritionRate > 5) {
    flags.push({ label: 'WARNING: Moderate Attrition Rate (5-10%)', type: 'warning' });
    insights.push(`Workforce Attrition Rate is ${kpis.attritionRate}%, requiring close operational monitoring.`);
  } else {
    flags.push({ label: 'HEALTHY: Stable Attrition Rate (<5%)', type: 'info' });
    insights.push(`Workforce Attrition Rate is healthy at ${kpis.attritionRate}%.`);
  }

  if (kpis.netMovement < 0) {
    flags.push({ label: 'ALERT: Negative Headcount Growth', type: 'danger' });
    insights.push(`Net headcount movement is negative (${kpis.netMovement} staff), indicating separations outpaced recruitment.`);
  } else if (kpis.netMovement > 0) {
    insights.push(`Net workforce expanded by +${kpis.netMovement} employees during the analysis window.`);
  }

  if (deptAttrition.length > 0 && deptAttrition[0].attritionRate > 12) {
    flags.push({ label: `HIGH DEPT ATTRITION: ${deptAttrition[0].department}`, type: 'warning' });
    insights.push(`${deptAttrition[0].department} department recorded the highest attrition rate at ${deptAttrition[0].attritionRate}%.`);
  }

  if (exitReasons.length > 0 && exitReasons[0].count > 0) {
    insights.push(`Primary driver for employee exits: '${exitReasons[0].reason}' (${exitReasons[0].percentage}% of total separations).`);
  }

  if (kpis.promotionCount > 0) {
    insights.push(`A total of ${kpis.promotionCount} internal staff promotions were executed (${kpis.promotionRate}% promotion rate).`);
  }

  return { insights, flags };
}
