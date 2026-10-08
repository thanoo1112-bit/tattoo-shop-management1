/**
 * Central tattoo size formatting utility for 157 TATTOO (Customer + Admin + Artist).
 *
 * Unified Display Targets:
 * - Size S · 5 × 5 ซม.
 * - Size M · 5 × 10 ซม.
 * - Size L · 10 × 15 ซม.
 * - Size XL · 15 × 25 ซม.
 * - Size XXL · ใหญ่กว่า A4
 *
 * Rules:
 * - Never display "21 × 30 ซม." for XXL.
 * - Map legacy/stored values (21x30, 21 × 30, XXL, etc.) to "Size XXL · ใหญ่กว่า A4".
 */
export function resolveSizeTierLabel(tierHint?: string | null): string | null {
  if (!tierHint || typeof tierHint !== 'string' || !tierHint.trim()) return null;
  const str = tierHint.trim().toUpperCase();

  if (str === 'XXL' || str === 'FULL_PROJECT' || str.includes('XXL') || str.includes('A4')) {
    return 'Size XXL';
  }
  if (str === 'XL' || str.includes('XL')) {
    return 'Size XL';
  }
  if (str === 'L' || str === 'LARGE' || str.includes('SIZE L') || str.includes('ไซซ์ L')) {
    return 'Size L';
  }
  if (str === 'M' || str === 'SMALL_MED' || str.includes('SIZE M') || str.includes('ไซซ์ M')) {
    return 'Size M';
  }
  if (str === 'S' || str === 'MICRO' || str.includes('SIZE S') || str.includes('ไซซ์ S')) {
    return 'Size S';
  }
  if (str.startsWith('SIZE ') || str.startsWith('ไซซ์ ')) {
    return str.replace(/^ไซซ์\s+/i, 'Size ');
  }
  return null;
}

export function formatTattooSize(
  width?: number | string | null,
  height?: number | string | null,
  rawSizeText?: string | null
): string {
  const w = typeof width === 'number' ? width : parseFloat(String(width ?? ''));
  const h = typeof height === 'number' ? height : parseFloat(String(height ?? ''));
  const hasNumericDim = !isNaN(w) && !isNaN(h) && w > 0 && h > 0;

  // 1. Resolve explicit size package tier if provided via estimated_size_tier / size_label / rawSizeText
  let tierLabel = resolveSizeTierLabel(rawSizeText);

  // 2. If no explicit tier string text was passed, match customer form package size presets (5x5, 5x10, 10x15, 15x25, 21x30)
  if (!tierLabel && hasNumericDim) {
    const minDim = Math.min(w, h);
    const maxDim = Math.max(w, h);

    if ((minDim >= 20 && maxDim >= 28) || (minDim === 21 && maxDim === 30)) {
      tierLabel = 'Size XXL';
    } else if (minDim === 15 && maxDim === 25) {
      tierLabel = 'Size XL';
    } else if (minDim === 10 && maxDim === 15) {
      tierLabel = 'Size L';
    } else if (minDim === 5 && maxDim === 10) {
      tierLabel = 'Size M';
    } else if (minDim === 5 && maxDim === 5) {
      tierLabel = 'Size S';
    }
  }

  // 3. Render with tierLabel if matched from customer selection
  if (tierLabel) {
    if (
      tierLabel === 'Size XXL' ||
      (hasNumericDim &&
        ((Math.min(w, h) >= 20 && Math.max(w, h) >= 28) || (Math.min(w, h) === 21 && Math.max(w, h) === 30)))
    ) {
      return `${tierLabel} • ใหญ่กว่า A4`;
    }
    if (hasNumericDim) {
      return `${tierLabel} • ${w} × ${h} ซม.`;
    }
    return tierLabel;
  }

  // 4. If no size package match (custom non-preset dimensions), return cm dimensions as-is
  if (hasNumericDim) {
    return `${w} × ${h} ซม.`;
  }

  if (rawSizeText && rawSizeText.trim() && rawSizeText !== 'ไม่ระบุ') {
    const clean = rawSizeText.trim();
    if (clean.toLowerCase().includes('xxl') || clean.toLowerCase().includes('a4')) {
      return 'Size XXL • ใหญ่กว่า A4';
    }
    return clean;
  }

  return 'ไม่ระบุขนาด';
}

import { getTattooDurationInfo } from './tattooDuration';
export * from './tattooDuration';

/**
 * Resolves estimated tattoo duration text from size/dimensions for Customer Portal.
 * Size S -> "30–60 นาที"
 * Size M -> "1–2 ชั่วโมง"
 * Size L -> "2–4 ชั่วโมง"
 * Size XL -> "4–6 ชั่วโมง"
 * Size XXL -> "6 ชั่วโมงขึ้นไป / อาจต้องแบ่งหลายรอบ"
 * Missing/Unknown -> null (caller should hide duration line)
 */
export function getEstimatedTattooDuration(
  width?: number | string | null,
  height?: number | string | null,
  rawSizeText?: string | null,
  sizeTierHint?: string | null
): string | null {
  const info = getTattooDurationInfo(sizeTierHint, width, height, rawSizeText);
  return info.displayDuration;
}

