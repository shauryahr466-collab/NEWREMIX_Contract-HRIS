const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

// The sed command was: sed -i 's/            )}//'
// Let's add them back where it makes sense.

code = code.replace(/                      <\/>\n                            \{currentRun/g, '                      </>\n                    )}\n                    {currentRun');

code = code.replace(/                      <\/Button>\n                            \{currentRun\.status === 'Approved'/g, '                      </Button>\n                    )}\n                    {currentRun.status === \'Approved\'');

fs.writeFileSync('src/pages/Payroll.tsx', code);
