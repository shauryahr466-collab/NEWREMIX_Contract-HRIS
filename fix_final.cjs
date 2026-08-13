const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');

// I will just add )} before <Button if it is the Export Bank File button.
code = code.replace(/<\/Button>\s*<Button\s*variant="outline"\s*onClick=\{\(\) => handleExportBankFile\(currentRun\)\}/g, 
  '</Button>\n                    )}\n                    <Button variant="outline" onClick={() => handleExportBankFile(currentRun)}');

fs.writeFileSync('src/pages/Payroll.tsx', code);
