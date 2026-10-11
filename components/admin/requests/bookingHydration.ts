import { SupabaseClient } from '@supabase/supabase-js';
import { BookingItem, resolveBookingOperationalStatus } from './types';

export async function fetchWorkQueueBookings(supabase: SupabaseClient): Promise<{
  allBookings: BookingItem[];
  workQueueBookings: BookingItem[];
  artists: Array<{ id: string; name: string; nickname: string | null }>;
  blockedDates: any[];
}> {
  const [
    bookRes,
    sesRes,
    sumRes,
    payRes,
    pendingSubRes,
    estRes,
    flashResRes,
    artRes,
    blockedRes,
    custRes,
    profRes,
  ] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
    supabase.from('booking_sessions').select('id, booking_id, artist_id, session_number, start_at, end_at, status, note, created_at, updated_at').order('session_number', { ascending: true }),
    supabase.from('booking_payment_summary').select('booking_id, estimate_request_id, customer_user_id, artist_id, quoted_price, deposit_required, paid_total, remaining_balance, deposit_paid, is_fully_paid'),
    supabase.from('booking_payments').select('id, booking_id, booking_session_id, amount, status').neq('status', 'VOIDED'),
    supabase.from('booking_payment_submissions').select('id, booking_id, status, claimed_amount, slip_path, reference_no, created_at').eq('status', 'PENDING'),
    supabase.from('estimate_requests').select('id, customer_id, customer_user_id, artist_id, placement, description, width_cm, height_cm, style, preferred_date, preferred_time, reference_images, status, request_type, work_type, color_technique, quoted_price, estimated_min_price, estimated_max_price, deposit_required, estimated_duration_minutes, quote_note, quoted_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, created_at, updated_at, is_date_proposed, proposed_artist_note, estimated_size_tier, price_estimated_at').order('created_at', { ascending: false }),
    supabase.from('flash_reservations').select('*, flash_designs(*, artists(id, name, nickname))').order('created_at', { ascending: false }),
    supabase.from('artists').select('id, name, nickname').order('name'),
    supabase.from('artist_blocked_dates').select('id, scope, artist_id, blocked_date, reason'),
    supabase.from('customers').select('id, user_id, display_name, phone, email, date_of_birth, eligibility_confirmed_at, profile_completed_at, has_medical_condition, medical_condition_note, medical_conditions, has_allergy, allergy_note, allergies'),
    supabase.from('profiles').select('user_id, display_name, phone, email, date_of_birth'),
  ]);

  if (bookRes.error) console.error('[bookingHydration] bookings query error:', bookRes.error.message);
  if (estRes.error) {
    console.error('[bookingHydration] estimate_requests query error:', estRes.error.message);
    throw new Error(`ไม่สามารถโหลดข้อมูลคำขอราคาได้: ${estRes.error.message}`);
  }
  if (flashResRes.error) console.error('[bookingHydration] flash_reservations query error:', flashResRes.error.message);

  const bookData = bookRes.data || [];
  const sesData = sesRes.data || [];
  const sumData = sumRes.data || [];
  const payData = payRes.data || [];
  const pendingSubmissions = pendingSubRes.data || [];
  const estData = estRes.data || [];
  const flashResData = flashResRes.data || [];
  const artData = artRes.data || [];
  const blockedData = blockedRes.data || [];
  const custData = custRes.data || [];
  const profData = profRes.data || [];

  const getCleanCustomerName = (c: any, p: any) => {
    const candidate = (c?.display_name && c.display_name !== 'ลูกค้าประจำ') 
      ? c.display_name 
      : (p?.display_name && p.display_name !== 'ลูกค้าประจำ') 
      ? p.display_name 
      : null;
    if (candidate) return candidate;
    const emailPrefix = c?.email ? c.email.split('@')[0] : p?.email ? p.email.split('@')[0] : null;
    if (emailPrefix && emailPrefix !== 'ลูกค้าประจำ') return emailPrefix;
    return 'ไม่ระบุชื่อ';
  };

  const allBookings: BookingItem[] = bookData.map((b: any) => {
    const artist = artData.find((a) => a.id === b.artist_id);
    const customer = custData.find((c) => (b.customer_id && c.id === b.customer_id) || (b.customer_user_id && c.user_id === b.customer_user_id));
    const profile = profData.find((p) => p.user_id === b.customer_user_id);
    const summary = sumData.find((f) => f.booking_id === b.id);
    const bookingSessions = sesData
      .filter((s) => s.booking_id === b.id)
      .map((s: any) => {
        const sessionPaidAmount = payData
          .filter((p: any) => p.booking_session_id === s.id && p.status !== 'VOIDED')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
        return {
          ...s,
          session_paid_amount: sessionPaidAmount,
        };
      });
    const est = estData.find((e: any) => e.id === b.estimate_request_id);
    const flashRes = flashResData.find((fr: any) => fr.id === b.flash_reservation_id);
    const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
    const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
    const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;
    const flashStyle = flashDesignObj?.style || flashRes?.flash_design_style;

    const pendingSub = pendingSubmissions.find((sub: any) => sub.booking_id === b.id);
    const hasPendingSlip = Boolean(pendingSub);

    const bookingPaidTotal = payData
      .filter((p: any) => p.booking_id === b.id && p.status !== 'VOIDED')
      .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

    const totalPaid = Math.max(
      Number(summary?.paid_total ?? 0),
      bookingPaidTotal
    );

    const isFlashBooking = Boolean(b.flash_reservation_id || (b as any).request_type === 'FLASH' || b.booking_source === 'FLASH');
    const rawQuotedPrice = isFlashBooking 
      ? (b as any)?.quoted_price 
      : ((b as any)?.quoted_price ?? est?.quoted_price ?? summary?.quoted_price);
    const quotedPriceVal = rawQuotedPrice != null ? Number(rawQuotedPrice) : 0;
    const depositReqVal = Number(summary?.deposit_required ?? est?.deposit_required ?? flashDesignObj?.deposit_amount ?? (b as any)?.deposit_required ?? 0);

    const isDepPaid = Boolean(
      summary?.deposit_paid ?? 
      (totalPaid > 0 && (depositReqVal === 0 || totalPaid >= depositReqVal))
    );

    const rawArtworkTitle = (b.artwork_title && b.artwork_title !== 'ลาย Flash' && b.artwork_title !== 'งานสัก')
      ? b.artwork_title
      : (flashTitle ? `ลาย Flash: ${flashTitle}` : (b.flash_reservation_id ? 'ลาย Flash' : undefined));

    let hasMedVal: boolean | null | undefined = undefined;
    let hasAllVal: boolean | null | undefined = undefined;

    if (customer) {
      if (customer.has_medical_condition !== undefined && customer.has_medical_condition !== null) {
        hasMedVal = Boolean(customer.has_medical_condition);
      } else if (customer.medical_conditions?.trim()) {
        hasMedVal = true;
      } else if (customer.medical_conditions === 'ไม่มี' || customer.medical_conditions === 'false') {
        hasMedVal = false;
      }

      if (customer.has_allergy !== undefined && customer.has_allergy !== null) {
        hasAllVal = Boolean(customer.has_allergy);
      } else if (customer.allergies?.trim()) {
        hasAllVal = true;
      } else if (customer.allergies === 'ไม่มี' || customer.allergies === 'false') {
        hasAllVal = false;
      }
    }

    if (hasMedVal === undefined && est?.has_medical_condition !== undefined && est?.has_medical_condition !== null) {
      hasMedVal = Boolean(est.has_medical_condition);
    }
    if (hasAllVal === undefined && est?.has_allergy !== undefined && est?.has_allergy !== null) {
      hasAllVal = Boolean(est.has_allergy);
    }

    if (hasMedVal === undefined && flashRes?.has_medical_condition !== undefined && flashRes?.has_medical_condition !== null) {
      hasMedVal = Boolean(flashRes.has_medical_condition);
    }
    if (hasAllVal === undefined && flashRes?.has_allergy !== undefined && flashRes?.has_allergy !== null) {
      hasAllVal = Boolean(flashRes.has_allergy);
    }

    const bItem: BookingItem = {
      id: b.id,
      customer_user_id: b.customer_user_id,
      artist_id: b.artist_id,
      estimate_request_id: b.estimate_request_id,
      flash_reservation_id: b.flash_reservation_id || null,
      requested_date: b.requested_date,
      requested_time: b.requested_start_time || b.requested_time || null,
      requested_start_time: b.requested_start_time || b.requested_time || null,
      status: b.status,
      customer_note: b.customer_note || flashRes?.customer_note,
      admin_note: b.admin_note || flashRes?.admin_note,
      placement: (b.placement && typeof b.placement === 'string' && b.placement.trim() !== '' && b.placement !== 'ไม่ระบุ' && b.placement !== 'ไม่ระบุตำแหน่ง' && b.placement !== 'CUSTOM')
        ? b.placement.trim()
        : (flashRes?.placement || est?.placement || null),
      width_cm: b.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? est?.width_cm ?? null,
      height_cm: b.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? est?.height_cm ?? null,
      estimated_size_tier: b.estimated_size_tier || est?.estimated_size_tier || null,
      size_label: flashDesignObj?.size_label || flashRes?.flash_design_size_label || b.size_label || est?.estimated_size_tier || null,
      style_preference: flashStyle || (b.style_preference && b.style_preference !== 'ไม่ระบุ' ? b.style_preference : (est?.style || b.style_preference || null)),
      work_type: b.work_type || est?.work_type || (b.flash_reservation_id ? 'FLASH' : null),
      artwork_title: rawArtworkTitle,
      artwork_image_url: flashImgUrl || b.artwork_image_url || undefined,
      description: b.description || flashRes?.customer_note || est?.description || b.customer_note || null,
      reference_images: flashImgUrl ? [flashImgUrl] : ((Array.isArray(b.reference_images) && b.reference_images.length > 0) ? b.reference_images : (est?.reference_images || null)),
      created_at: b.created_at,
      updated_at: b.updated_at,
      customer_name: getCleanCustomerName(customer, profile),
      customer_phone: customer?.phone || profile?.phone || undefined,
      customer_email: customer?.email || profile?.email || undefined,
      date_of_birth: customer?.date_of_birth || profile?.date_of_birth || (b as any).date_of_birth || null,
      customer_dob: customer?.date_of_birth || profile?.date_of_birth || (b as any).customer_dob || null,
      is_age_confirmed: customer ? (customer.eligibility_confirmed_at || customer.profile_completed_at ? true : undefined) : undefined,
      artist_name: artist?.name || 'ยังไม่มอบหมายช่าง',
      artist_nickname: artist?.nickname || null,
      has_medical_condition: hasMedVal,
      has_allergy: hasAllVal,
      estimated_min_price: est?.estimated_min_price ? Number(est.estimated_min_price) : null,
      estimated_max_price: est?.estimated_max_price ? Number(est.estimated_max_price) : null,
      price_estimated_at: est?.price_estimated_at || null,
      financial: {
        quoted_price: quotedPriceVal,
        deposit_required: depositReqVal,
        total_paid: totalPaid,
        remaining_balance: Math.max(0, quotedPriceVal - totalPaid),
        is_deposit_paid: isDepPaid,
        is_fully_paid: Boolean(summary?.is_fully_paid ?? (quotedPriceVal > 0 && totalPaid >= quotedPriceVal)),
      },
      sessions: bookingSessions,
      has_pending_payment_submission: hasPendingSlip,
      pending_submission: pendingSub
        ? {
            id: pendingSub.id,
            booking_id: pendingSub.booking_id,
            status: pendingSub.status,
            claimed_amount: Number(pendingSub.claimed_amount || 0),
            slip_path: pendingSub.slip_path || null,
            proof_image_url: (pendingSub as any).proof_image_url || null,
            reference_no: pendingSub.reference_no || null,
            created_at: pendingSub.created_at,
          }
        : null,
    };
    bItem.operational_status = resolveBookingOperationalStatus(bItem, hasPendingSlip);
    return bItem;
  });

  const workQueueBookings = allBookings.filter((b) => {
    if (b.status === 'WAITING_DEPOSIT' || b.status === 'PENDING' || b.status === 'APPROVED') {
      return false;
    }

    const hasPendingSlip = Boolean(
      b.has_pending_payment_submission ||
      b.pending_submission?.status === 'PENDING' ||
      b.operational_status?.key === 'WAITING_SLIP_VERIFICATION'
    );
    if (hasPendingSlip) return false;

    return ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(b.status);
  });

  return {
    allBookings,
    workQueueBookings,
    artists: artData,
    blockedDates: blockedData,
  };
}

/**
 * Helper to extract Bangkok Date (YYYY-MM-DD) and Time (HH:mm) from an ISO string or raw time.
 */
function parseBangkokDateTime(isoOrTime: string | null | undefined): { dateStr: string | null; timeStr: string | null } {
  if (!isoOrTime) return { dateStr: null, timeStr: null };
  try {
    if (isoOrTime.includes('T') || isoOrTime.includes('Z')) {
      const d = new Date(isoOrTime);
      if (!isNaN(d.getTime())) {
        const dateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);

        const timeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);

        return { dateStr, timeStr };
      }
    }
    const parts = isoOrTime.split('T');
    const dateStr = parts.length > 1 ? parts[0] : null;
    const rawTime = parts.length > 1 ? parts[1] : parts[0];
    const timeClean = rawTime ? (rawTime.length >= 5 ? rawTime.slice(0, 5) : rawTime) : null;
    return { dateStr, timeStr: timeClean };
  } catch {
    return { dateStr: null, timeStr: null };
  }
}

/**
 * Resolves active/upcoming session date & time for Admin Queue display (in Bangkok Timezone).
 * Priority:
 * 1. Earliest SCHEDULED active session (if any exist)
 * 2. Active IN_PROGRESS session (if any exist)
 * 3. Latest non-cancelled session or latest session (if all completed/cancelled)
 * 4. Fallback to top-level booking requested_date & requested_start_time
 */
export function getActiveQueueSessionDateTime(b: {
  requested_date?: string | null;
  requested_start_time?: string | null;
  requested_time?: string | null;
  sessions?: Array<{
    id?: string;
    session_number?: number;
    start_at?: string | null;
    status?: string;
  }> | null;
}): {
  displayDate: string | null;
  displayTime: string | null;
} {
  const sessions = b.sessions || [];

  if (sessions.length > 0) {
    // 1. SCHEDULED active session (earliest by start_at or session_number)
    const scheduledSessions = sessions.filter((s) => s.status === 'SCHEDULED' && s.start_at);
    if (scheduledSessions.length > 0) {
      const sorted = [...scheduledSessions].sort((a, b) =>
        new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime()
      );
      const target = sorted[0];
      if (target.start_at) {
        const parsed = parseBangkokDateTime(target.start_at);
        return {
          displayDate: parsed.dateStr || b.requested_date || null,
          displayTime: parsed.timeStr || b.requested_start_time || b.requested_time || null,
        };
      }
    }

    // 2. IN_PROGRESS session
    const inProgressSession = sessions.find((s) => s.status === 'IN_PROGRESS' && s.start_at);
    if (inProgressSession && inProgressSession.start_at) {
      const parsed = parseBangkokDateTime(inProgressSession.start_at);
      return {
        displayDate: parsed.dateStr || b.requested_date || null,
        displayTime: parsed.timeStr || b.requested_start_time || b.requested_time || null,
      };
    }

    // 3. Fallback: Latest non-cancelled session
    const nonCancelled = sessions.filter((s) => s.status !== 'CANCELLED' && s.start_at);
    if (nonCancelled.length > 0) {
      const sortedDesc = [...nonCancelled].sort((a, b) =>
        new Date(b.start_at!).getTime() - new Date(a.start_at!).getTime()
      );
      const latest = sortedDesc[0];
      if (latest.start_at) {
        const parsed = parseBangkokDateTime(latest.start_at);
        return {
          displayDate: parsed.dateStr || b.requested_date || null,
          displayTime: parsed.timeStr || b.requested_start_time || b.requested_time || null,
        };
      }
    }
  }

  // Fallback to booking fields
  const reqTime = b.requested_start_time || b.requested_time || null;
  const timeClean = reqTime ? (reqTime.length >= 5 ? reqTime.slice(0, 5) : reqTime) : null;
  return {
    displayDate: b.requested_date || null,
    displayTime: timeClean,
  };
}
