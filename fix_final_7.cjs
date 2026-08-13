const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(/                      \}\)\}\n                    <\/select>\n                  <\/div>\n    \n                  <div className="flex items-center gap-2">/, "                      })}\\n                    </select>\\n                  </div>\\n                )}\\n\\n                <div className=\\\"flex items-center gap-2\\\">");

fs.writeFileSync('src/pages/Payroll.tsx', code);
