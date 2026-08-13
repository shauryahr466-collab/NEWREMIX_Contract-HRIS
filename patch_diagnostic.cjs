const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(/s\.taxableAmountInSlab/g, 's.taxableAmount');
code = code.replace(/s\.ratePercent/g, '(s.rate * 100)');
code = code.replace(/s\.taxAmountForSlab/g, 's.taxAmount');
code = code.replace(/activePayslipRecord\.taxableIncome/g, 'activePayslipRecord.annualizedTaxableIncome');

// Let's make sure it handles both properly.
fs.writeFileSync('src/pages/Payroll.tsx', code);
