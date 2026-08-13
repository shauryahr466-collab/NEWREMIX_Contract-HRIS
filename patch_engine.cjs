const fs = require('fs');
let code = fs.readFileSync('src/lib/payrollEngine.ts', 'utf-8');

const newConfig = `
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
`;

code = code.replace(/export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {[\s\S]*?currencySymbol: 'NPR'\n};/, newConfig.trim());

fs.writeFileSync('src/lib/payrollEngine.ts', code);
