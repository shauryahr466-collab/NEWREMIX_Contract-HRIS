const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf-8');

code = code.replace(
  `headers = ['Gregorian Date', 'Nepali Date', 'Day', 'Employee ID', 'Name', 'Department', 'Designation', 'Contractor', 'Weekly Off', 'Shift', 'In Time', 'Out Time', 'Punch Count', 'Late By', 'Early Out', 'Work Hours', 'Overtime', 'Status'];`,
  `headers = ['Gregorian Date', 'Nepali Date', 'Day', 'Employee ID', 'Name', 'Department', 'Designation', 'Contractor', 'Weekly Off', 'Shift', 'Shift In Time', 'Shift Out Time', 'TWH', 'OT Eligible', 'In Time', 'Out Time', 'Punch Count', 'Late By', 'Early Out', 'Work Hours', 'Overtime', 'Status'];`
);

code = code.replace(
  `            emp?.weeklyOff || '',
            shift?.name || 'Default',
            formatAMPM(d.firstPunch),
            (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '',`,
  `            emp?.weeklyOff || '',
            shift?.name || 'Default',
            formatTimeFromHHMM(shift?.startTime),
            formatTimeFromHHMM(shift?.endTime),
            emp?.targetWorkingHours ?? shift?.duration ?? '-',
            emp?.otEligible !== false ? 'Yes' : 'No',
            formatAMPM(d.firstPunch),
            (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '',`
);

fs.writeFileSync('src/pages/Reports.tsx', code);
