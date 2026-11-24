import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import dotenv from 'dotenv';
import { localRouter } from './src/server/localApi.js';
import { getSqliteDb, getSqliteDbPath } from './src/server/sqliteDb.js';
import {
  zkPollingState,
  getZkPollingSummaryFromSqlite,
  pollAllZkDevicesToSqlite,
  pollSingleZkDeviceToSqlite,
  ingestZkPunchesToSqlite,
  reconcileSystemDataInSqlite,
  testAndStoreZkDeviceConnection,
  probeAllZkDevicesHealth,
  replaceWithVerifiedZkFleetInSqlite,
  readStoredPunchesFromSqlite,
  parseAdmsAttlogText,
  normalizeZkDateTime,
  recordAdmsDeviceHeartbeat,
  scanWatchFolderAndIngestToSqlite,
  loadZkSchedulerConfigFromSqlite,
  saveZkSchedulerConfigToSqlite,
  detectExternalPunchChangesReadOnly,
  setZkCollectorMode
} from './src/server/zkPoller.js';
import { registerSseClient, broadcastSseEvent } from './src/server/realtimeHub.js';
import { discoverZkDevicesOnSubnet } from './src/server/zkProtocol.js';
import {
  authenticateLocalUser,
  claimOwnerAdminPassword,
  createOrUpdateSystemUser,
  deleteSystemUser,
  getOwnerBootstrapStatus,
  getSystemScopeOptions,
  isBootstrapSuperAdminEmail,
  listSystemUsers,
  resolveSessionProfile,
  updateUserPassword
} from './src/server/userAccess.js';
import {
  extractBearerToken,
  signSessionToken,
  verifySessionToken
} from './src/server/authSession.js';
import {
  generateSqliteHolidayValidationReport,
  reconcileHolidaysAndPreventOverlapsInSqlite,
  syncHolidaysMasterTableWithLock,
  validateIncomingPunchesAgainstDb,
} from './src/server/holidayValidationService.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Respect Caddy / reverse proxy headers (X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host)
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Lightweight gzip compression for JSON & text payloads over LAN / Caddy
  app.use((req, res, next) => {
    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    if (!acceptEncoding.includes('gzip')) {
      return next();
    }
    const origJson = res.json.bind(res);
    res.json = (body: any) => {
      try {
        const jsonStr = JSON.stringify(body);
        if (jsonStr.length < 1024) {
          return origJson(body);
        }
        const gz = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        return res.send(gz);
      } catch {
        return origJson(body);
      }
    };
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Health Check Endpoint (Used by Caddy active health checks)
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ status: 'ok', database: 'SQLite', dbPath: getSqliteDbPath() });
  });

  // =========================================================================
  // Strict Provisioned-Only Authentication & Session Middleware
  // =========================================================================
  app.get('/api/auth/bootstrap-status', async (_req, res) => {
    try {
      const status = await getOwnerBootstrapStatus();
      return res.json(status);
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to read setup status' });
    }
  });

  app.post('/api/auth/setup-admin', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = await claimOwnerAdminPassword(String(email || ''), String(password || ''));
      if ('error' in result) {
        return res.status(result.statusCode).json({ success: false, error: result.error });
      }
      const sessionToken = signSessionToken(result.user);
      return res.json({ success: true, user: result.user, sessionToken });
    } catch (e: any) {
      if (e?.message === 'ALREADY_CLAIMED') {
        return res.status(403).json({ success: false, error: 'Owner password is already configured.' });
      }
      return res.status(500).json({ success: false, error: e.message || 'Owner setup failed' });
    }
  });

  app.post(['/api/auth/login', '/api/auth/local-login'], async (req, res) => {
    try {
      const { email, username, identifier, password } = req.body || {};
      const loginId = String(identifier || email || username || '').trim();
      const result = await authenticateLocalUser(loginId, String(password || ''));
      if ('error' in result) {
        return res.status(result.statusCode).json({
          success: false,
          error: result.error,
          setupRequired: Boolean(result.setupRequired)
        });
      }
      const sessionToken = signSessionToken(result.user);
      return res.json({ success: true, user: result.user, sessionToken });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Authentication failed' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    return res.json({ success: true });
  });

  // Shared token verification helper
  const authenticateRequest = async (req: express.Request) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) return null;
    const payload = verifySessionToken(token);
    if (!payload) return null;

    const liveProfile = await resolveSessionProfile(payload.email);
    if (!liveProfile || liveProfile.status === 'Suspended') {
      return null;
    }
    return liveProfile;
  };

  const requireAuth: express.RequestHandler = async (req, res, next) => {
    try {
      const profile = await authenticateRequest(req);
      if (!profile) {
        return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
      }
      (req as any).authUser = profile;
      (req as any).callerEmail = profile.email;
      return next();
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
    }
  };

  const requireSuperAdmin: express.RequestHandler = async (req, res, next) => {
    try {
      const profile = await authenticateRequest(req);
      if (!profile) {
        return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
      }
      const isSuper =
        profile.status === 'Active' &&
        (profile.role === 'Super Admin' || isBootstrapSuperAdminEmail(profile.email));
      if (!isSuper) {
        return res.status(403).json({
          success: false,
          error: 'Only Super Admin can perform administrative or user management actions.'
        });
      }
      (req as any).authUser = profile;
      (req as any).callerEmail = profile.email;
      return next();
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
    }
  };

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    return res.json({ authenticated: true, user: (req as any).authUser });
  });

  app.get('/api/auth/session-profile', requireAuth, async (req, res) => {
    return res.json({ user: (req as any).authUser });
  });

  app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const { currentPassword, newPassword } = req.body || {};
      const result = await updateUserPassword(
        authUser.email,
        String(currentPassword || ''),
        String(newPassword || '')
      );
      if ('error' in result) {
        return res.status(result.statusCode).json({ success: false, error: result.error });
      }
      return res.json({ success: true, message: 'Password updated successfully.' });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Password update failed' });
    }
  });

  // Authenticated Real-Time SSE Broadcast Endpoint (supports Header or ?token= for EventSource)
  app.get('/api/events', async (req, res) => {
    try {
      const headerToken = extractBearerToken(req.headers.authorization);
      const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
      const token = headerToken || queryToken;
      if (!token) {
        return res.status(401).json({ success: false, error: 'Authentication required for live updates.' });
      }
      const payload = verifySessionToken(token);
      if (!payload) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
      }
      const liveProfile = await resolveSessionProfile(payload.email);
      if (!liveProfile || liveProfile.status === 'Suspended') {
        return res.status(401).json({ success: false, error: 'Session is suspended or unauthorized.' });
      }
      registerSseClient(liveProfile, res, req.ip || '');
    } catch {
      if (!res.headersSent) {
        return res.status(401).json({ success: false, error: 'SSE authentication failed.' });
      }
    }
  });

  // Mount Protected Local SQLite & Disk Storage API Router
  app.use('/api/local', requireAuth, localRouter);
  app.use('/api/payroll', requireAuth, localRouter);

  // User Access & Role Management Routes (Strictly Super Admin Only)
  app.get('/api/admin/scope-options', requireSuperAdmin, async (_req, res) => {
    try {
      const options = await getSystemScopeOptions();
      return res.json(options);
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to load scope options' });
    }
  });

  app.post('/api/admin/create-user', requireSuperAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const createdRes = await createOrUpdateSystemUser({
        id: body.id,
        username: body.username || body.displayName || '',
        email: body.email || '',
        password: body.password,
        role: body.role || 'Supervisor',
        status: body.status || 'Active',
        assignedDepartments: body.assignedDepartments || [],
        assignedSections: body.assignedSections || [],
        linkedEmployeeId: body.linkedEmployeeId,
        permissions: body.permissions,
        notes: body.notes,
        createdBy: (req as any).callerEmail || 'Super Admin'
      });
      broadcastSseEvent('UserPermissionsUpdated', {
        email: createdRes.user.email,
        userId: createdRes.user.id,
        role: createdRes.user.role,
        status: createdRes.user.status,
        updatedBy: (req as any).callerEmail || 'Super Admin'
      });
      return res.json({ success: true, uid: createdRes.user.id, user: createdRes.user, created: createdRes.created });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to create user' });
    }
  });

  app.put('/api/admin/users/:id', requireSuperAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const updatedRes = await createOrUpdateSystemUser(
        {
          id: req.params.id,
          username: body.username || body.displayName || '',
          email: body.email || '',
          password: body.password,
          role: body.role || 'Supervisor',
          status: body.status || 'Active',
          assignedDepartments: body.assignedDepartments || [],
          assignedSections: body.assignedSections || [],
          linkedEmployeeId: body.linkedEmployeeId,
          permissions: body.permissions,
          notes: body.notes,
          createdBy: (req as any).callerEmail || 'Super Admin'
        },
        req.params.id
      );
      broadcastSseEvent('UserPermissionsUpdated', {
        email: updatedRes.user.email,
        userId: updatedRes.user.id,
        role: updatedRes.user.role,
        status: updatedRes.user.status,
        updatedBy: (req as any).callerEmail || 'Super Admin'
      });
      return res.json({ success: true, user: updatedRes.user });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to update user' });
    }
  });

  app.delete('/api/admin/users/:id', requireSuperAdmin, async (req, res) => {
    try {
      await deleteSystemUser(req.params.id, (req as any).callerEmail);
      broadcastSseEvent('UserPermissionsUpdated', {
        userId: req.params.id,
        deleted: true,
        updatedBy: (req as any).callerEmail || 'Super Admin'
      });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to delete user' });
    }
  });

  app.get('/api/admin/users', requireSuperAdmin, async (_req, res) => {
    try {
      const users = await listSystemUsers();
      return res.json(users);
    } catch {
      return res.json([]);
    }
  });

  // =========================================================================
  // ZKTeco System-Aligned Polling Engine & SQLite Storage Endpoints
  // =========================================================================
  const hasDeviceOrImportAccess = (user: any): boolean => {
    if (!user || user.status === 'Suspended') return false;
    if (user.role === 'Super Admin' || isBootstrapSuperAdminEmail(user.email)) return true;
    return Boolean(user.permissions?.modules?.devices || user.permissions?.modules?.import);
  };

  const requireDeviceAccess: express.RequestHandler = (req, res, next) => {
    const authUser = (req as any).authUser;
    if (!hasDeviceOrImportAccess(authUser)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Biometric device operations require Device Setup or Import permission.'
      });
    }
    return next();
  };

  app.get('/api/zk/auto-poll/status', requireAuth, async (req, res) => {
    try {
      const summary = await getZkPollingSummaryFromSqlite();
      const authUser = (req as any).authUser;
      const isSuper = authUser?.role === 'Super Admin' || isBootstrapSuperAdminEmail(authUser?.email);
      if (!isSuper) {
        const { dbPath: _dbp, watchFolderPath: _wfp, ...safeSummary } = summary as any;
        return res.json({ ...safeSummary, dbPath: 'Database.db (Protected)' });
      }
      return res.json(summary);
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to load ZKT polling status' });
    }
  });

  app.post('/api/zk/mode', requireSuperAdmin, async (req, res) => {
    try {
      const allowDirectWrite = Boolean(req.body?.allowDirectWrite);
      const modeRes = setZkCollectorMode(allowDirectWrite);
      const summary = await getZkPollingSummaryFromSqlite();
      broadcastSseEvent('PunchSnapshotUpdated', {
        action: 'collector_mode_changed',
        readOnlyMode: modeRes.readOnlyMode,
        punchMode: modeRes.mode,
        timestamp: new Date().toISOString()
      });
      return res.json({ success: true, ...modeRes, summary });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Failed to switch ZKT collector mode' });
    }
  });

  app.post('/api/zk/auto-poll/toggle', requireAuth, requireDeviceAccess, async (req, res) => {
    try {
      const { enabled, intervalMinutes, intervalSeconds } = req.body || {};
      let nextMinutes = zkPollingState.intervalMinutes;
      if (typeof intervalMinutes === 'number' && Number.isFinite(intervalMinutes) && intervalMinutes >= 1) {
        nextMinutes = Math.max(1, Math.min(1440, Math.round(intervalMinutes)));
      } else if (typeof intervalSeconds === 'number' && Number.isFinite(intervalSeconds) && intervalSeconds >= 60) {
        nextMinutes = Math.max(1, Math.min(1440, Math.round(intervalSeconds / 60)));
      }

      await saveZkSchedulerConfigToSqlite({
        enabled: typeof enabled === 'boolean' ? enabled : zkPollingState.enabled,
        intervalMinutes: nextMinutes
      });

      const summary = await getZkPollingSummaryFromSqlite();
      res.json({ success: true, ...summary });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to update ZKT auto-fetch schedule' });
    }
  });

  app.post(['/api/zk/auto-poll/run-now', '/api/zk/fetch-all'], requireAuth, requireDeviceAccess, async (req, res) => {
    try {
      const forceDirectPoll = Boolean(req.body?.forceDirectPoll);
      const pollRes = await pollAllZkDevicesToSqlite({
        dueOnly: false,
        forceDirectPoll,
        mode: req.body?.mode || 'Manual Batch Poll'
      });
      if ('readOnlyMode' in pollRes && pollRes.readOnlyMode && pollRes.skippedDirectWrite) {
        return res.json({
          ...pollRes,
          database: 'SQLite',
          message: `Read-Only Collector Mode active: scanned SQLite snapshot (${pollRes.punchCount} total punches${pollRes.changed ? `, ${pollRes.delta} new detected` : ', up to date'}). External biometric collector owns raw punch writes.`
        });
      }
      res.json({
        ...pollRes,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        message: 'skippedBusy' in pollRes && pollRes.skippedBusy
          ? 'ZKT polling cycle already running'
          : `Polled ${'devicesPolled' in pollRes ? pollRes.devicesPolled : 0} enabled devices (${'reachableDevices' in pollRes ? pollRes.reachableDevices : 0} reachable) · ${'totalNew' in pollRes ? pollRes.totalNew : 0} new punches stored in SQLite (${'totalSystemLogs' in pollRes ? pollRes.totalSystemLogs : 0} total logs).`
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'ZKT batch poll failed' });
    }
  });

  app.post('/api/zk/fetch-device', requireAuth, requireDeviceAccess, async (req, res) => {
    try {
      const { deviceId, ip, mode, forceDirectPoll } = req.body || {};
      const target = String(deviceId || ip || '').trim();
      if (!target) {
        return res.status(400).json({ success: false, error: 'deviceId or ip is required' });
      }
      if (zkPollingState.readOnlyMode && !forceDirectPoll) {
        const obs = await detectExternalPunchChangesReadOnly();
        return res.json({
          success: true,
          readOnlyMode: true,
          skippedDirectWrite: true,
          deviceId: target,
          recordsRead: 0,
          newRecords: obs.delta,
          duplicates: 0,
          punchCount: obs.punchCount,
          message: `Read-Only Collector Mode active: observed ${obs.punchCount} SQLite punches without overwriting raw punch tables.`
        });
      }
      const result = await pollSingleZkDeviceToSqlite(target, mode || 'Single Device Sync');
      return res.json({
        ...result,
        database: 'SQLite',
        dbPath: getSqliteDbPath()
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Device poll failed' });
    }
  });

  // Direct LAN Link for fetching punches or observing SQLite punches
  app.get('/api/zk/fetch-punch', requireAuth, requireDeviceAccess, async (req, res) => {
    try {
      const target = String(req.query.deviceId || req.query.ip || '').trim();
      const mode = String(req.query.mode || 'Direct Fetch Punch Link').trim();
      const forceDirectPoll = String(req.query.forceDirectPoll || '') === 'true';
      if (zkPollingState.readOnlyMode && !forceDirectPoll) {
        const obs = await detectExternalPunchChangesReadOnly();
        const stored = await readStoredPunchesFromSqlite({ deviceId: target || undefined, limit: 25 });
        return res.json({
          success: true,
          readOnlyMode: true,
          skippedDirectWrite: true,
          database: 'SQLite',
          storedInSqlite: target ? stored.totalMatched : stored.totalAll,
          latestStoredPunches: stored.punches,
          ...obs
        });
      }
      if (target) {
        const result = await pollSingleZkDeviceToSqlite(target, mode);
        const stored = await readStoredPunchesFromSqlite({ deviceId: result.deviceId || target, limit: 25 });
        return res.json({
          ...result,
          database: 'SQLite',
          dbPath: getSqliteDbPath(),
          storedInSqlite: stored.totalMatched,
          latestStoredPunches: stored.punches
        });
      }
      const pollRes = await pollAllZkDevicesToSqlite({ dueOnly: false, forceDirectPoll, mode });
      const stored = await readStoredPunchesFromSqlite({ limit: 25 });
      return res.json({
        ...pollRes,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        storedInSqlite: stored.totalAll,
        latestStoredPunches: stored.punches
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Fetch punch failed' });
    }
  });

  // Direct LAN Link for reading stored punches directly from SQLite (authenticated + role-scoped)
  app.get('/api/zk/read-sqlite', requireAuth, async (req, res) => {
    try {
      const deviceId = req.query.deviceId ? String(req.query.deviceId).trim() : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const data = await readStoredPunchesFromSqlite({ deviceId, limit });
      const authUser = (req as any).authUser;
      const isSuper = authUser?.role === 'Super Admin' || isBootstrapSuperAdminEmail(authUser?.email);
      if (!isSuper) {
        const { dbPath: _dbp, ...safeData } = data as any;
        return res.json(safeData);
      }
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'SQLite read failed' });
    }
  });

  app.post('/api/zk/devices/replace-fleet', requireSuperAdmin, async (_req, res) => {
    try {
      const result = await replaceWithVerifiedZkFleetInSqlite();
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Fleet replacement failed' });
    }
  });

  app.post('/api/zk/reconcile-system', requireAuth, async (_req, res) => {
    try {
      const recon = await reconcileSystemDataInSqlite();
      res.json({
        ...recon,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        message: `System reconciliation complete: ${recon.mappingsCreated} mappings synced, ${recon.unmappedResolved} unmapped resolved, ${recon.punchesAdded} punches stored across ${recon.activeEmployees} active employees.`
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || 'System reconciliation failed' });
    }
  });

  app.post('/api/zk/agent/test-connection', requireAuth, async (req, res) => {
    const { deviceId, ip, port, commKey, model, protocolMode } = req.body || {};
    try {
      const now = new Date().toISOString();
      const targetPort = Number(port) || 4370;
      const hwTest = await testAndStoreZkDeviceConnection({
        deviceId,
        ip: String(ip || '').trim(),
        port: targetPort,
        commKey: Number(commKey) || 0,
        model,
        protocolMode: protocolMode || 'Auto'
      });

      res.json({
        success: hwTest.reachable,
        reachable: hwTest.reachable,
        status: hwTest.reachable ? 'online' : 'offline',
        tcpReachable: hwTest.reachable,
        protocol: hwTest.protocol || 'none',
        latencyMs: hwTest.latencyMs,
        serialNumber: hwTest.serialNumber || '',
        freeSizes: hwTest.freeSizes || null,
        attempts: hwTest.attempts || [],
        error: hwTest.error || undefined,
        message: hwTest.reachable
          ? `Connected to ${model || 'ZKTeco'} at ${ip}:${targetPort} via ${(hwTest.protocol || 'TCP').toUpperCase()} (${hwTest.latencyMs}ms)${hwTest.freeSizes ? ` · ${hwTest.freeSizes.logCount} logs on device` : ''}`
          : (hwTest.error || `Device ${ip}:${targetPort} did not respond on TCP/UDP/Web-HTTP (LAN unreachable from current host)`),
        testedAt: now,
        diagnostics: {
          ip,
          port: targetPort,
          model: model || 'MB2000/ID',
          protocolMode: protocolMode || 'Auto',
          protocol: (hwTest.protocol || 'TCP/UDP/Web-HTTP').toUpperCase(),
          database: `SQLite (${getSqliteDbPath()})`,
          autoPolling: zkPollingState.enabled ? 'ENABLED' : 'PAUSED'
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Connection test failed' });
    }
  });

  app.post('/api/zk/health/probe', requireAuth, async (req, res) => {
    try {
      const timeoutMs = Number(req.body?.timeoutMs) || 1500;
      const probe = await probeAllZkDevicesHealth(timeoutMs);
      res.json(probe);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || 'Biometric health probe failed' });
    }
  });

  app.post('/api/zk/discover', requireAuth, async (req, res) => {
    try {
      const { subnetPrefix, startHost, endHost, port } = req.body || {};
      const prefix = String(subnetPrefix || '192.168.1').trim();
      const found = await discoverZkDevicesOnSubnet(
        prefix,
        Number(startHost) || 1,
        Number(endHost) || 254,
        Number(port) || 4370
      );
      return res.json({
        success: true,
        subnetPrefix: prefix,
        port: Number(port) || 4370,
        found,
        message: found.length > 0
          ? `Discovered ${found.length} compatible ZKTeco terminal(s) on ${prefix}.x`
          : `No ZKTeco devices responded on ${prefix}.1-${Number(endHost) || 254}:${Number(port) || 4370}`
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, error: e.message || 'Discovery failed' });
    }
  });

  app.post('/api/zk/watch-folder/scan', requireAuth, requireDeviceAccess, async (req, res) => {
    try {
      const result = await scanWatchFolderAndIngestToSqlite(req.body?.deviceId);
      return res.json({
        ...result,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        message: `Scanned ${result.filesScanned} file(s) in Watch Folder: ${result.newRecords} new punches stored in SQLite (${result.duplicates} duplicates skipped).`
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Watch folder scan failed' });
    }
  });

  app.post('/api/zk/upload-raw', requireAuth, requireDeviceAccess, async (req, res) => {
    const startTime = Date.now();
    try {
      const { rawText, deviceId, deviceName, deviceIP, mode } = req.body || {};
      const parsed = parseAdmsAttlogText(String(rawText || ''));
      if (parsed.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid biometric punch lines detected in input.' });
      }
      const ingested = await ingestZkPunchesToSqlite({
        deviceId,
        deviceName: deviceName || 'Raw Attlog Upload',
        deviceIP: deviceIP || 'USB/File',
        protocolUsed: 'Raw/Text Upload',
        punches: parsed,
        durationMs: Date.now() - startTime,
        mode: mode || 'Raw Log Import',
        deviceStatus: 'online',
        status: 'Success'
      });
      return res.json({
        ...ingested,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        message: `Parsed ${parsed.length} punches -> stored ${ingested.newRecords} new in SQLite (${ingested.duplicates} duplicates, ${ingested.unmappedCount} unmapped).`
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Raw upload failed' });
    }
  });

  // =========================================================================
  // ZKTeco ADMS Cloud Push & Local LAN Agent Ingestion -> SQLite Storage
  // =========================================================================
  app.get(['/iclock/cdata.aspx', '/iclock/cdata'], async (req, res) => {
    const sn = String(req.query.SN || req.query.sn || 'ZKDEVICE').trim();
    const remoteIp = String(req.ip || '').replace(/^::ffff:/, '');
    await recordAdmsDeviceHeartbeat(sn, remoteIp).catch(() => {});
    res.set('Content-Type', 'text/plain');
    res.send(`GET OPTION FROM: ${sn}\nStamp=99999999\nOpStamp=99999999\nErrorDelay=30\nDelay=15\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111111111\nRealtime=1\nEncrypt=0`);
  });

  app.post(['/iclock/cdata.aspx', '/iclock/cdata', '/iclock/fdata.aspx', '/iclock/fdata'], express.text({ limit: '50mb', type: '*/*' }), async (req, res) => {
    const sn = String(req.query.SN || req.query.sn || '').trim();
    const table = String(req.query.table || 'ATTLOG').toUpperCase();
    const remoteIp = String(req.ip || '').replace(/^::ffff:/, '');
    res.set('Content-Type', 'text/plain');

    try {
      if (sn) await recordAdmsDeviceHeartbeat(sn, remoteIp).catch(() => {});
      if (table === 'ATTLOG' || !req.query.table) {
        const rawText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
        const parsedPunches = parseAdmsAttlogText(rawText);
        if (parsedPunches.length === 0) {
          return res.send('OK: 0');
        }
        const ingested = await ingestZkPunchesToSqlite({
          serialNumber: sn || undefined,
          deviceIP: remoteIp || 'ADMS Push',
          protocolUsed: 'ADMS Push',
          punches: parsedPunches,
          mode: 'ADMS Push',
          deviceStatus: 'online',
          status: 'Success'
        });
        return res.send(`OK: ${ingested.recordsRead}`);
      }
      return res.send('OK');
    } catch (e: any) {
      console.error('[ADMS Push Error]:', e);
      return res.status(500).send('ERR');
    }
  });

  app.get(['/iclock/getrequest.aspx', '/iclock/getrequest'], async (req, res) => {
    const sn = String(req.query.SN || req.query.sn || '').trim();
    const remoteIp = String(req.ip || '').replace(/^::ffff:/, '');
    if (sn) await recordAdmsDeviceHeartbeat(sn, remoteIp).catch(() => {});
    res.set('Content-Type', 'text/plain');
    res.send('OK');
  });

  app.all(['/iclock/devicecmd.aspx', '/iclock/devicecmd'], (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK');
  });

  app.post('/api/zk/agent/sync', async (req, res) => {
    const startTime = Date.now();
    try {
      const authProfile = await authenticateRequest(req);
      const collectorKey = String(process.env.ZK_COLLECTOR_KEY || '').trim();
      const headerKey = String(req.headers['x-collector-key'] || '').trim();
      const remoteIp = String(req.ip || '').replace(/^::ffff:/, '');
      const isLoopback = remoteIp === '127.0.0.1' || remoteIp === '::1';

      if (authProfile) {
        if (!hasDeviceOrImportAccess(authProfile)) {
          return res.status(403).json({ success: false, error: 'Device/Import permission required.' });
        }
      } else if (!(collectorKey && headerKey && headerKey === collectorKey) && !isLoopback) {
        return res.status(401).json({ success: false, error: 'Authentication or valid collector credentials required.' });
      }
      const { deviceId, deviceName, deviceIP, serialNumber, punches, users, mode } = req.body || {};
      const rawList = Array.isArray(punches) ? punches : [];
      const cleanedPunches = rawList
        .map((p: any) => {
          const dt = normalizeZkDateTime(p.punchDateTime || p.punchDatetime || p.recordTime || p.timestamp);
          const uid = String(p.deviceUserId || p.userId || p.employeeId || '').trim();
          if (!uid || !dt) return null;
          return {
            deviceUserId: uid,
            punchDateTime: dt,
            verifyMode: p.verifyMode !== undefined ? Number(p.verifyMode) : undefined,
            inOutMode: p.inOutMode !== undefined ? Number(p.inOutMode) : undefined
          };
        })
        .filter(Boolean) as any[];

      const result = await ingestZkPunchesToSqlite({
        deviceId,
        deviceName,
        deviceIP,
        serialNumber,
        punches: cleanedPunches,
        users: Array.isArray(users) ? users : undefined,
        durationMs: Date.now() - startTime,
        mode: mode || 'ZKT Agent / Import',
        deviceStatus: 'online',
        status: 'Success'
      });

      return res.json({
        ...result,
        database: 'SQLite',
        dbPath: getSqliteDbPath(),
        message: `Stored ${result.newRecords} new punches in SQLite (${result.duplicates} duplicates, ${result.inactiveSkipped} inactive skipped, ${result.unmappedCount} unmapped).`
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || 'ZKT agent sync failed' });
    }
  });

  // Background ZKT Loop: Read-Only External Collector Observer by default (zero raw punch writes)
  setInterval(async () => {
    try {
      if (zkPollingState.readOnlyMode) {
        if (!zkPollingState.enabled) return;
        await detectExternalPunchChangesReadOnly();
      } else {
        if (!zkPollingState.enabled) return;
        await pollAllZkDevicesToSqlite({ dueOnly: true, mode: 'Scheduled Auto-Poll' });
      }
    } catch {
      // silent catch
    }
  }, 15 * 1000);

  // =========================================================================
  // Public Holiday Master Validation & Punch Overlap Prevention Service
  // =========================================================================
  app.get('/api/validation/holidays/report', requireAuth, async (_req, res) => {
    try {
      const report = await generateSqliteHolidayValidationReport();
      return res.json(report);
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to generate holiday validation report' });
    }
  });

  app.post('/api/validation/holidays/check-punches', requireAuth, async (req, res) => {
    try {
      const incoming = Array.isArray(req.body?.punches) ? req.body.punches : [];
      const policy = req.body?.policy;
      const db = await getSqliteDb();
      const validation = validateIncomingPunchesAgainstDb(db, incoming, { policy });
      return res.json({
        success: true,
        checkedCount: incoming.length,
        acceptedCount: validation.acceptedPunches.length,
        rejectedCount: validation.rejectedOverlaps.length,
        holidayMatchedCount: validation.holidayMatchedCount,
        acceptedPunches: validation.acceptedPunches,
        rejectedOverlaps: validation.rejectedOverlaps,
        conflicts: validation.conflicts,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to check punches against holidays' });
    }
  });

  app.post('/api/validation/holidays/reconcile', requireAuth, async (req, res) => {
    try {
      const result = await reconcileHolidaysAndPreventOverlapsInSqlite({
        removeConflictingForceAttendance: req.body?.removeConflictingForceAttendance !== false,
        reconcileByUser: String((req as any).callerEmail || req.body?.user || 'System Admin'),
      });
      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to reconcile holiday overlaps' });
    }
  });

  // Initial system-data & holiday master synchronization once server starts
  setTimeout(async () => {
    await loadZkSchedulerConfigFromSqlite().catch((e) => console.warn('[ZKPoller] Scheduler load note:', e));
    try {
      const db = await getSqliteDb();
      const devCheck = db.exec('SELECT id, data FROM zk_devices');
      let needsFleetSync = devCheck.length === 0 || devCheck[0].values.length === 0;
      if (!needsFleetSync) {
        for (const r of devCheck[0].values) {
          const id = String(r[0] || '');
          const dataStr = String(r[1] || '');
          if (
            id === 'dev_office_192_168_13_7' ||
            dataStr.includes('"deviceCapacityLogs":50049') ||
            dataStr.includes('"deviceCapacityLogs":32870') ||
            dataStr.includes('"deviceCapacityLogs":67961')
          ) {
            needsFleetSync = true;
            break;
          }
        }
      }
      if (needsFleetSync) {
        await replaceWithVerifiedZkFleetInSqlite();
      }
    } catch (e) {
      console.warn('[ZKPoller] Initial fleet sync note:', e);
    }
    if (!zkPollingState.readOnlyMode) {
      syncHolidaysMasterTableWithLock().catch((e) => console.warn('[HolidayService] Initial sync note:', e));
      reconcileSystemDataInSqlite().catch((e) => console.warn('[ZKPoller] Initial reconciliation note:', e));
    } else {
      detectExternalPunchChangesReadOnly().catch((e) => console.warn('[ZKPoller] Initial read-only snapshot note:', e));
    }
  }, 1500);

  // Vite middleware for development vs static build serving (optimized for Caddy reverse proxy)
  const distPath = path.join(process.cwd(), 'dist');
  const isBundledServer = String(process.argv[1] || '').endsWith('server.cjs');
  const isProduction =
    (process.env.NODE_ENV === 'production' || isBundledServer) &&
    fs.existsSync(path.join(distPath, 'index.html'));

  if (isProduction) {
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '7d', immutable: true }));
    app.use(express.static(distPath, { maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
