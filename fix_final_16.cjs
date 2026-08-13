const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(/                    <\/div>\s*<div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-800 font-black text-sm">/, 
  "                    </div>\n                  )}\n                  <div className=\"flex justify-between py-2 border-t border-slate-200 dark:border-slate-800 font-black text-sm\">");

fs.writeFileSync('src/pages/Payroll.tsx', code);
