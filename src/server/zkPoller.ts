import fs from 'fs';
import path from 'path';
import { getSqliteDb, saveSqliteDb, getSqliteDbPath, getSanitizedRootFolder, withSqliteWriteLock, withReadOnlySqliteSnapshot, recordSystemError } from './sqliteDb.js';
import { fetchZkHardwareData, testZkHardwareConnection, ZkDeviceUser, ZkRawPunch } from './zkProtocol.js';
import { validateIncomingPunchesAgainstDb } from './holidayValidationService.js';
import { broadcastSseEvent } from './realtimeHub.js';

export interface ZkPollingStatus {
  enabled: boolean;
  readOnlyMode: boolean;
  intervalSeconds: number;
  intervalMinutes: number;
  isPollingNow: boolean;
  lastPollAt: string | null;
  lastPollResult: any;
  totalPollsRun: number;
  database: string;
  dbPath: string;
  lastObservedPunchCount?: number;
  lastObservedMaxPunchDatetime?: string | null;
  lastObservedDbMtimeMs?: number;
}

export const zkPollingState: ZkPollingStatus = {
  enabled: true,
  readOnlyMode: process.env.ZK_READ_ONLY_OBSERVER === 'true',
  intervalSeconds: 900,
  intervalMinutes: 15,
  isPollingNow: false,
  lastPollAt: null,
  lastPollResult: null,
  totalPollsRun: 0,
  database: 'SQLite',
  dbPath: getSqliteDbPath(),
  lastObservedPunchCount: undefined,
  lastObservedMaxPunchDatetime: null,
  lastObservedDbMtimeMs: 0
};

export function setZkCollectorMode(allowDirectWrite: boolean) {
  zkPollingState.readOnlyMode = !allowDirectWrite;
  return {
    readOnlyMode: zkPollingState.readOnlyMode,
    mode: zkPollingState.readOnlyMode ? 'READ_ONLY' : 'READ_WRITE'
  };
}

export async function detectExternalPunchChangesReadOnly(): Promise<{
  changed: boolean;
  punchCount: number;
  latestPunchDatetime: string | null;
  delta: number;
  dbMtimeMs: number;
  dbSize: number;
  readOnlyMode: boolean;
}> {
  const dbPath = getSqliteDbPath();
  let dbMtimeMs = 0;
  let dbSize = 0;
  try {
    if (fs.existsSync(dbPath)) {
      const st = fs.statSync(dbPath);
      dbMtimeMs = st.mtimeMs;
      dbSize = st.size;
    }
  } catch (err) {
    recordSystemError('zkPoller', err);
  }

  const snapshotResult = await withReadOnlySqliteSnapshot((db) => {
    let punchCount = 0;
    let latestPunchDatetime: string | null = null;
    try {
      const pRes = db.exec('SELECT COUNT(*), MAX(punch_datetime) FROM attendance_punches');
      if (pRes.length > 0 && pRes[0].values.length > 0) {
        punchCount = Number(pRes[0].values[0][0] || 0);
        latestPunchDatetime = pRes[0].values[0][1] ? String(pRes[0].values[0][1]) : null;
      }
    } catch {}
    return { punchCount, latestPunchDatetime };
  });

  const prevCount = zkPollingState.lastObservedPunchCount;
  const prevMaxDt = zkPollingState.lastObservedMaxPunchDatetime;
  const changed =
    prevCount !== undefined &&
    (snapshotResult.punchCount !== prevCount || snapshotResult.latestPunchDatetime !== prevMaxDt);

  const delta = prevCount !== undefined ? snapshotResult.punchCount - prevCount : 0;

  zkPollingState.lastObservedPunchCount = snapshotResult.punchCount;
  zkPollingState.lastObservedMaxPunchDatetime = snapshotResult.latestPunchDatetime;
  zkPollingState.lastObservedDbMtimeMs = dbMtimeMs;
  zkPollingState.lastPollAt = new Date().toISOString();
  zkPollingState.totalPollsRun += 1;
  zkPollingState.lastPollResult = {
    success: true,
    readOnlyMode: zkPollingState.readOnlyMode,
    polledAt: zkPollingState.lastPollAt,
    punchCount: snapshotResult.punchCount,
    latestPunchDatetime: snapshotResult.latestPunchDatetime,
    changed,
    delta
  };

  if (changed) {
    broadcastSseEvent('PunchSnapshotUpdated', {
      action: 'external_collector_update',
      punchCount: snapshotResult.punchCount,
      latestPunchDatetime: snapshotResult.latestPunchDatetime,
      delta,
      timestamp: zkPollingState.lastPollAt
    });
  }

  return {
    changed,
    punchCount: snapshotResult.punchCount,
    latestPunchDatetime: snapshotResult.latestPunchDatetime,
    delta,
    dbMtimeMs,
    dbSize,
    readOnlyMode: zkPollingState.readOnlyMode
  };
}

function ensureZkSchedulerTable(db: any) {
  db.run(`
    CREATE TABLE IF NOT EXISTS zk_scheduler_config (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      interval_minutes INTEGER NOT NULL DEFAULT 15,
      updated_at TEXT
    );
  `);
}

export async function loadZkSchedulerConfigFromSqlite(): Promise<{ enabled: boolean; intervalMinutes: number; intervalSeconds: number }> {
  const db = await getSqliteDb();
  try {
    ensureZkSchedulerTable(db);
    const res = db.exec("SELECT enabled, interval_minutes FROM zk_scheduler_config WHERE id = 'default' LIMIT 1");
    if (res.length > 0 && res[0].values.length > 0) {
      const enabled = Number(res[0].values[0][0]) !== 0;
      const rawMins = Number(res[0].values[0][1]);
      const intervalMinutes = Number.isFinite(rawMins) && rawMins >= 1 && rawMins <= 1440 ? Math.round(rawMins) : 15;
      zkPollingState.enabled = enabled;
      zkPollingState.intervalMinutes = intervalMinutes;
      zkPollingState.intervalSeconds = intervalMinutes * 60;
      return { enabled, intervalMinutes, intervalSeconds: intervalMinutes * 60 };
    }
  } catch (e) {
    console.warn('[ZKPoller] Scheduler config load note:', e);
  }
  zkPollingState.enabled = true;
  zkPollingState.intervalMinutes = 15;
  zkPollingState.intervalSeconds = 900;
  return { enabled: true, intervalMinutes: 15, intervalSeconds: 900 };
}

export async function saveZkSchedulerConfigToSqlite(config: { enabled?: boolean; intervalMinutes?: number }): Promise<{ enabled: boolean; intervalMinutes: number; intervalSeconds: number }> {
  return withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    ensureZkSchedulerTable(db);

    const nextEnabled = typeof config.enabled === 'boolean' ? config.enabled : zkPollingState.enabled;
    const rawMins = typeof config.intervalMinutes === 'number' && Number.isFinite(config.intervalMinutes)
      ? Math.round(config.intervalMinutes)
      : zkPollingState.intervalMinutes;
    const nextIntervalMinutes = Math.max(1, Math.min(1440, rawMins || 15));
    const now = new Date().toISOString();

    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(`
      INSERT INTO zk_scheduler_config (id, enabled, interval_minutes, updated_at)
      VALUES ('default', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        enabled=excluded.enabled,
        interval_minutes=excluded.interval_minutes,
        updated_at=excluded.updated_at
    `);
    stmt.run([nextEnabled ? 1 : 0, nextIntervalMinutes, now]);
    stmt.free();
    db.run('COMMIT');
    saveSqliteDb();

    zkPollingState.enabled = nextEnabled;
    zkPollingState.intervalMinutes = nextIntervalMinutes;
    zkPollingState.intervalSeconds = nextIntervalMinutes * 60;

    return {
      enabled: nextEnabled,
      intervalMinutes: nextIntervalMinutes,
      intervalSeconds: nextIntervalMinutes * 60
    };
  });
}

function normalizeEmpId(raw: string): string {
  const s = String(raw || '').trim();
  const digits = s.replace(/[^0-9]/g, '').replace(/^0+/, '');
  return digits || s.toLowerCase();
}

function parseWallClockMs(dt: string): number {
  const m = String(dt || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  return Date.UTC(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    parseInt(m[6] || '0', 10)
  );
}

export function normalizeZkDateTime(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}T${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`;
  }
  const s = String(raw).trim().replace(/^"|"$/g, '');
  if (!s) return null;

  // Preserve exact hardware wall-clock YYYY-MM-DD[T ]HH:mm:ss(.000Z)?
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss = '00'] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh.padStart(2, '0')}:${mm}:${ss.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or MM/DD/YYYY with time
  const dmyMatch = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const yr = dmyMatch[3];
    let dy = p1;
    let mo = p2;
    if (p2 > 12) {
      mo = p1;
      dy = p2;
    }
    let hh = parseInt(dmyMatch[4], 10);
    const mm = dmyMatch[5];
    const ss = dmyMatch[6] || '00';
    const ampm = dmyMatch[7]?.toUpperCase();
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    return `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${mm}:${ss.padStart(2, '0')}`;
  }

  return null;
}

function extractKvField(line: string, keys: string[]): string {
  for (const key of keys) {
    const m = line.match(new RegExp(`(?:^|[\\t,&\\s])${key}\\s*=\\s*([^\\t,&\\r\\n]+)`, 'i'));
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

export function parseAdmsAttlogText(text: string): ZkRawPunch[] {
  const punches: ZkRawPunch[] = [];
  if (!text) return punches;
  const trimmedWhole = text.trim();

  // 1. Support JSON array or object payload directly
  if (trimmedWhole.startsWith('[') || trimmedWhole.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmedWhole);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.punches)
          ? parsed.punches
          : Array.isArray(parsed?.data)
            ? parsed.data
            : [parsed];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const uid = String(
          item.deviceUserId ?? item.userId ?? item.PIN ?? item.pin ?? item.employeeId ?? item.acNo ?? ''
        ).trim();
        const dt = normalizeZkDateTime(
          item.punchDateTime ?? item.punchDatetime ?? item.DateTime ?? item.recordTime ?? item.Time ?? item.timestamp
        );
        if (uid && dt) {
          punches.push({
            deviceUserId: uid,
            punchDateTime: dt,
            verifyMode: item.verifyMode !== undefined ? Number(item.verifyMode) : undefined,
            inOutMode: item.inOutMode !== undefined ? Number(item.inOutMode) : undefined
          });
        }
      }
      if (punches.length > 0) return punches;
    } catch {
      // fall through to line-by-line parser
    }
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.startsWith('ac-no') ||
      lower.startsWith('user id') ||
      lower.startsWith('emp id') ||
      lower.startsWith('employee id') ||
      lower.startsWith('no,') ||
      lower.startsWith('oplog') ||
      lower.startsWith('userinfo') ||
      lower.startsWith('//') ||
      lower.startsWith('#')
    ) {
      continue;
    }

    // 2. Key=Value ADMS / Push SDK format (e.g. PIN=101\tDateTime=2026-08-03 08:30:12\tVerified=1\tStatus=0)
    if (/(?:PIN|UserID|UserSn)\s*=/i.test(line) && /(?:DateTime|Time|RecordTime|AttTime)\s*=/i.test(line)) {
      const kvUid = extractKvField(line, ['PIN', 'UserID', 'UserSn']);
      const kvDtRaw = extractKvField(line, ['DateTime', 'Time', 'RecordTime', 'AttTime']);
      const kvVerify = extractKvField(line, ['Verified', 'VerifyMode']);
      const kvStatus = extractKvField(line, ['Status', 'InOutMode']);
      const dt = normalizeZkDateTime(kvDtRaw);
      if (kvUid && dt) {
        punches.push({
          deviceUserId: kvUid,
          punchDateTime: dt,
          verifyMode: kvVerify ? Number(kvVerify) || 0 : undefined,
          inOutMode: kvStatus ? Number(kvStatus) || 0 : undefined
        });
      }
      continue;
    }

    // 3. Delimited ADMS / .dat / .txt / .csv formats
    const parts = line.includes('\t')
      ? line.split('\t').map(s => s.trim().replace(/^"|"$/g, ''))
      : line.includes(',')
        ? line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
        : line.split(/\s+/).map(s => s.trim().replace(/^"|"$/g, ''));

    if (parts.length < 2) continue;
    const uid = parts[0].replace(/^PIN=/i, '').trim();
    if (!uid) continue;

    let dt: string | null = null;
    if (parts[1].match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/) && parts[2] && /^\d{1,2}:\d{2}/.test(parts[2])) {
      dt = normalizeZkDateTime(`${parts[1]} ${parts[2]}`);
    } else if (parts[1].match(/\d{1,2}[/.-]\d{1,2}[/.-]\d{4}/) && parts[2] && /^\d{1,2}:\d{2}/.test(parts[2])) {
      dt = normalizeZkDateTime(`${parts[1]} ${parts[2]}`);
    } else {
      dt = normalizeZkDateTime(parts[1]);
    }

    if (!dt) {
      // Fallback: scan remaining tokens for embedded timestamp
      for (let i = 1; i < parts.length; i++) {
        const candidate = parts[i + 1] && /^\d{1,2}:\d{2}/.test(parts[i + 1])
          ? `${parts[i]} ${parts[i + 1]}`
          : parts[i];
        dt = normalizeZkDateTime(candidate);
        if (dt) break;
      }
    }
    if (!dt) continue;

    punches.push({
      deviceUserId: uid,
      punchDateTime: dt,
      inOutMode: parts[2] && !parts[2].includes(':') ? Number(parts[2]) || 0 : undefined,
      verifyMode: parts[3] ? Number(parts[3]) || 0 : undefined
    });
  }
  return punches;
}

interface SystemDirectoryContext {
  activeEmpIds: Set<string>;
  inactiveEmpIds: Set<string>;
  empLookup: Map<string, string>;
  empNames: Map<string, string>;
  empDepartments: Map<string, string>;
  empJoiningDates: Map<string, string>;
  existingMappingsByDevUser: Map<string, string>;
  existingMappedEmpIds: Set<string>;
  existingPunchIds: Set<string>;
  existingPunchEmpTimes: Set<string>;
  existingPunchMsByEmp: Map<string, number[]>;
  existingUnmappedKeys: Set<string>;
  duplicateMergeMinutes: number;
}

function loadSystemContext(db: any): SystemDirectoryContext {
  const activeEmpIds = new Set<string>();
  const inactiveEmpIds = new Set<string>();
  const empLookup = new Map<string, string>();
  const empNames = new Map<string, string>();
  const empDepartments = new Map<string, string>();
  const empJoiningDates = new Map<string, string>();
  const existingMappingsByDevUser = new Map<string, string>();
  const existingMappedEmpIds = new Set<string>();
  const existingPunchIds = new Set<string>();
  const existingPunchEmpTimes = new Set<string>();
  const existingPunchMsByEmp = new Map<string, number[]>();
  const existingUnmappedKeys = new Set<string>();
  let duplicateMergeMinutes = 5;

  try {
    const sRes = db.exec("SELECT data FROM settings WHERE id = 'config' LIMIT 1");
    if (sRes.length > 0 && sRes[0].values.length > 0 && sRes[0].values[0][0]) {
      const cfg = JSON.parse(String(sRes[0].values[0][0]));
      const m = Number(cfg?.duplicateMergeTime);
      if (Number.isFinite(m) && m >= 0) {
        duplicateMergeMinutes = m;
      }
    }
  } catch {}

  try {
    const empRes = db.exec('SELECT id, name, department, joining_date, status, data FROM employees');
    if (empRes.length > 0) {
      for (const row of empRes[0].values) {
        const eid = String(row[0] || '').trim();
        if (!eid) continue;
        let name = String(row[1] || eid).trim();
        let dept = String(row[2] || 'General').trim();
        let joining = String(row[3] || '').trim().slice(0, 10);
        let status = String(row[4] || 'Active').trim();
        let dataObj: any = {};
        if (row[5]) {
          try {
            dataObj = JSON.parse(String(row[5]));
            if (dataObj.name) name = String(dataObj.name).trim();
            if (dataObj.department) dept = String(dataObj.department).trim();
            if (dataObj.joiningDate) joining = String(dataObj.joiningDate).trim().slice(0, 10);
            if (dataObj.status) status = String(dataObj.status).trim();
          } catch {}
        }

        empNames.set(eid, name);
        empDepartments.set(eid, dept);
        if (/^\d{4}-\d{2}-\d{2}$/.test(joining)) {
          empJoiningDates.set(eid, joining);
        }

        const isActive = !status || status.toLowerCase() === 'active';
        if (isActive) {
          activeEmpIds.add(eid);
          empLookup.set(eid, eid);
          empLookup.set(eid.toLowerCase(), eid);
          const norm = normalizeEmpId(eid);
          if (norm) {
            empLookup.set(norm, eid);
            empLookup.set(`emp${norm}`, eid);
            empLookup.set(`emp-${norm}`, eid);
          }
          for (const alias of [dataObj.deviceUserId, dataObj.biometricId, dataObj.acNo, dataObj.zkPin]) {
            if (alias) {
              const a = String(alias).trim();
              empLookup.set(a, eid);
              empLookup.set(a.toLowerCase(), eid);
              const na = normalizeEmpId(a);
              if (na) empLookup.set(na, eid);
            }
          }
        } else {
          inactiveEmpIds.add(eid);
          empLookup.set(eid, eid);
          empLookup.set(eid.toLowerCase(), eid);
          const norm = normalizeEmpId(eid);
          if (norm) empLookup.set(norm, eid);
        }
      }
    }
  } catch (e) {
    console.warn('[ZKPoller] Employee context load note:', e);
  }

  try {
    const mapRes = db.exec('SELECT device_user_id, employee_id FROM zk_user_mappings');
    if (mapRes.length > 0) {
      for (const row of mapRes[0].values) {
        const devUid = String(row[0] || '').trim();
        const empId = String(row[1] || '').trim();
        if (!devUid || !empId) continue;
        existingMappingsByDevUser.set(devUid, empId);
        existingMappingsByDevUser.set(devUid.toLowerCase(), empId);
        const norm = normalizeEmpId(devUid);
        if (norm && !existingMappingsByDevUser.has(norm)) {
          existingMappingsByDevUser.set(norm, empId);
        }
        existingMappedEmpIds.add(empId);
      }
    }
  } catch (e) {
    console.warn('[ZKPoller] Mapping context load note:', e);
  }

  try {
    const pRes = db.exec('SELECT id, employee_id, punch_datetime FROM attendance_punches');
    if (pRes.length > 0) {
      for (const row of pRes[0].values) {
        const pId = String(row[0] || '').trim();
        const eId = String(row[1] || '').trim();
        const pDt = String(row[2] || '').trim().replace(' ', 'T').slice(0, 19);
        if (pId) existingPunchIds.add(pId);
        if (eId && pDt) {
          existingPunchEmpTimes.add(`${eId}|${pDt}`);
          const tsMs = parseWallClockMs(pDt);
          if (!isNaN(tsMs)) {
            let list = existingPunchMsByEmp.get(eId);
            if (!list) {
              list = [];
              existingPunchMsByEmp.set(eId, list);
            }
            list.push(tsMs);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[ZKPoller] Punch index load note:', e);
  }

  try {
    const uRes = db.exec('SELECT data FROM zk_unmapped_punches');
    if (uRes.length > 0) {
      for (const row of uRes[0].values) {
        try {
          const u = JSON.parse(String(row[0]));
          const key = `${String(u.deviceUserId || '').trim()}|${String(u.punchDateTime || '').replace(' ', 'T').slice(0, 19)}`;
          existingUnmappedKeys.add(key);
        } catch {}
      }
    }
  } catch {}

  return {
    activeEmpIds,
    inactiveEmpIds,
    empLookup,
    empNames,
    empDepartments,
    empJoiningDates,
    existingMappingsByDevUser,
    existingMappedEmpIds,
    existingPunchIds,
    existingPunchEmpTimes,
    existingPunchMsByEmp,
    existingUnmappedKeys,
    duplicateMergeMinutes
  };
}

function resolveEmployeeForDeviceUser(ctx: SystemDirectoryContext, rawDevUserId: string): {
  employeeId?: string;
  isActive: boolean;
  isInactive: boolean;
} {
  const uid = String(rawDevUserId || '').trim();
  if (!uid) return { isActive: false, isInactive: false };
  const norm = normalizeEmpId(uid);

  const mappedEmp =
    ctx.existingMappingsByDevUser.get(uid) ||
    ctx.existingMappingsByDevUser.get(uid.toLowerCase()) ||
    (norm ? ctx.existingMappingsByDevUser.get(norm) : undefined);

  if (mappedEmp) {
    if (ctx.activeEmpIds.has(mappedEmp)) return { employeeId: mappedEmp, isActive: true, isInactive: false };
    if (ctx.inactiveEmpIds.has(mappedEmp)) return { employeeId: mappedEmp, isActive: false, isInactive: true };
  }

  const directEmp =
    ctx.empLookup.get(uid) ||
    ctx.empLookup.get(uid.toLowerCase()) ||
    (norm ? ctx.empLookup.get(norm) : undefined);

  if (directEmp) {
    if (ctx.activeEmpIds.has(directEmp)) return { employeeId: directEmp, isActive: true, isInactive: false };
    if (ctx.inactiveEmpIds.has(directEmp)) return { employeeId: directEmp, isActive: false, isInactive: true };
  }

  return { isActive: false, isInactive: false };
}

function updateDeviceStatsFromSqlite(db: any, overrides?: Map<string, Partial<any>>) {
  const statsByDev = new Map<string, { logs: number; users: Set<string> }>();
  let totalSystemLogs = 0;

  try {
    const pRes = db.exec('SELECT device_id, employee_id FROM attendance_punches');
    if (pRes.length > 0) {
      for (const r of pRes[0].values) {
        const dId = String(r[0] || '').trim();
        const eId = String(r[1] || '').trim();
        totalSystemLogs++;
        if (dId) {
          let entry = statsByDev.get(dId);
          if (!entry) {
            entry = { logs: 0, users: new Set<string>() };
            statsByDev.set(dId, entry);
          }
          entry.logs++;
          if (eId) entry.users.add(eId);
        }
      }
    }
  } catch {}

  let activeEmpCount = 0;
  try {
    const aRes = db.exec("SELECT COUNT(*) FROM employees WHERE status IS NULL OR status = '' OR LOWER(status) = 'active'");
    if (aRes.length > 0 && aRes[0].values.length > 0) {
      activeEmpCount = Number(aRes[0].values[0][0] || 0);
    }
  } catch {}

  const devRes = db.exec('SELECT id, data FROM zk_devices');
  if (devRes.length === 0) return { deviceCount: 0, totalSystemLogs, activeEmpCount };

  const now = new Date().toISOString();
  const upStmt = db.prepare('UPDATE zk_devices SET data = ?, updated_at = ? WHERE id = ?');
  let count = 0;
  for (const r of devRes[0].values) {
    const devId = String(r[0]);
    let devObj: any = {};
    try { devObj = JSON.parse(String(r[1] || '{}')); } catch {}
    const stats = statsByDev.get(devId);
    const extra = overrides?.get(devId) || {};
    const merged = {
      ...devObj,
      ...extra,
      id: devId,
      userCount: stats ? stats.users.size : Number(devObj.userCount || 0),
      logCount: stats ? stats.logs : Number(devObj.logCount || 0),
      activeDirectoryUsers: activeEmpCount,
      totalSystemLogs
    };
    upStmt.run([JSON.stringify(merged), now, devId]);
    count++;
  }
  upStmt.free();
  return { deviceCount: count, totalSystemLogs, activeEmpCount };
}

function appendSyncLogToSqlite(db: any, logEntry: {
  deviceId: string;
  deviceName: string;
  status: 'Success' | 'Failed';
  recordsRead: number;
  newRecords: number;
  duplicates: number;
  errors: number;
  durationMs: number;
  unmappedCount?: number;
  inactiveSkipped?: number;
  holidayOverlapsSkipped?: number;
  mode?: string;
  message?: string;
}) {
  const now = new Date().toISOString();
  const id = `synclog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const full = { id, timestamp: now, ...logEntry };
  const stmt = db.prepare('INSERT INTO zk_sync_logs (id, data, created_at) VALUES (?, ?, ?)');
  stmt.run([id, JSON.stringify(full), now]);
  stmt.free();

  // Keep latest 200 sync logs to keep SQLite clean
  try {
    db.run(`
      DELETE FROM zk_sync_logs WHERE id NOT IN (
        SELECT id FROM zk_sync_logs ORDER BY created_at DESC LIMIT 200
      )
    `);
  } catch {}
}

export async function reconcileSystemDataInSqlite(): Promise<{
  success: boolean;
  mappingsCreated: number;
  unmappedResolved: number;
  punchesAdded: number;
  activeEmployees: number;
  totalSystemLogs: number;
}> {
  return withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    const ctx = loadSystemContext(db);
    const now = new Date().toISOString();

    let mappingsCreated = 0;
    let unmappedResolved = 0;
    let punchesAdded = 0;

    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

    // 1. Ensure all Active Employees have zk_user_mappings rows persisted in SQLite
    const mapStmt = db.prepare(`
      INSERT INTO zk_user_mappings (id, device_user_id, employee_id, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        device_user_id=excluded.device_user_id,
        employee_id=excluded.employee_id,
        data=excluded.data
    `);

    for (const empId of ctx.activeEmpIds) {
      if (ctx.existingMappedEmpIds.has(empId)) continue;
      const mapId = `map_${empId}`;
      const mappingObj = {
        id: mapId,
        deviceUserId: empId,
        employeeId: empId,
        employeeName: ctx.empNames.get(empId) || empId,
        department: ctx.empDepartments.get(empId) || 'General',
        mappedAt: ctx.empJoiningDates.get(empId) || now
      };
      mapStmt.run([mapId, empId, empId, JSON.stringify(mappingObj)]);
      ctx.existingMappingsByDevUser.set(empId, empId);
      ctx.existingMappedEmpIds.add(empId);
      mappingsCreated++;
    }
    mapStmt.free();

    // 2. Auto-resolve pending zk_unmapped_punches against Active Employees & mappings
    const punchStmt = db.prepare(`
      INSERT OR IGNORE INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updateUnmappedStmt = db.prepare('UPDATE zk_unmapped_punches SET data = ? WHERE id = ?');

    try {
      const uRes = db.exec('SELECT id, data FROM zk_unmapped_punches');
      if (uRes.length > 0) {
        for (const row of uRes[0].values) {
          const uId = String(row[0]);
          let uObj: any = {};
          try { uObj = JSON.parse(String(row[1] || '{}')); } catch { continue; }
          if (uObj.status && uObj.status !== 'pending') continue;

          const resolved = resolveEmployeeForDeviceUser(ctx, String(uObj.deviceUserId || ''));
          if (!resolved.employeeId || !resolved.isActive) continue;

          const dt = normalizeZkDateTime(uObj.punchDateTime);
          if (!dt) continue;

          const jDate = ctx.empJoiningDates.get(resolved.employeeId);
          if (jDate && dt.slice(0, 10) < jDate) {
            uObj.status = 'resolved';
            updateUnmappedStmt.run([JSON.stringify(uObj), uId]);
            unmappedResolved++;
            continue;
          }

          const empTimeKey = `${resolved.employeeId}|${dt}`;
          if (!ctx.existingPunchEmpTimes.has(empTimeKey)) {
            const txId = String(uObj.transactionId || `${uObj.deviceId || 'zk'}_${resolved.employeeId}_${dt.replace(/[:.-]/g, '')}`);
            const pId = `zk_${txId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            if (!ctx.existingPunchIds.has(pId)) {
              const pObj = {
                id: pId,
                employeeId: resolved.employeeId,
                punchDatetime: dt,
                deviceId: uObj.deviceId || '',
                deviceName: uObj.deviceName || 'ZKTeco Device',
                deviceIP: uObj.deviceIP || '',
                deviceUserId: uObj.deviceUserId,
                source: 'ZKTeco',
                syncTime: now,
                transactionId: txId,
                importFormat: 'standard'
              };
              punchStmt.run([pId, resolved.employeeId, dt, pObj.deviceId, 'ZKTeco', JSON.stringify(pObj), now]);
              ctx.existingPunchIds.add(pId);
              ctx.existingPunchEmpTimes.add(empTimeKey);
              punchesAdded++;
            }
          }

          uObj.status = 'resolved';
          updateUnmappedStmt.run([JSON.stringify(uObj), uId]);
          unmappedResolved++;
        }
      }
    } catch (e) {
      console.warn('[ZKPoller] Unmapped reconciliation note:', e);
    }
    punchStmt.free();
    updateUnmappedStmt.free();

    const stats = updateDeviceStatsFromSqlite(db);
    db.run('COMMIT');
    saveSqliteDb();

    return {
      success: true,
      mappingsCreated,
      unmappedResolved,
      punchesAdded,
      activeEmployees: ctx.activeEmpIds.size,
      totalSystemLogs: stats.totalSystemLogs
    };
  });
}

export interface IngestZkBatchParams {
  deviceId?: string;
  deviceName?: string;
  deviceIP?: string;
  serialNumber?: string;
  protocolUsed?: string;
  direction?: 'AUTO' | 'IN' | 'OUT';
  punches: ZkRawPunch[];
  users?: ZkDeviceUser[];
  durationMs?: number;
  latencyMs?: number;
  mode?: string;
  status?: 'Success' | 'Failed';
  deviceStatus?: 'online' | 'offline';
  errorMessage?: string;
  skippedUnchangedCount?: boolean;
  fullReadPerformed?: boolean;
  freeSizes?: { userCount: number; logCount: number; fpCount?: number; faceCount?: number };
}

export async function ingestZkPunchesToSqlite(params: IngestZkBatchParams): Promise<{
  success: boolean;
  deviceId: string;
  deviceName: string;
  recordsRead: number;
  newRecords: number;
  duplicates: number;
  unmappedCount: number;
  inactiveSkipped: number;
  beforeJoiningSkipped: number;
  holidayOverlapsSkipped: number;
  mappingsAdded: number;
}> {
  return withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    const ctx = loadSystemContext(db);
    const now = new Date().toISOString();

    // Locate device in SQLite zk_devices
    let resolvedDevId = String(params.deviceId || '').trim();
    let resolvedDevName = String(params.deviceName || '').trim();
    let resolvedDevIp = String(params.deviceIP || '').trim();
    let resolvedDirection: 'AUTO' | 'IN' | 'OUT' = params.direction || 'AUTO';

    try {
      const devRes = db.exec('SELECT id, data FROM zk_devices');
      if (devRes.length > 0) {
        for (const r of devRes[0].values) {
          const id = String(r[0]);
          let d: any = {};
          try { d = JSON.parse(String(r[1] || '{}')); } catch {}
          const matchesId = resolvedDevId && id === resolvedDevId;
          const matchesSn = params.serialNumber && d.serialNumber && String(d.serialNumber).trim() === String(params.serialNumber).trim();
          const matchesIp = resolvedDevIp && d.ip && String(d.ip).trim() === resolvedDevIp;
          if (matchesId || matchesSn || matchesIp) {
            resolvedDevId = id;
            resolvedDevName = resolvedDevName || d.name || id;
            resolvedDevIp = resolvedDevIp || d.ip || '';
            if (!params.direction && (d.direction === 'IN' || d.direction === 'OUT' || d.direction === 'AUTO')) {
              resolvedDirection = d.direction;
            }
            break;
          }
        }
      }
    } catch {}

    if (!resolvedDevId) {
      resolvedDevId = 'dev_office_192_168_13_103';
    }
    resolvedDevName = resolvedDevName || 'ZKTeco Device';

    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

    let newRecords = 0;
    let duplicates = 0;
    let unmappedCount = 0;
    let inactiveSkipped = 0;
    let beforeJoiningSkipped = 0;
    let holidayOverlapsSkipped = 0;
    let mappingsAdded = 0;

    // 1. Store any enrolled users pulled from hardware that match Active Employees
    if (Array.isArray(params.users) && params.users.length > 0) {
      const mapStmt = db.prepare(`
        INSERT INTO zk_user_mappings (id, device_user_id, employee_id, data)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id, data=excluded.data
      `);
      for (const u of params.users) {
        const uid = String(u.deviceUserId || '').trim();
        if (!uid) continue;
        const resolved = resolveEmployeeForDeviceUser(ctx, uid);
        if (resolved.employeeId && resolved.isActive && !ctx.existingMappingsByDevUser.has(uid)) {
          const mapId = `map_${uid}`;
          const mObj = {
            id: mapId,
            deviceUserId: uid,
            employeeId: resolved.employeeId,
            employeeName: ctx.empNames.get(resolved.employeeId) || u.name || resolved.employeeId,
            department: ctx.empDepartments.get(resolved.employeeId) || 'General',
            mappedAt: now
          };
          mapStmt.run([mapId, uid, resolved.employeeId, JSON.stringify(mObj)]);
          ctx.existingMappingsByDevUser.set(uid, resolved.employeeId);
          mappingsAdded++;
        }
      }
      mapStmt.free();
    }

    // 2. Process & store incoming attendance punches cleanly (sorted chronologically so first punch wins inside dedupe window)
    const punchStmt = db.prepare(`
      INSERT OR IGNORE INTO attendance_punches (id, employee_id, punch_datetime, device_id, source, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const unmappedStmt = db.prepare(`
      INSERT OR IGNORE INTO zk_unmapped_punches (id, data, created_at)
      VALUES (?, ?, ?)
    `);

    const sortedIncoming = [...params.punches]
      .map((raw) => ({ raw, dt: normalizeZkDateTime(raw.punchDateTime) }))
      .filter((x): x is { raw: ZkRawPunch; dt: string } => Boolean(x.dt && String(x.raw.deviceUserId || '').trim()))
      .sort((a, b) => a.dt.localeCompare(b.dt));

    const mergeWindowMs = Math.max(0, ctx.duplicateMergeMinutes) * 60 * 1000;
    const candidatePunches: any[] = [];
    const candidateMsByEmp = new Map<string, number[]>();

    for (const { raw, dt } of sortedIncoming) {
      const rawUid = String(raw.deviceUserId || '').trim();

      const resolved = resolveEmployeeForDeviceUser(ctx, rawUid);
      if (resolved.isInactive) {
        inactiveSkipped++;
        continue;
      }

      if (!resolved.employeeId || !resolved.isActive) {
        const unmappedKey = `${rawUid}|${dt}`;
        if (!ctx.existingUnmappedKeys.has(unmappedKey)) {
          const txId = `${resolvedDevId}_${rawUid}_${dt.replace(/[:.-]/g, '')}`;
          const uId = `unmapped_${txId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const uObj = {
            id: uId,
            deviceId: resolvedDevId,
            deviceName: resolvedDevName,
            deviceIP: resolvedDevIp,
            deviceUserId: rawUid,
            punchDateTime: dt,
            transactionId: txId,
            status: 'pending'
          };
          unmappedStmt.run([uId, JSON.stringify(uObj), now]);
          ctx.existingUnmappedKeys.add(unmappedKey);
          unmappedCount++;
        } else {
          duplicates++;
        }
        continue;
      }

      const empId = resolved.employeeId;
      const jDate = ctx.empJoiningDates.get(empId);
      if (jDate && dt.slice(0, 10) < jDate) {
        beforeJoiningSkipped++;
        continue;
      }

      const empTimeKey = `${empId}|${dt}`;
      const pId = `zk_${empId}_${dt.replace(/[:.-]/g, '')}`;
      if (ctx.existingPunchEmpTimes.has(empTimeKey) || ctx.existingPunchIds.has(pId)) {
        duplicates++;
        continue;
      }

      // Collapse punches inside duplicate merge window to the first punch
      const tsMs = parseWallClockMs(dt);
      if (mergeWindowMs > 0 && !isNaN(tsMs)) {
        const storedList = ctx.existingPunchMsByEmp.get(empId) || [];
        const batchList = candidateMsByEmp.get(empId) || [];
        const nearStored = storedList.some(prevMs => Math.abs(tsMs - prevMs) <= mergeWindowMs);
        const nearBatch = batchList.some(prevMs => Math.abs(tsMs - prevMs) <= mergeWindowMs);
        if (nearStored || nearBatch) {
          duplicates++;
          continue;
        }
        batchList.push(tsMs);
        candidateMsByEmp.set(empId, batchList);
      }

      const resolvedInOut =
        resolvedDirection === 'IN'
          ? 0
          : resolvedDirection === 'OUT'
            ? 1
            : raw.inOutMode;

      candidatePunches.push({
        id: pId,
        employeeId: empId,
        punchDatetime: dt,
        deviceId: resolvedDevId,
        deviceName: resolvedDevName,
        deviceIP: resolvedDevIp,
        deviceUserId: rawUid,
        ...(resolvedInOut !== undefined ? { inOutMode: resolvedInOut } : {}),
        direction: resolvedDirection,
        source: 'ZKTeco',
        syncTime: now,
        transactionId: pId,
        location: resolvedDevIp ? `${resolvedDevName} (${resolvedDevIp})` : resolvedDevName,
        importFormat: 'standard'
      });
    }

    // Cross-reference candidate biometric punches against Public Holiday Master DB to prevent holiday overlaps
    const holidayChecked = validateIncomingPunchesAgainstDb(db, candidatePunches);
    holidayOverlapsSkipped = holidayChecked.rejectedOverlaps.length;

    for (const pObj of holidayChecked.acceptedPunches) {
      const empTimeKey = `${pObj.employeeId}|${pObj.punchDatetime}`;
      if (ctx.existingPunchIds.has(pObj.id) || ctx.existingPunchEmpTimes.has(empTimeKey)) {
        duplicates++;
        continue;
      }
      punchStmt.run([pObj.id, pObj.employeeId, pObj.punchDatetime, resolvedDevId, 'ZKTeco', JSON.stringify(pObj), now]);
      ctx.existingPunchIds.add(pObj.id);
      ctx.existingPunchEmpTimes.add(empTimeKey);
      const tsMs = parseWallClockMs(pObj.punchDatetime);
      if (!isNaN(tsMs)) {
        const list = ctx.existingPunchMsByEmp.get(pObj.employeeId) || [];
        list.push(tsMs);
        ctx.existingPunchMsByEmp.set(pObj.employeeId, list);
      }
      newRecords++;
    }

    punchStmt.free();
    unmappedStmt.free();

    const measuredLatency =
      typeof params.latencyMs === 'number' && params.latencyMs >= 0
        ? params.latencyMs
        : typeof params.durationMs === 'number' && params.durationMs >= 0
          ? params.durationMs
          : undefined;

    const devOverrides = new Map<string, Partial<any>>();
    const overrideObj: Record<string, any> = {
      status: params.deviceStatus || 'online',
      lastProtocolUsed: params.protocolUsed || params.mode || undefined,
      lastConnection: params.deviceStatus === 'offline' ? undefined : now,
      lastSync: params.status === 'Failed' ? undefined : now,
      lastSuccessfulSync: params.status === 'Failed' ? undefined : now,
      lastFullReadAt: params.fullReadPerformed && params.status !== 'Failed' ? now : undefined,
      lastPollAttemptAt: now,
      lastLatencyMs: measuredLatency,
      lastProbeAt: now,
      lastError: params.errorMessage || '',
      ...(params.status !== 'Failed'
        ? {
            lastReadRecords: params.skippedUnchangedCount ? 0 : params.punches.length,
            lastNewRecords: newRecords
          }
        : {}),
      ...(params.freeSizes
        ? {
            ...(typeof params.freeSizes.logCount === 'number' && params.freeSizes.logCount >= 0
              ? {
                  lastDeviceLogCount: params.freeSizes.logCount,
                  deviceCapacityLogs: params.freeSizes.logCount
                }
              : {}),
            ...(params.freeSizes.userCount > 0 ? { deviceCapacityUsers: params.freeSizes.userCount } : {}),
            ...(typeof params.freeSizes.fpCount === 'number' && params.freeSizes.fpCount > 0
              ? { fpCount: params.freeSizes.fpCount }
              : {}),
            ...(typeof params.freeSizes.faceCount === 'number' && params.freeSizes.faceCount > 0
              ? { faceCount: params.freeSizes.faceCount, userFaceCount: params.freeSizes.faceCount }
              : {})
          }
        : {})
    };
    Object.keys(overrideObj).forEach(k => overrideObj[k] === undefined && delete overrideObj[k]);
    devOverrides.set(resolvedDevId, overrideObj);

    updateDeviceStatsFromSqlite(db, devOverrides);

    appendSyncLogToSqlite(db, {
      deviceId: resolvedDevId,
      deviceName: resolvedDevName,
      status: params.status || 'Success',
      recordsRead: params.skippedUnchangedCount ? 0 : params.punches.length,
      newRecords,
      duplicates,
      errors: params.status === 'Failed' ? 1 : 0,
      durationMs: params.durationMs || 0,
      unmappedCount,
      inactiveSkipped,
      holidayOverlapsSkipped,
      mode: params.mode || 'ZKT Sync',
      message:
        params.errorMessage ||
        (params.skippedUnchangedCount
          ? `Count unchanged on terminal (${params.freeSizes?.logCount ?? 0} raw logs) — skipped bulk transfer`
          : `Processed ${params.punches.length} logs (${newRecords} new stored, ${duplicates} skipped${holidayOverlapsSkipped > 0 ? `, ${holidayOverlapsSkipped} holiday overlaps prevented` : ''})`)
    });

    db.run('COMMIT');
    saveSqliteDb();

    if (newRecords > 0 || unmappedCount > 0 || mappingsAdded > 0) {
      broadcastSseEvent('PunchSnapshotUpdated', {
        action: 'manual_ingest',
        deviceId: resolvedDevId,
        deviceName: resolvedDevName,
        newRecords,
        timestamp: now
      });
    }

    return {
      success: params.status !== 'Failed',
      deviceId: resolvedDevId,
      deviceName: resolvedDevName,
      recordsRead: params.punches.length,
      newRecords,
      duplicates,
      unmappedCount,
      inactiveSkipped,
      beforeJoiningSkipped,
      holidayOverlapsSkipped,
      mappingsAdded
    };
  });
}

export function getWatchFolderPath(): string {
  const root = getSanitizedRootFolder();
  const dir = path.join(root, 'Imports');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return dir;
}

export function scanLocalDiskAttlogFiles(): Array<{ filePath: string; fileName: string; punches: ZkRawPunch[] }> {
  const root = getSanitizedRootFolder();
  const primaryWatchDir = getWatchFolderPath();
  const candidates = [
    primaryWatchDir,
    path.join(root, 'imports'),
    path.join(root, 'WatchFolder'),
    'E:\\ZKTime5.0',
    'E:\\'
  ];

  const found: Array<{ filePath: string; fileName: string; punches: ZkRawPunch[] }> = [];
  const seenFiles = new Set<string>();

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      for (const name of entries) {
        const lower = name.toLowerCase();
        if (
          !(
            lower.endsWith('.dat') ||
            lower.endsWith('.txt') ||
            lower.endsWith('.csv') ||
            lower.endsWith('.tsv') ||
            lower.endsWith('.json') ||
            lower.includes('attlog')
          )
        ) {
          continue;
        }
        const full = path.join(dir, name);
        if (seenFiles.has(full)) continue;
        seenFiles.add(full);
        const st = fs.statSync(full);
        if (!st.isFile() || st.size === 0 || st.size > 30 * 1024 * 1024) continue;
        const text = fs.readFileSync(full, 'utf8');
        const punches = parseAdmsAttlogText(text);
        if (punches.length > 0) {
          found.push({ filePath: full, fileName: name, punches });
        }
      }
    } catch {}
  }

  return found;
}

export async function recordAdmsDeviceHeartbeat(sn: string, remoteIp?: string) {
  if (!sn) return;
  const now = new Date().toISOString();
  await withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');
    const devRes = db.exec('SELECT id, data FROM zk_devices');
    if (devRes.length > 0) {
      const upStmt = db.prepare('UPDATE zk_devices SET data = ?, updated_at = ? WHERE id = ?');
      for (const r of devRes[0].values) {
        const id = String(r[0]);
        let d: any = {};
        try { d = JSON.parse(String(r[1] || '{}')); } catch {}
        const matchesSn = d.serialNumber && String(d.serialNumber).trim().toLowerCase() === sn.trim().toLowerCase();
        const matchesIp = remoteIp && d.ip && String(d.ip).trim() === remoteIp.trim();
        if (matchesSn || matchesIp) {
          d.status = 'online';
          d.lastConnection = now;
          d.lastProtocolUsed = 'ADMS Push';
          d.lastError = '';
          upStmt.run([JSON.stringify(d), now, id]);
        }
      }
      upStmt.free();
    }
    db.run('COMMIT');
    saveSqliteDb();
  });
}

export async function scanWatchFolderAndIngestToSqlite(deviceId?: string) {
  const startTime = Date.now();
  const watchDir = getWatchFolderPath();
  const files = scanLocalDiskAttlogFiles();
  let totalRead = 0;
  let totalNew = 0;
  let totalDup = 0;
  let totalUnmapped = 0;
  let totalInactive = 0;

  if (files.length > 0) {
    for (const f of files) {
      const res = await ingestZkPunchesToSqlite({
        deviceId: deviceId || 'dev_local_disk_e',
        deviceName: `Watch Folder (${f.fileName})`,
        deviceIP: 'USB/File',
        protocolUsed: 'USB/WatchFolder',
        punches: f.punches,
        durationMs: Date.now() - startTime,
        mode: `Watch Folder (${f.fileName})`,
        deviceStatus: 'online',
        status: 'Success'
      });
      totalRead += res.recordsRead;
      totalNew += res.newRecords;
      totalDup += res.duplicates;
      totalUnmapped += res.unmappedCount;
      totalInactive += res.inactiveSkipped;
    }
  }

  return {
    success: true,
    watchFolderPath: watchDir,
    filesScanned: files.length,
    fileNames: files.map(f => f.fileName),
    recordsRead: totalRead,
    newRecords: totalNew,
    duplicates: totalDup,
    unmappedCount: totalUnmapped,
    inactiveSkipped: totalInactive,
    durationMs: Date.now() - startTime
  };
}

export async function pollSingleZkDeviceToSqlite(
  deviceIdOrIp: string,
  mode = 'Manual Poll',
  options?: { fullRead?: boolean }
) {
  const startTime = Date.now();
  const db = await getSqliteDb();
  let targetDev: any = null;

  try {
    const devRes = db.exec('SELECT id, data FROM zk_devices');
    if (devRes.length > 0) {
      for (const r of devRes[0].values) {
        const id = String(r[0]);
        let d: any = {};
        try { d = JSON.parse(String(r[1] || '{}')); } catch {}
        if (id === deviceIdOrIp || d.ip === deviceIdOrIp) {
          targetDev = { ...d, id };
          break;
        }
      }
    }
  } catch {}

  if (!targetDev) {
    return {
      success: false,
      deviceId: deviceIdOrIp,
      deviceName: deviceIdOrIp,
      recordsRead: 0,
      newRecords: 0,
      duplicates: 0,
      error: 'Device not found in SQLite zk_devices'
    };
  }

  const protocolMode = targetDev.protocolMode || 'Auto';

  if (targetDev.ip === 'USB/File' || targetDev.ip === 'Local Disk (E:)' || protocolMode === 'USB-Disk') {
    const diskFiles = scanLocalDiskAttlogFiles();
    const allPunches = diskFiles.flatMap(f => f.punches);
    const res = await ingestZkPunchesToSqlite({
      deviceId: targetDev.id,
      deviceName: targetDev.name,
      deviceIP: targetDev.ip,
      direction: targetDev.direction || 'AUTO',
      protocolUsed: 'USB/WatchFolder',
      punches: allPunches,
      durationMs: Date.now() - startTime,
      mode: `${mode} (Disk/Watch Scan)`,
      deviceStatus: 'online',
      fullReadPerformed: true,
      status: 'Success'
    });
    return { ...res, message: `Scanned local disk/watch folder (${diskFiles.length} files) for ${targetDev.name}: ${res.newRecords} new punches saved to SQLite.` };
  }

  if (targetDev.ip === 'ADMS Push' || protocolMode === 'ADMS') {
    const recon = await reconcileSystemDataInSqlite();
    return {
      success: true,
      deviceId: targetDev.id,
      deviceName: targetDev.name,
      recordsRead: 0,
      newRecords: recon.punchesAdded,
      duplicates: 0,
      message: `ADMS Push listener active for ${targetDev.name}; reconciled ${recon.activeEmployees} active employees & ${recon.totalSystemLogs} SQLite logs.`
    };
  }

  const lastFullMs = targetDev.lastFullReadAt ? Date.parse(String(targetDev.lastFullReadAt)) : NaN;
  const needsDailyFullRead = isNaN(lastFullMs) || Date.now() - lastFullMs >= 24 * 60 * 60 * 1000;
  const forceFullRead = Boolean(options?.fullRead) || needsDailyFullRead;
  const knownLogCount =
    typeof targetDev.lastDeviceLogCount === 'number' && targetDev.lastDeviceLogCount >= 0
      ? targetDev.lastDeviceLogCount
      : undefined;

  const hw = await fetchZkHardwareData(
    targetDev.ip,
    Number(targetDev.port) || 4370,
    Number(targetDev.commKey) || 0,
    3500,
    protocolMode,
    { knownLogCount, forceFullRead }
  );

  if (hw.reachable) {
    const res = await ingestZkPunchesToSqlite({
      deviceId: targetDev.id,
      deviceName: targetDev.name,
      deviceIP: targetDev.ip,
      serialNumber: hw.serialNumber || targetDev.serialNumber,
      direction: targetDev.direction || 'AUTO',
      protocolUsed: hw.protocol,
      punches: hw.punches,
      users: hw.users,
      freeSizes: hw.freeSizes,
      durationMs: Date.now() - startTime,
      latencyMs: hw.latencyMs,
      skippedUnchangedCount: Boolean(hw.skippedUnchangedCount),
      fullReadPerformed: !hw.skippedUnchangedCount,
      mode: hw.skippedUnchangedCount ? `${mode} (Count Unchanged)` : `${mode} (${hw.protocol})`,
      deviceStatus: 'online',
      status: 'Success'
    });
    return {
      ...res,
      reachable: true,
      skippedUnchangedCount: Boolean(hw.skippedUnchangedCount),
      deviceLogCount: hw.freeSizes?.logCount ?? knownLogCount,
      protocol: hw.protocol,
      latencyMs: hw.latencyMs,
      attempts: hw.attempts,
      message: hw.skippedUnchangedCount
        ? `Checked ${targetDev.name} (${targetDev.ip}): log count unchanged (${hw.freeSizes?.logCount ?? 0} raw), skipped full transfer.`
        : `Polled ${targetDev.name} (${targetDev.ip}) via ${hw.protocol}: ${res.recordsRead} read, ${res.newRecords} new stored in SQLite, ${res.duplicates} duplicates skipped.`
    };
  }

  const failRes = await ingestZkPunchesToSqlite({
    deviceId: targetDev.id,
    deviceName: targetDev.name,
    deviceIP: targetDev.ip,
    punches: [],
    durationMs: Date.now() - startTime,
    latencyMs: hw.latencyMs,
    mode: `${mode} (Unreachable)`,
    deviceStatus: 'offline',
    status: 'Failed',
    errorMessage: hw.error || `TCP/UDP/Web unreachable at ${targetDev.ip}:${targetDev.port || 4370}`
  });

  return {
    ...failRes,
    success: false,
    reachable: false,
    latencyMs: hw.latencyMs,
    attempts: hw.attempts,
    error: hw.error || `Device ${targetDev.name} (${targetDev.ip}:${targetDev.port || 4370}) unreachable on current network`
  };
}

export async function testAndStoreZkDeviceConnection(params: {
  deviceId?: string;
  ip: string;
  port?: number;
  commKey?: number;
  model?: string;
  protocolMode?: any;
}) {
  const port = Number(params.port) || 4370;
  const res = await testZkHardwareConnection(
    params.ip,
    port,
    Number(params.commKey) || 0,
    2500,
    params.protocolMode || 'Auto'
  );
  const now = new Date().toISOString();

  await withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

    const devRes = db.exec('SELECT id, data FROM zk_devices');
    if (devRes.length > 0) {
      const upStmt = db.prepare('UPDATE zk_devices SET data = ?, updated_at = ? WHERE id = ?');
      for (const r of devRes[0].values) {
        const id = String(r[0]);
        let d: any = {};
        try { d = JSON.parse(String(r[1] || '{}')); } catch {}
        if ((params.deviceId && id === params.deviceId) || d.ip === params.ip) {
          d.status = res.reachable ? 'online' : 'offline';
          d.lastProbeAt = now;
          if (typeof res.latencyMs === 'number' && res.latencyMs >= 0) {
            d.lastLatencyMs = res.latencyMs;
          }
          if (res.reachable) {
            d.lastConnection = now;
            d.lastProtocolUsed = res.protocol;
          }
          d.lastError = res.reachable ? '' : (res.error || 'Unreachable');
          if (res.serialNumber) d.serialNumber = res.serialNumber;
          if (res.freeSizes) {
            d.deviceCapacityUsers = res.freeSizes.userCount;
            d.deviceCapacityLogs = res.freeSizes.logCount;
          }
          upStmt.run([JSON.stringify(d), now, id]);
        }
      }
      upStmt.free();
    }

    db.run('COMMIT');
    saveSqliteDb();
  });

  return res;
}

export async function probeAllZkDevicesHealth(timeoutMs = 1500) {
  const startTime = Date.now();
  const db = await getSqliteDb();
  const devices: any[] = [];
  try {
    const devRes = db.exec('SELECT id, data FROM zk_devices');
    if (devRes.length > 0) {
      for (const r of devRes[0].values) {
        try {
          const d = JSON.parse(String(r[1] || '{}'));
          devices.push({ ...d, id: String(r[0]) });
        } catch {}
      }
    }
  } catch {}

  const probeResults = await Promise.all(
    devices.map(async (dev) => {
      if (dev.enabled === false) {
        return {
          deviceId: dev.id,
          skipped: true,
          reachable: false,
          latencyMs: dev.lastLatencyMs,
          protocol: dev.lastProtocolUsed || dev.protocolMode || 'Disabled',
          error: 'Device polling disabled'
        };
      }
      const mode = dev.protocolMode || 'Auto';
      const ip = String(dev.ip || '').trim();
      if (ip === 'USB/File' || ip === 'Local Disk (E:)' || mode === 'USB-Disk') {
        const t0 = Date.now();
        const watchDir = getWatchFolderPath();
        const exists = fs.existsSync(watchDir);
        return {
          deviceId: dev.id,
          skipped: false,
          reachable: exists,
          latencyMs: Math.max(1, Date.now() - t0),
          protocol: 'USB/WatchFolder',
          error: exists ? '' : 'Watch folder unavailable'
        };
      }
      if (ip === 'ADMS Push' || mode === 'ADMS') {
        return {
          deviceId: dev.id,
          skipped: false,
          reachable: true,
          latencyMs: 1,
          protocol: 'ADMS Push',
          error: ''
        };
      }
      const hw = await testZkHardwareConnection(
        ip,
        Number(dev.port) || 4370,
        Number(dev.commKey) || 0,
        timeoutMs,
        mode
      );
      return {
        deviceId: dev.id,
        skipped: false,
        reachable: hw.reachable,
        latencyMs: hw.latencyMs,
        protocol: hw.protocol,
        serialNumber: hw.serialNumber,
        freeSizes: hw.freeSizes,
        error: hw.error || ''
      };
    })
  );

  const now = new Date().toISOString();
  const resultMap = new Map(probeResults.map(r => [r.deviceId, r]));

  await withSqliteWriteLock(async () => {
    const writeDb = await getSqliteDb();
    try { writeDb.run('ROLLBACK'); } catch {}
    writeDb.run('BEGIN TRANSACTION');

    const devRes = writeDb.exec('SELECT id, data FROM zk_devices');
    if (devRes.length > 0) {
      const upStmt = writeDb.prepare('UPDATE zk_devices SET data = ?, updated_at = ? WHERE id = ?');
      for (const r of devRes[0].values) {
        const id = String(r[0]);
        let d: any = {};
        try { d = JSON.parse(String(r[1] || '{}')); } catch {}
        const p = resultMap.get(id);
        if (p && !p.skipped) {
          d.status = p.reachable ? 'online' : 'offline';
          d.lastProbeAt = now;
          if (typeof p.latencyMs === 'number' && p.latencyMs >= 0) {
            d.lastLatencyMs = p.latencyMs;
          }
          if (p.reachable) {
            d.lastConnection = now;
            if (p.protocol && p.protocol !== 'NONE') {
              d.lastProtocolUsed = p.protocol;
            }
          }
          d.lastError = p.reachable ? '' : (p.error || 'Unreachable');
          if ((p as any).serialNumber) d.serialNumber = (p as any).serialNumber;
          if ((p as any).freeSizes) {
            d.deviceCapacityUsers = (p as any).freeSizes.userCount;
            d.deviceCapacityLogs = (p as any).freeSizes.logCount;
          }
          upStmt.run([JSON.stringify(d), now, id]);
        }
      }
      upStmt.free();
    }

    writeDb.run('COMMIT');
    saveSqliteDb();
  });

  const summary = await getZkPollingSummaryFromSqlite();
  return {
    success: true,
    probedAt: now,
    probeDurationMs: Date.now() - startTime,
    results: probeResults,
    summary
  };
}

export async function pollAllZkDevicesToSqlite(
  options: { dueOnly?: boolean; mode?: string; forceDirectPoll?: boolean; fullRead?: boolean } = {}
) {
  if (zkPollingState.readOnlyMode && !options.forceDirectPoll) {
    const obs = await detectExternalPunchChangesReadOnly();
    return {
      success: true,
      readOnlyMode: true,
      skippedDirectWrite: true,
      mode: options.mode || 'Read-Only External Collector Observation',
      polledAt: zkPollingState.lastPollAt,
      punchCount: obs.punchCount,
      latestPunchDatetime: obs.latestPunchDatetime,
      changed: obs.changed,
      delta: obs.delta,
      results: []
    };
  }

  if (zkPollingState.isPollingNow) {
    return {
      success: true,
      skippedBusy: true,
      message: 'ZKT polling cycle already in progress',
      results: []
    };
  }

  zkPollingState.isPollingNow = true;
  const startTime = Date.now();
  try {
    const db = await getSqliteDb();
    const devRes = db.exec('SELECT id, data FROM zk_devices');
    const devices: any[] = [];
    if (devRes.length > 0) {
      for (const r of devRes[0].values) {
        try {
          const d = JSON.parse(String(r[1] || '{}'));
          devices.push({ ...d, id: String(r[0]) });
        } catch {}
      }
    }

    const enabledDevices = devices.filter(d => d.enabled !== false);
    const nowMs = Date.now();
    const globalScheduleMins = Math.max(1, Number(zkPollingState.intervalMinutes || 15));
    const targetDevices = options.dueOnly
      ? enabledDevices.filter(d => {
          if (d.autoSyncMinutes === 0) return false;
          const refTs = d.lastPollAttemptAt || d.lastSync;
          if (!refTs) return true;
          const lastMs = Date.parse(String(refTs));
          return isNaN(lastMs) || nowMs - lastMs >= globalScheduleMins * 60 * 1000;
        })
      : enabledDevices;

    if (options.dueOnly && targetDevices.length === 0) {
      return {
        success: true,
        skippedBusy: false,
        skippedNotDue: true,
        mode: options.mode || 'Scheduled Auto-Poll',
        polledAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        devicesEnabled: enabledDevices.length,
        devicesPolled: 0,
        reachableDevices: 0,
        totalRead: 0,
        totalNew: 0,
        totalDup: 0,
        results: []
      };
    }

    const pollLabel = options.mode || (options.dueOnly ? 'Scheduled Auto-Poll' : options.fullRead ? 'Manual Full Read' : 'Manual Sync');
    const results = await Promise.all(
      targetDevices.map(dev =>
        pollSingleZkDeviceToSqlite(dev.id, pollLabel, { fullRead: Boolean(options.fullRead) })
      )
    );

    let totalRead = 0;
    let totalNew = 0;
    let totalDup = 0;
    let reachableDevices = 0;

    for (const r of results) {
      totalRead += Number(r.recordsRead || 0);
      totalNew += Number(r.newRecords || 0);
      totalDup += Number(r.duplicates || 0);
      if ((r as any).reachable) reachableDevices++;
    }

    let diskNew = 0;
    let diskRead = 0;
    const diskFiles = scanLocalDiskAttlogFiles();
    if (diskFiles.length > 0) {
      const primaryDev = enabledDevices[0] || devices[0];
      for (const df of diskFiles) {
        const diskRes = await ingestZkPunchesToSqlite({
          deviceId: primaryDev?.id || 'dev_local_disk_e',
          deviceName: primaryDev?.name || `Local Disk (${df.fileName})`,
          deviceIP: primaryDev?.ip || 'Local Disk (E:)',
          protocolUsed: 'WatchFolder',
          punches: df.punches,
          mode: `Disk/Watch Auto-Scan (${df.fileName})`,
          deviceStatus: 'online',
          status: 'Success'
        });
        diskRead += diskRes.recordsRead;
        diskNew += diskRes.newRecords;
      }
    }

    const recon = await reconcileSystemDataInSqlite();

    const nowIso = new Date().toISOString();
    const summary = {
      success: true,
      skippedBusy: false,
      mode: pollLabel,
      polledAt: nowIso,
      durationMs: Date.now() - startTime,
      devicesEnabled: enabledDevices.length,
      devicesPolled: targetDevices.length,
      reachableDevices,
      totalRead: totalRead + diskRead,
      totalNew: totalNew + diskNew + recon.punchesAdded,
      totalDup,
      mappingsCreated: recon.mappingsCreated,
      unmappedResolved: recon.unmappedResolved,
      activeEmployees: recon.activeEmployees,
      totalSystemLogs: recon.totalSystemLogs,
      watchFolderFiles: diskFiles.length,
      results
    };

    zkPollingState.lastPollAt = nowIso;
    zkPollingState.totalPollsRun += 1;
    zkPollingState.lastPollResult = summary;

    return summary;
  } finally {
    zkPollingState.isPollingNow = false;
  }
}

export async function getZkPollingSummaryFromSqlite() {
  return withReadOnlySqliteSnapshot((db) => {
    let deviceCount = 0;
    let enabledDeviceCount = 0;
    let onlineDeviceCount = 0;
    let punchCount = 0;
    let activeEmployeeCount = 0;
    let mappedUserCount = 0;
    let pendingUnmappedCount = 0;
    let latestPunchDatetime: string | null = null;
    let lastSuccessfulSyncLog: any = null;
    let latestSyncLog: any = null;
    const latencySamples: number[] = [];

  try {
    const devRes = db.exec('SELECT data FROM zk_devices');
    if (devRes.length > 0) {
      deviceCount = devRes[0].values.length;
      for (const r of devRes[0].values) {
        try {
          const d = JSON.parse(String(r[0]));
          if (d.enabled !== false) enabledDeviceCount++;
          if (d.status === 'online') onlineDeviceCount++;
          if (typeof d.lastLatencyMs === 'number' && d.lastLatencyMs >= 0) {
            latencySamples.push(d.lastLatencyMs);
          }
        } catch {}
      }
    }
  } catch {}

  try {
    const pRes = db.exec('SELECT COUNT(*), MAX(punch_datetime) FROM attendance_punches');
    if (pRes.length > 0 && pRes[0].values.length > 0) {
      punchCount = Number(pRes[0].values[0][0] || 0);
      latestPunchDatetime = pRes[0].values[0][1] ? String(pRes[0].values[0][1]) : null;
    }
  } catch {}

  try {
    const eRes = db.exec("SELECT COUNT(*) FROM employees WHERE status IS NULL OR status = '' OR LOWER(status) = 'active'");
    if (eRes.length > 0 && eRes[0].values.length > 0) {
      activeEmployeeCount = Number(eRes[0].values[0][0] || 0);
    }
  } catch {}

  try {
    const mRes = db.exec('SELECT COUNT(*) FROM zk_user_mappings');
    if (mRes.length > 0 && mRes[0].values.length > 0) {
      mappedUserCount = Number(mRes[0].values[0][0] || 0);
    }
  } catch {}

  try {
    const uRes = db.exec('SELECT data FROM zk_unmapped_punches');
    if (uRes.length > 0) {
      for (const r of uRes[0].values) {
        try {
          const u = JSON.parse(String(r[0]));
          if (!u.status || u.status === 'pending') pendingUnmappedCount++;
        } catch {}
      }
    }
  } catch {}

  try {
    const logRes = db.exec('SELECT data FROM zk_sync_logs ORDER BY created_at DESC LIMIT 100');
    if (logRes.length > 0) {
      for (const r of logRes[0].values) {
        try {
          const log = JSON.parse(String(r[0]));
          if (!latestSyncLog) latestSyncLog = log;
          if (!lastSuccessfulSyncLog && log.status === 'Success') {
            lastSuccessfulSyncLog = log;
          }
          if (latestSyncLog && lastSuccessfulSyncLog) break;
        } catch {}
      }
    }
  } catch {}

  const averageLatencyMs = latencySamples.length > 0
    ? Math.round(latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length)
    : (typeof lastSuccessfulSyncLog?.durationMs === 'number' ? lastSuccessfulSyncLog.durationMs : null);

  const lastReferenceMs = zkPollingState.lastPollAt
    ? Date.parse(zkPollingState.lastPollAt)
    : (latestSyncLog?.timestamp ? Date.parse(String(latestSyncLog.timestamp)) : NaN);
  const nextPollAt = zkPollingState.enabled && !isNaN(lastReferenceMs)
    ? new Date(lastReferenceMs + Math.max(1, zkPollingState.intervalMinutes) * 60 * 1000).toISOString()
    : null;

  return {
    ...zkPollingState,
    nextPollAt,
    dbPath: getSqliteDbPath(),
    watchFolderPath: getWatchFolderPath(),
    deviceCount,
    enabledDeviceCount,
    onlineDeviceCount,
    punchCount,
    activeEmployeeCount,
    mappedUserCount,
    pendingUnmappedCount,
    latestPunchDatetime,
    lastSuccessfulSyncLog,
    latestSyncLog,
    averageLatencyMs
  };
  });
}

export const VERIFIED_ZK_FLEET = [
  {
    id: 'dev_main_192_168_117_200',
    name: 'Time Office 1',
    ip: '192.168.117.200',
    port: 4370,
    model: 'MB2000/ID',
    serialNumber: 'BRC7233360063',
    deviceNumber: 1,
    commType: 'Ethernet',
    direction: 'AUTO' as const,
    enabled: true,
    protocolMode: 'Auto',
    commKey: 0,
    deviceCapacityUsers: 369,
    adminCount: 2,
    fpCount: 697,
    faceCount: 149,
    palmCount: 0,
    userFaceCount: 149,
    passwordCount: 0,
    opLogCount: 1,
    deviceCapacityLogs: 50062,
    autoSyncMinutes: 15
  },
  {
    id: 'dev_factory_192_168_117_201',
    name: 'Time Office 3',
    ip: '192.168.117.201',
    port: 4370,
    model: 'MB2000/ID',
    serialNumber: 'BRC7233360027',
    deviceNumber: 1,
    commType: 'Ethernet',
    direction: 'AUTO' as const,
    enabled: true,
    protocolMode: 'Auto',
    commKey: 0,
    deviceCapacityUsers: 362,
    adminCount: 3,
    fpCount: 687,
    faceCount: 209,
    palmCount: 0,
    userFaceCount: 209,
    passwordCount: 0,
    opLogCount: 2,
    deviceCapacityLogs: 32876,
    autoSyncMinutes: 15
  },
  {
    id: 'dev_office_192_168_13_103',
    name: 'ISTS Office',
    ip: '192.168.13.103',
    port: 4370,
    model: 'MB2000',
    serialNumber: 'MFP3241900135',
    deviceNumber: 1,
    commType: 'Ethernet',
    direction: 'AUTO' as const,
    enabled: true,
    protocolMode: 'Auto',
    commKey: 0,
    deviceCapacityUsers: 103,
    adminCount: 3,
    fpCount: 204,
    faceCount: 67,
    palmCount: 0,
    userFaceCount: 67,
    passwordCount: 0,
    opLogCount: 2,
    deviceCapacityLogs: 67963,
    autoSyncMinutes: 15
  }
] as const;

export async function replaceWithVerifiedZkFleetInSqlite() {
  return withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    const now = new Date().toISOString();

    const existingMap = new Map<string, any>();
    let removedCount = 0;

    try {
      const devRes = db.exec('SELECT id, data FROM zk_devices');
      if (devRes.length > 0) {
        for (const r of devRes[0].values) {
          const id = String(r[0]);
          let d: any = {};
          try { d = JSON.parse(String(r[1] || '{}')); } catch {}
          existingMap.set(id, d);
        }
      }
    } catch {}

    const verifiedIds = new Set<string>(VERIFIED_ZK_FLEET.map(v => v.id));

    try { db.run('ROLLBACK'); } catch {}
    db.run('BEGIN TRANSACTION');

    // 1. Migrate legacy ID dev_office_192_168_13_7 -> dev_office_192_168_13_103 in punches & logs
    try {
      const pRes = db.exec("SELECT id, data FROM attendance_punches WHERE device_id = 'dev_office_192_168_13_7'");
      if (pRes.length > 0) {
        const upPunch = db.prepare("UPDATE attendance_punches SET device_id = ?, data = ? WHERE id = ?");
        for (const r of pRes[0].values) {
          const pId = String(r[0]);
          let pObj: any = {};
          try { pObj = JSON.parse(String(r[1] || '{}')); } catch {}
          pObj.deviceId = 'dev_office_192_168_13_103';
          pObj.deviceName = 'ISTS Office';
          pObj.deviceIP = '192.168.13.103';
          upPunch.run(['dev_office_192_168_13_103', JSON.stringify(pObj), pId]);
        }
        upPunch.free();
      }
    } catch {}

    try {
      const lRes = db.exec('SELECT id, data FROM zk_sync_logs');
      if (lRes.length > 0) {
        const upLog = db.prepare('UPDATE zk_sync_logs SET data = ? WHERE id = ?');
        for (const r of lRes[0].values) {
          const lId = String(r[0]);
          let lObj: any = {};
          try { lObj = JSON.parse(String(r[1] || '{}')); } catch {}
          let dirty = false;
          if (lObj.deviceId === 'dev_office_192_168_13_7') {
            lObj.deviceId = 'dev_office_192_168_13_103';
            lObj.deviceName = 'ISTS Office';
            dirty = true;
          } else if (lObj.deviceName === 'Office Device') {
            lObj.deviceName = 'ISTS Office';
            dirty = true;
          } else if (lObj.deviceName === 'Main Device') {
            lObj.deviceName = 'Time Office 2';
            dirty = true;
          } else if (lObj.deviceName === 'Factory Device') {
            lObj.deviceName = 'Time Office 1';
            dirty = true;
          }
          if (dirty) {
            upLog.run([JSON.stringify(lObj), lId]);
          }
        }
        upLog.free();
      }
    } catch {}

    try {
      const uRes = db.exec('SELECT id, data FROM zk_unmapped_punches');
      if (uRes.length > 0) {
        const upUnmapped = db.prepare('UPDATE zk_unmapped_punches SET data = ? WHERE id = ?');
        for (const r of uRes[0].values) {
          const uId = String(r[0]);
          let uObj: any = {};
          try { uObj = JSON.parse(String(r[1] || '{}')); } catch {}
          if (uObj.deviceId === 'dev_office_192_168_13_7') {
            uObj.deviceId = 'dev_office_192_168_13_103';
            uObj.deviceName = 'ISTS Office';
            uObj.deviceIP = '192.168.13.103';
            upUnmapped.run([JSON.stringify(uObj), uId]);
          }
        }
        upUnmapped.free();
      }
    } catch {}

    // 2. Remove all previous / unverified device rows
    const delStmt = db.prepare('DELETE FROM zk_devices WHERE id = ?');
    for (const oldId of existingMap.keys()) {
      if (!verifiedIds.has(oldId)) {
        delStmt.run([oldId]);
        removedCount++;
      }
    }
    delStmt.free();

    // 3. Upsert the 3 verified devices with exact hardware parameters
    const upsertDev = db.prepare(`
      INSERT INTO zk_devices (id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data=excluded.data,
        updated_at=excluded.updated_at
    `);

    const legacyOffice = existingMap.get('dev_office_192_168_13_7');
    for (const spec of VERIFIED_ZK_FLEET) {
      const prev =
        existingMap.get(spec.id) ||
        (spec.id === 'dev_office_192_168_13_103' ? legacyOffice : undefined) ||
        {};
      const merged = {
        status: prev.status || 'online',
        lastConnection: prev.lastConnection || now,
        lastSync: prev.lastSync || now,
        lastSuccessfulSync: prev.lastSuccessfulSync,
        lastLatencyMs: prev.lastLatencyMs,
        lastProbeAt: prev.lastProbeAt,
        lastProtocolUsed: prev.lastProtocolUsed || 'TCP-4370 (Ethernet)',
        lastError: prev.lastError || '',
        ...spec
      };
      upsertDev.run([spec.id, JSON.stringify(merged), now]);
    }
    upsertDev.free();

    const stats = updateDeviceStatsFromSqlite(db);
    db.run('COMMIT');
    saveSqliteDb();

    const outRes = db.exec('SELECT data FROM zk_devices');
    const devices = outRes.length > 0
      ? outRes[0].values.map((v: any[]) => {
          try { return JSON.parse(String(v[0])); } catch { return null; }
        }).filter(Boolean)
      : [];

    return {
      success: true,
      removedCount,
      deviceCount: devices.length,
      devices,
      totalSystemLogs: stats.totalSystemLogs,
      activeEmployees: stats.activeEmpCount,
      database: 'SQLite',
      dbPath: getSqliteDbPath()
    };
  });
}

export async function readStoredPunchesFromSqlite(options: { deviceId?: string; limit?: number } = {}) {
  const db = await getSqliteDb();
  const limit = Math.max(1, Math.min(1000, Number(options.limit) || 100));
  const filterDevId = String(options.deviceId || '').trim();

  let totalForQuery = 0;
  let totalAll = 0;
  const punches: any[] = [];

  try {
    const totRes = db.exec('SELECT COUNT(*) FROM attendance_punches');
    if (totRes.length > 0 && totRes[0].values.length > 0) {
      totalAll = Number(totRes[0].values[0][0] || 0);
    }

    if (filterDevId) {
      const cStmt = db.prepare('SELECT COUNT(*) FROM attendance_punches WHERE device_id = ?');
      cStmt.bind([filterDevId]);
      if (cStmt.step()) {
        totalForQuery = Number(cStmt.get()[0] || 0);
      }
      cStmt.free();

      const qStmt = db.prepare(
        'SELECT id, employee_id, punch_datetime, device_id, source, data, created_at FROM attendance_punches WHERE device_id = ? ORDER BY punch_datetime DESC LIMIT ?'
      );
      qStmt.bind([filterDevId, limit]);
      while (qStmt.step()) {
        const row = qStmt.get();
        let parsed: any = {};
        try { parsed = JSON.parse(String(row[5] || '{}')); } catch {}
        punches.push({
          ...parsed,
          id: String(parsed.id || row[0] || ''),
          employeeId: String(parsed.employeeId || row[1] || ''),
          punchDatetime: String(parsed.punchDatetime || row[2] || ''),
          deviceId: String(parsed.deviceId || row[3] || ''),
          source: String(parsed.source || row[4] || 'ZKTeco')
        });
      }
      qStmt.free();
    } else {
      totalForQuery = totalAll;
      const qStmt = db.prepare(
        'SELECT id, employee_id, punch_datetime, device_id, source, data, created_at FROM attendance_punches ORDER BY punch_datetime DESC LIMIT ?'
      );
      qStmt.bind([limit]);
      while (qStmt.step()) {
        const row = qStmt.get();
        let parsed: any = {};
        try { parsed = JSON.parse(String(row[5] || '{}')); } catch {}
        punches.push({
          ...parsed,
          id: String(parsed.id || row[0] || ''),
          employeeId: String(parsed.employeeId || row[1] || ''),
          punchDatetime: String(parsed.punchDatetime || row[2] || ''),
          deviceId: String(parsed.deviceId || row[3] || ''),
          source: String(parsed.source || row[4] || 'ZKTeco')
        });
      }
      qStmt.free();
    }
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || 'SQLite punch read failed',
      database: 'SQLite',
      dbPath: getSqliteDbPath(),
      totalAll: 0,
      totalMatched: 0,
      punches: []
    };
  }

  return {
    success: true,
    database: 'SQLite',
    dbPath: getSqliteDbPath(),
    deviceId: filterDevId || 'ALL',
    totalAll,
    totalMatched: totalForQuery,
    returnedCount: punches.length,
    latestPunchDatetime: punches[0]?.punchDatetime || null,
    punches
  };
}

export async function normalizeDefaultFleetNamesAndDirectionsInSqlite(): Promise<number> {
  return withSqliteWriteLock(async () => {
    const db = await getSqliteDb();
    let updated = 0;
    const now = new Date().toISOString();
    try {
      const devRes = db.exec('SELECT id, data FROM zk_devices');
      if (devRes.length === 0) return 0;

      try { db.run('ROLLBACK'); } catch {}
      db.run('BEGIN TRANSACTION');
      const upStmt = db.prepare('UPDATE zk_devices SET data = ?, updated_at = ? WHERE id = ?');

      for (const r of devRes[0].values) {
        const id = String(r[0]);
        let d: any = {};
        try { d = JSON.parse(String(r[1] || '{}')); } catch { continue; }
        let dirty = false;

        if (id === 'dev_main_192_168_117_200' && d.name === 'Time Office 2') {
          d.name = 'Time Office 1';
          dirty = true;
        }
        if (id === 'dev_factory_192_168_117_201' && d.name === 'Time Office 1') {
          d.name = 'Time Office 3';
          dirty = true;
        }
        if (!d.direction) {
          d.direction = 'AUTO';
          dirty = true;
        }
        if (dirty) {
          upStmt.run([JSON.stringify(d), now, id]);
          updated++;
        }
      }

      upStmt.free();
      db.run('COMMIT');
      if (updated > 0) saveSqliteDb();
    } catch {
      try { db.run('ROLLBACK'); } catch {}
    }
    return updated;
  });
}

export async function getAttendanceLogsForExportFromSqlite(options: {
  startDate: string;
  endDate: string;
  onlyDatabaseEmployees?: boolean;
}): Promise<{
  success: boolean;
  startDate: string;
  endDate: string;
  onlyDatabaseEmployees: boolean;
  totalRows: number;
  rows: Array<{ Department: string; Name: string; EmpCode: string; PunchDateTime: string }>;
}> {
  const start = String(options.startDate || '').trim().slice(0, 10);
  const end = String(options.endDate || '').trim().slice(0, 10);
  const onlyDb = options.onlyDatabaseEmployees !== false;

  return withReadOnlySqliteSnapshot((db) => {
    const empById = new Map<string, { id: string; name: string; department: string }>();
    const empLookup = new Map<string, string>();
    const mapByDevUser = new Map<string, string>();

    try {
      const eRes = db.exec('SELECT id, name, department, data FROM employees');
      if (eRes.length > 0) {
        for (const r of eRes[0].values) {
          const eid = String(r[0] || '').trim();
          if (!eid) continue;
          let name = String(r[1] || eid).trim();
          let dept = String(r[2] || 'General').trim();
          let dataObj: any = {};
          if (r[3]) {
            try {
              dataObj = JSON.parse(String(r[3]));
              if (dataObj.name) name = String(dataObj.name).trim();
              if (dataObj.department) dept = String(dataObj.department).trim();
            } catch {}
          }
          empById.set(eid, { id: eid, name, department: dept });
          empLookup.set(eid, eid);
          empLookup.set(eid.toLowerCase(), eid);
          const norm = normalizeEmpId(eid);
          if (norm) empLookup.set(norm, eid);
        }
      }
    } catch {}

    try {
      const mRes = db.exec('SELECT device_user_id, employee_id FROM zk_user_mappings');
      if (mRes.length > 0) {
        for (const r of mRes[0].values) {
          const devUid = String(r[0] || '').trim();
          const empId = String(r[1] || '').trim();
          if (devUid && empId) {
            mapByDevUser.set(devUid, empId);
            mapByDevUser.set(devUid.toLowerCase(), empId);
            const norm = normalizeEmpId(devUid);
            if (norm) mapByDevUser.set(norm, empId);
          }
        }
      }
    } catch {}

    const rows: Array<{ Department: string; Name: string; EmpCode: string; PunchDateTime: string }> = [];
    const stmt = db.prepare(`
      SELECT id, employee_id, punch_datetime, source, data
      FROM attendance_punches
      WHERE substr(punch_datetime, 1, 10) >= ? AND substr(punch_datetime, 1, 10) <= ?
      ORDER BY punch_datetime ASC
    `);
    stmt.bind([start, end]);
    while (stmt.step()) {
      const row = stmt.get();
      const id = String(row[0] || '').trim();
      const rawEmpId = String(row[1] || '').trim();
      const rawDt = String(row[2] || '').trim();
      let source = String(row[3] || '').trim();
      let pObj: any = {};
      if (row[4]) {
        try { pObj = JSON.parse(String(row[4])); } catch {}
      }
      source = String(pObj.source || source || '');

      // Exclude manual attendance corrections / forced attendance; keep terminal & uploaded punch logs
      if (
        source === 'Manual' ||
        id.startsWith('manual_') ||
        id.startsWith('force_') ||
        pObj.importFormat === 'manual'
      ) {
        continue;
      }

      const normRaw = normalizeEmpId(rawEmpId);
      const matchedEmpId =
        empLookup.get(rawEmpId) ||
        empLookup.get(rawEmpId.toLowerCase()) ||
        (normRaw ? empLookup.get(normRaw) : undefined) ||
        mapByDevUser.get(rawEmpId) ||
        (normRaw ? mapByDevUser.get(normRaw) : undefined);

      const empInfo = matchedEmpId ? empById.get(matchedEmpId) : undefined;
      if (onlyDb && !empInfo) {
        continue;
      }

      const formattedDt = rawDt.replace('T', ' ').slice(0, 19);
      rows.push({
        Department: empInfo?.department || 'Unregistered',
        Name: empInfo?.name || String(pObj.deviceUserId || rawEmpId),
        EmpCode: empInfo?.id || rawEmpId,
        PunchDateTime: formattedDt
      });
    }
    stmt.free();

    if (!onlyDb) {
      try {
        const uStmt = db.prepare('SELECT data FROM zk_unmapped_punches');
        while (uStmt.step()) {
          const row = uStmt.get();
          let uObj: any = {};
          try { uObj = JSON.parse(String(row[0] || '{}')); } catch { continue; }
          if (uObj.status && uObj.status !== 'pending') continue;
          const dt = String(uObj.punchDateTime || '').replace('T', ' ').slice(0, 19);
          const datePart = dt.slice(0, 10);
          if (!datePart || datePart < start || datePart > end) continue;
          rows.push({
            Department: 'Unmapped',
            Name: String(uObj.deviceName || 'Biometric Terminal'),
            EmpCode: String(uObj.deviceUserId || ''),
            PunchDateTime: dt
          });
        }
        uStmt.free();
      } catch {}
      rows.sort((a, b) => a.PunchDateTime.localeCompare(b.PunchDateTime));
    }

    return {
      success: true,
      startDate: start,
      endDate: end,
      onlyDatabaseEmployees: onlyDb,
      totalRows: rows.length,
      rows
    };
  });
}
