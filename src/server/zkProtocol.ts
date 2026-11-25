import net from 'net';
import dgram from 'dgram';
import http from 'http';

export type ZkProtocolMode = 'Auto' | 'TCP' | 'UDP' | 'ADMS' | 'Web-HTTP' | 'USB-Disk';

export interface ZkRawPunch {
  deviceUserId: string;
  punchDateTime: string; // Exact hardware wall-clock YYYY-MM-DDTHH:mm:ss
  verifyMode?: number;
  inOutMode?: number;
  workCode?: number;
}

export interface ZkDeviceUser {
  uid: number;
  deviceUserId: string;
  name: string;
  role: number;
  cardNo?: string;
}

export interface ZkDeviceFreeSizes {
  userCount: number;
  logCount: number;
  fpCount: number;
  faceCount: number;
}

export interface ZkProtocolAttempt {
  protocol: string;
  reachable: boolean;
  latencyMs: number;
  error?: string;
}

export interface ZkPollHardwareResult {
  reachable: boolean;
  protocol: 'TCP' | 'UDP' | 'Web-HTTP' | 'ADMS' | 'USB-Disk' | 'NONE';
  latencyMs: number;
  serialNumber?: string;
  deviceName?: string;
  freeSizes?: ZkDeviceFreeSizes;
  users: ZkDeviceUser[];
  punches: ZkRawPunch[];
  skippedUnchangedCount?: boolean;
  attempts?: ZkProtocolAttempt[];
  error?: string;
}

const CMD_CONNECT = 1000;
const CMD_EXIT = 1001;
const CMD_ENABLEDEVICE = 1002;
const CMD_DISABLEDEVICE = 1003;
const CMD_ACK_OK = 2000;
const CMD_ACK_ERROR = 2001;
const CMD_ACK_DATA = 2002;
const CMD_ACK_UNAUTH = 2005;
const CMD_PREPARE_DATA = 1500;
const CMD_DATA = 1501;
const CMD_FREE_DATA = 1502;
const CMD_DATA_WRRQ = 1503;
const CMD_DATA_RDY = 1504;
const CMD_AUTH = 1102;
const CMD_ATTLOG_RRQ = 13;
const CMD_OPTIONS_RRQ = 11;
const CMD_GET_FREE_SIZES = 50;
const CMD_USERTEMP_RRQ = 9;

const USHRT_MAX = 65535;
const TCP_MAGIC = Buffer.from([0x50, 0x50, 0x82, 0x7d]);

function createChecksum(buf: Buffer): number {
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === buf.length - 1) {
      chksum += buf[i];
    } else {
      chksum += buf.readUInt16LE(i);
    }
    chksum %= USHRT_MAX + 1;
  }
  chksum = USHRT_MAX - chksum - 1;
  if (chksum < 0) chksum += USHRT_MAX + 1;
  return chksum;
}

function buildInnerPacket(cmd: number, sessionId: number, replyId: number, data: Buffer = Buffer.alloc(0)): Buffer {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt16LE(cmd, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt16LE(sessionId & 0xffff, 4);
  buf.writeUInt16LE(replyId & 0xffff, 6);
  if (data.length > 0) data.copy(buf, 8);
  const cs = createChecksum(buf);
  buf.writeUInt16LE(cs, 2);
  return buf;
}

function wrapTcpPacket(inner: Buffer): Buffer {
  const hdr = Buffer.alloc(8);
  TCP_MAGIC.copy(hdr, 0);
  hdr.writeUInt32LE(inner.length, 4);
  return Buffer.concat([hdr, inner]);
}

function makeCommKey(key: number, sessionId: number, ticks = 50): Buffer {
  let k = 0;
  for (let i = 0; i < 32; i++) {
    if (key & (1 << i)) {
      k = (k << 1) | 1;
    } else {
      k = k << 1;
    }
  }
  k += sessionId;
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(k >>> 0, 0);
  buf[0] ^= 0x5a;
  buf[1] ^= 0x4b;
  buf[2] ^= 0x53;
  buf[3] ^= 0x4f;
  const h0 = buf.readUInt16LE(0);
  const h1 = buf.readUInt16LE(2);
  buf.writeUInt16LE(h1, 0);
  buf.writeUInt16LE(h0, 2);
  const b = ticks & 0xff;
  buf[0] ^= b;
  buf[1] ^= b;
  buf[2] = b;
  buf[3] ^= b;
  return buf;
}

export function decodeZkTimestamp(timeInt: number): string {
  const second = timeInt % 60;
  let t = Math.floor(timeInt / 60);
  const minute = t % 60;
  t = Math.floor(t / 60);
  const hour = t % 24;
  t = Math.floor(t / 24);
  const day = (t % 31) + 1;
  t = Math.floor(t / 31);
  const month = (t % 12) + 1;
  t = Math.floor(t / 12);
  const year = t + 2000;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function readNullTerminatedAscii(buf: Buffer, offset: number, maxLen: number): string {
  const end = Math.min(buf.length, offset + maxLen);
  let actualEnd = offset;
  while (actualEnd < end && buf[actualEnd] !== 0) {
    actualEnd++;
  }
  return buf.subarray(offset, actualEnd).toString('utf8').replace(/[\x00-\x1f]/g, '').trim();
}

function parseAttendancePayload(payload: Buffer): ZkRawPunch[] {
  const punches: ZkRawPunch[] = [];
  if (!payload || payload.length < 4) return punches;

  let offset = 0;
  // Many ZKTeco firmware versions prefix attendance data with 4-byte total size header
  const possibleSize = payload.readUInt32LE(0);
  if (possibleSize === payload.length - 4 || (payload.length > 4 && (payload.length - 4) % 40 === 0 && payload.length % 40 !== 0)) {
    offset = 4;
  }

  const remaining = payload.length - offset;
  if (remaining >= 40 && remaining % 40 === 0) {
    // Standard 40-byte ZKTeco TFT / MB2000 attendance record
    for (let i = offset; i + 40 <= payload.length; i += 40) {
      const rec = payload.subarray(i, i + 40);
      const userId = readNullTerminatedAscii(rec, 2, 24);
      const verifyMode = rec[26];
      const timeInt = rec.readUInt32LE(27);
      const inOutMode = rec[31];
      if (!userId || !timeInt) continue;
      const dt = decodeZkTimestamp(timeInt);
      if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dt)) {
        punches.push({ deviceUserId: userId, punchDateTime: dt, verifyMode, inOutMode });
      }
    }
    return punches;
  }

  if (remaining >= 16 && remaining % 16 === 0) {
    for (let i = offset; i + 16 <= payload.length; i += 16) {
      const rec = payload.subarray(i, i + 16);
      const uid = rec.readUInt32LE(0);
      const verifyMode = rec[4];
      const timeInt = rec.readUInt32LE(8);
      if (!uid || !timeInt) continue;
      const dt = decodeZkTimestamp(timeInt);
      if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dt)) {
        punches.push({ deviceUserId: String(uid), punchDateTime: dt, verifyMode });
      }
    }
    return punches;
  }

  if (remaining >= 8 && remaining % 8 === 0) {
    for (let i = offset; i + 8 <= payload.length; i += 8) {
      const rec = payload.subarray(i, i + 8);
      const uid = rec.readUInt16LE(0);
      const timeInt = rec.readUInt32LE(4);
      if (!uid || !timeInt) continue;
      const dt = decodeZkTimestamp(timeInt);
      if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dt)) {
        punches.push({ deviceUserId: String(uid), punchDateTime: dt });
      }
    }
  }

  return punches;
}

function parseUsersPayload(payload: Buffer): ZkDeviceUser[] {
  const users: ZkDeviceUser[] = [];
  if (!payload || payload.length < 4) return users;

  let offset = 0;
  const possibleSize = payload.readUInt32LE(0);
  if (possibleSize === payload.length - 4 || (payload.length > 4 && (payload.length - 4) % 72 === 0 && payload.length % 72 !== 0)) {
    offset = 4;
  }

  const remaining = payload.length - offset;
  if (remaining >= 72 && remaining % 72 === 0) {
    for (let i = offset; i + 72 <= payload.length; i += 72) {
      const rec = payload.subarray(i, i + 72);
      const uid = rec.readUInt16LE(0);
      const role = rec[2];
      const name = readNullTerminatedAscii(rec, 11, 24);
      const cardVal = rec.readUInt32LE(35);
      const userId = readNullTerminatedAscii(rec, 48, 24) || String(uid);
      if (!userId && !uid) continue;
      users.push({
        uid,
        deviceUserId: userId,
        name: name || `User ${userId}`,
        role,
        cardNo: cardVal ? String(cardVal) : ''
      });
    }
  } else if (remaining >= 28 && remaining % 28 === 0) {
    for (let i = offset; i + 28 <= payload.length; i += 28) {
      const rec = payload.subarray(i, i + 28);
      const uid = rec.readUInt16LE(0);
      const role = rec[2];
      const name = readNullTerminatedAscii(rec, 8, 8);
      const userId = String(rec.readUInt32LE(24) || uid);
      if (!userId) continue;
      users.push({ uid, deviceUserId: userId, name: name || `User ${userId}`, role });
    }
  }
  return users;
}

class ZkTcpSession {
  private socket: net.Socket;
  private buffer = Buffer.alloc(0);
  private sessionId = 0;
  private replyId = 0;
  private packetQueue: Array<{ cmd: number; sessionId: number; replyId: number; data: Buffer }> = [];
  private waiters: Array<{ resolve: (pkt: { cmd: number; sessionId: number; replyId: number; data: Buffer }) => void; reject: (err: Error) => void }> = [];

  constructor(private ip: string, private port: number, private timeoutMs = 4000) {
    this.socket = new net.Socket();
  }

  private pumpFrames() {
    while (this.buffer.length >= 16) {
      // Look for TCP magic 50 50 82 7d
      const idx = this.buffer.indexOf(TCP_MAGIC);
      if (idx === -1) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      if (idx > 0) {
        this.buffer = this.buffer.subarray(idx);
      }
      if (this.buffer.length < 8) return;
      const innerLen = this.buffer.readUInt32LE(4);
      if (innerLen < 8 || innerLen > 10 * 1024 * 1024) {
        this.buffer = this.buffer.subarray(4);
        continue;
      }
      if (this.buffer.length < 8 + innerLen) return;

      const inner = this.buffer.subarray(8, 8 + innerLen);
      this.buffer = this.buffer.subarray(8 + innerLen);

      const cmd = inner.readUInt16LE(0);
      const sessionId = inner.readUInt16LE(4);
      const replyId = inner.readUInt16LE(6);
      const data = Buffer.from(inner.subarray(8));

      const pkt = { cmd, sessionId, replyId, data };
      const next = this.waiters.shift();
      if (next) {
        next.resolve(pkt);
      } else {
        this.packetQueue.push(pkt);
      }
    }
  }

  private nextPacket(timeoutMs = this.timeoutMs): Promise<{ cmd: number; sessionId: number; replyId: number; data: Buffer }> {
    this.pumpFrames();
    if (this.packetQueue.length > 0) {
      return Promise.resolve(this.packetQueue.shift()!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex(w => w.resolve === wrappedResolve);
        if (i !== -1) this.waiters.splice(i, 1);
        reject(new Error(`ZKTeco response timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const wrappedResolve = (pkt: { cmd: number; sessionId: number; replyId: number; data: Buffer }) => {
        clearTimeout(timer);
        resolve(pkt);
      };
      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
      this.waiters.push({ resolve: wrappedResolve, reject: wrappedReject });
      this.pumpFrames();
    });
  }

  async connect(commKey = 0): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      this.socket.setTimeout(this.timeoutMs);
      this.socket.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.pumpFrames();
      });
      this.socket.once('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
        while (this.waiters.length > 0) {
          this.waiters.shift()?.reject(err);
        }
      });
      this.socket.once('timeout', () => {
        const err = new Error(`TCP connection timeout (${this.ip}:${this.port})`);
        if (!settled) {
          settled = true;
          reject(err);
        }
        while (this.waiters.length > 0) {
          this.waiters.shift()?.reject(err);
        }
      });
      this.socket.connect(this.port || 4370, this.ip, () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });

    const resp = await this.execute(CMD_CONNECT, Buffer.alloc(0));
    this.sessionId = resp.sessionId;
    if (resp.cmd === CMD_ACK_UNAUTH) {
      const authPayload = makeCommKey(commKey, this.sessionId);
      const authResp = await this.execute(CMD_AUTH, authPayload);
      if (authResp.cmd !== CMD_ACK_OK) {
        throw new Error('ZKTeco authentication rejected (check Comm Key)');
      }
    }
  }

  async execute(cmd: number, data: Buffer = Buffer.alloc(0), timeoutMs = this.timeoutMs): Promise<{ cmd: number; sessionId: number; replyId: number; data: Buffer }> {
    const pkt = wrapTcpPacket(buildInnerPacket(cmd, this.sessionId, this.replyId, data));
    this.replyId = (this.replyId + 1) & 0xffff;
    const waitPromise = this.nextPacket(timeoutMs);
    this.socket.write(pkt);
    return await waitPromise;
  }

  private async consumePrepareDataStream(totalSize: number, packetTimeoutMs = 15000): Promise<Buffer> {
    if (totalSize <= 0) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    let received = 0;
    while (received < totalSize) {
      const pkt = await this.nextPacket(packetTimeoutMs);
      if (pkt.cmd === CMD_DATA || pkt.cmd === CMD_ACK_DATA) {
        chunks.push(pkt.data);
        received += pkt.data.length;
      } else if (pkt.cmd === CMD_ACK_OK) {
        break;
      } else {
        break;
      }
    }
    // Consume optional trailing CMD_ACK_OK emitted at end of PREPARE_DATA stream so next command stays synced
    if (received >= totalSize) {
      const maybeAck = await this.nextPacket(120).catch(() => null);
      if (maybeAck && maybeAck.cmd !== CMD_ACK_OK && maybeAck.data.length > 0 && (maybeAck.cmd === CMD_DATA || maybeAck.cmd === CMD_ACK_DATA)) {
        chunks.push(maybeAck.data);
      }
    }
    return Buffer.concat(chunks);
  }

  async readLargeBuffer(cmd: number, reqPayload: Buffer = Buffer.alloc(0)): Promise<Buffer> {
    const bulkTimeout = Math.max(this.timeoutMs, 15000);
    const resp = await this.execute(cmd, reqPayload, bulkTimeout);
    if (resp.cmd === CMD_ACK_DATA || resp.cmd === CMD_DATA) {
      return resp.data;
    }

    if (resp.cmd === CMD_PREPARE_DATA && resp.data.length >= 4) {
      const totalSize = resp.data.readUInt32LE(0);
      const out = await this.consumePrepareDataStream(totalSize, bulkTimeout);
      try { await this.execute(CMD_FREE_DATA); } catch {}
      return out;
    }

    if (resp.cmd === CMD_ACK_OK && resp.data.length >= 4) {
      const totalSize = resp.data.readUInt32LE(0);
      if (totalSize === 0) return Buffer.alloc(0);
      const out = await this.consumePrepareDataStream(totalSize, bulkTimeout);
      try { await this.execute(CMD_FREE_DATA); } catch {}
      return out;
    }

    return Buffer.alloc(0);
  }

  async readWithDataWrrq(fct: number): Promise<Buffer> {
    const bulkTimeout = Math.max(this.timeoutMs, 15000);
    // Standard ZKTeco TCP bulk read request (CMD_DATA_WRRQ 1503):
    // 11-byte payload: [0x01, fct, 0x00*9] (fct: 13 = attlog, 5 = user)
    const req = Buffer.alloc(11);
    req[0] = 0x01;
    req[1] = fct;
    const resp = await this.execute(CMD_DATA_WRRQ, req, bulkTimeout);

    if (resp.cmd === CMD_ACK_DATA || resp.cmd === CMD_DATA) {
      return resp.data;
    }

    if (resp.cmd === CMD_PREPARE_DATA && resp.data.length >= 4) {
      const totalSize = resp.data.readUInt32LE(0);
      const out = await this.consumePrepareDataStream(totalSize, bulkTimeout);
      try { await this.execute(CMD_FREE_DATA); } catch {}
      return out;
    }

    if (resp.cmd === CMD_ACK_OK && resp.data.length >= 5) {
      const size = resp.data.readUInt32LE(1);
      if (size === 0) return Buffer.alloc(0);
      const readChunkReq = Buffer.alloc(8);
      const chunks: Buffer[] = [];
      let offset = 0;
      while (offset < size) {
        const chunkLen = Math.min(size - offset, 65536);
        readChunkReq.writeUInt32LE(offset, 0);
        readChunkReq.writeUInt32LE(chunkLen, 4);
        const chunkResp = await this.execute(CMD_DATA_RDY, readChunkReq, bulkTimeout);
        if (chunkResp.cmd === CMD_PREPARE_DATA && chunkResp.data.length >= 4) {
          const prepSize = chunkResp.data.readUInt32LE(0);
          const chunkBuf = await this.consumePrepareDataStream(prepSize, bulkTimeout);
          if (chunkBuf.length === 0) break;
          chunks.push(chunkBuf);
          offset += chunkBuf.length;
        } else if (chunkResp.cmd === CMD_DATA || chunkResp.cmd === CMD_ACK_DATA) {
          if (chunkResp.data.length === 0) break;
          chunks.push(chunkResp.data);
          offset += chunkResp.data.length;
        } else {
          break;
        }
      }
      try { await this.execute(CMD_FREE_DATA); } catch {}
      return Buffer.concat(chunks);
    }

    return Buffer.alloc(0);
  }

  async getFreeSizes(): Promise<ZkDeviceFreeSizes> {
    const resp = await this.execute(CMD_GET_FREE_SIZES);
    if (resp.cmd === CMD_ACK_OK && resp.data.length >= 40) {
      return {
        userCount: resp.data.readUInt32LE(16),
        fpCount: resp.data.readUInt32LE(24),
        logCount: resp.data.readUInt32LE(32),
        faceCount: resp.data.length >= 52 ? resp.data.readUInt32LE(48) : 0
      };
    }
    return { userCount: 0, logCount: 0, fpCount: 0, faceCount: 0 };
  }

  async getOption(key: string): Promise<string> {
    const payload = Buffer.from(`${key}\0`, 'ascii');
    const resp = await this.execute(CMD_OPTIONS_RRQ, payload);
    if (resp.cmd === CMD_ACK_OK && resp.data.length > 0) {
      const str = resp.data.toString('utf8').replace(/\0/g, '').trim();
      const idx = str.indexOf('=');
      return idx !== -1 ? str.slice(idx + 1).trim() : str;
    }
    return '';
  }

  async disableDevice() {
    try { await this.execute(CMD_DISABLEDEVICE, Buffer.alloc(4)); } catch {}
  }

  async enableDevice() {
    try { await this.execute(CMD_ENABLEDEVICE); } catch {}
  }

  async disconnect() {
    try { await this.execute(CMD_EXIT, Buffer.alloc(0), 1000); } catch {}
    try { this.socket.destroy(); } catch {}
  }
}

class ZkUdpSession {
  private sock: dgram.Socket;
  private sessionId = 0;
  private replyId = 0;
  private packetQueue: Array<{ cmd: number; sessionId: number; replyId: number; data: Buffer }> = [];
  private waiters: Array<{ resolve: (pkt: { cmd: number; sessionId: number; replyId: number; data: Buffer }) => void; reject: (err: Error) => void }> = [];

  constructor(private ip: string, private port: number, private timeoutMs = 3000) {
    this.sock = dgram.createSocket('udp4');
  }

  private nextPacket(timeoutMs = this.timeoutMs): Promise<{ cmd: number; sessionId: number; replyId: number; data: Buffer }> {
    if (this.packetQueue.length > 0) {
      return Promise.resolve(this.packetQueue.shift()!);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex(w => w.resolve === wrappedResolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new Error(`UDP ZKTeco response timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const wrappedResolve = (pkt: { cmd: number; sessionId: number; replyId: number; data: Buffer }) => {
        clearTimeout(timer);
        resolve(pkt);
      };
      const wrappedReject = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
      this.waiters.push({ resolve: wrappedResolve, reject: wrappedReject });
    });
  }

  async connect(commKey = 0): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      this.sock.on('message', (msg: Buffer) => {
        if (msg.length < 8) return;
        const cmd = msg.readUInt16LE(0);
        const sessionId = msg.readUInt16LE(4);
        const replyId = msg.readUInt16LE(6);
        const data = Buffer.from(msg.subarray(8));
        const pkt = { cmd, sessionId, replyId, data };
        const next = this.waiters.shift();
        if (next) {
          next.resolve(pkt);
        } else {
          this.packetQueue.push(pkt);
        }
      });
      this.sock.once('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
        while (this.waiters.length > 0) this.waiters.shift()?.reject(err);
      });
      this.sock.bind(0, () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });

    const resp = await this.execute(CMD_CONNECT, Buffer.alloc(0));
    this.sessionId = resp.sessionId;
    if (resp.cmd === CMD_ACK_UNAUTH) {
      const authPayload = makeCommKey(commKey, this.sessionId);
      const authResp = await this.execute(CMD_AUTH, authPayload);
      if (authResp.cmd !== CMD_ACK_OK) {
        throw new Error('ZKTeco UDP authentication rejected (check Comm Key)');
      }
    }
  }

  async execute(cmd: number, data: Buffer = Buffer.alloc(0), timeoutMs = this.timeoutMs): Promise<{ cmd: number; sessionId: number; replyId: number; data: Buffer }> {
    const pkt = buildInnerPacket(cmd, this.sessionId, this.replyId, data);
    this.replyId = (this.replyId + 1) & 0xffff;
    const waitPromise = this.nextPacket(timeoutMs);
    await new Promise<void>((resolve, reject) => {
      this.sock.send(pkt, this.port || 4370, this.ip, (err) => (err ? reject(err) : resolve()));
    });
    return await waitPromise;
  }

  async readLargeBuffer(cmd: number, reqPayload: Buffer = Buffer.alloc(0)): Promise<Buffer> {
    const resp = await this.execute(cmd, reqPayload, Math.max(this.timeoutMs, 6000));
    if (resp.cmd === CMD_ACK_DATA || resp.cmd === CMD_DATA) {
      return resp.data;
    }

    if (resp.cmd === CMD_PREPARE_DATA || (resp.cmd === CMD_ACK_OK && resp.data.length >= 4)) {
      const totalSize = resp.data.length >= 4 ? resp.data.readUInt32LE(0) : 0;
      if (totalSize === 0) return Buffer.alloc(0);
      const chunks: Buffer[] = [];
      let received = 0;
      while (received < totalSize) {
        const pkt = await this.nextPacket(6000).catch(() => null);
        if (!pkt) break;
        if (pkt.cmd === CMD_DATA || pkt.cmd === CMD_ACK_DATA) {
          chunks.push(pkt.data);
          received += pkt.data.length;
        } else {
          break;
        }
      }
      try { await this.execute(CMD_FREE_DATA); } catch {}
      return Buffer.concat(chunks);
    }

    return Buffer.alloc(0);
  }

  async getFreeSizes(): Promise<ZkDeviceFreeSizes> {
    const resp = await this.execute(CMD_GET_FREE_SIZES);
    if (resp.cmd === CMD_ACK_OK && resp.data.length >= 40) {
      return {
        userCount: resp.data.readUInt32LE(16),
        fpCount: resp.data.readUInt32LE(24),
        logCount: resp.data.readUInt32LE(32),
        faceCount: resp.data.length >= 52 ? resp.data.readUInt32LE(48) : 0
      };
    }
    return { userCount: 0, logCount: 0, fpCount: 0, faceCount: 0 };
  }

  async getOption(key: string): Promise<string> {
    const payload = Buffer.from(`${key}\0`, 'ascii');
    const resp = await this.execute(CMD_OPTIONS_RRQ, payload);
    if (resp.cmd === CMD_ACK_OK && resp.data.length > 0) {
      const str = resp.data.toString('utf8').replace(/\0/g, '').trim();
      const idx = str.indexOf('=');
      return idx !== -1 ? str.slice(idx + 1).trim() : str;
    }
    return '';
  }

  async disableDevice() {
    try { await this.execute(CMD_DISABLEDEVICE, Buffer.alloc(4)); } catch {}
  }

  async enableDevice() {
    try { await this.execute(CMD_ENABLEDEVICE); } catch {}
  }

  async disconnect() {
    try { await this.execute(CMD_EXIT, Buffer.alloc(0), 600); } catch {}
    try { this.sock.close(); } catch {}
  }
}

function httpRequestText(options: {
  hostname: string;
  port: number;
  path: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
        timeout: options.timeoutMs || 3000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`HTTP timeout on ${options.hostname}:${options.port}${options.path}`));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function parseSoapAttlogXml(xml: string): ZkRawPunch[] {
  const punches: ZkRawPunch[] = [];
  if (!xml) return punches;
  const rowRegex = /<Row>([\s\S]*?)<\/Row>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(xml)) !== null) {
    const block = match[1];
    const pin = block.match(/<PIN>(.*?)<\/PIN>/i)?.[1]?.trim() || '';
    const dtRaw = block.match(/<DateTime>(.*?)<\/DateTime>/i)?.[1]?.trim() || '';
    const verified = block.match(/<Verified>(.*?)<\/Verified>/i)?.[1]?.trim();
    const status = block.match(/<Status>(.*?)<\/Status>/i)?.[1]?.trim();
    if (!pin || !dtRaw) continue;
    const m = dtRaw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) continue;
    const dt = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:${(m[6] || '00').padStart(2, '0')}`;
    punches.push({
      deviceUserId: pin,
      punchDateTime: dt,
      verifyMode: verified ? Number(verified) : undefined,
      inOutMode: status ? Number(status) : undefined
    });
  }
  return punches;
}

async function probeOrFetchViaWebHttp(
  ip: string,
  port: number,
  commKey = 0,
  timeoutMs = 2500,
  fetchData = false
): Promise<ZkPollHardwareResult> {
  const httpPort = port === 4370 || !port ? 80 : port;
  const start = Date.now();
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<GetAttLog>
  <ArgComKey xsi:type="xsd:integer">${commKey || 0}</ArgComKey>
  <Arg><PIN xsi:type="xsd:integer">All</PIN></Arg>
</GetAttLog>`;

  try {
    const soapRes = await httpRequestText({
      hostname: ip,
      port: httpPort,
      path: '/iWsService',
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(soapBody))
      },
      body: soapBody,
      timeoutMs
    });

    if (soapRes.statusCode >= 200 && soapRes.statusCode < 400 && (soapRes.body.includes('<GetAttLogResponse') || soapRes.body.includes('<Row>'))) {
      const punches = fetchData ? parseSoapAttlogXml(soapRes.body) : [];
      return {
        reachable: true,
        protocol: 'Web-HTTP',
        latencyMs: Date.now() - start,
        users: [],
        punches
      };
    }

    const portalRes = await httpRequestText({
      hostname: ip,
      port: httpPort,
      path: '/csl/check',
      method: 'GET',
      timeoutMs
    });

    if (portalRes.statusCode >= 200 && portalRes.statusCode < 400 && /zk|iclock|attlog|login/i.test(portalRes.body)) {
      return {
        reachable: true,
        protocol: 'Web-HTTP',
        latencyMs: Date.now() - start,
        users: [],
        punches: []
      };
    }

    return {
      reachable: false,
      protocol: 'NONE',
      latencyMs: Date.now() - start,
      users: [],
      punches: [],
      error: `HTTP ${httpPort} responded status ${soapRes.statusCode || portalRes.statusCode}`
    };
  } catch (err: any) {
    return {
      reachable: false,
      protocol: 'NONE',
      latencyMs: Date.now() - start,
      users: [],
      punches: [],
      error: err?.message || `Web HTTP/SOAP unreachable on ${ip}:${httpPort}`
    };
  }
}

export async function testZkHardwareConnection(
  ip: string,
  port = 4370,
  commKey = 0,
  timeoutMs = 2500,
  protocolMode: ZkProtocolMode = 'Auto'
): Promise<{
  reachable: boolean;
  protocol: 'TCP' | 'UDP' | 'Web-HTTP' | 'ADMS' | 'USB-Disk' | 'NONE';
  latencyMs: number;
  serialNumber?: string;
  deviceName?: string;
  freeSizes?: ZkDeviceFreeSizes;
  attempts?: ZkProtocolAttempt[];
  error?: string;
}> {
  if (!ip || ip === 'ADMS Push' || protocolMode === 'ADMS') {
    return { reachable: true, protocol: 'ADMS', latencyMs: 1, error: undefined };
  }
  if (ip === 'USB/File' || ip === 'Local Disk (E:)' || protocolMode === 'USB-Disk') {
    return { reachable: true, protocol: 'USB-Disk', latencyMs: 1, error: undefined };
  }

  const start = Date.now();
  const attempts: ZkProtocolAttempt[] = [];
  const tryTcp = protocolMode === 'Auto' || protocolMode === 'TCP';
  const tryUdp = protocolMode === 'Auto' || protocolMode === 'UDP';
  const tryWeb = protocolMode === 'Auto' || protocolMode === 'Web-HTTP';

  if (tryTcp) {
    const t0 = Date.now();
    const session = new ZkTcpSession(ip, port, timeoutMs);
    try {
      await session.connect(commKey);
      const freeSizes = await session.getFreeSizes().catch(() => undefined);
      const serialNumber = await session.getOption('~SerialNumber').catch(() => '');
      const deviceName = await session.getOption('~DeviceName').catch(() => '');
      await session.disconnect();
      attempts.push({ protocol: 'TCP-4370', reachable: true, latencyMs: Date.now() - t0 });
      return {
        reachable: true,
        protocol: 'TCP',
        latencyMs: Date.now() - t0,
        serialNumber: serialNumber || undefined,
        deviceName: deviceName || undefined,
        freeSizes,
        attempts
      };
    } catch (tcpErr: any) {
      await session.disconnect();
      attempts.push({
        protocol: 'TCP-4370',
        reachable: false,
        latencyMs: Date.now() - t0,
        error: tcpErr?.message || 'TCP connect timeout'
      });
    }
  }

  if (tryUdp) {
    const u0 = Date.now();
    const udpSession = new ZkUdpSession(ip, port, Math.min(timeoutMs, 2000));
    try {
      await udpSession.connect(commKey);
      const freeSizes = await udpSession.getFreeSizes().catch(() => undefined);
      const serialNumber = await udpSession.getOption('~SerialNumber').catch(() => '');
      const deviceName = await udpSession.getOption('~DeviceName').catch(() => '');
      await udpSession.disconnect();
      attempts.push({ protocol: 'UDP-4370', reachable: true, latencyMs: Date.now() - u0 });
      return {
        reachable: true,
        protocol: 'UDP',
        latencyMs: Date.now() - u0,
        serialNumber: serialNumber || undefined,
        deviceName: deviceName || undefined,
        freeSizes,
        attempts
      };
    } catch (udpErr: any) {
      await udpSession.disconnect();
      attempts.push({
        protocol: 'UDP-4370',
        reachable: false,
        latencyMs: Date.now() - u0,
        error: udpErr?.message || 'UDP connect timeout'
      });
    }
  }

  if (tryWeb) {
    const webRes = await probeOrFetchViaWebHttp(ip, port, commKey, Math.min(timeoutMs, 2000), false);
    attempts.push({
      protocol: `Web-HTTP-${port === 4370 || !port ? 80 : port}`,
      reachable: webRes.reachable,
      latencyMs: webRes.latencyMs,
      error: webRes.error
    });
    if (webRes.reachable) {
      return {
        reachable: true,
        protocol: 'Web-HTTP',
        latencyMs: webRes.latencyMs,
        attempts
      };
    }
  }

  return {
    reachable: false,
    protocol: 'NONE',
    latencyMs: Date.now() - start,
    attempts,
    error: attempts.map(a => `${a.protocol}: ${a.error || 'failed'}`).join(' | ') || `Device ${ip}:${port} unreachable`
  };
}

export async function fetchZkHardwareData(
  ip: string,
  port = 4370,
  commKey = 0,
  timeoutMs = 3500,
  protocolMode: ZkProtocolMode = 'Auto',
  options?: { knownLogCount?: number; forceFullRead?: boolean }
): Promise<ZkPollHardwareResult> {
  if (!ip || ip === 'ADMS Push' || ip === 'USB/File' || ip === 'Local Disk (E:)' || protocolMode === 'ADMS' || protocolMode === 'USB-Disk') {
    return {
      reachable: false,
      protocol: 'NONE',
      latencyMs: 0,
      users: [],
      punches: [],
      error: 'Configured as file/push-only source'
    };
  }

  const start = Date.now();
  const attempts: ZkProtocolAttempt[] = [];
  const tryTcp = protocolMode === 'Auto' || protocolMode === 'TCP';
  const tryUdp = protocolMode === 'Auto' || protocolMode === 'UDP';
  const tryWeb = protocolMode === 'Auto' || protocolMode === 'Web-HTTP';

  if (tryTcp) {
    const t0 = Date.now();
    const session = new ZkTcpSession(ip, port, timeoutMs);
    let disabled = false;
    try {
      await session.connect(commKey);

      const freeSizes = await session.getFreeSizes().catch(() => undefined);
      const serialNumber = await session.getOption('~SerialNumber').catch(() => '');
      const deviceName = await session.getOption('~DeviceName').catch(() => '');

      if (
        !options?.forceFullRead &&
        typeof options?.knownLogCount === 'number' &&
        options.knownLogCount >= 0 &&
        freeSizes &&
        freeSizes.logCount === options.knownLogCount
      ) {
        await session.disconnect();
        attempts.push({ protocol: 'TCP-4370', reachable: true, latencyMs: Date.now() - t0 });
        return {
          reachable: true,
          protocol: 'TCP',
          latencyMs: Date.now() - t0,
          serialNumber: serialNumber || undefined,
          deviceName: deviceName || undefined,
          freeSizes,
          users: [],
          punches: [],
          skippedUnchangedCount: true,
          attempts
        };
      }

      await session.disableDevice();
      disabled = true;

      let userBuf = await session.readWithDataWrrq(5).catch(() => Buffer.alloc(0));
      if (userBuf.length === 0) {
        userBuf = await session.readLargeBuffer(CMD_USERTEMP_RRQ, Buffer.from([0x05])).catch(() => Buffer.alloc(0));
      }
      const users = parseUsersPayload(userBuf);

      let attBuf = await session.readWithDataWrrq(CMD_ATTLOG_RRQ).catch(() => Buffer.alloc(0));
      if (attBuf.length === 0) {
        attBuf = await session.readLargeBuffer(CMD_ATTLOG_RRQ).catch(() => Buffer.alloc(0));
      }
      const punches = parseAttendancePayload(attBuf);

      await session.enableDevice();
      disabled = false;
      await session.disconnect();
      attempts.push({ protocol: 'TCP-4370', reachable: true, latencyMs: Date.now() - t0 });

      return {
        reachable: true,
        protocol: 'TCP',
        latencyMs: Date.now() - t0,
        serialNumber: serialNumber || undefined,
        deviceName: deviceName || undefined,
        freeSizes,
        users,
        punches,
        attempts
      };
    } catch (err: any) {
      if (disabled) await session.enableDevice();
      await session.disconnect();
      attempts.push({ protocol: 'TCP-4370', reachable: false, latencyMs: Date.now() - t0, error: err?.message || 'TCP error' });
    }
  }

  if (tryUdp) {
    const u0 = Date.now();
    const udpSession = new ZkUdpSession(ip, port, Math.min(timeoutMs, 2500));
    let disabled = false;
    try {
      await udpSession.connect(commKey);

      const freeSizes = await udpSession.getFreeSizes().catch(() => undefined);
      const serialNumber = await udpSession.getOption('~SerialNumber').catch(() => '');
      const deviceName = await udpSession.getOption('~DeviceName').catch(() => '');

      if (
        !options?.forceFullRead &&
        typeof options?.knownLogCount === 'number' &&
        options.knownLogCount >= 0 &&
        freeSizes &&
        freeSizes.logCount === options.knownLogCount
      ) {
        await udpSession.disconnect();
        attempts.push({ protocol: 'UDP-4370', reachable: true, latencyMs: Date.now() - u0 });
        return {
          reachable: true,
          protocol: 'UDP',
          latencyMs: Date.now() - u0,
          serialNumber: serialNumber || undefined,
          deviceName: deviceName || undefined,
          freeSizes,
          users: [],
          punches: [],
          skippedUnchangedCount: true,
          attempts
        };
      }

      await udpSession.disableDevice();
      disabled = true;

      const userBuf = await udpSession.readLargeBuffer(CMD_USERTEMP_RRQ, Buffer.from([0x05])).catch(() => Buffer.alloc(0));
      const users = parseUsersPayload(userBuf);

      const attBuf = await udpSession.readLargeBuffer(CMD_ATTLOG_RRQ).catch(() => Buffer.alloc(0));
      const punches = parseAttendancePayload(attBuf);

      await udpSession.enableDevice();
      disabled = false;
      await udpSession.disconnect();
      attempts.push({ protocol: 'UDP-4370', reachable: true, latencyMs: Date.now() - u0 });

      return {
        reachable: true,
        protocol: 'UDP',
        latencyMs: Date.now() - u0,
        serialNumber: serialNumber || undefined,
        deviceName: deviceName || undefined,
        freeSizes,
        users,
        punches,
        attempts
      };
    } catch (err: any) {
      if (disabled) await udpSession.enableDevice();
      await udpSession.disconnect();
      attempts.push({ protocol: 'UDP-4370', reachable: false, latencyMs: Date.now() - u0, error: err?.message || 'UDP error' });
    }
  }

  if (tryWeb) {
    const webRes = await probeOrFetchViaWebHttp(ip, port, commKey, Math.min(timeoutMs, 2500), true);
    attempts.push({
      protocol: `Web-HTTP-${port === 4370 || !port ? 80 : port}`,
      reachable: webRes.reachable,
      latencyMs: webRes.latencyMs,
      error: webRes.error
    });
    if (webRes.reachable) {
      return {
        ...webRes,
        attempts
      };
    }
  }

  return {
    reachable: false,
    protocol: 'NONE',
    latencyMs: Date.now() - start,
    users: [],
    punches: [],
    attempts,
    error: attempts.map(a => `${a.protocol}: ${a.error || 'failed'}`).join(' | ') || `Connection failed to ${ip}:${port}`
  };
}

export async function probeZkHostQuick(ip: string, port = 4370, timeoutMs = 450): Promise<{
  ip: string;
  port: number;
  reachable: boolean;
  protocol?: 'TCP' | 'UDP';
  latencyMs: number;
}> {
  const start = Date.now();
  const tcpOk = await new Promise<boolean>((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try { s.destroy(); } catch {}
      resolve(ok);
    };
    s.setTimeout(timeoutMs);
    s.once('connect', () => finish(true));
    s.once('timeout', () => finish(false));
    s.once('error', () => finish(false));
    s.connect(port, ip);
  });
  if (tcpOk) {
    return { ip, port, reachable: true, protocol: 'TCP', latencyMs: Date.now() - start };
  }
  return { ip, port, reachable: false, latencyMs: Date.now() - start };
}

export async function discoverZkDevicesOnSubnet(subnetPrefix: string, startHost = 1, endHost = 254, port = 4370) {
  const cleanPrefix = subnetPrefix.replace(/\.+$/, '').trim();
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanPrefix)) {
    throw new Error('Subnet prefix must look like 192.168.1 or 192.168.117');
  }
  const s = Math.max(1, Math.min(254, startHost));
  const e = Math.max(s, Math.min(254, endHost));
  const ips: string[] = [];
  for (let i = s; i <= e; i++) {
    ips.push(`${cleanPrefix}.${i}`);
  }
  const found: Array<{ ip: string; port: number; protocol: string; latencyMs: number }> = [];
  const batchSize = 32;
  for (let i = 0; i < ips.length; i += batchSize) {
    const slice = ips.slice(i, i + batchSize);
    const results = await Promise.all(slice.map(ip => probeZkHostQuick(ip, port, 350)));
    for (const r of results) {
      if (r.reachable && r.protocol) {
        found.push({ ip: r.ip, port: r.port, protocol: r.protocol, latencyMs: r.latencyMs });
      }
    }
  }
  return found;
}
