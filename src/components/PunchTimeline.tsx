import React, { useState } from 'react';
import { format, parseISO, addDays, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { Plus, Trash2, Clock } from 'lucide-react';
import { ProcessedAttendance } from '../types';
import { formatAMPM } from '../lib/utils';
import { useAppStore } from '../store';

interface PunchTimelineProps {
  record: ProcessedAttendance;
}

export function PunchTimeline({ record }: PunchTimelineProps) {
  const { addPunch, deletePunch, punches: allRawPunches } = useAppStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newTime, setNewTime] = useState('09:00');

  const punches = record.rawLogs || record.logs;
  
  const handleAddPunch = async () => {
    try {
      const punchDate = record.date;
      const [hours, minutes] = newTime.split(':');
      const punchDatetime = new Date(parseISO(punchDate));
      punchDatetime.setHours(parseInt(hours), parseInt(minutes), 0);
      
      await addPunch({
        employeeId: record.employeeId,
        punchDatetime: punchDatetime.toISOString(),
        importFormat: 'standard'
      });
      setIsAdding(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error adding punch');
    }
  };

  const handleDelete = async (punchIso: string) => {
    if (!confirm('Are you sure you want to delete this punch?')) return;
    try {
      // Find the punch ID from the store
      const punchObj = allRawPunches.find(p => p.employeeId === record.employeeId && p.punchDatetime === punchIso);
      if (punchObj) {
        await deletePunch(punchObj.id);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error deleting punch');
    }
  };

  if (!punches || punches.length === 0) {
    return (
      <div className="py-4 px-2 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">No Punch Activity Detected</p>
        {!isAdding ? (
          <button 
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="w-3 h-3" /> Manual Punch Entry
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
             <input 
               type="time" 
               value={newTime} 
               onChange={e => setNewTime(e.target.value)}
               className="px-2 py-1 border border-slate-200 rounded-md text-[10px] bg-white outline-none ring-1 ring-transparent focus:ring-indigo-500"
             />
             <button onClick={handleAddPunch} className="px-2 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-bold">Add</button>
             <button onClick={() => setIsAdding(false)} className="px-2 py-1 bg-slate-200 text-slate-600 rounded-md text-[10px] font-bold">Cancel</button>
          </div>
        )}
      </div>
    );
  }

  // Use the date of the record to define the 24-hour window
  // For night shifts, the timeline might need to span more than 24h, 
  // but for a simple daily view, we'll show the 24h window starting from the record's date
  const dayStart = startOfDay(parseISO(record.date));
  const dayEnd = endOfDay(dayStart);

  // If there are night shift punches, they might go into the next day
  // Let's expand the window if necessary
  const sortedPunches = [...punches].sort().map(p => parseISO(p));
  const firstPunch = sortedPunches[0];
  const lastPunch = sortedPunches[sortedPunches.length - 1];
  
  const timelineStart = firstPunch.getHours() >= 20 || firstPunch.getHours() < 4 ? addDays(dayStart, 0) : dayStart; 
  // Simplified: we'll just use the interval from first punch to last punch + some padding
  // or a standard 24h view starting from 6 AM if it's day shift, or 6 PM if it's night shift.
  
  const isNight = firstPunch.getHours() >= 18 || firstPunch.getHours() < 4;
  const viewportStart = isNight ? new Date(dayStart.setHours(18, 0, 0, 0)) : new Date(dayStart.setHours(6, 0, 0, 0));
  const viewportEnd = addDays(viewportStart, 1);
  const totalMinutes = 24 * 60;

  const getPos = (date: Date) => {
    const diff = differenceInMinutes(date, viewportStart);
    return Math.max(0, Math.min(100, (diff / totalMinutes) * 100));
  };

  return (
    <div className="py-4 px-2">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Punch Activity Timeline</h4>
        <div className="flex items-center gap-3">
          {isAdding ? (
             <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner scale-90 -mr-2">
                <input 
                  type="time" 
                  value={newTime} 
                  onChange={e => setNewTime(e.target.value)}
                  className="px-2 py-0.5 border border-slate-200 rounded text-[9px] bg-white outline-none"
                />
                <button onClick={handleAddPunch} className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[9px] font-bold uppercase transition-colors hover:bg-emerald-700">Set</button>
                <button onClick={() => setIsAdding(false)} className="px-1.5 py-0.5 bg-slate-400 text-white rounded text-[9px] font-bold uppercase">X</button>
             </div>
          ) : (
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg text-[9px] font-black uppercase hover:bg-indigo-100 transition-all shadow-sm"
            >
              <Plus className="w-3 h-3" /> Add Correction
            </button>
          )}
          <div className="w-px h-4 bg-slate-200 ml-1" />
          <div className="flex gap-4 text-[9px] font-bold">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
              <span className="text-slate-500 uppercase">Input</span>
            </div>
            <div className="flex items-center gap-1.5">
               <div className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-200" />
               <span className="text-slate-500 uppercase">Internal</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative h-12 bg-slate-50 border border-slate-100 rounded-xl px-4 flex items-center">
        {/* Hour markers */}
        <div className="absolute inset-0 flex justify-between px-4 items-end pb-1 pointer-events-none">
          {[0, 4, 8, 12, 16, 20, 24].map(h => {
             const d = new Date(viewportStart.getTime() + h * 60 * 60 * 1000);
             return (
               <div key={h} className="flex flex-col items-center gap-1">
                 <div className="w-px h-1 bg-slate-200" />
                 <span className="text-[8px] font-bold text-slate-300">{format(d, 'ha')}</span>
               </div>
             );
          })}
        </div>

        {/* The rail */}
        <div className="relative w-full h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
           {punches.length >= 2 && (
             <div 
              className="absolute h-full bg-indigo-500/20"
              style={{ 
                left: `${getPos(sortedPunches[0])}%`, 
                width: `${getPos(sortedPunches[sortedPunches.length - 1]) - getPos(sortedPunches[0])}%` 
              }}
             />
           )}
        </div>

        {/* Punch Markers */}
        <div className="absolute inset-0 px-4 flex items-center pointer-events-none">
          {sortedPunches.map((p, i) => {
            const isFirst = i === 0;
            const isLast = i === sortedPunches.length - 1;
            const pos = getPos(p);
            
            return (
              <div 
                key={i} 
                className="absolute group/punch pointer-events-auto"
                style={{ left: `calc(${pos}% + 16px)`, transform: 'translateX(-50%)' }}
              >
                <div 
                  className={`w-3 h-3 rounded-full border-2 border-white shadow-md transition-all hover:scale-125 cursor-help ${
                    isFirst ? 'bg-emerald-500 z-20' : isLast ? 'bg-amber-500 z-10' : 'bg-slate-400'
                  }`} 
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded invisible group-hover/punch:visible whitespace-nowrap z-30 flex items-center gap-1.5 shadow-xl">
                  <span>{formatAMPM(p.toISOString())}</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.toISOString());
                    }}
                    className="p-1 hover:bg-rose-500 rounded transition-colors text-white"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
