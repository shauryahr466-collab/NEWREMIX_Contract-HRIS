import React, { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO, isToday, subMonths, addMonths } from 'date-fns';
import { AlertTriangle, Calendar, Star } from 'lucide-react';
import { ProcessedAttendance } from '../types';
import { useAppStore } from '../store';
import { formatAMPM, formatDuration } from '../lib/utils';
import NepaliDate from 'nepali-date-converter';

interface AttendanceHeatmapProps {
  employeeId: string;
  month: Date;
  data: ProcessedAttendance[];
  onDayClick?: (date: string) => void;
  onMonthChange?: (month: Date) => void;
}

interface DayCellProps {
  day: Date;
  record: ProcessedAttendance | undefined;
  employeeId: string;
  onDayClick?: (date: string) => void;
  shiftAssignments: any[];
  employees: any[];
  settings: any;
}

const DayCell = React.memo(({ day, record, employeeId, onDayClick, shiftAssignments, employees, settings }: DayCellProps) => {
  const status = record?.status || 'Unknown';
  const isTdy = isToday(day);
  const dateStr = format(day, 'yyyy-MM-dd');
  const assignment = shiftAssignments.find(a => a.employeeId === employeeId && a.date === dateStr);
  const emp = employees.find(e => e.id === employeeId);
  const shift = settings.shifts?.find(s => (s as any).id === (assignment?.shiftId || emp?.shiftId));
  const holiday = settings.holidays?.find((h: any) => h.date === dateStr);
  
  const expectedHr = record?.expectedHours || 8;
  const deviation = record ? Math.abs(record.workingHours - expectedHr) : 0;
  const isDeviated = record && record.firstPunch && record.lastPunch && deviation > (expectedHr * 0.2);

  const toDevanagari = (num: number | string) => {
    const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().split('').map(digit => devanagariDigits[parseInt(digit)] || digit).join('');
  };

  return (
    <div 
      onClick={() => onDayClick?.(dateStr)}
      className={`min-h-[120px] flex flex-col border border-slate-200 transition-all hover:bg-slate-50 group relative cursor-pointer
        ${isTdy ? 'bg-indigo-50/10' : 'bg-white'}
      `}
    >
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 text-white rounded-lg p-2 text-[10px] invisible group-hover:visible z-50 shadow-xl animate-in fade-in slide-in-from-bottom-1 pointer-events-none">
        <div className="flex justify-between border-b border-white/10 pb-1 mb-1">
          <span className="font-bold opacity-70 uppercase tracking-tighter">{format(day, 'EEE, MMM dd')}</span>
          <span className="font-black text-indigo-400">{status}</span>
        </div>
        {record && (
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>In:</span>
              <span className="font-mono text-emerald-400">{formatAMPM(record.firstPunch)}</span>
            </div>
            <div className="flex justify-between">
              <span>Out:</span>
              <span className="font-mono text-amber-400">{record.lastPunch ? formatAMPM(record.lastPunch) : '---'}</span>
            </div>
          </div>
        )}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900" />
      </div>

      <div className="flex justify-end p-1 relative z-10">
        <span className={`text-[24px] font-medium leading-none ${day.getDay() === 0 || holiday ? 'text-rose-500' : 'text-slate-600'}`} style={{ fontFamily: 'serif' }}>
          {toDevanagari(new NepaliDate(day).getDate())}
        </span>
      </div>
      
      <div className="flex-1 px-0.5 flex flex-col relative z-10">
        {record ? (
          <>
            <div className={`px-1 py-0.5 text-[9px] font-bold text-white truncate leading-tight uppercase
              ${status === 'Present' ? 'bg-[#4caf50]' : 
                status === 'Absent' ? 'bg-[#f44336]' :
                status === 'Weekly Off' ? 'bg-[#b0bec5]' :
                status === 'SPF' ? 'bg-[#00bcd4]' :
                'bg-slate-300'}
            `}>
              {status === 'Weekly Off' ? 'WeeklyOff' : status}
            </div>

            {record.overtime > 0 && (
               <div className="px-1 py-0.5 bg-indigo-600 text-white text-[8px] font-bold uppercase leading-tight truncate">
                 OT: {record.overtime}h
               </div>
            )}

            {record.firstPunch && (
              <div className="px-1 py-0.5 text-[9px] font-bold truncate leading-tight bg-[#a7d7b5] text-slate-800">
                In-{formatAMPM(record.firstPunch)},Out-{record.lastPunch ? formatAMPM(record.lastPunch) : '--:--'}
              </div>
            )}
            
            {status === 'SPF' && record.firstPunch && (
               <div className="px-1 py-0.5 bg-[#00bcd4] text-white text-[9px] font-bold uppercase leading-tight truncate">
                 Missed
               </div>
            )}

            <div className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-tighter truncate leading-tight bg-[#8cc59d] text-white">
              {shift?.name || 'DS'}
            </div>
            
            <div className="mt-auto p-0.5 text-[9px] font-bold text-slate-400">
               {format(day, 'd')}
            </div>
          </>
        ) : status === 'Weekly Off' ? (
          <>
            <div className="px-1 py-0.5 bg-[#b0bec5] text-[9px] font-bold text-white uppercase leading-tight truncate">
              WeeklyOff
            </div>
            <div className="px-1 py-0.5 bg-[#8cc59d] text-[9px] font-bold text-white uppercase leading-tight truncate">
              {shift?.name || 'DS'}
            </div>
            <div className="mt-auto p-0.5 text-[9px] font-bold text-rose-500">
               {format(day, 'd')}
            </div>
          </>
        ) : holiday ? (
          <>
            <div className="px-1 py-0.5 bg-[#f44336] text-[9px] font-bold text-white uppercase leading-tight truncate">
              {holiday.name}
            </div>
            <div className="mt-auto p-0.5 text-[9px] font-bold text-rose-500">
               {format(day, 'd')}
            </div>
          </>
        ) : (
          <div className="mt-auto p-0.5 text-[9px] font-bold text-slate-300">
             {format(day, 'd')}
          </div>
        )}
      </div>
    </div>
  );
});

export function AttendanceHeatmap({ employeeId, month, data, onDayClick, onMonthChange }: AttendanceHeatmapProps) {
  const { settings, shiftAssignments, employees } = useAppStore();
  
  // BS Navigation logic
  const nepaliDate = useMemo(() => new NepaliDate(month), [month]);
  const bsYear = nepaliDate.getYear();
  const bsMonth = nepaliDate.getMonth(); // 0-11
  
  // BS Calendar Info
  const BS_MONTH_NAMES = ['बैसाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत'];
  const NP_DAYS = ['आ', 'सो', 'मं', 'बु', 'बि', 'शु', 'श'];

  const toDevanagari = (num: number | string) => {
    const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().split('').map(digit => devanagariDigits[parseInt(digit)] || digit).join('');
  };

  // Calculate BS month start and end dates in AD
  const bsStartInAD = useMemo(() => {
    const d = new NepaliDate(bsYear, bsMonth, 1);
    return d.toJsDate();
  }, [bsYear, bsMonth]);

  const bsEndInAD = useMemo(() => {
    // To get end of month, we can go to start of next month and subtract 1 day
    const nextM = bsMonth === 11 ? 0 : bsMonth + 1;
    const nextY = bsMonth === 11 ? bsYear + 1 : bsYear;
    const nextD = new NepaliDate(nextY, nextM, 1);
    const jsDateBoundary = nextD.toJsDate();
    jsDateBoundary.setDate(jsDateBoundary.getDate() - 1);
    return jsDateBoundary;
  }, [bsYear, bsMonth]);

  const daysInBSMonth = useMemo(() => {
    return eachDayOfInterval({ start: bsStartInAD, end: bsEndInAD });
  }, [bsStartInAD, bsEndInAD]);

  const getDayRecord = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return data.find(r => r.employeeId === employeeId && r.date === dateStr);
  };

  const handlePrev = () => {
    const newMonth = bsMonth === 0 ? 11 : bsMonth - 1;
    const newYear = bsMonth === 0 ? bsYear - 1 : bsYear;
    onMonthChange?.(new NepaliDate(newYear, newMonth, 1).toJsDate());
  };

  const handleNext = () => {
    const newMonth = bsMonth === 11 ? 0 : bsMonth + 1;
    const newYear = bsMonth === 11 ? bsYear + 1 : bsYear;
    onMonthChange?.(new NepaliDate(newYear, newMonth, 1).toJsDate());
  };

  const adMonthRange = useMemo(() => {
    const startM = format(bsStartInAD, 'MMM');
    const endM = format(bsEndInAD, 'MMM');
    const year = format(bsStartInAD, 'yyyy');
    if (startM === endM) return `${startM.toUpperCase()} ${year}`;
    return `${startM.toUpperCase()} / ${endM.toUpperCase()} ${year}`;
  }, [bsStartInAD, bsEndInAD]);

  return (
    <div className="flex flex-col gap-1 w-full max-w-full">
      {/* BS Navigation Header */}
      <div className="flex items-center justify-between gap-1 mb-2 bg-white p-2">
        <button 
          onClick={handlePrev}
          className="bg-[#4e96c8] text-white px-8 py-2 hover:bg-[#3d85b7] transition-colors rounded shadow-sm text-xl font-bold"
        >
          «
        </button>
        
        <div className="flex flex-col items-center">
            <div className="flex items-center gap-2">
              <select 
                className="border border-slate-300 rounded px-3 py-2 text-lg bg-white font-bold outline-none focus:ring-2 focus:ring-[#4e96c8]/20"
                value={bsMonth}
                onChange={(e) => {
                  const newDate = new NepaliDate(bsYear, parseInt(e.target.value), 1);
                  onMonthChange?.(newDate.toJsDate());
                }}
              >
                {BS_MONTH_NAMES.map((m, i) => (
                   <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select 
                className="border border-slate-300 rounded px-3 py-2 text-lg bg-white font-bold outline-none focus:ring-2 focus:ring-[#4e96c8]/20"
                value={bsYear}
                onChange={(e) => {
                  const newDate = new NepaliDate(parseInt(e.target.value), bsMonth, 1);
                  onMonthChange?.(newDate.toJsDate());
                }}
              >
                {[2080, 2081, 2082, 2083, 2084, 2085].map(y => (
                   <option key={y} value={y}>{toDevanagari(y)}</option>
                ))}
              </select>
            </div>
            <div className="text-[#303f9f] font-serif text-sm uppercase tracking-[0.2em] font-black mt-1">
              {adMonthRange}
            </div>
        </div>

        <button 
          onClick={handleNext}
          className="bg-[#4e96c8] text-white px-8 py-2 hover:bg-[#3d85b7] transition-colors rounded shadow-sm text-xl font-bold"
        >
          »
        </button>
      </div>

      {/* Date Detail Label */}
      <div className="text-center mb-4 bg-slate-50 py-2 rounded border border-slate-100">
        <span className="text-slate-500 font-mono text-[11px] uppercase space-x-2">
          <span className="font-bold text-slate-800">BS {toDevanagari(bsYear)}/{toDevanagari(bsMonth + 1 < 10 ? '0' + (bsMonth + 1) : bsMonth + 1)}/०१</span>
          <span className="opacity-50">({format(bsStartInAD, 'yyyy MMM dd')} – {format(bsStartInAD, 'EEE')} – {NP_DAYS[bsStartInAD.getDay()]})</span>
          <span className="px-2 font-black text-slate-300">TO</span>
          <span className="font-bold text-slate-800">BS {toDevanagari(bsYear)}/{toDevanagari(bsMonth + 1 < 10 ? '0' + (bsMonth + 1) : bsMonth + 1)}/{toDevanagari(daysInBSMonth.length)}</span>
          <span className="opacity-50">({format(bsEndInAD, 'yyyy MMM dd')} – {format(bsEndInAD, 'EEE')} – {NP_DAYS[bsEndInAD.getDay()]})</span>
        </span>
      </div>

      <div className="bg-white border border-[#e0e0e0] overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-[#e0e0e0] bg-slate-50/30">
          {[
            { hi: 'आ', en: 'SUN' },
            { hi: 'सो', en: 'MON' },
            { hi: 'मं', en: 'TUE' },
            { hi: 'बु', en: 'WED' },
            { hi: 'बि', en: 'THU' },
            { hi: 'शु', en: 'FRI' },
            { hi: 'श', en: 'SAT' }
          ].map(d => (
            <div key={d.en} className="flex flex-col items-center py-2 bg-transparent border-r border-[#e0e0e0] last:border-r-0">
              <span className="text-[12px] font-black text-slate-700">{d.hi}</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{d.en}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 border-t border-[#e0e0e0]">
          {/* Padding for start of BS month based on its AD start weekday */}
          {Array.from({ length: bsStartInAD.getDay() }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[120px] bg-slate-50/50 border-r border-[#e0e0e0] border-b border-[#e0e0e0]"></div>
          ))}
          {daysInBSMonth.map(day => (
            <DayCell 
              key={day.toISOString()}
              day={day}
              record={getDayRecord(day)}
              employeeId={employeeId}
              onDayClick={onDayClick}
              shiftAssignments={shiftAssignments}
              employees={employees}
              settings={settings}
            />
          ))}
          {/* Padding at the end to complete the grid */}
          {daysInBSMonth.length > 0 && Array.from({ length: (7 - ((bsStartInAD.getDay() + daysInBSMonth.length) % 7)) % 7 }).map((_, i) => (
            <div key={`pad-end-${i}`} className="min-h-[120px] bg-slate-50/50 border-r border-[#e0e0e0] border-b border-[#e0e0e0]"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
