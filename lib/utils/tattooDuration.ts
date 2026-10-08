/**
 * 157 TATTOO — Central Tattoo Duration & Queue Blocking Utility
 * Operating Hours: 10:00 — 23:00
 */

export const STUDIO_OPERATING_HOURS = {
  OPEN_TIME: '10:00',
  CLOSE_TIME: '23:00',
  OPEN_HOUR: 10,
  CLOSE_HOUR: 23,
  OPEN_MINUTES: 10 * 60, // 600
  CLOSE_MINUTES: 23 * 60, // 1380
} as const;

export type TattooSizeTier = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface TattooDurationInfo {
  tier: TattooSizeTier | null;
  displayDuration: string | null;
  blockingHours: number;
  blockingMinutes: number;
  isXXL: boolean;
}

/**
 * Derives canonical TattooSizeTier ('S' | 'M' | 'L' | 'XL' | 'XXL' | null).
 * Hierarchy:
 * 1. estimated_size_tier
 * 2. width_cm & height_cm
 * 3. rawSizeText
 */
export function getTattooSizeCategory(
  sizeTierHint?: string | null,
  width?: number | string | null,
  height?: number | string | null,
  rawSizeText?: string | null
): TattooSizeTier | null {
  // 1. Check sizeTierHint (estimated_size_tier)
  if (sizeTierHint && typeof sizeTierHint === 'string' && sizeTierHint.trim()) {
    const tierStr = sizeTierHint.trim().toUpperCase();
    if (tierStr === 'XXL' || tierStr === 'FULL_PROJECT' || tierStr.includes('XXL') || tierStr.includes('A4')) {
      return 'XXL';
    }
    if (tierStr === 'XL' || tierStr.includes('XL')) {
      return 'XL';
    }
    if (
      tierStr === 'LARGE' ||
      tierStr === 'L' ||
      tierStr.includes('SIZE L') ||
      tierStr.includes('10 × 15') ||
      tierStr.includes('10X15')
    ) {
      return 'L';
    }
    if (
      tierStr === 'SMALL_MED' ||
      tierStr === 'M' ||
      tierStr.includes('SIZE M') ||
      tierStr.includes('5 × 10') ||
      tierStr.includes('5X10')
    ) {
      return 'M';
    }
    if (
      tierStr === 'MICRO' ||
      tierStr === 'S' ||
      tierStr.includes('SIZE S') ||
      tierStr.includes('5 × 5') ||
      tierStr.includes('5X5')
    ) {
      return 'S';
    }
  }

  // Combine text hints for legacy/string detection
  const textHint = `${width ?? ''} ${height ?? ''} ${rawSizeText ?? ''}`.trim().toUpperCase();
  if (
    textHint.includes('XXL') ||
    textHint.includes('A4') ||
    (textHint.includes('21') && textHint.includes('30'))
  ) {
    return 'XXL';
  }

  // 2. Parse numeric dimensions
  const w = typeof width === 'number' ? width : parseFloat(String(width ?? ''));
  const h = typeof height === 'number' ? height : parseFloat(String(height ?? ''));

  if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
    const maxDim = Math.max(w, h);
    const minDim = Math.min(w, h);

    if ((minDim >= 20 && maxDim >= 28) || (minDim === 21 && maxDim === 30) || maxDim > 25 || minDim > 15) {
      return 'XXL';
    }
    if ((minDim === 15 && maxDim === 25) || maxDim > 15 || minDim > 10) {
      return 'XL';
    }
    if ((minDim === 10 && maxDim === 15) || maxDim > 10 || minDim > 5) {
      return 'L';
    }
    if ((minDim === 5 && maxDim === 10) || maxDim > 5) {
      return 'M';
    }
    return 'S';
  }

  // 3. rawSizeText fallback
  if (rawSizeText && typeof rawSizeText === 'string' && rawSizeText.trim()) {
    const lStr = rawSizeText.trim().toLowerCase();
    if (lStr.includes('xxl') || lStr.includes('a4') || (lStr.includes('21') && lStr.includes('30'))) return 'XXL';
    if (lStr.includes('xl')) return 'XL';
    if (lStr.includes('size l') || (lStr.includes('10') && lStr.includes('15'))) return 'L';
    if (lStr.includes('size m') || (lStr.includes('5') && lStr.includes('10'))) return 'M';
    if (lStr.includes('size s') || lStr.includes('5x5') || lStr.includes('5 x 5') || lStr.includes('5 × 5')) return 'S';
  }

  return null;
}

/**
 * Returns full duration info including display text for customer and actual queue blocking duration in hours/minutes.
 */
export function getTattooDurationInfo(
  sizeTierHint?: string | null,
  width?: number | string | null,
  height?: number | string | null,
  rawSizeText?: string | null
): TattooDurationInfo {
  const category = getTattooSizeCategory(sizeTierHint, width, height, rawSizeText);

  switch (category) {
    case 'S':
      return {
        tier: 'S',
        displayDuration: '30–60 นาที',
        blockingHours: 1,
        blockingMinutes: 60,
        isXXL: false,
      };
    case 'M':
      return {
        tier: 'M',
        displayDuration: '1–2 ชั่วโมง',
        blockingHours: 2,
        blockingMinutes: 120,
        isXXL: false,
      };
    case 'L':
      return {
        tier: 'L',
        displayDuration: '2–4 ชั่วโมง',
        blockingHours: 4,
        blockingMinutes: 240,
        isXXL: false,
      };
    case 'XL':
      return {
        tier: 'XL',
        displayDuration: '4–6 ชั่วโมง',
        blockingHours: 6,
        blockingMinutes: 360,
        isXXL: false,
      };
    case 'XXL':
      return {
        tier: 'XXL',
        displayDuration: '6 ชั่วโมงขึ้นไป / อาจต้องแบ่งหลายรอบ',
        blockingHours: 13,
        blockingMinutes: 780,
        isXXL: true,
      };
    default:
      return {
        tier: null,
        displayDuration: null,
        blockingHours: 2,
        blockingMinutes: 120,
        isXXL: false,
      };
  }
}

/**
 * Calculates session end time string "HH:mm" given start time ("HH:mm") and size info.
 * Precision: Exact HH:mm minutes.
 * - Size S (1h): 10:00 -> 11:00, 21:50 -> 22:50
 * - Size M (2h): 10:00 -> 12:00
 * - Size L (4h): 10:00 -> 14:00
 * - Size XL (6h): 10:00 -> 16:00, 17:00 -> 23:00
 * - Size XXL: Always 23:00
 */
export function calculateBlockingEndTime(
  startTimeStr: string,
  sizeTierHint?: string | null,
  width?: number | string | null,
  height?: number | string | null,
  rawSizeText?: string | null
): string {
  if (!startTimeStr) return STUDIO_OPERATING_HOURS.CLOSE_TIME;

  const info = getTattooDurationInfo(sizeTierHint, width, height, rawSizeText);

  const [hStr, mStr] = startTimeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);

  if (isNaN(h)) return STUDIO_OPERATING_HOURS.CLOSE_TIME;

  const startMins = h * 60 + (isNaN(m) ? 0 : m);
  const endMins = Math.min(STUDIO_OPERATING_HOURS.CLOSE_MINUTES, startMins + info.blockingMinutes);

  const endH = Math.floor(endMins / 60);
  const endM = endMins % 60;

  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

/**
 * Validates if start time string "HH:mm" is allowed.
 * Rules:
 * - Start time must be within studio operating hours (10:00 to 23:00).
 * - No size-based time restrictions per current shop policy.
 */
export function isStartTimeAllowedForSize(
  startTimeStr: string,
  sizeTierHint?: string | null,
  width?: number | string | null,
  height?: number | string | null,
  rawSizeText?: string | null
): boolean {
  if (!startTimeStr) return false;
  const [hStr, mStr] = startTimeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);

  if (isNaN(h) || isNaN(m)) return false;

  const startMins = h * 60 + m;

  return startMins >= STUDIO_OPERATING_HOURS.OPEN_MINUTES && startMins < STUDIO_OPERATING_HOURS.CLOSE_MINUTES;
}
