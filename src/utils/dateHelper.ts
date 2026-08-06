import NepaliDate from 'nepali-date-converter';
import { parseISO } from 'date-fns';

/**
 * Converts a Gregorian Date (A.D.) to Nepali Date (B.S.) string
 * @param date JavaScript Date object or ISO string (YYYY-MM-DD)
 * @returns Formatted string YYYY-MM-DD
 */
export function getNepaliDate(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) throw new Error('Invalid Date object');
    
    const nepaliDate = new NepaliDate(d);
    return nepaliDate.format('YYYY-MM-DD');
  } catch (e) {
    console.error('Error converting to Nepali date:', e);
    return '0000-00-00'; // Default fallback
  }
}
