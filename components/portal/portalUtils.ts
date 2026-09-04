export const TIMEZONE = 'Asia/Bangkok';

export const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

/**
 * Formats ISO date or date string (YYYY-MM-DD) to "21 ก.ย. 2569" or "21 กันยายน 2569"
 */
export function formatThaiDate(dateStr?: string | null, fullMonth = false): string {
  if (!dateStr) return 'ไม่ระบุ';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10) + 543;
        const mIdx = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const mName = fullMonth ? THAI_MONTHS_FULL[mIdx] : THAI_MONTHS_SHORT[mIdx];
        return `${day} ${mName} ${y}`;
      }
      return dateStr;
    }

    const day = d.toLocaleDateString('en-US', { timeZone: TIMEZONE, day: 'numeric' });
    const monthIndex =
      parseInt(d.toLocaleDateString('en-US', { timeZone: TIMEZONE, month: 'numeric' }), 10) - 1;
    const yearCE = parseInt(
      d.toLocaleDateString('en-US', { timeZone: TIMEZONE, year: 'numeric' }),
      10
    );
    const yearBE = yearCE + 543;
    const monthName = fullMonth ? THAI_MONTHS_FULL[monthIndex] : THAI_MONTHS_SHORT[monthIndex];
    return `${day} ${monthName} ${yearBE}`;
  } catch {
    return dateStr;
  }
}

/**
 * Formats ISO timestamp to "10:00 น."
 */
export function formatTimeBangkok(isoString?: string | null): string {
  if (!isoString) return '-';
  try {
    // If it's already a time string like "10:00:00"
    if (isoString.includes(':') && !isoString.includes('T')) {
      const [h, m] = isoString.split(':');
      return `${h}:${m} น.`;
    }
    const d = new Date(isoString);
    const timeStr = new Intl.DateTimeFormat('th-TH', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
    return `${timeStr} น.`;
  } catch {
    return isoString;
  }
}

/**
 * Calculate duration text in hours
 */
export function calculateDurationHours(startIso: string, endIso: string): number {
  try {
    const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (diffMs <= 0) return 0;
    return Math.max(1, Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10);
  } catch {
    return 0;
  }
}

/**
 * Formats numeric currency with thousands separator: "8,000"
 */
export function formatCurrency(amount?: number | null): string {
  return Number(amount ?? 0).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
