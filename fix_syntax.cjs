const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

const faultyStr = `        </div>
      )}
                </div>
            {currentRun && (`;

code = code.replace(faultyStr, `            {currentRun && (`);
fs.writeFileSync('src/pages/Payroll.tsx', code);
