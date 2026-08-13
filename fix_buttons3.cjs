const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

const regex2 = /(                      <\/Button>\n                            <Button \n                      variant="outline")/g;
code = code.replace(regex2, '                      </Button>\n                    )}\n                    <Button \n                      variant="outline"');

fs.writeFileSync('src/pages/Payroll.tsx', code);
