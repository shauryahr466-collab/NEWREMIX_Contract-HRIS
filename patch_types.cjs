const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf-8');

const taxProfileCode = `
export interface EmployeeTaxProfile {
  taxpayerType: 'Resident' | 'Non-Resident';
  femaleRebateEligible: boolean;
  disabilityStatus: boolean;
  incomeFromPension: boolean;
  retirementFundContributor: boolean;
  lifeInsurancePremium: number; // Actual premium paid
  healthInsurancePremium: number; // Actual premium paid
  privateBuildingInsurance: number; // Actual premium paid
  educationFee: number; // Eligible education fee
  remoteAreaCategory?: 'A' | 'B' | 'C' | 'D' | 'E' | 'None';
  approvedMedicalExpense: number; // Actual approved medical expense
  previousEmployerIncome: number;
  previousEmployerTDS: number;
  otherEligibleDeductions: number;
}
`;

if (!code.includes('export interface EmployeeTaxProfile')) {
  // insert before export interface Employee
  code = code.replace(/export interface Employee {/, taxProfileCode + '\nexport interface Employee {');
  // insert taxProfile into Employee
  code = code.replace(/ssfEnrolled\?: boolean;/, 'ssfEnrolled?: boolean;\n  taxProfile?: EmployeeTaxProfile;\n  companyType?: \'SCIL\' | \'ISTS\';');
  fs.writeFileSync('src/types.ts', code);
}
