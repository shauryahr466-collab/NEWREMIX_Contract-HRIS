import React, { useMemo } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Badge } from './ui';
import { Calendar, Users, ShieldCheck, AlertTriangle, ArrowRight, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';

interface RosterStatusWidgetProps {
  selectedDate: string;
}

export function RosterStatusWidget({ selectedDate }: RosterStatusWidgetProps) {
  const { processedData, employees, shiftAssignments } = useAppStore();

  const metrics = useMemo(() => {
    const activeEmps = employees.filter(e => e.status === 'Active');
    const totalActive = activeEmps.length;

    const dayRecords = processedData.filter(p => p.date === selectedDate);
    const dayAssignments = shiftAssignments.filter(a => a.date === selectedDate);

    let manualCount = 0;
    let approvedCount = 0;
    let importedCount = 0;
    let defaultCount = 0;

    dayRecords.forEach(p => {
      const src = p.shiftSource || 'Employee Default';
      if (src === 'Manual Override') manualCount++;
      else if (src === 'Approved Roster') approvedCount++;
      else if (src === 'Imported Roster') importedCount++;
      else defaultCount++;
    });

    const rosteredCount = manualCount + approvedCount + importedCount;
    const unrosteredCount = Math.max(0, totalActive - rosteredCount);

    return {
      totalActive,
      rosteredCount,
      unrosteredCount,
      manualCount,
      approvedCount,
      importedCount,
      defaultCount,
      rosterCoverage: totalActive > 0 ? Math.round((rosteredCount / totalActive) * 100) : 0
    };
  }, [processedData, employees, shiftAssignments, selectedDate]);

  return (
    <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Roster Status ({selectedDate})</h3>
            <p className="text-xs text-slate-500">Database-persisted shift roster coverage & source hierarchy</p>
          </div>
        </div>

        <Link to="/roster/manage" className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          Manage Roster <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 font-medium">Roster Coverage</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{metrics.rosterCoverage}%</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{metrics.rosteredCount} / {metrics.totalActive} Rostered</p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 font-medium">Manual Overrides</p>
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400 mt-0.5">{metrics.manualCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Highest Priority</p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 font-medium">Approved / Imported</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{metrics.approvedCount + metrics.importedCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Database Roster</p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-500 font-medium">Employee Default</p>
          <p className="text-lg font-bold text-slate-600 dark:text-slate-400 mt-0.5">{metrics.defaultCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Fallback Shift</p>
        </div>
      </div>
    </Card>
  );
}
