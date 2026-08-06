const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// Replace /api/zk/agent/sync logic
// Note: using regex or string replacement carefully
const syncEndpointRegex = /app\.post\('\/api\/zk\/agent\/sync', async \(req, res\) => \{[\s\S]*?(?=app\.get\(\['\/iclock\/cdata)/;

const newSyncEndpoint = `app.post('/api/zk/agent/sync', async (req, res) => {
    const { deviceId, punches } = req.body;
    if (!deviceId || !punches || !Array.isArray(punches)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    try {
      const now = new Date().toISOString();
      const eventId = \`sync_\${Date.now()}_\${Math.random().toString(36).substr(2, 5)}\`;
      
      await setDoc(doc(db, 'zkRawEvents', eventId), {
        type: 'agent_sync',
        deviceId,
        punches,
        timestamp: now,
        secret: SECRET
      });

      res.json({ success: true, processed: punches.length, newRecords: punches.length, unmapped: 0 });
    } catch (error: any) {
      console.error('Agent Sync Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  `;

code = code.replace(syncEndpointRegex, newSyncEndpoint);

// Replace /iclock/cdata (both GET and POST)
const cdataGetRegex = /app\.get\(\['\/iclock\/cdata\.aspx', '\/iclock\/cdata'\], async \(req, res\) => \{[\s\S]*?(?=app\.post\(\['\/iclock\/cdata\.aspx)/;
const newCdataGet = `app.get(['/iclock/cdata.aspx', '/iclock/cdata'], async (req, res) => {
    const sn = (req.query.SN || req.query.sn || 'ZKDEVICE') as string;
    const now = new Date().toISOString();
    
    try {
      const eventId = \`conn_\${Date.now()}_\${sn}\`;
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
    res.send(\`GET OPTION FROM: \${sn}\\nStamp=99999999\\nOpStamp=99999999\\nErrorDelay=60\\nDelay=15\\nRealtime=1\\nEncrypt=0\`);
  });

  `;

code = code.replace(cdataGetRegex, newCdataGet);

const cdataPostRegex = /app\.post\(\['\/iclock\/cdata\.aspx', '\/iclock\/cdata'\], async \(req, res\) => \{[\s\S]*?(?=app\.get\(\['\/iclock\/getrequest\.aspx')/;
const newCdataPost = `app.post(['/iclock/cdata.aspx', '/iclock/cdata'], async (req, res) => {
    const sn = (req.query.SN || req.query.sn || 'ZKDEVICE') as string;
    const rawData = req.body;
    const now = new Date().toISOString();

    if (!rawData || typeof rawData !== 'string') {
      res.set('Content-Type', 'text/plain');
      return res.send('OK: 0');
    }

    try {
      const lines = rawData.split('\\n').filter(l => l.trim().length > 0);
      const punches = lines.map(line => {
        const parts = line.split('\\t');
        if (parts.length >= 2) {
          const deviceUserId = parts[0];
          const punchDateTime = parts[1] + (parts[2] ? \` \${parts[2]}\` : '');
          return { deviceUserId, punchDateTime };
        }
        return null;
      }).filter(p => p !== null);

      if (punches.length > 0) {
        const eventId = \`push_\${Date.now()}_\${sn}\`;
        await setDoc(doc(db, 'zkRawEvents', eventId), {
          type: 'device_push',
          sn,
          punches,
          timestamp: now,
          secret: SECRET
        });
      }

      res.set('Content-Type', 'text/plain');
      res.send(\`OK: \${punches.length}\`);
    } catch (e: any) {
      console.error('ADMS POST error:', e);
      res.status(500).send('ERROR');
    }
  });

  `;

code = code.replace(cdataPostRegex, newCdataPost);
fs.writeFileSync('server.ts', code);
