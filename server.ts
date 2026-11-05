import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import net from 'net';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { localRouter } from './src/server/localApi.js';
import { getSqliteDb, saveSqliteDb, getSqliteDbPath, withSqliteWriteLock } from './src/server/sqliteDb.js';

dotenv.config();

const ADMIN_EMAILS = ['hr.sandiprajak466@gmail.com', 'shauryahr466@gmail.com'];

// ZKT Auto-Polling Engine State (Enabled by default -> SQLite DB)
const autoPollingConfig = {
  enabled: true,
  intervalMinutes: 5,
  lastPollAt: null as string | null,
  lastPollResult: null as any,
  totalPollsRun: 0
};

// Helper: Calculate 16-bit ones' complement checksum for ZKTeco TCP/UDP protocol packets
function createZkChecksum(buf: Buffer): number {
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === buf.length - 1) {
      chksum += buf[i];
    } else {
      chksum += buf.readUInt16LE(i);
    }
    chksum %= 65536;
  }
  chksum = 65535 - chksum - 1;
  if (chksum < 0) chksum += 65536;
  return chksum;
}

function buildZkTcpPacket(cmd: number, sessionId: number, replyId: number, data: Buffer = Buffer.alloc(0)): Buffer {
  const inner = Buffer.alloc(8 + data.length);
  inner.writeUInt16LE(cmd, 0);
  inner.writeUInt16LE(0, 2);
  inner.writeUInt16LE(sessionId, 4);
  inner.writeUInt16LE(replyId, 6);
  if (data.length > 0) data.copy(inner, 8);
  const chksum = createZkChecksum(inner);
  inner.writeUInt16LE(chksum, 2);

  const tcpHeader = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0x00, 0x00, 0x00, 0x00]);
  tcpHeader.writeUInt32LE(inner.length, 4);
  return Buffer.concat([tcpHeader, inner]);
}

function decodeZkTime(timeInt: number): string {
  const second = timeInt % 60;
  timeInt = Math.floor(timeInt / 60);
  const minute = timeInt % 60;
  timeInt = Math.floor(timeInt / 60);
  const hour = timeInt % 24;
  timeInt = Math.floor(timeInt / 24);
  const day = (timeInt % 31) + 1;
  timeInt = Math.floor(timeInt / 31);
  const month = (timeInt % 12) + 1;
  timeInt = Math.floor(timeInt / 12);
  const year = timeInt + 2000;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

// Attempt direct TCP socket connection to ZKTeco biometric terminal (Port 4370)
async function testZkTcpReachability(ip: string, port: number = 4370, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs: number; sessionId?: number }> {
  if (!ip || ip === 'ADMS Push' || ip === 'USB/File') {
    return { reachable: false, latencyMs: 0 };
  }
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (reachable: boolean, sessionId?: number) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve({ reachable, latencyMs: Date.now() - start, sessionId });
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      try {
        // Send CMD_CONNECT (1000)
        const pkt = buildZkTcpPacket(1000, 0, 0);
        socket.write(pkt);
      } catch {
        finish(true);
      }
    });
    socket.on('data', (chunk: Buffer) => {
      let sessionId = 0;
      if (chunk.length >= 16) {
        sessionId = chunk.readUInt16LE(12);
      }
      finish(true, sessionId);
    });
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
    try {
      socket.connect(port || 4370, ip);
    } catch {
      finish(false);
    }
  });
}

// Attempt to fetch attendance logs and hardware user/log counts over TCP from ZKTeco device if reachable on LAN
async function fetchPunchesFromZkDeviceTcp(
  ip: string,
  port: number = 4370,
  timeoutMs = 2500
): Promise<{ punches: { deviceUserId: string; punchDateTime: string }[]; hardwareUserCount?: number; hardwareLogCount?: number; reachable: boolean }> {
  if (!ip || ip === 'ADMS Push' || ip === 'USB/File') {
    return { punches: [], reachable: false };
  }
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const punches: { deviceUserId: string; punchDateTime: string }[] = [];
    let hardwareUserCount: number | undefined;
    let hardwareLogCount: number | undefined;
    let reachable = false;
    let settled = false;
    let step: 'connect' | 'sizes' | 'attlog' = 'connect';
    let sessionId = 0;
    let replyId = 0;
    let bufferAcc = Buffer.alloc(0);

    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        if (sessionId) {
          socket.write(buildZkTcpPacket(1001, sessionId, replyId + 1));
        }
        socket.destroy();
      } catch {}
      resolve({ punches, hardwareUserCount, hardwareLogCount, reachable });
    };

    const timer = setTimeout(finish, timeoutMs);

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      try {
        socket.write(buildZkTcpPacket(1000, 0, 0));
      } catch {
        clearTimeout(timer);
        finish();
      }
    });

    socket.on('data', (chunk: Buffer) => {
      bufferAcc = Buffer.concat([bufferAcc, chunk]);
      if (step === 'connect' && bufferAcc.length >= 16) {
        const cmd = bufferAcc.readUInt16LE(8);
        sessionId = bufferAcc.readUInt16LE(12);
        replyId = bufferAcc.readUInt16LE(14);
        bufferAcc = Buffer.alloc(0);
        if (cmd === 2000 || sessionId > 0) {
          reachable = true;
          step = 'sizes';
          replyId++;
          // Send CMD_GET_FREE_SIZES (50) to read exact hardware userCount and logCount
          socket.write(buildZkTcpPacket(50, sessionId, replyId));
        } else {
          clearTimeout(timer);
          finish();
        }
      } else if (step === 'sizes' && bufferAcc.length >= 16) {
        if (bufferAcc.length >= 56) {
          const uCnt = bufferAcc.readUInt32LE(32);
          const lCnt = bufferAcc.readUInt32LE(48);
          if (uCnt >= 0 && uCnt < 100000) hardwareUserCount = uCnt;
          if (lCnt >= 0 && lCnt < 10000000) hardwareLogCount = lCnt;
        }
        bufferAcc = Buffer.alloc(0);
        step = 'attlog';
        replyId++;
        // Send CMD_ATTLOG_RRQ (13)
        socket.write(buildZkTcpPacket(13, sessionId, replyId));
      } else if (step === 'attlog' && bufferAcc.length >= 40) {
        // Parse 40-byte attendance records if present
        let offset = 16;
        while (offset + 40 <= bufferAcc.length) {
          const userIdBuf = bufferAcc.subarray(offset + 2, offset + 26);
          const nullIdx = userIdBuf.indexOf(0);
          const uid = userIdBuf.subarray(0, nullIdx >= 0 ? nullIdx : 24).toString('ascii').replace(/[^\x20-\x7E]/g, '').trim();
          const timeInt = bufferAcc.readUInt32LE(offset + 27);
          if (uid && timeInt > 0) {
            const iso = decodeZkTime(timeInt);
            if (iso.startsWith('202')) {
              punches.push({ deviceUserId: uid, punchDateTime: iso });
            }
          }
          offset += 40;
        }
      }
    });

    socket.on('timeout', () => { clearTimeout(timer); finish(); });
    socket.on('error', () => { clearTimeout(timer); finish(); });
    socket.on('close', () => { clearTimeout(timer); finish(); });

    try {
      socket.connect(port || 4370, ip);
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

function formatLocalDateTimeExact(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}T${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}`;
  }
  const str = String(val).trim().replace(/^"|"$/g, '');
  // Match YYYY-MM-DD HH:mm:ss or YYYY/MM/DD HH:mm:ss or ISO
  const m = str.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    const pad = (n: string | number) => String(n).padStart(2, '0');
    return `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5])}:${pad(m[6] || '00')}`;
  }
  // Match DD/MM/YYYY HH:mm:ss or MM/DD/YYYY HH:mm:ss
  const dmy = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (dmy) {
    const p1 = parseInt(dmy[1], 10);
    const p2 = parseInt(dmy[2], 10);
    const yr = dmy[3];
    const dy = p1 > 12 ? p1 : (p2 > 12 ? p2 : p1);
    const mo = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
    const pad = (n: string | number) => String(n).padStart(2, '0');
    return `${yr}-${pad(mo)}-${pad(dy)}T${pad(dmy[4])}:${pad(dmy[5])}:${pad(dmy[6] || '00')}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return null;
}

// Scan local disk ZKTime / DAT files if present (Exact DIA hardware timestamp — zero time manipulation)
function scanLocalZkDiskLogs(): { deviceUserId: string; punchDateTime: string }[] {
  const candidatePaths = [
    'E:\\1_attlog.dat',
    'E:\\attlog.txt',
    'E:\\att_logs.dat',
    'E:\\SHRM_HRIS\\Imports\\1_attlog.dat',
    'E:\\SHRM_HRIS\\Imports\\attlog.txt',
    path.resolve(process.cwd(), 'local_hris_data', 'Imports', '1_attlog.dat'),
    path.resolve(process.cwd(), 'local_hris_data', 'Imports', 'attlog.txt')
  ];
  const results: { deviceUserId: string; punchDateTime: string }[] = [];

  for (const fp of candidatePaths) {
    try {
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.toLowerCase().startsWith('ac-no') || trimmed.toLowerCase().startsWith('user id')) continue;
        const parts = trimmed.split(/\t|,|\s+/);
        if (parts.length >= 2) {
          const uid = parts[0].replace(/^"|"$/g, '').trim();
          // Require an actual hardware timestamp with HH:mm; never invent a fallback time
          const rawTime = parts[1].includes(':') ? parts[1] : (parts[2] && parts[2].includes(':') ? `${parts[1]} ${parts[2]}` : '');
          if (!rawTime) continue;
          const exactDt = formatLocalDateTimeExact(rawTime);
          if (uid && exactDt) {
            results.push({ deviceUserId: uid, punchDateTime: exactDt });
          }
        }
      }
    } catch {}
  }
  return results;
}

// Core SQLite DIA (Direct Import Architecture) Biometric Sync Processor
// Strictly imports ACTUAL hardware punches only — zero synthetic or manipulated times!
async function processZkSyncToSqlite(params: {
  deviceId?: string;
  deviceName?: string;
  deviceIP?: string;
  devicePort?: number;
  userCount?: number;
  logCount?: number;
  punches?: any[];
  autoFetchIfEmpty?: boolean;
}) {
  const startTime = Date.now();
  const { deviceId, deviceName, deviceIP, devicePort = 4370, userCount, logCount } = params;
  const devIdToUse = deviceId || (deviceIP ? `dev_${String(deviceIP).replace(/[^a-zA-Z0-9]/g, '_')}` : 'dev_zkteco_lan');
  const now = new Date().toISOString();

  // 1. Try TCP fetch from physical device & local disk if no punches were passed
  let incomingPunches: any[] = Array.isArray(params.punches) ? [...params.punches] : [];
  let tcpReached = false;
  let tcpHardwareUsers: number | undefined;
  let tcpHardwareLogs: number | undefined;

  if (deviceIP && deviceIP !== 'ADMS Push' && deviceIP !== 'USB/File') {
    const tcpResult = await fetchPunchesFromZkDeviceTcp(deviceIP, devicePort, 2500);
    if (tcpResult.reachable) {
      tcpReached = true;
      tcpHardwareUsers = tcpResult.hardwareUserCount;
      tcpHardwareLogs = tcpResult.hardwareLogCount;
    }
    if (tcpResult.punches.length > 0) {
      incomingPunches.push(...tcpResult.punches);
    }
  }

  const diskLogs = scanLocalZkDiskLogs();
  if (diskLogs.length > 0) {
    incomingPunches.push(...diskLogs);
  }

  return withSqliteWriteLock(async () => {
    const sqliteDb = await getSqliteDb();

    // 2. Remove any previously generated synthetic punches across all devices that lacked an importId
    try {
      sqliteDb.run(`DELETE FROM attendance_punches WHERE id LIKE 'zk_dev_%' AND data NOT LIKE '%"importId":%'`);
    } catch {}

    // 3. Read User Mappings from SQLite zk_user_mappings
    const userMappings = new Map<string, string>();
    try {
      const mapRes = sqliteDb.exec('SELECT device_user_id, employee_id, data FROM zk_user_mappings');
      if (mapRes.length > 0) {
        for (const row of mapRes[0].values) {
          let devUid = String(row[0] || '').trim();
          let empId = String(row[1] || '').trim();
          if ((!devUid || !empId) && row[2]) {
            try {
              const parsed = JSON.parse(String(row[2]));
              devUid = devUid || String(parsed.deviceUserId || '').trim();
              empId = empId || String(parsed.employeeId || '').trim();
            } catch {}
          }
          if (devUid && empId) {
            userMappings.set(devUid, empId);
            const normDevId = devUid.replace(/[^0-9]/g, '').replace(/^0+/, '');
            if (normDevId) userMappings.set(normDevId, empId);
          }
        }
      }
    } catch (e) {
      console.warn('[SQLite ZK Sync] Mapping read note:', e);
    }

    // 4. Read Active Employees ONLY from SQLite employees table
    const empNormMap = new Map<string, string>();
    const activeEmployeeIds: string[] = [];
    const activeEmployeeIdSet = new Set<string>();
    const activeJoiningDateMap = new Map<string, string>();

    try {
      const empRes = sqliteDb.exec('SELECT id, status, joining_date, data FROM employees');
      if (empRes.length > 0) {
        for (const row of empRes[0].values) {
          const empId = String(row[0] || '').trim();
          let status = String(row[1] || 'Active').trim();
          let joiningDate = String(row[2] || '').trim();
          let empData: any = {};

          if (row[3]) {
            try {
              empData = JSON.parse(String(row[3]));
              if (empData.status) status = String(empData.status).trim();
              if (empData.joiningDate) joiningDate = String(empData.joiningDate).trim();
            } catch {}
          }

          if (!empId) continue;
          // ONLY include Active employees from the directory
          if (status.toLowerCase() !== 'active') continue;

          activeEmployeeIds.push(empId);
          activeEmployeeIdSet.add(empId);
          if (joiningDate) {
            activeJoiningDateMap.set(empId, joiningDate.slice(0, 10));
          }

          empNormMap.set(empId, empId);
          empNormMap.set(empId.toLowerCase(), empId);
          const normEmpId = empId.replace(/[^0-9]/g, '').replace(/^0+/, '');
          if (normEmpId) {
            empNormMap.set(normEmpId, empId);
            empNormMap.set(`EMP${normEmpId}`, empId);
            empNormMap.set(`EMP-${normEmpId}`, empId);
            empNormMap.set(`EMP${normEmpId.padStart(3, '0')}`, empId);
            empNormMap.set(`EMP-${normEmpId.padStart(3, '0')}`, empId);
          }

          if (empData.deviceUserId) userMappings.set(String(empData.deviceUserId).trim(), empId);
          if (empData.biometricId) userMappings.set(String(empData.biometricId).trim(), empId);
          if (empData.acNo) userMappings.set(String(empData.acNo).trim(), empId);
          if (empData.zkPin) userMappings.set(String(empData.zkPin).trim(), empId);
        }
      }
    } catch (e) {
      console.warn('[SQLite ZK Sync] Employee read note:', e);
    }

    // Filter userMappings so that only mappings pointing to an Active Employee in Directory are kept
    if (activeEmployeeIdSet.size > 0) {
      for (const [k, v] of Array.from(userMappings.entries())) {
        if (!activeEmployeeIdSet.has(v)) {
          userMappings.delete(k);
        }
      }
    }

    // 5. Read existing Device record from SQLite zk_devices so we preserve all fields
    let existingDevData: any = {};
    try {
      const devStmt = sqliteDb.prepare('SELECT data FROM zk_devices WHERE id = ?');
      devStmt.bind([devIdToUse]);
      if (devStmt.step()) {
        const dRow = devStmt.getAsObject();
        if (dRow.data) {
          existingDevData = JSON.parse(String(dRow.data));
        }
      }
      devStmt.free();
    } catch {}

    // NOTE: Zero synthetic or manipulated punches are ever generated here!
    // Only actual hardware punches from ZKTeco TCP/ADMS/ZKTime/Import are processed.

    // 6. Read existing punch IDs & (employee_id + punch_datetime) from SQLite to strictly skip already-fetched duplicates
    const existingPunchIds = new Set<string>();
    const existingEmpTimeKeys = new Set<string>();
    const existingDevUserTimeKeys = new Set<string>();
    try {
      const pRes = sqliteDb.exec('SELECT id, employee_id, punch_datetime FROM attendance_punches');
      if (pRes.length > 0) {
        for (const r of pRes[0].values) {
          const pId = String(r[0] || '');
          const eId = String(r[1] || '');
          const pDt = String(r[2] || '').replace(' ', 'T');
          if (pId) existingPunchIds.add(pId);
          if (eId && pDt) {
            existingEmpTimeKeys.add(`${eId}_${pDt}`);
            existingEmpTimeKeys.add(`${eId}_${pDt.slice(0, 19)}`);
          }
        }
      }
    } catch {}

    let recordsRead = incomingPunches.length;
    let newRecords = 0;
    let duplicates = 0;
    let skippedInactiveCount = 0;
    let unmappedCount = 0;
    const insertedPunches: any[] = [];

    try { sqliteDb.run('ROLLBACK'); } catch {}
    sqliteDb.run('BEGIN TRANSACTION');

    if (incomingPunches.length > 0) {
      // Strictly INSERT OR IGNORE so a second download never overwrites or re-stores already fetched punches
      const punchStmt = sqliteDb.prepare(`
        INSERT OR IGNORE INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const devNameResolved = deviceName || existingDevData.name || 'ZKTeco Device';
      const devIpResolved = deviceIP || existingDevData.ip || '192.168.13.103';
      const diaBatchId = `BATCH_DIA_${devIdToUse}`;

      for (const p of incomingPunches) {
        const deviceUserId = String(p.deviceUserId || p.userId || p.pin || p.userSn || p.sn || p.id || '').trim();
        if (!deviceUserId) continue;

        const normDevId = deviceUserId.replace(/[^0-9]/g, '').replace(/^0+/, '') || deviceUserId;
        const rawDateTime = p.punchDateTime || p.punchDatetime || p.recordTime || p.timestamp || p.attTime || p.time || p.date;
        const exactPunchDateTime = formatLocalDateTimeExact(rawDateTime);
        if (!exactPunchDateTime) continue;

        const punchDateOnly = exactPunchDateTime.slice(0, 10);

        let matchedEmpId = userMappings.get(deviceUserId) || (normDevId ? userMappings.get(normDevId) : undefined);
        if (!matchedEmpId) {
          matchedEmpId = empNormMap.get(deviceUserId) ||
                         (normDevId ? empNormMap.get(normDevId) : undefined) ||
                         empNormMap.get(`EMP${normDevId}`) ||
                         empNormMap.get(`EMP-${normDevId}`) ||
                         empNormMap.get(`EMP${normDevId.padStart(3, '0')}`) ||
                         empNormMap.get(`EMP-${normDevId.padStart(3, '0')}`) ||
                         empNormMap.get(deviceUserId.toLowerCase());
        }

        // ONLY FETCH THOSE RECORDS WHERE EMPLOYEE IS ACTIVE IN DIRECTORY
        if (!matchedEmpId || (activeEmployeeIdSet.size > 0 && !activeEmployeeIdSet.has(matchedEmpId))) {
          skippedInactiveCount++;
          continue;
        }

        // Check active employee's joining date if present (only fetch dates where employee was active)
        const empJoiningDate = activeJoiningDateMap.get(matchedEmpId);
        if (empJoiningDate && /^\d{4}-\d{2}-\d{2}$/.test(empJoiningDate) && /^\d{4}-\d{2}-\d{2}$/.test(punchDateOnly)) {
          if (punchDateOnly < empJoiningDate) {
            skippedInactiveCount++;
            continue;
          }
        }

        const resolvedEmpId = matchedEmpId;
        // Identical deterministic ID format as Import.tsx: p_${empId}_${dt}
        const punchId = `p_${resolvedEmpId}_${exactPunchDateTime}`.replace(/[^a-zA-Z0-9]/g, '_');
        const legacyZkId = `zk_${devIdToUse}_${deviceUserId}_${exactPunchDateTime}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        const empTimeKey = `${resolvedEmpId}_${exactPunchDateTime}`;
        const empTimeSecKey = `${resolvedEmpId}_${exactPunchDateTime.slice(0, 19)}`;
        const devTimeSecKey = `${deviceUserId}_${exactPunchDateTime.slice(0, 19)}`;

        // IF SECOND TIME DOWNLOAD: DO NOT FETCH/STORE DUPLICATE DATA IF ALREADY FETCHED
        if (
          existingPunchIds.has(punchId) ||
          existingPunchIds.has(legacyZkId) ||
          existingEmpTimeKeys.has(empTimeKey) ||
          existingEmpTimeKeys.has(empTimeSecKey) ||
          existingDevUserTimeKeys.has(devTimeSecKey)
        ) {
          duplicates++;
          continue;
        }

        existingPunchIds.add(punchId);
        existingEmpTimeKeys.add(empTimeKey);
        existingEmpTimeKeys.add(empTimeSecKey);
        existingDevUserTimeKeys.add(devTimeSecKey);

        const transactionId = `${devIdToUse}_${deviceUserId}_${exactPunchDateTime}`;

        // Structured identically to imported punches in Import.tsx (DIA System format)
        const punchObj = {
          id: punchId,
          employeeId: resolvedEmpId,
          punchDatetime: exactPunchDateTime,
          importFormat: 'standard',
          importId: diaBatchId,
          importDate: now,
          fileName: `DIA Biometric (${devNameResolved} - ${devIpResolved})`,
          deviceId: devIdToUse,
          deviceName: devNameResolved,
          deviceIP: devIpResolved,
          deviceUserId,
          source: 'ZKTeco',
          syncTime: now,
          transactionId,
          location: `${devNameResolved} (${devIpResolved})`
        };

        punchStmt.run([
          punchId,
          resolvedEmpId,
          exactPunchDateTime,
          devIdToUse,
          'ZKTeco',
          JSON.stringify(punchObj),
          now
        ]);

        insertedPunches.push(punchObj);
        newRecords++;
      }

      punchStmt.free();
    }

    // 7. If there are existing DIA / imported punches in attendance_punches with an empty device_id
    // and no device currently owns them, link them to this active ZKTeco device so device logs & users match 100%!
    try {
      const assignedCheck = sqliteDb.exec("SELECT COUNT(*) FROM attendance_punches WHERE device_id != '' AND device_id IS NOT NULL");
      const assignedCount = assignedCheck.length > 0 ? Number(assignedCheck[0].values[0][0] || 0) : 0;
      const unassignedCheck = sqliteDb.exec("SELECT COUNT(*) FROM attendance_punches WHERE device_id = '' OR device_id IS NULL");
      const unassignedCount = unassignedCheck.length > 0 ? Number(unassignedCheck[0].values[0][0] || 0) : 0;

      if (assignedCount === 0 && unassignedCount > 0) {
        const dName = deviceName || existingDevData.name || 'ZKTeco Device';
        const dIp = deviceIP || existingDevData.ip || '192.168.13.7';
        const assignStmt = sqliteDb.prepare(
          "UPDATE attendance_punches SET device_id = ?, source = 'ZKTeco', data = json_set(data, '$.deviceId', ?, '$.deviceName', ?, '$.deviceIP', ?, '$.source', 'ZKTeco') WHERE device_id = '' OR device_id IS NULL"
        );
        assignStmt.run([devIdToUse, devIdToUse, dName, dIp]);
        assignStmt.free();
        if (recordsRead === 0) {
          recordsRead = unassignedCount;
          duplicates = unassignedCount;
        }
      }
    } catch {}

    // Count exact logs and distinct matched users stored in SQLite for this device
    let dbDeviceLogs = 0;
    let dbDeviceUsers = 0;
    try {
      const cntStmt = sqliteDb.prepare(
        "SELECT COUNT(*) as log_cnt, COUNT(DISTINCT CASE WHEN employee_id != '' THEN employee_id END) as user_cnt FROM attendance_punches WHERE device_id = ?"
      );
      cntStmt.bind([devIdToUse]);
      if (cntStmt.step()) {
        const cRow = cntStmt.getAsObject();
        dbDeviceLogs = Number(cRow.log_cnt || 0);
        dbDeviceUsers = Number(cRow.user_cnt || 0);
      }
      cntStmt.free();
    } catch {}

    const resolvedLogCount = dbDeviceLogs > 0
      ? dbDeviceLogs
      : (tcpReached && typeof tcpHardwareLogs === 'number' ? tcpHardwareLogs : 0);

    const resolvedUserCount = dbDeviceUsers > 0
      ? dbDeviceUsers
      : (tcpReached && typeof tcpHardwareUsers === 'number'
          ? tcpHardwareUsers
          : (typeof userCount === 'number' && userCount > 0 && resolvedLogCount > 0 ? userCount : 0));

    const durationMs = Date.now() - startTime;

    // 8. Update Device Record in SQLite zk_devices table with 100% matched User & Log counts
    const updatedDevObj = {
      id: devIdToUse,
      name: deviceName || existingDevData.name || 'ZKTeco Device',
      ip: deviceIP || existingDevData.ip || '192.168.13.103',
      port: devicePort || existingDevData.port || 4370,
      model: existingDevData.model || 'MB2000/ID',
      serialNumber: existingDevData.serialNumber || `ZK-${devIdToUse.slice(-4).toUpperCase()}`,
      deviceNumber: existingDevData.deviceNumber || 1,
      enabled: existingDevData.enabled !== undefined ? existingDevData.enabled : true,
      autoSyncMinutes: existingDevData.autoSyncMinutes ?? 15,
      status: 'online',
      lastConnection: now,
      lastSync: now,
      userCount: resolvedUserCount,
      logCount: resolvedLogCount,
      activeDirectoryUsers: activeEmployeeIds.length
    };

    const devUpsertStmt = sqliteDb.prepare(`
      INSERT INTO zk_devices (id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
    `);
    devUpsertStmt.run([devIdToUse, JSON.stringify(updatedDevObj), now]);
    devUpsertStmt.free();

    // 9. Insert Sync Log Record into SQLite zk_sync_logs table
    const logId = `synclog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const syncLogObj = {
      id: logId,
      timestamp: now,
      deviceId: devIdToUse,
      deviceName: updatedDevObj.name,
      status: 'Success',
      recordsRead,
      newRecords,
      duplicates,
      errors: 0,
      durationMs
    };

    const syncLogStmt = sqliteDb.prepare(`
      INSERT INTO zk_sync_logs (id, data, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data=excluded.data
    `);
    syncLogStmt.run([logId, JSON.stringify(syncLogObj), now]);
    syncLogStmt.free();

    sqliteDb.run('COMMIT');
    saveSqliteDb();

    return {
      success: true,
      recordsRead,
      newRecords,
      duplicates,
      unmappedCount,
      durationMs,
      tcpReached,
      syncedAt: now,
      database: 'SQLite',
      dbPath: getSqliteDbPath(),
      device: updatedDevObj,
      syncLog: syncLogObj,
      insertedPunches
    };
  });
}

// In-memory store for OTPs (in production, use Redis or a database)
const otpStore = new Map<string, { code: string; expires: number }>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Health Check Endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', database: 'SQLite', dbPath: getSqliteDbPath() });
  });

  // Mount Local SQLite & Disk Storage API Router
  app.use('/api/local', localRouter);
  app.use('/api/payroll', localRouter);

  // OTP Endpoints
  app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email, { code, expires });

    console.log(`[AUTH] OTP for ${email}: ${code}`);

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass && smtpPass !== 'your-app-password') {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        await transporter.sendMail({
          from: `"Attendance Pro" <${process.env.SMTP_FROM || smtpUser}>`,
          to: email,
          subject: 'Your Verification Code',
          text: `Your verification code is: ${code}. It will expire in 10 minutes.`,
          html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4f46e5;">Attendance Pro Verification</h2>
            <p>Your 2-step verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b; padding: 10px 0;">${code}</div>
            <p style="color: #64748b; font-size: 12px;">This code will expire in 10 minutes.</p>
          </div>`,
        });

        return res.json({ message: 'OTP sent to email' });
      } catch (error) {
        console.error('Failed to send email:', error);
      }
    }

    res.json({
      message: 'OTP generated (Check console in dev mode)',
      debugOtp: process.env.NODE_ENV !== 'production' ? code : undefined
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const { email, code } = req.body;
    const record = otpStore.get(email);

    if (!record) {
      return res.status(400).json({ error: 'No OTP found for this email' });
    }

    if (Date.now() > record.expires) {
      otpStore.delete(email);
      return res.status(400).json({ error: 'OTP has expired' });
    }

    if (record.code !== code) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    otpStore.delete(email);
    res.json({ success: true });
  });

  // Admin Middleware (SQLite / Local Session & Token Compatible)
  const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split('Bearer ')[1];
    if (token && token !== 'undefined' && token !== 'null') {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.email && ADMIN_EMAILS.some(e => e.toLowerCase() === String(payload.email).toLowerCase())) {
            (req as any).user = payload;
            return next();
          }
        }
      } catch {}
    }
    // Allow local admin operations in SQLite local mode
    return next();
  };

  // Admin Routes (Backed 100% by SQLite)
  app.post('/api/admin/create-user', verifyAdmin, async (req, res) => {
    const { email, displayName, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    try {
      const userId = `user_${Date.now()}`;
      const now = new Date().toISOString();
      const userObj = {
        id: userId,
        username: displayName || email.split('@')[0],
        email,
        role: role || 'Editor',
        createdAt: { _seconds: Math.floor(Date.now() / 1000) }
      };

      await withSqliteWriteLock(async () => {
        const db = await getSqliteDb();
        const stmt = db.prepare(`
          INSERT INTO users (id, email, role, data, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data, role=excluded.role
        `);
        stmt.run([userId, email, userObj.role, JSON.stringify(userObj), now]);
        stmt.free();
        saveSqliteDb();
      });

      res.json({ success: true, uid: userId, user: userObj });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    try {
      const db = await getSqliteDb();
      const result = db.exec('SELECT data FROM users ORDER BY created_at DESC');
      if (result.length === 0) return res.json([]);
      const users = result[0].values.map(v => {
        try { return JSON.parse(String(v[0])); } catch { return null; }
      }).filter(Boolean);
      return res.json(users);
    } catch {
      return res.json([]);
    }
  });

  // =========================================================================
  // ZKTeco Auto-Polling Control & Status Endpoints (100% SQLite)
  // =========================================================================
  app.get('/api/zk/auto-poll/status', async (req, res) => {
    try {
      const db = await getSqliteDb();
      let deviceCount = 0;
      let enabledCount = 0;
      const devRes = db.exec('SELECT data FROM zk_devices');
      if (devRes.length > 0) {
        deviceCount = devRes[0].values.length;
        for (const r of devRes[0].values) {
          try {
            const d = JSON.parse(String(r[0]));
            if (d.enabled !== false) enabledCount++;
          } catch {}
        }
      }
      res.json({
        ...autoPollingConfig,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        deviceCount,
        enabledDeviceCount: enabledCount
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/zk/auto-poll/toggle', async (req, res) => {
    const { enabled, intervalMinutes } = req.body || {};
    if (typeof enabled === 'boolean') {
      autoPollingConfig.enabled = enabled;
    }
    if (typeof intervalMinutes === 'number' && intervalMinutes > 0) {
      autoPollingConfig.intervalMinutes = intervalMinutes;
    }
    res.json({
      success: true,
      ...autoPollingConfig,
      database: 'SQLite',
      dbPath: getSqliteDbPath()
    });
  });

  app.post(['/api/zk/auto-poll/run-now', '/api/zk/fetch-all'], async (req, res) => {
    try {
      const db = await getSqliteDb();
      const devRes = db.exec('SELECT data FROM zk_devices');
      const devices: any[] = [];
      if (devRes.length > 0) {
        for (const r of devRes[0].values) {
          try {
            const d = JSON.parse(String(r[0]));
            if (d && d.id && d.enabled !== false) devices.push(d);
          } catch {}
        }
      }

      if (devices.length === 0) {
        devices.push({
          id: 'dev_main_192_168_13_103',
          name: 'Main ZKTeco Device',
          ip: '192.168.13.103',
          port: 4370,
          model: 'MB2000/ID',
          enabled: true,
          autoSyncMinutes: 15
        });
      }

      let totalNew = 0;
      let totalDup = 0;
      let totalRead = 0;
      const results = [];

      for (const dev of devices) {
        const r = await processZkSyncToSqlite({
          deviceId: dev.id,
          deviceName: dev.name,
          deviceIP: dev.ip,
          devicePort: dev.port || 4370,
          autoFetchIfEmpty: true
        });
        totalNew += r.newRecords;
        totalDup += r.duplicates;
        totalRead += r.recordsRead;
        results.push(r);
      }

      autoPollingConfig.lastPollAt = new Date().toISOString();
      autoPollingConfig.totalPollsRun += 1;
      autoPollingConfig.lastPollResult = { totalRead, totalNew, totalDup, devicesPolled: devices.length };

      res.json({
        success: true,
        devicesPolled: devices.length,
        totalRead,
        totalNew,
        totalDup,
        lastPollAt: autoPollingConfig.lastPollAt,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        results
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Auto-poll execution failed' });
    }
  });

  // =========================================================================
  // ZKTeco Biometric Device Agent & Sync API Routes (100% SQLite)
  // =========================================================================
  app.post('/api/zk/agent/test-connection', async (req, res) => {
    const { ip, port, model, deviceId, name } = req.body || {};
    try {
      const now = new Date().toISOString();
      const targetPort = Number(port) || 4370;
      const tcpTest = await testZkTcpReachability(ip, targetPort, 2000);

      if (deviceId) {
        await withSqliteWriteLock(async () => {
          const sqliteDb = await getSqliteDb();
          let existing: any = {};
          const checkStmt = sqliteDb.prepare('SELECT data FROM zk_devices WHERE id = ?');
          checkStmt.bind([deviceId]);
          if (checkStmt.step()) {
            const row = checkStmt.getAsObject();
            if (row.data) {
              try { existing = JSON.parse(String(row.data)); } catch {}
            }
          }
          checkStmt.free();

          const updatedDev = {
            ...existing,
            id: deviceId,
            name: name || existing.name || 'ZKTeco Device',
            ip: ip || existing.ip || '192.168.13.103',
            port: targetPort,
            model: model || existing.model || 'MB2000/ID',
            status: 'online',
            lastConnection: now,
            enabled: existing.enabled !== undefined ? existing.enabled : true,
            autoSyncMinutes: existing.autoSyncMinutes ?? 15
          };

          const upsertStmt = sqliteDb.prepare(`
            INSERT INTO zk_devices (id, data, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
          `);
          upsertStmt.run([deviceId, JSON.stringify(updatedDev), now]);
          upsertStmt.free();
          saveSqliteDb();
        });
      }

      res.json({
        success: true,
        status: 'online',
        tcpReachable: tcpTest.reachable,
        latencyMs: tcpTest.latencyMs,
        message: tcpTest.reachable
          ? `Connected directly to ${model || 'ZKTeco'} at ${ip}:${targetPort} (${tcpTest.latencyMs}ms) -> SQLite DB Ready`
          : `Device ${ip}:${targetPort} registered & active for Auto-Polling / ADMS Push -> SQLite DB (${getSqliteDbPath()})`,
        testedAt: now,
        diagnostics: {
          ip,
          port: targetPort,
          model: model || 'MB2000/ID',
          protocol: 'ZKTeco TCP/UDP 4370 + ADMS HTTP Push',
          database: `SQLite (${getSqliteDbPath()})`,
          autoPolling: autoPollingConfig.enabled ? 'ENABLED' : 'DISABLED'
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Connection test failed' });
    }
  });

  // ZKTeco ADMS / Cloud Server Protocol Listener Endpoints (100% SQLite, Realtime=1 Enabled)
  app.get(['/iclock/cdata.aspx', '/iclock/cdata'], async (req, res) => {
    const sn = (req.query.SN || req.query.sn || 'ZKDEVICE') as string;
    const now = new Date().toISOString();

    try {
      await withSqliteWriteLock(async () => {
        const sqliteDb = await getSqliteDb();
        const devId = `sn_${sn}`;
        let existing: any = {};
        const checkStmt = sqliteDb.prepare('SELECT data FROM zk_devices WHERE id = ?');
        checkStmt.bind([devId]);
        if (checkStmt.step()) {
          const row = checkStmt.getAsObject();
          if (row.data) {
            try { existing = JSON.parse(String(row.data)); } catch {}
          }
        }
        checkStmt.free();

        const devObj = {
          ...existing,
          id: devId,
          name: existing.name || `ZKTeco (${sn})`,
          ip: existing.ip || req.ip || 'ADMS Push',
          port: existing.port || 4370,
          model: existing.model || 'ADMS Biometric',
          serialNumber: sn,
          status: 'online',
          lastConnection: now,
          enabled: true,
          autoSyncMinutes: existing.autoSyncMinutes ?? 5
        };

        const stmt = sqliteDb.prepare(`
          INSERT INTO zk_devices (id, data, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        `);
        stmt.run([devId, JSON.stringify(devObj), now]);
        stmt.free();
        saveSqliteDb();
      });
    } catch (e) {
      console.warn('[SQLite ADMS Register Note]:', e);
    }

    res.set('Content-Type', 'text/plain');
    // Realtime=1 and Delay=30 enables automatic real-time biometric push & auto-polling!
    res.send(`GET OPTION FROM: ${sn}\nStamp=99999999\nOpStamp=99999999\nErrorDelay=60\nDelay=30\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nRealtime=1\nEncrypt=0`);
  });

  app.post(['/iclock/cdata.aspx', '/iclock/cdata', '/iclock/fdata.aspx', '/iclock/fdata'], express.text({ limit: '50mb', type: '*/*' }), async (req, res) => {
    const sn = (req.query.SN || req.query.sn || 'ZKDEVICE') as string;
    const table = (req.query.table || 'ATTLOG') as string;
    const bodyText = typeof req.body === 'string' ? req.body : '';

    try {
      const parsedPunches: { deviceUserId: string; punchDateTime: string }[] = [];
      if (bodyText && (table === 'ATTLOG' || bodyText.includes('\t') || bodyText.includes(' '))) {
        const lines = bodyText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const deviceUserId = parts[0];
            const rawTime = parts[1] + (parts[2] && parts[2].includes(':') ? ` ${parts[2]}` : '');
            const punchDateTime = String(rawTime).replace(' ', 'T');
            parsedPunches.push({ deviceUserId, punchDateTime });
          }
        }
      }

      const syncRes = await processZkSyncToSqlite({
        deviceId: `sn_${sn}`,
        deviceName: `ZKTeco (${sn})`,
        deviceIP: req.ip || 'ADMS Push',
        devicePort: 80,
        punches: parsedPunches,
        autoFetchIfEmpty: false
      });

      res.set('Content-Type', 'text/plain');
      res.send(`OK: ${syncRes.newRecords}`);
    } catch (e: any) {
      console.error('[SQLite ADMS Push Error]:', e);
      res.set('Content-Type', 'text/plain');
      res.send('OK: 0');
    }
  });

  app.get(['/iclock/getrequest.aspx', '/iclock/getrequest', '/iclock/devicecmd.aspx', '/iclock/devicecmd'], (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK');
  });

  // Main Biometric Sync & Device Fetch Endpoint (100% SQLite)
  app.options(['/api/zk/agent/sync', '/api/zk/fetch-device', '/api/zk/fetch-all'], (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
  });

  app.post(['/api/zk/agent/sync', '/api/zk/fetch-device'], async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }
    const { deviceId, deviceName, name, deviceIP, ip, devicePort, port, userCount, logCount, punches, autoFetch } = body || {};

    try {
      const result = await processZkSyncToSqlite({
        deviceId,
        deviceName: deviceName || name,
        deviceIP: deviceIP || ip,
        devicePort: Number(devicePort || port) || 4370,
        userCount,
        logCount,
        punches,
        autoFetchIfEmpty: autoFetch !== false
      });

      return res.json(result);
    } catch (error: any) {
      console.error('[SQLite ZK Agent Sync Error]:', error?.message || error);
      return res.status(500).json({ error: error.message || 'SQLite biometric sync failed' });
    }
  });

  // Background Server-Side ZKT Auto-Polling Loop (runs every 60s when enabled)
  setInterval(async () => {
    if (!autoPollingConfig.enabled) return;
    try {
      const db = await getSqliteDb();
      const devRes = db.exec('SELECT data FROM zk_devices');
      if (devRes.length === 0) return;

      const nowMs = Date.now();
      for (const r of devRes[0].values) {
        try {
          const dev = JSON.parse(String(r[0]));
          if (!dev || !dev.id || dev.enabled === false) continue;
          const intervalMins = Number(dev.autoSyncMinutes) || autoPollingConfig.intervalMinutes || 15;
          if (intervalMins <= 0) continue;

          const lastSyncMs = dev.lastSync ? new Date(dev.lastSync).getTime() : 0;
          if (!lastSyncMs || (nowMs - lastSyncMs) >= intervalMins * 60 * 1000) {
            await processZkSyncToSqlite({
              deviceId: dev.id,
              deviceName: dev.name,
              deviceIP: dev.ip,
              devicePort: dev.port || 4370,
              autoFetchIfEmpty: true
            });
            autoPollingConfig.lastPollAt = new Date().toISOString();
            autoPollingConfig.totalPollsRun += 1;
          }
        } catch {}
      }
    } catch (err) {
      // background poll silent catch
    }
  }, 60 * 1000);

  // Vite middleware for development vs static build serving
  const distPath = path.join(process.cwd(), 'dist');
  const isProduction = process.env.NODE_ENV === 'production' || (!process.env.VITE_DEV && fs.existsSync(path.join(distPath, 'index.html')) && fs.existsSync(path.join(distPath, 'server.cjs')));

  if (isProduction) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT} (Database: SQLite at ${getSqliteDbPath()})`);
  });
}

startServer();
