const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');
const lines = code.split('\n');
lines.splice(1092, 0, "                    )}");
fs.writeFileSync('src/pages/Payroll.tsx', lines.join('\n'));
