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

export interface SessionCapacityValidationResult {
  valid: boolean;
  errorMessage?: string;
  isCapacityFull: boolean;
  distinctJobsCount: number;
  isCurrentBookingOnDate: boolean;
  hasTimeOverlap: boolean;
  overlappingSession?: {
    start_at: string;
    end_at: string;
  };
}

/**
 * Validates daily capacity (Max 3 distinct jobs/day) and strict time overlap
 * for an artist when creating or scheduling a session.
 *
 * Rules:
 * - 1 Artist can take max 3 DISTINCT jobs/day.
 * - 1 Booking = 1 Job (Multiple sessions of same booking on same day = 1 job).
 * - Same booking deduplication: If current booking is already on target date,
 *   adding another session does not increment distinct job count.
 * - Cross-date: If current booking has no sessions on target date, adding it
 *   increments distinct job count by 1 (blocked if other distinct jobs >= 3).
 * - Strict time overlap: New session time [startTime, endTime] must NOT overlap
 *   with any active session of this artist on target date.
 */
export async function validateArtistSessionCapacity(
  supabase: any,
  artistId: string,
  targetBookingId: string,
  sessionDate: string, // YYYY-MM-DD
  startTime: string,   // HH:MM
  endTime: string      // HH:MM
): Promise<SessionCapacityValidationResult> {
  const dayStartIso = `${sessionDate}T00:00:00+07:00`;
  const dayEndIso = `${sessionDate}T23:59:59+07:00`;
  const cleanStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;
  const cleanEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;
  const newStartIso = `${sessionDate}T${cleanStartTime}+07:00`;
  const newEndIso = `${sessionDate}T${cleanEndTime}+07:00`;
  const newStartMs = new Date(newStartIso).getTime();
  const newEndMs = new Date(newEndIso).getTime();

  // 1. Fetch active bookings for this artist on sessionDate
  const { data: dateBookings } = await supabase
    .from('bookings')
    .select('id, status, requested_date')
    .eq('artist_id', artistId)
    .eq('requested_date', sessionDate)
    .in('status', ['WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS']);

  // 2. Fetch active sessions for this artist on sessionDate
  const { data: dateSessions } = await supabase
    .from('booking_sessions')
    .select('id, booking_id, status, start_at, end_at')
    .eq('artist_id', artistId)
    .gte('start_at', dayStartIso)
    .lte('start_at', dayEndIso)
    .in('status', ['SCHEDULED', 'IN_PROGRESS']);

  const activeBookings: any[] = dateBookings || [];
  const activeSessions: any[] = dateSessions || [];

  // 3. Strict Time Overlap Check (no_artist_double_booking)
  let overlappingSession: { start_at: string; end_at: string } | undefined;
  if (!isNaN(newStartMs) && !isNaN(newEndMs) && newEndMs > newStartMs) {
    for (const ses of activeSessions) {
      if (!ses.start_at || !ses.end_at) continue;
      const existStartMs = new Date(ses.start_at).getTime();
      const existEndMs = new Date(ses.end_at).getTime();

      if (newStartMs < existEndMs && newEndMs > existStartMs) {
        overlappingSession = { start_at: ses.start_at, end_at: ses.end_at };
        break;
      }
    }
  }

  // 4. Calculate Distinct Jobs on this date
  const distinctBookingIds = new Set<string>();

  activeBookings.forEach((b: any) => {
    if (b.id) distinctBookingIds.add(b.id);
  });

  activeSessions.forEach((s: any) => {
    if (s.booking_id) distinctBookingIds.add(s.booking_id);
  });

  const isCurrentBookingOnDate = distinctBookingIds.has(targetBookingId);

  // Other distinct bookings (excluding targetBookingId)
  const otherDistinctBookings = new Set(
    Array.from(distinctBookingIds).filter((id) => id !== targetBookingId)
  );
  const otherJobsCount = otherDistinctBookings.size;

  // Capacity Rule:
  // If current booking is NOT already on date, adding it would make total = otherJobsCount + 1
  // Max distinct jobs allowed is 3. If otherJobsCount >= 3, capacity is full!
  const isCapacityFull = !isCurrentBookingOnDate && otherJobsCount >= 3;
  const distinctJobsCount = isCurrentBookingOnDate ? distinctBookingIds.size : otherJobsCount + 1;

  if (isCapacityFull) {
    return {
      valid: false,
      errorMessage: 'ช่างรับงานครบ 3 งานในวันที่เลือกแล้ว (เต็มโควตารายวัน) กรุณาเลือกวันอื่น',
      isCapacityFull: true,
      distinctJobsCount,
      isCurrentBookingOnDate,
      hasTimeOverlap: Boolean(overlappingSession),
      overlappingSession,
    };
  }

  if (overlappingSession) {
    const startStr = new Date(overlappingSession.start_at).toLocaleTimeString('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return {
      valid: false,
      errorMessage: `เวลา ${startStr} น. ช่างมีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น`,
      isCapacityFull: false,
      distinctJobsCount,
      isCurrentBookingOnDate,
      hasTimeOverlap: true,
      overlappingSession,
    };
  }

  return {
    valid: true,
    isCapacityFull: false,
    distinctJobsCount,
    isCurrentBookingOnDate,
    hasTimeOverlap: false,
  };
}
