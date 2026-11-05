import type { 
  Employee, 
  ProcessedAttendance, 
  OvertimeRecord, 
  PayrollRecord, 
  PayrollRun, 
  PayrollConfig, 
  TaxSlabConfig, 
  TaxRuleItem, 
  DeductionRuleItem, 
  SalaryComponentConfig, 
  TaxSlabDetail 
} from '../types';

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

export const DEFAULT_TAX_SLABS_FY2083: TaxSlabConfig[] = [
  {
    id: 'slab_1',
    label: 'Slab 1 (1% Social Security Tax)',
    limitSingle: 1000000,
    limitMarried: 1000000,
    rate: 0.01,
    taxType: 'Social Security Tax',
    cumulativeCheckpoint: 10000,
    description: 'First NPR 10,00,000 @ 1% (Social Security Tax)'
  },
  {
    id: 'slab_2',
    label: 'Slab 2 (10% Income Tax)',
    limitSingle: 1500000,
    limitMarried: 1500000,
    rate: 0.10,
    taxType: 'Income Tax',
    cumulativeCheckpoint: 60000,
    description: 'NPR 10,00,001 to 15,00,000 @ 10%'
  },
  {
    id: 'slab_3',
    label: 'Slab 3 (20% Income Tax)',
    limitSingle: 2500000,
    limitMarried: 2500000,
    rate: 0.20,
    taxType: 'Income Tax',
    cumulativeCheckpoint: 260000,
    description: 'NPR 15,00,001 to 25,00,000 @ 20%'
  },
  {
    id: 'slab_4',
    label: 'Slab 4 (27% Income Tax)',
    limitSingle: 4000000,
    limitMarried: 4000000,
    rate: 0.27,
    taxType: 'Income Tax',
    cumulativeCheckpoint: 665000,
    description: 'NPR 25,00,001 to 40,00,000 @ 27%'
  },
  {
    id: 'slab_5',
    label: 'Slab 5 (29% Income Tax - Top Band)',
    limitSingle: 999999999,
    limitMarried: 999999999,
    rate: 0.29,
    taxType: 'Income Tax',
    cumulativeCheckpoint: 665000,
    description: 'Above NPR 40,00,000 @ 29%'
  }
];

export const DEFAULT_TAX_RULES_MASTER: TaxRuleItem[] = [
  {
    id: 'tr_2083_01',
    fiscalYear: 'FY 2083/84',
    taxpayerType: 'RESIDENT_INDIVIDUAL',
    maritalStatusApplicable: false,
    slabOrder: 1,
    label: 'First Band (Social Security Tax)',
    lowerLimit: 0,
    upperLimit: 1000000,
    rate: 0.01,
    taxType: 'Social Security Tax',
    cumulativeTaxCheckpoint: 10000,
    effectiveFrom: '2083-04-01',
    active: true,
    sourceReference: 'Nepal Finance Act 2083 / IRD Directive'
  },
  {
    id: 'tr_2083_02',
    fiscalYear: 'FY 2083/84',
    taxpayerType: 'RESIDENT_INDIVIDUAL',
    maritalStatusApplicable: false,
    slabOrder: 2,
    label: 'Second Band (10% Tax)',
    lowerLimit: 1000001,
    upperLimit: 1500000,
    rate: 0.10,
    taxType: 'Income Tax',
    cumulativeTaxCheckpoint: 60000,
    effectiveFrom: '2083-04-01',
    active: true,
    sourceReference: 'Nepal Finance Act 2083 / IRD Directive'
  },
  {
    id: 'tr_2083_03',
    fiscalYear: 'FY 2083/84',
    taxpayerType: 'RESIDENT_INDIVIDUAL',
    maritalStatusApplicable: false,
    slabOrder: 3,
    label: 'Third Band (20% Tax)',
    lowerLimit: 1500001,
    upperLimit: 2500000,
    rate: 0.20,
    taxType: 'Income Tax',
    cumulativeTaxCheckpoint: 260000,
    effectiveFrom: '2083-04-01',
    active: true,
    sourceReference: 'Nepal Finance Act 2083 / IRD Directive'
  },
  {
    id: 'tr_2083_04',
    fiscalYear: 'FY 2083/84',
    taxpayerType: 'RESIDENT_INDIVIDUAL',
    maritalStatusApplicable: false,
    slabOrder: 4,
    label: 'Fourth Band (27% Tax)',
    lowerLimit: 2500001,
    upperLimit: 4000000,
    rate: 0.27,
    taxType: 'Income Tax',
    cumulativeTaxCheckpoint: 665000,
    effectiveFrom: '2083-04-01',
    active: true,
    sourceReference: 'Nepal Finance Act 2083 / IRD Directive'
  },
  {
    id: 'tr_2083_05',
    fiscalYear: 'FY 2083/84',
    taxpayerType: 'RESIDENT_INDIVIDUAL',
    maritalStatusApplicable: false,
    slabOrder: 5,
    label: 'Fifth Band (29% Top Band)',
    lowerLimit: 4000001,
    upperLimit: 999999999,
    rate: 0.29,
    taxType: 'Income Tax',
    cumulativeTaxCheckpoint: 665000,
    effectiveFrom: '2083-04-01',
    active: true,
    sourceReference: 'Nepal Finance Act 2083 / IRD Directive'
  }
];

export const DEFAULT_DEDUCTION_RULES: DeductionRuleItem[] = [
  {
    id: 'ded_ssf_epf_cit',
    name: 'Approved Retirement Contribution (SSF / EPF / CIT)',
    code: 'RETIREMENT_CAP',
    type: 'RETIREMENT_FUND',
    annualLimit: 500000,
    incomePercentageCap: 0.33333333, // 1/3 of Assessable Income
    eligible: true,
    fiscalYear: 'FY 2083/84',
    effectiveDate: '2083-04-01',
    active: true,
    description: 'Lower of actual deposit, NPR 5,00,000, or 1/3 of total assessable employment income'
  },
  {
    id: 'ded_life_insurance',
    name: 'Life Insurance Premium Exemption',
    code: 'LIFE_INSURANCE',
    type: 'INSURANCE',
    annualLimit: 40000,
    eligible: true,
    fiscalYear: 'FY 2083/84',
    effectiveDate: '2083-04-01',
    active: true,
    description: 'Actual annual premium paid up to a maximum statutory limit of NPR 40,000'
  },
  {
    id: 'ded_health_insurance',
    name: 'Medical / Health Insurance Exemption',
    code: 'HEALTH_INSURANCE',
    type: 'INSURANCE',
    annualLimit: 20000,
    eligible: true,
    fiscalYear: 'FY 2083/84',
    effectiveDate: '2083-04-01',
    active: true,
    description: 'Actual annual health insurance premium paid up to a maximum statutory limit of NPR 20,000'
  },
  {
    id: 'ded_building_insurance',
    name: 'Private Residential Building Insurance',
    code: 'BUILDING_INSURANCE',
    type: 'INSURANCE',
    annualLimit: 10000,
    eligible: true,
    fiscalYear: 'FY 2083/84',
    effectiveDate: '2083-04-01',
    active: true,
    description: 'Actual premium paid for residential house insurance up to NPR 10,000'
  },
  {
    id: 'ded_remote_area',
    name: 'Remote Area Allowance (Category A-E)',
    code: 'REMOTE_AREA',
    type: 'REMOTE_AREA',
    annualLimit: 50000,
    eligible: true,
    fiscalYear: 'FY 2083/84',
    effectiveDate: '2083-04-01',
    active: true,
    description: 'Category A: 50,000, Cat B: 40,000, Cat C: 30,000, Cat D: 20,000, Cat E: 10,000'
  },
  {
    id: 'ded_female_rebate',
    name: 'Female Employee Tax Rebate (10% on tax payable)',
    code: 'FEMALE_REBATE',
    type: 'REBATE',
    annualLimit: 0,
    eligible: false,
    fiscalYear: 'FY 2083/84',
    effectiveDate: '2083-04-01',
    active: false,
    description: '10% tax rebate on net annual tax liability for eligible female resident individuals (disabled by default in FY 2083/84 unified schedule)'
  },
  {
    id: 'ded_disability',
    name: 'Disability Allowance (50% First Slab Expansion)',
    code: 'DISABILITY_BENEFIT',
    type: 'OTHER',
    annualLimit: 500000,
    eligible: true,
    fiscalYear: 'FY 2083/84',
    effectiveDate: '2083-04-01',
    active: true,
    description: 'Resident individuals with qualifying disability receive 50% expansion on first-slab threshold (NPR 5,00,000 additional exemption)'
  }
];

export const DEFAULT_SALARY_COMPONENTS: SalaryComponentConfig[] = [
  {
    id: 'comp_basic',
    name: 'Basic Salary',
    code: 'BASIC',
    type: 'Earning',
    taxable: true,
    ssfApplicable: true,
    ctcApplicable: true,
    description: 'Fixed core monthly basic pay (Wage base for 11% employee and 20% employer SSF)'
  },
  {
    id: 'comp_da',
    name: 'Dearness Allowance',
    code: 'DA',
    type: 'Earning',
    taxable: true,
    ssfApplicable: false,
    ctcApplicable: true,
    description: 'Monthly cost of living allowance (Taxable, excluded from SSF wage base)'
  },
  {
    id: 'comp_other_all',
    name: 'Other Allowance',
    code: 'OTHER_ALLOWANCE',
    type: 'Earning',
    taxable: true,
    ssfApplicable: false,
    ctcApplicable: true,
    description: 'Special, conveyance, communication, and executive allowances (Taxable)'
  },
  {
    id: 'comp_ot',
    name: 'Overtime Pay',
    code: 'OVERTIME',
    type: 'Earning',
    taxable: true,
    ssfApplicable: false,
    ctcApplicable: true,
    description: 'Earned overtime calculated as (Basic / (26*8)) * OT Hours * OT Multiplier'
  },
  {
    id: 'comp_bonus',
    name: 'Festival / Dashain Bonus',
    code: 'BONUS',
    type: 'Earning',
    taxable: true,
    ssfApplicable: false,
    ctcApplicable: true,
    description: 'Annual Dashain/Tihar festival or performance bonus (Taxable employment income)'
  },
  {
    id: 'comp_empr_ssf',
    name: 'Employer SSF Contribution (20%)',
    code: 'EMPLOYER_SSF',
    type: 'EmployerCost',
    taxable: false,
    ssfApplicable: false,
    ctcApplicable: true,
    description: 'Statutory 20% employer contribution directly added to Monthly Cost-to-Company (CTC)'
  },
  {
    id: 'comp_emp_ssf',
    name: 'Employee SSF Contribution (11%)',
    code: 'EMPLOYEE_SSF',
    type: 'Deduction',
    taxable: false,
    ssfApplicable: false,
    ctcApplicable: false,
    description: 'Statutory 11% employee contribution deducted from Gross Salary to compute Net Pay'
  }
];

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  fiscalYear: 'FY 2083/84',
  gregorianYear: '2026/27',
  effectiveBsYear: 2083,
  effectiveFrom: '2083-04-01',
  taxpayerType: 'RESIDENT_INDIVIDUAL',
  maritalStatusApplicable: false, // Unified slabs for FY 2083/84
  singleSlabs: DEFAULT_TAX_SLABS_FY2083,
  marriedSlabs: [],
  taxRules: DEFAULT_TAX_RULES_MASTER,
  
  // SSF and Statutory Rates
  ssfEmployeeRate: 0.11, // 11% of Basic Salary
  ssfEmployerRate: 0.20, // 20% of Basic Salary
  pfNonSsfRate: 0.10, // 10% for non-SSF staff
  healthInsuranceRate: 0, // Covered within SSF
  firstBandSstApplicable: true, // 1% Social Security Tax on First 10L
  ssfSlab1SstWaiver: true, // 100% waiver for SSF contributing employees
  
  // Deductions Master
  retirementFundMaxCap: 500000,
  retirementFundIncomeRatioCap: 0.33333333,
  lifeInsuranceAnnualLimit: 40000,
  healthInsuranceAnnualLimit: 20000,
  privateBuildingInsuranceLimit: 10000,
  
  // Rebates & Concessions
  femaleRebateEnabled: false,
  femaleRebateRate: 0.10,
  disabilityFirstSlabExpansionRate: 0.50,
  
  // Period & Working Rules
  standardDaysInMonth: 31,
  overtimeMultiplier: 1.5,
  overtimeCalculationBasis: 'basic',
  currencySymbol: 'NPR',
  
  // Metadata & Audit
  ruleVersion: '1.0',
  sourceReference: 'Nepal Finance Act 2083 & IRD Unified Resident Individual Guidelines',
  lastUpdated: '2026-07-17',
  updatedBy: 'Ministry of Finance / IRD Nepal',
  auditLogs: [
    {
      id: 'audit_init_2083',
      timestamp: '2026-07-17T00:00:00.000Z',
      user: 'Ministry of Finance / Admin',
      fiscalYear: 'FY 2083/84',
      ruleVersion: '1.0',
      changesSummary: 'Initialized unified resident individual tax slabs (1%, 10%, 20%, 27%, 29%) and SSF 31% master configuration for FY 2083/84.',
      reason: 'Statutory Finance Act 2083 compliance'
    }
  ]
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
    if (monthId === '04') { // Shrawan (31 days: July 17 to Aug 16)
      startDate = `${adYear}-07-17`;
      endDate = `${adYear}-08-16`;
    } else if (monthId === '05') { // Bhadra (31 days: Aug 17 to Sep 16)
      startDate = `${adYear}-08-17`;
      endDate = `${adYear}-09-16`;
    } else if (monthId === '06') { // Ashwin (31 days: Sep 17 to Oct 17)
      startDate = `${adYear}-09-17`;
      endDate = `${adYear}-10-17`;
    } else if (monthId === '07') { // Kartik (30 days: Oct 18 to Nov 16)
      startDate = `${adYear}-10-18`;
      endDate = `${adYear}-11-16`;
    } else if (monthId === '08') { // Mangsir (29 days: Nov 17 to Dec 15)
      startDate = `${adYear}-11-17`;
      endDate = `${adYear}-12-15`;
    } else if (monthId === '09') { // Poush (30 days: Dec 16 to Jan 14)
      startDate = `${adYear}-12-16`;
      endDate = `${adYear + 1}-01-14`;
    } else if (monthId === '10') { // Magh (29 days: Jan 15 to Feb 12)
      startDate = `${adYear + 1}-01-15`;
      endDate = `${adYear + 1}-02-12`;
    } else if (monthId === '11') { // Falgun (30 days: Feb 13 to Mar 14)
      startDate = `${adYear + 1}-02-13`;
      endDate = `${adYear + 1}-03-14`;
    } else if (monthId === '12') { // Chaitra (30 days: Mar 15 to Apr 13)
      startDate = `${adYear + 1}-03-15`;
      endDate = `${adYear + 1}-04-13`;
    } else if (monthId === '01') { // Baishakh (31 days: Apr 14 to May 14)
      startDate = `${adYear}-04-14`;
      endDate = `${adYear}-05-14`;
    } else if (monthId === '02') { // Jestha (31 days: May 15 to Jun 14)
      startDate = `${adYear}-05-15`;
      endDate = `${adYear}-06-14`;
    } else if (monthId === '03') { // Ashadh (32 days: Jun 15 to Jul 16)
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
 * Validates tax slab continuity and validity.
 */
export function validateTaxSlabs(slabs: TaxSlabConfig[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!slabs || slabs.length === 0) {
    return { valid: false, errors: ['Tax slabs list cannot be empty.'] };
  }

  let prevLimit = 0;
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    if (s.rate < 0 || s.rate > 1) {
      errors.push(`Slab "${s.label}" has invalid tax rate ${(s.rate * 100).toFixed(1)}%. Rate must be between 0% and 100%.`);
    }
    if (s.limitSingle <= prevLimit) {
      errors.push(`Slab "${s.label}" limit (${s.limitSingle.toLocaleString()}) must be strictly greater than previous slab limit (${prevLimit.toLocaleString()}).`);
    }
    prevLimit = s.limitSingle;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calculates monthly income tax / TDS based on Nepal Inland Revenue Department (IRD) FY 2083/84 regulations.
 * Fully deterministic progressive calculation with SSF 1% SST waiver and unified Single/Married slabs.
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

  // 3. Deductions & Exemptions (from Tax Profile & Configured Master Caps)
  // Retirement contribution (lower of configured cap e.g. 5,00,000, 1/3 of assessable income, and actual contribution)
  const retCap = config.retirementFundMaxCap ?? 500000;
  const retRatio = config.retirementFundIncomeRatioCap ?? (1 / 3);
  let retirementDeduction = 0;
  
  if (taxProfile?.retirementFundContributor || ssfEnrolled) {
     const ratioAmount = Math.round(annualizedGrossIncome * retRatio);
     retirementDeduction = Math.min(retCap, ratioAmount, annualizedSSF);
  }

  // Insurance Deductions (validated against configured master caps)
  const lifeInsCap = config.lifeInsuranceAnnualLimit ?? 40000;
  const healthInsCap = config.healthInsuranceAnnualLimit ?? 20000;
  const buildingInsCap = config.privateBuildingInsuranceLimit ?? 10000;

  const lifeInsurance = Math.min(lifeInsCap, taxProfile?.lifeInsurancePremium || 0);
  const healthInsuranceDeduction = Math.min(healthInsCap, taxProfile?.healthInsurancePremium || 0);
  const buildingInsurance = Math.min(buildingInsCap, taxProfile?.privateBuildingInsurance || 0);
  const educationFee = Math.min(25000, (taxProfile?.educationFee || 0) * 0.25);
  
  // Remote Area Allowances
  let remoteAreaDeduction = 0;
  switch(taxProfile?.remoteAreaCategory) {
    case 'A': remoteAreaDeduction = 50000; break;
    case 'B': remoteAreaDeduction = 40000; break;
    case 'C': remoteAreaDeduction = 30000; break;
    case 'D': remoteAreaDeduction = 20000; break;
    case 'E': remoteAreaDeduction = 10000; break;
    default: remoteAreaDeduction = 0; break;
  }
  
  // Disability Benefit: 50% expansion of first slab limit if qualifying
  const disabilityExpansionRate = config.disabilityFirstSlabExpansionRate ?? 0.50;
  const disabilityDeduction = taxProfile?.disabilityStatus ? (1000000 * disabilityExpansionRate) : 0;
  
  const totalDeductionsExemptions = (
    retirementDeduction + 
    lifeInsurance + 
    healthInsuranceDeduction + 
    buildingInsurance + 
    educationFee + 
    remoteAreaDeduction + 
    disabilityDeduction + 
    (taxProfile?.otherEligibleDeductions || 0)
  );
  
  // 4. Annual Taxable Income
  const annualizedTaxableIncome = Math.max(0, annualizedGrossIncome - totalDeductionsExemptions);

  // 5. Progressive Tax Slabs (Unified Slabs for FY 2083/84)
  const slabConfigs = config.singleSlabs && config.singleSlabs.length > 0 
    ? config.singleSlabs 
    : DEFAULT_TAX_SLABS_FY2083;
  
  let annualTaxLiability = 0;
  let previousLimit = 0;
  const taxSlabBreakdown: TaxSlabDetail[] = [];
  
  // 1% SST Waiver check for SSF Contributors
  const waiveFirstSlab = (config.ssfSlab1SstWaiver ?? true) && (
    ssfEnrolled || 
    taxProfile?.incomeFromPension || 
    taxProfile?.retirementFundContributor
  );
  
  for (let i = 0; i < slabConfigs.length; i++) {
    const slab = slabConfigs[i];
    const isFirstSlab = i === 0;
    const applicableRate = (isFirstSlab && waiveFirstSlab) ? 0 : slab.rate;
    const slabLimit = slab.limitSingle;
    
    if (annualizedTaxableIncome > previousLimit) {
      const taxableInSlab = Math.min(annualizedTaxableIncome - previousLimit, slabLimit - previousLimit);
      const taxAmount = Math.round(taxableInSlab * applicableRate);
      annualTaxLiability += taxAmount;
      taxSlabBreakdown.push({
        slabName: slab.label,
        taxableAmount: taxableInSlab,
        rate: applicableRate,
        taxAmount,
        minAmount: previousLimit,
        maxAmount: slabLimit
      });
      previousLimit = slabLimit;
    } else {
      taxSlabBreakdown.push({
        slabName: slab.label,
        taxableAmount: 0,
        rate: applicableRate,
        taxAmount: 0,
        minAmount: previousLimit,
        maxAmount: slabLimit
      });
      previousLimit = slabLimit;
    }
  }
  
  // 6. Medical Treatment Adjustment (Max 750 or 15% of actual)
  const medicalAdjustment = Math.min(750, (taxProfile?.approvedMedicalExpense || 0) * 0.15);
  annualTaxLiability = Math.max(0, annualTaxLiability - medicalAdjustment);

  // 7. Female Rebate (10% rebate on tax payable if enabled and eligible)
  let femaleRebate = 0;
  const femaleRebateActive = config.femaleRebateEnabled ?? false;
  if (femaleRebateActive && taxProfile?.femaleRebateEligible && taxProfile?.taxpayerType !== 'Non-Resident') {
    femaleRebate = Math.round(annualTaxLiability * (config.femaleRebateRate ?? 0.10));
    annualTaxLiability = Math.max(0, annualTaxLiability - femaleRebate);
  }

  // 8. Previous Employer TDS & Current Month TDS (deterministic monthly portion)
  const prevTDS = taxProfile?.previousEmployerTDS || 0;
  const remainingTax = Math.max(0, annualTaxLiability - prevTDS);
  const incomeTaxTDS = Math.round(remainingTax / 12);
  
  const healthInsurance = 0;
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

/**
 * Calculates projected annual tax for a given taxable income directly using progressive slabs.
 * Used for automated verification and test checkpoints.
 */
export function calculateDirectTaxForIncome(
  annualTaxableIncome: number,
  ssfExempt: boolean = false,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG
): { annualTax: number; slabBreakdown: { slabName: string; taxableAmount: number; rate: number; taxAmount: number }[] } {
  const slabs = config.singleSlabs && config.singleSlabs.length > 0 ? config.singleSlabs : DEFAULT_TAX_SLABS_FY2083;
  let annualTax = 0;
  let prevLimit = 0;
  const slabBreakdown: { slabName: string; taxableAmount: number; rate: number; taxAmount: number }[] = [];

  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    const isFirstSlab = i === 0;
    const rate = (isFirstSlab && ssfExempt) ? 0 : s.rate;
    const limit = s.limitSingle;

    if (annualTaxableIncome > prevLimit) {
      const taxableSlice = Math.min(annualTaxableIncome - prevLimit, limit - prevLimit);
      const tax = Math.round(taxableSlice * rate);
      annualTax += tax;
      slabBreakdown.push({
        slabName: s.label,
        taxableAmount: taxableSlice,
        rate,
        taxAmount: tax
      });
      prevLimit = limit;
    } else {
      slabBreakdown.push({
        slabName: s.label,
        taxableAmount: 0,
        rate,
        taxAmount: 0
      });
      prevLimit = limit;
    }
  }

  return { annualTax, slabBreakdown };
}

export interface TaxTestResult {
  testId: string;
  testName: string;
  income: number;
  expectedTax: number;
  calculatedTax: number;
  passed: boolean;
  notes: string;
}

/**
 * Mandatory automated test runner verifying Nepal IRD FY 2083/84 cumulative tax checkpoints.
 */
export function runTaxCheckpointsTest(config: PayrollConfig = DEFAULT_PAYROLL_CONFIG): TaxTestResult[] {
  const tests: TaxTestResult[] = [];

  // TEST 1: 10,00,000 Taxable Income (Non-SSF) -> Expected: 10,000 (1% SST)
  const t1 = calculateDirectTaxForIncome(1000000, false, config);
  tests.push({
    testId: 'TEST-1',
    testName: 'NPR 10,00,000 Checkpoint (1% SST)',
    income: 1000000,
    expectedTax: 10000,
    calculatedTax: t1.annualTax,
    passed: t1.annualTax === 10000,
    notes: 'First NPR 10,00,000 @ 1% = NPR 10,000 Social Security Tax'
  });

  // TEST 2: 15,00,000 Taxable Income (Non-SSF) -> Expected: 60,000 (10k + 50k)
  const t2 = calculateDirectTaxForIncome(1500000, false, config);
  tests.push({
    testId: 'TEST-2',
    testName: 'NPR 15,00,000 Cumulative Checkpoint',
    income: 1500000,
    expectedTax: 60000,
    calculatedTax: t2.annualTax,
    passed: t2.annualTax === 60000,
    notes: '10,000 (1%) + 50,000 (10%) = NPR 60,000'
  });

  // TEST 3: 25,00,000 Taxable Income (Non-SSF) -> Expected: 2,60,000 (60k + 200k)
  const t3 = calculateDirectTaxForIncome(2500000, false, config);
  tests.push({
    testId: 'TEST-3',
    testName: 'NPR 25,00,000 Cumulative Checkpoint',
    income: 2500000,
    expectedTax: 260000,
    calculatedTax: t3.annualTax,
    passed: t3.annualTax === 260000,
    notes: '60,000 + 2,00,000 (20% of 10L) = NPR 2,60,000'
  });

  // TEST 4: 40,00,000 Taxable Income (Non-SSF) -> Expected: 6,65,000 (260k + 405k)
  const t4 = calculateDirectTaxForIncome(4000000, false, config);
  tests.push({
    testId: 'TEST-4',
    testName: 'NPR 40,00,000 Cumulative Checkpoint',
    income: 4000000,
    expectedTax: 665000,
    calculatedTax: t4.annualTax,
    passed: t4.annualTax === 665000,
    notes: '2,60,000 + 4,05,000 (27% of 15L) = NPR 6,65,000'
  });

  // TEST 5: 50,00,000 Taxable Income (Non-SSF) -> Expected: 9,55,000 (665k + 290k)
  const t5 = calculateDirectTaxForIncome(5000000, false, config);
  tests.push({
    testId: 'TEST-5',
    testName: 'NPR 50,00,000 Top Band Checkpoint',
    income: 5000000,
    expectedTax: 955000,
    calculatedTax: t5.annualTax,
    passed: t5.annualTax === 955000,
    notes: '6,65,000 + 2,90,000 (29% of 10L excess) = NPR 9,55,000'
  });

  // TEST 6: SSF 1% SST Waiver Exemption on 10,00,000 -> Expected: 0 Tax
  const t6 = calculateDirectTaxForIncome(1000000, true, config);
  tests.push({
    testId: 'TEST-6',
    testName: 'SSF 1% SST Waiver (NPR 10,00,000 Income)',
    income: 1000000,
    expectedTax: 0,
    calculatedTax: t6.annualTax,
    passed: t6.annualTax === 0,
    notes: 'SSF Contributing employee receives 100% waiver on 1st band SST = NPR 0 tax'
  });

  // TEST 7: SSF 1% SST Waiver on 15,00,000 -> Expected: 50,000 Tax (0 SST + 50k Income Tax)
  const t7 = calculateDirectTaxForIncome(1500000, true, config);
  tests.push({
    testId: 'TEST-7',
    testName: 'SSF 1% SST Waiver (NPR 15,00,000 Income)',
    income: 1500000,
    expectedTax: 50000,
    calculatedTax: t7.annualTax,
    passed: t7.annualTax === 50000,
    notes: '0 (1% waived) + 50,000 (10%) = NPR 50,000'
  });

  // TEST 8: Single vs Married Equality for FY 2083/84
  const resSingle = calculateTaxAndDeductions(125000, 80000, 'Single', false, config);
  const resMarried = calculateTaxAndDeductions(125000, 80000, 'Married', false, config);
  const isSlabEqual = resSingle.annualTaxLiability === resMarried.annualTaxLiability;
  tests.push({
    testId: 'TEST-8',
    testName: 'Single vs Married Unified Slab Equality',
    income: 1500000,
    expectedTax: resSingle.annualTaxLiability,
    calculatedTax: resMarried.annualTaxLiability,
    passed: isSlabEqual,
    notes: isSlabEqual 
      ? 'Single and Married employees produce identical progressive tax calculation for FY 2083/84'
      : 'Discrepancy detected between Single and Married tax calculations'
  });

  // TEST 9: Payroll Period Shrawan 2083 Days Verification
  const shrawanPeriod = getPayrollPeriod(2083, '04');
  tests.push({
    testId: 'TEST-9',
    testName: 'Payroll Period: Shrawan 2083 (2026-07-17 to 2026-08-16)',
    income: 0,
    expectedTax: 31,
    calculatedTax: shrawanPeriod.totalDays,
    passed: shrawanPeriod.totalDays === 31,
    notes: `Start: ${shrawanPeriod.startDate}, End: ${shrawanPeriod.endDate}, Inclusive Days: ${shrawanPeriod.totalDays} (Expected: 31)`
  });

  return tests;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Calculates a fully deterministic, idempotent Payroll Run for a specified month & date range.
 * Reads directly from the active centralized Payroll Setup & Rules.
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
  // Validate setup rules existence before running
  const validation = validateTaxSlabs(config.singleSlabs);
  if (!validation.valid) {
    throw new Error(`Payroll Setup is incomplete or invalid. Calculation was not executed: ${validation.errors.join('; ')}`);
  }

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
  const normIdHelper = (id: string) => {
    const str = String(id || '').trim();
    const num = str.replace(/\D/g, '').replace(/^0+/, '');
    return num || str.toLowerCase();
  };

  const records: PayrollRecord[] = activeEmployees.map((emp) => {
    const monthlyBasic = emp.basicSalary || 0;
    const hasConfiguredSalary = monthlyBasic > 0;
    const monthlyAllowances = emp.allowances || ((emp.dearnessAllowance || 0) + (emp.otherAllowance || 0)) || 0;
    const monthlyGrossFixed = emp.grossSalary && emp.grossSalary >= monthlyBasic
      ? emp.grossSalary
      : (monthlyBasic + monthlyAllowances);
    
    // Explicit tax status from Employee object
    const taxStatus: 'Single' | 'Married' = emp.maritalStatus || 'Single';
    const ssfEnrolled = emp.ssfEnrolled !== undefined ? emp.ssfEnrolled : true;
    const empNormId = normIdHelper(emp.id);

    const empLogs = monthAttendance.filter(a => a.employeeId === emp.id || normIdHelper(a.employeeId) === empNormId);
    const empOt = monthOvertime.filter(o => o.employeeId === emp.id || normIdHelper(o.employeeId) === empNormId);

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
        payableDays = 0;
      }
    } else {
      payableDays = daysInMonth;
    }

    const absentDays = Math.max(0, daysInMonth - payableDays);
    const payRatio = daysInMonth > 0 ? payableDays / daysInMonth : 1;

    const earnedBasicSalary = Math.round(monthlyBasic * payRatio);
    const earnedAllowances = Math.round(monthlyAllowances * payRatio);

    const overtimeHours = empOt.reduce((sum, o) => sum + (Number(o.hours) || 0), 0);
    const activeOtBasis: 'basic' | 'gross' = config.overtimeCalculationBasis || 'basic';
    const salaryBaseForOt = activeOtBasis === 'gross' ? monthlyGrossFixed : monthlyBasic;
    const dutyHoursPerDay = Number(emp.targetWorkingHours || emp.requiredWorkingHoursPerDay || 8) || 8;
    const hourlyBaseRate = salaryBaseForOt > 0 ? (salaryBaseForOt / (26 * dutyHoursPerDay)) : 0;
    const otMult = config.overtimeMultiplier || 1.5;

    // Sum approved OT pay: if individual records specify an explicit basis/amount, respect it or compute from active basis
    const overtimePay = Math.round(
      empOt.reduce((sum, o) => {
        const hrs = Number(o.hours) || 0;
        if (hrs <= 0) return sum;
        const recBasis = o.otBasis || activeOtBasis;
        const recSalaryBase = recBasis === 'gross' ? monthlyGrossFixed : monthlyBasic;
        const recHourly = recSalaryBase > 0 ? (recSalaryBase / (26 * (Number(o.standardDutyHours) || dutyHoursPerDay))) : 0;
        return sum + (hrs * recHourly * otMult);
      }, 0)
    );
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
      overtimeRate: Number((hourlyBaseRate * otMult).toFixed(2)),
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
      remarks: !hasConfiguredSalary
        ? `[Notice] Basic salary not configured in employee setup. Calculated with NPR 0 baseline.`
        : `Calculated under Nepal IRD ${period.fiscalYear} TDS (Unified Resident) & SSF (${ssfEnrolled ? '11% Emp / 20% Empr' : '10% Non-SSF'}) [Rule v${config.ruleVersion || '1.0'}]`
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
