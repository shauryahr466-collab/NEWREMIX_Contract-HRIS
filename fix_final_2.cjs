const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

code = code.replace(/                      <\/button>\n                          <\/div>/, "                      </button>\n                    )}\n                  </div>");

fs.writeFileSync('src/pages/Payroll.tsx', code);
