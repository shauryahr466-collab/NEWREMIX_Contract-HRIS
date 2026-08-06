const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf-8');

code = code.replace(
  `            emp?.targetWorkingHours ?? shift?.duration ?? '-',`,
  `            emp?.targetWorkingHours ?? d.expectedHours ?? '-',`
);

fs.writeFileSync('src/pages/Reports.tsx', code);
