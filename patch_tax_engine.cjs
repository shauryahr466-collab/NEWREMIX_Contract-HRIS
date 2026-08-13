const fs = require('fs');
let code = fs.readFileSync('src/lib/payrollEngine.ts', 'utf-8');

const newTaxEngine = `
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
`;

code = code.replace(/export function calculateTaxAndDeductions\([\s\S]*?return {[\s\S]*?taxSlabBreakdown\n  };\n}/, newTaxEngine.trim());

// Update generatePayrollRun call
code = code.replace(/calculateTaxAndDeductions\(\s*grossSalary,\s*earnedBasicSalary,\s*taxStatus,\s*ssfEnrolled,\s*config\s*\)/g, 'calculateTaxAndDeductions(grossSalary, earnedBasicSalary, taxStatus, ssfEnrolled, config, emp.taxProfile)');


fs.writeFileSync('src/lib/payrollEngine.ts', code);
