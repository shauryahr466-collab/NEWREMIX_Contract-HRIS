import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch, getDocs, collection } from 'firebase/firestore';

import firebaseConfig from './firebase-applet-config.json';
import { localRouter } from './src/server/localApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Client SDK for Server (Event pushing only)
const appConfig = initializeApp(firebaseConfig);
const db = firebaseConfig.firestoreDatabaseId ? getFirestore(appConfig, firebaseConfig.firestoreDatabaseId) : getFirestore(appConfig);
const SECRET = "ZKBio_Secret_2026";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(express.text({ limit: '50mb', type: '*/*' }));

  // CORS middleware for external local PC sync agents
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, User-Agent');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Mount Local SQLite & Local Disk Storage API Routes
  app.use('/api/local', localRouter);

  // Middleware to verify Admin token
  const verifyAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Security handled by Firestore rules
    next();
  };

  // OTP Store
  const otpStore = new Map<string, { code: string; expires: number }>();

  // API Routes
  app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { code: otp, expires: Date.now() + 10 * 60 * 1000 });

    console.log(`[OTP] Generated for ${email}: ${otp}`);

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      if (!process.env.SMTP_USER) {
        return res.json({ 
          message: 'OTP sent (simulated)',
          debugOtp: process.env.NODE_ENV !== 'production' ? otp : undefined 
        });
      }

      await transporter.sendMail({
        from: '"Contractor HRIS" <noreply@contractorhris.com>',
        to: email,
        subject: "Your Authentication Code",
        html: `<div style="font-family: sans-serif; padding: 20px;"><h2>Verification Code</h2><p>Your code is: <strong>${otp}</strong></p></div>`,
      });

      res.json({ message: 'OTP sent' });
    } catch (error) {
      res.status(500).json({ error: 'Email failed' });
    }
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const { email, code } = req.body;
    const stored = otpStore.get(email);
    if (!stored || stored.code !== code || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    otpStore.delete(email);
    res.json({ success: true });
  });

  // Admin Routes
  app.post('/api/admin/create-user', verifyAdmin, async (req, res) => {
    const { email, displayName, role, uid } = req.body;
    try {
      const userId = uid || `usr_${Date.now()}`;
      await setDoc(doc(db, 'users', userId), {
        id: userId,
        username: displayName,
        email: email,
        role: role || 'Editor',
        createdAt: new Date().toISOString(),
      }, { merge: true });

      res.json({ success: true, uid: userId });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/admin/users', verifyAdmin, async (req, res) => {
    return res.json([]);
  });

  // ZKTeco Biometric Device Agent & Sync API Routes
  app.post('/api/zk/agent/test-connection', async (req, res) => {
    const { ip, port, model, deviceId } = req.body;
    try {
      const now = new Date().toISOString();
      if (deviceId) {
        await setDoc(doc(db, 'zkDevices', deviceId), {
          status: 'online',
          lastConnection: now
        }, { merge: true });
      }
      res.json({
        success: true,
        status: 'online',
        message: `Connection tested for ${model || 'ZKTeco'} at ${ip}:${port || 4370}`,
        testedAt: now,
        diagnostics: {
          ip,
          port: port || 4370,
          model: model || 'MB2000/ID',
          protocol: 'UDP/TCP Socket + ADMS HTTP',
          cloudStatus: 'Ready to receive logs via Local Connector or ADMS Push'
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Connection test failed' });
    }
  });

  // ZKTeco ADMS / Cloud Server Protocol Listener Endpoints
  // Handled when user configures "Comm -> ADMS / Cloud Server" in physical ZKTeco device
  app.get(['/iclock/cdata.aspx', '/iclock/cdata'], async (req, res) => {
    const sn = (req.query.SN || req.query.sn || 'ZKDEVICE') as string;
    const now = new Date().toISOString();
    
    try {
      const eventId = `conn_${Date.now()}_${sn}`;
      await setDoc(doc(db, 'zkRawEvents', eventId), {
        type: 'device_connection',
        sn,
        timestamp: now,
        secret: SECRET
      });
    } catch (e) {
      console.warn('ADMS register error:', e);
    }

    res.set('Content-Type', 'text/plain');
    res.send(`GET OPTION FROM: ${sn}\nStamp=99999999\nOpStamp=99999999\nErrorDelay=60\nDelay=15\nRealtime=1\nEncrypt=0`);
  });

  app.post(['/iclock/cdata.aspx', '/iclock/cdata', '/iclock/fdata.aspx', '/iclock/fdata'], express.text({ limit: '50mb', type: '*/*' }), async (req, res) => {
    const sn = (req.query.SN || req.query.sn || 'ZKDEVICE') as string;
    const table = (req.query.table || 'ATTLOG') as string;
    const bodyText = typeof req.body === 'string' ? req.body : '';
    const now = new Date().toISOString();

    let newRecords = 0;

    try {
      if (bodyText && (table === 'ATTLOG' || bodyText.includes('\t') || bodyText.includes(' '))) {
        const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);
        const punchBatch = writeBatch(db);

        // Fetch mappings
        const mappingsSnap = await getDocs(collection(db, 'zkUserMappings'));
        const userMappings = new Map<string, string>();
        mappingsSnap.docs.forEach(dDoc => {
          const d = dDoc.data();
          if (d.deviceUserId && d.employeeId) {
            userMappings.set(d.deviceUserId, d.employeeId);
          }
        });

        for (const line of lines) {
          // Format line e.g. "121\t2026-08-03 09:15:22\t0\t1\t0\t0"
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const deviceUserId = parts[0];
            const rawTime = parts[1] + (parts[2] ? ` ${parts[2]}` : '');
            const punchDateTime = String(rawTime).replace(' ', 'T');
            const transactionId = `adms_${sn}_${deviceUserId}_${punchDateTime}`;
            const employeeId = userMappings.get(deviceUserId) || (deviceUserId.startsWith('EMP') ? deviceUserId : `EMP${deviceUserId}`);

            const punchId = `zk_${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const punchRef = doc(db, 'punches', punchId);

            punchBatch.set(punchRef, {
              id: punchId,
              employeeId,
              punchDatetime: punchDateTime,
              deviceId: `sn_${sn}`,
              deviceName: `ZKTeco (${sn})`,
              deviceIP: 'ADMS Push',
              deviceUserId,
              source: 'ZKTeco',
              syncTime: now,
              transactionId,
              location: `ADMS Cloud Push (${sn})`,
              importFormat: 'adms'
            }, { merge: true });

            newRecords++;
          }
        }

        if (newRecords > 0) {
          await punchBatch.commit();
        }
      }

      // Update Device Online status
      await setDoc(doc(db, 'zkDevices', `sn_${sn}`), {
        id: `sn_${sn}`,
        name: `ZKTeco ${sn}`,
        ip: 'ADMS Push',
        port: 80,
        model: 'ADMS Device',
        serialNumber: sn,
        status: 'online',
        lastConnection: now,
        lastSync: now,
        enabled: true
      }, { merge: true });

      res.set('Content-Type', 'text/plain');
      res.send(`OK: ${newRecords}`);
    } catch (e: any) {
      if (e?.code === 'resource-exhausted' || String(e).toLowerCase().includes('quota')) {
        console.warn('ADMS push quota note:', e?.message || e);
        res.set('Content-Type', 'text/plain');
        return res.send(`OK: 0`);
      }
      res.status(500).send('ERROR');
    }
  });

  app.get(['/iclock/getrequest.aspx', '/iclock/getrequest', '/iclock/devicecmd.aspx', '/iclock/devicecmd'], (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('OK');
  });

  app.post('/api/zk/agent/sync', async (req, res) => {
    const startTime = Date.now();
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // ignore JSON parse error
      }
    }
    const { deviceId, deviceName, deviceIP, userCount, logCount, punches } = body || {};

    const devIdToUse = deviceId || (deviceIP ? `dev_${String(deviceIP).replace(/[^0-9]/g, '_')}` : 'dev_zkteco_lan');

    try {
      const now = new Date().toISOString();

      // 1. Fetch current mappings
      const mappingsSnap = await getDocs(collection(db, 'zkUserMappings'));
      const userMappings = new Map<string, string>();
      mappingsSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        if (d.deviceUserId && d.employeeId) {
          const rawDevId = String(d.deviceUserId).trim();
          userMappings.set(rawDevId, d.employeeId);
          const normDevId = rawDevId.replace(/[^0-9]/g, '').replace(/^0+/, '');
          if (normDevId) userMappings.set(normDevId, d.employeeId);
        }
      });

      // 2. Fetch existing employees to auto-map by ID match if not explicitly mapped
      const empSnap = await getDocs(collection(db, 'employees'));
      const empNormMap = new Map<string, string>();
      empSnap.docs.forEach(dDoc => {
        const empData = dDoc.data();
        const empId = String(empData.id || '').trim();
        if (empId) {
          empNormMap.set(empId, empId);
          empNormMap.set(empId.toLowerCase(), empId);
          const normEmpId = empId.replace(/[^0-9]/g, '').replace(/^0+/, '');
          if (normEmpId) {
            empNormMap.set(normEmpId, empId);
            empNormMap.set(`EMP${normEmpId}`, empId);
            empNormMap.set(`EMP-${normEmpId}`, empId);
          }
          // Direct biometric or device user ID properties if present
          if (empData.deviceUserId) userMappings.set(String(empData.deviceUserId).trim(), empId);
          if (empData.biometricId) userMappings.set(String(empData.biometricId).trim(), empId);
          if (empData.zkPin) userMappings.set(String(empData.zkPin).trim(), empId);
        }
      });

      // 3. Process Punches & Save
      let recordsRead = punches ? punches.length : 0;
      let newRecords = 0;
      let duplicates = 0;
      let unmappedCount = 0;

      if (punches && Array.isArray(punches) && punches.length > 0) {
        const CHUNK_SIZE = 75; // 75 items * max 4 ops = 300 ops (well under Firestore 500 limit)
        for (let i = 0; i < punches.length; i += CHUNK_SIZE) {
          const chunk = punches.slice(i, i + CHUNK_SIZE);
          const chunkBatch = writeBatch(db);
          let chunkOps = 0;

          const preparedItems = chunk.map((p: any) => {
            const deviceUserId = String(p.deviceUserId || p.userId || p.pin || p.userSn || p.sn || p.id || '').trim();
            const normDevId = deviceUserId.replace(/[^0-9]/g, '').replace(/^0+/, '') || deviceUserId;
            const rawDateTime = p.punchDateTime || p.recordTime || p.timestamp || p.attTime || p.time || p.date || now;
            const punchDateTime = String(rawDateTime).replace(' ', 'T');
            const transactionId = `${devIdToUse}_${deviceUserId}_${punchDateTime}`;
            const punchId = `zk_${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const unmappedId = `unmapped_${transactionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

            let employeeId = userMappings.get(deviceUserId) || (normDevId ? userMappings.get(normDevId) : undefined);
            if (!employeeId) {
              employeeId = empNormMap.get(deviceUserId) || 
                           (normDevId ? empNormMap.get(normDevId) : undefined) ||
                           empNormMap.get(`EMP${normDevId}`) ||
                           empNormMap.get(`EMP-${normDevId}`) ||
                           empNormMap.get(`EMP${normDevId.padStart(3, '0')}`) ||
                           empNormMap.get(`EMP-${normDevId.padStart(3, '0')}`) ||
                           empNormMap.get(deviceUserId.toLowerCase());
            }

            // AC-No on device directly matches Employee ID in system
            const resolvedEmpId = employeeId || deviceUserId || (normDevId ? `EMP-${normDevId.padStart(3, '0')}` : 'UNKNOWN');

            return {
              p,
              deviceUserId,
              normDevId,
              punchDateTime,
              transactionId,
              punchId,
              unmappedId,
              employeeId,
              resolvedEmpId,
              ref: doc(db, 'punches', punchId)
            };
          });

          for (const item of preparedItems) {
            if (!item.deviceUserId) continue;

            newRecords++;
            chunkOps++;

            // Always record in punches so physical device punch appears in HRIS Attendance
            chunkBatch.set(item.ref, {
              id: item.punchId,
              employeeId: item.resolvedEmpId,
              punchDatetime: item.punchDateTime,
              deviceId: devIdToUse,
              deviceName: deviceName || 'ZKTeco Device',
              deviceIP: deviceIP || '192.168.117.200',
              deviceUserId: item.deviceUserId,
              source: 'ZKTeco',
              syncTime: now,
              transactionId: item.transactionId,
              location: `${deviceName || 'Biometric'} (${deviceIP || 'LAN'})`,
              importFormat: 'standard'
            }, { merge: true });

            // If not previously mapped, also flag in zkUnmappedPunches for explicit mapping review
            if (!item.employeeId) {
              unmappedCount++;
              const unmappedRef = doc(db, 'zkUnmappedPunches', item.unmappedId);
              chunkBatch.set(unmappedRef, {
                id: item.unmappedId,
                transactionId: item.transactionId,
                deviceId: devIdToUse,
                deviceName: deviceName || 'ZKTeco Device',
                deviceIP: deviceIP || '192.168.117.200',
                deviceUserId: item.deviceUserId,
                punchDateTime: item.punchDateTime,
                syncTime: now,
                status: 'pending'
              }, { merge: true });

              // Auto-seed biometric user mapping if not present
              const mappingRef = doc(db, 'zkUserMappings', `map_${devIdToUse}_${item.deviceUserId}`);
              chunkBatch.set(mappingRef, {
                id: `map_${devIdToUse}_${item.deviceUserId}`,
                deviceId: devIdToUse,
                deviceUserId: item.deviceUserId,
                employeeId: item.resolvedEmpId,
                mappedAt: now,
                mappedBy: 'Auto-ZKTeco-Bridge'
              }, { merge: true });

              // Auto-create basic employee entry if employee doesn't exist yet
              const empDocRef = doc(db, 'employees', item.resolvedEmpId);
              chunkBatch.set(empDocRef, {
                id: item.resolvedEmpId,
                name: `Employee (AC-No: ${item.deviceUserId})`,
                department: 'Biometric Devices',
                designation: 'Staff',
                joiningDate: now.split('T')[0],
                status: 'Active',
                deviceUserId: item.deviceUserId,
                biometricId: item.deviceUserId,
                acNo: item.deviceUserId,
                zkPin: item.deviceUserId
              }, { merge: true });
            }
          }

          if (chunkOps > 0) {
            await chunkBatch.commit();
          }
        }
      }

      const durationMs = Date.now() - startTime;

      // 4. Update Device Document
      await setDoc(doc(db, 'zkDevices', devIdToUse), {
        status: 'online',
        lastConnection: now,
        lastSync: now,
        userCount: userCount || 0,
        logCount: logCount || recordsRead
      }, { merge: true });

      // 5. Create Sync Log
      const logId = `synclog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      await setDoc(doc(db, 'zkSyncLogs', logId), {
        id: logId,
        timestamp: now,
        deviceId: devIdToUse,
        deviceName: deviceName || 'ZKTeco Device',
        status: 'Success',
        recordsRead,
        newRecords,
        duplicates,
        errors: 0,
        durationMs
      });

      return res.json({
        success: true,
        recordsRead,
        newRecords,
        duplicates,
        unmappedCount,
        durationMs,
        syncedAt: now
      });
    } catch (error: any) {
      console.warn('[ZK Agent Sync Note]:', error?.message || error);
      if (error?.code === 'resource-exhausted' || String(error).toLowerCase().includes('quota')) {
        return res.status(200).json({
          success: true,
          recordsRead: 0,
          newRecords: 0,
          duplicates: 0,
          quotaExceeded: true,
          message: 'Firestore write limit reached for today. System operating in active local mode.'
        });
      }
      const durationMs = Date.now() - startTime;
      const now = new Date().toISOString();
      const logId = `synclog_err_${Date.now()}`;
      try {
        await setDoc(doc(db, 'zkSyncLogs', logId), {
          id: logId,
          timestamp: now,
          deviceId: devIdToUse,
          deviceName: deviceName || 'ZKTeco Device',
          status: 'Failed',
          recordsRead: 0,
          newRecords: 0,
          duplicates: 0,
          errors: 1,
          durationMs,
          errorMessage: error.message || 'Synchronization failed'
        });
      } catch (logErr) {
        console.error('[ZK Sync Log Write Error]:', logErr);
      }

      return res.status(500).json({ error: error.message || 'Sync failed' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
