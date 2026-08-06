import NepaliDate from 'nepali-date-converter';
import { format, parseISO } from 'date-fns';

export interface NepaliMonthOption {
  value: number; // 0 to 11
  name: string; // "Baisakh", "Shrawan", etc.
  nepaliName: string;
}

export const NEPALI_MONTHS: NepaliMonthOption[] = [
  { value: 0, name: 'Baisakh', nepaliName: 'वैशाख' },
  { value: 1, name: 'Jestha', nepaliName: 'जेठ' },
  { value: 2, name: 'Ashadh', nepaliName: 'असार' },
  { value: 3, name: 'Shrawan', nepaliName: 'साउन' },
  { value: 4, name: 'Bhadra', nepaliName: 'भदौ' },
  { value: 5, name: 'Ashwin', nepaliName: 'असोज' },
  { value: 6, name: 'Kartik', nepaliName: 'कात्तिक' },
  { value: 7, name: 'Mangsir', nepaliName: 'मंसिर' },
  { value: 8, name: 'Poush', nepaliName: 'पुस' },
  { value: 9, name: 'Magh', nepaliName: 'माघ' },
  { value: 10, name: 'Falgun', nepaliName: 'फागुन' },
  { value: 11, name: 'Chaitra', nepaliName: 'चैत' },
];

export interface NepaliDayDetail {
  dayNumber: number; // 1, 2, ...
  bsDateStr: string; // e.g. "2083-04-01"
  adDate: Date;
  adDateStr: string; // e.g. "2026-07-17"
  dayOfWeek: string; // "Sun", "Mon", etc.
  isSaturday: boolean;
}

/**
 * Convert A.D. number to Nepali Numeral String (1 -> १)
 */
export function toNepaliDigits(num: number | string): string {
  const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return String(num).replace(/\d/g, (d) => nepaliDigits[parseInt(d, 10)]);
}

/**
 * Get current Nepali year and month index
 */
export function getCurrentNepaliDateInfo() {
  try {
    const np = new NepaliDate();
    return {
      year: np.getYear(),
      monthIndex: np.getMonth(), // 0-indexed
      day: np.getDate()
    };
  } catch (e) {
    return { year: 2083, monthIndex: 3, day: 1 };
  }
}

/**
 * Convert A.D. date to B.S. string (YYYY-MM-DD)
 */
export function formatADToBS(date: Date | string): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) return '';
    const np = new NepaliDate(d);
    const y = np.getYear();
    const m = String(np.getMonth() + 1).padStart(2, '0');
    const day = String(np.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    return '';
  }
}

/**
 * Get list of days for a given Nepali year and month index
 */
export function getNepaliMonthDays(year: number, monthIndex: number): NepaliDayDetail[] {
  const days: NepaliDayDetail[] = [];
  // Loop days starting at 1
  for (let day = 1; day <= 32; day++) {
    try {
      const np = new NepaliDate(year, monthIndex, day);
      if (np.getMonth() !== monthIndex || np.getYear() !== year) {
        break; // Reached end of month
      }
      const adDate = np.toJsDate();
      const adDateStr = format(adDate, 'yyyy-MM-dd');
      const dayOfWeek = format(adDate, 'EEE');
      const mStr = String(monthIndex + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      
      days.push({
        dayNumber: day,
        bsDateStr: `${year}-${mStr}-${dStr}`,
        adDate,
        adDateStr,
        dayOfWeek,
        isSaturday: dayOfWeek === 'Sat'
      });
    } catch (e) {
      break;
    }
  }
  return days;
}

/**
 * Get English equivalent summary (e.g. "Jul 17, 2026 - Aug 17, 2026")
 */
export function getNepaliMonthEnglishEquivalent(year: number, monthIndex: number): string {
  const days = getNepaliMonthDays(year, monthIndex);
  if (days.length === 0) return '';
  const startAD = days[0].adDate;
  const endAD = days[days.length - 1].adDate;
  return `${format(startAD, 'MMM dd, yyyy')} - ${format(endAD, 'MMM dd, yyyy')}`;
}
