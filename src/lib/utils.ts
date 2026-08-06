import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function formatAMPM(isoString: string | null | undefined): string {
  if (!isoString) return '--';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '--';
  
  let hours = date.getHours();
  let minutes = date.getMinutes();
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
