const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(
  `const [taxSlabStatus, setTaxSlabStatus] = useState<'Single' | 'Married'>('Single');`,
  ``
);

fs.writeFileSync('src/pages/Payroll.tsx', code);
