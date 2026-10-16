import { validateCustomerAge } from '@/lib/customerUtils';
export {
  formatTattooSize,
  getEstimatedTattooDuration,
  getTattooDurationInfo,
  getTattooSizeCategory,
  calculateBlockingEndTime,
  isStartTimeAllowedForSize,
  STUDIO_OPERATING_HOURS,
} from '@/lib/utils/formatters';

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
 * Returns current Thailand (Asia/Bangkok) date string in YYYY-MM-DD format
 */
export function getThailandTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Returns earliest bookable Thailand date string (tomorrow) in YYYY-MM-DD format
 */
export function getThailandTomorrowStr(): string {
  const todayStr = getThailandTodayStr();
  const [year, month, day] = todayStr.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  const yStr = tomorrow.getUTCFullYear();
  const mStr = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
  const dStr = String(tomorrow.getUTCDate()).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

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
 * Formats a Date of Birth string (YYYY-MM-DD) into:
 * "1 พฤษภาคม 2549 (อายุ 20 ปี)"
 * Or if missing/invalid:
 * "ยังไม่ได้ระบุ (อายุ —)"
 *
 * Uses direct string parsing to avoid UTC/Local timezone offset shifts,
 * and calculates exact age in Asia/Bangkok time zone.
 */
export function formatCustomerDateOfBirthAndAge(
  dateOfBirthStr?: string | null,
  referenceDate: Date = new Date()
): string {
  if (!dateOfBirthStr || typeof dateOfBirthStr !== 'string' || !dateOfBirthStr.trim()) {
    return 'ยังไม่ได้ระบุ (อายุ —)';
  }

  const cleanStr = dateOfBirthStr.trim();
  const parts = cleanStr.split('-');
  if (parts.length !== 3) {
    return 'ยังไม่ได้ระบุ (อายุ —)';
  }

  const adYear = parseInt(parts[0], 10);
  const monthNum = parseInt(parts[1], 10);
  const dayNum = parseInt(parts[2], 10);

  if (
    isNaN(adYear) ||
    isNaN(monthNum) ||
    isNaN(dayNum) ||
    monthNum < 1 ||
    monthNum > 12 ||
    dayNum < 1 ||
    dayNum > 31
  ) {
    return 'ยังไม่ได้ระบุ (อายุ —)';
  }

  const yearBE = adYear + 543;
  const monthName = THAI_MONTHS_FULL[monthNum - 1];
  const dateFormatted = `${dayNum} ${monthName} ${yearBE}`;

  const ageVal = validateCustomerAge(cleanStr, referenceDate);
  const ageDisplay = ageVal.age >= 0 ? `${ageVal.age}` : '—';

  return `${dateFormatted} (อายุ ${ageDisplay} ปี)`;
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

/**
 * Resolves derived display status for customer portal view
 */
export function resolveCustomerDisplayStatus(
  status: string,
  hasPendingSlip?: boolean,
  isDateProposed?: boolean
): string {
  if (status === 'CONFIRMED') return 'CONFIRMED';
  if (status === 'APPROVED') return 'APPROVED';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'REJECTED') return 'REJECTED';

  if (hasPendingSlip) {
    return 'SLIP_REVIEW';
  }

  // If a new date has been proposed by shop/artist, show as WAITING_DEPOSIT ("รอชำระมัดจำ")
  if (isDateProposed) {
    return 'WAITING_DEPOSIT';
  }

  if (status === 'WAITING_DEPOSIT' || status === 'QUOTED') {
    return 'WAITING_DEPOSIT';
  }

  if (status === 'PENDING') {
    return 'PENDING';
  }

  if (status === 'ACCEPTED') {
    return 'ACCEPTED';
  }

  return status;
}

export function formatWorkTypeLabel(workType?: string | null): string {
  if (!workType) return 'งานสักใหม่';
  switch (workType) {
    case 'NEW_TATTOO':
      return 'งานสักใหม่';
    case 'CUSTOM_DESIGN':
      return 'งานออกแบบลาย';
    case 'REWORK':
      return 'แก้ไขงานสักเดิม';
    case 'COVER_UP':
      return 'แก้/ทับรอยสักเดิม';
    case 'SCAR_COVER':
      return 'สักทับรอยแผลเป็น';
    default:
      return 'งานสักใหม่';
  }
}

/**
 * Formats service_type code to Thai display label for Customer Portal
 */
export function formatServiceTypeLabel(serviceType?: string | null): string | null {
  if (!serviceType) return null;
  switch (serviceType) {
    case 'NEW_SMALL':
      return 'สักลายใหม่ — ไซส์เล็ก';
    case 'NEW_MEDIUM':
      return 'สักลายใหม่ — ไซส์กลาง';
    case 'NEW_LARGE':
      return 'สักลายใหม่ — ไซส์ใหญ่';
    case 'COVER_UP':
      return 'งานแก้ลาย / ทับลายเดิม';
    case 'CUSTOM':
      return 'งานออกแบบใหม่ตามสั่ง';
    case 'CONSULTATION':
      return 'ปรึกษาช่างก่อน';
    default:
      return null;
  }
}

export interface DepositDeadlineInfo {
  deadlineMs: number;
  deadlineDateStr: string;
  isExpired: boolean;
  remainingMs: number;
  remainingHours: number;
  remainingMinutes: number;
  remainingText: string;
}

/**
 * Calculates deposit deadline info (1 hour for new deposit-first bookings, 24 hours for legacy bookings)
 */
export function getDepositDeadlineInfo(
  approvedAt?: string | null,
  createdAt?: string | null,
  requestedDate?: string | null,
  requestedStartTime?: string | null
): DepositDeadlineInfo | null {
  const startTimeStr = approvedAt || createdAt;
  if (!startTimeStr) return null;
  try {
    const startTime = new Date(startTimeStr).getTime();
    if (isNaN(startTime)) return null;

    // Legacy booking (approvedAt present): 24 hours. New deposit-first booking (approvedAt null): 1 hour.
    const durationMs = approvedAt ? 24 * 60 * 60 * 1000 : 1 * 60 * 60 * 1000;
    let deadlineMs = startTime + durationMs;

    // Cap deposit deadline by requested appointment time if present (cannot pay deposit AFTER appointment time)
    if (requestedDate) {
      const timePart = (requestedStartTime && requestedStartTime.trim())
        ? (requestedStartTime.length === 5 ? `${requestedStartTime}:00` : requestedStartTime)
        : '10:00:00';
      const appointmentDateObj = new Date(`${requestedDate}T${timePart}`);
      const appointmentMs = appointmentDateObj.getTime();
      if (!isNaN(appointmentMs) && appointmentMs > 0) {
        deadlineMs = Math.min(deadlineMs, appointmentMs);
      }
    }

    const now = Date.now();
    const remainingMs = deadlineMs - now;
    const isExpired = remainingMs <= 0;

    const deadlineDate = new Date(deadlineMs);
    const day = deadlineDate.toLocaleDateString('en-US', { timeZone: TIMEZONE, day: 'numeric' });
    const monthIndex = parseInt(deadlineDate.toLocaleDateString('en-US', { timeZone: TIMEZONE, month: 'numeric' }), 10) - 1;
    const yearCE = parseInt(deadlineDate.toLocaleDateString('en-US', { timeZone: TIMEZONE, year: 'numeric' }), 10);
    const yearBE = yearCE + 543;
    const monthName = THAI_MONTHS_SHORT[monthIndex];
    const timeFormatted = formatTimeBangkok(deadlineDate.toISOString());

    const formattedDeadlineDate = `${day} ${monthName} ${yearBE} เวลา ${timeFormatted}`;

    if (isExpired) {
      return {
        deadlineMs,
        deadlineDateStr: formattedDeadlineDate,
        isExpired: true,
        remainingMs: 0,
        remainingHours: 0,
        remainingMinutes: 0,
        remainingText: 'หมดเวลาชำระมัดจำ',
      };
    }

    const totalMinutes = Math.floor(remainingMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    let remainingText = '';
    if (hours > 0) {
      remainingText = `${hours} ชม. ${minutes} นาที`;
    } else {
      remainingText = `${minutes} นาที`;
    }

    return {
      deadlineMs,
      deadlineDateStr: formattedDeadlineDate,
      isExpired: false,
      remainingMs,
      remainingHours: hours,
      remainingMinutes: minutes,
      remainingText,
    };
  } catch {
    return null;
  }
}

/**
 * Checks whether a booking's deposit payment deadline has expired
 */
export function isDepositExpired(booking?: any, estimate?: any, session?: any): boolean {
  const status = String(booking?.status || estimate?.status || session?.status || '').toUpperCase();
  if (!status) return false;

  if (status === 'EXPIRED') return true;

  if (status === 'WAITING_DEPOSIT' || status === 'PENDING_DEPOSIT') {
    const approvedAt = booking?.approved_at || estimate?.accepted_at || estimate?.quoted_at;
    const createdAt = booking?.created_at || estimate?.created_at || session?.created_at;
    const requestedDate = booking?.requested_date || estimate?.preferred_date || (session?.start_at ? session.start_at.slice(0, 10) : null);
    const requestedStartTime = booking?.requested_start_time || estimate?.preferred_time || (session?.start_at ? session.start_at.slice(11, 19) : null);

    const dlInfo = getDepositDeadlineInfo(approvedAt, createdAt, requestedDate, requestedStartTime);
    return dlInfo?.isExpired ?? false;
  }

  return false;
}

/**
 * Target Business Rule for Real Queue Appointments:
 * An item qualifies as a confirmed queue appointment if and only if:
 * 1. Booking exists
 * 2. Deposit has been paid and confirmed (booking.status is 'CONFIRMED' or 'IN_PROGRESS')
 * 3. Strictly NOT in pre-deposit or pending-slip statuses: WAITING_DEPOSIT, PENDING, APPROVED
 * 4. Strictly NOT in terminal unconfirmed statuses: CANCELLED, REJECTED, EXPIRED
 * 5. Not deposit-expired
 * 6. Financial check: If deposit_required > 0 on payment summary, deposit_paid must not be false
 */
export function isConfirmedDepositBooking(
  booking?: any,
  estimate?: any,
  session?: any,
  paymentSummary?: any
): boolean {
  if (!booking) return false;

  const bStatus = String(booking?.status || '').toUpperCase();

  // 1. Strictly exclude pre-deposit, unverified slip, or terminal statuses
  if (['WAITING_DEPOSIT', 'PENDING', 'APPROVED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(bStatus)) {
    return false;
  }

  // 2. Must be in an active confirmed queue status
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(bStatus)) {
    return false;
  }

  // 3. Must not be deposit-expired
  if (isDepositExpired(booking, estimate, session)) {
    return false;
  }

  // 4. Financial verification if payment summary is present and deposit is required
  if (paymentSummary && paymentSummary.deposit_required > 0) {
    if (paymentSummary.deposit_paid === false) {
      return false;
    }
  }

  return true;
}

/**
 * Parses bracketed/tagged metadata from flash_reservations.customer_note
 * e.g. [ตำแหน่ง: หน้าอก], [ขนาด: Size L], [เวลาสะดวก: 14:00]
 */
export function parseFlashCustomerNote(noteText?: string | null): {
  parsedPlacement: string | null;
  parsedSizeRaw: string | null;
  cleanNote: string;
} {
  if (!noteText || !noteText.trim()) {
    return { parsedPlacement: null, parsedSizeRaw: null, cleanNote: '' };
  }

  let text = noteText.trim();
  let parsedPlacement: string | null = null;
  let parsedSizeRaw: string | null = null;

  // 1. Bracketed placement: [ตำแหน่ง: ...] or [ตำแหน่งที่สัก: ...]
  const bracketPlacementMatch = text.match(/\[(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\]]+)\]/i);
  if (bracketPlacementMatch) {
    parsedPlacement = bracketPlacementMatch[1].trim();
    text = text.replace(/\[(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\]]+)\]/gi, '');
  } else {
    const linePlacementMatch = text.match(/(?:^|\n)(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\n]+)/i);
    if (linePlacementMatch) {
      parsedPlacement = linePlacementMatch[1].trim();
      text = text.replace(/(?:^|\n)(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\n]+)/gi, '');
    }
  }

  // 2. Bracketed size: [ขนาด: ...] or [ขนาดงานสัก: ...]
  const bracketSizeMatch = text.match(/\[(?:ขนาด|ขนาดงานสัก):\s*([^\]]+)\]/i);
  if (bracketSizeMatch) {
    parsedSizeRaw = bracketSizeMatch[1].trim();
    text = text.replace(/\[(?:ขนาด|ขนาดงานสัก):\s*([^\]]+)\]/gi, '');
  } else {
    const lineSizeMatch = text.match(/(?:^|\n)(?:ขนาด|ขนาดงานสัก):\s*([^\n]+)/i);
    if (lineSizeMatch) {
      parsedSizeRaw = lineSizeMatch[1].trim();
      text = text.replace(/(?:^|\n)(?:ขนาด|ขนาดงานสัก):\s*([^\n]+)/gi, '');
    }
  }

  // 3. Remove time/date legacy tags e.g. [เวลาสะดวก: ...], [วันสะดวก: ...]
  text = text
    .replace(/\[(?:เวลาสะดวก|เวลาที่สะดวก|เวลาเริ่ม|วันสะดวก|วันที่สะดวก|วันนัด):\s*([^\]]+)\]/gi, '')
    .replace(/(?:^|\n)(?:เวลาสะดวก|เวลาที่สะดวก|เวลาเริ่ม|วันสะดวก|วันที่สะดวก|วันนัด):\s*([^\n]+)/gi, '');

  const cleanNote = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    parsedPlacement,
    parsedSizeRaw,
    cleanNote,
  };
}


