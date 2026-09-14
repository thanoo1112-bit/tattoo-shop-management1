import { SessionStatus, BookingStatus } from './types';

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
 * Calculate duration string "3 ชม." or "2 ชม. 30 นาที"
 */
export function calculateDurationText(startIso: string, endIso: string): string {
  try {
    const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (diffMs <= 0) return '0 นาที';
    const totalMinutes = Math.round(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours} ชม. ${mins} นาที`;
    if (hours > 0) return `${hours} ชม.`;
    return `${mins} นาที`;
  } catch {
    return '-';
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
        bg: 'bg-[#171512]',
        border: 'border-[#4A443A]',
        text: 'text-[#ECE4D3]',
        badgeBg: 'bg-[#1A1815]',
        badgeText: 'text-[#A89F91]',
      };
    case 'IN_PROGRESS':
      return {
        label: 'กำลังสัก',
        bg: 'bg-[#9C2F2F]/20',
        border: 'border-[#9C2F2F]',
        text: 'text-[#ECE4D3]',
        badgeBg: 'bg-[#9C2F2F]',
        badgeText: 'text-white',
      };
    case 'COMPLETED':
      return {
        label: 'เสร็จสิ้น',
        bg: 'bg-emerald-950/25',
        border: 'border-emerald-800/40',
        text: 'text-emerald-300',
        badgeBg: 'bg-emerald-950/60',
        badgeText: 'text-emerald-400',
      };
    case 'CANCELLED':
      return {
        label: 'ยกเลิก',
        bg: 'bg-zinc-900/40 opacity-60',
        border: 'border-zinc-800',
        text: 'text-zinc-500',
        badgeBg: 'bg-zinc-800',
        badgeText: 'text-zinc-400',
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
        text: 'text-amber-400',
        bg: 'bg-amber-950/40',
        border: 'border-amber-800/50',
      };
    case 'CONFIRMED':
      return {
        label: 'ยืนยันคิวแล้ว',
        text: 'text-blue-400',
        bg: 'bg-blue-950/40',
        border: 'border-blue-800/50',
      };
    case 'IN_PROGRESS':
      return {
        label: 'กำลังดำเนินงาน',
        text: 'text-[#9C2F2F]',
        bg: 'bg-[#9C2F2F]/20',
        border: 'border-[#9C2F2F]/40',
      };
    case 'COMPLETED':
      return {
        label: 'เสร็จสมบูรณ์',
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
