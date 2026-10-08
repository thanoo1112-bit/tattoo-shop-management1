'use client';

import React, { useState } from 'react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { formatTattooSize } from '@/lib/utils/formatters';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import {
  X,
  Mail,
  Phone,
  Calendar,
  Clock3,
  User,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
  ZoomIn,
} from 'lucide-react';
import { formatCustomerAgeDisplay, formatCustomerHealthInfo } from '@/lib/customerUtils';

export interface ArtistCustomerDetail {
  user_id: string;
  display_name: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  medical_conditions?: string | null;
  allergies?: string | null;
  is_age_confirmed?: boolean;
  staffArtistName?: string | null;

  // Scoped strictly to current artist
  bookings: any[];
  sessions: any[];
  estimates: any[];
  flashReservations?: any[];
  paymentSubmissions?: any[];
  payments?: any[];
}

interface ArtistCustomerDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customer: ArtistCustomerDetail | null;
}

// Format ISO/Date string into Thai date format e.g. "26 ก.ย. 2569"
function formatThaiDate(dateStr?: string | null): string {
  if (!dateStr || dateStr === '-') return '-';
  try {
    const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      const months = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ];
      const day = parseInt(parts[2], 10);
      const month = months[parseInt(parts[1], 10) - 1];
      const year = parseInt(parts[0], 10) + 543;
      if (!isNaN(day) && month) {
        return `${day} ${month} ${year}`;
      }
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const months = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
      ];
      return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Format start time string to HH:MM น.
// Priority: 1. booking_sessions.start_at, 2. bookings.requested_start_time, 3. 'ไม่ระบุเวลา'
// Strictly NO 10:00 น. fallback, NO end time, NO time range, NO duration text
function formatStartTime(timeStr?: string | null, dateStr?: string | null): string {
  if (timeStr && timeStr.includes(':')) {
    const parts = timeStr.split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')} น.`;
  }
  if (dateStr && dateStr.includes('T')) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes} น.`;
      }
    } catch (_) {}
  }
  return 'ไม่ระบุเวลา';
}

// Status Config matching Admin Customer Archive badge styles
function getBookingStatusBadge(status?: string | null) {
  const st = (status || '').toUpperCase();
  switch (st) {
    case 'CONFIRMED':
    case 'SCHEDULED':
      return { label: 'นัดหมายแล้ว', dot: 'bg-blue-500', badge: 'text-blue-400 bg-blue-950/60 border-blue-800' };
    case 'IN_PROGRESS':
    case 'HAS_SESSION':
      return { label: 'มีรอบสัก', dot: 'bg-purple-500 animate-pulse', badge: 'text-purple-400 bg-purple-950/60 border-purple-800' };
    case 'WAITING_DEPOSIT':
    case 'PENDING_DEPOSIT':
      return { label: 'รอมัดจำ', dot: 'bg-amber-400', badge: 'text-amber-300 bg-amber-950/60 border-amber-800' };
    case 'PENDING':
    case 'QUOTED':
      return { label: 'รอตรวจสอบ', dot: 'bg-[#9C2F2F] animate-pulse', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' };
    case 'COMPLETED':
      return { label: 'งานเสร็จสิ้น', dot: 'bg-emerald-500', badge: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' };
    case 'EXPIRED':
      return { label: 'หมดเวลาชำระมัดจำ', dot: 'bg-zinc-500', badge: 'text-zinc-400 bg-zinc-900/90 border-zinc-700' };
    case 'CANCELLED':
    case 'REJECTED':
      return { label: 'ยกเลิก', dot: 'bg-red-500', badge: 'text-red-400 bg-red-950/60 border-red-800' };
    default:
      return { label: status || 'ไม่ระบุ', dot: 'bg-[#7A7265]', badge: 'text-[#A89F91] bg-[#171512] border-[#4A443A]' };
  }
}

// Avatar initials fallback matching Admin Customer Archive
function CustomerAvatar({ name, sizeClass = 'w-16 h-16', textClass = 'text-2xl' }: { name?: string; sizeClass?: string; textClass?: string }) {
  const initials = name && name.trim() ? name.trim().charAt(0).toUpperCase() : 'C';
  return (
    <div className={`${sizeClass} rounded-full bg-[#9C2F2F]/20 border border-[#9C2F2F]/40 flex items-center justify-center font-bold ${textClass} text-[#ECE4D3] shrink-0 font-prompt`}>
      {initials}
    </div>
  );
}

// Reference Image Gallery Grid matching Admin Customer Archive
function ReferenceGallery({
  images,
  singleFallback,
  onOpenLightbox,
}: {
  images?: string[] | null;
  singleFallback?: string | null;
  onOpenLightbox: (imgs: string[], index: number) => void;
}) {
  const gallery: string[] = (images && images.length > 0)
    ? images.filter(Boolean)
    : (singleFallback ? [singleFallback] : []);

  if (gallery.length === 0) {
    return (
      <div className="pt-2 border-t border-[#4A443A]/30">
        <span className="text-[10px] text-[#7A7265] italic bg-[#171512] border border-[#38332E] px-2.5 py-1 rounded-[4px] inline-flex items-center gap-1.5 font-prompt">
          <Sparkles size={11} className="text-[#9C2F2F]/80" />
          <span>ไม่มีรูปอ้างอิง</span>
        </span>
      </div>
    );
  }

  return (
    <div className="pt-2 border-t border-[#4A443A]/40 space-y-1.5">
      <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
        รูปภาพอ้างอิง ({gallery.length} รูป):
      </span>
      <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 max-w-full">
        {gallery.slice(0, 5).map((imgSrc, idx) => (
          <div
            key={idx}
            onClick={() => onOpenLightbox(gallery, idx)}
            className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-[6px] border border-[#4A443A] hover:border-[#9C2F2F] bg-[#0E0D0C] overflow-hidden shrink-0 cursor-pointer group shadow-sm transition-all"
            title={`คลิกเพื่อดูรูปที่ ${idx + 1}`}
          >
            <CustomerReferenceImage
              src={imgSrc}
              alt={`Ref image ${idx + 1}`}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ZoomIn size={14} className="text-white" />
            </div>
            <span className="absolute bottom-1 left-1 bg-black/80 text-[8px] font-mono text-[#ECE4D3] px-1 py-0.2 rounded border border-white/10 select-none">
              #{idx + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ArtistCustomerDetailDrawer({
  isOpen,
  onClose,
  customer,
}: ArtistCustomerDetailDrawerProps) {
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'requests' | 'active' | 'tattoos'>('overview');
  const [lightboxGallery, setLightboxGallery] = useState<{ images: string[]; index: number } | null>(null);

  if (!isOpen || !customer) return null;

  // 1. Collections scoped strictly to current artist
  const allBookings: any[] = customer.bookings || [];
  const allEstimates: any[] = customer.estimates || [];
  const allSessions: any[] = customer.sessions || [];
  const paymentSubmissions: any[] = customer.paymentSubmissions || [];
  const payments: any[] = customer.payments || [];

  // Artist Name: Use staff record name or fallback, NEVER "ช่างสักประจำร้าน"
  const artistName = customer.staffArtistName ?? 'ไม่ระบุช่าง';

  // 2. Contact Information Resolution (Fallback chain: Customer profile -> Estimates -> Bookings)
  const resolvedEmail =
    customer.email ??
    allEstimates.find((e: any) => e.email || e.customer_email || e.contact_email)?.email ??
    allBookings.find((b: any) => b.customer_email || b.email || b.contact_email)?.customer_email ??
    null;

  const resolvedPhone =
    customer.phone ??
    allEstimates.find((e: any) => e.phone || e.contact_phone || e.customer_phone)?.phone ??
    allBookings.find((b: any) => b.customer_phone || b.contact_phone || b.phone)?.customer_phone ??
    null;

  const resolvedDob =
    customer.date_of_birth ??
    allEstimates.find((e: any) => e.date_of_birth)?.date_of_birth ??
    allBookings.find((b: any) => b.date_of_birth)?.date_of_birth ??
    null;

  const phoneFormatted = resolvedPhone ? formatThaiPhoneForDisplay(resolvedPhone) : '-';
  const emailDisplay = resolvedEmail || '-';
  const ageDisplay = formatCustomerAgeDisplay(resolvedDob);

  // 3. Tab Categorization (Rule 1)
  // Active Queue = ONLY SCHEDULED, CONFIRMED, IN_PROGRESS
  const activeQueueBookings = allBookings.filter((b: any) => {
    const st = (b.status || '').toUpperCase();
    return st === 'SCHEDULED' || st === 'CONFIRMED' || st === 'IN_PROGRESS';
  });

  // Completed Tattoos = ONLY COMPLETED
  const completedBookings = allBookings.filter((b: any) => {
    return (b.status || '').toUpperCase() === 'COMPLETED';
  });

  const completedCount = completedBookings.length;

  // Set of Estimate IDs that are linked to Active Queue Bookings or Completed Bookings
  const activeOrCompletedEstIds = new Set<string>();
  allBookings.forEach((b: any) => {
    const st = (b.status || '').toUpperCase();
    if (st === 'SCHEDULED' || st === 'CONFIRMED' || st === 'IN_PROGRESS' || st === 'COMPLETED') {
      if (b.estimate_request_id) {
        activeOrCompletedEstIds.add(b.estimate_request_id);
      }
    }
  });

  // Helper: Resolve Flash Reservation & Design details
  const allFlashRes: any[] = customer.flashReservations || [];

  const getFlashDetails = (flashResId?: string | null) => {
    if (!flashResId) return null;
    const fr = allFlashRes.find((f: any) => f.id === flashResId);
    if (!fr) return null;
    const fd = fr.flash_designs || fr.flash_design;
    return {
      title: fd?.title ? `ลาย Flash: ${fd.title}` : (fr.flash_design_title ? `ลาย Flash: ${fr.flash_design_title}` : 'ลาย Flash'),
      style: fd?.style || fr.flash_design_style || 'Blackwork',
      placement: fr.placement || 'ตามที่ตกลง',
      width_cm: fr.width_cm,
      height_cm: fr.height_cm,
      image_url: fd?.image_url || fr.flash_design_image_url,
      deposit_required: fd?.deposit_amount || fr.flash_design_deposit_amount || 500,
      catalog_price: fd?.price || fr.flash_design_price,
    };
  };

  // Request Bookings (WAITING_DEPOSIT, PENDING_DEPOSIT, PENDING, EXPIRED, QUOTED)
  const requestBookings = allBookings.filter((b: any) => {
    const st = (b.status || '').toUpperCase();
    return (
      st === 'WAITING_DEPOSIT' ||
      st === 'PENDING_DEPOSIT' ||
      st === 'PENDING' ||
      st === 'EXPIRED' ||
      st === 'QUOTED'
    );
  });

  // Unified Booking Requests (Deduplication of Estimates and Request Bookings)
  const handledBookingIds = new Set<string>();
  const unifiedRequests: any[] = [];

  // Add Estimates (excluding active queue, completed, or cancelled/rejected items)
  allEstimates.forEach((e: any) => {
    const eStatus = (e.status || '').toUpperCase();

    // Skip estimates linked to active queue / completed bookings, or already confirmed/completed/cancelled/rejected
    if (
      activeOrCompletedEstIds.has(e.id) ||
      eStatus === 'CONFIRMED' ||
      eStatus === 'COMPLETED' ||
      eStatus === 'SCHEDULED' ||
      eStatus === 'IN_PROGRESS' ||
      eStatus === 'CANCELLED' ||
      eStatus === 'REJECTED'
    ) {
      return;
    }

    const matchingBooking = requestBookings.find(
      (b: any) => b.estimate_request_id === e.id
    );

    if (matchingBooking) {
      handledBookingIds.add(matchingBooking.id);
      const flashDetails = getFlashDetails(matchingBooking.flash_reservation_id);
      unifiedRequests.push({
        id: `unified-${e.id}-${matchingBooking.id}`,
        estimate_id: e.id,
        booking_id: matchingBooking.id,
        style: matchingBooking.style_preference ?? flashDetails?.style ?? e.style ?? 'Custom',
        placement: matchingBooking.placement ?? flashDetails?.placement ?? e.placement ?? 'ไม่ระบุ',
        width_cm: matchingBooking.width_cm ?? flashDetails?.width_cm ?? e.width_cm,
        height_cm: matchingBooking.height_cm ?? flashDetails?.height_cm ?? e.height_cm,
        created_at: matchingBooking.created_at ?? e.created_at,
        status: matchingBooking.status ?? e.status ?? 'WAITING_DEPOSIT',
        deposit_required: matchingBooking.deposit_required ?? flashDetails?.deposit_required ?? e.deposit_required ?? 500,
        reference_images: e.reference_images?.length
          ? e.reference_images
          : (matchingBooking.reference_images?.length ? matchingBooking.reference_images : (flashDetails?.image_url ? [flashDetails.image_url] : (e.reference_image ? [e.reference_image] : []))),
        artist_name: artistName,
        booking: matchingBooking,
        estimate: e,
      });
    } else {
      unifiedRequests.push({
        id: `est-${e.id}`,
        estimate_id: e.id,
        booking_id: null,
        style: e.style ?? 'Custom',
        placement: e.placement ?? 'ไม่ระบุ',
        width_cm: e.width_cm,
        height_cm: e.height_cm,
        created_at: e.created_at,
        status: e.status ?? 'PENDING',
        deposit_required: e.deposit_required ?? 500,
        reference_images: e.reference_images?.length
          ? e.reference_images
          : (e.reference_image ? [e.reference_image] : []),
        artist_name: artistName,
        estimate: e,
      });
    }
  });

  // Add standalone request bookings (without linked estimate, e.g. Flash reservation bookings or direct bookings)
  requestBookings.forEach((b: any) => {
    const bStatus = (b.status || '').toUpperCase();
    if (
      !handledBookingIds.has(b.id) &&
      bStatus !== 'CONFIRMED' &&
      bStatus !== 'SCHEDULED' &&
      bStatus !== 'IN_PROGRESS' &&
      bStatus !== 'COMPLETED' &&
      bStatus !== 'CANCELLED' &&
      bStatus !== 'REJECTED'
    ) {
      const flashDetails = getFlashDetails(b.flash_reservation_id);
      const style = flashDetails?.title ?? (b.style_preference ? `งานสไตล์ ${b.style_preference}` : (b.artwork_title ?? 'Custom Tattoo'));

      unifiedRequests.push({
        id: `book-${b.id}`,
        estimate_id: b.estimate_request_id ?? null,
        booking_id: b.id,
        style,
        placement: b.placement ?? flashDetails?.placement ?? 'ไม่ระบุ',
        width_cm: b.width_cm ?? flashDetails?.width_cm,
        height_cm: b.height_cm ?? flashDetails?.height_cm,
        created_at: b.created_at,
        status: b.status ?? 'WAITING_DEPOSIT',
        deposit_required: b.deposit_required ?? flashDetails?.deposit_required ?? 500,
        reference_images: b.reference_images?.length
          ? b.reference_images
          : (flashDetails?.image_url ? [flashDetails.image_url] : (b.artwork_image_url ? [b.artwork_image_url] : [])),
        artist_name: artistName,
        booking: b,
      });
    }
  });

  // Sort unified requests by latest created date
  unifiedRequests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // 4. Financial Calculations & Deposit Paid Rules (Rule 3)
  // Helper: Calculate real approved deposit & total price for any booking
  const getPaymentDetails = (b: any, linkedEst: any, flashDetails?: any) => {
    const price = b?.quoted_price ?? linkedEst?.quoted_price ?? null;

    // Calculate approved deposit paid amount without double-counting
    let approvedDepositAmount: number | null = null;
    const bookingId = b?.id;
    const estimateId = linkedEst?.id ?? b?.estimate_request_id;

    const approvedSubs = paymentSubmissions.filter(
      (sub: any) => (bookingId && sub.booking_id === bookingId) || (estimateId && sub.estimate_request_id === estimateId)
    );
    const validDepositPays = payments.filter(
      (p: any) => bookingId && p.booking_id === bookingId && (p.payment_type || '').toUpperCase() === 'DEPOSIT' && p.status !== 'VOIDED'
    );

    const subTotal = approvedSubs.reduce((sum: number, sub: any) => sum + Number(sub.claimed_amount ?? sub.amount ?? 0), 0);
    const depositPayTotal = validDepositPays.reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

    // Use recorded deposit payments first, or fallback to approved submissions (avoid double-counting)
    const totalApprovedDeposit = depositPayTotal > 0 ? depositPayTotal : (subTotal > 0 ? subTotal : 0);

    if (totalApprovedDeposit > 0) {
      approvedDepositAmount = totalApprovedDeposit;
    }

    const priceDisplay = price !== null && price !== undefined && Number(price) > 0 ? `฿${Number(price).toLocaleString()}` : 'ยังไม่กำหนดราคา';
    const depositDisplay = approvedDepositAmount !== null && approvedDepositAmount > 0 ? `฿${approvedDepositAmount.toLocaleString()}` : (flashDetails?.deposit_required ? `฿${Number(flashDetails.deposit_required).toLocaleString()}` : '฿500');
    
    let balanceDisplay = '—';
    if (price !== null && price !== undefined && Number(price) > 0) {
      const balance = Math.max(0, Number(price) - (approvedDepositAmount ?? 0));
      balanceDisplay = `฿${balance.toLocaleString()}`;
    }

    return {
      price: price !== null ? Number(price) : null,
      priceDisplay,
      approvedDepositAmount,
      depositDisplay,
      balanceDisplay,
    };
  };

  // Total Spent strictly from actual payments of COMPLETED bookings for this artist (Rule 3)
  const totalSpent = completedBookings.reduce((sum: number, b: any) => {
    const bookingId = b.id;
    const validPays = payments.filter((p: any) => p.booking_id === bookingId && p.status !== 'VOIDED');
    const paidTotal = validPays.reduce((pSum: number, p: any) => pSum + Number(p.amount ?? 0), 0);

    if (paidTotal > 0) {
      return sum + paidTotal;
    }

    // Fallback to approved submissions if payments table has no records for this completed booking
    const approvedSubs = paymentSubmissions.filter((s: any) => s.booking_id === bookingId && s.status === 'APPROVED');
    const subTotal = approvedSubs.reduce((sSum: number, s: any) => sSum + Number(s.claimed_amount ?? s.amount ?? 0), 0);
    return sum + subTotal;
  }, 0);

  // 5. Health Info
  const healthInfo = formatCustomerHealthInfo({
    medical_conditions: customer.medical_conditions,
    allergies: customer.allergies,
    estimates: allEstimates,
  });

  // 6. Next Appointment Resolution (Strictly IN THE FUTURE)
  const nowMs = Date.now();

  // Active Queue Bookings: ONLY SCHEDULED, CONFIRMED, IN_PROGRESS
  const validActiveQueueBookings = allBookings.filter((b: any) => {
    const st = (b.status || '').toUpperCase();
    return st === 'SCHEDULED' || st === 'CONFIRMED' || st === 'IN_PROGRESS';
  });

  const activeQueueBookingIds = new Set(validActiveQueueBookings.map((b: any) => b.id));

  // Active Sessions: Linked to a valid active queue booking AND session status is NOT CANCELLED or COMPLETED
  const validActiveSessions = allSessions.filter((s: any) => {
    if (!activeQueueBookingIds.has(s.booking_id)) return false;
    const sSt = (s.status || '').toUpperCase();
    return sSt !== 'CANCELLED' && sSt !== 'COMPLETED';
  });

  // Future sessions (> nowMs) sorted by earliest first
  const futureSessions = validActiveSessions
    .filter((s: any) => new Date(s.start_at).getTime() > nowMs)
    .sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  // Future bookings (> nowMs) without active session
  const futureBookingsWithoutSession = validActiveQueueBookings
    .filter((b: any) => {
      const hasSession = validActiveSessions.some((s: any) => s.booking_id === b.id);
      if (hasSession) return false;
      const bDate = b.requested_date || b.created_at;
      return new Date(bDate).getTime() > nowMs;
    })
    .sort(
      (a: any, b: any) => new Date(a.requested_date || a.created_at).getTime() - new Date(b.requested_date || b.created_at).getTime()
    );

  // Resolve TRUE Next Future Appointment
  const upcomingSession = futureSessions[0];
  const upcomingBooking = futureBookingsWithoutSession[0];

  let nextAppointment: any = null;
  let targetBookingForNext: any = null;
  let nextDateStr: string | null = null;
  let nextTimeStr: string = 'ไม่ระบุเวลา';

  if (upcomingSession) {
    targetBookingForNext = validActiveQueueBookings.find((b: any) => b.id === upcomingSession.booking_id) || null;
    nextDateStr = upcomingSession.start_at;
    nextTimeStr = formatStartTime(null, upcomingSession.start_at);
  } else if (upcomingBooking) {
    targetBookingForNext = upcomingBooking;
    nextDateStr = upcomingBooking.requested_date || upcomingBooking.created_at;
    nextTimeStr = formatStartTime(upcomingBooking.requested_start_time, upcomingBooking.requested_date);
  }

  if (targetBookingForNext) {
    const linkedEst = allEstimates.find((e: any) => targetBookingForNext.estimate_request_id === e.id);
    const flashDetails = getFlashDetails(targetBookingForNext.flash_reservation_id);
    const pd = getPaymentDetails(targetBookingForNext, linkedEst, flashDetails);

    const artworkTitle = targetBookingForNext.artwork_title
      ?? flashDetails?.title
      ?? (targetBookingForNext.style_preference ? `งานสไตล์ ${targetBookingForNext.style_preference}` : (linkedEst?.style ? `งานสไตล์ ${linkedEst.style}` : 'Custom Tattoo Piece'));

    const placement = targetBookingForNext.placement ?? flashDetails?.placement ?? linkedEst?.placement ?? 'ตามที่ตกลง';
    const widthCm = targetBookingForNext.width_cm ?? flashDetails?.width_cm ?? linkedEst?.width_cm;
    const heightCm = targetBookingForNext.height_cm ?? flashDetails?.height_cm ?? linkedEst?.height_cm;

    nextAppointment = {
      booking_id: targetBookingForNext.id,
      status: upcomingSession?.status || targetBookingForNext.status || 'SCHEDULED',
      artworkTitle,
      artistName,
      date: nextDateStr,
      startTime: nextTimeStr,
      placement,
      width_cm: widthCm,
      height_cm: heightCm,
      depositDisplay: pd.depositDisplay,
    };
  }

  // 7. Service Specs Summary Details (STRICTLY COMPLETED JOBS ONLY)
  const sortedCompletedBookings = [...completedBookings].sort(
    (a: any, b: any) => new Date(b.completed_at || b.requested_date || b.created_at).getTime() - new Date(a.completed_at || a.requested_date || a.created_at).getTime()
  );

  const latestCompletedBooking = sortedCompletedBookings[0];
  const latestCompletedLinkedEst = latestCompletedBooking ? allEstimates.find((e: any) => latestCompletedBooking.estimate_request_id === e.id) : null;
  const latestCompletedFlash = latestCompletedBooking ? getFlashDetails(latestCompletedBooking.flash_reservation_id) : null;

  const lastArtistName = completedBookings.length > 0 ? artistName : '—';
  const lastArtworkTitle = latestCompletedBooking
    ? (latestCompletedBooking.artwork_title ?? latestCompletedFlash?.title ?? (latestCompletedBooking.style_preference ? `งานสไตล์ ${latestCompletedBooking.style_preference}` : (latestCompletedLinkedEst?.style ? `งานสไตล์ ${latestCompletedLinkedEst.style}` : 'งานสัก Custom')))
    : '—';

  const lastDate = latestCompletedBooking
    ? (latestCompletedBooking.completed_at || latestCompletedBooking.requested_date || latestCompletedBooking.created_at)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
        {/* Header (Rule 5) */}
        <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Sparkles size={16} className="text-[#9C2F2F]" />
              <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                CLIENT ARCHIVE • แฟ้มข้อมูลลูกค้า
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <CustomerAvatar name={customer.display_name} sizeClass="w-16 h-16" textClass="text-2xl" />
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3] truncate">
                {customer.display_name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#A89F91] mt-0.5">
                <span className="flex items-center space-x-1">
                  <Mail size={11} className="text-[#7A7265]" />
                  <span className="font-mono">{emailDisplay}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Phone size={11} className="text-[#7A7265]" />
                  <span className="font-mono">{phoneFormatted}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Calendar size={11} className="text-[#7A7265]" />
                  <span className="font-mono">
                    {`อายุ: ${ageDisplay}`}
                  </span>
                </span>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#0E0D0C] border border-[#4A443A] font-mono text-[#ECE4D3] font-semibold">
                  ใช้บริการ {completedCount} ครั้ง
                </span>
              </div>
            </div>
          </div>

          {/* Detail Navigation Tabs (4 Tabs) */}
          <div className="flex border-b border-[#4A443A]/60 space-x-4 text-xs pt-2">
            <button
              type="button"
              onClick={() => setActiveDetailTab('overview')}
              className={`pb-2 font-medium transition-colors relative cursor-pointer ${
                activeDetailTab === 'overview'
                  ? 'text-[#ECE4D3] font-semibold'
                  : 'text-[#7A7265] hover:text-[#A89F91]'
              }`}
            >
              ภาพรวม
              {activeDetailTab === 'overview' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailTab('requests')}
              className={`pb-2 font-medium transition-colors relative cursor-pointer ${
                activeDetailTab === 'requests'
                  ? 'text-[#ECE4D3] font-semibold'
                  : 'text-[#7A7265] hover:text-[#A89F91]'
              }`}
            >
              คำขอจอง ({unifiedRequests.length})
              {activeDetailTab === 'requests' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailTab('active')}
              className={`pb-2 font-medium transition-colors relative cursor-pointer ${
                activeDetailTab === 'active'
                  ? 'text-[#ECE4D3] font-semibold'
                  : 'text-[#7A7265] hover:text-[#A89F91]'
              }`}
            >
              คิวงาน ({activeQueueBookings.length})
              {activeDetailTab === 'active' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveDetailTab('tattoos')}
              className={`pb-2 font-medium transition-colors relative cursor-pointer ${
                activeDetailTab === 'tattoos'
                  ? 'text-[#ECE4D3] font-semibold'
                  : 'text-[#7A7265] hover:text-[#A89F91]'
              }`}
            >
              ประวัติงานสัก ({completedBookings.length})
              {activeDetailTab === 'tattoos' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
              )}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 flex-1 text-xs overflow-y-auto">
          {/* TAB 1: OVERVIEW */}
          {activeDetailTab === 'overview' && (
            <div className="space-y-4">
              {/* NEXT FUTURE APPOINTMENT */}
              {nextAppointment ? (
                <div className="bg-[#171512] border-l-4 border-l-[#9C2F2F] border border-[#4A443A] p-4 rounded-[6px] space-y-3 shadow-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-1.5 text-xs text-[#ECE4D3] font-bold">
                      <Clock3 size={14} className="text-[#9C2F2F]" />
                      <span>นัดหมายถัดไป (NEXT APPOINTMENT)</span>
                    </div>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${
                        getBookingStatusBadge(nextAppointment.status).badge
                      }`}
                    >
                      {getBookingStatusBadge(nextAppointment.status).label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-[#A89F91]">
                    <div>
                      <span className="text-[10px] text-[#7A7265] block">ผลงาน / ลายสัก:</span>
                      <strong className="text-[#ECE4D3]">
                        {nextAppointment.artworkTitle}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#7A7265] block">ช่างสัก:</span>
                      <strong className="text-[#ECE4D3]">
                        {nextAppointment.artistName}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#7A7265] block">วันและเวลา:</span>
                      <span className="font-mono text-[#ECE4D3]">
                        {formatThaiDate(nextAppointment.date)} • {nextAppointment.startTime}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#7A7265] block">ตำแหน่งและขนาด:</span>
                      <span className="text-[#ECE4D3]">
                        {nextAppointment.placement}
                        {formatTattooSize(nextAppointment.width_cm, nextAppointment.height_cm)
                          ? ` (${formatTattooSize(nextAppointment.width_cm, nextAppointment.height_cm)})`
                          : ''}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#4A443A]/40 flex justify-between items-center text-xs">
                    <span className="text-[#A89F91]">สถานะการชำระ:</span>
                    <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded">
                      มัดจำแล้ว ({nextAppointment.depositDisplay})
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] text-center text-xs text-[#7A7265]">
                  ไม่มีนัดหมายถัดไปในขณะนี้
                </div>
              )}

              {/* Client Service Specs (Strictly Completed Services) */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  ข้อมูลสรุปการใช้บริการ (COMPLETED SERVICES):
                </span>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">ช่างที่เคยดูแล:</span>
                    <span className="text-[#ECE4D3] font-medium block truncate">
                      {lastArtistName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">งานที่ทำเสร็จล่าสุด:</span>
                    <span className="text-[#ECE4D3] font-medium truncate block">
                      {lastArtworkTitle}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#7A7265] text-[10px] block">
                      วันที่ใช้บริการล่าสุด:
                    </span>
                    <span className="text-[#ECE4D3] font-mono block">
                      {formatThaiDate(lastDate)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#4A443A]/40 space-y-2">
                  <span className="text-[#7A7265] text-[10px] uppercase font-bold tracking-wider block">
                    ข้อมูลสุขภาพ (สำหรับ Admin/ช่างเท่านั้น):
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-[#171512] rounded border border-[#4A443A]/50 space-y-0.5">
                      <span className="text-[10px] text-[#7A7265] block font-medium">โรคประจำตัว:</span>
                      <span className="text-[#ECE4D3] font-medium block">
                        {healthInfo.medicalCondition}
                      </span>
                    </div>
                    <div className="p-2 bg-[#171512] rounded border border-[#4A443A]/50 space-y-0.5">
                      <span className="text-[10px] text-[#7A7265] block font-medium">อาการแพ้ (เช่น ยา, โลหะ, ยาชา):</span>
                      <span className="text-[#ECE4D3] font-medium block">
                        {healthInfo.allergy}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Note Section */}
              <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                  บันทึกเกี่ยวกับลูกค้า (Client Notes):
                </span>
                <p className="text-[#7A7265] text-xs italic">
                  ยังไม่มีบันทึกสำหรับลูกค้ารายนี้
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: BOOKING REQUESTS (คำขอจอง - Deduplicated & Unified) */}
          {activeDetailTab === 'requests' && (
            <div className="space-y-3">
              {unifiedRequests.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#7A7265]">
                  ยังไม่มีประวัติคำขอจองคิวกับช่างท่านนี้
                </div>
              ) : (
                unifiedRequests.map((req: any) => {
                  const statusInfo = getBookingStatusBadge(req.status);
                  const refImages: string[] = req.reference_images || [];
                  const sizeText = formatTattooSize(req.width_cm, req.height_cm);
                  const linkedEst = req.estimate;
                  const linkedBook = req.booking;
                  const pd = getPaymentDetails(linkedBook, linkedEst);

                  return (
                    <div
                      key={req.id}
                      className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1 pr-2">
                          <strong className="text-xs text-[#ECE4D3] block">
                            สไตล์ {req.style || 'Custom'}{sizeText ? ` • ${sizeText}` : ''}
                          </strong>
                          <span className="text-[10px] text-[#A89F91] block mt-0.5">
                            ตำแหน่ง: {req.placement || 'ตามที่ตกลง'} • ช่าง: {artistName}
                          </span>
                          <span className="text-[10px] text-[#7A7265] font-mono block mt-0.5">
                            ส่งคำขอเมื่อ: {formatThaiDate(req.created_at)}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-semibold border shrink-0 ${statusInfo.badge}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      {/* Single deposit status box according to shop policy */}
                      {(() => {
                        const reqStatus = (req.status || '').toUpperCase();

                        if (reqStatus === 'EXPIRED') {
                          return (
                            <div className="p-2 bg-[#171512] rounded border border-zinc-800/60 text-[11px] flex justify-between items-center">
                              <span className="text-[#A89F91] font-medium">มัดจำที่กำหนด</span>
                              <span className="font-mono font-bold text-[#A89F91]">฿{Number(req.deposit_required ?? 500).toLocaleString()}</span>
                            </div>
                          );
                        }

                        if (reqStatus === 'PENDING') {
                          return (
                            <div className="p-2 bg-[#171512] rounded border border-[#38332E] text-[11px] flex justify-between items-center">
                              <span className="text-[#7A7265]">ข้อมูลการเงิน:</span>
                              <span className="text-[#7A7265] italic text-[10px]">ยังไม่แสดงข้อมูลการเงิน (รอช่างตรวจสอบคำขอ)</span>
                            </div>
                          );
                        }

                        const bookingId = req.booking_id;
                        const estimateId = req.estimate_id;

                        const approvedSub = paymentSubmissions.find(
                          (sub: any) =>
                            sub.status === 'APPROVED' &&
                            ((bookingId && sub.booking_id === bookingId) || (estimateId && sub.estimate_request_id === estimateId))
                        );
                        const validDepositPay = payments.find(
                          (p: any) =>
                            p.status !== 'VOIDED' &&
                            (p.payment_type || '').toUpperCase() === 'DEPOSIT' &&
                            bookingId &&
                            p.booking_id === bookingId
                        );

                        if (approvedSub || validDepositPay) {
                          const approvedAmount = validDepositPay?.amount ?? approvedSub?.claimed_amount ?? approvedSub?.amount ?? req.deposit_required ?? 500;
                          return (
                            <div className="p-2 bg-[#171512] rounded border border-emerald-900/60 text-[11px] flex justify-between items-center">
                              <span className="text-emerald-400 font-medium">ชำระมัดจำแล้ว</span>
                              <span className="font-mono font-bold text-emerald-400">฿{Number(approvedAmount).toLocaleString()}</span>
                            </div>
                          );
                        }

                        const pendingSub = paymentSubmissions.find(
                          (sub: any) =>
                            (sub.status === 'PENDING' || sub.status === 'SUBMITTED' || sub.status === 'UNDER_REVIEW') &&
                            ((bookingId && sub.booking_id === bookingId) || (estimateId && sub.estimate_request_id === estimateId))
                        );

                        if (pendingSub) {
                          return (
                            <div className="p-2 bg-[#171512] rounded border border-amber-800/60 text-[11px] flex justify-between items-center">
                              <div>
                                <span className="text-[#ECE4D3] font-medium block">มัดจำ ฿{Number(req.deposit_required ?? 500).toLocaleString()}</span>
                                <span className="text-amber-400 text-[10px] block">สถานะ: รอตรวจสอบสลิปมัดจำ</span>
                              </div>
                              <span className="text-[10px] text-amber-300 bg-amber-950/80 border border-amber-800 px-2 py-0.5 rounded font-medium">
                                รอตรวจสอบสลิป
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div className="p-2 bg-[#171512] rounded border border-amber-800/40 text-[11px] flex justify-between items-center">
                            <div>
                              <span className="text-[#ECE4D3] font-medium block">มัดจำที่ต้องชำระ ฿{Number(req.deposit_required ?? 500).toLocaleString()}</span>
                              <span className="text-[#A89F91] text-[10px] block">สถานะ: รอชำระมัดจำ</span>
                            </div>
                            <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded font-medium">
                              รอชำระมัดจำ
                            </span>
                          </div>
                        );
                      })()}

                      <ReferenceGallery
                        images={refImages}
                        onOpenLightbox={(imgs, idx) => setLightboxGallery({ images: imgs, index: idx })}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: ACTIVE QUEUE (คิวงาน - Strictly SCHEDULED, CONFIRMED, IN_PROGRESS) */}
          {activeDetailTab === 'active' && (
            <div className="space-y-3">
              {activeQueueBookings.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#7A7265]">
                  ไม่มีรายการคิวงานที่กำลังดำเนินการในขณะนี้
                </div>
              ) : (
                activeQueueBookings.map((b: any) => {
                  const statusInfo = getBookingStatusBadge(b.status);
                  const linkedEst = allEstimates.find((e: any) => b.estimate_request_id === e.id);
                  const flashDetails = getFlashDetails(b.flash_reservation_id);

                  const artworkTitle = b.artwork_title 
                    ?? flashDetails?.title
                    ?? (b.style_preference ? `งานสไตล์ ${b.style_preference}` : (linkedEst?.style ? `งานสไตล์ ${linkedEst.style}` : 'Custom Tattoo Piece'));

                  const placement = b.placement ?? flashDetails?.placement ?? linkedEst?.placement ?? 'ตามที่ตกลง';
                  const widthCm = b.width_cm ?? flashDetails?.width_cm ?? linkedEst?.width_cm;
                  const heightCm = b.height_cm ?? flashDetails?.height_cm ?? linkedEst?.height_cm;
                  const sizeText = formatTattooSize(widthCm, heightCm);

                  const refImages: string[] = b.reference_images?.length
                    ? b.reference_images
                    : (flashDetails?.image_url 
                        ? [flashDetails.image_url] 
                        : (linkedEst?.reference_images?.length ? linkedEst.reference_images : (b.artwork_image_url ? [b.artwork_image_url] : [])));

                  const pd = getPaymentDetails(b, linkedEst, flashDetails);

                  // Session start time
                  const matchingSession = allSessions.find((s: any) => s.booking_id === b.id && s.status !== 'CANCELLED');
                  const dateStr = matchingSession?.start_at || b.requested_date || b.created_at;
                  const timeStr = matchingSession?.start_at
                    ? formatStartTime(null, matchingSession.start_at)
                    : formatStartTime(b.requested_start_time, b.requested_date);

                  return (
                    <div
                      key={b.id}
                      className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1 pr-2">
                          <strong className="text-xs text-[#ECE4D3] block">
                            {artworkTitle}{sizeText ? ` • ${sizeText}` : ''}
                          </strong>
                          <span className="text-[10px] text-[#A89F91] block mt-0.5">
                            ตำแหน่ง: {placement || 'ตามที่ตกลง'} • ช่าง: {artistName}
                          </span>
                          <span className="text-[10px] text-[#7A7265] font-mono block mt-0.5">
                            {formatThaiDate(dateStr)} • {timeStr}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-semibold border shrink-0 ${statusInfo.badge}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      <div className="p-2 bg-[#171512] rounded border border-emerald-900/60 text-[11px] flex justify-between items-center">
                        <span className="text-emerald-400 font-medium">ชำระมัดจำแล้ว</span>
                        <span className="font-mono font-bold text-emerald-400">{pd.depositDisplay}</span>
                      </div>

                      <ReferenceGallery
                        images={refImages}
                        onOpenLightbox={(imgs, idx) => setLightboxGallery({ images: imgs, index: idx })}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 4: COMPLETED TATTOO HISTORY (ประวัติงานสัก - Strictly COMPLETED) */}
          {activeDetailTab === 'tattoos' && (
            <div className="space-y-3">
              {completedBookings.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#7A7265]">
                  ยังไม่มีประวัติงานสักที่เสร็จสิ้นกับช่างท่านนี้
                </div>
              ) : (
                completedBookings.map((b: any) => {
                  const linkedEst = allEstimates.find((e: any) => b.estimate_request_id === e.id);
                  const flashDetails = getFlashDetails(b.flash_reservation_id);

                  const artworkTitle = b.artwork_title 
                    ?? flashDetails?.title
                    ?? (b.style_preference ? `งานสไตล์ ${b.style_preference}` : (linkedEst?.style ? `งานสไตล์ ${linkedEst.style}` : 'Custom Tattoo Piece'));

                  const placement = b.placement ?? flashDetails?.placement ?? linkedEst?.placement ?? 'ตามที่ตกลง';
                  const widthCm = b.width_cm ?? flashDetails?.width_cm ?? linkedEst?.width_cm;
                  const heightCm = b.height_cm ?? flashDetails?.height_cm ?? linkedEst?.height_cm;
                  const sizeText = formatTattooSize(widthCm, heightCm);

                  const refImages: string[] = b.reference_images?.length
                    ? b.reference_images
                    : (flashDetails?.image_url 
                        ? [flashDetails.image_url] 
                        : (linkedEst?.reference_images?.length ? linkedEst.reference_images : (b.artwork_image_url ? [b.artwork_image_url] : [])));

                  const pd = getPaymentDetails(b, linkedEst, flashDetails);
                  const cardArtistName = b.artist_name || b.staffArtistName || artistName || 'ช่างสักประจำร้าน';
                  const dateStr = b.requested_date || b.completed_at || b.created_at;

                  return (
                    <div
                      key={b.id}
                      className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1 pr-2">
                          <strong className="text-xs text-[#ECE4D3] block">
                            {artworkTitle}{sizeText ? ` • ${sizeText}` : ''}
                          </strong>
                          <span className="text-[10px] text-[#A89F91] block mt-0.5">
                            ช่างสัก: {cardArtistName} • {formatThaiDate(dateStr)}
                          </span>
                          <span className="text-[10px] text-[#7A7265] block mt-0.5">
                            ตำแหน่ง: {placement}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          {pd.price !== null && pd.price > 0 && (
                            <span className="text-xs font-mono font-bold text-[#ECE4D3] block">
                              {pd.priceDisplay}
                            </span>
                          )}
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 font-mono inline-block mt-0.5">
                            ✓ เสร็จสิ้น
                          </span>
                        </div>
                      </div>

                      <ReferenceGallery
                        images={refImages}
                        onOpenLightbox={(imgs, idx) => setLightboxGallery({ images: imgs, index: idx })}
                      />
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="pt-4 border-t border-[#4A443A]/60 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>

      {/* LIGHTBOX ZOOM GALLERY MODAL */}
      {lightboxGallery && lightboxGallery.images.length > 0 && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-pointer animate-fadeIn font-prompt"
          onClick={() => setLightboxGallery(null)}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={() => setLightboxGallery(null)}
            className="absolute top-4 right-4 text-white hover:text-[#9C2F2F] bg-black/60 hover:bg-black/90 border border-white/20 p-2 rounded-full transition-colors z-20 cursor-pointer"
            title="ปิด"
          >
            <X size={20} />
          </button>

          {/* Main Image Container */}
          <div
            className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <CustomerReferenceImage
              src={lightboxGallery.images[lightboxGallery.index]}
              alt={`Reference View ${lightboxGallery.index + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
              showSkeleton={true}
            />
          </div>

          {/* Next / Previous Navigation */}
          {lightboxGallery.images.length > 1 && (
            <div
              className="flex items-center space-x-4 mt-4 text-[#ECE4D3] z-20 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setLightboxGallery((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: prev.index > 0 ? prev.index - 1 : prev.images.length - 1,
                        }
                      : null
                  )
                }
                className="p-2 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] hover:bg-[#9C2F2F] text-white rounded-full transition-colors shadow-lg cursor-pointer"
                title="รูปก่อนหน้า"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="font-mono text-xs text-[#A89F91]">
                {lightboxGallery.index + 1} / {lightboxGallery.images.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setLightboxGallery((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index + 1) % prev.images.length,
                        }
                      : null
                  )
                }
                className="p-2 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] hover:bg-[#9C2F2F] text-white rounded-full transition-colors shadow-lg cursor-pointer"
                title="รูปถัดไป"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
