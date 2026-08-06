import React, { useState } from 'react';
import { useAppStore } from '../store';
import { ZkDevice, ZkUserMapping } from '../types';
import { 
  Cpu, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
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
  ShieldAlert,
  HelpCircle,
  HardDrive,
  FileUp,
  Radio,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

export const DeviceSetup: React.FC = () => {
  const { 
    zkDevices, 
    zkUserMappings, 
    zkSyncLogs, 
    zkUnmappedPunches,
    employees,
    addZkDevice,
    updateZkDevice,
    deleteZkDevice,
    mapZkUser,
    unmapZkUser,
    syncZkDevice,
    resolveUnmappedPunches,
    clearZkSyncLogs,
    isAdmin
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'devices' | 'mapping' | 'unmapped' | 'history' | 'connector' | 'usb_dat'>('devices');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal States
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ZkDevice | null>(null);
  const [isTestingId, setIsTestingId] = useState<string | null>(null);
  const [isSyncingId, setIsSyncingId] = useState<string | null>(null);
  const [diagnosticDevice, setDiagnosticDevice] = useState<ZkDevice | null>(null);
  const [testUserId, setTestUserId] = useState('121');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    ip: '192.168.117.200',
    port: 4370,
    model: 'MB2000/ID',
    serialNumber: '',
    deviceNumber: 1,
    enabled: true,
    autoSyncMinutes: 15
  });

  // Mapping Form State
  const [mapDeviceUserId, setMapDeviceUserId] = useState('');
  const [mapEmployeeId, setMapEmployeeId] = useState('');

  // Handle DAT / CSV / TXT File Upload for ZKTime 5.0
  const [isProcessingDat, setIsProcessingDat] = useState(false);
  const [showZkTimeGuideModal, setShowZkTimeGuideModal] = useState(false);

  // Helper to parse ZK date/time string variants safely
  const parseZkDateTime = (dateStr: string, timeStr?: string): string | null => {
    if (!dateStr) return null;
    const cleanD = dateStr.trim().replace(/^"|"$/g, '');
    const cleanT = (timeStr || '').trim().replace(/^"|"$/g, '') || '00:00:00';

    // 1. Try ISO / YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
    const ymdMatch = cleanD.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (ymdMatch) {
      const yr = parseInt(ymdMatch[1], 10);
      const mo = parseInt(ymdMatch[2], 10) - 1;
      const dy = parseInt(ymdMatch[3], 10);
      const tParts = cleanT.split(':');
      const hr = parseInt(tParts[0] || '0', 10);
      const mn = parseInt(tParts[1] || '0', 10);
      const sc = parseInt(tParts[2] || '0', 10);
      const d = new Date(yr, mo, dy, hr, mn, sc);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    // 2. Try DD/MM/YYYY or MM/DD/YYYY
    const dmyMatch = cleanD.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      const yr = parseInt(dmyMatch[3], 10);
      let dy = p1;
      let mo = p2 - 1;
      if (p1 > 12) {
        dy = p1;
        mo = p2 - 1;
      } else if (p2 > 12) {
        mo = p1 - 1;
        dy = p2;
      }
      const tParts = cleanT.split(':');
      const hr = parseInt(tParts[0] || '0', 10);
      const mn = parseInt(tParts[1] || '0', 10);
      const sc = parseInt(tParts[2] || '0', 10);
      const d = new Date(yr, mo, dy, hr, mn, sc);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    // 3. Fallback to JS Date constructor
    try {
      const full = `${cleanD} ${cleanT}`;
      const d = new Date(full);
      return isNaN(d.getTime()) ? null : d.toISOString();
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

      // Sync via API
      const defaultDev = zkDevices[0] || { id: 'dev_usb', name: 'ZKTime 5.0 Import', ip: 'USB/File' };
      const res = await fetch('/api/zk/agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: defaultDev.id,
          deviceName: defaultDev.name,
          deviceIP: defaultDev.ip,
          logCount: punches.length,
          punches
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Successfully imported ${data.newRecords} new attendance records from "${file.name}" (${data.duplicates} existing duplicates)`, { id: tId });
      } else {
        toast.error(`Import failed: ${data.error || 'Invalid file structure'}`, { id: tId });
      }
    } catch (err: any) {
      toast.error(`Failed to read file: ${err.message}`, { id: tId });
    } finally {
      setIsProcessingDat(false);
      e.target.value = '';
    }
  };

  // Helper to construct the JS connector agent content
  const getAgentJsScript = () => {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }

    const activeDevs = (zkDevices && zkDevices.length > 0) ? zkDevices : [
      { id: 'dev_factory_192_168_117_201', name: 'Factory Device', ip: '192.168.117.201', port: 4370 },
      { id: 'dev_main_192_168_117_200', name: 'Main Device', ip: '192.168.117.200', port: 4370 }
    ];

    return `// zk-lan-connector.js - ZKTeco LAN & Local PC Disk (E:) Database Agent
// Run this script on your local Windows PC or Server inside your device LAN!
// Requirements: Node.js (v16+) -> npm install firebase node-zklib axios

const fs = require('fs');
const path = require('path');
const axios = require('axios');
let ZKLib;
try { ZKLib = require('node-zklib'); } catch (e) { ZKLib = null; }

// Firebase Cloud Firestore Direct Connector
let initializeApp, getFirestore, doc, setDoc, writeBatch, getDocs, collection;
let db = null;
try {
  const fbApp = require('firebase/app');
  const fbStore = require('firebase/firestore');
  initializeApp = fbApp.initializeApp;
  getFirestore = fbStore.getFirestore;
  doc = fbStore.doc;
  setDoc = fbStore.setDoc;
  writeBatch = fbStore.writeBatch;
  getDocs = fbStore.getDocs;
  collection = fbStore.collection;

  const firebaseConfig = {
    projectId: "infra-snowfall-cq7jp",
    appId: "1:357458622366:web:6a0769f6e8e4606871c88f",
    apiKey: "AIzaSyDuwenK4Iez6c1qYTFKUGxzlK81fdiRZIs",
    authDomain: "infra-snowfall-cq7jp.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-remixattendancem-0b3005dc-f604-446b-b1ea-1badf613271a"
  };

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  console.log(" -> [OK] Cloud Firestore Direct Connection initialized.");
} catch (fbInitErr) {
  console.log(" -> [NOTE] Firestore direct SDK load note: " + fbInitErr.message);
}

const DEVICES = ${JSON.stringify(activeDevs.map(d => ({ id: d.id, name: d.name, ip: d.ip, port: d.port || 4370 })), null, 2)};

// Common ZKTime 5.0 / BioTime Database & Log File Paths on Local PC (Disk E: & C:)
const LOCAL_DB_PATHS = [
  'E:\\\\att2000.mdb',
  'E:\\\\ZKTime5.0\\\\att2000.mdb',
  'E:\\\\ZKTime\\\\att2000.mdb',
  'E:\\\\BioTime\\\\att2000.mdb',
  'E:\\\\zktime.db',
  'E:\\\\att_logs.dat',
  'E:\\\\1_attlog.dat',
  'E:\\\\attlog.txt',
  'C:\\\\Program Files (x86)\\\\ZKTime5.0\\\\att2000.mdb',
  'C:\\\\ZKTime5.0\\\\att2000.mdb',
  'C:\\\\att2000.mdb'
];

console.log("==========================================================");
console.log(" ZKTeco LAN & Local PC Disk (E:) Direct Cloud Sync Agent");
console.log(" Cloud Firestore Database ID: ai-studio-remixattendancem-0b30...");
console.log(" Monitored LAN Devices: " + DEVICES.length);
console.log(" Monitored Local PC Paths: " + LOCAL_DB_PATHS.length);
console.log("==========================================================\\n");

async function pushPunchesDirectToCloud(devId, devName, devIP, punches) {
  if (!punches || punches.length === 0) return 0;

  const now = new Date().toISOString();
  const thirtyDaysAgoMs = Date.now() - 30 * 86400 * 1000;
  let newRecords = 0;

  // Local PC Disk Sync Cache to avoid duplicate write ops against Firestore free daily quota
  let SYNCED_CACHE = new Set();
  try {
    if (fs.existsSync('synced_punches.json')) {
      const rawCache = fs.readFileSync('synced_punches.json', 'utf8');
      SYNCED_CACHE = new Set(JSON.parse(rawCache));
    }
  } catch (e) {}

  // 1. Filter out punches older than 30 days and punches already in local sync cache
  const candidatePunches = punches.filter(p => {
    const rawDateTime = p.punchDateTime || p.recordTime || p.timestamp || p.attTime || p.time || p.date || now;
    const punchMs = new Date(rawDateTime).getTime();
    if (!isNaN(punchMs) && punchMs < thirtyDaysAgoMs) return false;

    const deviceUserId = String(p.deviceUserId || p.userId || p.pin || p.userSn || p.sn || p.id || '').trim();
    if (!deviceUserId) return false;

    const punchDateTime = String(rawDateTime).replace(' ', 'T');
    const transactionId = \`\${devId}_\${deviceUserId}_\${punchDateTime}\`;
    const punchId = \`zk_\${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}\`;

    return !SYNCED_CACHE.has(punchId);
  }).slice(0, 500); // Limit max candidates per cycle to preserve daily write quota

  if (candidatePunches.length === 0) {
    console.log(\` -> All candidate punches for \${devName} are already synced or older than 30 days.\`);
    return 0;
  }

  if (db) {
    try {
      // Fetch current employees map if available
      const empMap = new Map();
      try {
        const empSnap = await getDocs(collection(db, 'employees'));
        empSnap.docs.forEach(docSnap => {
          const emp = docSnap.data();
          const empId = String(emp.id || '').trim();
          if (empId) {
            empMap.set(empId, empId);
            if (emp.acNo) empMap.set(String(emp.acNo).trim(), empId);
            if (emp.deviceUserId) empMap.set(String(emp.deviceUserId).trim(), empId);
            if (emp.biometricId) empMap.set(String(emp.biometricId).trim(), empId);
            if (emp.zkPin) empMap.set(String(emp.zkPin).trim(), empId);
          }
        });
      } catch (e) {
        console.log(" -> Note: Employee directory read note (using AC-No directly).");
      }

      const BATCH_SIZE = 50; // safe batch size for Firestore
      const writtenEmpsInRun = new Set();

      for (let i = 0; i < candidatePunches.length; i += BATCH_SIZE) {
        const chunk = candidatePunches.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        const chunkPunchIds = [];

        for (const p of chunk) {
          const deviceUserId = String(p.deviceUserId || p.userId || p.pin || p.userSn || p.sn || p.id || '').trim();
          if (!deviceUserId) continue;

          const normDevId = deviceUserId.replace(/[^0-9]/g, '').replace(/^0+/, '') || deviceUserId;
          const rawDateTime = p.punchDateTime || p.recordTime || p.timestamp || p.attTime || p.time || p.date || now;
          const punchDateTime = String(rawDateTime).replace(' ', 'T');
          const transactionId = \`\${devId}_\${deviceUserId}_\${punchDateTime}\`;
          const punchId = \`zk_\${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}\`;

          const resolvedEmpId = empMap.get(deviceUserId) || empMap.get(normDevId) || deviceUserId || (normDevId ? \`EMP-\${normDevId.padStart(3, '0')}\` : 'UNKNOWN');

          // Write Punch
          const punchRef = doc(db, 'punches', punchId);
          batch.set(punchRef, {
            id: punchId,
            employeeId: resolvedEmpId,
            punchDatetime: punchDateTime,
            deviceId: devId,
            deviceName: devName || 'ZKTeco Device',
            deviceIP: devIP || '192.168.117.200',
            deviceUserId: deviceUserId,
            source: 'ZKTeco',
            syncTime: now,
            transactionId: transactionId,
            location: \`\${devName || 'Biometric'} (\${devIP || 'LAN'})\`,
            importFormat: 'standard'
          }, { merge: true });

          chunkPunchIds.push(punchId);

          // Only write Employee record ONCE per resolvedEmpId in run to save write quota
          if (!empMap.has(resolvedEmpId) && !writtenEmpsInRun.has(resolvedEmpId)) {
            writtenEmpsInRun.add(resolvedEmpId);
            const empRef = doc(db, 'employees', resolvedEmpId);
            batch.set(empRef, {
              id: resolvedEmpId,
              name: \`Employee (AC-No: \${deviceUserId})\`,
              department: 'Biometric Devices',
              designation: 'Staff',
              joiningDate: now.split('T')[0],
              status: 'Active',
              deviceUserId: deviceUserId,
              biometricId: deviceUserId,
              acNo: deviceUserId,
              zkPin: deviceUserId
            }, { merge: true });
          }

          newRecords++;
        }

        try {
          await batch.commit();
          chunkPunchIds.forEach(id => SYNCED_CACHE.add(id));
          try {
            fs.writeFileSync('synced_punches.json', JSON.stringify(Array.from(SYNCED_CACHE).slice(-20000)));
          } catch (e) {}
        } catch (commitErr) {
          const msg = commitErr.message || String(commitErr);
          if (msg.includes('resource-exhausted') || msg.toLowerCase().includes('quota')) {
            console.log(" -> [NOTICE] Cloud Firestore Daily Free Write Quota reached (20,000 writes/day). Sync paused until reset.");
            break;
          } else {
            console.log(" -> Batch commit note: " + msg);
          }
        }
      }

      if (newRecords > 0) {
        console.log(\` -> [SUCCESS] Direct Cloud Sync completed for \${newRecords} punches!\`);
      }
      return newRecords;
    } catch (fbErr) {
      console.log(\` -> Direct Firestore sync note: \${fbErr.message}\`);
    }
  }

  return 0;
}

async function scanLocalDiskDatabase() {
  console.log(\`[\${new Date().toLocaleTimeString()}] Scanning Local PC Disk (E:) for ZKTime database/logs...\`);
  for (const filePath of LOCAL_DB_PATHS) {
    if (!fs.existsSync(filePath)) continue;

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
          let isoDate = null;

          if (parts[1] && (parts[1].includes(' ') || parts[1].includes('T'))) {
            const d = new Date(parts[1].replace('T', ' '));
            if (!isNaN(d.getTime())) isoDate = d.toISOString();
          } else if (parts[1] && parts[2]) {
            const d = new Date(\`\${parts[1]} \${parts[2]}\`);
            if (!isNaN(d.getTime())) isoDate = d.toISOString();
          }

          if (uid && isoDate) {
            validPunches.push({ deviceUserId: uid, punchDateTime: isoDate });
          }
        }
      }

      if (validPunches.length > 0) {
        console.log(\` -> Extracted \${validPunches.length} valid punch records from \${filePath}.\`);
        const synced = await pushPunchesDirectToCloud('dev_local_disk_e', \`Local Disk (E:) Database (\${path.basename(filePath)})\`, filePath, validPunches);
        console.log(\` -> [SUCCESS] Synced \${synced || validPunches.length} records from Local Disk (E:) database.\\n\`);
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
      
      let pDate = null;
      const rawTime = l.recordTime || l.timestamp || l.attTime || l.time || l.date;
      if (rawTime) {
        const d = new Date(rawTime);
        if (!isNaN(d.getTime())) pDate = d.toISOString();
      }
      if (pDate) {
        validPunches.push({ deviceUserId: uid, punchDateTime: pDate });
      }
    }

    console.log(\` -> Fetched \${validPunches.length} valid punches from \${dev.name}.\`);

    if (validPunches.length > 0) {
      const synced = await pushPunchesDirectToCloud(dev.id || ('dev_' + String(dev.ip || '').replace(/[^0-9]/g, '_')), dev.name || 'ZKTeco Device', dev.ip, validPunches);
      console.log(\` -> [SUCCESS] Direct Synced \${synced || validPunches.length} records for \${dev.name}.\\n\`);
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

// Poll every 15 minutes
setInterval(runSyncAll, 15 * 60 * 1000);

// Run immediately
runSyncAll();
`;
  };

  // Download Windows 1-Click BAT Launcher
  const handleDownloadWindowsBatchInstaller = () => {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    const jsContent = getAgentJsScript();
    const jsBase64 = btoa(unescape(encodeURIComponent(jsContent)));

    const batContent = `@echo off
TITLE ZKTime 5.0 & ZKTeco Cloud HRIS Auto-Sync Bridge
COLOR 0A
cls
echo ===================================================
echo   ZKTime 5.0 / ZKTeco Cloud HRIS Sync Agent
echo ===================================================
echo.
echo Target Cloud HRIS: Direct Cloud Firestore Connection
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
echo Step 2: Installing required libraries (firebase, node-zklib, axios)...
call npm install firebase node-zklib axios --no-audit --no-fund
echo.
echo Step 3: Generating/updating zk-lan-connector.js...
node -e "require('fs').writeFileSync('zk-lan-connector.js', Buffer.from('${jsBase64}', 'base64').toString('utf8'))"
echo [OK] zk-lan-connector.js updated.
echo.
echo Step 4: Starting ZKTime 5.0 Direct Cloud Auto-Sync Agent...
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
    toast.success('Downloaded "start-zktime-sync.bat" for Windows PC!');
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
      const now = new Date().toISOString();
      const res = await fetch('/api/zk/agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: diagnosticDevice.id,
          deviceName: diagnosticDevice.name,
          deviceIP: diagnosticDevice.ip,
          userCount: 1,
          logCount: 1,
          punches: [
            {
              deviceUserId: testUserId,
              punchDateTime: now
            }
          ]
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Test Punch Received! ${data.newRecords ? 'New record created' : 'Duplicate recorded'}.`, { id: tId });
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
      deviceNumber: (zkDevices.length || 0) + 1,
      enabled: true,
      autoSyncMinutes: 15
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
      enabled: dev.enabled,
      autoSyncMinutes: dev.autoSyncMinutes || 15
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
        await addZkDevice(formData);
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

  // Test Connection
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
          model: dev.model
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        await updateZkDevice(dev.id, { status: 'online', lastConnection: new Date().toISOString() });
        setDiagnosticDevice(dev);
      } else {
        toast.error(`Connection failed: ${data.error}`);
        await updateZkDevice(dev.id, { status: 'offline' });
      }
    } catch (err: any) {
      toast.error(`Device unreachable at ${dev.ip}:${dev.port}`);
      await updateZkDevice(dev.id, { status: 'offline' });
    } finally {
      setIsTestingId(null);
    }
  };

  // Trigger Sync Now
  const handleSyncNow = async (dev: ZkDevice) => {
    setIsSyncingId(dev.id);
    try {
      await syncZkDevice(dev.id);
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
            onClick={() => {
              zkDevices.forEach(d => handleSyncNow(d));
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-sm flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Sync All
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
            <Radio className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-base">Using ZKTime 5.0 Desktop System on your PC?</h3>
            <p className="text-xs text-emerald-100 mt-0.5">
              Connect your ZKTime 5.0 fingerprint machine directly to Cloud HRIS using our 1-click PC installer or direct log export.
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
          {unmappedGrouped.length > 0 && (
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          )}
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
          Local PC Disk (E:) & DAT Import
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
                          <span className="px-2 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500 rounded-md">Disabled</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Model: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{dev.model}</span></p>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-1.5">
                      {dev.status === 'online' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 rounded-full border border-emerald-200/60 dark:border-emerald-800/60">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 rounded-full border border-rose-200/60 dark:border-rose-800/60">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          Offline
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Config Details */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>IP & Port:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{dev.ip}:{dev.port}</span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Serial Number:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">{dev.serialNumber || 'N/A'}</span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Registered Users:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{dev.userCount || 0} users</span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Total Punch Logs:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{dev.logCount || 0} logs</span>
                    </div>

                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Auto-Sync Interval:</span>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {dev.autoSyncMinutes ? `Every ${dev.autoSyncMinutes} mins` : 'Manual only'}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1">
                      <span>Last Connection:</span>
                      <span>{dev.lastConnection ? new Date(dev.lastConnection).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never'}</span>
                    </div>

                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Last Attendance Sync:</span>
                      <span>{dev.lastSync ? new Date(dev.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleTestConnection(dev)}
                      disabled={isTestingId === dev.id}
                      className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg flex items-center gap-1 transition-colors"
                      title="Test local socket connection"
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
                      className="px-2.5 py-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-lg flex items-center gap-1 transition-colors"
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 dark:text-slate-100">Step 1: Locate Database on PC</span>
                <p className="text-slate-500 dark:text-slate-400">Open <code className="font-mono">Local Disk (E:)</code> &rarr; <code className="font-mono">ZKTime5.0</code> or USB drive to find your attendance database or log file.</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 dark:text-slate-100">Step 2: Upload or Run Agent</span>
                <p className="text-slate-500 dark:text-slate-400">Select file above for instant upload, or run <code className="font-mono text-emerald-600">start-zktime-sync.bat</code> for 24/7 background sync.</p>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
                <span className="font-bold text-slate-900 dark:text-slate-100">Step 3: Auto AC-No Matching</span>
                <p className="text-slate-500 dark:text-slate-400">Biometric User IDs / AC-No match Employee IDs automatically and log punches into HRIS Attendance records.</p>
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
  { id: 'dev_main_192_168_117_200', name: 'Main Device', ip: '192.168.117.200', port: 4370 },
  { id: 'dev_factory_192_168_117_201', name: 'Factory Device', ip: '192.168.117.201', port: 4370 },
  { id: 'dev_office_192_168_13_7', name: 'Office Device', ip: '192.168.13.7', port: 4370 }
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
                  placeholder="e.g. Main Device / Factory Gate"
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
                    Model
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
                    placeholder="MB2000-MAIN-8392"
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Auto-Sync Interval
                </label>
                <select
                  value={formData.autoSyncMinutes}
                  onChange={(e) => setFormData({ ...formData, autoSyncMinutes: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
                >
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
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Connection Diagnostic: Cloud HRIS Listener Active</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  Target device <span className="font-bold">{diagnosticDevice.model}</span> at <code className="font-mono">{diagnosticDevice.ip}</code> is configured.
                </p>
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
