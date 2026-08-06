const fs = require('fs');
let code = fs.readFileSync('src/pages/Attendance.tsx', 'utf-8');

code = code.replace(
  `<th className="px-4 py-3 w-[80px] text-right">Late By</th>`,
  `<th className="px-4 py-3 w-[80px] text-right">Late By</th>
                <th className="px-4 py-3 w-[80px] text-right">Early Out</th>`
);

code = code.replace(
  `                    <td className="px-4 py-2.5 text-right font-semibold">
                      {d.lateMinutes > 0 ? (
                        <span className="text-danger">{formatMinutes(d.lateMinutes)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">`,
  `                    <td className="px-4 py-2.5 text-right font-semibold">
                      {d.lateMinutes > 0 ? (
                        <span className="text-danger">{formatMinutes(d.lateMinutes)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {d.earlyMinutes > 0 ? (
                        <span className="text-amber-500">{formatMinutes(d.earlyMinutes)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">`
);

fs.writeFileSync('src/pages/Attendance.tsx', code);
