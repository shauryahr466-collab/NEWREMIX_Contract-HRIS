// In-memory session token & actor store (never persisted to localStorage or sessionStorage)
let memorySessionToken: string | null = null;
let memoryUserInfo: { email?: string; username?: string; role?: string } | null = null;
let unauthorizedHandler: (() => void) | null = null;

// Clean up any legacy sessionStorage auth keys from older builds on module load
try {
  sessionStorage.removeItem('local_session_user');
  sessionStorage.removeItem('local_user_profile');
  sessionStorage.removeItem('is_otp_verified');
} catch {
  // ignore
}

export function setInMemorySession(
  token: string | null,
  userInfo?: { email?: string; username?: string; role?: string } | null
) {
  memorySessionToken = token;
  memoryUserInfo = userInfo || null;
}

export function getInMemorySessionToken(): string | null {
  return memorySessionToken;
}

export function getInMemoryUserDisplayName(): string {
  return memoryUserInfo?.username || memoryUserInfo?.email || 'System Admin';
}

export function clearInMemorySession() {
  memorySessionToken = null;
  memoryUserInfo = null;
  try {
    sessionStorage.removeItem('local_session_user');
    sessionStorage.removeItem('local_user_profile');
    sessionStorage.removeItem('is_otp_verified');
  } catch {
    // ignore
  }
}

export function registerUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || undefined);
  if (memorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memorySessionToken}`);
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && memorySessionToken && unauthorizedHandler) {
    unauthorizedHandler();
  }
  return response;
}
