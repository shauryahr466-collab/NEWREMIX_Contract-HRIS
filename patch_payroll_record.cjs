const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf-8');

if (!code.includes('annualizedTaxableIncome?: number;')) {
  code = code.replace(/taxSlabBreakdown\?\: any;/, 'annualizedTaxableIncome?: number;\n  annualTaxLiability?: number;\n  taxSlabBreakdown?: any;');
  fs.writeFileSync('src/types.ts', code);
}
