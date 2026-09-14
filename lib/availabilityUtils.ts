export interface BlockedDateRecord {
  id?: string;
  scope?: 'STUDIO' | 'ARTIST';
  artist_id?: string | null;
  blocked_date: string; // YYYY-MM-DD
  reason?: string | null;
}

export interface AvailabilityCheckResult {
  isBlocked: boolean;
  blockedScope: 'STUDIO' | 'ARTIST' | null;
  reason?: string | null;
  errorMessage: string | null;
}

/**
 * Formats an artist's display title, ensuring the "ช่าง" prefix is not duplicated if already present.
 */
export function formatArtistTitle(name?: string | null, fallback: string = 'ช่างที่เลือก'): string {
  if (!name || !name.trim()) return fallback;
  const trimmed = name.trim();
  return trimmed.startsWith('ช่าง') ? trimmed : `ช่าง${trimmed}`;
}

/**
 * Validates if a specific YYYY-MM-DD date is blocked for Studio or a specific Artist.
 */
export function checkDateAvailability(
  targetDateStr: string, // YYYY-MM-DD
  artistId: string | null | undefined,
  blockedDates: BlockedDateRecord[],
  artistName?: string
): AvailabilityCheckResult {
  if (!targetDateStr) {
    return { isBlocked: false, blockedScope: null, errorMessage: null };
  }

  // 1. Check Studio Block (Scope = STUDIO or artist_id is null)
  const studioBlock = blockedDates.find(
    (b) => b.blocked_date === targetDateStr && (b.scope === 'STUDIO' || (!b.scope && !b.artist_id))
  );

  if (studioBlock) {
    return {
      isBlocked: true,
      blockedScope: 'STUDIO',
      reason: studioBlock.reason || null,
      errorMessage: 'ไม่สามารถเลือกวันที่นี้ได้ ร้านปิดรับคิวในวันที่เลือก กรุณาเลือกวันอื่น',
    };
  }

  // 2. Check Artist Block (Scope = ARTIST or artist_id matches)
  if (artistId) {
    const artistBlock = blockedDates.find(
      (b) =>
        b.blocked_date === targetDateStr &&
        (b.scope === 'ARTIST' || Boolean(b.artist_id)) &&
        b.artist_id === artistId
    );

    if (artistBlock) {
      const displayArtist = formatArtistTitle(artistName, 'ช่างที่เลือก');
      return {
        isBlocked: true,
        blockedScope: 'ARTIST',
        reason: artistBlock.reason || null,
        errorMessage: `ไม่สามารถเลือกวันที่นี้ได้ ${displayArtist} ปิดรับคิวในวันที่เลือก กรุณาเลือกวันอื่น`,
      };
    }
  }

  return { isBlocked: false, blockedScope: null, errorMessage: null };
}

/**
 * Checks if an existing session or booking date falls on a blocked date (for warnings).
 */
export function checkExistingDateWarning(
  targetDateStr: string, // YYYY-MM-DD
  artistId: string | null | undefined,
  blockedDates: BlockedDateRecord[],
  artistName?: string
): { hasWarning: boolean; warningScope: 'STUDIO' | 'ARTIST' | null; warningMessage: string | null } {
  if (!targetDateStr) {
    return { hasWarning: false, warningScope: null, warningMessage: null };
  }

  const studioBlock = blockedDates.find(
    (b) => b.blocked_date === targetDateStr && (b.scope === 'STUDIO' || (!b.scope && !b.artist_id))
  );

  if (studioBlock) {
    return {
      hasWarning: true,
      warningScope: 'STUDIO',
      warningMessage: 'คำเตือน: คิวนี้อยู่ในวันที่ร้านปิดรับคิว (Studio Block)',
    };
  }

  if (artistId) {
    const artistBlock = blockedDates.find(
      (b) =>
        b.blocked_date === targetDateStr &&
        (b.scope === 'ARTIST' || Boolean(b.artist_id)) &&
        b.artist_id === artistId
    );

    if (artistBlock) {
      const displayArtist = formatArtistTitle(artistName, 'ช่างสัก');
      return {
        hasWarning: true,
        warningScope: 'ARTIST',
        warningMessage: `คำเตือน: ${displayArtist} ถูกปิดรับคิวในวันนี้ แต่มีคิวนัดเดิมอยู่`,
      };
    }
  }

  return { hasWarning: false, warningScope: null, warningMessage: null };
}
