import React, { useState, useEffect } from 'react';
import { Database, HardDrive, WifiOff, CheckCircle2, RefreshCw, Folder, ShieldAlert, ArrowDownToLine, DownloadCloud, Settings, X, Cpu } from 'lucide-react';
import { fetchLocalStatus, setLocalRootFolder, triggerLocalBackup, migrateFirestoreToLocal } from '../lib/localClient';
import { useAppStore } from '../store';
import { toast } from 'sonner';

export function LocalModeIndicator() {
  const [status, setStatus] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newRoot, setNewRoot] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const { employees, punches, settings, shiftAssignments, exceptions, overtimeRecords, sblRecords, forceAttendanceRecords, payrollRuns } = useAppStore();

  const loadStatus = async () => {
    const res = await fetchLocalStatus();
    if (res) {
      setStatus(res);
      setNewRoot(res.rootFolder);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleUpdateRoot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoot.trim()) return;
    const ok = await setLocalRootFolder(newRoot.trim());
    if (ok) {
      toast.success(`Local storage root folder updated to ${newRoot.trim()}`);
      await loadStatus();
    } else {
      toast.error('Failed to update local storage folder path');
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await triggerLocalBackup();
      toast.success(res.message || 'Backup completed successfully!');
      await loadStatus();
    } catch (e: any) {
      toast.error(e.message || 'Backup failed');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleMigrateFromFirestore = async () => {
    if (!confirm('Migrate all current active records from workspace into local SQLite database?')) return;
    setIsMigrating(true);
    try {
      const snapshot = {
        employees,
        punches,
        settings,
        shiftAssignments,
        exceptions,
        overtimeRecords,
        sblRecords,
        forceAttendanceRecords,
        payrollRuns
      };
      const res = await migrateFirestoreToLocal(snapshot);
      toast.success(res.message || 'Firestore data migrated to local SQLite database!');
      await loadStatus();
    } catch (e: any) {
      toast.error(e.message || 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setIsOpen(true); loadStatus(); }}
        className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-full text-emerald-700 dark:text-emerald-400 text-[11px] font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs"
        title="Click to view Local Storage & SQLite Database details"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="hidden sm:inline uppercase tracking-wider font-extrabold">LOCAL MODE</span>
        <span className="text-[10px] opacity-80 border-l border-emerald-500/30 pl-2 hidden md:inline">SQLite • Disk Storage</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
                <HardDrive size={24} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  Local-First Operating Mode
                  <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-black uppercase rounded-full">Active</span>
                </h3>
                <p className="text-xs text-slate-500">100% Free SQLite Database & Local Disk File Storage</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Local Database</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Database size={14} className="text-indigo-500" /> SQLite (hris.db)
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">File Storage</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <HardDrive size={14} className="text-emerald-500" /> Windows Disk Folder
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Internet Requirement</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <WifiOff size={14} className="text-amber-500" /> Internet Not Required
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Local Records</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {status?.stats?.employees || employees.length} Emps • {status?.stats?.punches || punches.length} Punches
                </span>
              </div>
            </div>

            <form onSubmit={handleUpdateRoot} className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Local Storage Root Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoot}
                  onChange={e => setNewRoot(e.target.value)}
                  placeholder="D:\SHRM-HRIS"
                  className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Save Path
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Subfolders: \database\hris.db, \data\documents, \imports, \exports, \backups
              </p>
            </form>

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleBackup}
                disabled={isBackingUp}
                className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isBackingUp ? <RefreshCw size={14} className="animate-spin" /> : <ArrowDownToLine size={14} />} Backup Local DB
              </button>

              <button
                onClick={handleMigrateFromFirestore}
                disabled={isMigrating}
                className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isMigrating ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />} Sync to Local SQLite
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
