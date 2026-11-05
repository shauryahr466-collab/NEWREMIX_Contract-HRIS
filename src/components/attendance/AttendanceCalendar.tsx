import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { 
  getNepaliMonthDays, 
  NEPALI_MONTHS, 
  getCurrentNepaliDateInfo,
  getNepaliMonthEnglishEquivalent,
  toNepaliDigits 
} from '../../utils/nepaliCalendar';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, User, Filter, 
  Clock, CheckCircle2, XCircle, AlertTriangle, Info, Search, Pin, X, Settings as SettingsIcon,
  CalendarRange
} from 'lucide-react';
import { Card, Button, Input } from '../ui';
import { MusterCellModal } from './MusterCellModal';
import { Employee, ProcessedAttendance, ShiftMaster, RawPunch } from '../../types';
import { formatAMPM, cn, toDeviceWallClockIso } from '../../lib/utils';
import { parseISO, format, isWithinInterval, parse } from 'date-fns';

export function AttendanceCalendar() {
  const { employees, processedData, settings, shiftAssignments, punches } = useAppStore();

  const currentInfo = getCurrentNepaliDateInfo();
  const [selectedYear, setSelectedYear] = useState<number>(currentInfo.year);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(currentInfo.monthIndex);

  // Date Mode: 'month' or 'custom'
  const [dateMode, setDateMode] = useState<'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-07-17');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-08-16');

  // Selected Employee for Calendar
  const [selectedEmpId, setSelectedEmpId] = useState<string>(() => employees[0]?.id || '');
  const [selectAllEmp, setSelectAllEmp] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('All');

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

  // Selected Employee object
  const selectedEmp = useMemo(() => {
    return employees.find(e => e.id === selectedEmpId) || employees[0] || null;
  }, [employees, selectedEmpId]);

  // Days list for the selected Nepali Month or Custom Date Range
  const fullMonthDays = useMemo(() => {
    return getNepaliMonthDays(selectedYear, selectedMonthIndex);
  }, [selectedYear, selectedMonthIndex]);

  const activeDays = useMemo(() => {
    if (dateMode === 'month') return fullMonthDays;

    // Filter or construct days for custom date range
    if (!customStartDate || !customEndDate) return fullMonthDays;
    return fullMonthDays.filter(d => {
      return d.adDateStr >= customStartDate && d.adDateStr <= customEndDate;
    });
  }, [dateMode, fullMonthDays, customStartDate, customEndDate]);

  // English Equivalent text
  const englishEquiv = useMemo(() => {
    if (dateMode === 'month') {
      return getNepaliMonthEnglishEquivalent(selectedYear, selectedMonthIndex);
    }
    return `${customStartDate} to ${customEndDate}`;
  }, [dateMode, selectedYear, selectedMonthIndex, customStartDate, customEndDate]);

  // Calendar Offset calculation for 7-column Sun-Sat grid
  // Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  const paddingDaysOffset = useMemo(() => {
    if (fullMonthDays.length === 0) return 0;
    const firstDay = fullMonthDays[0];
    const dayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };
    return dayMap[firstDay.dayOfWeek] || 0;
  }, [fullMonthDays]);

  const yearOptions = [2080, 2081, 2082, 2083, 2084, 2085];

  // Filtered employees for dropdown
  const filteredEmployeesList = useMemo(() => {
    const sLower = searchTerm.toLowerCase();
    return employees.filter(e => {
      const matchSearch = !searchTerm || e.id.toLowerCase().includes(sLower) || e.name.toLowerCase().includes(sLower);
      const matchDept = deptFilter === 'All' || e.department === deptFilter;
      return matchSearch && matchDept;
    });
  }, [employees, searchTerm, deptFilter]);

  // Map processed data for quick lookup
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

  // Navigation
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

  // Helper for status styling & badges
  const getDayStatusDetails = (day: typeof fullMonthDays[0]) => {
    if (!selectedEmp) return null;
    const key = `${selectedEmp.id}_${day.adDateStr}`;
    const record = processedDataMap.get(key);
    
    const isHoliday = settings.holidays?.some(h => h.date === day.adDateStr);
    const isWeeklyOff = day.isSaturday || selectedEmp.weeklyOff?.toLowerCase() === day.dayOfWeek.toLowerCase();

    // Find shift assigned for this employee on this date
    const assignment = shiftAssignments.find(a => a.employeeId === selectedEmp.id && a.date === day.adDateStr);
    const assignedShift = settings.shifts?.find(s => s.id === (assignment?.shiftId || selectedEmp.shiftId)) || settings.shifts?.[0];
    
    // Derive concise shift code
    const shiftCode = assignedShift ? (
      assignedShift.name === 'Day Shift' || assignedShift.name === 'Day' ? 'DS' :
      assignedShift.name === 'Night Shift' || assignedShift.name === 'Night' ? 'NS' :
      assignedShift.name === 'Morning Shift' || assignedShift.name === 'Morning' ? 'MS' :
      assignedShift.name === 'General Shift' || assignedShift.name === 'General' ? 'GS' :
      assignedShift.name.length <= 4 ? assignedShift.name :
      assignedShift.name.split(/\s+/).map(w => w[0]).join('').toUpperCase() || 'DS'
    ) : 'DS';

    const isOverrideShift = !!assignment?.shiftId;

    const inTimeStr = record?.firstPunch ? formatAMPM(record.firstPunch) : null;
    const outTimeStr = (record?.lastPunch && record.lastPunch !== record.firstPunch)
      ? formatAMPM(record.lastPunch)
      : null;

    if (!record) {
      if (isWeeklyOff) {
        return {
          statusText: 'WeeklyOff',
          code: 'WO',
          bg: 'bg-slate-100/90 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700',
          statusBadge: 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200',
          timeBadge: null,
          lateBadge: null,
          shiftBadge: shiftCode,
          assignedShift,
          isOverrideShift,
          record: null
        };
      }
      if (isHoliday) {
        return {
          statusText: 'Public Holiday',
          code: 'PH',
          bg: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50',
          statusBadge: 'bg-sky-500 text-white',
          timeBadge: null,
          lateBadge: null,
          shiftBadge: shiftCode,
          assignedShift,
          isOverrideShift,
          record: null
        };
      }
      return {
        statusText: 'Absent',
        code: 'A',
        bg: 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40',
        statusBadge: 'bg-red-600 text-white',
        timeBadge: 'Missed',
        timeBadgeStyle: 'bg-cyan-500 text-white',
        lateBadge: null,
        shiftBadge: shiftCode,
        assignedShift,
        isOverrideShift,
        record: null
      };
    }

    if (record.status === 'PWO') {
      return {
        statusText: 'Present on Off',
        code: 'PWO',
        bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50',
        statusBadge: 'bg-emerald-600 text-white',
        timeBadge: inTimeStr ? `In-${inTimeStr},Out-${outTimeStr || ''}` : 'In-10:00,Out-18:30',
        timeBadgeStyle: 'bg-emerald-800 text-white',
        lateBadge: null,
        shiftBadge: shiftCode,
        assignedShift,
        isOverrideShift,
        record
      };
    }

    if (record.status === 'Weekly Off') {
      return {
        statusText: 'WeeklyOff',
        code: 'WO',
        bg: 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700',
        statusBadge: 'bg-slate-400 dark:bg-slate-600 text-white',
        timeBadge: null,
        lateBadge: null,
        shiftBadge: shiftCode,
        assignedShift,
        isOverrideShift,
        record
      };
    }

    // Present / On Time / Late
    const isLate = record.lateMinutes > 0 || record.status === 'Late';
    const timeText = inTimeStr ? `In-${inTimeStr},Out-${outTimeStr || ''}` : 'In-10:00,Out-18:30';

    if (record.status === 'Absent') {
      return {
        statusText: 'Absent',
        code: 'A',
        bg: 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40',
        statusBadge: 'bg-red-600 text-white',
        timeBadge: 'Missed',
        timeBadgeStyle: 'bg-cyan-500 text-white',
        lateBadge: isLate ? 'LateBy' : null,
        shiftBadge: shiftCode,
        assignedShift,
        isOverrideShift,
        record
      };
    }

    return {
      statusText: 'Present',
      code: 'P',
      bg: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50',
      statusBadge: 'bg-emerald-600 text-white',
      timeBadge: timeText,
      timeBadgeStyle: 'bg-emerald-700 text-white',
      lateBadge: isLate ? 'LateBy' : null,
      shiftBadge: shiftCode,
      assignedShift,
      isOverrideShift,
      record
    };
  };

  // Open modal for day detail
  const handleDayClick = (day: typeof fullMonthDays[0]) => {
    if (!selectedEmp) return;
    const key = `${selectedEmp.id}_${day.adDateStr}`;
    const record = processedDataMap.get(key) || null;
    const rawP = punchesByEmpDate.get(key) || [];
    
    const assignment = shiftAssignments.find(a => a.employeeId === selectedEmp.id && a.date === day.adDateStr);
    const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || selectedEmp.shiftId)) || null;

    setCellModal({
      isOpen: true,
      employee: selectedEmp,
      bsDateStr: day.bsDateStr,
      adDateStr: day.adDateStr,
      dayOfWeek: day.dayOfWeek,
      processedRecord: record,
      shift,
      rawPunches: rawP
    });
  };

  // Monthly Right Sidebar KPI Metrics calculation
  const calendarMetrics = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leave = 0;
    let dayOff = 0;
    let holiday = 0;
    let fieldwork = 0;
    let lateBy = 0;
    let earlyBy = 0;

    activeDays.forEach(d => {
      const details = getDayStatusDetails(d);
      if (!details) return;

      if (details.code === 'P' || details.code === 'PWO' || details.code === 'P+OT') {
        present++;
      } else if (details.code === 'A') {
        absent++;
      } else if (details.code === 'WO') {
        dayOff++;
      } else if (details.code === 'PH') {
        holiday++;
      } else if (details.code === 'LEAVE' || details.code === 'L') {
        leave++;
      }

      if (details.lateBadge === 'LateBy') lateBy++;
    });

    const totalDays = activeDays.length || 31;

    return {
      present,
      absent,
      leave,
      dayOff,
      holiday,
      fieldwork,
      lateBy,
      earlyBy,
      totalDays
    };
  }, [activeDays, selectedEmp, processedDataMap]);

  return (
    <div className="space-y-4">
      
      {/* Top Filter & Toolbar matching screenshot template */}
      <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        
        {/* Title & Toolbar Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              Attendance Calendar
            </h2>
            <button className="text-xs text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1 hover:underline">
              <Filter size={13} /> Filter
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white font-bold gap-1">
              <Pin size={12} /> Unpin
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1">
              <X size={12} /> Close
            </Button>
          </div>
        </div>

        {/* Employee Search & Controls Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          <div className="md:col-span-6 flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Employee Name / ID
              </label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="w-full h-9 px-3 text-xs font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
              >
                {filteredEmployeesList.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.id}) - {e.department || 'General'}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-bold mt-4 cursor-pointer">
              <input 
                type="checkbox" 
                checked={selectAllEmp} 
                onChange={(e) => setSelectAllEmp(e.target.checked)}
                className="rounded text-sky-600 focus:ring-sky-500" 
              />
              All
            </label>

            <button className="p-2 mt-4 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              <SettingsIcon size={16} />
            </button>
          </div>

          {/* Date Range or Month Picker Switcher */}
          <div className="md:col-span-6 flex items-center justify-end gap-2">
            
            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setDateMode('month')}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded transition-all",
                  dateMode === 'month' ? "bg-sky-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                )}
              >
                Month View
              </button>
              <button
                type="button"
                onClick={() => setDateMode('custom')}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold rounded transition-all flex items-center gap-1",
                  dateMode === 'custom' ? "bg-sky-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-400"
                )}
              >
                <CalendarRange size={12} /> Custom Date Range
              </button>
            </div>

            {dateMode === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs">
                <input 
                  type="date" 
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-8 px-2 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                <span className="text-slate-400">to</span>
                <input 
                  type="date" 
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-8 px-2 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            )}

            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white font-bold gap-1 h-9 px-4">
              <Search size={14} /> Search
            </Button>
          </div>

        </div>

      </div>

      {/* Main Calendar View Grid + Right KPI Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Calendar Matrix (9 Columns) */}
        <div className="lg:col-span-9 space-y-3">
          
          {/* Calendar Header Navigation Row */}
          <div className="flex items-center justify-between bg-sky-700 text-white p-2.5 rounded-t-xl font-bold text-xs">
            
            <button 
              onClick={handlePrevMonth}
              className="p-1 rounded hover:bg-sky-600 transition text-white font-mono"
            >
              «
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white">{NEPALI_MONTHS[selectedMonthIndex].nepaliName} ({NEPALI_MONTHS[selectedMonthIndex].name})</span>
              <span>v</span>
              <span className="font-mono">{toNepaliDigits(selectedYear)}</span>
              <span>v</span>
              <span className="text-sky-200 font-mono text-[11px]">JUL/AUG {selectedYear - 57}</span>
            </div>

            <button 
              onClick={handleNextMonth}
              className="p-1 rounded hover:bg-sky-600 transition text-white font-mono"
            >
              »
            </button>

          </div>

          {/* Calendar Table Grid */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-b-xl overflow-hidden shadow-xs">
            
            {/* 7-Days Week Header */}
            <div className="grid grid-cols-7 text-center font-bold text-xs border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 py-2 text-slate-700 dark:text-slate-200">
              <div>आ: SUN</div>
              <div>सो: MON</div>
              <div>मं: TUE</div>
              <div>बु: WED</div>
              <div>बि: THU</div>
              <div>शु: FRI</div>
              <div className="text-red-500 font-black">श: SAT</div>
            </div>

            {/* Calendar Cells Grid */}
            <div className="grid grid-cols-7 gap-1 p-2 bg-slate-100/50 dark:bg-slate-950/40">
              
              {/* Padding offset blank cells for Sun..Thu if month starts on Friday */}
              {Array.from({ length: paddingDaysOffset }).map((_, idx) => (
                <div key={`offset_${idx}`} className="bg-slate-50/30 dark:bg-slate-900/20 min-h-[110px] rounded border border-transparent" />
              ))}

              {/* Day Tiles */}
              {activeDays.map(day => {
                const details = getDayStatusDetails(day);

                return (
                  <div 
                    key={day.dayNumber}
                    onClick={() => handleDayClick(day)}
                    className={cn(
                      "p-1.5 rounded-lg border transition-all cursor-pointer hover:shadow-md flex flex-col justify-between min-h-[115px] relative bg-white dark:bg-slate-900",
                      details?.bg
                    )}
                  >
                    {/* Date Numbers Row: Top-Left AD Date, Top-Right Nepali Numeral */}
                    <div className="flex items-start justify-between font-mono leading-none">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {format(parseISO(day.adDateStr), 'dd')}
                      </span>
                      <span className={cn(
                        "text-xs font-black",
                        day.isSaturday ? "text-red-500" : "text-slate-800 dark:text-slate-100"
                      )}>
                        {toNepaliDigits(day.dayNumber)}
                      </span>
                    </div>

                    {/* Badges Stack matching template */}
                    <div className="space-y-1 mt-1">
                      
                      {/* Main Status Badge */}
                      {details?.statusText && (
                        <div className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold text-center truncate shadow-2xs",
                          details.statusBadge
                        )}>
                          {details.statusText}
                        </div>
                      )}

                      {/* Time Badge */}
                      {details?.timeBadge && (
                        <div className={cn(
                          "px-1 py-0.5 rounded text-[9px] font-mono text-center truncate",
                          details.timeBadgeStyle || "bg-emerald-600 text-white"
                        )}>
                          {details.timeBadge}
                        </div>
                      )}

                      {/* Late / Early Badge */}
                      {details?.lateBadge && (
                        <div className="px-1 py-0.5 rounded text-[9px] font-bold text-center bg-orange-500 text-white truncate">
                          {details.lateBadge}
                        </div>
                      )}

                      {/* Shift Badge */}
                      {details?.shiftBadge && (
                        <div 
                          title={`Shift: ${details.assignedShift?.name || 'Day Shift'} (${details.assignedShift?.startTime || '09:00'} - ${details.assignedShift?.endTime || '18:00'})${details.isOverrideShift ? ' • Custom Shift Assigned' : ''}`}
                          className={cn(
                            "px-1 py-0.5 rounded text-[9px] font-bold text-center transition-all truncate flex items-center justify-center gap-1",
                            details.isOverrideShift
                              ? "bg-indigo-600 text-white shadow-2xs font-extrabold"
                              : "bg-emerald-400 text-slate-900 dark:bg-emerald-600 dark:text-white"
                          )}
                        >
                          <span>{details.shiftBadge}</span>
                          {details.isOverrideShift && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse shrink-0" title="Custom Shift Override Assigned" />
                          )}
                        </div>
                      )}

                    </div>

                  </div>
                );
              })}

            </div>

          </div>

        </div>

        {/* Right Side Summary Metrics Panel matching template */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
              Monthly Summary Stats
            </h3>

            <div className="space-y-2.5 text-xs">
              
              {/* Present */}
              <div>
                <div className="flex items-center justify-between font-bold text-sky-700 dark:text-sky-300">
                  <span>Present</span>
                  <span>{calendarMetrics.present} / {calendarMetrics.totalDays}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-1">
                  <div 
                    className="bg-sky-500 h-full rounded-full" 
                    style={{ width: `${(calendarMetrics.present / calendarMetrics.totalDays) * 100}%` }}
                  />
                </div>
              </div>

              {/* Absent */}
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <span>Absent</span>
                <span className="text-red-600 font-mono">{calendarMetrics.absent} / {calendarMetrics.totalDays}</span>
              </div>

              {/* Leave */}
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <span>Leave</span>
                <span className="text-indigo-600 font-mono">{calendarMetrics.leave} / {calendarMetrics.totalDays}</span>
              </div>

              {/* Day Off */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold">
                  <span>Day Off</span>
                  <span className="text-emerald-600 font-mono">{calendarMetrics.dayOff} / {calendarMetrics.totalDays}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(calendarMetrics.dayOff / calendarMetrics.totalDays) * 100}%` }} />
                </div>
              </div>

              {/* Holiday */}
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <span>Holiday</span>
                <span className="text-sky-600 font-mono">{calendarMetrics.holiday} / {calendarMetrics.totalDays}</span>
              </div>

              {/* Fieldwork */}
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <span>Fieldwork</span>
                <span className="text-purple-600 font-mono">{calendarMetrics.fieldwork} / {calendarMetrics.totalDays}</span>
              </div>

              {/* Late By */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold">
                  <span>Late By</span>
                  <span className="text-amber-600 font-mono">{calendarMetrics.lateBy} / {calendarMetrics.totalDays}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(calendarMetrics.lateBy / calendarMetrics.totalDays) * 100}%` }} />
                </div>
              </div>

              {/* Early By */}
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 font-bold pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <span>Early By</span>
                <span className="text-orange-600 font-mono">{calendarMetrics.earlyBy} / {calendarMetrics.totalDays}</span>
              </div>

            </div>
          </Card>
        </div>

      </div>

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

    </div>
  );
}
