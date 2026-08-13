import type { Employee, ProcessedAttendance, OvertimeRecord, PayrollRecord, PayrollRun, PayrollConfig, TaxSlabDetail } from '../types';

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
    { id: '1', label: 'Slab 1 (1% SST)', limitSingle: 1000000, limitMarried: 1000000, rate: 0.01 },
    { id: '2', label: 'Slab 2 (10% Tax)', limitSingle: 1500000, limitMarried: 1500000, rate: 0.10 },
    { id: '3', label: 'Slab 3 (20% Tax)', limitSingle: 2500000, limitMarried: 2500000, rate: 0.20 },
    { id: '4', label: 'Slab 4 (27% Tax)', limitSingle: 4000000, limitMarried: 4000000, rate: 0.27 },
    { id: '5', label: 'Slab 5 (29% Tax)', limitSingle: 999999999, limitMarried: 999999999, rate: 0.29 },
  ],
  marriedSlabs: [],
  ssfEmployeeRate: 0.11,
  ssfEmployerRate: 0.20,
  pfNonSsfRate: 0.10,
  healthInsuranceRate: 0.01,
  ssfSlab1SstWaiver: true,
  standardDaysInMonth: 31,
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

export interface PayrollPeriodInfo {
  fiscalYear: string;
  monthName: string;
  nepaliMonthStr: string;
  startDate: string;
  endDate: string;
  totalDays: number;
}

/**
 * Centralized payroll period engine with exact Nepal BS to AD Gregorian date mappings.
 * Shrawan 2083 default: 2026-07-17 to 2026-08-16 (31 days).
 */
export function getPayrollPeriod(
  bsYear: number = 2083,
  monthId: string = '04',
  customStartDate?: string,
  customEndDate?: string
): PayrollPeriodInfo {
  const monthObj = FY_NEPALI_MONTHS.find(m => m.id === monthId) || FY_NEPALI_MONTHS[0];
  const fiscalYear = getNepalFiscalYear(bsYear, monthId);
  const nepaliMonthStr = `BS ${bsYear} - ${monthObj.en} (${monthObj.np})`;
  const monthName = `${nepaliMonthStr} (${fiscalYear})`;

  let startDate = customStartDate;
  let endDate = customEndDate;

  if (!startDate || !endDate) {
    const adYear = bsYear - 57; // BS 2083 -> AD 2026
    if (monthId === '04') { // Shrawan
      startDate = `${adYear}-07-17`;
      endDate = `${adYear}-08-16`;
    } else if (monthId === '05') { // Bhadra
      startDate = `${adYear}-08-17`;
      endDate = `${adYear}-09-16`;
    } else if (monthId === '06') { // Ashwin
      startDate = `${adYear}-09-17`;
      endDate = `${adYear}-10-17`;
    } else if (monthId === '07') { // Kartik
      startDate = `${adYear}-10-18`;
      endDate = `${adYear}-11-16`;
    } else if (monthId === '08') { // Mangsir
      startDate = `${adYear}-11-17`;
      endDate = `${adYear}-12-15`;
    } else if (monthId === '09') { // Poush
      startDate = `${adYear}-12-16`;
      endDate = `${adYear + 1}-01-14`;
    } else if (monthId === '10') { // Magh
      startDate = `${adYear + 1}-01-15`;
      endDate = `${adYear + 1}-02-12`;
    } else if (monthId === '11') { // Falgun
      startDate = `${adYear + 1}-02-13`;
      endDate = `${adYear + 1}-03-14`;
    } else if (monthId === '12') { // Chaitra
      startDate = `${adYear + 1}-03-15`;
      endDate = `${adYear + 1}-04-13`;
    } else if (monthId === '01') { // Baishakh
      startDate = `${adYear}-04-14`;
      endDate = `${adYear}-05-14`;
    } else if (monthId === '02') { // Jestha
      startDate = `${adYear}-05-15`;
      endDate = `${adYear}-06-14`;
    } else if (monthId === '03') { // Ashadh
      startDate = `${adYear}-06-15`;
      endDate = `${adYear}-07-16`;
    } else {
      startDate = `${adYear}-07-17`;
      endDate = `${adYear}-08-16`;
    }
  }

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const totalDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

  return {
    fiscalYear,
    monthName,
    nepaliMonthStr,
    startDate,
    endDate,
    totalDays
  };
}

/**
 * Calculates monthly income tax / TDS based on Nepal Inland Revenue Department (IRD) FY 2083/84 regulations
 */
export function calculateTaxAndDeductions(
  monthlyTaxableIncome: number,
  basicSalary: number,
  maritalStatus: 'Single' | 'Married' = 'Single',
  ssfEnrolled: boolean = true,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG,
  taxProfile?: any
) {
  // 1. Calculate Statutory Deductions (SSF / PF)
  const ssfRate = ssfEnrolled ? (config.ssfEmployeeRate ?? 0.11) : (config.pfNonSsfRate ?? 0.10);
  const socialSecurity = Math.round(basicSalary * ssfRate);
  
  // 2. Annualize Gross Taxable Income
  const monthlyGrossTaxable = Math.max(0, monthlyTaxableIncome);
  const annualizedGrossIncome = monthlyGrossTaxable * 12;
  const annualizedSSF = socialSecurity * 12;

  // 3. Deductions & Exemptions (from Tax Profile)
  // Retirement contribution (lower of 5,00,000 or 1/3 of assessable income)
  let retirementDeduction = 0;
  if (taxProfile?.retirementFundContributor || ssfEnrolled) {
     const oneThird = Math.round(annualizedGrossIncome / 3);
     retirementDeduction = Math.min(500000, oneThird, annualizedSSF); // Limit to what's actually contributed or max
  }

  // Insurance Deductions
  const lifeInsurance = Math.min(40000, taxProfile?.lifeInsurancePremium || 0);
  const healthInsuranceDeduction = Math.min(20000, taxProfile?.healthInsurancePremium || 0);
  const buildingInsurance = Math.min(10000, taxProfile?.privateBuildingInsurance || 0);
  const educationFee = Math.min(25000, (taxProfile?.educationFee || 0) * 0.25);
  
  // Remote Area
  let remoteAreaDeduction = 0;
  switch(taxProfile?.remoteAreaCategory) {
    case 'A': remoteAreaDeduction = 50000; break;
    case 'B': remoteAreaDeduction = 40000; break;
    case 'C': remoteAreaDeduction = 30000; break;
    case 'D': remoteAreaDeduction = 20000; break;
    case 'E': remoteAreaDeduction = 10000; break;
  }
  
  // Basic Exemptions (already handled by slabs, except Disability)
  // Disability Benefit: Additional 50% of applicable exemption limit (Slab 1)
  const baseExemptionLimit = maritalStatus === 'Married' ? 1000000 : 1000000; // From slabs
  const disabilityDeduction = taxProfile?.disabilityStatus ? (baseExemptionLimit * 0.5) : 0;
  
  const totalDeductionsExemptions = retirementDeduction + lifeInsurance + healthInsuranceDeduction + buildingInsurance + educationFee + remoteAreaDeduction + disabilityDeduction + (taxProfile?.otherEligibleDeductions || 0);
  
  // 4. Annual Taxable Income
  const annualizedTaxableIncome = Math.max(0, annualizedGrossIncome - totalDeductionsExemptions);

  // 5. Progressive Tax Slabs
  const slabConfigs = config.singleSlabs || [];
  
  let annualTaxLiability = 0;
  let previousLimit = 0;
  const taxSlabBreakdown: any[] = [];
  
  // 1% SST Waiver check
  const waiveFirstSlab = ssfEnrolled || taxProfile?.incomeFromPension || taxProfile?.retirementFundContributor;
  
  for (let i = 0; i < slabConfigs.length; i++) {
    const slab = slabConfigs[i];
    const isFirstSlab = i === 0;
    const applicableRate = (isFirstSlab && waiveFirstSlab) ? 0 : slab.rate;
    
    if (annualizedTaxableIncome > previousLimit) {
      const taxableInSlab = Math.min(annualizedTaxableIncome - previousLimit, slab.limitSingle - previousLimit);
      const taxAmount = Math.round(taxableInSlab * applicableRate);
      annualTaxLiability += taxAmount;
      taxSlabBreakdown.push({
        slabName: slab.label,
        taxableAmount: taxableInSlab,
        rate: applicableRate,
        taxAmount,
        minAmount: previousLimit,
        maxAmount: slab.limitSingle,
        taxableAmountInSlab: taxableInSlab
      });
      previousLimit = slab.limitSingle;
    } else {
      taxSlabBreakdown.push({
        slabName: slab.label,
        taxableAmount: 0,
        rate: applicableRate,
        taxAmount: 0,
        minAmount: previousLimit,
        maxAmount: slab.limitSingle,
        taxableAmountInSlab: 0
      });
      previousLimit = slab.limitSingle;
    }
  }
  
  // 6. Medical Treatment Adjustment (Max 750 or 15% of actual)
  const medicalAdjustment = Math.min(750, (taxProfile?.approvedMedicalExpense || 0) * 0.15);
  annualTaxLiability = Math.max(0, annualTaxLiability - medicalAdjustment);

  // 7. Female Rebate (10% rebate on tax payable for resident natural person earning remuneration only)
  let femaleRebate = 0;
  if (taxProfile?.femaleRebateEligible && taxProfile?.taxpayerType !== 'Non-Resident') {
    femaleRebate = Math.round(annualTaxLiability * 0.10);
    annualTaxLiability = Math.max(0, annualTaxLiability - femaleRebate);
  }

  // 8. Previous Employer TDS & Remaining Months
  const prevTDS = taxProfile?.previousEmployerTDS || 0;
  let remainingTax = Math.max(0, annualTaxLiability - prevTDS);
  
  // Current month TDS (simplified, 12 months evenly, in reality should be based on remaining months in FY)
  // To strictly follow remaining months, we'd need current FY month index.
  // For now, divide remaining tax by 12 (or ideally 12)
  const incomeTaxTDS = Math.round(annualTaxLiability / 12);
  
  // Just use basic health insurance if not provided
  const healthInsurance = taxProfile?.healthInsurancePremium ? Math.round(taxProfile.healthInsurancePremium / 12) : Math.round(basicSalary * (config.healthInsuranceRate ?? 0.01));
  const otherDeductions = 0;
  const totalDeductions = socialSecurity + incomeTaxTDS + healthInsurance + otherDeductions;

  return {
    incomeTaxTDS,
    socialSecurity,
    healthInsurance,
    otherDeductions,
    totalDeductions,
    annualizedTaxableIncome,
    annualTaxLiability,
    taxSlabBreakdown
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDeterministicBank(empId: string): string {
  const nepalBanks = ['Nabil Bank', 'Global IME Bank', 'NIC Asia Bank', 'Everest Bank', 'Nepal Investment Mega Bank', 'Rastriya Banijya Bank'];
  const h = hashString(empId);
  return nepalBanks[h % nepalBanks.length];
}

function getDeterministicPan(empId: string): string {
  const h = hashString(empId);
  return (100000000 + (h % 899999999)).toString();
}

function getDeterministicAccount(empId: string): string {
  const h = hashString(empId);
  return '0100' + (100000000 + (h % 899999999)).toString();
}

/**
 * Calculates a fully deterministic Payroll Run for a specified month & date range.
 */
export function generatePayrollRun(
  month: string, // e.g. "BS-2083-04" or "2083-04"
  employees: Employee[],
  processedAttendance: ProcessedAttendance[],
  overtimeRecords: OvertimeRecord[],
  createdBy: string = 'System Admin',
  bsMonthDetails?: { bsYear: number; monthObj: typeof NEPALI_MONTHS[0] },
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG,
  customDateRange?: { startDate?: string; endDate?: string },
  existingRunId?: string
): PayrollRun {
  const bsYear = bsMonthDetails?.bsYear || config.effectiveBsYear || 2083;
  const monthId = bsMonthDetails?.monthObj.id || month.replace(/^BS[- ]?/i, '').split('-')[1] || '04';

  const period = getPayrollPeriod(bsYear, monthId, customDateRange?.startDate, customDateRange?.endDate);
  const daysInMonth = period.totalDays;

  // Filter attendance strictly within date range
  const monthAttendance = processedAttendance.filter(a => {
    if (!a || !a.date) return false;
    return a.date >= period.startDate && a.date <= period.endDate;
  });

  const monthOvertime = overtimeRecords.filter(o => {
    if (!o || !o.date || o.status !== 'Approved') return false;
    return o.date >= period.startDate && o.date <= period.endDate;
  });

  const activeEmployees = employees.filter(e => e.status !== 'Inactive');

  const records: PayrollRecord[] = activeEmployees.map((emp) => {
    const monthlyBasic = emp.basicSalary;
    if (!monthlyBasic) {
      throw new Error(`Payroll calculation failed: Employee ID ${emp.id} (${emp.name}) has missing Basic Salary.`);
    }
    const monthlyAllowances = emp.allowances || emp.dearnessAllowance || emp.otherAllowance || 0;
    
    // Explicit tax status from Employee object (no random or index logic)
    const taxStatus: 'Single' | 'Married' = emp.maritalStatus || 'Single';
    const ssfEnrolled = emp.ssfEnrolled !== undefined ? emp.ssfEnrolled : true;

    const empLogs = monthAttendance.filter(a => a.employeeId === emp.id);
    const empOt = monthOvertime.filter(o => o.employeeId === emp.id);

    const presentDays = empLogs.filter(a => 
      a.status === 'Present' || 
      a.status === 'On Time' || 
      a.status === 'Late' || 
      a.status === 'Overtime' || 
      a.status === 'SPF' ||
      a.status === 'Forced' ||
      a.status === 'On Duty' ||
      a.status === 'Regularized'
    ).length;
    const halfDays = empLogs.filter(a => a.status === 'Half Day').length;
    const paidLeaveDays = empLogs.filter(a => a.status === 'Paid Leave' || a.status === 'Leave' || a.status === 'On Leave').length;
    const weeklyOffs = empLogs.filter(a => a.status === 'Weekly Off' || a.status === 'PWO').length;

    const creditedPresentDays = presentDays + (0.5 * halfDays);
    const totalCalculatedDays = creditedPresentDays + weeklyOffs + paidLeaveDays;

    let payableDays = daysInMonth;
    if (monthAttendance.length > 0) {
      if (empLogs.length > 0) {
        payableDays = Math.min(daysInMonth, Math.max(0, totalCalculatedDays));
      } else {
        // Attendance exists for the period but this employee has no records -> 0 days
        payableDays = 0;
      }
    } else {
      // Default full month if no attendance uploaded yet for period
      payableDays = daysInMonth;
    }

    const absentDays = Math.max(0, daysInMonth - payableDays);
    const payRatio = daysInMonth > 0 ? payableDays / daysInMonth : 1;

    const earnedBasicSalary = Math.round(monthlyBasic * payRatio);
    const earnedAllowances = Math.round(monthlyAllowances * payRatio);

    const overtimeHours = empOt.reduce((sum, o) => sum + (o.hours || 0), 0);
    const hourlyRate = (monthlyBasic / (26 * 8));
    const otMult = config.overtimeMultiplier || 1.5;
    const overtimePay = Math.round(overtimeHours * hourlyRate * otMult);
    const bonus = 0;

    const grossSalary = earnedBasicSalary + earnedAllowances + overtimePay + bonus;

    const { 
      incomeTaxTDS, 
      socialSecurity, 
      healthInsurance, 
      otherDeductions, 
      totalDeductions,
      annualizedTaxableIncome,
      annualTaxLiability,
      taxSlabBreakdown
    } = calculateTaxAndDeductions(grossSalary, earnedBasicSalary, taxStatus, ssfEnrolled, config, emp.taxProfile);

    const netSalary = Math.max(0, grossSalary - totalDeductions);
    const employerSSF = ssfEnrolled ? Math.round(earnedBasicSalary * (config.ssfEmployerRate ?? 0.20)) : 0;
    const monthlyCTC = grossSalary + employerSSF;
    const bankName = emp.bankName || '';

    return {
      id: `pr_${emp.id}_${month.replace(/[^a-zA-Z0-9]/g, '_')}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      panNumber: emp.panNumber || '',
      bankName: bankName,
      accountNumber: emp.accountNumber || '',
      ifscCode: emp.ifscCode || '',
      maritalStatus: taxStatus,
      taxStatus,
      ssfEnrolled,
      
      totalDaysInMonth: daysInMonth,
      presentDays: Math.round(creditedPresentDays),
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
      annualizedTaxableIncome,
      annualTaxLiability,
      taxSlabBreakdown,
      incomeTaxTDS,
      socialSecurity,
      healthInsurance,
      otherDeductions,
      totalDeductions,
      
      netSalary,
      employerSSF,
      monthlyCTC,
      
      disbursementStatus: 'Pending',
      remarks: `Calculated under Nepal IRD ${period.fiscalYear} TDS (${taxStatus}) & SSF (${ssfEnrolled ? '11%' : '10%'}) regulations`
    };
  });

  const totalGrossSalary = records.reduce((s, r) => s + r.grossSalary, 0);
  const totalTaxTDS = records.reduce((s, r) => s + r.incomeTaxTDS, 0);
  const totalSocialSecurity = records.reduce((s, r) => s + r.socialSecurity, 0);
  const totalEmployerSSF = records.reduce((s, r) => s + (r.employerSSF || 0), 0);
  const totalCTC = records.reduce((s, r) => s + (r.monthlyCTC || r.grossSalary), 0);
  const totalDeductions = records.reduce((s, r) => s + r.totalDeductions, 0);
  const totalNetSalary = records.reduce((s, r) => s + r.netSalary, 0);

  const runId = existingRunId || `run_${month.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return {
    id: runId,
    month,
    year: bsYear - 57,
    monthName: period.monthName,
    nepaliMonth: period.nepaliMonthStr,
    fiscalYear: period.fiscalYear,
    startDate: period.startDate,
    endDate: period.endDate,
    status: 'Draft',
    totalEmployees: records.length,
    totalGrossSalary,
    totalTaxTDS,
    totalSocialSecurity,
    totalEmployerSSF,
    totalCTC,
    totalDeductions,
    totalNetSalary,
    createdAt: new Date().toISOString(),
    createdBy,
    records
  };
}
