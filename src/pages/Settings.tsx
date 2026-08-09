import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store';
import { Save, Plus, Trash2, AlertTriangle, Database, Download, CheckCircle2, XCircle, X, Info, Settings, Clock, Building2, Calendar, ShieldAlert, History, Loader2, Activity, FileCheck, Server, HardDrive } from 'lucide-react';
import { format } from 'date-fns';
import { ShiftMaster } from '../types';
import { generateId, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';
import { toast } from 'sonner';

export function SettingsPage() {
  const { settings, setSettings, employees, setEmployees, punches, setPunches, shiftAssignments, setShiftAssignments, clearAllData, quotaExceeded } = useAppStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [isWiping, setIsWiping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);
  const [isConfirmingPurge, setIsConfirmingPurge] = useState(false);
  const [purgeConfirmationInput, setPurgeConfirmationInput] = useState('');

  const [diagData, setDiagData] = useState<any>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [showDiagModal, setShowDiagModal] = useState(false);

  const handleRunDiagnostics = async () => {
    setIsRunningDiag(true);
    try {
      const res = await fetch('/api/local/diagnostics').then(r => r.json());
      setDiagData(res);
      setShowDiagModal(true);
      toast.success('Local backend diagnostic complete!');
    } catch (err: any) {
      toast.error('Diagnostic failed: ' + (err.message || 'Server error'));
    } finally {
      setIsRunningDiag(false);
    }
  };

  useEffect(() => {
    setLocalSettings(settings);
    setDismissedWarnings(false);
  }, [settings]);

  const handleSave = async () => {
    if (quotaExceeded) {
      toast.error('Database write limit reached.');
      return;
    }
    
    setIsSaving(true);
    try {
      await setSettings(localSettings);
      toast.success('Settings saved successfully!');
    } catch (err) {
      toast.error('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const [purgeProgressMessage, setPurgeProgressMessage] = useState('');

  const handleClearAllData = async () => {
    if (quotaExceeded) return;
    if (purgeConfirmationInput.trim().toUpperCase() !== 'DELETE' || isWiping) return;
    
    try {
      setIsWiping(true);
      setPurgeProgressMessage('Initializing system wipe...');
      await clearAllData((msg) => setPurgeProgressMessage(msg));
      setIsConfirmingPurge(false);
      setPurgeConfirmationInput('');
      toast.success('All data has been purged successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to purge data.');
    } finally {
      setIsWiping(false);
      setPurgeProgressMessage('');
    }
  };

  const handleLoadSampleData = async () => {
    if (quotaExceeded) {
      toast.error('Database write limit reached.');
      return;
    }
    if (confirm('Load sample employee data? This will add 3 example employees and initialize attendance.')) {
      await setEmployees([
        {
          id: 'EMP001',
          name: 'Alice Johnson',
          department: 'Bio',
          designation: 'Geneticist',
          shiftId: 'shift-1',
          joiningDate: '2024-01-15',
          status: 'Active',
          weeklyOff: 'Sunday',
          otEligible: true,
          targetWorkingHours: 8
        },
        {
          id: 'EMP002',
          name: 'Robert Smith',
          department: 'Operations',
          designation: 'Technician',
          shiftId: 'shift-1',
          joiningDate: '2024-02-01',
          status: 'Active',
          weeklyOff: 'Sunday',
          otEligible: true,
          targetWorkingHours: 8
        },
        {
          id: '1211001',
          name: 'Sarah Chen',
          department: 'Bio',
          designation: 'Bioanalyst',
          shiftId: 'shift-1',
          joiningDate: '2024-03-10',
          status: 'Active',
          weeklyOff: 'Sunday',
          otEligible: true,
          targetWorkingHours: 8
        }
      ]);
      toast.success('Sample data loaded successfully!');
    }
  };

  const handleExportBackup = () => {
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {
        employees,
        punches,
        settings,
        shiftAssignments
      }
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_System_Backup_${format(new Date(), 'yyyyMMdd')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (quotaExceeded) {
      toast.error('Database write limit reached.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target?.result as string);
        if (!backup.data) throw new Error('Invalid backup format');

        if (confirm('Restoring will overwrite all current data. Proceed?')) {
          await setEmployees(backup.data.employees);
          await setPunches(backup.data.punches);
          await setSettings(backup.data.settings);
          await setShiftAssignments(backup.data.shiftAssignments);
          toast.success('System restored successfully. Refreshing...');
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (err) {
        toast.error('Failed to restore: Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  const addShift = () => {
    const newShift: ShiftMaster = {
      id: generateId(),
      name: 'New Shift',
      startTime: '09:00',
      endTime: '18:00',
      isNightShift: false,
      graceTime: 15,
      lateThreshold: 30
    };
    setLocalSettings({
      ...localSettings,
      shifts: [...(localSettings.shifts || []), newShift]
    });
  };

  const removeShift = (id: string) => {
    setLocalSettings({
      ...localSettings,
      shifts: localSettings.shifts.filter(s => s.id !== id)
    });
  };

  const updateShift = (id: string, updates: Partial<ShiftMaster>) => {
    setLocalSettings({
      ...localSettings,
      shifts: localSettings.shifts.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const shiftWarnings = useMemo(() => {
    const warnings: string[] = [];
    const shifts = localSettings.shifts || [];
    
    const getIntervals = (shift: ShiftMaster) => {
      const toMins = (t: string) => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const s = toMins(shift.startTime);
      const e = toMins(shift.endTime);
      if (s === null || e === null) return [];
      return e < s ? [[s, 1440], [0, e]] : [[s, e]];
    };

    const hasOverlap = (int1: number[], int2: number[]) => Math.max(int1[0], int2[0]) < Math.min(int1[1], int2[1]);

    for (let i = 0; i < shifts.length; i++) {
      for (let j = i + 1; j < shifts.length; j++) {
        const s1 = shifts[i];
        const s2 = shifts[j];
        const ints1 = getIntervals(s1);
        const ints2 = getIntervals(s2);
        let overlap = false;
        for (const i1 of ints1) {
          for (const i2 of ints2) {
            if (hasOverlap(i1, i2)) { overlap = true; break; }
          }
          if (overlap) break;
        }
        if (overlap) warnings.push(`"${s1.name}" and "${s2.name}" overlap.`);
      }
    }
    return warnings;
  }, [localSettings.shifts]);

  const hasChanges = JSON.stringify(localSettings) !== JSON.stringify(settings);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="System Settings" 
        description="Global configurations and system maintenance"
        icon={Settings}
        actions={
          <div className="flex items-center gap-3">
            {hasChanges && <Badge variant="warning">Unsaved Changes</Badge>}
            <Button onClick={handleSave} disabled={isSaving || !hasChanges} className="gap-2">
              <Save size={16} /> {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        }
      />

      {shiftWarnings.length > 0 && !dismissedWarnings && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/20 rounded-xl flex gap-3 items-start animate-in slide-in-from-top-2 duration-300">
           <AlertTriangle size={20} className="text-amber-600 mt-0.5" />
           <div className="flex-1">
             <p className="text-xs font-bold text-amber-900 dark:text-amber-400 uppercase tracking-widest mb-1">Shift Overlap Detected</p>
             <div className="flex flex-wrap gap-x-4 gap-y-1">
               {shiftWarnings.map((w, i) => (
                 <span key={i} className="text-[10px] text-amber-700 dark:text-amber-500 font-medium">• {w}</span>
               ))}
             </div>
           </div>
           <Button variant="ghost" size="sm" onClick={() => setDismissedWarnings(true)} className="text-amber-600">Dismiss</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden">
             <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <Building2 size={16} className="text-slate-400" />
                 <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Company Profile</h3>
               </div>
             </div>
             <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Company Name</label>
                  <Input 
                    value={localSettings.companyName}
                    onChange={e => setLocalSettings({...localSettings, companyName: e.target.value})}
                    placeholder="Global Bio-Tech Corp"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Report Display Title</label>
                  <Input 
                    value={localSettings.reportTitle}
                    onChange={e => setLocalSettings({...localSettings, reportTitle: e.target.value})}
                    placeholder="Monthly Attendance Summary"
                  />
                </div>
             </div>
          </Card>

          <Card className="p-0 overflow-hidden">
             <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <Clock size={16} className="text-slate-400" />
                 <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Shift Master</h3>
               </div>
               <Button variant="outline" size="sm" onClick={addShift} className="gap-2">
                 <Plus size={14} /> Add Shift
               </Button>
             </div>
             
             <div className="p-6 space-y-4">
                <div className="relative h-16 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 p-2 overflow-hidden">
                   {[0, 6, 12, 18, 24].map(h => (
                     <div key={h} className="absolute h-full border-l border-slate-200 dark:border-slate-800" style={{ left: `${(h/24)*100}%` }}>
                       <span className="text-[8px] font-bold text-slate-300 ml-1">{h}:00</span>
                     </div>
                   ))}
                   <div className="relative h-full flex flex-col justify-center gap-1 mt-2">
                      {localSettings.shifts.map((s, i) => {
                         const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
                         const start = toM(s.startTime);
                         const end = toM(s.endTime);
                         const duration = (s.isNightShift || end < start) ? (end + 1440 - start) : (end - start);
                         const left = (start / 1440) * 100;
                         const width = (duration / 1440) * 100;
                         const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
                         return (
                           <div key={s.id} className="relative h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={cn("absolute h-full rounded-full opacity-60", colors[i % colors.length])}
                                style={{ left: `${left}%`, width: `${width}%` }}
                              />
                              {left + width > 100 && (
                                <div 
                                  className={cn("absolute h-full rounded-full opacity-60", colors[i % colors.length])}
                                  style={{ left: `-${100 - left}%`, width: `${width - (100 - left)}%` }}
                                />
                              )}
                           </div>
                         );
                      })}
                   </div>
                </div>

                <div className="space-y-3">
                   {localSettings.shifts.map((shift) => (
                     <div key={shift.id} className="group p-4 border border-slate-100 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/50 hover:border-primary/30 transition-all">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                           <div className="md:col-span-3">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Shift Name</label>
                              <Input 
                                value={shift.name}
                                onChange={e => updateShift(shift.id, { name: e.target.value })}
                                placeholder="Morning"
                              />
                           </div>
                           <div className="md:col-span-4">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Start - End</label>
                              <div className="flex items-center gap-1">
                                <input 
                                  type="time" 
                                  value={shift.startTime} 
                                  onChange={e => updateShift(shift.id, { startTime: e.target.value })}
                                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs font-medium focus:outline-none"
                                />
                                <span className="text-slate-300">-</span>
                                <input 
                                  type="time" 
                                  value={shift.endTime} 
                                  onChange={e => updateShift(shift.id, { endTime: e.target.value })}
                                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs font-medium focus:outline-none"
                                />
                              </div>
                           </div>
                           <div className="md:col-span-3">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Grace / Late (Min)</label>
                              <div className="flex items-center gap-1">
                                 <input 
                                   type="number" 
                                   value={shift.graceTime || 15}
                                   onChange={e => updateShift(shift.id, { graceTime: Number(e.target.value) })}
                                   className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs font-medium text-center"
                                 />
                                 <input 
                                   type="number" 
                                   value={shift.lateThreshold || 30}
                                   onChange={e => updateShift(shift.id, { lateThreshold: Number(e.target.value) })}
                                   className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-xs font-medium text-center"
                                 />
                              </div>
                           </div>
                           <div className="md:col-span-2 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                              <label className="flex items-center gap-2 cursor-pointer group/label">
                                <input 
                                  type="checkbox" 
                                  checked={shift.isNightShift} 
                                  onChange={e => updateShift(shift.id, { isNightShift: e.target.checked })}
                                  className="rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                <span className="text-[9px] font-bold text-slate-500 uppercase">Night</span>
                              </label>
                              <Button variant="danger" size="sm" onClick={() => removeShift(shift.id)} className="h-7 w-7 p-0 rounded-md">
                                <Trash2 size={12} />
                              </Button>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          </Card>

          <Card className="p-0 overflow-hidden">
             <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <Calendar size={16} className="text-slate-400" />
                 <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Attendance Rules</h3>
               </div>
             </div>
             <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Calculation Period</label>
                  <div className="flex items-center gap-2 relative z-30">
                     <Input 
                        type="date" 
                        value={localSettings.calculationStartDate || ''}
                        onChange={e => setLocalSettings({...localSettings, calculationStartDate: e.target.value})}
                        className="text-[12px] pl-9"
                     />
                     <span className="text-slate-400 text-xs font-bold">to</span>
                     <Input 
                        type="date" 
                        value={localSettings.calculationEndDate || ''}
                        onChange={e => setLocalSettings({...localSettings, calculationEndDate: e.target.value})}
                        className="text-[12px] pl-9"
                     />
                  </div>
                  <p className="text-[9px] text-slate-500 font-medium italic mt-1 ml-1 flex items-center gap-1">
                    <Info size={10} /> Restricts historical data processing
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">OT Threshold (Hrs/Day)</label>
                  <Input 
                    type="number" step="0.5"
                    value={localSettings.overtimeThreshold}
                    onChange={e => setLocalSettings({...localSettings, overtimeThreshold: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Legacy Rules (Defaults)</label>
                   <div className="grid grid-cols-2 gap-2">
                      <Input type="time" value={localSettings.shiftStartTime} onChange={e => setLocalSettings({...localSettings, shiftStartTime: e.target.value})} placeholder="Start" />
                      <Input type="time" value={localSettings.shiftEndTime} onChange={e => setLocalSettings({...localSettings, shiftEndTime: e.target.value})} placeholder="End" />
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Punch Cleanup (Mins)</label>
                   <Input type="number" value={localSettings.duplicateMergeTime} onChange={e => setLocalSettings({...localSettings, duplicateMergeTime: Number(e.target.value)})} />
                </div>
             </div>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
           <Card className="p-6">
              <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                <History size={14} className="text-primary" />
                Data Management
              </h3>
              <div className="space-y-3">
                 <Button variant="outline" className="w-full justify-start gap-3" onClick={handleExportBackup}>
                   <Download size={14} /> Export Backup (.json)
                 </Button>
                 <label className="block">
                    <Button variant="outline" className="w-full justify-start gap-3 pointer-events-none">
                      <Plus size={14} /> Restore from File
                    </Button>
                    <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                 </label>
                 <Button variant="outline" className="w-full justify-start gap-3 text-emerald-600 hover:bg-emerald-50" onClick={handleLoadSampleData}>
                   <Plus size={14} /> Load Sample Records
                 </Button>
              </div>
           </Card>

           <Card className="p-6 border-red-100 dark:border-red-900/20">
              <h3 className="text-[11px] font-bold text-red-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                <ShieldAlert size={14} />
                Maintenance
              </h3>
              <div className="space-y-4">
                 <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                   Permanently wipe all employee profiles, biometric logs, and system configurations.
                 </p>
                 <Button 
                   variant="danger" 
                   className="w-full gap-2" 
                   onClick={() => setIsConfirmingPurge(true)}
                   disabled={quotaExceeded || isWiping}
                 >
                   <Trash2 size={14} /> {isWiping ? 'Wiping...' : 'Purge All Data'}
                 </Button>
                 {quotaExceeded && (
                   <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded-lg text-[9px] text-red-600 font-bold uppercase tracking-wider text-center">
                     Database Write-Locked
                   </div>
                 )}
              </div>
           </Card>

           <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <Activity size={14} className="text-primary" />
                  System Health & Diagnostics
                </h3>
                <Badge variant="success" className="text-[8px] h-4">Active</Badge>
              </div>
              <div className="space-y-3 mb-4">
                 <div className="flex justify-between items-center text-[10px]">
                   <span className="text-slate-400 font-bold uppercase">System Version</span>
                   <span className="text-slate-900 dark:text-white font-mono">v1.4.2-enterprise</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px]">
                   <span className="text-slate-400 font-bold uppercase">Database Engine</span>
                   <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">SQLite (Local DB)</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px]">
                   <span className="text-slate-400 font-bold uppercase">Storage Path</span>
                   <span className="text-slate-700 dark:text-slate-300 font-mono font-bold">E:\SHRM_HRIS\</span>
                 </div>
              </div>

              <Button
                onClick={handleRunDiagnostics}
                disabled={isRunningDiag}
                variant="outline"
                className="w-full text-xs gap-2 border-indigo-200 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
              >
                {isRunningDiag ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                {isRunningDiag ? 'Running Diagnostic...' : 'Run Local Diagnostic'}
              </Button>
           </Card>

           <Card className="p-6 bg-slate-900 text-white">
              <div className="flex items-center gap-3 mb-3">
                 <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                   <Database size={18} />
                 </div>
                 <div>
                   <h3 className="text-sm font-bold">Local-First Storage Engine</h3>
                   <p className="text-[11px] text-slate-400">SQLite + Local Disk Architecture</p>
                 </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Your system reads and writes directly to local SQLite database and local disk files (`E:\SHRM_HRIS\Database.db`). No cloud database required for daily operations.
              </p>
              <div className="space-y-2">
                <Button 
                  onClick={async () => {
                    const res = await fetch('/api/local/backup', { method: 'POST' }).then(r => r.json());
                    toast.success(res.message || 'Local backup saved to E:\\SHRM_HRIS\\backups\\');
                  }}
                  variant="outline"
                  className="w-full text-xs border-slate-700 text-slate-200 hover:bg-slate-800 justify-center gap-2"
                >
                  <Download size={14} /> Backup Local Database & Documents
                </Button>
              </div>
           </Card>
        </div>
      </div>

      {showDiagModal && diagData && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="max-w-2xl w-full p-6 my-8 animate-in zoom-in-95 duration-200 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="text-indigo-600" size={20} />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Real Backend Local Diagnostic Report
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  GET /api/local/diagnostics • Tested at {new Date(diagData.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <button 
                onClick={() => setShowDiagModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Accessibility Status Banner */}
            <div className={cn(
              "p-4 rounded-xl border flex gap-3 items-start",
              diagData.runtime?.platform === 'win32'
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-300"
                : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-300"
            )}>
              <Info className="shrink-0 mt-0.5" size={20} />
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-xs font-black uppercase tracking-wider block">
                  {diagData.accessibilityStatus}
                </span>
                <p className="text-xs leading-relaxed">
                  {diagData.summaryNote}
                </p>
              </div>
            </div>

            {/* 15 Point Diagnostic Grid */}
            <div className="space-y-4 text-xs">
              {/* Runtime Environment */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <Server size={14} className="text-indigo-500" />
                  1. Runtime & OS Environment
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">Current Operating System:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{diagData.runtime?.platform} ({diagData.runtime?.arch})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Node.js Version:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{diagData.runtime?.nodeVersion}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block">Environment Classification:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{diagData.runtime?.runtimeLabel}</span>
                  </div>
                </div>
              </div>

              {/* Paths & File System */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <HardDrive size={14} className="text-emerald-500" />
                  2. Database Paths & File Checks
                </h4>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">Target Configured Path:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{diagData.paths?.configuredDatabasePath}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Active Runtime Physical Database Path:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{diagData.paths?.actualDatabasePath}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-slate-500">Root Directory Exists:</span>
                    <Badge variant={diagData.paths?.rootDirectoryExists ? "success" : "danger"}>
                      {diagData.paths?.rootDirectoryExists ? "EXISTS" : "MISSING"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Database File Exists:</span>
                    <Badge variant={diagData.paths?.databaseFileExists ? "success" : "danger"}>
                      {diagData.paths?.databaseFileExists ? "EXISTS" : "NOT FOUND"}
                    </Badge>
                  </div>
                  {diagData.databaseFile?.exists && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Database Size:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{diagData.databaseFile?.sizeFormatted}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Last Modified:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(diagData.databaseFile?.lastModified).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* SQLite Tests */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <Database size={14} className="text-indigo-500" />
                  3. SQLite Engine & Query Tests
                </h4>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">SQLite Connection:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{diagData.sqliteTests?.connection}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">SELECT Read Test (Count: {diagData.sqliteTests?.readTest?.employeeCount}):</span>
                    <Badge variant={diagData.sqliteTests?.readTest?.passed ? "success" : "danger"}>
                      {diagData.sqliteTests?.readTest?.passed ? `PASSED (${diagData.sqliteTests?.readTest?.latencyMs}ms)` : "FAILED"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">INSERT/VERIFY/DELETE Write Test:</span>
                    <Badge variant={diagData.sqliteTests?.writeTest?.passed ? "success" : "danger"}>
                      {diagData.sqliteTests?.writeTest?.passed ? `PASSED (${diagData.sqliteTests?.writeTest?.latencyMs}ms)` : "FAILED"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">BEGIN/COMMIT Transaction Test:</span>
                    <Badge variant={diagData.sqliteTests?.transactionTest?.passed ? "success" : "danger"}>
                      {diagData.sqliteTests?.transactionTest?.passed ? `PASSED (${diagData.sqliteTests?.transactionTest?.latencyMs}ms)` : "FAILED"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Document Storage File I/O */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <FileCheck size={14} className="text-amber-500" />
                  4. Local Document Disk Storage
                </h4>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">Documents Folder Path:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{diagData.paths?.documentsDirectoryPath}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-slate-500">Folder Exists:</span>
                    <Badge variant={diagData.paths?.documentsDirectoryExists ? "success" : "danger"}>
                      {diagData.paths?.documentsDirectoryExists ? "EXISTS" : "MISSING"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Create/Read/Delete Temp File Test:</span>
                    <Badge variant={diagData.fileIoTest?.passed ? "success" : "danger"}>
                      {diagData.fileIoTest?.passed ? "PASSED" : "FAILED"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono">
                Diagnostic Time: {diagData.totalDiagnosticTimeMs}ms
              </span>
              <Button onClick={() => setShowDiagModal(false)}>
                Close Diagnostic
              </Button>
            </div>
          </Card>
        </div>
      )}


      {isConfirmingPurge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <AlertTriangle size={24} />
              <h4 className="text-lg font-bold">Destroy All Data</h4>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              This will <span className="font-bold text-red-600 uppercase">permanently delete</span> all system data. This action is irreversible.
            </p>
            
            <form onSubmit={(e) => { e.preventDefault(); handleClearAllData(); }}>
              <div className="space-y-2 mb-6">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  Type <span className="text-red-600 font-bold">DELETE</span> to confirm
                </label>
                <Input 
                  autoFocus
                  disabled={isWiping}
                  placeholder="Type DELETE"
                  value={purgeConfirmationInput}
                  onChange={(e) => setPurgeConfirmationInput(e.target.value)}
                  className="text-center font-bold tracking-widest uppercase"
                />
              </div>

              {isWiping && (
                <div className="mb-6 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-center gap-3">
                  <Loader2 className="animate-spin text-red-600 shrink-0" size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-red-700 dark:text-red-300">
                      Wiping All System Data...
                    </p>
                    <p className="text-[11px] font-mono text-red-600 dark:text-red-400 truncate">
                      {purgeProgressMessage || "Deleting collections..."}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  className="flex-1" 
                  disabled={isWiping}
                  onClick={() => setIsConfirmingPurge(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  variant="danger" 
                  className="flex-1 gap-2"
                  disabled={purgeConfirmationInput.trim().toUpperCase() !== 'DELETE' || isWiping}
                >
                  {isWiping ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Wiping...
                    </>
                  ) : (
                    'Confirm Purge'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
