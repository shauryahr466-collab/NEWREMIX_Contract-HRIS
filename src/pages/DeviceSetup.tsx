import React, { useState, useEffect, useCallback } from 'react';
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
  Database, 
  Download, 
  Terminal, 
  Server, 
  Search, 
  AlertTriangle,
  Play,
  Activity,
  ShieldCheck,
  HelpCircle,
  HardDrive,
  FileUp,
  Radio,
  Zap,
  FolderSearch
} from 'lucide-react';
import { toast } from 'sonner';

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
    mapZkUser,
    unmapZkUser,
    syncZkDevice,
    syncAllZkDevices,
    reconcileSystemZkData,
    fetchPunches,
    resolveUnmappedPunches,
    clearZkSyncLogs,
    isAdmin
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'devices' | 'mapping' | 'unmapped' | 'history' | 'connector' | 'usb_dat'>('devices');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDatDeviceId, setSelectedDatDeviceId] = useState<string>('');
  const [pollSummary, setPollSummary] = useState<any>(null);
  const [isTogglingPoll, setIsTogglingPoll] = useState(false);
  const [isBatchPolling, setIsBatchPolling] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isScanningWatch, setIsScanningWatch] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [isUploadingRaw, setIsUploadingRaw] = useState(false);
  const [lastDiagnosticResult, setLastDiagnosticResult] = useState<any>(null);
  
  // Modal States
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ZkDevice | null>(null);
  const [isTestingId, setIsTestingId] = useState<string | null>(null);
  const [isSyncingId, setIsSyncingId] = useState<string | null>(null);
  const [diagnosticDevice, setDiagnosticDevice] = useState<ZkDevice | null>(null);
  const [testUserId, setTestUserId] = useState('121');

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

  // Handle DAT / CSV / TXT File Upload for ZKTime 5.0
  const [isProcessingDat, setIsProcessingDat] = useState(false);
  const [showZkTimeGuideModal, setShowZkTimeGuideModal] = useState(false);

  const loadPollSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/zk/auto-poll/status');
      if (res.ok) {
        const data = await res.json();
        setPollSummary(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadPollSummary();
    const timer = setInterval(loadPollSummary, 20000);
    return () => clearInterval(timer);
  }, [loadPollSummary]);

  const handleToggleAutoPoll = async () => {
    setIsTogglingPoll(true);
    try {
      const nextEnabled = !(pollSummary?.enabled !== false);
      const res = await fetch('/api/zk/auto-poll/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled })
      });
      const data = await res.json();
      if (data.success) {
        setPollSummary(data);
        toast.success(nextEnabled ? 'ZKTeco Auto-Polling Enabled' : 'ZKTeco Auto-Polling Paused');
      }
    } catch {
      toast.error('Failed to update auto-polling schedule');
    } finally {
      setIsTogglingPoll(false);
    }
  };

  const handleChangePollInterval = async (intervalSeconds: number) => {
    try {
      const res = await fetch('/api/zk/auto-poll/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalSeconds })
      });
      const data = await res.json();
      if (data.success) {
        setPollSummary(data);
        toast.success(`Auto-poll schedule updated (${intervalSeconds >= 60 ? `${Math.round(intervalSeconds / 60)}m` : `${intervalSeconds}s`})`);
      }
    } catch {
      toast.error('Failed to update poll interval');
    }
  };

  const handleScanWatchFolder = async () => {
    setIsScanningWatch(true);
    try {
      const targetDevId = selectedDatDeviceId || zkDevices[0]?.id;
      const res = await fetch('/api/zk/watch-folder/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: targetDevId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchPunches();
        await loadPollSummary();
        toast.success(data.message || `Scanned Watch Folder (${data.filesScanned} files)`);
      } else {
        toast.error(data.error || 'Watch folder scan failed');
      }
    } catch (e: any) {
      toast.error(e.message || 'Watch folder scan failed');
    } finally {
      setIsScanningWatch(false);
    }
  };

  const handleUploadRawText = async () => {
    if (!rawPasteText.trim()) {
      toast.error('Paste punch log lines first (ATTLOG, PIN=..., CSV, or JSON)');
      return;
    }
    setIsUploadingRaw(true);
    try {
      const targetDev = zkDevices.find(d => d.id === selectedDatDeviceId) || zkDevices[0];
      const res = await fetch('/api/zk/upload-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawPasteText,
          deviceId: targetDev?.id,
          deviceName: targetDev?.name || 'Direct Raw Paste',
          deviceIP: targetDev?.ip || 'USB/File'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchPunches();
        await loadPollSummary();
        setRawPasteText('');
        toast.success(data.message);
      } else {
        toast.error(data.error || 'Failed to parse raw punch lines');
      }
    } catch (e: any) {
      toast.error(e.message || 'Raw import failed');
    } finally {
      setIsUploadingRaw(false);
    }
  };

  const handlePollAllEnabled = async () => {
    setIsBatchPolling(true);
    try {
      await syncAllZkDevices();
      await loadPollSummary();
    } finally {
      setIsBatchPolling(false);
    }
  };

  const handleReconcileSystem = async () => {
    setIsReconciling(true);
    try {
      await reconcileSystemZkData();
      await loadPollSummary();
    } finally {
      setIsReconciling(false);
    }
  };

  // Helper to parse ZK date/time string variants safely (Exact DIA Local Hardware Time — NO UTC/ISO timezone shift!)
  const parseZkDateTime = (dateStr: string, timeStr?: string): string | null => {
    if (!dateStr) return null;
    const cleanD = dateStr.trim().replace(/^"|"$/g, '');
    const cleanT = (timeStr || '').trim().replace(/^"|"$/g, '') || '00:00:00';
    const pad = (n: number) => String(n).padStart(2, '0');

    // 1. Try ISO / YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
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

    // 2. Try DD/MM/YYYY or MM/DD/YYYY
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

    // 3. Fallback to JS Date local components (never .toISOString() which shifts by UTC offset)
    try {
      const full = `${cleanD} ${cleanT}`;
      const d = new Date(full);
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
    const tId = toast.loading(`Reading ZKTime / ZKTeco file "${file.name}"...`);

    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const punches: { deviceUserId: string; punchDateTime: string }[] = [];

      for (const rawLine of lines) {
        const lower = rawLine.toLowerCase();
        if (!rawLine || lower.startsWith('ac-no') || lower.startsWith('user id') || lower.startsWith('no,') || lower.startsWith('//') || lower.startsWith('#')) {
          continue; // Skip header/comments line
        }

        // Split by tab, comma, or whitespace
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

          // Check if parts[1] contains space or T (combined date time e.g. "2026-08-03 09:15:22")
          if (parts[1].includes(' ') || parts[1].includes('T')) {
            const [dPart, tPart] = parts[1].split(/[ T]/);
            isoDate = parseZkDateTime(dPart, tPart);
          } else if (parts[2] && (parts[2].includes(':') || parts[1].match(/[/.-]/))) {
            // parts[1] is Date, parts[2] is Time
            isoDate = parseZkDateTime(parts[1], parts[2]);
          } else {
            // Fallback scan across parts
            for (let i = 1; i < parts.length; i++) {
              if (parts[i].match(/\d{2,4}[/.-]\d{1,2}[/.-]\d{2,4}/)) {
                const dateP = parts[i];
                const timeP = (parts[i+1] && parts[i+1].includes(':')) ? parts[i+1] : '00:00:00';
                isoDate = parseZkDateTime(dateP, timeP);
                if (isoDate) break;
              }
            }
          }

          if (uId && isoDate) {
            punches.push({ deviceUserId: uId, punchDateTime: isoDate });
          }
        }
      }

      if (punches.length === 0) {
        toast.error('No valid punch records found in file. Supported: 1_attlog.dat, attlog.txt, or ZKTime 5.0 CSV/TXT exports.', { id: tId });
        return;
      }

      const targetDev = zkDevices.find(d => d.id === selectedDatDeviceId) || zkDevices[0] || { id: 'dev_usb', name: 'ZKTime 5.0 Import', ip: 'USB/File' };

      // Send parsed punches to backend ZKTeco Poller -> validates Active Employees, deduplicates & stores directly in SQLite
      let totalNew = 0;
      let totalDup = 0;
      let totalUnmapped = 0;
      let totalInactive = 0;

      const batchSize = 2000;
      for (let i = 0; i < punches.length; i += batchSize) {
        const chunk = punches.slice(i, i + batchSize);
        const resp = await fetch('/api/zk/agent/sync', {
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
          throw new Error(data?.error || 'Failed to store DAT punches in SQLite');
        }
        totalNew += Number(data.newRecords || 0);
        totalDup += Number(data.duplicates || 0);
        totalUnmapped += Number(data.unmappedCount || 0);
        totalInactive += Number(data.inactiveSkipped || 0);
      }

      await fetchPunches();
      await loadPollSummary();
      toast.success(
        `Stored ${totalNew} new punches in SQLite for "${targetDev.name}" (${totalDup} duplicates, ${totalInactive} inactive skipped, ${totalUnmapped} unmapped).`,
        { id: tId }
      );
    } catch (err: any) {
      toast.error(`Failed to import file: ${err.message}`, { id: tId });
    } finally {
      setIsProcessingDat(false);
      e.target.value = '';
    }
  };

  // Helper to construct the JS connector agent content
  const getAgentJsScript = () => {
    const currentOrigin = window.location.origin;

    const activeDevs = (zkDevices && zkDevices.length > 0) ? zkDevices : [
      { id: 'dev_main_192_168_117_200', name: 'Time Office 2', ip: '192.168.117.200', port: 4370, model: 'MB2000/ID', commType: 'Ethernet', deviceNumber: 1 },
      { id: 'dev_factory_192_168_117_201', name: 'Time Office 1', ip: '192.168.117.201', port: 4370, model: 'MB2000/ID', commType: 'Ethernet', deviceNumber: 1 },
      { id: 'dev_office_192_168_13_7', name: 'ISTS Office', ip: '192.168.13.103', port: 4370, model: 'MB2000', commType: 'Ethernet', deviceNumber: 1 }
    ];

    // Embed current Active Employees from Directory & Mappings so the PC Agent knows all active employees immediately
    const activeDirectoryEmployees = employees
      .filter(e => !e.status || e.status.toLowerCase() === 'active')
      .map(e => ({
        id: String(e.id).trim(),
        name: e.name,
        joiningDate: e.joiningDate ? String(e.joiningDate).slice(0, 10) : ''
      }));

    const directoryMappings = zkUserMappings.map(m => ({
      deviceUserId: String(m.deviceUserId).trim(),
      employeeId: String(m.employeeId).trim()
    }));

    return `// zk-lan-connector.js - ZKTeco LAN & Local PC Disk (E:\\SHRM_HRIS\\Database.db) Direct SQLite Engine
// Run this script on your Windows PC inside your ZKTeco device LAN!
// Requirements: Node.js (v16+) -> npm install sql.js node-zklib axios

const fs = require('fs');
const path = require('path');
const http = require('http');
const axios = require('axios');
let ZKLib = null;
try { ZKLib = require('node-zklib'); } catch (e) {}
let initSqlJs = null;
try { initSqlJs = require('sql.js'); } catch (e) {}

const SQLITE_DB_DIR = 'E:\\\\SHRM_HRIS';
const SQLITE_DB_PATH = 'E:\\\\SHRM_HRIS\\\\Database.db';
const LOCAL_BRIDGE_PORT = 4375;

const API_CANDIDATES = [
  'http://127.0.0.1:3000/api/zk/agent/sync',
  'http://localhost:3000/api/zk/agent/sync',
  '${currentOrigin}/api/zk/agent/sync'
];

const DEVICES = ${JSON.stringify(activeDevs.map(d => ({ id: d.id, name: d.name, ip: d.ip, port: d.port || 4370 })), null, 2)};

const INITIAL_ACTIVE_EMPLOYEES = ${JSON.stringify(activeDirectoryEmployees)};
const INITIAL_USER_MAPPINGS = ${JSON.stringify(directoryMappings)};

const LOCAL_DB_PATHS = [
  'E:\\\\att2000.mdb',
  'E:\\\\ZKTime5.0\\\\att2000.mdb',
  'E:\\\\ZKTime\\\\att2000.mdb',
  'E:\\\\BioTime\\\\att2000.mdb',
  'E:\\\\att_logs.dat',
  'E:\\\\1_attlog.dat',
  'E:\\\\attlog.txt',
  'C:\\\\Program Files (x86)\\\\ZKTime5.0\\\\att2000.mdb',
  'C:\\\\ZKTime5.0\\\\att2000.mdb',
  'C:\\\\att2000.mdb'
];

console.log("==========================================================");
console.log(" ZKTeco LAN & Local PC Disk (E:) Direct SQLite Sync Agent");
console.log(" Primary SQLite Database : " + SQLITE_DB_PATH);
console.log(" Local Browser Bridge    : http://127.0.0.1:" + LOCAL_BRIDGE_PORT);
console.log(" Active Employees Filter : ENABLED (Only Active Directory Employees)");
console.log(" Duplicate Protection    : ENABLED (Skip Already Fetched Data)");
console.log(" Monitored LAN Devices   : " + DEVICES.length);
console.log("==========================================================\\n");

// In-memory queue of ALL active-employee punches for the Browser Bridge (http://127.0.0.1:4375)
const bridgeQueueByDevice = new Map();

// Persistent local cache of already-fetched punch keys so 2nd time downloads NEVER re-fetch or duplicate
let SYNCED_CACHE = new Set();
const CACHE_FILE = path.join(process.cwd(), 'synced_punches.json');
try {
  if (fs.existsSync(CACHE_FILE)) {
    const arr = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (Array.isArray(arr)) SYNCED_CACHE = new Set(arr);
  }
} catch (e) {}

function saveSyncedCache() {
  try {
    const arr = Array.from(SYNCED_CACHE);
    const trimmed = arr.length > 300000 ? arr.slice(arr.length - 300000) : arr;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(trimmed));
  } catch (e) {}
}

// 1. Direct Physical SQLite Writer to E:\\SHRM_HRIS\\Database.db (Active Employees Only + Zero Duplicates)
async function writePunchesDirectToDiskSqlite(devId, devName, devIP, punches) {
  if (!initSqlJs || !punches || punches.length === 0) {
    return { newRecords: 0, duplicates: 0, skippedInactive: 0, newPunchesOnly: [], savedToDisk: false };
  }

  try {
    if (!fs.existsSync(SQLITE_DB_DIR)) {
      fs.mkdirSync(SQLITE_DB_DIR, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db;
    if (fs.existsSync(SQLITE_DB_PATH)) {
      const fileBuf = fs.readFileSync(SQLITE_DB_PATH);
      db = new SQL.Database(fileBuf);
    } else {
      db = new SQL.Database();
    }

    db.run(\`
      CREATE TABLE IF NOT EXISTS attendance_punches (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL DEFAULT '',
        punch_datetime TEXT NOT NULL DEFAULT '',
        device_id TEXT DEFAULT '',
        source TEXT DEFAULT '',
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS zk_devices (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS zk_user_mappings (
        id TEXT PRIMARY KEY,
        device_user_id TEXT NOT NULL DEFAULT '',
        employee_id TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS zk_sync_logs (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Unnamed',
        department TEXT DEFAULT '',
        designation TEXT DEFAULT '',
        shift_id TEXT DEFAULT '',
        joining_date TEXT DEFAULT '',
        status TEXT DEFAULT 'Active',
        data TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT
      );
    \`);

    // Load Active Employees from SQLite + embedded directory snapshot
    const activeEmpIds = new Set();
    const empNormMap = new Map();
    const empJoiningDateMap = new Map();

    for (const emp of INITIAL_ACTIVE_EMPLOYEES) {
      if (!emp || !emp.id) continue;
      const eid = String(emp.id).trim();
      activeEmpIds.add(eid);
      if (emp.joiningDate) empJoiningDateMap.set(eid, String(emp.joiningDate).slice(0, 10));
      empNormMap.set(eid, eid);
      empNormMap.set(eid.toLowerCase(), eid);
      const norm = eid.replace(/[^0-9]/g, '').replace(/^0+/, '');
      if (norm) {
        empNormMap.set(norm, eid);
        empNormMap.set('EMP' + norm, eid);
        empNormMap.set('EMP-' + norm, eid);
        empNormMap.set('EMP' + norm.padStart(3, '0'), eid);
        empNormMap.set('EMP-' + norm.padStart(3, '0'), eid);
      }
    }

    try {
      const empRes = db.exec("SELECT id, status, joining_date, data FROM employees");
      if (empRes.length > 0) {
        for (const r of empRes[0].values) {
          const eid = String(r[0] || '').trim();
          let status = String(r[1] || 'Active').trim();
          let jDate = String(r[2] || '').trim();
          if (r[3]) {
            try {
              const ed = JSON.parse(String(r[3]));
              if (ed.status) status = String(ed.status).trim();
              if (ed.joiningDate) jDate = String(ed.joiningDate).trim();
            } catch (e) {}
          }
          if (!eid) continue;
          if (status.toLowerCase() !== 'active') {
            activeEmpIds.delete(eid);
            continue;
          }
          activeEmpIds.add(eid);
          if (jDate) empJoiningDateMap.set(eid, jDate.slice(0, 10));
          empNormMap.set(eid, eid);
          empNormMap.set(eid.toLowerCase(), eid);
          const norm = eid.replace(/[^0-9]/g, '').replace(/^0+/, '');
          if (norm) {
            empNormMap.set(norm, eid);
            empNormMap.set('EMP' + norm, eid);
            empNormMap.set('EMP-' + norm, eid);
            empNormMap.set('EMP' + norm.padStart(3, '0'), eid);
            empNormMap.set('EMP-' + norm.padStart(3, '0'), eid);
          }
        }
      }
    } catch (e) {}

    // Load user mappings & filter to Active Employees only
    const userMap = new Map();
    for (const m of INITIAL_USER_MAPPINGS) {
      if (m.deviceUserId && m.employeeId && (activeEmpIds.size === 0 || activeEmpIds.has(m.employeeId))) {
        userMap.set(String(m.deviceUserId).trim(), String(m.employeeId).trim());
        const norm = String(m.deviceUserId).replace(/[^0-9]/g, '').replace(/^0+/, '');
        if (norm) userMap.set(norm, String(m.employeeId).trim());
      }
    }
    try {
      const mRes = db.exec("SELECT device_user_id, employee_id FROM zk_user_mappings");
      if (mRes.length > 0) {
        for (const r of mRes[0].values) {
          const dUid = String(r[0] || '').trim();
          const eId = String(r[1] || '').trim();
          if (dUid && eId && (activeEmpIds.size === 0 || activeEmpIds.has(eId))) {
            userMap.set(dUid, eId);
            const norm = dUid.replace(/[^0-9]/g, '').replace(/^0+/, '');
            if (norm) userMap.set(norm, eId);
          }
        }
      }
    } catch (e) {}

    // Load existing punch IDs & (employee_id + punch_datetime) from SQLite to strictly prevent duplicate storage on 2nd download
    const existingIds = new Set();
    const existingEmpTimeKeys = new Set();
    try {
      const pRes = db.exec("SELECT id, employee_id, punch_datetime FROM attendance_punches");
      if (pRes.length > 0) {
        for (const r of pRes[0].values) {
          const pid = String(r[0] || '');
          const eid = String(r[1] || '');
          const pdt = String(r[2] || '').replace(' ', 'T');
          if (pid) existingIds.add(pid);
          if (eid && pdt) {
            existingEmpTimeKeys.add(eid + '_' + pdt);
            existingEmpTimeKeys.add(eid + '_' + pdt.slice(0, 19));
          }
        }
      }
    } catch (e) {}

    const now = new Date().toISOString();
    let newRecords = 0;
    let duplicates = 0;
    let skippedInactive = 0;
    const newPunchesOnly = [];

    db.run("BEGIN TRANSACTION");
    // INSERT OR IGNORE ensures already-fetched punches are NEVER overwritten or duplicated
    const stmt = db.prepare(\`
      INSERT OR IGNORE INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    \`);

    for (const p of punches) {
      const uid = String(p.deviceUserId || '').trim();
      const punchDateTime = String(p.punchDateTime || '').replace(' ', 'T');
      if (!uid || !punchDateTime) continue;

      const normUid = uid.replace(/[^0-9]/g, '').replace(/^0+/, '') || uid;
      const matchedEmpId = userMap.get(uid) || userMap.get(normUid) || empNormMap.get(uid) || empNormMap.get(normUid) || empNormMap.get(uid.toLowerCase());

      // ONLY FETCH & STORE PUNCHES FOR ACTIVE EMPLOYEES IN DIRECTORY
      if (!matchedEmpId || (activeEmpIds.size > 0 && !activeEmpIds.has(matchedEmpId))) {
        skippedInactive++;
        continue;
      }

      // Check active employee joining date (only fetch dates where employee is active)
      const jDate = empJoiningDateMap.get(matchedEmpId);
      const pDateOnly = punchDateTime.slice(0, 10);
      if (jDate && /^\\d{4}-\\d{2}-\\d{2}$/.test(jDate) && /^\\d{4}-\\d{2}-\\d{2}$/.test(pDateOnly) && pDateOnly < jDate) {
        skippedInactive++;
        continue;
      }

      const transactionId = \`\${devId}_\${uid}_\${punchDateTime}\`;
      const punchId = \`p_\${matchedEmpId}_\${punchDateTime}\`.replace(/[^a-zA-Z0-9]/g, '_');
      const legacyPunchId = \`zk_\${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}\`;
      const empTimeKey = \`\${matchedEmpId}_\${punchDateTime}\`;
      const empTimeSecKey = \`\${matchedEmpId}_\${punchDateTime.slice(0, 19)}\`;

      // IF SECOND TIME DOWNLOAD: SKIP IF ALREADY FETCHED IN SQLITE OR CACHE
      if (
        existingIds.has(punchId) ||
        existingIds.has(legacyPunchId) ||
        existingEmpTimeKeys.has(empTimeKey) ||
        existingEmpTimeKeys.has(empTimeSecKey) ||
        SYNCED_CACHE.has(punchId) ||
        SYNCED_CACHE.has(legacyPunchId) ||
        SYNCED_CACHE.has(empTimeSecKey)
      ) {
        duplicates++;
        SYNCED_CACHE.add(punchId);
        SYNCED_CACHE.add(empTimeSecKey);
        continue;
      }

      const punchObj = {
        id: punchId,
        employeeId: matchedEmpId,
        punchDatetime: punchDateTime,
        importFormat: 'standard',
        importId: \`BATCH_DIA_\${devId}\`,
        importDate: now,
        fileName: \`DIA Biometric (\${devName} - \${devIP})\`,
        deviceId: devId,
        deviceName: devName,
        deviceIP: devIP,
        deviceUserId: uid,
        source: 'ZKTeco',
        syncTime: now,
        transactionId: transactionId,
        location: \`\${devName} (\${devIP})\`
      };

      stmt.run([punchId, matchedEmpId, punchDateTime, devId, 'ZKTeco', JSON.stringify(punchObj), now]);
      existingIds.add(punchId);
      existingEmpTimeKeys.add(empTimeKey);
      existingEmpTimeKeys.add(empTimeSecKey);
      SYNCED_CACHE.add(punchId);
      SYNCED_CACHE.add(empTimeSecKey);
      newPunchesOnly.push({ deviceUserId: uid, employeeId: matchedEmpId, punchDateTime });
      newRecords++;
    }
    stmt.free();

    // Count exact logs and distinct matched users for this device in SQLite
    let devLogCnt = existingIds.size;
    let devUserCnt = 0;
    try {
      const cntRes = db.exec(\`SELECT COUNT(*), COUNT(DISTINCT employee_id) FROM attendance_punches WHERE device_id = '\${devId}'\`);
      if (cntRes.length > 0 && cntRes[0].values.length > 0) {
        devLogCnt = Number(cntRes[0].values[0][0] || 0);
        devUserCnt = Number(cntRes[0].values[0][1] || 0);
      }
    } catch (e) {}

    // Update zk_devices status in SQLite while preserving existing hardware metadata
    let existingDevObj = {};
    try {
      const exRes = db.exec("SELECT data FROM zk_devices WHERE id = '" + devId.replace(/'/g, "''") + "'");
      if (exRes.length > 0 && exRes[0].values.length > 0) {
        existingDevObj = JSON.parse(String(exRes[0].values[0][0] || '{}'));
      }
    } catch (e) {}
    const devObj = {
      ...existingDevObj,
      id: devId,
      name: devName,
      ip: devIP,
      port: existingDevObj.port || 4370,
      model: existingDevObj.model || 'MB2000/ID',
      commType: existingDevObj.commType || 'Ethernet',
      deviceNumber: existingDevObj.deviceNumber || 1,
      enabled: true,
      status: 'online',
      lastConnection: now,
      lastSync: now,
      userCount: devUserCnt,
      logCount: devLogCnt,
      autoSyncMinutes: existingDevObj.autoSyncMinutes ?? 15
    };
    const devStmt = db.prepare("INSERT INTO zk_devices (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at");
    devStmt.run([devId, JSON.stringify(devObj), now]);
    devStmt.free();

    // Insert sync log
    const logId = \`log_\${Date.now()}_\${Math.random().toString(36).slice(2, 6)}\`;
    const logObj = {
      id: logId,
      deviceId: devId,
      deviceName: devName,
      deviceIP: devIP,
      timestamp: now,
      recordsRead: punches.length,
      newRecords: newRecords,
      duplicates: duplicates,
      status: 'Success',
      durationMs: 120,
      message: \`Active Employees SQLite Sync: \${newRecords} new stored, \${duplicates} already-fetched duplicates skipped (\${skippedInactive} inactive filtered)\`
    };
    const logStmt = db.prepare("INSERT INTO zk_sync_logs (id, data, created_at) VALUES (?, ?, ?)");
    logStmt.run([logId, JSON.stringify(logObj), now]);
    logStmt.free();

    db.run("COMMIT");

    const binaryArray = db.export();
    const tempPath = SQLITE_DB_PATH + '.tmp';
    fs.writeFileSync(tempPath, Buffer.from(binaryArray));
    fs.renameSync(tempPath, SQLITE_DB_PATH);
    db.close();
    saveSyncedCache();

    return { newRecords, duplicates, skippedInactive, newPunchesOnly, savedToDisk: true };
  } catch (err) {
    return { newRecords: 0, duplicates: 0, skippedInactive: 0, newPunchesOnly: [], savedToDisk: false, error: err.message };
  }
}

// 2. Sync ALL Active Employee Data to SQLite (Disk E:\\SHRM_HRIS\\Database.db + Local/Web Server Bridge)
async function pushPunchesDirectToSqlite(devId, devName, devIP, punches) {
  if (!punches || punches.length === 0) return 0;

  // Sort newest punches first
  const sortedPunches = [...punches].sort((a, b) => String(b.punchDateTime).localeCompare(String(a.punchDateTime)));

  // Step A: Write ALL active-employee punches directly to physical SQLite Database on Disk E: (skipping already-fetched duplicates)
  const diskRes = await writePunchesDirectToDiskSqlite(devId, devName, devIP, sortedPunches);
  if (diskRes.savedToDisk) {
    console.log(\` -> [SQLite Disk E:] \${devName}: \${diskRes.newRecords} NEW active-employee punches stored, \${diskRes.duplicates} already-fetched duplicates skipped (\${diskRes.skippedInactive} inactive ignored).\`);
  }

  // Queue ALL newly discovered active-employee punches for the Browser Local Bridge (http://127.0.0.1:4375)
  const existingQueue = bridgeQueueByDevice.get(devId);
  const combinedBridgePunches = diskRes.newPunchesOnly && diskRes.newPunchesOnly.length > 0
    ? diskRes.newPunchesOnly
    : (existingQueue ? existingQueue.punches : []);

  bridgeQueueByDevice.set(devId, {
    deviceId: devId,
    deviceName: devName,
    deviceIP: devIP,
    logCount: punches.length,
    updatedAt: diskRes.newRecords > 0 ? new Date().toISOString() : (existingQueue ? existingQueue.updatedAt : new Date().toISOString()),
    punches: combinedBridgePunches
  });

  // Step B: If there are NEW punches not yet stored, push ALL of them in batches to the active HTTP HRIS server
  if (diskRes.newPunchesOnly && diskRes.newPunchesOnly.length > 0) {
    const BATCH_SIZE = 5000;
    for (const apiUrl of API_CANDIDATES) {
      let apiReachable = false;
      for (let i = 0; i < diskRes.newPunchesOnly.length; i += BATCH_SIZE) {
        const chunk = diskRes.newPunchesOnly.slice(i, i + BATCH_SIZE);
        try {
          const res = await axios.post(apiUrl, {
            deviceId: devId,
            deviceName: devName,
            deviceIP: devIP,
            logCount: punches.length,
            punches: chunk,
            autoFetch: false
          }, { timeout: 10000 });

          if (res.data && res.data.success) {
            apiReachable = true;
          }
        } catch (e) {
          break;
        }
      }
      if (apiReachable) {
        console.log(\` -> [HRIS API Sync] Synced \${diskRes.newPunchesOnly.length} new active-employee punches to \${apiUrl}.\`);
        break;
      }
    }
  } else {
    console.log(\` -> [Duplicate Skip] All active-employee punches from \${devName} are already stored in SQLite. Skipping duplicate re-upload.\`);
  }

  return diskRes.newRecords;
}

function formatExactHardwareTime(val) {
  if (!val) return null;
  const pad = (n) => String(n).padStart(2, '0');
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return \`\${val.getFullYear()}-\${pad(val.getMonth() + 1)}-\${pad(val.getDate())}T\${pad(val.getHours())}:\${pad(val.getMinutes())}:\${pad(val.getSeconds())}\`;
  }
  const str = String(val).trim().replace(/^"|"$/g, '');
  const m = str.match(/^(\\d{4})[/.-](\\d{1,2})[/.-](\\d{1,2})[T\\s]+(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?/);
  if (m) {
    return \`\${m[1]}-\${pad(m[2])}-\${pad(m[3])}T\${pad(m[4])}:\${pad(m[5])}:\${pad(m[6] || '00')}\`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return \`\${d.getFullYear()}-\${pad(d.getMonth() + 1)}-\${pad(d.getDate())}T\${pad(d.getHours())}:\${pad(d.getMinutes())}:\${pad(d.getSeconds())}\`;
  }
  return null;
}

async function scanLocalDiskDatabase() {
  console.log(\`[\${new Date().toLocaleTimeString()}] Scanning Local PC Disk (E:) for ZKTime database/logs...\`);
  for (const filePath of LOCAL_DB_PATHS) {
    if (!fs.existsSync(filePath) || filePath.toLowerCase().endsWith('.db')) continue;

    console.log(\` -> Found local ZK database/file: \${filePath}\`);
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split(/\\r?\\n/);
      const validPunches = [];

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.toLowerCase().startsWith('ac-no') || trimmed.toLowerCase().startsWith('user id')) continue;

        const parts = trimmed.split(/\\s+|,|\\t/);
        if (parts.length >= 2) {
          const uid = parts[0].replace(/^"|"$/g, '');
          let exactDate = null;

          if (parts[1] && (parts[1].includes(' ') || parts[1].includes('T'))) {
            exactDate = formatExactHardwareTime(parts[1]);
          } else if (parts[1] && parts[2]) {
            exactDate = formatExactHardwareTime(\`\${parts[1]} \${parts[2]}\`);
          }

          if (uid && exactDate) {
            validPunches.push({ deviceUserId: uid, punchDateTime: exactDate });
          }
        }
      }

      if (validPunches.length > 0) {
        console.log(\` -> Extracted \${validPunches.length} valid punch records from \${filePath}.\`);
        await pushPunchesDirectToSqlite('dev_local_disk_e', \`Local Disk (E:) Database (\${path.basename(filePath)})\`, filePath, validPunches);
      }
    } catch (err) {
      console.log(\` -> Local file parse note for \${filePath}: \${err.message}\\n\`);
    }
  }
}

async function syncDevice(dev) {
  if (!ZKLib) {
    console.log(\` -> Skipping TCP connection to \${dev.name} (node-zklib module not installed).\`);
    return;
  }
  try {
    console.log(\`[\${new Date().toLocaleTimeString()}] Connecting to \${dev.name} (\${dev.ip}:\${dev.port})...\`);
    const zk = new ZKLib(dev.ip, dev.port, 10000, 4000);
    await zk.createSocket();
    
    const logs = await zk.getAttendances();
    await zk.disconnect();

    if (!logs || !logs.data || !Array.isArray(logs.data)) {
      console.log(\` -> No attendance logs retrieved from \${dev.name}.\\n\`);
      return;
    }

    const validPunches = [];
    for (const l of logs.data) {
      const uid = String(l.deviceUserId || l.userId || l.userSn || l.pin || l.sn || l.id || '').trim();
      if (!uid) continue;
      
      const rawTime = l.recordTime || l.timestamp || l.attTime || l.time || l.date;
      const pDate = formatExactHardwareTime(rawTime);
      if (pDate) {
        validPunches.push({ deviceUserId: uid, punchDateTime: pDate });
      }
    }

    console.log(\` -> Fetched \${validPunches.length} total punches from \${dev.name} (Exact Hardware Time).\`);

    if (validPunches.length > 0) {
      const devId = dev.id || ('dev_' + String(dev.ip || '').replace(/[^0-9]/g, '_'));
      await pushPunchesDirectToSqlite(devId, dev.name || 'ZKTeco Device', dev.ip, validPunches);
    }
  } catch (err) {
    console.error(\` -> [NOTE] \${dev.name} (\${dev.ip}): \${err.message}\\n\`);
  }
}

async function runSyncAll() {
  await scanLocalDiskDatabase();
  for (const dev of DEVICES) {
    await syncDevice(dev);
  }
}

// Start Local Browser Bridge Server on 127.0.0.1:4375 so open HRIS browser tabs can pull ALL new active-employee punches directly
try {
  const bridgeServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url && req.url.startsWith('/bridge/pull')) {
      const batches = Array.from(bridgeQueueByDevice.values());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        databasePath: SQLITE_DB_PATH,
        devices: batches
      }));
      return;
    }

    if (req.url && req.url.startsWith('/bridge/ack')) {
      // Clear already-synced bridge queues once the browser confirms SQLite storage
      for (const [k, v] of bridgeQueueByDevice.entries()) {
        bridgeQueueByDevice.set(k, { ...v, punches: [] });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.url && req.url.startsWith('/bridge/trigger')) {
      runSyncAll();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Triggered immediate ZKTeco LAN sync' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'online', sqlitePath: SQLITE_DB_PATH, monitoredDevices: DEVICES.length }));
  });

  bridgeServer.on('error', () => {});
  bridgeServer.listen(LOCAL_BRIDGE_PORT, '127.0.0.1', () => {
    console.log(\` -> [OK] Local Browser Sync Bridge listening on http://127.0.0.1:\${LOCAL_BRIDGE_PORT}\\n\`);
  });
} catch (e) {}

// Auto-Poll every 5 minutes
setInterval(runSyncAll, 5 * 60 * 1000);

// Run immediately
runSyncAll();
`;
  };

  // Download Windows 1-Click BAT Launcher
  const handleDownloadWindowsBatchInstaller = () => {
    const jsContent = getAgentJsScript();
    const jsBase64 = btoa(unescape(encodeURIComponent(jsContent)));

    const batContent = `@echo off
TITLE ZKTime 5.0 & ZKTeco SQLite HRIS Auto-Polling Sync Bridge
COLOR 0A
cls
echo ===================================================
echo   ZKTime 5.0 / ZKTeco SQLite HRIS Auto-Sync Agent
echo ===================================================
echo.
echo Target Database: Local SQLite (E:\\SHRM_HRIS\\Database.db)
echo.
echo Step 1: Checking Node.js installation...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [X] Node.js is not installed on this PC!
    echo Please download and install Node.js from: https://nodejs.org
    echo After installing Node.js, run this batch file again.
    pause
    exit
)

echo [OK] Node.js found.
echo.
echo Step 2: Installing required libraries (sql.js, node-zklib, axios)...
call npm install sql.js node-zklib axios --no-audit --no-fund
echo.
echo Step 3: Generating/updating zk-lan-connector.js...
node -e "require('fs').writeFileSync('zk-lan-connector.js', Buffer.from('${jsBase64}', 'base64').toString('utf8'))"
echo [OK] zk-lan-connector.js updated.
echo.
echo Step 4: Starting ZKTime 5.0 Direct SQLite Auto-Polling Agent...
echo Press Ctrl+C anytime to stop.
echo ===================================================
echo.
node zk-lan-connector.js
pause
`;

    const blob = new Blob([batContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'start-zktime-sync.bat';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded updated "start-zktime-sync.bat" (Direct SQLite E:\\SHRM_HRIS\\Database.db)!');
  };

  // Download LAN Connector Agent Script
  const handleDownloadAgentScript = () => {
    const scriptContent = getAgentJsScript();
    const blob = new Blob([scriptContent], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zk-lan-connector.js';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded "zk-lan-connector.js" script!');
  };

  // Test Punch Direct Simulator
  const handleSendTestPunch = async () => {
    if (!diagnosticDevice) return;
    const tId = toast.loading(`Sending test punch for Biometric User #${testUserId}...`);
    try {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const exactLocalNow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const res = await fetch('/api/zk/agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: diagnosticDevice.id,
          deviceName: diagnosticDevice.name,
          deviceIP: diagnosticDevice.ip,
          punches: [
            {
              deviceUserId: testUserId,
              punchDateTime: exactLocalNow
            }
          ]
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchPunches();
        await loadPollSummary();
        toast.success(`Test Punch Stored in SQLite! ${data.newRecords ? 'New record committed.' : `Skipped (${data.duplicates ? 'Duplicate' : 'Unmapped/Inactive'}).`}`, { id: tId });
      } else {
        toast.error(`Test Punch Error: ${data.error}`, { id: tId });
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`, { id: tId });
    }
  };

  // Handle open add modal
  const handleOpenAdd = () => {
    setEditingDevice(null);
    setFormData({
      name: '',
      ip: '192.168.117.200',
      port: 4370,
      model: 'MB2000/ID',
      serialNumber: `MB2000-${Math.floor(1000 + Math.random() * 9000)}`,
      deviceNumber: 1,
      commType: 'Ethernet',
      enabled: true,
      autoSyncMinutes: 15,
      protocolMode: 'Auto',
      commKey: 0
    });
    setIsDeviceModalOpen(true);
  };

  // Handle open edit modal
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

  // Save Device Form
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
    } catch (err: any) {
      toast.error(err.message || 'Failed to save device');
    }
  };

  // Delete Device
  const handleDelete = async (dev: ZkDevice) => {
    if (!window.confirm(`Are you sure you want to remove ${dev.name} (${dev.ip})?`)) return;
    try {
      await deleteZkDevice(dev.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete device');
    }
  };

  // Test Connection (Multi-Protocol Auto/TCP/UDP/Web-HTTP handshake + SQLite zk_devices status persistence)
  const handleTestConnection = async (dev: ZkDevice) => {
    setIsTestingId(dev.id);
    try {
      const res = await fetch('/api/zk/agent/test-connection', {
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
        setDiagnosticDevice(dev);
      } else {
        toast.warning(data.message || `Device unreachable at ${dev.ip}:${dev.port} (use LAN Agent or ADMS Push)`);
        await updateZkDevice(dev.id, {
          status: 'offline',
          lastError: data.error || 'LAN unreachable from host'
        });
        setDiagnosticDevice(dev);
      }
      await loadPollSummary();
    } catch (err: any) {
      toast.error(`Device test failed at ${dev.ip}:${dev.port}: ${err?.message || 'Network error'}`);
      await updateZkDevice(dev.id, { status: 'offline', lastError: err?.message || 'Test error' });
    } finally {
      setIsTestingId(null);
    }
  };

  // Trigger Sync Now
  const handleSyncNow = async (dev: ZkDevice) => {
    setIsSyncingId(dev.id);
    try {
      await syncZkDevice(dev.id);
      await loadPollSummary();
    } finally {
      setIsSyncingId(null);
    }
  };

  // Submit Manual Mapping
  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapDeviceUserId.trim()) {
      toast.error('Please enter Biometric User ID');
      return;
    }
    if (!mapEmployeeId) {
      toast.error('Please select an HRIS Employee');
      return;
    }

    try {
      await resolveUnmappedPunches(mapDeviceUserId.trim(), mapEmployeeId);
      setMapDeviceUserId('');
      setMapEmployeeId('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to map user');
    }
  };

  // Filtered devices
  const filteredDevices = zkDevices.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.ip.includes(searchTerm) ||
    d.model.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Active Directory Employees count & live per-device user/log counts computed from SQLite punches
  const activeDirectoryEmployeeCount = React.useMemo(
    () => employees.filter(e => !e.status || e.status.toLowerCase() === 'active').length,
    [employees]
  );

  const liveDeviceStatsMap = React.useMemo(() => {
    const map = new Map<string, { logs: number; users: number }>();
    const userSets = new Map<string, Set<string>>();

    zkDevices.forEach(d => {
      map.set(d.id, { logs: 0, users: 0 });
      userSets.set(d.id, new Set<string>());
    });

    const primaryEnabledDev = zkDevices.find(d => d.enabled) || zkDevices[0];

    punches.forEach(p => {
      const dId = p.deviceId || '';
      const matchedDev = zkDevices.find(
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

  const totalDiaStats = React.useMemo(() => {
    const empSet = new Set<string>();
    punches.forEach(p => {
      if (p.employeeId) empSet.add(String(p.employeeId).trim());
    });
    return { totalLogs: punches.length, totalUsers: empSet.size };
  }, [punches]);

  // Mapped user IDs
  const mappedDeviceUserIds = new Set(zkUserMappings.map(m => m.deviceUserId));

  // Pending unmapped punches grouped by deviceUserId
  const unmappedGrouped = React.useMemo(() => {
    const map = new Map<string, { deviceUserId: string; count: number; lastPunch: string; deviceName: string; deviceIP: string }>();
    zkUnmappedPunches.filter(p => p.status === 'pending').forEach(p => {
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">ZKTeco Device & ZKTime 5.0 Setup</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Manage biometric hardware, IP configurations, ZKTime 5.0 desktop sync, and biometric ID mappings
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowZkTimeGuideModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            ZKTime 5.0 Setup Guide
          </button>

          <button
            onClick={handlePollAllEnabled}
            disabled={isBatchPolling}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isBatchPolling ? 'animate-spin' : ''}`} />
            {isBatchPolling ? 'Polling Devices...' : 'Poll Enabled Devices'}
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Device
            </button>
          )}
        </div>
      </div>

      {/* Prominent ZKTime 5.0 Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-5 rounded-2xl shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center gap-3">
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-base">ZKTeco Auto-Polling &amp; SQLite Storage Engine</h3>
            <p className="text-xs text-emerald-100 mt-0.5">
              Polls LAN hardware terminals, ADMS Cloud Push, local disk attlogs, or Windows LAN Bridge and stores verified punches into SQLite.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-end md:self-auto">
          <button
            onClick={() => setShowZkTimeGuideModal(true)}
            className="px-4 py-2 bg-white text-emerald-800 font-bold text-xs rounded-xl shadow hover:bg-emerald-50 transition-colors flex items-center gap-1.5"
          >
            <Zap className="w-4 h-4 text-emerald-600" />
            Open PC Setup Instructions
          </button>
          <button
            onClick={handleDownloadWindowsBatchInstaller}
            className="px-4 py-2 bg-emerald-950/40 hover:bg-emerald-950/60 text-white font-semibold text-xs rounded-xl border border-white/20 transition-colors flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Download start-zktime-sync.bat
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'devices'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          Devices ({zkDevices.length})
        </button>

        <button
          onClick={() => setActiveTab('mapping')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'mapping'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          User Mapping ({zkUserMappings.length})
        </button>

        <button
          onClick={() => setActiveTab('unmapped')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all relative ${
            activeTab === 'unmapped'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Unmapped Punches ({unmappedGrouped.length})
        </button>

        <button
          onClick={() => setActiveTab('usb_dat')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'usb_dat'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileUp className="w-4 h-4" />
          Local PC Disk (E:) &amp; DAT Import
        </button>

        <button
          onClick={() => setActiveTab('connector')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'connector'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Local LAN Agent & ADMS Push
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Sync History ({zkSyncLogs.length})
        </button>
      </div>

      {/* TAB 1: DEVICES LIST */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          {/* ZKTeco Polling Engine Control Strip (Aligned with System SQLite Data) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
              <div className="border-r border-slate-100 dark:border-slate-800 pr-3">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">SQLite Punch Logs</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                  {(pollSummary?.punchCount ?? totalDiaStats.totalLogs).toLocaleString()}
                </span>
              </div>
              <div className="border-r border-slate-100 dark:border-slate-800 pr-3">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Active Employees</span>
                <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {pollSummary?.activeEmployeeCount ?? activeDirectoryEmployeeCount}
                </span>
              </div>
              <div className="border-r border-slate-100 dark:border-slate-800 pr-3">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Mapped User IDs</span>
                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {pollSummary?.mappedUserCount ?? zkUserMappings.length}
                </span>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">Pending Unmapped</span>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {pollSummary?.pendingUnmappedCount ?? unmappedGrouped.length}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleToggleAutoPoll}
                disabled={isTogglingPoll}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  pollSummary?.enabled !== false
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Auto-Poll: {pollSummary?.enabled !== false ? 'ON' : 'PAUSED'}
              </button>

              <select
                value={Number(pollSummary?.intervalSeconds || 60)}
                onChange={(e) => handleChangePollInterval(Number(e.target.value))}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Background Scheduler Check Interval"
              >
                <option value={30}>Check 30s</option>
                <option value={60}>Check 1m</option>
                <option value={300}>Check 5m</option>
                <option value={900}>Check 15m</option>
              </select>

              <button
                type="button"
                onClick={handleScanWatchFolder}
                disabled={isScanningWatch}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                title="Scan local watch folder (Imports / Disk E:) for attlog files"
              >
                <FolderSearch className={`w-3.5 h-3.5 text-emerald-600 ${isScanningWatch ? 'animate-spin' : ''}`} />
                {isScanningWatch ? 'Scanning...' : 'Scan Watch Folder'}
              </button>

              <button
                type="button"
                onClick={handleReconcileSystem}
                disabled={isReconciling}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className={`w-3.5 h-3.5 text-indigo-500 ${isReconciling ? 'animate-spin' : ''}`} />
                {isReconciling ? 'Reconciling...' : 'Reconcile System'}
              </button>

              <button
                type="button"
                onClick={handlePollAllEnabled}
                disabled={isBatchPolling}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBatchPolling ? 'animate-spin' : ''}`} />
                {isBatchPolling ? 'Polling...' : 'Poll All Enabled Now'}
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by device name, IP address, or model..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Hardware Terminal Registry Table */}
          {filteredDevices.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Biometric Terminal Hardware Matrix
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {filteredDevices.filter(d => d.status === 'online').length} / {filteredDevices.length} Connected · Ethernet TCP/IP 4370
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 font-semibold">
                      <th className="py-2.5 px-3 whitespace-nowrap">Device Name</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">Machine No</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Comm Type</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">IP Address</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">Port</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Product</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">Users</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">Admin</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">FP</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">Face</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">Pass</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">OpLog</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-right">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredDevices.map((dev) => (
                      <tr key={`row_${dev.id}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{dev.name}</td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`font-medium ${dev.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {dev.status === 'online' ? 'Connected' : 'Offline'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{dev.deviceNumber ?? 1}</td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{dev.commType || 'Ethernet'}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{dev.ip}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{dev.port || 4370}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">{dev.model}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">{(dev.deviceCapacityUsers ?? dev.userCount ?? 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{dev.adminCount ?? 0}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{(dev.fpCount ?? 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{(dev.faceCount ?? 0).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{dev.passwordCount ?? 0}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">{dev.opLogCount ?? 0}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">{(dev.deviceCapacityLogs ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredDevices.map((dev) => (
              <div 
                key={dev.id}
                className={`bg-white dark:bg-slate-900 rounded-2xl border ${
                  dev.status === 'online' 
                    ? 'border-emerald-200 dark:border-emerald-950' 
                    : 'border-slate-200 dark:border-slate-800'
                } p-5 shadow-sm space-y-4 flex flex-col justify-between hover:shadow-md transition-shadow`}
              >
                <div>
                  {/* Top Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-base">{dev.name}</span>
                        {!dev.enabled && (
                          <span className="text-xs font-medium text-slate-500">· Disabled</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Product: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{dev.model}</span>
                        <span className="mx-1.5 text-slate-300 dark:text-slate-700">·</span>
                        <span>Machine #{dev.deviceNumber ?? 1}</span>
                      </p>
                    </div>

                    {/* Status Indicator */}
                    <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0">
                      <span className={dev.status === 'online' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                        {dev.status === 'online' ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                  </div>

                  {/* Config Details */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>IP &amp; Port ({dev.commType || 'Ethernet'}):</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{dev.ip}:{dev.port}</span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Compatible Mode:</span>
                      <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        {dev.protocolMode || 'Auto'}{dev.lastProtocolUsed ? ` (${dev.lastProtocolUsed})` : ''}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Serial Number:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">{dev.serialNumber || 'N/A'}</span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Hardware Enrolled:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {(dev.deviceCapacityUsers ?? 0).toLocaleString()} users · {dev.adminCount ?? 0} admin
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Biometrics (FP / Face / Pwd):</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                        {(dev.fpCount ?? 0).toLocaleString()} FP / {(dev.faceCount ?? 0).toLocaleString()} FC / {dev.passwordCount ?? 0} Pwd
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Active Directory Users:</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                        {activeDirectoryEmployeeCount} active mapped
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Punched Users (In Logs):</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {(liveDeviceStatsMap.get(dev.id)?.logs || 0) > 0
                          ? liveDeviceStatsMap.get(dev.id)?.users || 0
                          : (dev.logCount ? dev.userCount || 0 : 0)} users
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Stored SQLite Logs:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {Math.max(liveDeviceStatsMap.get(dev.id)?.logs || 0, dev.logCount || 0).toLocaleString()} logs
                      </span>
                    </div>

                    {typeof dev.deviceCapacityLogs === 'number' && dev.deviceCapacityLogs > 0 && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Device Attendance Logs:</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {dev.deviceCapacityLogs.toLocaleString()} records (OpLog: {dev.opLogCount ?? 0})
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Auto-Sync Interval:</span>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {dev.autoSyncMinutes ? `Every ${dev.autoSyncMinutes} mins` : 'Manual only'}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1">
                      <span>Last Connection:</span>
                      <span className="tabular-nums">{dev.lastConnection ? new Date(dev.lastConnection).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}</span>
                    </div>

                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Last Attendance Sync:</span>
                      <span className="tabular-nums">{dev.lastSync ? new Date(dev.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}</span>
                    </div>

                    {dev.lastError && dev.status === 'offline' && (
                      <div className="mt-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 text-[11px] text-rose-700 dark:text-rose-300 truncate" title={dev.lastError}>
                        {dev.lastError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleTestConnection(dev)}
                      disabled={isTestingId === dev.id}
                      className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg flex items-center gap-1 transition-colors"
                      title="Test hardware TCP/UDP connection & save status to SQLite"
                    >
                      {isTestingId === dev.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wifi className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                      Test Ping
                    </button>

                    <button
                      onClick={() => handleSyncNow(dev)}
                      disabled={isSyncingId === dev.id || !dev.enabled}
                      className="px-2.5 py-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      {isSyncingId === dev.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      Sync Now
                    </button>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(dev)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="Edit Device"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(dev)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                        title="Delete Device"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredDevices.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Cpu className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-medium text-slate-700 dark:text-slate-300">No ZKTeco Devices Found</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Add your biometric devices to enable local LAN synchronization with the HRIS attendance engine.
              </p>
              {isAdmin && (
                <button
                  onClick={handleOpenAdd}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  Add ZKTeco Device
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DEVICE USER MAPPING */}
      {activeTab === 'mapping' && (
        <div className="space-y-6">
          {/* Quick Mapping Input Form */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-1">
              <Link2 className="w-5 h-5 text-indigo-600" />
              Link Biometric User ID to HRIS Employee
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Biometric devices store employee punches using a numeric Biometric User ID (e.g., 101, 121). Map them here to assign raw punches to employee profiles automatically.
            </p>

            <form onSubmit={handleSaveMapping} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Biometric User ID (From ZKTeco Device)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 101 or 121"
                  value={mapDeviceUserId}
                  onChange={(e) => setMapDeviceUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  HRIS Employee Profile
                </label>
                <select
                  value={mapEmployeeId}
                  onChange={(e) => setMapEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                >
                  <option value="">-- Select HRIS Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id}) - {emp.department || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <UserCheck className="w-4 h-4" />
                  Save & Map User
                </button>
              </div>
            </form>
          </div>

          {/* Mapped Users Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Active Biometric Mappings ({zkUserMappings.length})</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
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
                      <tr key={m.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          #{m.deviceUserId}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs">{m.employeeId}</td>
                        <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {emp?.name || m.employeeName || m.employeeId}
                        </td>
                        <td className="px-5 py-3 text-xs">{emp?.department || m.department || 'N/A'}</td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {m.mappedAt ? new Date(m.mappedAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => unmapZkUser(m.id)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors inline-flex items-center gap-1"
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
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                        No biometric user mappings created yet. Add a mapping above.
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
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-4 rounded-2xl flex items-start gap-3 text-amber-900 dark:text-amber-200 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Unmapped Biometric Punches Detected</span>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                The ZKTeco devices received punch records from users not yet mapped to an HRIS Employee. Map the biometric ID to process historical attendance instantly.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-5 py-3">Biometric User ID</th>
                    <th className="px-5 py-3">Device Name</th>
                    <th className="px-5 py-3">IP Address</th>
                    <th className="px-5 py-3">Pending Punches</th>
                    <th className="px-5 py-3">Latest Punch Time</th>
                    <th className="px-5 py-3 text-right">Map Employee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {unmappedGrouped.map((item) => (
                    <tr key={item.deviceUserId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 font-mono font-bold text-amber-600 dark:text-amber-400">
                        #{item.deviceUserId}
                      </td>
                      <td className="px-5 py-3 font-medium">{item.deviceName}</td>
                      <td className="px-5 py-3 font-mono text-xs">{item.deviceIP}</td>
                      <td className="px-5 py-3">
                        <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-full">
                          {item.count} punches pending
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {new Date(item.lastPunch).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => {
                            setMapDeviceUserId(item.deviceUserId);
                            setActiveTab('mapping');
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Resolve & Map
                        </button>
                      </td>
                    </tr>
                  ))}
                  {unmappedGrouped.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                        <p className="font-medium">All device punches are mapped!</p>
                        <p className="text-xs text-slate-400 mt-1">No pending unmapped biometric punch logs found.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SYNC HISTORY LOGS */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Recent ZKTeco Sync Events ({zkSyncLogs.length})
            </h3>
            {zkSyncLogs.length > 0 && (
              <button
                onClick={clearZkSyncLogs}
                className="text-xs text-slate-500 hover:text-rose-600 transition-colors"
              >
                Clear Sync History
              </button>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Device Name</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Read</th>
                    <th className="px-5 py-3">New Punches</th>
                    <th className="px-5 py-3">Duplicates</th>
                    <th className="px-5 py-3">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {zkSyncLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {log.deviceName}
                      </td>
                      <td className="px-5 py-3">
                        {log.status === 'Success' ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded font-semibold">
                            Success
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded font-semibold">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono">{log.recordsRead}</td>
                      <td className="px-5 py-3 font-mono font-bold text-emerald-600">{log.newRecords}</td>
                      <td className="px-5 py-3 font-mono text-slate-400">{log.duplicates}</td>
                      <td className="px-5 py-3 font-mono">{log.durationMs}ms</td>
                    </tr>
                  ))}
                  {zkSyncLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-500 dark:text-slate-400">
                        No synchronization history logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LOCAL PC DISK (E:) & DAT IMPORT */}
      {activeTab === 'usb_dat' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <FileUp className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Local PC Disk (E:) Database & DAT Attendance File Upload</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Import attendance logs directly from your local PC drive (<code className="font-mono text-indigo-500">Local Disk E:\</code>), ZKTime 5.0 database (<code className="font-mono text-indigo-500">E:\att2000.mdb</code>, <code className="font-mono text-indigo-500">E:\ZKTime5.0\att2000.mdb</code>), USB DAT logs (<code className="font-mono text-indigo-500">1_attlog.dat</code>, <code className="font-mono text-indigo-500">attlog.txt</code>), or CSV exports!
                </p>
              </div>
            </div>

            {/* Local PC Disk E: Banner */}
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-600 text-white rounded-lg font-bold">
                  Disk E:\
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">Local Disk (E:) & ZKTime Auto-Sync Supported</h4>
                  <p className="text-slate-600 dark:text-slate-300">
                    If your ZKTime 5.0 database is installed on <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400">E:\att2000.mdb</code> or <code className="font-mono font-bold text-emerald-700 dark:text-emerald-400">E:\ZKTime5.0\att2000.mdb</code>, our background agent script monitors and syncs punches automatically!
                  </p>
                </div>
              </div>
              <button
                onClick={handleDownloadWindowsBatchInstaller}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Download E:\ Auto-Sync Agent
              </button>
            </div>

            {/* Target Device Selector for File Upload */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">Target Biometric Device for Uploaded Logs</span>
                <span className="text-slate-500 dark:text-slate-400">Select which registered terminal these punch logs belong to so User &amp; Log counts match on the device card:</span>
              </div>
              <select
                value={selectedDatDeviceId || (zkDevices[0]?.id || '')}
                onChange={(e) => setSelectedDatDeviceId(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {zkDevices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.ip})
                  </option>
                ))}
              </select>
            </div>

            <div className="border-2 border-dashed border-indigo-200 dark:border-indigo-900 hover:border-indigo-500 dark:hover:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 rounded-2xl p-8 text-center transition-all">
              <input
                type="file"
                id="usbDatFileInput"
                accept=".dat,.txt,.csv,.mdb,.accdb,.db,.tsv"
                onChange={handleDatFileUpload}
                className="hidden"
                disabled={isProcessingDat}
              />
              <label htmlFor="usbDatFileInput" className="cursor-pointer flex flex-col items-center gap-3">
                <div className="p-4 bg-white dark:bg-slate-800 rounded-full shadow-md text-indigo-600 dark:text-indigo-400">
                  <FileUp className="w-8 h-8 animate-bounce" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {isProcessingDat ? 'Parsing ZKTeco Punch Records...' : 'Click or Drag File from Local Disk (E:)'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Supports <code className="font-mono text-indigo-600 font-bold">1_attlog.dat</code>, <code className="font-mono text-indigo-600 font-bold">att2000.mdb</code>, <code className="font-mono text-indigo-600 font-bold">attlog.txt</code>, and space/tab/comma CSV exports
                  </p>
                </div>
                <span className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors">
                  Browse File from Local Disk (E:) or USB Drive
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <FolderSearch className="w-4 h-4 text-emerald-600" />
                    Auto-Ingest Watch Folder
                  </span>
                  <button
                    type="button"
                    onClick={handleScanWatchFolder}
                    disabled={isScanningWatch}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50"
                  >
                    {isScanningWatch ? 'Scanning...' : 'Scan Watch Folder'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Any <code className="font-mono text-indigo-600">.dat</code>, <code className="font-mono text-indigo-600">.txt</code>, <code className="font-mono text-indigo-600">.csv</code>, or <code className="font-mono text-indigo-600">.json</code> punch file saved in:
                </p>
                <code className="block px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">
                  {pollSummary?.watchFolderPath || 'local_hris_data/Imports'}
                </code>
                <p className="text-[11px] text-slate-400">
                  is automatically fetched into SQLite on every scheduled poll cycle without duplicates.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Quick Raw Log Paste (ATTLOG / Key=Value / CSV)
                  </span>
                  <button
                    type="button"
                    onClick={handleUploadRawText}
                    disabled={isUploadingRaw}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50"
                  >
                    {isUploadingRaw ? 'Parsing...' : 'Parse & Save to SQLite'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={rawPasteText}
                  onChange={(e) => setRawPasteText(e.target.value)}
                  placeholder={'101\t2026-08-10 08:55:12\nPIN=102\tDateTime=2026-08-10 09:02:10'}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: LOCAL ZK CONNECTOR ARCHITECTURE & GUIDE */}
      {activeTab === 'connector' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Server className="w-7 h-7 text-indigo-400" />
                <div>
                  <h2 className="text-lg font-bold">Local ZK Connector Bridge & ADMS Push Architecture</h2>
                  <p className="text-xs text-indigo-200">
                    Connect local physical ZKTeco devices (IP 192.168.x.x) to Cloud HRIS
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadAgentScript}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Download zk-lan-connector.js Script
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
              <div className="bg-white/10 backdrop-blur p-4 rounded-xl space-y-1">
                <span className="font-bold text-indigo-300">Method 1: Local LAN Connector Agent</span>
                <p className="text-slate-300">
                  Runs on any PC in your office LAN. Connects to device IP <code className="font-mono text-amber-300">192.168.117.200:4370</code> via UDP/TCP socket and posts punches to Cloud HRIS.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur p-4 rounded-xl space-y-1">
                <span className="font-bold text-indigo-300">Method 2: ZKTeco ADMS Cloud Server</span>
                <p className="text-slate-300">
                  In device Menu &rarr; Comm. &rarr; ADMS / Cloud Server, set Server Address to <code className="font-mono text-emerald-300">{window.location.hostname}</code> and port <code className="font-mono text-emerald-300">80 / 443</code>.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur p-4 rounded-xl space-y-1">
                <span className="font-bold text-indigo-300">Method 3: Direct USB DAT Import</span>
                <p className="text-slate-300">
                  Export <code className="font-mono text-indigo-300">1_attlog.dat</code> via USB flash drive and drop it into the "USB DAT / TXT Import" tab.
                </p>
              </div>
            </div>
          </div>

          {/* Setup Script Generator */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-600" />
                Node.js Local Agent Script (<code className="font-mono text-xs text-indigo-500">zk-connector.js</code>)
              </h3>
              <button
                onClick={handleDownloadAgentScript}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                1-Click Download
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Run this script on any local PC or server on your LAN (192.168.117.x / 192.168.13.x) to continuously poll your ZKTeco devices and push raw punches to the HRIS.
            </p>

            <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto relative">
              <pre>{`// zk-connector.js - ZKTeco LAN Bridge Agent
const axios = require('axios');
const ZKLib = require('node-zklib'); // npm install node-zklib axios

const HRIS_ENDPOINT = '${window.location.origin}/api/zk/agent/sync';
const DEVICES = [
  { id: 'dev_main_192_168_117_200', name: 'Time Office 2', ip: '192.168.117.200', port: 4370, model: 'MB2000/ID', commType: 'Ethernet', machineNo: 1 },
  { id: 'dev_factory_192_168_117_201', name: 'Time Office 1', ip: '192.168.117.201', port: 4370, model: 'MB2000/ID', commType: 'Ethernet', machineNo: 1 },
  { id: 'dev_office_192_168_13_7', name: 'ISTS Office', ip: '192.168.13.103', port: 4370, model: 'MB2000', commType: 'Ethernet', machineNo: 1 }
];

async function pollDevice(dev) {
  try {
    console.log(\`Connecting to \${dev.name} (\${dev.ip}:\${dev.port})...\`);
    const zk = new ZKLib(dev.ip, dev.port, 5000, 4000);
    await zk.createSocket();
    
    const logs = await zk.getAttendances();
    await zk.disconnect();

    const punches = logs.data.map(log => ({
      deviceUserId: String(log.deviceUserId || log.userId),
      punchDateTime: new Date(log.recordTime).toISOString()
    }));

    console.log(\`Sending \${punches.length} punches to HRIS...\`);
    const res = await axios.post(HRIS_ENDPOINT, {
      deviceId: dev.id,
      deviceName: dev.name,
      deviceIP: dev.ip,
      logCount: punches.length,
      punches
    });

    console.log(\`[SUCCESS] \${dev.name}: Synced \${res.data.newRecords} new punches.\`);
  } catch (err) {
    console.error(\`[ERROR] \${dev.name} (\${dev.ip}): \${err.message}\`);
  }
}

// Poll every 15 minutes
setInterval(() => {
  DEVICES.forEach(pollDevice);
}, 15 * 60 * 1000);

// Initial run
DEVICES.forEach(pollDevice);`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT DEVICE MODAL */}
      {isDeviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {editingDevice ? 'Edit ZKTeco Device' : 'Add ZKTeco Device'}
              </h3>
              <button
                onClick={() => setIsDeviceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDevice} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Device Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Time Office 2 / ISTS Office"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    IP Address *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 192.168.117.200"
                    value={formData.ip}
                    onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Port *
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 4370 })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Product / Model
                  </label>
                  <input
                    type="text"
                    placeholder="MB2000/ID"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    placeholder="BRC7233360063"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Machine No
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.deviceNumber}
                    onChange={(e) => setFormData({ ...formData, deviceNumber: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Comm Type
                  </label>
                  <select
                    value={formData.commType}
                    onChange={(e) => setFormData({ ...formData, commType: e.target.value as 'Ethernet' | 'USB' | 'Serial' | 'WiFi' })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  >
                    <option value="Ethernet">Ethernet</option>
                    <option value="USB">USB</option>
                    <option value="Serial">Serial</option>
                    <option value="WiFi">WiFi</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Compatible Protocol
                  </label>
                  <select
                    value={formData.protocolMode}
                    onChange={(e) => setFormData({ ...formData, protocolMode: e.target.value as ZkProtocolMode })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  >
                    <option value="Auto">Auto (TCP → UDP → Web-HTTP)</option>
                    <option value="TCP">TCP 4370 (SDK Binary)</option>
                    <option value="UDP">UDP 4370 (Legacy ZKT)</option>
                    <option value="ADMS">ADMS Cloud Push (/iclock)</option>
                    <option value="Web-HTTP">Web HTTP / SOAP (Port 80)</option>
                    <option value="USB-Disk">USB / Watch Folder</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Comm Key (Default 0)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.commKey}
                    onChange={(e) => setFormData({ ...formData, commKey: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Auto-Sync Interval
                </label>
                <select
                  value={formData.autoSyncMinutes}
                  onChange={(e) => setFormData({ ...formData, autoSyncMinutes: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                >
                  <option value={1}>Every 1 Minute (Live Poll)</option>
                  <option value={5}>Every 5 Minutes</option>
                  <option value={15}>Every 15 Minutes</option>
                  <option value={30}>Every 30 Minutes</option>
                  <option value={60}>Every 1 Hour</option>
                  <option value={0}>Manual Trigger Only</option>
                </select>
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
                  Device Enabled for Automatic Polling
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeviceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs shadow-sm transition-colors"
                >
                  {editingDevice ? 'Save Changes' : 'Add Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ZKTIME 5.0 STEP-BY-STEP PC SETUP GUIDE MODAL */}
      {showZkTimeGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg">
                    ZKTime 5.0 PC Integration Guide
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Fingerprint Attendance System (v4.9.1 / v5.0 SDK 6.3.1.47)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowZkTimeGuideModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                Because Cloud Web Applications cannot directly reach local private IP addresses (e.g. <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-indigo-600">192.168.117.200</code>) inside your office network without a bridge, choose one of the 3 simple connection options below:
              </p>

              {/* METHOD 1 */}
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-300 text-sm">
                    <Zap className="w-4 h-4 text-emerald-600" />
                    <span>Method 1: Windows 1-Click Auto-Sync Agent (Recommended)</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-600 text-white font-bold rounded text-[10px]">
                    AUTOMATIC
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  Runs continuously on your Windows PC in the background. It connects to your ZKTime 5.0 machine IP over LAN and sends attendance punches to Cloud HRIS every 15 minutes.
                </p>
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <button
                    onClick={handleDownloadWindowsBatchInstaller}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download start-zktime-sync.bat
                  </button>
                  <button
                    onClick={handleDownloadAgentScript}
                    className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    Download zk-lan-connector.js
                  </button>
                </div>
              </div>

              {/* METHOD 2 */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                    <FileUp className="w-4 h-4 text-indigo-600" />
                    <span>Method 2: Export Attendance Log from ZKTime 5.0 Desktop</span>
                  </div>
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold rounded text-[10px]">
                    MANUAL / NO SCRIPT
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-400 pl-1">
                  <li>In <strong>ZKTime 5.0</strong>, click <strong>Data</strong> or <strong>Maintenance</strong> &rarr; <strong>Export Attendance Logs</strong> (or Export Data).</li>
                  <li>Save as <code className="font-mono text-indigo-600">.csv</code>, <code className="font-mono text-indigo-600">.txt</code>, or <code className="font-mono text-indigo-600">.dat</code>.</li>
                  <li>Click the <strong>USB DAT / TXT Import</strong> tab in this app and drop the file. Done!</li>
                </ol>
                <button
                  onClick={() => {
                    setShowZkTimeGuideModal(false);
                    setActiveTab('usb_dat');
                  }}
                  className="mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-1"
                >
                  Go to USB DAT / TXT Upload Tab &rarr;
                </button>
              </div>

              {/* METHOD 3 */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100 text-sm">
                    <Radio className="w-4 h-4 text-amber-500" />
                    <span>Method 3: Configure ADMS Push directly on ZKTeco Device</span>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold">
                    CLOUD HARDWARE PUSH
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  On physical ZKTeco machine screen: Go to <code className="font-mono text-slate-800 dark:text-slate-200">Menu &rarr; Comm. &rarr; ADMS / Cloud Server</code>:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pl-1">
                  <li><strong>Server Domain/IP:</strong> <code className="font-mono font-bold text-indigo-600">{window.location.hostname}</code></li>
                  <li><strong>Server Port:</strong> <code className="font-mono font-bold text-indigo-600">80</code> or <code className="font-mono font-bold text-indigo-600">443</code></li>
                  <li><strong>Enable Domain Name:</strong> <code className="font-mono text-indigo-600">ON</code></li>
                </ul>
              </div>

              <div className="pt-3 flex justify-end items-center border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setShowZkTimeGuideModal(false)}
                  className="px-5 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl font-bold text-xs"
                >
                  Close Guide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEVICE DIAGNOSTIC & TEST PUNCH MODAL */}
      {diagnosticDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    Device Connection & Diagnostic Test
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {diagnosticDevice.name} ({diagnosticDevice.ip}:{diagnosticDevice.port || 4370})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDiagnosticDevice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Diagnostic Status Box */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${lastDiagnosticResult?.reachable ? 'text-emerald-600' : 'text-amber-500'}`} />
                    <span>Multi-Protocol Diagnostic ({diagnosticDevice.protocolMode || 'Auto'})</span>
                  </span>
                  {lastDiagnosticResult?.protocol && (
                    <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400">
                      {lastDiagnosticResult.protocol}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  {lastDiagnosticResult?.message || `Target device ${diagnosticDevice.model} at ${diagnosticDevice.ip}:${diagnosticDevice.port}.`}
                </p>
                {Array.isArray(lastDiagnosticResult?.attempts) && lastDiagnosticResult.attempts.length > 0 && (
                  <div className="grid grid-cols-1 gap-1 pt-1">
                    {lastDiagnosticResult.attempts.map((att: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span>{att.protocol}</span>
                        <span className={att.reachable ? 'text-emerald-600 font-semibold' : 'text-rose-600'}>
                          {att.reachable ? `OK (${att.latencyMs}ms)` : `FAIL (${att.latencyMs}ms)`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Direct Test Punch Trigger */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-indigo-600" />
                    Test Punch Simulator
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 px-2 py-0.5 rounded font-semibold">
                    Live Testing
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400">
                  Simulate a real physical fingerprint / card scan for a Biometric User ID to test instant mapping and attendance sync:
                </p>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                      Biometric User ID (from device)
                    </label>
                    <input
                      type="text"
                      value={testUserId}
                      onChange={(e) => setTestUserId(e.target.value)}
                      placeholder="e.g. 121 or 101"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                    />
                  </div>
                  <button
                    onClick={handleSendTestPunch}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    Send Test Punch
                  </button>
                </div>
              </div>

              {/* Quick Instructions */}
              <div className="space-y-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">Connecting Physical Device over LAN / WAN:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 pl-1">
                  <li><strong>Option A (Local LAN Connector):</strong> Download <code className="font-mono text-indigo-600">zk-lan-connector.js</code> and run it on any office PC connected to <code className="font-mono">{diagnosticDevice.ip}</code>.</li>
                  <li><strong>Option B (ADMS Push):</strong> On ZKTeco device, set ADMS Server to <code className="font-mono">{window.location.hostname}</code> on port 80/443.</li>
                  <li><strong>Option C (USB Import):</strong> Export <code className="font-mono text-indigo-600">1_attlog.dat</code> to USB drive and upload in the "USB DAT / TXT Import" tab.</li>
                </ul>
              </div>

              <div className="pt-3 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={handleDownloadAgentScript}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold text-xs hover:underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download LAN Agent Script
                </button>
                <button
                  onClick={() => setDiagnosticDevice(null)}
                  className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl font-bold text-xs"
                >
                  Close Diagnostic
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
