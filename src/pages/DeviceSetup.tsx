import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store';
import { ZkDevice, ZkProtocolMode } from '../types';
import {
  Cpu,
  Wifi,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  UserCheck,
  Link2,
  Unlink,
  Clock,
  Download,
  Search,
  AlertTriangle,
  HardDrive,
  FileUp,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '../lib/authSession';

const SCHEDULE_PRESETS = [5, 10, 15, 30, 60];

export const DeviceSetup: React.FC = () => {
  const {
    zkDevices,
    zkUserMappings,
    zkSyncLogs,
    zkUnmappedPunches,
    employees,
    punches,
    addZkDevice,
    updateZkDevice,
    deleteZkDevice,
    syncAllZkDevices,
    fetchPunches,
    resolveUnmappedPunches,
    unmapZkUser,
    clearZkSyncLogs,
    isAdmin
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'devices' | 'mapping' | 'unmapped' | 'dat_import' | 'history'>('devices');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDatDeviceId, setSelectedDatDeviceId] = useState<string>('');
  const [pollSummary, setPollSummary] = useState<any>(null);
  const [customIntervalMinutes, setCustomIntervalMinutes] = useState<number>(15);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isDownloadingLogs, setIsDownloadingLogs] = useState(false);

  // Modal & Diagnostic States
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ZkDevice | null>(null);
  const [isTestingId, setIsTestingId] = useState<string | null>(null);
  const [diagnosticDevice, setDiagnosticDevice] = useState<ZkDevice | null>(null);
  const [lastDiagnosticResult, setLastDiagnosticResult] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    ip: string;
    port: number;
    model: string;
    serialNumber: string;
    deviceNumber: number;
    commType: 'Ethernet' | 'USB' | 'Serial' | 'WiFi';
    enabled: boolean;
    autoSyncMinutes: number;
    protocolMode: ZkProtocolMode;
    commKey: number;
  }>({
    name: '',
    ip: '192.168.117.200',
    port: 4370,
    model: 'MB2000/ID',
    serialNumber: '',
    deviceNumber: 1,
    commType: 'Ethernet',
    enabled: true,
    autoSyncMinutes: 15,
    protocolMode: 'Auto',
    commKey: 0
  });

  // Mapping Form State
  const [mapDeviceUserId, setMapDeviceUserId] = useState('');
  const [mapEmployeeId, setMapEmployeeId] = useState('');
  const [isProcessingDat, setIsProcessingDat] = useState(false);

  const loadPollSummary = useCallback(async () => {
    try {
      const res = await authFetch('/api/zk/auto-poll/status');
      if (res.ok) {
        const data = await res.json();
        setPollSummary(data);
        const serverMins = Number(data?.intervalMinutes || Math.round((data?.intervalSeconds || 900) / 60) || 15);
        setCustomIntervalMinutes(serverMins);
      }
    } catch {
      // ignore transient network errors
    }
  }, []);

  useEffect(() => {
    loadPollSummary();
    const timer = setInterval(loadPollSummary, 25000);
    return () => clearInterval(timer);
  }, [loadPollSummary]);

  // Single primary action: Download attendance logs from active biometric devices into SQLite
  const handleDownloadLogs = async () => {
    if (isDownloadingLogs) return;
    setIsDownloadingLogs(true);
    try {
      await syncAllZkDevices();
      await loadPollSummary();
    } finally {
      setIsDownloadingLogs(false);
    }
  };

  // Toggle Auto-Fetch Enabled/Paused and persist in SQLite
  const handleToggleAutoFetch = async () => {
    setIsSavingSchedule(true);
    try {
      const nextEnabled = !(pollSummary?.enabled !== false);
      const res = await authFetch('/api/zk/auto-poll/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPollSummary(data);
        toast.success(
          nextEnabled
            ? `Scheduled auto-fetch enabled (every ${data.intervalMinutes || 15} min)`
            : 'Scheduled auto-fetch paused'
        );
      } else {
        toast.error(data?.error || 'Failed to update schedule');
      }
    } catch {
      toast.error('Failed to update auto-fetch schedule');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Save required auto-fetch interval (minutes) in SQLite
  const handleApplyIntervalMinutes = async (minutes: number) => {
    const cleanMins = Math.max(1, Math.min(1440, Math.round(minutes || 15)));
    setCustomIntervalMinutes(cleanMins);
    setIsSavingSchedule(true);
    try {
      const res = await authFetch('/api/zk/auto-poll/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: cleanMins })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPollSummary(data);
        toast.success(`Auto-fetch interval set to every ${cleanMins} min`);
      } else {
        toast.error(data?.error || 'Failed to save schedule interval');
      }
    } catch {
      toast.error('Failed to update auto-fetch interval');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Parse ZK date/time string variants preserving hardware wall-clock time
  const parseZkDateTime = (dateStr: string, timeStr?: string): string | null => {
    if (!dateStr) return null;
    const cleanD = dateStr.trim().replace(/^"|"$/g, '');
    const cleanT = (timeStr || '').trim().replace(/^"|"$/g, '') || '00:00:00';
    const pad = (n: number) => String(n).padStart(2, '0');

    const ymdMatch = cleanD.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (ymdMatch) {
      const yr = parseInt(ymdMatch[1], 10);
      const mo = parseInt(ymdMatch[2], 10);
      const dy = parseInt(ymdMatch[3], 10);
      const tParts = cleanT.split(':');
      const hr = parseInt(tParts[0] || '0', 10);
      const mn = parseInt(tParts[1] || '0', 10);
      const sc = parseInt(tParts[2] || '0', 10);
      return `${yr}-${pad(mo)}-${pad(dy)}T${pad(hr)}:${pad(mn)}:${pad(sc)}`;
    }

    const dmyMatch = cleanD.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      const yr = parseInt(dmyMatch[3], 10);
      let dy = p1;
      let mo = p2;
      if (p1 > 12) {
        dy = p1;
        mo = p2;
      } else if (p2 > 12) {
        mo = p1;
        dy = p2;
      }
      const tParts = cleanT.split(':');
      const hr = parseInt(tParts[0] || '0', 10);
      const mn = parseInt(tParts[1] || '0', 10);
      const sc = parseInt(tParts[2] || '0', 10);
      return `${yr}-${pad(mo)}-${pad(dy)}T${pad(hr)}:${pad(mn)}:${pad(sc)}`;
    }

    try {
      const d = new Date(`${cleanD} ${cleanT}`);
      if (isNaN(d.getTime())) return null;
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch {
      return null;
    }
  };

  const handleDatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsProcessingDat(true);
    const tId = toast.loading(`Reading "${file.name}"...`);

    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const parsedPunches: { deviceUserId: string; punchDateTime: string }[] = [];

      for (const rawLine of lines) {
        const lower = rawLine.toLowerCase();
        if (!rawLine || lower.startsWith('ac-no') || lower.startsWith('user id') || lower.startsWith('no,') || lower.startsWith('//') || lower.startsWith('#')) {
          continue;
        }

        let parts: string[] = [];
        if (rawLine.includes('\t')) {
          parts = rawLine.split('\t').map(s => s.trim().replace(/^"|"$/g, ''));
        } else if (rawLine.includes(',')) {
          parts = rawLine.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        } else {
          parts = rawLine.split(/\s+/).map(s => s.trim().replace(/^"|"$/g, ''));
        }

        if (parts.length >= 2) {
          const uId = parts[0];
          let isoDate: string | null = null;

          if (parts[1].includes(' ') || parts[1].includes('T')) {
            const [dPart, tPart] = parts[1].split(/[ T]/);
            isoDate = parseZkDateTime(dPart, tPart);
          } else if (parts[2] && (parts[2].includes(':') || parts[1].match(/[/.-]/))) {
            isoDate = parseZkDateTime(parts[1], parts[2]);
          } else {
            for (let i = 1; i < parts.length; i++) {
              if (parts[i].match(/\d{2,4}[/.-]\d{1,2}[/.-]\d{2,4}/)) {
                const dateP = parts[i];
                const timeP = parts[i + 1] && parts[i + 1].includes(':') ? parts[i + 1] : '00:00:00';
                isoDate = parseZkDateTime(dateP, timeP);
                if (isoDate) break;
              }
            }
          }

          if (uId && isoDate) {
            parsedPunches.push({ deviceUserId: uId, punchDateTime: isoDate });
          }
        }
      }

      if (parsedPunches.length === 0) {
        toast.error('No valid punch records found. Supported: 1_attlog.dat, attlog.txt, or CSV/TSV exports.', { id: tId });
        return;
      }

      const targetDev = zkDevices.find(d => d.id === selectedDatDeviceId) || zkDevices[0] || {
        id: 'dev_usb',
        name: 'DAT File Import',
        ip: 'File Upload'
      };

      let totalNew = 0;
      let totalDup = 0;
      let totalUnmapped = 0;

      const batchSize = 2000;
      for (let i = 0; i < parsedPunches.length; i += batchSize) {
        const chunk = parsedPunches.slice(i, i + batchSize);
        const resp = await authFetch('/api/zk/agent/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: targetDev.id,
            deviceName: targetDev.name,
            deviceIP: targetDev.ip,
            mode: `File Import (${file.name})`,
            punches: chunk
          })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data?.error || 'Failed to store punch records in SQLite');
        }
        totalNew += Number(data.newRecords || 0);
        totalDup += Number(data.duplicates || 0);
        totalUnmapped += Number(data.unmappedCount || 0);
      }

      await fetchPunches();
      await loadPollSummary();
      toast.success(
        `Imported ${parsedPunches.length.toLocaleString()} records into SQLite (${totalNew.toLocaleString()} new, ${totalDup.toLocaleString()} duplicates${totalUnmapped > 0 ? `, ${totalUnmapped} unmapped` : ''}).`,
        { id: tId }
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to import log file', { id: tId });
    } finally {
      setIsProcessingDat(false);
      e.target.value = '';
    }
  };

  // Device Add / Edit Handlers
  const handleOpenAdd = () => {
    setEditingDevice(null);
    setFormData({
      name: '',
      ip: '192.168.117.200',
      port: 4370,
      model: 'MB2000/ID',
      serialNumber: '',
      deviceNumber: 1,
      commType: 'Ethernet',
      enabled: true,
      autoSyncMinutes: Number(pollSummary?.intervalMinutes || 15),
      protocolMode: 'Auto',
      commKey: 0
    });
    setIsDeviceModalOpen(true);
  };

  const handleOpenEdit = (dev: ZkDevice) => {
    setEditingDevice(dev);
    setFormData({
      name: dev.name,
      ip: dev.ip,
      port: dev.port || 4370,
      model: dev.model || 'MB2000/ID',
      serialNumber: dev.serialNumber || '',
      deviceNumber: dev.deviceNumber || 1,
      commType: dev.commType || 'Ethernet',
      enabled: dev.enabled,
      autoSyncMinutes: dev.autoSyncMinutes ?? 15,
      protocolMode: dev.protocolMode || 'Auto',
      commKey: Number(dev.commKey || 0)
    });
    setIsDeviceModalOpen(true);
  };

  const handleSubmitDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Device Name is required');
      return;
    }
    if (!formData.ip.trim()) {
      toast.error('IP Address is required');
      return;
    }

    try {
      if (editingDevice) {
        await updateZkDevice(editingDevice.id, formData);
      } else {
        await addZkDevice({ ...formData, status: 'offline' });
      }
      setIsDeviceModalOpen(false);
      await loadPollSummary();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save device');
    }
  };

  const handleDelete = async (dev: ZkDevice) => {
    if (!window.confirm(`Remove biometric terminal ${dev.name} (${dev.ip})?`)) return;
    try {
      await deleteZkDevice(dev.id);
      await loadPollSummary();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete device');
    }
  };

  const handleTestConnection = async (dev: ZkDevice) => {
    setIsTestingId(dev.id);
    try {
      const res = await authFetch('/api/zk/agent/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: dev.id,
          ip: dev.ip,
          port: dev.port,
          commKey: Number(dev.commKey || 0),
          protocolMode: dev.protocolMode || 'Auto',
          model: dev.model
        })
      });
      const data = await res.json();
      setLastDiagnosticResult(data);
      if (data.reachable || data.success) {
        toast.success(data.message);
        await updateZkDevice(dev.id, {
          status: 'online',
          lastConnection: new Date().toISOString(),
          lastProtocolUsed: data.protocol,
          lastError: '',
          ...(data.serialNumber ? { serialNumber: data.serialNumber } : {}),
          ...(data.freeSizes ? { deviceCapacityUsers: data.freeSizes.userCount, deviceCapacityLogs: data.freeSizes.logCount } : {})
        });
      } else {
        toast.warning(data.message || `Terminal ${dev.ip}:${dev.port} did not respond`);
        await updateZkDevice(dev.id, {
          status: 'offline',
          lastError: data.error || 'Unreachable from server host'
        });
      }
      setDiagnosticDevice(dev);
      await loadPollSummary();
    } catch (err: any) {
      toast.error(`Connection check failed: ${err?.message || 'Network error'}`);
    } finally {
      setIsTestingId(null);
    }
  };

  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapDeviceUserId.trim()) {
      toast.error('Enter Biometric User ID');
      return;
    }
    if (!mapEmployeeId) {
      toast.error('Select an HRIS Employee');
      return;
    }

    try {
      await resolveUnmappedPunches(mapDeviceUserId.trim(), mapEmployeeId);
      setMapDeviceUserId('');
      setMapEmployeeId('');
      await loadPollSummary();
    } catch (err: any) {
      toast.error(err.message || 'Failed to map biometric ID');
    }
  };

  const filteredDevices = useMemo(
    () =>
      zkDevices.filter(
        d =>
          d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          d.ip.includes(searchTerm) ||
          (d.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (d.serialNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [zkDevices, searchTerm]
  );

  const activeDirectoryEmployeeCount = useMemo(
    () => employees.filter(e => !e.status || e.status.toLowerCase() === 'active').length,
    [employees]
  );

  const liveDeviceStatsMap = useMemo(() => {
    const map = new Map<string, { logs: number; users: number }>();
    const userSets = new Map<string, Set<string>>();

    zkDevices.forEach(d => {
      map.set(d.id, { logs: 0, users: 0 });
      userSets.set(d.id, new Set<string>());
    });

    const primaryEnabledDev = zkDevices.find(d => d.enabled) || zkDevices[0];

    punches.forEach(p => {
      const dId = p.deviceId || '';
      const matchedDev =
        zkDevices.find(
          d => d.id === dId || (p.deviceIP && d.ip === p.deviceIP) || (p.deviceName && d.name === p.deviceName)
        ) || (!dId ? primaryEnabledDev : undefined);

      if (matchedDev) {
        const curr = map.get(matchedDev.id) || { logs: 0, users: 0 };
        curr.logs += 1;
        if (p.employeeId) {
          userSets.get(matchedDev.id)?.add(String(p.employeeId).trim());
        }
        curr.users = userSets.get(matchedDev.id)?.size || 0;
        map.set(matchedDev.id, curr);
      }
    });

    return map;
  }, [zkDevices, punches]);

  const unmappedGrouped = useMemo(() => {
    const map = new Map<string, { deviceUserId: string; count: number; lastPunch: string; deviceName: string; deviceIP: string }>();
    zkUnmappedPunches
      .filter(p => !p.status || p.status === 'pending')
      .forEach(p => {
        const existing = map.get(p.deviceUserId);
        if (existing) {
          existing.count++;
          if (new Date(p.punchDateTime) > new Date(existing.lastPunch)) {
            existing.lastPunch = p.punchDateTime;
          }
        } else {
          map.set(p.deviceUserId, {
            deviceUserId: p.deviceUserId,
            count: 1,
            lastPunch: p.punchDateTime,
            deviceName: p.deviceName,
            deviceIP: p.deviceIP
          });
        }
      });
    return Array.from(map.values());
  }, [zkUnmappedPunches]);

  const activeIntervalMinutes = Number(pollSummary?.intervalMinutes || Math.round((pollSummary?.intervalSeconds || 900) / 60) || 15);
  const isScheduleEnabled = pollSummary?.enabled !== false;
  const isCustomPreset = !SCHEDULE_PRESETS.includes(activeIntervalMinutes);

  return (
    <div className="space-y-5">
      {/* Page Header — Single Primary Action: Download Logs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-100 dark:border-indigo-900">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              ZKTeco Biometric Devices
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Download hardware punch logs into SQLite, configure auto-fetch schedule, and manage terminal mappings.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleDownloadLogs}
            disabled={isDownloadingLogs || zkDevices.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs flex items-center gap-2 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className={`w-4 h-4 ${isDownloadingLogs ? 'animate-bounce' : ''}`} />
            {isDownloadingLogs ? 'Downloading Logs...' : 'Download Logs'}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Device
            </button>
          )}
        </div>
      </div>

      {/* Auto-Fetch Schedule & SQLite Summary Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
          <div className="sm:border-r border-slate-100 dark:border-slate-800 pr-3">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
              SQLite Punch Logs
            </span>
            <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
              {(pollSummary?.punchCount ?? punches.length).toLocaleString()}
            </span>
          </div>
          <div className="sm:border-r border-slate-100 dark:border-slate-800 pr-3">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
              Active Employees
            </span>
            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {pollSummary?.activeEmployeeCount ?? activeDirectoryEmployeeCount}
            </span>
          </div>
          <div className="sm:border-r border-slate-100 dark:border-slate-800 pr-3">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
              Mapped User IDs
            </span>
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {pollSummary?.mappedUserCount ?? zkUserMappings.length}
            </span>
          </div>
          <div>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block">
              Pending Unmapped
            </span>
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {pollSummary?.pendingUnmappedCount ?? unmappedGrouped.length}
            </span>
          </div>
        </div>

        {/* Auto-Fetch Schedule Controls */}
        <div className="flex flex-wrap items-center gap-2.5 pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 lg:pl-4">
          <button
            type="button"
            onClick={handleToggleAutoFetch}
            disabled={isSavingSchedule}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              isScheduleEnabled
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Auto-Fetch: {isScheduleEnabled ? 'ON' : 'PAUSED'}
          </button>

          <select
            value={isCustomPreset ? 'custom' : activeIntervalMinutes}
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                handleApplyIntervalMinutes(Number(e.target.value));
              }
            }}
            disabled={isSavingSchedule}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            title="Auto-Fetch Frequency"
          >
            <option value={5}>Every 5 min</option>
            <option value={10}>Every 10 min</option>
            <option value={15}>Every 15 min (Default)</option>
            <option value={30}>Every 30 min</option>
            <option value={60}>Every 60 min</option>
            <option value="custom">Custom ({activeIntervalMinutes} min)</option>
          </select>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={1440}
              value={customIntervalMinutes}
              onChange={(e) => setCustomIntervalMinutes(Math.max(1, Math.min(1440, parseInt(e.target.value || '15', 10) || 1)))}
              className="w-16 px-2 py-1.5 rounded-lg text-xs font-mono font-semibold text-right tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              title="Custom interval in minutes (1–1440)"
              aria-label="Auto-fetch interval minutes"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">min</span>
            {customIntervalMinutes !== activeIntervalMinutes && (
              <button
                type="button"
                onClick={() => handleApplyIntervalMinutes(customIntervalMinutes)}
                disabled={isSavingSchedule}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3 h-3" />
                Save
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'devices' as const, label: `Devices (${zkDevices.length})`, icon: HardDrive },
          { id: 'mapping' as const, label: `User Mapping (${zkUserMappings.length})`, icon: UserCheck },
          { id: 'unmapped' as const, label: `Unmapped Punches (${unmappedGrouped.length})`, icon: AlertTriangle },
          { id: 'dat_import' as const, label: 'DAT / CSV Import', icon: FileUp },
          { id: 'history' as const, label: `Sync History (${zkSyncLogs.length})`, icon: Clock }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: REGISTERED TERMINALS */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-md flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by device name, IP address, model, or serial..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {filteredDevices.filter(d => d.status === 'online').length} / {filteredDevices.length} Connected
              {pollSummary?.nextPollAt && isScheduleEnabled && (
                <span> · Next scheduled fetch {new Date(pollSummary.nextPollAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>

          {filteredDevices.length > 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-semibold uppercase text-[11px] tracking-wider">
                      <th className="py-3 px-4 whitespace-nowrap">Device &amp; Serial</th>
                      <th className="py-3 px-3 whitespace-nowrap">Status</th>
                      <th className="py-3 px-3 whitespace-nowrap">IP &amp; Port</th>
                      <th className="py-3 px-3 whitespace-nowrap">Model / Mode</th>
                      <th className="py-3 px-3 whitespace-nowrap text-right">Enrolled</th>
                      <th className="py-3 px-3 whitespace-nowrap text-right">FP / Face</th>
                      <th className="py-3 px-3 whitespace-nowrap text-right">Device Logs</th>
                      <th className="py-3 px-3 whitespace-nowrap text-right">SQLite Logs</th>
                      <th className="py-3 px-3 whitespace-nowrap">Last Sync</th>
                      <th className="py-3 px-4 whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredDevices.map((dev) => {
                      const sqliteCount = Math.max(liveDeviceStatsMap.get(dev.id)?.logs || 0, dev.logCount || 0);
                      const isOnline = dev.status === 'online';
                      return (
                        <tr key={dev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 align-middle">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {dev.name}
                              {!dev.enabled && (
                                <span className="ml-1.5 text-[11px] font-normal text-slate-400">(Disabled)</span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                              #{dev.deviceNumber ?? 1} · SN: {dev.serialNumber || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className={`font-semibold ${isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {isOnline ? 'Connected' : 'Offline'}
                            </span>
                            {dev.lastError && !isOnline && (
                              <div className="text-[11px] text-rose-500/80 truncate max-w-[170px]" title={dev.lastError}>
                                {dev.lastError}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 align-middle font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap tabular-nums">
                            {dev.ip}:{dev.port || 4370}
                          </td>
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="font-mono text-slate-800 dark:text-slate-200">{dev.model}</span>
                            <span className="block text-[11px] text-slate-500">
                              {dev.commType || 'Ethernet'} · {dev.lastProtocolUsed || dev.protocolMode || 'Auto'}
                            </span>
                          </td>
                          <td className="py-3 px-3 align-middle text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            {(dev.deviceCapacityUsers ?? dev.userCount ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 align-middle text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {(dev.fpCount ?? 0).toLocaleString()} / {(dev.userFaceCount ?? dev.faceCount ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 align-middle text-right font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                            {(dev.deviceCapacityLogs ?? 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 align-middle text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {sqliteCount.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 align-middle text-slate-500 dark:text-slate-400 font-mono tabular-nums whitespace-nowrap">
                            {dev.lastSync ? new Date(dev.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                          </td>
                          <td className="py-3 px-4 align-middle text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTestConnection(dev)}
                                disabled={isTestingId === dev.id}
                                className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                title="Test terminal TCP/UDP connectivity"
                              >
                                {isTestingId === dev.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Wifi className="w-3.5 h-3.5 text-indigo-500" />
                                )}
                                Test
                              </button>

                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(dev)}
                                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                    title="Edit Device"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(dev)}
                                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors cursor-pointer"
                                    title="Remove Device"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <Cpu className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No ZKTeco Devices Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Add your biometric devices to download punch logs directly into SQLite.
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Add ZKTeco Device
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: USER MAPPING */}
      {activeTab === 'mapping' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-1">
              <Link2 className="w-4 h-4 text-indigo-600" />
              Link Biometric User ID to HRIS Employee
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Map numeric ZKTeco terminal user IDs to HRIS employees so downloaded punches assign accurately.
            </p>

            <form onSubmit={handleSaveMapping} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Biometric User ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 101"
                  value={mapDeviceUserId}
                  onChange={(e) => setMapDeviceUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  HRIS Employee Profile
                </label>
                <select
                  value={mapEmployeeId}
                  onChange={(e) => setMapEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id}) - {emp.department || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Save &amp; Map User
              </button>
            </form>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                Active Biometric Mappings ({zkUserMappings.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Biometric ID</th>
                    <th className="px-5 py-3">Employee ID</th>
                    <th className="px-5 py-3">Employee Name</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Mapped Date</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {zkUserMappings.map((m) => {
                    const emp = employees.find(e => e.id === m.employeeId);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">#{m.deviceUserId}</td>
                        <td className="px-5 py-3 font-mono">{m.employeeId}</td>
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {emp?.name || m.employeeName || m.employeeId}
                        </td>
                        <td className="px-5 py-3">{emp?.department || m.department || 'N/A'}</td>
                        <td className="px-5 py-3 text-slate-500 tabular-nums">
                          {m.mappedAt ? new Date(m.mappedAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => unmapZkUser(m.id)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                            Unmap
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {zkUserMappings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                        No biometric user mappings created yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: UNMAPPED PUNCHES */}
      {activeTab === 'unmapped' && (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-4 rounded-xl flex items-start gap-3 text-amber-900 dark:text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Unmapped Biometric Punches</span>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                Punches from biometric IDs not yet linked to an HRIS employee appear here. Map the user ID to sync them into Attendance Logs.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Biometric User ID</th>
                    <th className="px-5 py-3">Device Name</th>
                    <th className="px-5 py-3">IP Address</th>
                    <th className="px-5 py-3 text-right">Pending Punches</th>
                    <th className="px-5 py-3">Latest Punch Time</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {unmappedGrouped.map((item) => (
                    <tr key={item.deviceUserId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 font-mono font-bold text-amber-600 dark:text-amber-400">#{item.deviceUserId}</td>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{item.deviceName}</td>
                      <td className="px-5 py-3 font-mono">{item.deviceIP}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold tabular-nums">{item.count}</td>
                      <td className="px-5 py-3 text-slate-500 font-mono tabular-nums">
                        {new Date(item.lastPunch).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setMapDeviceUserId(item.deviceUserId);
                            setActiveTab('mapping');
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Resolve &amp; Map
                        </button>
                      </td>
                    </tr>
                  ))}
                  {unmappedGrouped.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                        <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700 dark:text-slate-200">All biometric punches are mapped</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DAT / CSV IMPORT */}
      {activeTab === 'dat_import' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100 block">Target Biometric Terminal</span>
              <span className="text-slate-500 dark:text-slate-400">
                Choose the terminal these USB/DAT attendance logs were exported from:
              </span>
            </div>
            <select
              value={selectedDatDeviceId || zkDevices[0]?.id || ''}
              onChange={(e) => setSelectedDatDeviceId(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {zkDevices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.ip})
                </option>
              ))}
            </select>
          </div>

          <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl p-10 text-center transition-colors">
            <input
              type="file"
              id="usbDatFileInput"
              accept=".dat,.txt,.csv,.tsv"
              onChange={handleDatFileUpload}
              className="hidden"
              disabled={isProcessingDat}
            />
            <label htmlFor="usbDatFileInput" className="cursor-pointer flex flex-col items-center gap-3">
              <div className="p-3 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400">
                <FileUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {isProcessingDat ? 'Importing Punch Records to SQLite...' : 'Select ZKTeco DAT, TXT, or CSV Log File'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supports <code className="font-mono text-indigo-600">1_attlog.dat</code>, <code className="font-mono text-indigo-600">attlog.txt</code>, and space/tab/comma CSV exports.
                </p>
              </div>
              <span className="mt-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors">
                Choose File
              </span>
            </label>
          </div>
        </div>
      )}

      {/* TAB 5: SYNC HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Recent Log Downloads ({zkSyncLogs.length})
            </h3>
            {zkSyncLogs.length > 0 && (
              <button
                type="button"
                onClick={clearZkSyncLogs}
                className="text-xs text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Clear History
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Device Name</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Read</th>
                    <th className="px-5 py-3 text-right">New Punches</th>
                    <th className="px-5 py-3 text-right">Duplicates</th>
                    <th className="px-5 py-3 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {zkSyncLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 font-mono text-slate-500 tabular-nums">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{log.deviceName}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`font-semibold ${
                            log.status === 'Success'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">{log.recordsRead}</td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-emerald-600 tabular-nums">{log.newRecords}</td>
                      <td className="px-5 py-3 text-right font-mono text-slate-400 tabular-nums">{log.duplicates}</td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums">{log.durationMs}ms</td>
                    </tr>
                  ))}
                  {zkSyncLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                        No log download history recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT DEVICE MODAL */}
      {isDeviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {editingDevice ? 'Edit ZKTeco Terminal' : 'Add ZKTeco Terminal'}
              </h3>
              <button
                type="button"
                onClick={() => setIsDeviceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDevice} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Device Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Time Office 2"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">IP Address *</label>
                  <input
                    type="text"
                    required
                    value={formData.ip}
                    onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value, 10) || 4370 })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Model</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Protocol Mode</label>
                  <select
                    value={formData.protocolMode}
                    onChange={(e) => setFormData({ ...formData, protocolMode: e.target.value as ZkProtocolMode })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100"
                  >
                    <option value="Auto">Auto (TCP / UDP / HTTP)</option>
                    <option value="TCP">TCP 4370 (SDK Binary)</option>
                    <option value="UDP">UDP 4370</option>
                    <option value="ADMS">ADMS Push</option>
                    <option value="Web-HTTP">Web HTTP (Port 80)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Comm Key</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.commKey}
                    onChange={(e) => setFormData({ ...formData, commKey: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="enabledCheck"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <label htmlFor="enabledCheck" className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                  Include terminal in scheduled log downloads
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeviceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs"
                >
                  {editingDevice ? 'Save Changes' : 'Add Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HARDWARE CONNECTION DIAGNOSTIC MODAL */}
      {diagnosticDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Wifi className={`w-4 h-4 ${lastDiagnosticResult?.reachable ? 'text-emerald-600' : 'text-rose-600'}`} />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {diagnosticDevice.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {diagnosticDevice.ip}:{diagnosticDevice.port || 4370}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDiagnosticDevice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                {lastDiagnosticResult?.message || 'Connection test completed.'}
              </p>

              {Array.isArray(lastDiagnosticResult?.attempts) && lastDiagnosticResult.attempts.length > 0 && (
                <div className="space-y-1">
                  {lastDiagnosticResult.attempts.map((att: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                    >
                      <span>{att.protocol}</span>
                      <span className={att.reachable ? 'text-emerald-600 font-semibold' : 'text-rose-600'}>
                        {att.reachable ? `OK (${att.latencyMs}ms)` : `FAIL (${att.latencyMs}ms)`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex justify-end border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDiagnosticDevice(null)}
                  className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg font-semibold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
