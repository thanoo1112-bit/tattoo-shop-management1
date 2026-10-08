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
    supabase.from('booking_payment_summary').select('booking_id, quoted_price, deposit_required, deposit_paid, final_paid, total_paid, paid_total, balance_due, payment_status, is_fully_paid, is_deposit_paid'),
    supabase.from('booking_payments').select('id, booking_id, booking_session_id, amount, status').neq('status', 'VOIDED'),
    supabase.from('booking_payment_submissions').select('id, booking_id, status, claimed_amount, slip_path, reference_no, created_at').eq('status', 'PENDING'),
    supabase.from('estimate_requests').select('id, customer_id, customer_user_id, artist_id, placement, description, width_cm, height_cm, style_preference, style, preferred_date, preferred_time, reference_images, artwork_title, status, request_type, work_type, color_technique, quoted_price, estimated_min_price, estimated_max_price, deposit_required, estimated_duration_minutes, quote_note, quoted_at, admin_reviewed_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, eligibility_confirmed_at, created_at, updated_at, is_date_proposed, proposed_artist_note, estimated_size_tier, customer_dob, price_estimated_at').order('created_at', { ascending: false }),
    supabase.from('flash_reservations').select('*, flash_designs(*, artists(id, name, nickname))').order('created_at', { ascending: false }),
    supabase.from('artists').select('id, name, nickname').order('name'),
    supabase.from('artist_blocked_dates').select('id, scope, artist_id, blocked_date, reason'),
    supabase.from('customers').select('id, user_id, display_name, phone, email, date_of_birth, eligibility_confirmed_at, profile_completed_at, has_medical_condition, medical_condition_note, medical_conditions, has_allergy, allergy_note, allergies'),
    supabase.from('profiles').select('user_id, display_name, phone, email, date_of_birth'),
  ]);

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
      Number(summary?.paid_total ?? summary?.total_paid ?? 0),
      bookingPaidTotal
    );

    const isFlashBooking = Boolean(b.flash_reservation_id || (b as any).request_type === 'FLASH' || b.booking_source === 'FLASH');
    const rawQuotedPrice = isFlashBooking 
      ? (b as any)?.quoted_price 
      : ((b as any)?.quoted_price ?? est?.quoted_price ?? summary?.quoted_price);
    const quotedPriceVal = rawQuotedPrice != null ? Number(rawQuotedPrice) : 0;
    const depositReqVal = Number(summary?.deposit_required ?? est?.deposit_required ?? flashDesignObj?.deposit_amount ?? (b as any)?.deposit_required ?? 0);

    const isDepPaid = Boolean(
      summary?.is_deposit_paid ?? 
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
      placement: (b.placement && b.placement !== 'ไม่ระบุ' && b.placement !== 'CUSTOM')
        ? b.placement
        : (flashRes?.placement || est?.placement || null),
      width_cm: b.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? est?.width_cm ?? null,
      height_cm: b.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? est?.height_cm ?? null,
      estimated_size_tier: b.estimated_size_tier || est?.estimated_size_tier || null,
      size_label: flashDesignObj?.size_label || flashRes?.flash_design_size_label || b.size_label || est?.estimated_size_tier || null,
      style_preference: flashStyle || est?.style || est?.style_preference || b.style_preference || null,
      work_type: b.work_type || est?.work_type || (b.flash_reservation_id ? 'FLASH' : null),
      artwork_title: rawArtworkTitle,
      artwork_image_url: flashImgUrl || b.artwork_image_url || undefined,
      description: b.description || flashRes?.customer_note || est?.description || b.customer_note || null,
      reference_images: flashImgUrl ? [flashImgUrl] : (b.reference_images || est?.reference_images || null),
      created_at: b.created_at,
      updated_at: b.updated_at,
      customer_name: getCleanCustomerName(customer, profile),
      customer_phone: customer?.phone || profile?.phone || undefined,
      customer_email: customer?.email || profile?.email || undefined,
      date_of_birth: customer?.date_of_birth || profile?.date_of_birth || est?.customer_dob || (b as any).date_of_birth || null,
      customer_dob: customer?.date_of_birth || profile?.date_of_birth || est?.customer_dob || (b as any).customer_dob || null,
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
