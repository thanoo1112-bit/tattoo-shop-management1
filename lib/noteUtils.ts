/**
 * Utility to extract preferred time `[เวลาสะดวก: ...]` from a note/description text
 * and return the cleaned note text alongside the extracted time.
 */
export function parseNoteWithPreferredTime(noteText?: string | null): {
  cleanNote: string;
  extractedTime: string | null;
} {
  if (!noteText || !noteText.trim()) {
    return { cleanNote: '', extractedTime: null };
  }

  // Regex to match [เวลาสะดวก: <time>]
  const timeRegex = /\[เวลาสะดวก:\s*([^\]]+)\]/i;
  const match = noteText.match(timeRegex);

  if (!match) {
    return { cleanNote: noteText.trim(), extractedTime: null };
  }

  const rawTimeVal = match[1].trim();

  // Format time nicely e.g. "11:00 น."
  let formattedTime = rawTimeVal;
  if (!formattedTime.endsWith('น.') && !formattedTime.endsWith('น')) {
    formattedTime = `${formattedTime} น.`;
  }

  // Remove the [เวลาสะดวก: ...] tag from noteText
  const cleanNote = noteText.replace(timeRegex, '').trim();

  return {
    cleanNote,
    extractedTime: formattedTime,
  };
}

/**
 * Utility to extract HH:mm format (e.g. "10:00") from a date/time string or text
 */
export function extractHHMM(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  if (timeStr.includes('T')) {
    try {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        const timePart = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);
        return timePart;
      }
    } catch {
      // ignore
    }
  }
  const match = timeStr.match(/(\d{1,2}:\d{2})/);
  if (!match) return null;
  const parts = match[1].split(':');
  const h = parts[0].padStart(2, '0');
  const m = parts[1];
  return `${h}:${m}`;
}

/**
 * Priority resolution for Start Time:
 * 1. Existing Session / Booking Start Time
 * 2. Customer Preferred Time (from preferred_time / preferredTime OR fallback to note / description)
 * 3. Fallback time (e.g. '13:00' for Admin, '10:00' for Artist)
 */
export function getInitialStartTime(
  estimate?: {
    description?: string | null;
    preferred_time?: string | null;
    preferredTime?: string | null;
    linked_booking?: any;
  } | null,
  fallbackTime: string = '13:00'
): string {
  if (!estimate) return fallbackTime;
  const savedStartTime = extractHHMM(
    estimate?.linked_booking?.sessions?.[0]?.start_at ||
      estimate?.linked_booking?.requested_start_time ||
      estimate?.linked_booking?.requested_time
  );
  if (savedStartTime) return savedStartTime;

  const directPreferredTime = extractHHMM(estimate.preferred_time || estimate.preferredTime);
  if (directPreferredTime) return directPreferredTime;

  const rawDescription = estimate?.linked_booking?.description || estimate?.description || '';
  const { extractedTime } = parseNoteWithPreferredTime(rawDescription);
  const preferredStartTime = extractHHMM(extractedTime);
  return preferredStartTime || fallbackTime;
}
