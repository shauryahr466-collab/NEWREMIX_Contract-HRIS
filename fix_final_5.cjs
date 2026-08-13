const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(/                              <span className="block text-\[9px\] text-indigo-500 font-semibold">\+\{rec\.overtimeHours\} hrs OT<\/span>\s*<\/td>/, 
  "                              <span className=\"block text-[9px] text-indigo-500 font-semibold\">+{rec.overtimeHours} hrs OT</span>\n                            )}\n                          </td>");

fs.writeFileSync('src/pages/Payroll.tsx', code);
