import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Database, HardDrive, RefreshCw, ArrowDownToLine, X, ShieldCheck, Clock, ArrowUpRight } from 'lucide-react';
import { fetchLocalStatus, triggerLocalBackup } from '../lib/localClient';
import { authFetch } from '../lib/authSession';
import { useAppStore } from '../store';
import { toast } from 'sonner';

export function LocalModeIndicator() {
  const [status, setStatus] = useState<any>(null);
  const [autoPollStatus, setAutoPollStatus] = useState<any>({ enabled: true, intervalMinutes: 15, intervalSeconds: 900 });
  const [isOpen, setIsOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const { employees, punches } = useAppStore();

  const loadStatus = async () => {
    const res = await fetchLocalStatus();
    if (res) {
      setStatus(res);
    }
    try {
      const pollRes = await authFetch('/api/zk/auto-poll/status').then(r => r.json());
      if (pollRes) setAutoPollStatus(pollRes);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await triggerLocalBackup();
      toast.success(res.message || 'SQLite backup saved successfully.');
      await loadStatus();
    } catch (e: any) {
      toast.error(e.message || 'Backup failed');
    } finally {
      setIsBackingUp(false);
    }
  };

  const scheduleMins = Number(autoPollStatus?.intervalMinutes || 15);
  const isScheduleOn = autoPollStatus?.enabled !== false;

  return (
    <>
      <button
        onClick={() => { setIsOpen(true); loadStatus(); }}
        className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/40 rounded-lg text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        title="SQLite Database & Auto-Fetch Schedule Status"
      >
        <Database size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="hidden sm:inline font-bold tracking-tight">SQLite</span>
        <span className="text-slate-300 dark:text-slate-700 hidden md:inline">·</span>
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold hidden md:inline tabular-nums">
          {isScheduleOn ? `Every ${scheduleMins}m` : 'Paused'}
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/20">
                <HardDrive size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  SQLite Storage &amp; Auto-Fetch Status
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Local database health and scheduled ZKTeco log download status.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Database Path</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate font-mono text-[11px]">
                  <Database size={13} className="text-indigo-500 shrink-0" /> {status?.dbPath || 'Local SQLite Active'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Auto-Fetch Schedule</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 tabular-nums">
                  <Clock size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  {isScheduleOn ? `Every ${scheduleMins} min` : 'Paused'} · {punches.length.toLocaleString()} logs
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Active Directory</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 tabular-nums">
                  <ShieldCheck size={13} className="text-indigo-500 shrink-0" />
                  {autoPollStatus?.activeEmployeeCount ?? employees.filter(e => !e.status || e.status.toLowerCase() === 'active').length} Active Staff
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Enabled Devices</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 tabular-nums">
                  <ShieldCheck size={13} className="text-emerald-500 shrink-0" />
                  {autoPollStatus?.enabledDeviceCount ?? 0} of {autoPollStatus?.deviceCount ?? 0} Active
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Link
                to="/devices"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                Manage ZKTeco Devices
                <ArrowUpRight size={14} />
              </Link>

              <button
                type="button"
                onClick={handleBackup}
                disabled={isBackingUp}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {isBackingUp ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />}
                Backup Local DB
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
