import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { 
  getNepaliMonthDays, 
  NEPALI_MONTHS, 
  getCurrentNepaliDateInfo,
  getNepaliMonthEnglishEquivalent 
} from '../../utils/nepaliCalendar';
import { 
  Search, Download, Printer, Filter, Users, Calendar, 
  CheckCircle2, XCircle, Clock, Award, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Upload 
} from 'lucide-react';
import { Card, Button, Input } from '../ui';
import { MultiSelect } from '../MultiSelect';
import { MusterCellModal } from './MusterCellModal';
import { ManualAttendanceImportModal } from '../ManualAttendanceImportModal';
import { Employee, ProcessedAttendance, ShiftMaster, RawPunch } from '../../types';
import { formatDuration, cn, formatAMPM, toDeviceWallClockIso } from '../../lib/utils';
import { parseISO, format } from 'date-fns';
import * as XLSX from 'xlsx';

// Standardized Code Legend Items matching exact specification
const MUSTER_LEGEND = [
  { code: 'P', label: 'Present', bg: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border-emerald-300' },
  { code: 'PWO', label: 'Present in Weekly Off', bg: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border-indigo-300 font-bold' },
  { code: 'P+OT', label: 'Present + Overtime', bg: 'bg-teal-100 dark:bg-teal-950 text-teal-900 dark:text-teal-200 border-teal-400 font-black' },
  { code: 'PPH', label: 'Present in Public Holiday', bg: 'bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200 border-sky-400 font-bold' },
  { code: 'A', label: 'Absent', bg: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border-rose-300' },
  { code: 'WO', label: 'Weekly Off', bg: 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300' },
  { code: 'PH', label: 'Public Holiday', bg: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border-blue-300' },
  { code: 'L', label: 'Approved Leave', bg: 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-200 border-purple-300' },
  { code: 'MI', label: 'Miss In', bg: 'bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200 border-orange-300 font-bold' },
  { code: 'MO', label: 'Miss Out', bg: 'bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200 border-orange-300 font-bold' },
  { code: 'SPF', label: 'Single Punch', bg: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border-amber-400' },
  { code: 'REVIEW', label: 'Requires HR Verification', bg: 'bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200 border-red-400 font-black' },
];

export function MonthlyMuster() {
  const { employees, processedData, settings, shiftAssignments, punches } = useAppStore();

  const currentInfo = getCurrentNepaliDateInfo();
  const [selectedYear, setSelectedYear] = useState<number>(currentInfo.year);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(currentInfo.monthIndex);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState<string[]>(['All']);
  const [sectionFilter, setSectionFilter] = useState<string[]>(['All']);
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);

  // Cell Detail Modal State
  const [cellModal, setCellModal] = useState<{
    isOpen: boolean;
    employee: Employee | null;
    bsDateStr: string;
    adDateStr: string;
    dayOfWeek: string;
    processedRecord: ProcessedAttendance | null;
    shift: ShiftMaster | null;
    rawPunches: RawPunch[];
  }>({
    isOpen: false,
    employee: null,
    bsDateStr: '',
    adDateStr: '',
    dayOfWeek: '',
    processedRecord: null,
    shift: null,
    rawPunches: []
  });

  // Days list for the selected Nepali Month
  const monthDays = useMemo(() => {
    return getNepaliMonthDays(selectedYear, selectedMonthIndex);
  }, [selectedYear, selectedMonthIndex]);

  const englishEquiv = useMemo(() => {
    return getNepaliMonthEnglishEquivalent(selectedYear, selectedMonthIndex);
  }, [selectedYear, selectedMonthIndex]);

  // Options for filters
  const yearOptions = [2080, 2081, 2082, 2083, 2084, 2085];

  const departments = useMemo(() => {
    const depts = employees.map(e => e.department).filter(Boolean);
    return ['All', ...new Set(depts)];
  }, [employees]);

  const sections = useMemo(() => {
    const secs = employees.map(e => e.contractorName).filter(Boolean);
    return ['All', ...new Set(secs)];
  }, [employees]);

  // Fast maps for lookup
  const processedDataMap = useMemo(() => {
    const map = new Map<string, ProcessedAttendance>();
    processedData.forEach(p => {
      map.set(`${p.employeeId}_${p.date}`, p);
    });
    return map;
  }, [processedData]);

  const punchesByEmpDate = useMemo(() => {
    const map = new Map<string, RawPunch[]>();
    punches.forEach(p => {
      const cleanDt = toDeviceWallClockIso(p.punchDatetime);
      if (!cleanDt) return;
      const datePart = cleanDt.split(/[ T]/)[0];
      const key = `${p.employeeId}_${datePart}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ ...p, punchDatetime: cleanDt });
    });
    return map;
  }, [punches]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    const sLower = searchTerm.toLowerCase();
    return employees.filter(emp => {
      const matchSearch = !searchTerm || 
        emp.id.toLowerCase().includes(sLower) || 
        emp.name.toLowerCase().includes(sLower);

      const matchDept = deptFilter.includes('All') || (emp.department && deptFilter.includes(emp.department));
      const matchSection = sectionFilter.includes('All') || (emp.contractorName && sectionFilter.includes(emp.contractorName));

      return matchSearch && matchDept && matchSection;
    });
  }, [employees, searchTerm, deptFilter, sectionFilter]);

  // Helper to determine status code for a cell according to exact priority logic
  const getCellStatus = (emp: Employee, dayDetail: typeof monthDays[0]) => {
    const key = `${emp.id}_${dayDetail.adDateStr}`;
    const record = processedDataMap.get(key);
    
    // Check shift assignment for this date
    const assignment = shiftAssignments.find(a => a.employeeId === emp.id && a.date === dayDetail.adDateStr);
    const assignedShift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp.shiftId));

    // Determine weekly off for this employee on this date:
    // Interconnect assigned shift weekly off, employee weekly off, or default Saturday
    const effectiveWeeklyOffDay = (assignedShift as any)?.weeklyOff || emp.weeklyOff;
    const isWeeklyOff = record?.status === 'Weekly Off' || record?.status === 'PWO' || (
      effectiveWeeklyOffDay 
        ? effectiveWeeklyOffDay.toLowerCase() === dayDetail.dayOfWeek.toLowerCase()
        : dayDetail.isSaturday
    );

    const isHoliday = settings.holidays?.some(h => h.date === dayDetail.adDateStr);

    if (!record) {
      if (isHoliday) {
        return { code: 'PH', bg: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 font-semibold', record: null };
      }
      if (isWeeklyOff) {
        return { code: 'WO', bg: 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-semibold', record: null };
      }
      return { code: 'A', bg: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300', record: null };
    }

    // 1. Present in Public Holiday
    if (isHoliday && (record.status === 'Present' || record.status === 'On Time' || record.status === 'Early' || record.firstPunch)) {
      return { code: 'PPH', bg: 'bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-200 font-extrabold', record };
    }

    // 2. Present in Weekly Off (PWO)
    if (record.status === 'PWO' || (isWeeklyOff && (record.firstPunch || record.workingHours > 0 || record.status === 'Present' || record.status === 'Late' || record.status === 'On Time' || record.status === 'Early'))) {
      return { code: 'PWO', bg: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 font-bold', record };
    }

    // 3. Weekly Off without attendance
    if (record.status === 'Weekly Off' || (isWeeklyOff && !record.firstPunch && record.status !== 'Present')) {
      return { code: 'WO', bg: 'bg-amber-100/80 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-semibold', record };
    }

    // 4. Single Punch / Miss In / Miss Out
    if (record.status === 'SPF') {
      if (!record.firstPunch && record.lastPunch) {
        return { code: 'MI', bg: 'bg-orange-100 dark:bg-orange-950 text-orange-900 dark:text-orange-200 font-bold', record };
      }
      if (record.firstPunch && !record.lastPunch) {
        return { code: 'MO', bg: 'bg-orange-100 dark:bg-orange-950 text-orange-900 dark:text-orange-200 font-bold', record };
      }
      return { code: 'SPF', bg: 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 font-bold', record };
    }

    // 5. Present + Overtime or Normal Present
    if (record.status === 'Present' || record.status === 'On Time' || record.status === 'Early' || record.status === 'Late') {
      if (record.overtime > 0) {
        return { code: 'P+OT', bg: 'bg-teal-100 dark:bg-teal-950 text-teal-900 dark:text-teal-200 font-black', record };
      }
      return { code: 'P', bg: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-bold', record };
    }

    // 6. Absent
    if (record.status === 'Absent') {
      return { code: 'A', bg: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300', record };
    }

    return { code: 'P', bg: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-bold', record };
  };

  // Calculate Employee-wise Month Totals for exact requested summary columns:
  // P | PWO | P+OT | PPH | A | WO | PH | L | MI | MO | SPF | OT Hours
  const employeeTotals = useMemo(() => {
    const totalsMap = new Map<string, {
      P: number;
      PWO: number;
      POT: number;
      PPH: number;
      A: number;
      WO: number;
      PH: number;
      L: number;
      MI: number;
      MO: number;
      SPF: number;
      OT: number;
    }>();

    filteredEmployees.forEach(emp => {
      let P = 0, PWO = 0, POT = 0, PPH = 0, A = 0, WO = 0, PH = 0, L = 0, MI = 0, MO = 0, SPF = 0, OT = 0;

      monthDays.forEach(day => {
        const { code, record } = getCellStatus(emp, day);
        if (code === 'P') P++;
        else if (code === 'PWO') PWO++;
        else if (code === 'P+OT') { P++; POT++; }
        else if (code === 'PPH') PPH++;
        else if (code === 'A') A++;
        else if (code === 'WO') WO++;
        else if (code === 'PH') PH++;
        else if (code === 'L') L++;
        else if (code === 'MI') MI++;
        else if (code === 'MO') MO++;
        else if (code === 'SPF') SPF++;

        if (record?.overtime) OT += record.overtime;
      });

      totalsMap.set(emp.id, { P, PWO, POT, PPH, A, WO, PH, L, MI, MO, SPF, OT });
    });

    return totalsMap;
  }, [filteredEmployees, monthDays, processedDataMap]);

  // Overall KPI Summary
  const kpiSummary = useMemo(() => {
    let totalP = 0, totalPWO = 0, totalPOT = 0, totalPPH = 0, totalA = 0, totalWO = 0, totalPH = 0, totalL = 0, totalMI = 0, totalMO = 0, totalSPF = 0, totalOT = 0;

    employeeTotals.forEach(t => {
      totalP += t.P;
      totalPWO += t.PWO;
      totalPOT += t.POT;
      totalPPH += t.PPH;
      totalA += t.A;
      totalWO += t.WO;
      totalPH += t.PH;
      totalL += t.L;
      totalMI += t.MI;
      totalMO += t.MO;
      totalSPF += t.SPF;
      totalOT += t.OT;
    });

    const workedDays = totalP + totalPWO + totalPOT + totalPPH;

    return {
      totalEmployees: filteredEmployees.length,
      daysInMonth: monthDays.length,
      workingDays: monthDays.filter(d => !d.isSaturday).length,
      totalP,
      totalPWO,
      totalPOT,
      totalPPH,
      totalA,
      totalWO,
      totalPH,
      totalL,
      totalMI,
      totalMO,
      totalSPF,
      totalOT,
      workedDays
    };
  }, [filteredEmployees, monthDays, employeeTotals]);

  // Handle cell click
  const handleCellClick = (emp: Employee, dayDetail: typeof monthDays[0]) => {
    const key = `${emp.id}_${dayDetail.adDateStr}`;
    const record = processedDataMap.get(key) || null;
    const rawP = punchesByEmpDate.get(key) || [];
    
    const assignment = shiftAssignments.find(a => a.employeeId === emp.id && a.date === dayDetail.adDateStr);
    const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp.shiftId)) || null;

    setCellModal({
      isOpen: true,
      employee: emp,
      bsDateStr: dayDetail.bsDateStr,
      adDateStr: dayDetail.adDateStr,
      dayOfWeek: dayDetail.dayOfWeek,
      processedRecord: record,
      shift,
      rawPunches: rawP
    });
  };

  // Export to Excel
  const handleExportExcel = () => {
    const nepaliMonthName = NEPALI_MONTHS[selectedMonthIndex].name;
    const headers = ['S.No', 'Emp ID', 'Employee Name', 'Department', 'Designation'];
    
    monthDays.forEach(d => {
      headers.push(`${d.dayNumber < 10 ? '0' + d.dayNumber : d.dayNumber} (${d.dayOfWeek})`);
    });

    headers.push('P', 'PWO', 'P+OT', 'PPH', 'A', 'WO', 'PH', 'L', 'MI', 'MO', 'SPF', 'OT Hrs');

    const rows: any[] = [];

    filteredEmployees.forEach((emp, index) => {
      const row: any = {
        'S.No': index + 1,
        'Emp ID': emp.id,
        'Employee Name': emp.name,
        'Department': emp.department || '-',
        'Designation': emp.designation || '-'
      };

      monthDays.forEach(d => {
        const { code } = getCellStatus(emp, d);
        row[`${d.dayNumber < 10 ? '0' + d.dayNumber : d.dayNumber} (${d.dayOfWeek})`] = code;
      });

      const t = employeeTotals.get(emp.id) || { P: 0, PWO: 0, POT: 0, PPH: 0, A: 0, WO: 0, PH: 0, L: 0, MI: 0, MO: 0, SPF: 0, OT: 0 };
      row['P'] = t.P;
      row['PWO'] = t.PWO;
      row['P+OT'] = t.POT;
      row['PPH'] = t.PPH;
      row['A'] = t.A;
      row['WO'] = t.WO;
      row['PH'] = t.PH;
      row['L'] = t.L;
      row['MI'] = t.MI;
      row['MO'] = t.MO;
      row['SPF'] = t.SPF;
      row['OT Hrs'] = t.OT.toFixed(1);

      rows.push(row);
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Muster ${nepaliMonthName} ${selectedYear}`);
    XLSX.writeFile(workbook, `Monthly_Muster_${selectedYear}_${nepaliMonthName}.xlsx`);
  };

  // Navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonthIndex === 0) {
      setSelectedYear(prev => prev - 1);
      setSelectedMonthIndex(11);
    } else {
      setSelectedMonthIndex(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonthIndex === 11) {
      setSelectedYear(prev => prev + 1);
      setSelectedMonthIndex(0);
    } else {
      setSelectedMonthIndex(prev => prev + 1);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Month Selection & Filters Bar */}
      <Card className="p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          
          {/* Nepali Month & Year Selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/60 p-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-indigo-700 dark:text-indigo-300 transition shadow-xs"
                title="Previous Month"
              >
                <ChevronLeft size={18} />
              </button>

              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="h-8 px-2 text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent outline-none cursor-pointer"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y} className="text-slate-800">{y} B.S.</option>
                ))}
              </select>

              <select 
                value={selectedMonthIndex}
                onChange={(e) => setSelectedMonthIndex(Number(e.target.value))}
                className="h-8 px-2 text-xs font-black text-indigo-700 dark:text-indigo-300 bg-transparent outline-none cursor-pointer uppercase"
              >
                {NEPALI_MONTHS.map(m => (
                  <option key={m.value} value={m.value} className="text-slate-800">
                    {m.name} ({m.nepaliName})
                  </option>
                ))}
              </select>

              <button 
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-indigo-700 dark:text-indigo-300 transition shadow-xs"
                title="Next Month"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200/60 dark:border-slate-700">
              <Calendar size={14} className="text-indigo-500 shrink-0" />
              <span>A.D. Range: <strong>{englishEquiv}</strong></span>
            </div>
          </div>

          {/* Action Export Buttons */}
          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Button size="sm" onClick={() => setIsManualImportOpen(true)} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-xs">
              <Upload size={14} /> Import Attendance
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-9">
              <FileSpreadsheet size={14} className="text-emerald-600" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="h-9 hidden sm:flex">
              <Printer size={14} /> Print
            </Button>
          </div>
        </div>

        {/* Secondary Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-12 gap-3 pt-4">
          <div className="lg:col-span-4">
            <Input 
              placeholder="Search Employee ID or Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search size={14} className="text-slate-400" />}
              className="h-9 text-xs"
            />
          </div>

          <div className="lg:col-span-3">
            <MultiSelect 
              label="Department"
              options={departments}
              selected={deptFilter}
              onChange={setDeptFilter}
              placeholder="All Departments"
            />
          </div>

          <div className="lg:col-span-3">
            <MultiSelect 
              label="Section / Contractor"
              options={sections}
              selected={sectionFilter}
              onChange={setSectionFilter}
              placeholder="All Sections"
            />
          </div>

          <div className="lg:col-span-2 flex items-end">
            <Button 
              variant="outline" 
              className="h-9 w-full text-xs font-semibold"
              onClick={() => {
                setSearchTerm('');
                setDeptFilter(['All']);
                setSectionFilter(['All']);
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Staff</p>
          <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5">{kpiSummary.totalEmployees}</p>
        </div>

        <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200/60 dark:border-emerald-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Present (P)</p>
          <p className="text-base font-black text-emerald-700 dark:text-emerald-300 mt-0.5">{kpiSummary.totalP}</p>
        </div>

        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-3 rounded-xl border border-indigo-200/60 dark:border-indigo-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Present Off (PWO)</p>
          <p className="text-base font-black text-indigo-700 dark:text-indigo-300 mt-0.5">{kpiSummary.totalPWO}</p>
        </div>

        <div className="bg-teal-50/50 dark:bg-teal-950/20 p-3 rounded-xl border border-teal-200/60 dark:border-teal-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">Present OT (P+OT)</p>
          <p className="text-base font-black text-teal-700 dark:text-teal-300 mt-0.5">{kpiSummary.totalPOT}</p>
        </div>

        <div className="bg-sky-50/50 dark:bg-sky-950/20 p-3 rounded-xl border border-sky-200/60 dark:border-sky-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Holiday Worked (PPH)</p>
          <p className="text-base font-black text-sky-700 dark:text-sky-300 mt-0.5">{kpiSummary.totalPPH}</p>
        </div>

        <div className="bg-rose-50/50 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-200/60 dark:border-rose-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Absent (A)</p>
          <p className="text-base font-black text-rose-700 dark:text-rose-300 mt-0.5">{kpiSummary.totalA}</p>
        </div>

        <div className="bg-amber-50/50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Weekly Off (WO)</p>
          <p className="text-base font-black text-amber-700 dark:text-amber-300 mt-0.5">{kpiSummary.totalWO}</p>
        </div>

        <div className="bg-orange-50/50 dark:bg-orange-950/20 p-3 rounded-xl border border-orange-200/60 dark:border-orange-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">Single Punch (SPF)</p>
          <p className="text-base font-black text-orange-700 dark:text-orange-300 mt-0.5">{kpiSummary.totalSPF}</p>
        </div>
      </div>

      {/* Legend Ribbon */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800">
        <span className="font-bold text-slate-400 uppercase tracking-wider mr-2">Attendance Codes Legend:</span>
        {MUSTER_LEGEND.map(item => (
          <span 
            key={item.code} 
            className={cn("px-2 py-0.5 rounded border text-[10px] font-mono", item.bg)}
          >
            <strong>{item.code}</strong> = {item.label}
          </span>
        ))}
      </div>

      {/* Monthly Muster Matrix Table */}
      <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="overflow-x-auto max-h-[650px] custom-scrollbar relative">
          <table className="w-full text-left border-collapse text-[11px] min-w-[1500px]">
            
            {/* Table Header */}
            <thead className="bg-slate-900 text-white sticky top-0 z-30 shadow-sm">
              <tr>
                {/* Sticky Employee Columns Header */}
                <th className="p-2 w-8 text-center sticky left-0 z-40 bg-slate-900 border-r border-slate-800 font-bold">#</th>
                <th className="p-2 min-w-[90px] sticky left-8 z-40 bg-slate-900 border-r border-slate-800 font-bold">Emp ID</th>
                <th className="p-2 min-w-[150px] sticky left-[126px] z-40 bg-slate-900 border-r border-slate-800 font-bold">Employee Name</th>
                <th className="p-2 min-w-[100px] border-r border-slate-800 font-bold">Department</th>

                {/* Day Columns (01..31) */}
                {monthDays.map(d => (
                  <th 
                    key={d.dayNumber} 
                    className={cn(
                      "p-1 text-center min-w-[34px] max-w-[38px] border-r border-slate-800 font-mono",
                      d.isSaturday ? "bg-amber-900/60 text-amber-200 font-bold" : ""
                    )}
                  >
                    <div className="text-[11px] font-bold">{d.dayNumber < 10 ? `0${d.dayNumber}` : d.dayNumber}</div>
                    <div className="text-[8px] text-slate-400 uppercase font-sans">{d.dayOfWeek}</div>
                  </th>
                ))}

                {/* Exact Requested Summary Columns Header */}
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-emerald-400 font-bold" title="Present">P</th>
                <th className="p-1.5 text-center w-9 bg-slate-950 border-r border-slate-800 text-indigo-400 font-bold" title="Present in Weekly Off">PWO</th>
                <th className="p-1.5 text-center w-10 bg-slate-950 border-r border-slate-800 text-teal-400 font-bold" title="Present + OT">P+OT</th>
                <th className="p-1.5 text-center w-9 bg-slate-950 border-r border-slate-800 text-sky-400 font-bold" title="Present in Public Holiday">PPH</th>
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-rose-400 font-bold" title="Absent">A</th>
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-amber-400 font-bold" title="Weekly Off">WO</th>
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-blue-400 font-bold" title="Public Holiday">PH</th>
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-purple-400 font-bold" title="Approved Leave">L</th>
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-orange-400 font-bold" title="Miss In">MI</th>
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-orange-400 font-bold" title="Miss Out">MO</th>
                <th className="p-1.5 text-center w-8 bg-slate-950 border-r border-slate-800 text-amber-400 font-bold" title="Single Punch">SPF</th>
                <th className="p-1.5 text-center w-11 bg-slate-950 text-teal-400 font-bold" title="OT Hours">OT Hrs</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-transparent">
              {filteredEmployees.length > 0 ? filteredEmployees.map((emp, index) => {
                const totals = employeeTotals.get(emp.id) || { P: 0, PWO: 0, POT: 0, PPH: 0, A: 0, WO: 0, PH: 0, L: 0, MI: 0, MO: 0, SPF: 0, OT: 0 };

                return (
                  <tr 
                    key={emp.id} 
                    className="hover:bg-indigo-50/30 dark:hover:bg-slate-800/40 transition-colors group"
                  >
                    {/* Sticky Employee Columns */}
                    <td className="p-1.5 text-center sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-indigo-50/50 dark:group-hover:bg-slate-800 border-r border-slate-200/80 dark:border-slate-800 text-slate-400 font-mono text-[10px]">
                      {index + 1}
                    </td>

                    <td className="p-1.5 font-mono font-bold text-slate-700 dark:text-slate-300 sticky left-8 z-20 bg-white dark:bg-slate-900 group-hover:bg-indigo-50/50 dark:group-hover:bg-slate-800 border-r border-slate-200/80 dark:border-slate-800 text-[10px]">
                      {emp.id}
                    </td>

                    <td className="p-1.5 font-medium text-slate-900 dark:text-slate-100 sticky left-[126px] z-20 bg-white dark:bg-slate-900 group-hover:bg-indigo-50/50 dark:group-hover:bg-slate-800 border-r border-slate-200/80 dark:border-slate-800 truncate max-w-[150px] text-[11px]">
                      {emp.name}
                    </td>

                    <td className="p-1.5 text-slate-500 dark:text-slate-400 border-r border-slate-200/80 dark:border-slate-800 truncate max-w-[100px] text-[10px]">
                      {emp.department || '-'}
                    </td>

                    {/* Matrix Cells */}
                    {monthDays.map(d => {
                      const { code, bg } = getCellStatus(emp, d);
                      return (
                        <td 
                          key={d.dayNumber}
                          onClick={() => handleCellClick(emp, d)}
                          className={cn(
                            "p-0.5 text-center border-r border-slate-100 dark:border-slate-800/60 cursor-pointer hover:ring-2 hover:ring-indigo-500 hover:z-10 transition-all select-none",
                            d.isSaturday ? "bg-amber-50/40 dark:bg-amber-950/20" : ""
                          )}
                          title={`Click for details: ${emp.name} (${d.bsDateStr})`}
                        >
                          <span className={cn(
                            "inline-block w-full py-0.5 rounded text-[9px] font-mono leading-none transition-transform hover:scale-105",
                            bg
                          )}>
                            {code}
                          </span>
                        </td>
                      );
                    })}

                    {/* Summary Totals Columns */}
                    <td className="p-1 text-center font-bold text-emerald-700 dark:text-emerald-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.P}
                    </td>

                    <td className="p-1 text-center font-bold text-indigo-700 dark:text-indigo-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.PWO}
                    </td>

                    <td className="p-1 text-center font-bold text-teal-700 dark:text-teal-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.POT}
                    </td>

                    <td className="p-1 text-center font-bold text-sky-700 dark:text-sky-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.PPH}
                    </td>

                    <td className="p-1 text-center font-bold text-rose-700 dark:text-rose-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.A}
                    </td>

                    <td className="p-1 text-center font-bold text-amber-700 dark:text-amber-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.WO}
                    </td>

                    <td className="p-1 text-center font-bold text-blue-700 dark:text-blue-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.PH}
                    </td>

                    <td className="p-1 text-center font-bold text-purple-700 dark:text-purple-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.L}
                    </td>

                    <td className="p-1 text-center font-bold text-orange-700 dark:text-orange-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.MI}
                    </td>

                    <td className="p-1 text-center font-bold text-orange-700 dark:text-orange-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.MO}
                    </td>

                    <td className="p-1 text-center font-bold text-amber-700 dark:text-amber-400 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200/80 dark:border-slate-800 font-mono">
                      {totals.SPF}
                    </td>

                    <td className="p-1 text-center font-bold text-teal-700 dark:text-teal-400 bg-slate-50/80 dark:bg-slate-900/80 font-mono">
                      {totals.OT.toFixed(1)}
                    </td>

                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={monthDays.length + 16} className="p-12 text-center text-slate-400 italic">
                    No employee records found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cell Detail Modal */}
      <MusterCellModal 
        isOpen={cellModal.isOpen}
        onClose={() => setCellModal(prev => ({ ...prev, isOpen: false }))}
        employee={cellModal.employee}
        bsDateStr={cellModal.bsDateStr}
        adDateStr={cellModal.adDateStr}
        dayOfWeek={cellModal.dayOfWeek}
        processedRecord={cellModal.processedRecord}
        shift={cellModal.shift}
        rawPunches={cellModal.rawPunches}
      />

      {/* Manual Attendance Import Modal */}
      <ManualAttendanceImportModal 
        isOpen={isManualImportOpen}
        onClose={() => setIsManualImportOpen(false)}
      />
    </div>
  );
}
