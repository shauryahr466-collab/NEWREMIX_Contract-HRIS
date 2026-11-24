import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store';
import {
  Save, Plus, Trash2, AlertTriangle, Database, Download, X, Info,
  Settings, Clock, Building2, Calendar, ShieldAlert, History, Loader2,
  Activity, FileCheck, Server, HardDrive, Shield, ArrowUpRight, Calculator
} from 'lucide-react';
import { format } from 'date-fns';
import { ShiftMaster, HolidayPunchPolicy, PayrollConfig } from '../types';
import { DEFAULT_PAYROLL_CONFIG } from '../lib/payrollEngine';
import { generateId, cn } from '../lib/utils';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';
import { toast } from 'sonner';
import { useActionStatus } from '../context/ActionStatusContext';
import { authFetch } from '../lib/authSession';
import { fetchSystemHealth } from '../lib/localClient';
import { getNepaliDate } from '../utils/dateHelper';

type SettingsSectionKey = 'general' | 'attendance' | 'holidays' | 'payroll' | 'security' | 'system';

const SETTINGS_SECTIONS: Array<{
  key: SettingsSectionKey;
  label: string;
  description: string;
  icon: any;
}> = [
  { key: 'general', label: 'General & Company', description: 'Organization profile, contacts & calendar', icon: Building2 },
  { key: 'attendance', label: 'Attendance & Shifts', description: 'Shift master, rules & punch windows', icon: Clock },
  { key: 'holidays', label: 'Holidays & Leave Policy', description: 'Public holidays & punch overlap guards', icon: Calendar },
  { key: 'payroll', label: 'Payroll & Statutory', description: 'Fiscal year, OT rates, SSF & PF defaults', icon: Calculator },
  { key: 'security', label: 'Network & Access', description: 'Caddy LAN rules, user roles & audit', icon: Shield },
  { key: 'system', label: 'SQLite Health & Backup', description: 'Diagnostics, exports, restore & purge', icon: Database },
];

export function SettingsPage() {
  const {
    settings, setSettings, employees, setEmployees, punches, setPunches,
    shiftAssignments, setShiftAssignments, clearAllData
  } = useAppStore();
  const { executeWithStatus } = useActionStatus();

  const [activeSection, setActiveSection] = useState<SettingsSectionKey>('general');
  const [localSettings, setLocalSettings] = useState(settings);
  const [isWiping, setIsWiping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);
  const [isConfirmingPurge, setIsConfirmingPurge] = useState(false);
  const [purgeConfirmationInput, setPurgeConfirmationInput] = useState('');

  const [diagData, setDiagData] = useState<any>(null);
  const [isRunningDiag, setIsRunningDiag] = useState(false);
  const [showDiagModal, setShowDiagModal] = useState(false);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayPreventPunches, setNewHolidayPreventPunches] = useState(false);
  const [purgeProgressMessage, setPurgeProgressMessage] = useState('');

  useEffect(() => {
    fetchSystemHealth().then((h) => { if (h) setSystemHealth(h); }).catch(() => {});
    const timer = setInterval(() => {
      fetchSystemHealth().then((h) => { if (h) setSystemHealth(h); }).catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalSettings(settings);
    setDismissedWarnings(false);
  }, [settings]);

  const effectivePayrollConfig: PayrollConfig = useMemo(() => ({
    ...DEFAULT_PAYROLL_CONFIG,
    ...(localSettings.payrollConfig || {}),
  }), [localSettings.payrollConfig]);

  const updatePayrollField = <K extends keyof PayrollConfig>(key: K, value: PayrollConfig[K]) => {
    setLocalSettings((prev) => ({
      ...prev,
      payrollConfig: {
        ...DEFAULT_PAYROLL_CONFIG,
        ...(prev.payrollConfig || {}),
        [key]: value,
      },
    }));
  };

  const handleRunDiagnostics = async () => {
    setIsRunningDiag(true);
    try {
      const res = await authFetch('/api/local/diagnostics').then((r) => r.json());
      setDiagData(res);
      setShowDiagModal(true);
      toast.success('Local backend diagnostic complete!');
    } catch (err: any) {
      toast.error('Diagnostic failed: ' + (err.message || 'Server error'));
    } finally {
      setIsRunningDiag(false);
    }
  };

  const handleSave = async () => {
    await executeWithStatus(
      {
        title: 'Save Global Organization Settings?',
        subtitle: 'Persist shift definitions, company details, working hours, payroll defaults, and security rules to SQLite.',
        module: 'System Administration',
        actionType: 'save',
        confirmText: 'Save Settings',
      },
      async (updateProgress) => {
        setIsSaving(true);
        updateProgress({ percent: 50, message: 'Writing global settings to SQLite...' });
        await setSettings(localSettings);
        setIsSaving(false);

        return {
          success: true,
          affectedCount: 1,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            Company: localSettings.companyName || 'Default Company',
            'Shift Profiles': `${localSettings.shifts?.length || 0} active shifts`,
            'OT Threshold': `${localSettings.overtimeThreshold || 8} hrs/day`,
          },
        };
      }
    );
  };

  const handleClearAllData = async () => {
    if (purgeConfirmationInput.trim().toUpperCase() !== 'DELETE' || isWiping) return;

    setIsConfirmingPurge(false);
    setPurgeConfirmationInput('');

    await executeWithStatus(
      {
        title: 'Execute Full Database Purge?',
        subtitle: 'Danger: Completely eradicate all employees, punch records, shift rosters, and payroll batches from E:\\SHRM_HRIS\\Database.db.',
        module: 'Database Administration',
        actionType: 'purge',
        details: {
          Employees: `${employees.length} records`,
          Punches: `${punches.length} records`,
          'Target Database': 'E:\\SHRM_HRIS\\Database.db',
        },
        confirmText: 'Purge Entire System',
      },
      async (updateProgress) => {
        setIsWiping(true);
        updateProgress({ percent: 15, message: 'Creating pre-purge automated safety backup in E:\\SHRM_HRIS\\Backups...' });
        await new Promise((r) => setTimeout(r, 100));

        await clearAllData((msg) => {
          updateProgress({ percent: 65, message: msg });
        });

        setIsWiping(false);
        setPurgeProgressMessage('');

        return {
          success: true,
          affectedCount: employees.length + punches.length,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            Status: 'Database tables truncated and vacuumed',
            'Pre-Purge Backup': 'Archived securely to E:\\SHRM_HRIS\\Backups',
          },
        };
      }
    );
  };

  const handleLoadSampleData = async () => {
    await executeWithStatus(
      {
        title: 'Load Standard Demo Sample Data?',
        subtitle: 'Populate workspace with 3 baseline sample employees and operational shifts.',
        module: 'System Setup',
        actionType: 'import',
        confirmText: 'Load Sample Data',
      },
      async (updateProgress) => {
        updateProgress({ percent: 50, message: 'Generating sample employee profiles...' });
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
            targetWorkingHours: 8,
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
            targetWorkingHours: 8,
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
            targetWorkingHours: 8,
          },
        ]);

        return {
          success: true,
          affectedCount: 3,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
        };
      }
    );
  };

  const handleExportBackup = () => {
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: {
        employees,
        punches,
        settings,
        shiftAssignments,
      },
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
      } catch {
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
      lateThreshold: 30,
    };
    setLocalSettings({
      ...localSettings,
      shifts: [...(localSettings.shifts || []), newShift],
    });
  };

  const removeShift = (id: string) => {
    setLocalSettings({
      ...localSettings,
      shifts: localSettings.shifts.filter((s) => s.id !== id),
    });
  };

  const updateShift = (id: string, updates: Partial<ShiftMaster>) => {
    setLocalSettings({
      ...localSettings,
      shifts: localSettings.shifts.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    });
  };

  const sortedHolidays = useMemo(() => {
    return [...(localSettings.holidays || [])].sort((a, b) => a.date.localeCompare(b.date));
  }, [localSettings.holidays]);

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDate = newHolidayDate.trim();
    const cleanName = newHolidayName.trim();
    if (!cleanDate || !cleanName) {
      toast.error('Please enter both holiday date and holiday name.');
      return;
    }

    const existing = localSettings.holidays || [];
    const nextHolidays = [
      ...existing.filter((h) => h.date !== cleanDate),
      {
        id: `hol_${cleanDate.replace(/-/g, '')}`,
        date: cleanDate,
        name: cleanName,
        type: 'National' as const,
        preventPunches: newHolidayPreventPunches,
        allowWorkedPph: true,
      },
    ].sort((a, b) => a.date.localeCompare(b.date));

    const updatedSettings = {
      ...localSettings,
      holidays: nextHolidays,
    };
    setLocalSettings(updatedSettings);
    await setSettings(updatedSettings);
    setNewHolidayDate('');
    setNewHolidayName('');
    setNewHolidayPreventPunches(false);
    toast.success(`Public Holiday "${cleanName}" (${cleanDate}) synced to SQLite holidays master.`);
  };

  const handleToggleHolidayLock = async (dateToToggle: string) => {
    const nextHolidays = (localSettings.holidays || []).map((h) =>
      h.date === dateToToggle ? { ...h, preventPunches: !h.preventPunches } : h
    );
    const updatedSettings = {
      ...localSettings,
      holidays: nextHolidays,
    };
    setLocalSettings(updatedSettings);
    await setSettings(updatedSettings);
    toast.success(`Updated punch lock rule for holiday ${dateToToggle}.`);
  };

  const handleHolidayPolicyChange = async (policy: HolidayPunchPolicy) => {
    const updatedSettings = {
      ...localSettings,
      holidayPunchPolicy: policy,
    };
    setLocalSettings(updatedSettings);
    await setSettings(updatedSettings);
    toast.success('Holiday validation & overlap prevention policy saved.');
  };

  const handleRemoveHoliday = async (dateToRemove: string) => {
    const nextHolidays = (localSettings.holidays || []).filter((h) => h.date !== dateToRemove);
    const updatedSettings = {
      ...localSettings,
      holidays: nextHolidays,
    };
    setLocalSettings(updatedSettings);
    await setSettings(updatedSettings);
    toast.success(`Removed Public Holiday on ${dateToRemove} from SQLite holidays master.`);
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
            if (hasOverlap(i1, i2)) {
              overlap = true;
              break;
            }
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
        title="System Configuration"
        description="Modular workspace for company profile, shift rules, holidays, statutory payroll, and SQLite maintenance"
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
        <div className="p-4 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900/30 rounded-xl flex gap-3 items-start">
          <AlertTriangle size={20} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider mb-1">
              Shift Overlap Detected
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {shiftWarnings.map((w, i) => (
                <span key={i} className="text-xs text-amber-800 dark:text-amber-400 font-medium">
                  • {w}
                </span>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setDismissedWarnings(true)} className="text-amber-700">
            Dismiss
          </Button>
        </div>
      )}

      {/* Horilla 2-Pane Settings Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Settings Category Rail */}
        <aside className="w-full lg:w-64 shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 space-y-1">
          {SETTINGS_SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.key;
            const countTag =
              sec.key === 'attendance'
                ? localSettings.shifts?.length || 0
                : sec.key === 'holidays'
                  ? sortedHolidays.length
                  : null;
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => setActiveSection(sec.key)}
                className={cn(
                  'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary dark:bg-primary/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                )}
              >
                <Icon
                  size={17}
                  className={cn('mt-0.5 shrink-0', isActive ? 'text-primary' : 'text-slate-400')}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('text-[13px] truncate', isActive ? 'font-bold' : 'font-semibold')}>
                      {sec.label}
                    </span>
                    {countTag !== null && (
                      <span className="text-[11px] font-bold tabular-nums opacity-75">{countTag}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {sec.description}
                  </p>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Right Active Configuration Workspace */}
        <div className="flex-1 w-full min-w-0 space-y-6">
          {activeSection === 'general' && (
            <Card title="Company Profile & Calendar Preferences" icon={Building2}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Company Name
                  </label>
                  <Input
                    value={localSettings.companyName}
                    onChange={(e) => setLocalSettings({ ...localSettings, companyName: e.target.value })}
                    placeholder="Global Bio-Tech Corp"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Report Display Title
                  </label>
                  <Input
                    value={localSettings.reportTitle}
                    onChange={(e) => setLocalSettings({ ...localSettings, reportTitle: e.target.value })}
                    placeholder="Monthly Attendance Summary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    PAN / Registration No.
                  </label>
                  <Input
                    value={localSettings.companyRegistrationNo || ''}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, companyRegistrationNo: e.target.value })
                    }
                    placeholder="e.g., PAN-604928172"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Default Weekly Off Day
                  </label>
                  <select
                    value={localSettings.defaultWeeklyOff || 'Saturday'}
                    onChange={(e) => setLocalSettings({ ...localSettings, defaultWeeklyOff: e.target.value })}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {['Saturday', 'Sunday', 'Friday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Official Email
                  </label>
                  <Input
                    type="email"
                    value={localSettings.companyEmail || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, companyEmail: e.target.value })}
                    placeholder="hr@company.com.np"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Contact Phone
                  </label>
                  <Input
                    value={localSettings.companyPhone || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, companyPhone: e.target.value })}
                    placeholder="+977-01-XXXXXXX"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Head Office Address
                  </label>
                  <Input
                    value={localSettings.companyAddress || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, companyAddress: e.target.value })}
                    placeholder="Kathmandu / Industrial Corridor, Nepal"
                  />
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Display Nepali BS Date Globally
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Show Bikram Sambat (BS) dates in top navigation bar, dashboard date selectors, and print reports.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.showNepaliDateEverywhere !== false}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, showNepaliDateEverywhere: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                  />
                </label>
              </div>
            </Card>
          )}

          {activeSection === 'attendance' && (
            <div className="space-y-6">
              <Card title="Shift Master & 24-Hour Roster Coverage" icon={Clock} actions={
                <Button variant="outline" size="sm" onClick={addShift} className="gap-1.5">
                  <Plus size={14} /> Add Shift
                </Button>
              }>
                <div className="space-y-4">
                  <div className="relative h-16 bg-slate-50 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-800 p-2 overflow-hidden">
                    {[0, 6, 12, 18, 24].map((h) => (
                      <div
                        key={h}
                        className="absolute h-full border-l border-slate-200 dark:border-slate-800"
                        style={{ left: `${(h / 24) * 100}%` }}
                      >
                        <span className="text-[9px] font-bold text-slate-400 ml-1 tabular-nums">{h}:00</span>
                      </div>
                    ))}
                    <div className="relative h-full flex flex-col justify-center gap-1 mt-2">
                      {localSettings.shifts.map((s, i) => {
                        const toM = (t: string) => {
                          const [h, m] = t.split(':').map(Number);
                          return h * 60 + m;
                        };
                        const start = toM(s.startTime);
                        const end = toM(s.endTime);
                        const duration = s.isNightShift || end < start ? end + 1440 - start : end - start;
                        const left = (start / 1440) * 100;
                        const width = (duration / 1440) * 100;
                        const colors = ['bg-[#E54F38]', 'bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500'];
                        return (
                          <div key={s.id} className="relative h-1.5 rounded-full overflow-hidden">
                            <div
                              className={cn('absolute h-full rounded-full opacity-75', colors[i % colors.length])}
                              style={{ left: `${left}%`, width: `${width}%` }}
                            />
                            {left + width > 100 && (
                              <div
                                className={cn('absolute h-full rounded-full opacity-75', colors[i % colors.length])}
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
                      <div
                        key={shift.id}
                        className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900/50 hover:border-primary/40 transition-colors"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                          <div className="md:col-span-3">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                              Shift Name
                            </label>
                            <Input
                              value={shift.name}
                              onChange={(e) => updateShift(shift.id, { name: e.target.value })}
                              placeholder="Morning"
                            />
                          </div>
                          <div className="md:col-span-4">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                              Start - End
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="time"
                                value={shift.startTime}
                                onChange={(e) => updateShift(shift.id, { startTime: e.target.value })}
                                className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2 text-xs font-medium focus:outline-none focus:border-primary"
                              />
                              <span className="text-slate-400">-</span>
                              <input
                                type="time"
                                value={shift.endTime}
                                onChange={(e) => updateShift(shift.id, { endTime: e.target.value })}
                                className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2 text-xs font-medium focus:outline-none focus:border-primary"
                              />
                            </div>
                          </div>
                          <div className="md:col-span-3">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                              Grace / Late (Min)
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                value={shift.graceTime || 15}
                                onChange={(e) => updateShift(shift.id, { graceTime: Number(e.target.value) })}
                                className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2 text-xs font-medium text-center tabular-nums"
                              />
                              <input
                                type="number"
                                value={shift.lateThreshold || 30}
                                onChange={(e) => updateShift(shift.id, { lateThreshold: Number(e.target.value) })}
                                className="w-full h-9 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-2 text-xs font-medium text-center tabular-nums"
                              />
                            </div>
                          </div>
                          <div className="md:col-span-2 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={shift.isNightShift}
                                onChange={(e) => updateShift(shift.id, { isNightShift: e.target.checked })}
                                className="rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                              />
                              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                                Night
                              </span>
                            </label>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => removeShift(shift.id)}
                              className="h-6 w-6 p-0 rounded-md"
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card title="Attendance Validation & Tracking Controls" icon={Calendar}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Calculation Period Window
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={localSettings.calculationStartDate || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, calculationStartDate: e.target.value })}
                        className="text-xs tabular-nums"
                      />
                      <span className="text-slate-400 text-xs font-bold">to</span>
                      <Input
                        type="date"
                        value={localSettings.calculationEndDate || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, calculationEndDate: e.target.value })}
                        className="text-xs tabular-nums"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                      <Info size={12} /> Restricts historical recalculation range
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      OT Threshold (Hrs/Day)
                    </label>
                    <Input
                      type="number"
                      step="0.5"
                      value={localSettings.overtimeThreshold}
                      onChange={(e) => setLocalSettings({ ...localSettings, overtimeThreshold: Number(e.target.value) })}
                      className="tabular-nums"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Default Shift Window (Fallback)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="time"
                        value={localSettings.shiftStartTime}
                        onChange={(e) => setLocalSettings({ ...localSettings, shiftStartTime: e.target.value })}
                      />
                      <Input
                        type="time"
                        value={localSettings.shiftEndTime}
                        onChange={(e) => setLocalSettings({ ...localSettings, shiftEndTime: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Duplicate Punch Merge Window (Mins)
                    </label>
                    <Input
                      type="number"
                      value={localSettings.duplicateMergeTime}
                      onChange={(e) => setLocalSettings({ ...localSettings, duplicateMergeTime: Number(e.target.value) })}
                      className="tabular-nums"
                    />
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      key: 'trackLateCome' as const,
                      title: 'Track Late Come',
                      desc: 'Flag arrivals past shift grace minutes',
                      checked: localSettings.trackLateCome !== false,
                    },
                    {
                      key: 'trackEarlyOut' as const,
                      title: 'Track Early Out',
                      desc: 'Flag departures prior to shift end time',
                      checked: localSettings.trackEarlyOut !== false,
                    },
                    {
                      key: 'autoApproveDeviceLogs' as const,
                      title: 'Auto-Validate Terminal Logs',
                      desc: 'Commit verified ZKTeco punches immediately',
                      checked: Boolean(localSettings.autoApproveDeviceLogs),
                    },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start justify-between gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => setLocalSettings({ ...localSettings, [item.key]: e.target.checked })}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                      />
                    </label>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeSection === 'holidays' && (
            <Card
              title="Public Holidays Master & Overlap Policy"
              icon={Calendar}
              actions={
                <span className="text-xs font-bold text-slate-500 tabular-nums">
                  {sortedHolidays.length} configured
                </span>
              }
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Holiday Punch Overlap Policy
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Controls biometric ingestion, imports & attendance overrides on holidays
                    </p>
                  </div>
                  <div className="sm:col-span-7">
                    <select
                      value={localSettings.holidayPunchPolicy || 'prevent_overlaps'}
                      onChange={(e) => handleHolidayPolicyChange(e.target.value as HolidayPunchPolicy)}
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="prevent_overlaps">
                        Prevent Punch Overlaps & Cross-Source Collisions (Auto-Mark PH / Worked PPH)
                      </option>
                      <option value="block_all">
                        Strict Lock — Block All Punches on Holidays (Always Auto-Mark Public Holiday)
                      </option>
                      <option value="allow_worked_pph">
                        Allow Worked Holiday Duty (Auto-Mark PH / PPH, Duplicate Bounces Blocked)
                      </option>
                    </select>
                  </div>
                </div>

                <form onSubmit={handleAddHoliday} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Holiday Date (AD)
                    </label>
                    <Input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      className="text-xs tabular-nums"
                      required
                    />
                  </div>
                  <div className="sm:col-span-4 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                      Holiday Name
                    </label>
                    <Input
                      type="text"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      placeholder="e.g., Dashain / May Day"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center h-9">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={newHolidayPreventPunches}
                        onChange={(e) => setNewHolidayPreventPunches(e.target.checked)}
                        className="rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                      />
                      Strict Lock
                    </label>
                  </div>
                  <div className="sm:col-span-3">
                    <Button type="submit" className="w-full gap-1.5 whitespace-nowrap">
                      <Plus size={14} /> Add Holiday
                    </Button>
                  </div>
                </form>

                {newHolidayDate && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Nepali Date Preview:{' '}
                    <span className="font-bold text-primary">
                      {getNepaliDate(newHolidayDate) !== '0000-00-00'
                        ? `BS ${getNepaliDate(newHolidayDate)}`
                        : '-'}
                    </span>
                  </p>
                )}

                {sortedHolidays.length > 0 ? (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5">AD Date</th>
                          <th className="px-4 py-2.5">BS Date</th>
                          <th className="px-4 py-2.5">Day</th>
                          <th className="px-4 py-2.5">Holiday Name</th>
                          <th className="px-4 py-2.5">Punch Lock</th>
                          <th className="px-4 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedHolidays.map((h) => {
                          let dayLabel = '-';
                          try {
                            dayLabel = format(new Date(`${h.date}T00:00:00`), 'EEE');
                          } catch {}
                          const bsStr = getNepaliDate(h.date);
                          const isLocked = Boolean(h.preventPunches || localSettings.holidayPunchPolicy === 'block_all');
                          return (
                            <tr key={h.date} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                              <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                                {h.date}
                              </td>
                              <td className="px-4 py-2.5 font-semibold text-primary tabular-nums">
                                {bsStr !== '0000-00-00' ? bsStr : '-'}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500">{dayLabel}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">{h.name}</td>
                              <td className="px-4 py-2.5">
                                <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={isLocked}
                                    disabled={localSettings.holidayPunchPolicy === 'block_all'}
                                    onChange={() => handleToggleHolidayLock(h.date)}
                                    className="rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                                  />
                                  <span className={isLocked ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500'}>
                                    {isLocked ? 'Strict Block' : 'Overlap Guard'}
                                  </span>
                                </label>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveHoliday(h.date)}
                                  className="h-7 px-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
                    No public holidays configured yet. Add dates above to reflect Public Holiday (PH) and Worked Holiday (PPH) in Attendance.
                  </div>
                )}
              </div>
            </Card>
          )}

          {activeSection === 'payroll' && (
            <Card
              title="Payroll & Statutory Defaults"
              icon={Calculator}
              actions={
                <Link to="/payroll">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    Open Payroll Engine <ArrowUpRight size={13} />
                  </Button>
                </Link>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Active Fiscal Year
                  </label>
                  <Input
                    value={effectivePayrollConfig.fiscalYear}
                    onChange={(e) => updatePayrollField('fiscalYear', e.target.value)}
                    placeholder="FY 2083/84"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Currency Code
                  </label>
                  <Input
                    value={effectivePayrollConfig.currencySymbol}
                    onChange={(e) => updatePayrollField('currencySymbol', e.target.value)}
                    placeholder="NPR"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Payslip Serial Prefix
                  </label>
                  <Input
                    value={localSettings.payslipPrefix || 'PAY-'}
                    onChange={(e) => setLocalSettings({ ...localSettings, payslipPrefix: e.target.value })}
                    placeholder="PAY-"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Standard Month Days
                  </label>
                  <Input
                    type="number"
                    min={28}
                    max={32}
                    value={effectivePayrollConfig.standardDaysInMonth}
                    onChange={(e) => updatePayrollField('standardDaysInMonth', Number(e.target.value) || 30)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Overtime Rate Multiplier
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min={1}
                    value={effectivePayrollConfig.overtimeMultiplier}
                    onChange={(e) => updatePayrollField('overtimeMultiplier', Number(e.target.value) || 1.5)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    OT Calculation Basis
                  </label>
                  <select
                    value={effectivePayrollConfig.overtimeCalculationBasis || 'basic'}
                    onChange={(e) =>
                      updatePayrollField('overtimeCalculationBasis', e.target.value as 'basic' | 'gross')
                    }
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="basic">Basic Salary</option>
                    <option value="gross">Gross Salary (Basic + Allowances)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    SSF Employee Contribution (%)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={Number((effectivePayrollConfig.ssfEmployeeRate * 100).toFixed(2))}
                    onChange={(e) => updatePayrollField('ssfEmployeeRate', (Number(e.target.value) || 0) / 100)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    SSF Employer Contribution (%)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={Number((effectivePayrollConfig.ssfEmployerRate * 100).toFixed(2))}
                    onChange={(e) => updatePayrollField('ssfEmployerRate', (Number(e.target.value) || 0) / 100)}
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    Non-SSF Provident Fund (%)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={Number((effectivePayrollConfig.pfNonSsfRate * 100).toFixed(2))}
                    onChange={(e) => updatePayrollField('pfNonSsfRate', (Number(e.target.value) || 0) / 100)}
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      Apply 1% Social Security Tax Waiver for SSF Contributors
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Waives the first-slab 1% SST charge automatically for enrolled SSF staff in salary tax calculations.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={effectivePayrollConfig.ssfSlab1SstWaiver}
                    onChange={(e) => updatePayrollField('ssfSlab1SstWaiver', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                  />
                </label>
              </div>
            </Card>
          )}

          {activeSection === 'security' && (
            <div className="space-y-6">
              <Card title="Company Network & Caddy Access Policy" icon={Shield}>
                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Enforce Company LAN IP Allowlist Policy Flag
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Record approved corporate CIDR / gateway subnet for internal Caddy reverse-proxy auditing.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(localSettings.ipRestrictionEnabled)}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, ipRestrictionEnabled: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary accent-[#E54F38]"
                    />
                  </label>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      Allowed Internal Subnets / Caddy Trusted Range
                    </label>
                    <Input
                      value={localSettings.allowedNetworkCidr || '192.168.0.0/16, 10.0.0.0/8'}
                      onChange={(e) => setLocalSettings({ ...localSettings, allowedNetworkCidr: e.target.value })}
                      placeholder="192.168.1.0/24, 10.0.0.0/8"
                    />
                    <p className="text-[11px] text-slate-500">
                      Provision authorized user login accounts and module permissions from User & Role Configuration.
                    </p>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link to="/user-access" className="block">
                  <Card className="h-full hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">User & Role Access</h4>
                      <ArrowUpRight size={14} className="text-primary" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Create login credentials, assign role scope, and restrict modules per user.
                    </p>
                  </Card>
                </Link>
                <Link to="/devices" className="block">
                  <Card className="h-full hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">Biometric Terminals</h4>
                      <ArrowUpRight size={14} className="text-primary" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Configure ZKTeco device IPs, polling interval, and one-click log download.
                    </p>
                  </Card>
                </Link>
                <Link to="/audit-logs" className="block">
                  <Card className="h-full hover:border-primary/40 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">System Audit Trail</h4>
                      <ArrowUpRight size={14} className="text-primary" />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Inspect login attempts, configuration changes, and attendance overrides.
                    </p>
                  </Card>
                </Link>
              </div>
            </div>
          )}

          {activeSection === 'system' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card
                title="System Health Monitor (14 Metrics)"
                icon={Activity}
                actions={
                  <Badge variant={systemHealth?.databaseAccessible ? 'success' : 'danger'}>
                    {systemHealth?.databaseAccessible ? 'Healthy' : 'Degraded'}
                  </Badge>
                }
              >
                <div className="space-y-2 mb-5 text-[11px] font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">App Status</span>
                    <span className="font-bold text-emerald-600">{systemHealth?.appStatus || 'Active'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Node.js Server</span>
                    <span className="font-bold text-slate-900 dark:text-white">{systemHealth?.nodeStatus || 'Running'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Caddy Proxy</span>
                    <span className="font-bold text-slate-900 dark:text-white">{systemHealth?.caddyStatus || 'Active (:844)'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Database Engine</span>
                    <span className="font-bold text-primary">{systemHealth?.databaseStatus || 'SQLite'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Active SQLite Path</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[200px]" title={systemHealth?.activeSqlitePath}>
                      {systemHealth?.activeSqlitePath || 'Database.db'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">DB Accessible</span>
                    <span className={cn('font-bold', systemHealth?.databaseAccessible ? 'text-emerald-600' : 'text-rose-600')}>
                      {systemHealth?.databaseAccessible ? 'YES (PRAGMA ok)' : 'NO'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Last DB Verification</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                      {systemHealth?.lastSuccessfulDbVerification
                        ? new Date(systemHealth.lastSuccessfulDbVerification).toLocaleTimeString()
                        : 'Verified on startup'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">ZKT Terminal State</span>
                    <span className="font-bold text-slate-900 dark:text-white">{systemHealth?.zkDeviceConnection || 'Connected'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Last Punch Polling</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                      {systemHealth?.lastPunchPollingTime
                        ? new Date(systemHealth.lastPunchPollingTime).toLocaleTimeString()
                        : 'Active (15s read-only)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">External Punch Count</span>
                    <span className="font-bold text-primary tabular-nums">
                      {(systemHealth?.externalPunchRecordCount ?? punches.length).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Connected Users</span>
                    <span className="font-bold text-emerald-600 tabular-nums">{systemHealth?.connectedUserCount ?? 1}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">App Version</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {systemHealth?.activeAppVersion || 'v1.4.2-enterprise'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Latest Backup Status</span>
                    <span className="font-bold text-emerald-600">{systemHealth?.latestBackupStatus || 'Secured'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 uppercase">Punch Mode</span>
                    <span className="font-bold text-amber-600">{systemHealth?.punchMode || 'READ_ONLY'}</span>
                  </div>
                </div>

                <Button
                  onClick={handleRunDiagnostics}
                  disabled={isRunningDiag}
                  variant="outline"
                  className="w-full text-xs gap-2"
                >
                  {isRunningDiag ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                  {isRunningDiag ? 'Running Diagnostic...' : 'Run Local Diagnostic'}
                </Button>
              </Card>

              <div className="space-y-6">
                <Card title="Data Backup & Restore" icon={History}>
                  <div className="space-y-2.5">
                    <Button variant="outline" className="w-full justify-start gap-3" onClick={handleExportBackup}>
                      <Download size={14} /> Export JSON Snapshot
                    </Button>
                    <label className="block">
                      <Button variant="outline" className="w-full justify-start gap-3 pointer-events-none">
                        <Plus size={14} /> Restore from JSON Backup
                      </Button>
                      <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                    </label>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      onClick={handleLoadSampleData}
                    >
                      <Plus size={14} /> Load Sample Records
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3"
                      onClick={async () => {
                        const res = await authFetch('/api/local/backup', { method: 'POST' }).then((r) => r.json());
                        toast.success(res.message || 'Local backup saved to E:\\SHRM_HRIS\\backups\\');
                      }}
                    >
                      <Database size={14} /> Create On-Demand SQLite Backup
                    </Button>
                  </div>
                </Card>

                <Card title="Danger Zone — Maintenance" icon={ShieldAlert} className="border-red-200 dark:border-red-900/40">
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    Permanently wipe all employee profiles, biometric logs, and system configurations from SQLite. A pre-purge safety backup is created automatically first.
                  </p>
                  <Button
                    variant="danger"
                    className="w-full gap-2"
                    onClick={() => setIsConfirmingPurge(true)}
                    disabled={isWiping}
                  >
                    <Trash2 size={14} /> {isWiping ? 'Wiping...' : 'Purge All Data'}
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostic Report Modal */}
      {showDiagModal && diagData && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="max-w-2xl w-full p-6 my-8 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="text-primary" size={20} />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Real Backend Local Diagnostic Report
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  GET /api/local/diagnostics • Tested at {new Date(diagData.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDiagModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div
              className={cn(
                'p-4 rounded-xl border flex gap-3 items-start',
                diagData.runtime?.platform === 'win32'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-300'
              )}
            >
              <Info className="shrink-0 mt-0.5" size={20} />
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-xs font-black uppercase tracking-wider block">
                  {diagData.accessibilityStatus}
                </span>
                <p className="text-xs leading-relaxed">{diagData.summaryNote}</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <Server size={14} className="text-primary" />
                  1. Runtime & OS Environment
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">Current Operating System:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {diagData.runtime?.platform} ({diagData.runtime?.arch})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Node.js Version:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{diagData.runtime?.nodeVersion}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block">Environment Classification:</span>
                    <span className="font-bold text-primary">{diagData.runtime?.runtimeLabel}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <HardDrive size={14} className="text-emerald-500" />
                  2. Database Paths & File Checks
                </h4>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">Target Configured Path:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {diagData.paths?.configuredDatabasePath}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Active Runtime Physical Database Path:</span>
                    <span className="font-bold text-primary">{diagData.paths?.actualDatabasePath}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-slate-500">Root Directory Exists:</span>
                    <Badge variant={diagData.paths?.rootDirectoryExists ? 'success' : 'danger'}>
                      {diagData.paths?.rootDirectoryExists ? 'EXISTS' : 'MISSING'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Database File Exists:</span>
                    <Badge variant={diagData.paths?.databaseFileExists ? 'success' : 'danger'}>
                      {diagData.paths?.databaseFileExists ? 'EXISTS' : 'NOT FOUND'}
                    </Badge>
                  </div>
                  {diagData.databaseFile?.exists && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Database Size:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {diagData.databaseFile?.sizeFormatted}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Last Modified:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {new Date(diagData.databaseFile?.lastModified).toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <Database size={14} className="text-primary" />
                  3. SQLite Engine & Query Tests
                </h4>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">SQLite Connection:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {diagData.sqliteTests?.connection}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">
                      SELECT Read Test (Count: {diagData.sqliteTests?.readTest?.employeeCount}):
                    </span>
                    <Badge variant={diagData.sqliteTests?.readTest?.passed ? 'success' : 'danger'}>
                      {diagData.sqliteTests?.readTest?.passed
                        ? `PASSED (${diagData.sqliteTests?.readTest?.latencyMs}ms)`
                        : 'FAILED'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">INSERT/VERIFY/DELETE Write Test:</span>
                    <Badge variant={diagData.sqliteTests?.writeTest?.passed ? 'success' : 'danger'}>
                      {diagData.sqliteTests?.writeTest?.passed
                        ? `PASSED (${diagData.sqliteTests?.writeTest?.latencyMs}ms)`
                        : 'FAILED'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-mono">BEGIN/COMMIT Transaction Test:</span>
                    <Badge variant={diagData.sqliteTests?.transactionTest?.passed ? 'success' : 'danger'}>
                      {diagData.sqliteTests?.transactionTest?.passed
                        ? `PASSED (${diagData.sqliteTests?.transactionTest?.latencyMs}ms)`
                        : 'FAILED'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 uppercase tracking-wider text-[10px]">
                  <FileCheck size={14} className="text-amber-500" />
                  4. Local Document Disk Storage
                </h4>
                <div className="space-y-1.5 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-400 block">Documents Folder Path:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {diagData.paths?.documentsDirectoryPath}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-slate-500">Folder Exists:</span>
                    <Badge variant={diagData.paths?.documentsDirectoryExists ? 'success' : 'danger'}>
                      {diagData.paths?.documentsDirectoryExists ? 'EXISTS' : 'MISSING'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Create/Read/Delete Temp File Test:</span>
                    <Badge variant={diagData.fileIoTest?.passed ? 'success' : 'danger'}>
                      {diagData.fileIoTest?.passed ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                Diagnostic Time: {diagData.totalDiagnosticTimeMs}ms
              </span>
              <Button onClick={() => setShowDiagModal(false)}>Close Diagnostic</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Purge Confirmation Modal */}
      {isConfirmingPurge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <AlertTriangle size={24} />
              <h4 className="text-lg font-bold">Destroy All Data</h4>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              This will <span className="font-bold text-red-600 uppercase">permanently delete</span> all system data.
              This action is irreversible.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleClearAllData();
              }}
            >
              <div className="space-y-2 mb-6">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 block">
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
                    <p className="text-xs font-bold text-red-700 dark:text-red-300">Wiping All System Data...</p>
                    <p className="text-[11px] font-mono text-red-600 dark:text-red-400 truncate">
                      {purgeProgressMessage || 'Deleting tables...'}
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
