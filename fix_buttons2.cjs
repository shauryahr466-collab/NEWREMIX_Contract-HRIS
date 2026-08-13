const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

const regex = /(<\/>\s+)(\{currentRun\.status === 'Approved' && \()/g;
code = code.replace(regex, "$1)}\n                    $2");

fs.writeFileSync('src/pages/Payroll.tsx', code);
