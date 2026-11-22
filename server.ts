import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import net from 'net';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { localRouter } from './src/server/localApi.js';
import { getSqliteDb, saveSqliteDb, getSqliteDbPath, withSqliteWriteLock } from './src/server/sqliteDb.js';
import {
  zkPollingState,
  getZkPollingSummaryFromSqlite,
  pollAllZkDevicesToSqlite,
  pollSingleZkDeviceToSqlite,
  ingestZkPunchesToSqlite,
  reconcileSystemDataInSqlite,
  testAndStoreZkDeviceConnection,
  parseAdmsAttlogText,
  normalizeZkDateTime,
  recordAdmsDeviceHeartbeat,
  scanWatchFolderAndIngestToSqlite
} from './src/server/zkPoller.js';
import { discoverZkDevicesOnSubnet } from './src/server/zkProtocol.js';
import {
  authenticateLocalUser,
  createOrUpdateSystemUser,
  deleteSystemUser,
  getSystemScopeOptions,
  isBootstrapSuperAdminEmail,
  listSystemUsers,
  resolveSessionProfile
} from './src/server/userAccess.js';

dotenv.config();

const ADMIN_EMAILS = ['hr.sandiprajak466@gmail.com', 'shauryahr466@gmail.com'];

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

  // Local SQLite User Login & Session Profile Resolution
  app.post('/api/auth/local-login', async (req, res) => {
    try {
      const { email, username, password } = req.body || {};
      const identifier = String(email || username || '').trim();
      const result = await authenticateLocalUser(identifier, String(password || ''));
      if ('error' in result) {
        return res.status(result.statusCode).json({ success: false, error: result.error });
      }
      return res.json({ success: true, user: result.user });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || 'Authentication failed' });
    }
  });

  app.get('/api/auth/session-profile', async (req, res) => {
    try {
      const email = String(req.query.email || req.headers['x-hris-user-email'] || '').trim();
      if (!email) return res.json({ user: null });
      const profile = await resolveSessionProfile(email);
      return res.json({ user: profile });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to resolve profile' });
    }
  });

  // Super Admin Guard Middleware (SQLite RBAC + JWT Email Compatible)
  const verifySuperAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split('Bearer ')[1];
    let callerEmail = String(req.headers['x-hris-user-email'] || '').trim();

    if (token && token !== 'undefined' && token !== 'null') {
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.email) callerEmail = String(payload.email).trim();
        }
      } catch {}
    }

    if (callerEmail) {
      if (isBootstrapSuperAdminEmail(callerEmail) || ADMIN_EMAILS.some(e => e.toLowerCase() === callerEmail.toLowerCase())) {
        (req as any).callerEmail = callerEmail;
        return next();
      }
      const profile = await resolveSessionProfile(callerEmail);
      if (profile && profile.role === 'Super Admin' && profile.status === 'Active') {
        (req as any).callerEmail = callerEmail;
        return next();
      }
      return res.status(403).json({ error: 'Only Super Admin can create or modify system users and roles.' });
    }

    return next();
  };

  // User Access & Role Management Routes (Backed 100% by SQLite)
  app.get('/api/admin/scope-options', verifySuperAdmin, async (_req, res) => {
    try {
      const options = await getSystemScopeOptions();
      return res.json(options);
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Failed to load scope options' });
    }
  });

  app.post('/api/admin/create-user', verifySuperAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const result = await createOrUpdateSystemUser({
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
        createdBy: (req as any).callerEmail || body.createdBy || 'Super Admin'
      });
      return res.json({ success: true, uid: result.user.id, user: result.user, created: result.created });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to create user' });
    }
  });

  app.put('/api/admin/users/:id', verifySuperAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const result = await createOrUpdateSystemUser(
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
          createdBy: (req as any).callerEmail || body.createdBy || 'Super Admin'
        },
        req.params.id
      );
      return res.json({ success: true, user: result.user });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to update user' });
    }
  });

  app.delete('/api/admin/users/:id', verifySuperAdmin, async (req, res) => {
    try {
      await deleteSystemUser(req.params.id, (req as any).callerEmail);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to delete user' });
    }
  });

  app.get('/api/admin/users', verifySuperAdmin, async (_req, res) => {
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
  app.get('/api/zk/auto-poll/status', async (req, res) => {
    try {
      const summary = await getZkPollingSummaryFromSqlite();
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to load ZKT polling status' });
    }
  });

  app.post('/api/zk/auto-poll/toggle', async (req, res) => {
    try {
      const { enabled, intervalMinutes, intervalSeconds } = req.body || {};
      if (typeof enabled === 'boolean') {
        zkPollingState.enabled = enabled;
      }
      if (typeof intervalMinutes === 'number' && intervalMinutes > 0) {
        zkPollingState.intervalMinutes = intervalMinutes;
        zkPollingState.intervalSeconds = intervalMinutes * 60;
      }
      if (typeof intervalSeconds === 'number' && intervalSeconds >= 15) {
        zkPollingState.intervalSeconds = intervalSeconds;
        zkPollingState.intervalMinutes = Math.max(1, Math.round(intervalSeconds / 60));
      }
      const summary = await getZkPollingSummaryFromSqlite();
      res.json({ success: true, ...summary });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to toggle ZKT polling' });
    }
  });

  app.post(['/api/zk/auto-poll/run-now', '/api/zk/fetch-all'], async (req, res) => {
    try {
      const pollRes = await pollAllZkDevicesToSqlite({
        dueOnly: false,
        mode: req.body?.mode || 'Manual Batch Poll'
      });
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

  app.post('/api/zk/fetch-device', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const { deviceId, ip, mode } = req.body || {};
      const target = String(deviceId || ip || '').trim();
      if (!target) {
        return res.status(400).json({ success: false, error: 'deviceId or ip is required' });
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

  app.post('/api/zk/reconcile-system', async (req, res) => {
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

  // =========================================================================
  // ZKTeco Hardware Connectivity Test & Multi-Protocol Discovery
  // =========================================================================
  app.post('/api/zk/agent/test-connection', async (req, res) => {
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

  app.post('/api/zk/discover', async (req, res) => {
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

  app.post('/api/zk/watch-folder/scan', async (req, res) => {
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

  app.post('/api/zk/upload-raw', async (req, res) => {
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

  app.options(['/api/zk/agent/sync', '/api/zk/fetch-device', '/api/zk/fetch-all'], (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(200);
  });

  app.post('/api/zk/agent/sync', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const startTime = Date.now();
    try {
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

  // Background Scheduled ZKT Polling Loop (Checks device autoSyncMinutes & reconciles SQLite)
  setInterval(async () => {
    if (!zkPollingState.enabled) return;
    try {
      await pollAllZkDevicesToSqlite({ dueOnly: true, mode: 'Scheduled Auto-Poll' });
    } catch {
      // silent catch so background loop never crashes server
    }
  }, 30 * 1000);

  // Initial system-data reconciliation once server starts
  setTimeout(() => {
    reconcileSystemDataInSqlite().catch((e) => console.warn('[ZKPoller] Initial reconciliation note:', e));
  }, 1500);

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
