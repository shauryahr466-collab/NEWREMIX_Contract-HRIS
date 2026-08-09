import React, { useState, useEffect } from 'react';
import { Database, HardDrive, WifiOff, CheckCircle2, RefreshCw, Folder, ShieldAlert, ArrowDownToLine, DownloadCloud, Settings, X, Cpu, Activity, Loader2, ShieldCheck } from 'lucide-react';
import { fetchLocalStatus, setLocalRootFolder, triggerLocalBackup, migrateFirestoreToLocal, runPersistenceTest } from '../lib/localClient';
import { useAppStore } from '../store';
import { toast } from 'sonner';

export function LocalModeIndicator() {
  const [status, setStatus] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newRoot, setNewRoot] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isDiagRunning, setIsDiagRunning] = useState(false);
  const [isPersistTestRunning, setIsPersistTestRunning] = useState(false);

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
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Local Database (Disk E)</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 truncate">
                  <Database size={14} className="text-indigo-500 shrink-0" /> SQLite (E:\SHRM_HRIS\Database.db)
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">ZKT Auto-Polling</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-rose-500 shrink-0" /> Disabled (Manual Fetch Only)
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Data Write & Upload</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> Direct SQLite Write
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-slate-400 font-medium block text-[10px] uppercase tracking-wider mb-1">Deletion Safeguard</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-amber-500 shrink-0" /> Manual Confirmation Only
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

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={async () => {
                  setIsPersistTestRunning(true);
                  try {
                    const res = await runPersistenceTest();
                    if (res.persistenceStatus === 'PASSED') {
                      toast.success(`Physical Persistence Test: PASSED!`, {
                        description: `DB: ${res.physicalDatabase} | Record created, persisted to physical disk, reloaded, verified, deleted & confirmed.`,
                        duration: 8000
                      });
                    } else {
                      toast.error(`Physical Persistence Test: FAILED`, {
                        description: res.error || 'Disk sync or physical reload failed.',
                        duration: 8000
                      });
                    }
                  } catch (e: any) {
                    toast.error('Persistence test error: ' + e.message);
                  } finally {
                    setIsPersistTestRunning(false);
                  }
                }}
                disabled={isPersistTestRunning}
                className="w-full py-2 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isPersistTestRunning ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Run Physical File Persistence Test (POST /api/local/persistence-test)
              </button>

              <button
                onClick={async () => {
                  setIsDiagRunning(true);
                  try {
                    const res = await fetch('/api/local/diagnostics').then(r => r.json());
                    toast.info(`Diagnostic Result: ${res.accessibilityStatus} (${res.runtime?.runtimeLabel})`, {
                      description: `SQLite Read: ${res.sqliteTests?.readTest?.passed ? 'PASSED' : 'FAILED'}, Write: ${res.sqliteTests?.writeTest?.passed ? 'PASSED' : 'FAILED'}. Path: ${res.paths?.actualDatabasePath}`,
                      duration: 8000
                    });
                  } catch (e: any) {
                    toast.error('Diagnostic error: ' + e.message);
                  } finally {
                    setIsDiagRunning(false);
                  }
                }}
                disabled={isDiagRunning}
                className="w-full py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDiagRunning ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />} Run Local Diagnostic Test
              </button>

              <div className="flex gap-2">
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
                  className="flex-1 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isMigrating ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />} Sync to Local SQLite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
