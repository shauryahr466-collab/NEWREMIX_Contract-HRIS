const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');
const lines = code.split('\n');

// 1. Remove `)}` around line 975
for (let i = 970; i < 980; i++) {
  if (lines[i] && lines[i].trim() === ')}') {
    lines.splice(i, 1);
    break;
  }
}

// 2. Add `)}` before `</tbody>` in Tab 4
// Let's find the `filteredPayEmployees.map`
const startIdx = lines.findIndex(l => l.includes('filteredPayEmployees.map(emp => {'));
if (startIdx !== -1) {
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].includes('</tbody>')) {
      // check if the line before has `})`
      if (lines[i-1].includes('})')) {
        lines.splice(i, 0, "                )}");
      } else if (lines[i-2] && lines[i-2].includes('})')) {
        lines.splice(i-1, 0, "                )}");
      }
      break;
    }
  }
}

fs.writeFileSync('src/pages/Payroll.tsx', lines.join('\n'));
