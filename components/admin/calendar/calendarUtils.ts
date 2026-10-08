import { SessionStatus, BookingStatus, CalendarSessionEvent } from './types';
import { formatTattooSize } from '@/lib/utils/formatters';

export const TIMEZONE = 'Asia/Bangkok';

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

export const THAI_DAYS_FULL = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
];

export const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export const WORKING_HOURS_START = 9; // 09:00
export const WORKING_HOURS_END = 21; // 21:00

/**
 * Returns today's date in YYYY-MM-DD format in Asia/Bangkok time
 */
export function getTodayBangkokStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Formats ISO date to "3 ก.ย. 2569" or "3 กันยายน 2569"
 */
export function formatDateBangkok(iso: string | null | undefined, fullMonth = false): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString('en-US', { timeZone: TIMEZONE, day: 'numeric' });
    const monthIndex = parseInt(
      d.toLocaleDateString('en-US', { timeZone: TIMEZONE, month: 'numeric' }),
      10
    ) - 1;
    const yearCE = parseInt(
      d.toLocaleDateString('en-US', { timeZone: TIMEZONE, year: 'numeric' }),
      10
    );
    const yearBE = yearCE + 543;
    const monthName = fullMonth ? THAI_MONTHS_FULL[monthIndex] : THAI_MONTHS_SHORT[monthIndex];
    return `${day} ${monthName} ${yearBE}`;
  } catch {
    return iso;
  }
}

/**
 * Formats ISO date to "13:00 น."
 */
export function formatTimeBangkok(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const timeStr = new Intl.DateTimeFormat('th-TH', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
    return `${timeStr} น.`;
  } catch {
    return iso;
  }
}

/**
 * Returns date in YYYY-MM-DD from an ISO timestamp in Bangkok timezone
 */
export function getDateStrBangkok(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/**
 * Format total minutes to duration string: e.g. 120 -> "2 ชม.", 90 -> "1 ชม. 30 นาที", 45 -> "45 นาที"
 */
export function formatMinutesToDurationText(totalMinutes: number): string {
  const roundedMins = Math.round(totalMinutes);
  if (roundedMins <= 0 || isNaN(roundedMins)) return '0 นาที';
  const hours = Math.floor(roundedMins / 60);
  const mins = roundedMins % 60;
  if (hours > 0 && mins > 0) return `${hours} ชม. ${mins} นาที`;
  if (hours > 0) return `${hours} ชม.`;
  return `${mins} นาที`;
}

/**
 * Calculate duration string "2 ชม." or "1 ชม. 30 นาที" or "45 นาที" from ISO strings
 */
export function calculateDurationText(startIso: string, endIso: string): string {
  try {
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const diffMs = endMs - startMs;
    if (diffMs <= 0 || isNaN(diffMs)) return '0 นาที';
    const totalMinutes = Math.round(diffMs / (1000 * 60));
    return formatMinutesToDurationText(totalMinutes);
  } catch {
    return '-';
  }
}

/**
 * Calculate duration string "2 ชม." or "1 ชม. 30 นาที" or "45 นาที" from time strings (e.g. "14:20", "16:20")
 */
export function calculateDurationTextFromTimes(startTimeStr?: string | null, endTimeStr?: string | null): string {
  if (!startTimeStr || !endTimeStr) return '';
  try {
    const cleanStart = startTimeStr.replace(' น.', '').trim();
    const cleanEnd = endTimeStr.replace(' น.', '').trim();
    const [startH, startM] = cleanStart.split(':').map(Number);
    const [endH, endM] = cleanEnd.split(':').map(Number);
    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return '';
    const startTotalMins = startH * 60 + startM;
    const endTotalMins = endH * 60 + endM;
    const diffMins = Math.round(endTotalMins - startTotalMins);
    return formatMinutesToDurationText(diffMins);
  } catch {
    return '';
  }
}

export type EffectiveEventStatus =
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'WAITING_DEPOSIT'
  | 'PENDING'
  | 'CONFIRMED';

/**
 * Derives the effective event status combining booking status and session status.
 * Order of precedence: EXPIRED > REJECTED > CANCELLED > COMPLETED > IN_PROGRESS > WAITING_DEPOSIT > PENDING > CONFIRMED
 */
export function getEffectiveEventStatus(ev: CalendarSessionEvent): EffectiveEventStatus {
  const status = ev.status;
  const bookingStatus = ev.booking?.status;

  // 1. Booking terminal status takes precedence
  if (bookingStatus === 'EXPIRED') return 'EXPIRED';
  if (bookingStatus === 'REJECTED') return 'REJECTED';
  if (bookingStatus === 'CANCELLED' || status === 'CANCELLED') return 'CANCELLED';

  // 2. Execution & Payment statuses (Booking status takes precedence over session)
  if (bookingStatus === 'COMPLETED' || status === 'COMPLETED') return 'COMPLETED';
  if (bookingStatus === 'IN_PROGRESS' || status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (bookingStatus === 'WAITING_DEPOSIT') return 'WAITING_DEPOSIT';
  if (bookingStatus === 'PENDING') return 'PENDING';

  return 'CONFIRMED';
}

/**
 * Unified visual configuration for Calendar Events aligned with Admin Requests
 */
export function getEventStatusConfig(ev: CalendarSessionEvent): {
  key: EffectiveEventStatus;
  label: string;
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotClass: string;
  colorClass: string;
} {
  const eff = getEffectiveEventStatus(ev);

  switch (eff) {
    case 'CANCELLED':
      return {
        key: 'CANCELLED',
        label: 'ยกเลิก',
        bg: 'bg-red-950/20',
        border: 'border-red-900/40',
        text: 'text-zinc-500 line-through',
        badgeBg: 'bg-red-950/60',
        badgeText: 'text-red-400',
        badgeBorder: 'border-red-800/60',
        dotClass: 'bg-red-400',
        colorClass: 'text-red-400',
      };
    case 'REJECTED':
      return {
        key: 'REJECTED',
        label: 'ปฏิเสธ',
        bg: 'bg-zinc-900/90',
        border: 'border-zinc-700/80',
        text: 'text-zinc-400',
        badgeBg: 'bg-zinc-900/90',
        badgeText: 'text-zinc-400',
        badgeBorder: 'border-zinc-700/80',
        dotClass: 'bg-zinc-400',
        colorClass: 'text-zinc-400',
      };
    case 'EXPIRED':
      return {
        key: 'EXPIRED',
        label: 'หมดเวลาชำระมัดจำ',
        bg: 'bg-zinc-950/30',
        border: 'border-zinc-800/60',
        text: 'text-zinc-500',
        badgeBg: 'bg-zinc-900/90',
        badgeText: 'text-zinc-400',
        badgeBorder: 'border-zinc-700/80',
        dotClass: 'bg-zinc-500',
        colorClass: 'text-zinc-500',
      };
    case 'COMPLETED':
      return {
        key: 'COMPLETED',
        label: 'งานเสร็จสิ้น',
        bg: 'bg-emerald-950/25',
        border: 'border-emerald-800/50',
        text: 'text-emerald-300',
        badgeBg: 'bg-emerald-950/60',
        badgeText: 'text-emerald-400',
        badgeBorder: 'border-emerald-800/60',
        dotClass: 'bg-emerald-400',
        colorClass: 'text-emerald-400',
      };
    case 'IN_PROGRESS':
      return {
        key: 'IN_PROGRESS',
        label: 'กำลังสัก',
        bg: 'bg-amber-950/25',
        border: 'border-amber-800/50',
        text: 'text-amber-300',
        badgeBg: 'bg-amber-950/60',
        badgeText: 'text-amber-400',
        badgeBorder: 'border-amber-800/60',
        dotClass: 'bg-amber-400',
        colorClass: 'text-amber-400',
      };
    case 'WAITING_DEPOSIT':
      return {
        key: 'WAITING_DEPOSIT',
        label: 'รอมัดจำ',
        bg: 'bg-purple-950/25',
        border: 'border-purple-800/50',
        text: 'text-purple-300',
        badgeBg: 'bg-purple-950/60',
        badgeText: 'text-purple-400',
        badgeBorder: 'border-purple-800/60',
        dotClass: 'bg-purple-400',
        colorClass: 'text-purple-400',
      };
    case 'PENDING':
      return {
        key: 'PENDING',
        label: 'รอตรวจสอบ',
        bg: 'bg-blue-950/20',
        border: 'border-blue-800/40',
        text: 'text-blue-300',
        badgeBg: 'bg-blue-950/60',
        badgeText: 'text-blue-400',
        badgeBorder: 'border-blue-800/60',
        dotClass: 'bg-blue-400',
        colorClass: 'text-blue-400',
      };
    case 'CONFIRMED':
    default:
      return {
        key: 'CONFIRMED',
        label: 'นัดหมายแล้ว',
        bg: 'bg-blue-950/25',
        border: 'border-blue-800/50',
        text: 'text-blue-300',
        badgeBg: 'bg-blue-950/60',
        badgeText: 'text-blue-400',
        badgeBorder: 'border-blue-800/60',
        dotClass: 'bg-blue-400',
        colorClass: 'text-blue-400',
      };
  }
}

/**
 * Get visual configuration for Session Status
 */
export function getSessionStatusConfig(status: SessionStatus): {
  label: string;
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
} {
  switch (status) {
    case 'SCHEDULED':
      return {
        label: 'นัดหมายแล้ว',
        bg: 'bg-blue-950/25',
        border: 'border-blue-800/40',
        text: 'text-blue-300',
        badgeBg: 'bg-blue-950/60',
        badgeText: 'text-blue-400',
      };
    case 'IN_PROGRESS':
      return {
        label: 'มีรอบสัก',
        bg: 'bg-purple-950/25',
        border: 'border-purple-800/40',
        text: 'text-purple-300',
        badgeBg: 'bg-purple-950/60',
        badgeText: 'text-purple-400',
      };
    case 'COMPLETED':
      return {
        label: 'งานเสร็จสิ้น',
        bg: 'bg-emerald-950/25',
        border: 'border-emerald-800/40',
        text: 'text-emerald-300',
        badgeBg: 'bg-emerald-950/60',
        badgeText: 'text-emerald-400',
      };
    case 'CANCELLED':
      return {
        label: 'ยกเลิก',
        bg: 'bg-red-950/25 opacity-60',
        border: 'border-red-800/40',
        text: 'text-red-400',
        badgeBg: 'bg-red-950/60',
        badgeText: 'text-red-400',
      };
    default:
      return {
        label: status,
        bg: 'bg-[#171512]',
        border: 'border-[#4A443A]',
        text: 'text-[#ECE4D3]',
        badgeBg: 'bg-zinc-800',
        badgeText: 'text-zinc-400',
      };
  }
}

/**
 * Get visual configuration for Booking Status
 */
export function getBookingStatusConfig(status: BookingStatus): {
  label: string;
  text: string;
  bg: string;
  border: string;
} {
  switch (status) {
    case 'WAITING_DEPOSIT':
      return {
        label: 'รอมัดจำ',
        text: 'text-purple-300',
        bg: 'bg-purple-950/60',
        border: 'border-purple-800/60',
      };
    case 'CONFIRMED':
      return {
        label: 'นัดหมายแล้ว',
        text: 'text-blue-400',
        bg: 'bg-blue-950/40',
        border: 'border-blue-800/50',
      };
    case 'IN_PROGRESS':
      return {
        label: 'มีรอบสัก',
        text: 'text-purple-400',
        bg: 'bg-purple-950/40',
        border: 'border-purple-800/50',
      };
    case 'COMPLETED':
      return {
        label: 'งานเสร็จสิ้น',
        text: 'text-emerald-400',
        bg: 'bg-emerald-950/40',
        border: 'border-emerald-800/50',
      };
    case 'CANCELLED':
      return {
        label: 'ยกเลิก',
        text: 'text-red-400',
        bg: 'bg-red-950/40',
        border: 'border-red-800/50',
      };
    case 'REJECTED':
      return {
        label: 'ปฏิเสธ',
        text: 'text-red-400',
        bg: 'bg-red-950/40',
        border: 'border-red-800/50',
      };
    case 'APPROVED':
      return {
        label: 'อนุมัติแล้ว',
        text: 'text-blue-300',
        bg: 'bg-blue-950/30',
        border: 'border-blue-800/40',
      };
    case 'PENDING':
    default:
      return {
        label: 'รอตรวจสอบ',
        text: 'text-yellow-400',
        bg: 'bg-yellow-950/40',
        border: 'border-yellow-800/50',
      };
  }
}

/**
 * Artist Color Theme System (Deterministic by artist.id)
 */
export interface ArtistColorTheme {
  bg: string;
  border: string;
  text: string;
  dotBg: string;
  dotBorder: string;
  badgeBg: string;
}

export const ARTIST_PALETTE: ArtistColorTheme[] = [
  // 1. Muted Emerald
  {
    bg: 'bg-[#122419]',
    border: 'border-emerald-800/70',
    text: 'text-emerald-300',
    dotBg: 'bg-emerald-500',
    dotBorder: 'border-emerald-400',
    badgeBg: 'bg-emerald-950',
  },
  // 2. Muted Blue
  {
    bg: 'bg-[#131f2c]',
    border: 'border-blue-800/70',
    text: 'text-blue-300',
    dotBg: 'bg-blue-500',
    dotBorder: 'border-blue-400',
    badgeBg: 'bg-blue-950',
  },
  // 3. Muted Purple
  {
    bg: 'bg-[#201529]',
    border: 'border-purple-800/70',
    text: 'text-purple-300',
    dotBg: 'bg-purple-500',
    dotBorder: 'border-purple-400',
    badgeBg: 'bg-purple-950',
  },
  // 4. Muted Amber/Bronze
  {
    bg: 'bg-[#281b11]',
    border: 'border-amber-800/70',
    text: 'text-amber-300',
    dotBg: 'bg-amber-500',
    dotBorder: 'border-amber-400',
    badgeBg: 'bg-amber-950',
  },
  // 5. Muted Teal
  {
    bg: 'bg-[#112425]',
    border: 'border-teal-800/70',
    text: 'text-teal-300',
    dotBg: 'bg-teal-500',
    dotBorder: 'border-teal-400',
    badgeBg: 'bg-teal-950',
  },
  // 6. Muted Rose/Crimson
  {
    bg: 'bg-[#28131a]',
    border: 'border-rose-800/70',
    text: 'text-rose-300',
    dotBg: 'bg-rose-500',
    dotBorder: 'border-rose-400',
    badgeBg: 'bg-rose-950',
  },
  // 7. Muted Indigo
  {
    bg: 'bg-[#17172b]',
    border: 'border-indigo-800/70',
    text: 'text-indigo-300',
    dotBg: 'bg-indigo-500',
    dotBorder: 'border-indigo-400',
    badgeBg: 'bg-indigo-950',
  },
];

export const NEUTRAL_ARTIST_THEME: ArtistColorTheme = {
  bg: 'bg-[#181715]',
  border: 'border-[#4A443A]/50',
  text: 'text-[#ECE4D3]',
  dotBg: 'bg-zinc-500',
  dotBorder: 'border-zinc-400',
  badgeBg: 'bg-zinc-900',
};

export function getArtistColorTheme(artistId?: string | null): ArtistColorTheme {
  if (!artistId) return NEUTRAL_ARTIST_THEME;

  let hash = 0;
  for (let i = 0; i < artistId.length; i++) {
    hash = (hash << 5) - hash + artistId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ARTIST_PALETTE.length;
  return ARTIST_PALETTE[index];
}

/**
  * Resolve tattoo specs (style, size, placement, reference images) from a CalendarSessionEvent
  */
export function getEventSpecs(ev: CalendarSessionEvent) {
  const rawStyle = ev.estimate?.style?.trim();
  const style = rawStyle || 'ไม่ระบุ';

  const width = ev.estimate?.width_cm;
  const height = ev.estimate?.height_cm;
  const rawSize = formatTattooSize(width, height);
  const size = rawSize && rawSize !== 'ไม่ระบุ' ? rawSize : 'ไม่ระบุขนาด';

  const rawPlacement = ev.estimate?.placement?.trim();
  const placement = rawPlacement || 'ไม่ระบุตำแหน่ง';

  const referenceImages = ev.estimate?.reference_images || [];
  const referenceImage = referenceImages[0] || null;

  const startStr = formatTimeBangkok(ev.start_at).replace(' น.', '');
  const timeText = `เวลานัด ${startStr}`;

  return { style, size, placement, referenceImages, referenceImage, timeText };
}
