import NepaliDate from 'nepali-date-converter';
import { parseISO, format, differenceInMonths, differenceInDays } from 'date-fns';

/**
 * Converts a Gregorian Date (A.D.) to Nepali Date (B.S.) string
 * @param date JavaScript Date object or ISO string (YYYY-MM-DD)
 * @returns Formatted string YYYY-MM-DD
 */
export function getNepaliDate(date: any): string {
  try {
    if (date === null || date === undefined || date === '' || date === '-' || date === 'Unrecorded') return '0000-00-00';
    const d = date instanceof Date ? (isNaN(date.getTime()) ? null : date) : parseUniversalDate(date);
    if (!d || isNaN(d.getTime())) return '0000-00-00';
    
    const nepaliDate = new NepaliDate(d);
    return nepaliDate.format('YYYY-MM-DD');
  } catch (e) {
    return '0000-00-00';
  }
}

/**
 * Universal Date Parser
 * Intelligently parses:
 * - ISO strings ('2024-05-15', '2024-05-15T10:30:00Z')
 * - Nepali B.S. dates ('2080-04-15', '2079/01/01', '2081.02.10') -> converts to AD
 * - DD/MM/YYYY or DD-MM-YYYY ('15/04/2021', '01-08-2019')
 * - MM/DD/YYYY ('04/15/2021')
 * - Excel Serial Numbers (e.g. 44561 -> 2021-12-31)
 * - Timestamps (ms or seconds)
 */
export function parseUniversalDate(input: any): Date | null {
  if (input === null || input === undefined || input === '') return null;

  // 1. If already a Date object
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }

  // 2. If number (Excel serial or epoch timestamp)
  if (typeof input === 'number' && !isNaN(input)) {
    // Excel serial number (typically between 20000 and 80000 for 1954 to 2119)
    if (input > 20000 && input < 90000) {
      // Excel epoch starts at 1899-12-30 (due to 1900 leap year bug)
      const jsEpochMs = (input - 25569) * 86400 * 1000;
      const d = new Date(jsEpochMs);
      return isNaN(d.getTime()) ? null : d;
    }
    // Unix timestamp in seconds
    if (input > 100000000 && input < 3000000000) {
      return new Date(input * 1000);
    }
    // Unix timestamp in milliseconds
    if (input >= 3000000000) {
      const d = new Date(input);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const str = String(input).trim();
  if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'unrecorded') {
    return null;
  }

  // If numeric string like "44561"
  if (/^\d{5}$/.test(str)) {
    const num = Number(str);
    if (num > 20000 && num < 90000) {
      const d = new Date((num - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 3. Check for standard YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);

    // If year is in Nepali B.S. range (2060 to 2099)
    if (year >= 2060 && year <= 2099) {
      try {
        const np = new NepaliDate(year, Math.max(0, month - 1), Math.max(1, day));
        const jsDate = np.toJsDate();
        if (!isNaN(jsDate.getTime())) return jsDate;
      } catch (e) {
        // fallback approximation if converter fails on fringe days: B.S. is ~56.7 years ahead of A.D.
        return new Date(year - 57, month - 1, day);
      }
    }

    // Standard Gregorian A.D.
    if (year >= 1900 && year <= 2100) {
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 4. Check for DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const part1 = parseInt(dmyMatch[1], 10);
    const part2 = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);

    // If year is B.S.
    if (year >= 2060 && year <= 2099) {
      const day = part1;
      const month = part2;
      try {
        const np = new NepaliDate(year, Math.max(0, month - 1), Math.max(1, day));
        const jsDate = np.toJsDate();
        if (!isNaN(jsDate.getTime())) return jsDate;
      } catch (e) {
        return new Date(year - 57, month - 1, day);
      }
    }

    // Try DD/MM/YYYY
    let day = part1;
    let month = part2;
    if (month > 12 && day <= 12) {
      // It was MM/DD/YYYY
      month = part1;
      day = part2;
    }

    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  // 5. Standard JS Date parser fallback
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      // If parsed year looks like B.S. (e.g. 2080)
      if (parsed.getFullYear() >= 2060 && parsed.getFullYear() <= 2099) {
        try {
          const np = new NepaliDate(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
          return np.toJsDate();
        } catch (e) {
          return new Date(parsed.getFullYear() - 57, parsed.getMonth(), parsed.getDate());
        }
      }
      return parsed;
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * Calculates experience in exact decimal years from Date of Joining.
 * Returns 0 if joiningDate is missing, invalid, or in the future.
 */
export function calculateExperienceYears(joiningDate?: any, asOfDate: Date = new Date()): number {
  if (!joiningDate) return 0;
  const d = parseUniversalDate(joiningDate);
  if (!d || isNaN(d.getTime())) return 0;

  const diffMs = asOfDate.getTime() - d.getTime();
  if (diffMs <= 0) return 0;

  // Exact years calculation: 365.2425 days per Gregorian year
  const years = diffMs / (365.2425 * 24 * 60 * 60 * 1000);
  return Math.max(0, Number(years.toFixed(1)));
}

/**
 * Formats experience in human readable format, e.g. "3.5 yrs" or "6 mos" or "0 yrs"
 */
export function formatExperience(years: number): string {
  if (isNaN(years) || years <= 0) return '0 yrs';
  if (years < 1) {
    const mos = Math.round(years * 12);
    return mos > 0 ? `${mos} mos` : '< 1 mo';
  }
  return `${years} yrs`;
}

/**
 * Formats experience detailed, e.g. "3 yrs 4 mos"
 */
export function formatExperienceDetailed(joiningDate?: any, asOfDate: Date = new Date()): string {
  if (!joiningDate) return '0 yrs';
  const d = parseUniversalDate(joiningDate);
  if (!d || isNaN(d.getTime())) return '0 yrs';

  const totalMonths = differenceInMonths(asOfDate, d);
  if (totalMonths <= 0) return '0 yrs';

  const yrs = Math.floor(totalMonths / 12);
  const mos = totalMonths % 12;

  if (yrs === 0) return `${mos} mos`;
  if (mos === 0) return `${yrs} yrs`;
  return `${yrs} yrs ${mos} mos`;
}

/**
 * Formats any date input (ISO string, DD/MM/YYYY, Nepali BS, Excel serial number like 45761)
 * into a standardized formatted date string (e.g. 'YYYY-MM-DD').
 * @param input Date object, string date, or Excel numeric serial
 * @param formatPattern e.g. 'yyyy-MM-dd' or 'dd-MMM-yyyy'
 */
export function formatUniversalDate(input: any, formatPattern: string = 'yyyy-MM-dd'): string {
  if (input === null || input === undefined || input === '' || input === '-' || input === 'N/A' || input === 'Unrecorded') {
    return '-';
  }
  const d = parseUniversalDate(input);
  if (!d || isNaN(d.getTime())) {
    return typeof input === 'string' && input.trim() ? input.trim() : '-';
  }
  try {
    return format(d, formatPattern);
  } catch (e) {
    return d.toISOString().split('T')[0];
  }
}

/**
 * Returns formatted dual date representation for HRIS (A.D. & B.S.)
 */
export function formatDOJDisplay(input: any): { adDate: string; bsDate: string; formatted: string } {
  if (input === null || input === undefined || input === '' || input === '-' || input === 'N/A' || input === 'Unrecorded') {
    return { adDate: '-', bsDate: '-', formatted: '-' };
  }
  const d = parseUniversalDate(input);
  if (!d || isNaN(d.getTime())) {
    const s = typeof input === 'string' ? input.trim() : String(input);
    return { adDate: s, bsDate: '-', formatted: s };
  }

  const adDate = format(d, 'yyyy-MM-dd');
  const bsDate = getNepaliDate(d);
  const bsText = bsDate !== '0000-00-00' ? `BS ${bsDate}` : '';
  return {
    adDate,
    bsDate: bsDate !== '0000-00-00' ? bsDate : '-',
    formatted: bsText ? `${adDate} (${bsText})` : adDate
  };
}
