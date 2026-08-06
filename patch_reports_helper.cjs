const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf-8');

const helper = `
function formatTimeFromHHMM(timeStr: string | undefined | null) {
  if (!timeStr) return '-';
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return timeStr;
  const h = parts[0];
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return \`\${h12}:\${m.toString().padStart(2, '0')} \${ampm}\`;
}

export function Reports() {`;

code = code.replace("export function Reports() {", helper);
fs.writeFileSync('src/pages/Reports.tsx', code);
