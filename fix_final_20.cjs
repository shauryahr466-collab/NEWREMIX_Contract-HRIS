const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(/                  <\/div>\n                <\/div>\n                \{\/\* Modal Actions \*\/\}/, 
  "                  </div>\n                </div>\n              )}\n              {/* Modal Actions */}");

fs.writeFileSync('src/pages/Payroll.tsx', code);
