const fs = require('fs');
let code = fs.readFileSync('src/pages/Payroll.tsx', 'utf-8');
const lines = code.split('\n');

// 1. Remove line 1430 which is `                      )}`
if (lines[1430].includes(')}')) {
  lines.splice(1430, 1);
} else if (lines[1429].includes(')}')) {
  lines.splice(1429, 1);
} else if (lines[1431].includes(')}')) {
  lines.splice(1431, 1);
}

// 2. Add `                )}` at the end of the map/ternary before `</tbody>`
const tBodyEnd = lines.findIndex(l => l.includes('</tbody>'));
if (tBodyEnd !== -1) {
    lines.splice(tBodyEnd, 0, "                )}");
}

fs.writeFileSync('src/pages/Payroll.tsx', lines.join('\n'));
