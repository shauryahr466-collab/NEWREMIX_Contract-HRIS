const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(/                  <\/div>\n                <\/div>\n                \{\/\* Net Payable Highlight \*\/\}/, 
  "                  </div>\n                </div>\n                )}\n                {/* Net Payable Highlight */}");

fs.writeFileSync('src/pages/Payroll.tsx', code);
