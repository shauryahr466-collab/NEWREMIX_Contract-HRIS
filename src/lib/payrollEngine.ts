import type { Employee, ProcessedAttendance, OvertimeRecord, PayrollRecord, PayrollRun, PayrollConfig } from '../types';

export const NEPALI_MONTHS = [
  { id: '01', en: 'Baishakh', np: 'वैशाख', code: 'BS-01', fyMonth: 10 },
  { id: '02', en: 'Jestha', np: 'ज्येष्ठ', code: 'BS-02', fyMonth: 11 },
  { id: '03', en: 'Ashadh', np: 'आषाढ', code: 'BS-03', fyMonth: 12 },
  { id: '04', en: 'Shrawan', np: 'श्रावण', code: 'BS-04', fyMonth: 1 },
  { id: '05', en: 'Bhadra', np: 'भाद्र', code: 'BS-05', fyMonth: 2 },
  { id: '06', en: 'Ashwin', np: 'आश्विन', code: 'BS-06', fyMonth: 3 },
  { id: '07', en: 'Kartik', np: 'कार्तिक', code: 'BS-07', fyMonth: 4 },
  { id: '08', en: 'Mangsir', np: 'मंसिर', code: 'BS-08', fyMonth: 5 },
  { id: '09', en: 'Poush', np: 'पौष', code: 'BS-09', fyMonth: 6 },
  { id: '10', en: 'Magh', np: 'माघ', code: 'BS-10', fyMonth: 7 },
  { id: '11', en: 'Falgun', np: 'फाल्गुन', code: 'BS-11', fyMonth: 8 },
  { id: '12', en: 'Chaitra', np: 'चैत्र', code: 'BS-12', fyMonth: 9 },
];

export const FY_NEPALI_MONTHS = [
  { id: '04', fyMonth: 1, fyLabel: '01 (FY Start)', en: 'Shrawan', np: 'श्रावण', code: 'BS-04' },
  { id: '05', fyMonth: 2, fyLabel: '02', en: 'Bhadra', np: 'भाद्र', code: 'BS-05' },
  { id: '06', fyMonth: 3, fyLabel: '03', en: 'Ashwin', np: 'आश्विन', code: 'BS-06' },
  { id: '07', fyMonth: 4, fyLabel: '04', en: 'Kartik', np: 'कार्तिक', code: 'BS-07' },
  { id: '08', fyMonth: 5, fyLabel: '05', en: 'Mangsir', np: 'मंसिर', code: 'BS-08' },
  { id: '09', fyMonth: 6, fyLabel: '06', en: 'Poush', np: 'पौष', code: 'BS-09' },
  { id: '10', fyMonth: 7, fyLabel: '07', en: 'Magh', np: 'माघ', code: 'BS-10' },
  { id: '11', fyMonth: 8, fyLabel: '08', en: 'Falgun', np: 'फाल्गुन', code: 'BS-11' },
  { id: '12', fyMonth: 9, fyLabel: '09', en: 'Chaitra', np: 'चैत्र', code: 'BS-12' },
  { id: '01', fyMonth: 10, fyLabel: '10', en: 'Baishakh', np: 'वैशाख', code: 'BS-01' },
  { id: '02', fyMonth: 11, fyLabel: '11', en: 'Jestha', np: 'ज्येष्ठ', code: 'BS-02' },
  { id: '03', fyMonth: 12, fyLabel: '12 (FY End)', en: 'Ashadh', np: 'आषाढ', code: 'BS-03' },
];

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  fiscalYear: 'FY 2083/84',
  effectiveBsYear: 2083,
  singleSlabs: [
    { id: '1', label: 'Slab 1 (Social Security Tax)', limitSingle: 1000000, limitMarried: 1000000, rate: 0.01 },
    { id: '2', label: 'Slab 2 (10% Tax)', limitSingle: 1500000, limitMarried: 1500000, rate: 0.10 },
    { id: '3', label: 'Slab 3 (20% Tax)', limitSingle: 2500000, limitMarried: 2500000, rate: 0.20 },
    { id: '4', label: 'Slab 4 (27% Tax)', limitSingle: 4000000, limitMarried: 4000000, rate: 0.27 },
    { id: '5', label: 'Slab 5 (29% Top Surcharge)', limitSingle: 99999999, limitMarried: 99999999, rate: 0.29 },
  ],
  marriedSlabs: [],
  ssfEmployeeRate: 0.11,
  ssfEmployerRate: 0.20,
  pfNonSsfRate: 0.10,
  healthInsuranceRate: 0.01,
  ssfSlab1SstWaiver: true,
  standardDaysInMonth: 30,
  overtimeMultiplier: 1.5,
  currencySymbol: 'NPR'
};

/**
 * Returns Nepal Fiscal Year string for a given BS Year and BS Month
 * e.g., BS 2083 Shrawan (Month 04) -> "FY 2083/84"
 */
export function getNepalFiscalYear(bsYear: number, monthId: string): string {
  const m = parseInt(monthId, 10);
  if (m >= 4) {
    const nextY = (bsYear + 1).toString().substring(2);
    return `FY ${bsYear}/${nextY}`;
  } else {
    const prevY = bsYear - 1;
    const currY = bsYear.toString().substring(2);
    return `FY ${prevY}/${currY}`;
  }
}

/**
 * Calculates monthly income tax / TDS based on Nepal Inland Revenue Department (IRD) progressive tax slabs
 * and active PayrollConfig settings.
 */
export function calculateTaxAndDeductions(
  monthlyTaxableIncome: number,
  basicSalary: number,
  maritalStatus: 'Single' | 'Married' = 'Single',
  ssfEnrolled: boolean = true,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG
) {
  const ssfRate = ssfEnrolled ? (config.ssfEmployeeRate ?? 0.11) : (config.pfNonSsfRate ?? 0.10);
  const socialSecurity = Math.round(basicSalary * ssfRate);
  const healthInsurance = Math.round(basicSalary * (config.healthInsuranceRate ?? 0.01));

  const annualized = Math.max(0, (monthlyTaxableIncome - socialSecurity) * 12);

  const slabs = (config.singleSlabs && config.singleSlabs.length > 0) ? config.singleSlabs : DEFAULT_PAYROLL_CONFIG.singleSlabs;
  let annualTax = 0;
  let prevLimit = 0;

  for (let i = 0; i < slabs.length; i++) {
    const slab = slabs[i];
    const currentLimit = maritalStatus === 'Married' ? slab.limitMarried : slab.limitSingle;
    let rate = slab.rate;

    // First slab SST waiver check for SSF enrolled employees
    if (i === 0 && ssfEnrolled && config.ssfSlab1SstWaiver) {
      rate = 0.0;
    }

    if (annualized > prevLimit) {
      const taxableInThisSlab = Math.min(annualized - prevLimit, currentLimit - prevLimit);
      annualTax += taxableInThisSlab * rate;
    } else {
      break;
    }
    prevLimit = currentLimit;
  }

  const monthlyTDS = Math.max(0, Math.round(annualTax / 12));
  const otherDeductions = 0;
  const totalDeductions = monthlyTDS + socialSecurity + healthInsurance + otherDeductions;

  return {
    incomeTaxTDS: monthlyTDS,
    socialSecurity,
    healthInsurance,
    otherDeductions,
    totalDeductions
  };
}

/**
 * Calculates a complete Payroll Run for a specified month using active PayrollConfig
 */
export function generatePayrollRun(
  month: string, // "YYYY-MM" or "BS 2083-04"
  employees: Employee[],
  processedAttendance: ProcessedAttendance[],
  overtimeRecords: OvertimeRecord[],
  createdBy: string = 'System Admin',
  bsMonthDetails?: { bsYear: number; monthObj: typeof NEPALI_MONTHS[0] },
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG
): PayrollRun {
  let year = 2026;
  let monthIdx = 7;
  let nepaliMonthStr = 'Shrawan (श्रावण)';
  let fiscalYearStr = config.fiscalYear || 'FY 2083/84';

  if (bsMonthDetails) {
    const { bsYear, monthObj } = bsMonthDetails;
    nepaliMonthStr = `BS ${bsYear} - ${monthObj.en} (${monthObj.np})`;
    fiscalYearStr = getNepalFiscalYear(bsYear, monthObj.id);
  } else {
    const [yearStr, monthStr] = month.split('-');
    year = parseInt(yearStr, 10);
    monthIdx = parseInt(monthStr, 10) - 1;
    const monthObj = NEPALI_MONTHS[monthIdx % 12];
    nepaliMonthStr = `BS ${config.effectiveBsYear || 2083} - ${monthObj.en} (${monthObj.np})`;
    fiscalYearStr = getNepalFiscalYear(config.effectiveBsYear || 2083, monthObj.id);
  }

  const daysInMonth = config.standardDaysInMonth || 30;
  const monthName = `${nepaliMonthStr} (${fiscalYearStr})`;

  const monthAttendance = processedAttendance.filter(a => a.date.startsWith(month.substring(0, 7)));
  const monthOvertime = overtimeRecords.filter(o => o.date.startsWith(month.substring(0, 7)) && o.status === 'Approved');

  const activeEmployees = employees.filter(e => e.status !== 'Inactive');
  const nepalBanks = ['Nabil Bank', 'Global IME Bank', 'NIC Asia Bank', 'Everest Bank', 'Nepal Investment Mega Bank', 'Rastriya Banijya Bank'];

  const records: PayrollRecord[] = activeEmployees.map((emp, index) => {
    const monthlyBasic = emp.basicSalary || (emp.designation?.toLowerCase().includes('manager') ? 65000 : emp.designation?.toLowerCase().includes('lead') ? 50000 : 35000);
    const monthlyAllowances = emp.allowances || Math.round(monthlyBasic * 0.25);
    const maritalStatus = emp.maritalStatus || (index % 3 === 0 ? 'Married' : 'Single');
    const ssfEnrolled = emp.ssfEnrolled !== undefined ? emp.ssfEnrolled : true;

    const empLogs = monthAttendance.filter(a => a.employeeId === emp.id);
    const empOt = monthOvertime.filter(o => o.employeeId === emp.id);

    const presentDays = empLogs.filter(a => a.status === 'Present' || a.status === 'On Time' || a.status === 'Late' || a.status === 'Overtime' || a.status === 'SPF').length;
    const weeklyOffs = empLogs.filter(a => a.status === 'Weekly Off' || a.status === 'PWO').length;
    const paidLeaveDays = 0;
    const absentDays = Math.max(0, daysInMonth - (presentDays + weeklyOffs + paidLeaveDays));

    const payableDays = Math.min(daysInMonth, presentDays > 0 ? presentDays + weeklyOffs + paidLeaveDays : daysInMonth);
    const payRatio = daysInMonth > 0 ? payableDays / daysInMonth : 1;

    const earnedBasicSalary = Math.round(monthlyBasic * payRatio);
    const earnedAllowances = Math.round(monthlyAllowances * payRatio);

    const overtimeHours = empOt.reduce((sum, o) => sum + (o.hours || 0), 0);
    const hourlyRate = (monthlyBasic / (26 * 8));
    const otMult = config.overtimeMultiplier || 1.5;
    const overtimePay = Math.round(overtimeHours * hourlyRate * otMult);
    const bonus = 0;

    const grossSalary = earnedBasicSalary + earnedAllowances + overtimePay + bonus;

    const { incomeTaxTDS, socialSecurity, healthInsurance, otherDeductions, totalDeductions } = calculateTaxAndDeductions(
      grossSalary,
      earnedBasicSalary,
      maritalStatus,
      ssfEnrolled,
      config
    );

    const netSalary = Math.max(0, grossSalary - totalDeductions);
    const assignedBank = nepalBanks[index % nepalBanks.length];

    return {
      id: `pr_${emp.id}_${month}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      panNumber: emp.panNumber || `1${Math.floor(10000000 + Math.random() * 90000000)}`,
      bankName: emp.bankName || assignedBank,
      accountNumber: emp.accountNumber || `0${Math.floor(1000000000000 + Math.random() * 9000000000000)}`,
      ifscCode: emp.ifscCode || `${assignedBank.substring(0, 4).toUpperCase()}NPKT`,
      maritalStatus,
      ssfEnrolled,
      
      totalDaysInMonth: daysInMonth,
      presentDays: presentDays > 0 ? presentDays : 26,
      absentDays,
      paidLeaveDays,
      payableDays,
      overtimeHours,
      
      monthlyBasicSalary: monthlyBasic,
      monthlyAllowances: monthlyAllowances,
      earnedBasicSalary,
      earnedAllowances,
      overtimeRate: Math.round(hourlyRate * otMult),
      overtimePay,
      bonus,
      grossSalary,
      
      taxableIncome: Math.max(0, grossSalary - socialSecurity),
      incomeTaxTDS,
      socialSecurity,
      healthInsurance,
      otherDeductions,
      totalDeductions,
      
      netSalary,
      
      disbursementStatus: 'Pending',
      remarks: `Calculated under Nepal IRD ${fiscalYearStr} TDS (${maritalStatus}) & SSF (${ssfEnrolled ? (config.ssfEmployeeRate * 100) + '%' : (config.pfNonSsfRate * 100) + '%'}) regulations`
    };
  });

  const totalGrossSalary = records.reduce((s, r) => s + r.grossSalary, 0);
  const totalTaxTDS = records.reduce((s, r) => s + r.incomeTaxTDS, 0);
  const totalSocialSecurity = records.reduce((s, r) => s + r.socialSecurity, 0);
  const totalDeductions = records.reduce((s, r) => s + r.totalDeductions, 0);
  const totalNetSalary = records.reduce((s, r) => s + r.netSalary, 0);

  return {
    id: `run_${month}_${Math.random().toString(36).substring(2, 7)}`,
    month,
    year,
    monthName,
    nepaliMonth: nepaliMonthStr,
    fiscalYear: fiscalYearStr,
    status: 'Draft',
    totalEmployees: records.length,
    totalGrossSalary,
    totalTaxTDS,
    totalSocialSecurity,
    totalDeductions,
    totalNetSalary,
    createdAt: new Date().toISOString(),
    createdBy,
    records
  };
}

