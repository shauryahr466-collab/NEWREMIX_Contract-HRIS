const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf-8');

code = code.replace(
  `          'Weekly Off': emp?.weeklyOff || '',
          'Shift': shift?.name || 'Default',
          'In Time': formatAMPM(d.firstPunch),
          'Out Time': (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '',`,
  `          'Weekly Off': emp?.weeklyOff || '',
          'Shift': shift?.name || 'Default',
          'Shift In Time': formatTimeFromHHMM(shift?.startTime),
          'Shift Out Time': formatTimeFromHHMM(shift?.endTime),
          'TWH': emp?.targetWorkingHours ?? d.expectedHours ?? '-',
          'OT Eligible': emp?.otEligible !== false ? 'Yes' : 'No',
          'In Time': formatAMPM(d.firstPunch),
          'Out Time': (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '',`
);

code = code.replace(
  `      head = [['Day', 'Date', 'Date (B.S.)', 'Emp ID', 'Employee Name', 'WO', 'Shift', 'Clock In', 'Clock Out', 'Late', 'Early', 'Work', 'OT', 'Status']];`,
  `      head = [['Day', 'Date', 'Date (B.S.)', 'Emp ID', 'Employee Name', 'WO', 'Shift', 'Shift In', 'Shift Out', 'TWH', 'OT Elig', 'Clock In', 'Clock Out', 'Late', 'Early', 'Work', 'OT', 'Status']];`
);

code = code.replace(
  `          emp?.weeklyOff?.substring(0, 3) || '-',
          shiftDetails?.name || 'Day Shift',
          formatAMPM(d.firstPunch),
          (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '-',`,
  `          emp?.weeklyOff?.substring(0, 3) || '-',
          shiftDetails?.name || 'Day Shift',
          formatTimeFromHHMM(shiftDetails?.startTime),
          formatTimeFromHHMM(shiftDetails?.endTime),
          String(emp?.targetWorkingHours ?? d.expectedHours ?? '-'),
          emp?.otEligible !== false ? 'Yes' : 'No',
          formatAMPM(d.firstPunch),
          (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '-',`
);

// We must also update the styles for the new columns in PDF
code = code.replace(
  `          4: { cellWidth: 'auto', minCellWidth: 40 }, // Name
          5: { cellWidth: 10, halign: 'center' }, // WO
          6: { cellWidth: 16, halign: 'center' }, // Shift
          7: { cellWidth: 16, halign: 'center' }, // In
          8: { cellWidth: 16, halign: 'center' }, // Out
          9: { cellWidth: 11, halign: 'center' }, // Late
          10: { cellWidth: 11, halign: 'center' }, // Early
          11: { cellWidth: 12, halign: 'center' }, // Work
          12: { cellWidth: 12, halign: 'center' }, // OT
          13: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } // Status`,
  `          4: { cellWidth: 'auto', minCellWidth: 30 }, // Name
          5: { cellWidth: 10, halign: 'center' }, // WO
          6: { cellWidth: 14, halign: 'center' }, // Shift
          7: { cellWidth: 14, halign: 'center' }, // Shift In
          8: { cellWidth: 14, halign: 'center' }, // Shift Out
          9: { cellWidth: 10, halign: 'center' }, // TWH
          10: { cellWidth: 10, halign: 'center' }, // OT Elig
          11: { cellWidth: 14, halign: 'center' }, // Clock In
          12: { cellWidth: 14, halign: 'center' }, // Clock Out
          13: { cellWidth: 10, halign: 'center' }, // Late
          14: { cellWidth: 10, halign: 'center' }, // Early
          15: { cellWidth: 11, halign: 'center' }, // Work
          16: { cellWidth: 11, halign: 'center' }, // OT
          17: { cellWidth: 16, halign: 'center', fontStyle: 'bold' } // Status`
);


fs.writeFileSync('src/pages/Reports.tsx', code);
