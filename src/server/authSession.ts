import crypto from 'crypto';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return configured;
  }
  return EPHEMERAL_FALLBACK_SECRET;
}

export interface SessionTokenPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (standard company shift)

export function signSessionToken(user: { id: string; email: string; role: string }): string {
  const now = Date.now();
  const payload: SessionTokenPayload = {
    sub: String(user.id),
    email: String(user.email).trim().toLowerCase(),
    role: String(user.role),
    iat: now,
    exp: now + TOKEN_TTL_MS
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(token?: string | null): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(payloadB64)
      .digest();
    const actualSig = Buffer.from(sigB64, 'base64url');
    if (expectedSig.length !== actualSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (!payload || !payload.sub || !payload.email || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader?: string | string[]): string | null {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
}

export function timingSafeSecretCompare(provided: string, expected: string): boolean {
  try {
    const a = crypto.createHash('sha256').update(String(provided || ''), 'utf8').digest();
    const b = crypto.createHash('sha256').update(String(expected || ''), 'utf8').digest();
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
