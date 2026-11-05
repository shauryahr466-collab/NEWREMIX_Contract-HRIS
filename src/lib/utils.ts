import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Converts any punch timestamp string to exact local device wall-clock ISO string (YYYY-MM-DDTHH:mm:ss).
 * Restores legacy UTC (.000Z) timestamps imported from Nepal (+05:45) back to exact local device time
 * while preserving non-Z local timestamps untouched.
 */
export function toDeviceWallClockIso(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const trimmed = String(isoString).trim().replace(' ', 'T');
  if (!trimmed || trimmed === '--' || trimmed === '--:--') return '';

  if (/Z$/i.test(trimmed)) {
    const utcMs = Date.parse(trimmed);
    if (!isNaN(utcMs)) {
      const nptDate = new Date(utcMs + 345 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${nptDate.getUTCFullYear()}-${pad(nptDate.getUTCMonth() + 1)}-${pad(nptDate.getUTCDate())}T${pad(nptDate.getUTCHours())}:${pad(nptDate.getUTCMinutes())}:${pad(nptDate.getUTCSeconds())}`;
    }
  }
  return trimmed.replace(/(\.\d+)?Z$/i, '');
}

export function formatAMPM(isoString: string | null | undefined): string {
  if (!isoString) return '--';
  const trimmed = String(isoString).trim();
  if (!trimmed || trimmed === '--' || trimmed === '--:--') return '--';

  const wallClock = /Z$/i.test(trimmed) ? toDeviceWallClockIso(trimmed) : trimmed;

  // Extract exact wall-clock HH:mm directly from ISO/datetime strings
  const timeMatch = wallClock.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minutesStr = minutes < 10 ? '0' + minutes : String(minutes);
      return `${hours}:${minutesStr} ${ampm}`;
    }
  }

  const date = new Date(wallClock);
  if (isNaN(date.getTime())) return '--';
  
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutesStr} ${ampm}`;
}

export function formatDuration(decimalHours: number): string {
  if (!decimalHours || decimalHours === 0) return '--';
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export function formatMinutes(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return '00:00';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Normalizes an employee ID by removing non-numeric prefixes/suffixes and leading zeros.
 * e.g., "EMP1257" -> "1257", "0001257" -> "1257", "1257" -> "1257"
 */
export function normalizeEmployeeId(id: string | number | undefined | null): string {
  if (id === undefined || id === null) return '';
  const str = String(id).trim();
  if (!str) return '';
  
  // Extract only digits and remove leading zeros
  const numericPart = str.replace(/[^0-9]/g, '').replace(/^0+/, '');
  
  // If there's no numeric part (e.g. "ADMIN"), return lowercase trimmed version
  if (!numericPart) return str.toLowerCase();
  
  return numericPart;
}

/**
 * Accurately formats punch timestamps and time strings to standard HH:mm 24-hour time.
 * Always extracts exact device wall-clock HH:mm without applying browser UTC offset shifts.
 */
export function formatPunchTime(punchStr?: string | null): string {
  if (!punchStr) return '--:--';
  const trimmed = String(punchStr).trim();
  if (!trimmed || trimmed === '-' || trimmed === '--:--' || trimmed === '--') return '--:--';

  // If already standard HH:mm
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  // If HH:mm:ss
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  // If 12-hour format e.g. "7:40 AM" or "08:00 PM"
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2];
    const meridiem = ampmMatch[3].toUpperCase();
    if (meridiem === 'PM' && h < 12) h += 12;
    if (meridiem === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  const wallClock = /Z$/i.test(trimmed) ? toDeviceWallClockIso(trimmed) : trimmed;

  // Extract exact wall-clock HH:mm from ISO/datetime strings (never shift by UTC offset)
  const isoMatch = wallClock.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/i);
  if (isoMatch) {
    return `${isoMatch[1].padStart(2, '0')}:${isoMatch[2]}`;
  }

  // Fallback parse without trailing Z
  try {
    const date = new Date(wallClock);
    if (!isNaN(date.getTime())) {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  } catch (e) {
    // ignore
  }

  return trimmed;
}

/**
 * Derives the true reconciled In Time and Out Time for an attendance record,
 * taking into account manual force attendance overrides, raw biometric punches,
 * single punch flags, and overnight punch boundaries.
 */
export function getAttendanceInAndOut(att?: {
  firstPunch?: string | null;
  lastPunch?: string | null;
  inTime?: string;
  outTime?: string;
  logs?: string[];
  rawLogs?: string[];
} | null) {
  if (!att) {
    return {
      inTime: '--:--',
      outTime: '--:--',
      isSinglePunch: false,
      hasIn: false,
      hasOut: false
    };
  }

  // 1. Check if reconciled / manual times are provided (from Force Attendance)
  let rawIn = att.inTime || att.firstPunch;
  let rawOut = att.outTime || att.lastPunch;

  const isSinglePunch = !!(
    (att.firstPunch && !att.lastPunch) ||
    (!att.firstPunch && att.lastPunch) ||
    (att.firstPunch && att.lastPunch && att.firstPunch === att.lastPunch && !att.outTime)
  );

  let formattedIn = '--:--';
  let formattedOut = '--:--';
  let hasIn = false;
  let hasOut = false;

  if (rawIn) {
    const t = formatPunchTime(rawIn);
    if (t !== '--:--') {
      formattedIn = t;
      hasIn = true;
    }
  }

  if (rawOut && (!isSinglePunch || att.outTime)) {
    const t = formatPunchTime(rawOut);
    if (t !== '--:--') {
      formattedOut = t;
      hasOut = true;
    }
  }

  // If only one punch existed and it was assigned to firstPunch
  if (isSinglePunch) {
    if (!hasIn && hasOut) {
      // It was an out punch only
      formattedIn = '--:--';
    } else if (hasIn && !att.outTime) {
      // It was an in punch only
      formattedOut = '--:--';
      hasOut = false;
    }
  }

  return {
    inTime: formattedIn,
    outTime: formattedOut,
    isSinglePunch,
    hasIn,
    hasOut
  };
}
