'use client';

import React from 'react';
import { CustomerPortalBooking, CustomerPortalEstimate, CustomerFlashReservationRecord } from './types';
import BookingStatusBadge from './BookingStatusBadge';
import { Calendar, CalendarClock, ChevronRight, Layers } from 'lucide-react';
import { formatThaiDate, formatTimeBangkok, resolveCustomerDisplayStatus, getDepositDeadlineInfo, parseFlashCustomerNote } from './portalUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';

interface CustomerBookingCardProps {
  item: CustomerPortalBooking | CustomerPortalEstimate | CustomerFlashReservationRecord | any;
  type: 'estimate' | 'booking' | 'flash';
  estimates?: CustomerPortalEstimate[];
  onClick: () => void;
}

export default function CustomerBookingCard({
  item,
  type,
  estimates,
  onClick,
}: CustomerBookingCardProps) {
  const isBooking = type === 'booking';
  const isFlash = type === 'flash' || Boolean((item as any)?.flash_reservation_id) || Boolean((item as any)?.is_flash);
  const booking = item as CustomerPortalBooking;
  const estimate = item as CustomerPortalEstimate;
  const flashRes = ((item as any)?.flash_reservation || item) as CustomerFlashReservationRecord;
  const flashDesignObj = flashRes?.flash_design || flashRes?.flash_designs;

  const hasPendingSlip = Boolean((item as any).has_pending_payment_submission);

  // Check 24-hour Deposit Deadline for WAITING_DEPOSIT
  const approvedAt = isBooking ? booking.approved_at : (isFlash ? (flashRes.approved_at || booking.approved_at) : (estimate as any).approved_at);
  const deadlineInfo = item.status === 'WAITING_DEPOSIT' && !hasPendingSlip ? getDepositDeadlineInfo(approvedAt, item.created_at, item.requested_date || flashRes?.requested_date, item.requested_start_time || flashRes?.requested_start_time) : null;
  const isExpired = Boolean(deadlineInfo?.isExpired);

  let displayStatus = '';
  if (isFlash) {
    const s = (item.status || flashRes.status || '').toUpperCase();
    if (s === 'PENDING' || s === 'PENDING_REVIEW') displayStatus = 'PENDING';
    else if (s === 'WAITING_DEPOSIT' || s === 'PENDING_PAYMENT') displayStatus = hasPendingSlip ? 'SLIP_REVIEW' : 'WAITING_DEPOSIT';
    else if (s === 'SLIP_REVIEW' || s === 'VERIFICATION_PENDING') displayStatus = 'SLIP_REVIEW';
    else if (s === 'APPROVED' || s === 'CONFIRMED' || s === 'IN_PROGRESS') displayStatus = 'CONFIRMED';
    else if (s === 'COMPLETED') displayStatus = 'COMPLETED';
    else if (s === 'REJECTED') displayStatus = 'REJECTED';
    else if (s === 'CANCELLED') displayStatus = 'CANCELLED';
    else if (s === 'EXPIRED') displayStatus = 'EXPIRED';
    else displayStatus = s;
  } else {
    const rawDisplayStatus = resolveCustomerDisplayStatus(item.status, hasPendingSlip);
    displayStatus = (rawDisplayStatus === 'WAITING_DEPOSIT' && isExpired) ? 'EXPIRED' : rawDisplayStatus;
  }

  // Matching Estimate for fallback lookup
  const matchingEst = isBooking
    ? estimates?.find((e) => e.id === booking.estimate_request_id)
    : null;

  // 1. Resolve Artist Name
  let artistDisplayName = 'ช่างสักประจำร้าน';
  if (isFlash) {
    const art = flashDesignObj?.artist || item.artist;
    artistDisplayName = art?.nickname || art?.name || 'ช่างสักประจำร้าน';
  } else {
    artistDisplayName = item.artist?.nickname || item.artist?.name || 'ช่างสักประจำร้าน';
  }

  // 2. Resolve Preview Image
  let previewImage: string | null = null;
  if (isFlash) {
    previewImage = flashDesignObj?.image_url || booking.artwork_image_url || booking.reference_images?.[0] || null;
  } else if (isBooking) {
    previewImage = booking.reference_images?.[0] || booking.artwork_image_url || matchingEst?.reference_images?.[0] || null;
  } else {
    previewImage = estimate.reference_images?.[0] || null;
  }

  // 3. Resolve Tattoo Style & Main Title
  let mainTitle = '';
  if (isFlash) {
    mainTitle = flashDesignObj?.title || booking.artwork_title || 'แบบลายสัก Flash';
  } else {
    const rawStyle = isBooking ? (booking.style || matchingEst?.style) : estimate.style;
    const realStyle = (rawStyle && rawStyle !== 'Custom' && rawStyle !== 'CUSTOM') ? rawStyle : null;

    if (realStyle) {
      mainTitle = `งานสัก ${realStyle}`;
    } else if (isBooking && booking.artwork_title && booking.artwork_title !== 'งานสัก Custom' && booking.artwork_title !== 'Custom') {
      mainTitle = booking.artwork_title;
    } else {
      mainTitle = isBooking ? 'งานสัก' : 'คำขอประเมินราคางานสัก';
    }
  }

  // Flash metadata parsing
  const flashParsedNote = isFlash ? parseFlashCustomerNote(flashRes.customer_note || booking.customer_note) : null;
  const flashPlacementStr = isFlash
    ? ((flashRes.placement && flashRes.placement.trim()) ? flashRes.placement.trim() : (booking.placement || flashParsedNote?.parsedPlacement || null))
    : null;

  let flashSizeStr: string | null = null;
  if (isFlash) {
    const w = flashRes.width_cm || booking.width_cm;
    const h = flashRes.height_cm || booking.height_cm;
    const formatted = formatTattooSize(w, h, flashParsedNote?.parsedSizeRaw);
    flashSizeStr = formatted !== 'ไม่ระบุ' ? formatted : null;
  }

  // 4. Resolve Placement Display
  let placementDisplay = 'ไม่ระบุตำแหน่ง';
  if (isFlash) {
    placementDisplay = flashPlacementStr || '';
  } else {
    const rawPlacement = isBooking ? (booking.placement || matchingEst?.placement) : estimate.placement;
    placementDisplay = rawPlacement && rawPlacement.trim() !== '' ? rawPlacement : 'ไม่ระบุตำแหน่ง';
  }

  // 5. Resolve Size Display
  let sizeDisplay = 'ไม่ระบุขนาด';
  if (isFlash) {
    sizeDisplay = flashSizeStr || '';
  } else {
    const w = isBooking ? (booking.width_cm || matchingEst?.width_cm) : estimate.width_cm;
    const h = isBooking ? (booking.height_cm || matchingEst?.height_cm) : estimate.height_cm;
    sizeDisplay = formatTattooSize(w, h);
  }

  // 6. Resolve Appointment Date & Time
  let appointmentDisplay = '';
  if (isFlash) {
    if (flashRes.requested_date) {
      const timeStr = flashRes.requested_start_time ? `${flashRes.requested_start_time.slice(0, 5)} น.` : '';
      appointmentDisplay = timeStr
        ? `${formatThaiDate(flashRes.requested_date)} · ${timeStr}`
        : formatThaiDate(flashRes.requested_date);
    } else {
      appointmentDisplay = formatThaiDate(flashRes.created_at);
    }
  } else if (isBooking) {
    const nextSession = booking.sessions && booking.sessions.length > 0
      ? (booking.sessions.find((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS') || booking.sessions[0])
      : null;
    if (nextSession) {
      const timeStr = formatTimeBangkok(nextSession.start_at);
      appointmentDisplay = timeStr && timeStr !== '-'
        ? `${formatThaiDate(nextSession.start_at)} · ${timeStr}`
        : formatThaiDate(nextSession.start_at);
    } else if (booking.requested_date) {
      const timeStr = booking.requested_start_time ? formatTimeBangkok(booking.requested_start_time) : '';
      appointmentDisplay = timeStr && timeStr !== '-'
        ? `${formatThaiDate(booking.requested_date)} · ${timeStr}`
        : formatThaiDate(booking.requested_date);
    } else {
      appointmentDisplay = 'ไม่ระบุวันนัด';
    }
  } else {
    const rawTime = estimate.preferred_time || (estimate as any).preferredTime;
    let timeLabel: string | null = null;
    if (rawTime) {
      const hhmm = extractHHMM(rawTime) || rawTime;
      timeLabel = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
    } else {
      const { extractedTime } = parseNoteWithPreferredTime(estimate.description);
      timeLabel = extractedTime;
    }
    appointmentDisplay = estimate.preferred_date
      ? (timeLabel ? `${formatThaiDate(estimate.preferred_date)} · ${timeLabel}` : formatThaiDate(estimate.preferred_date))
      : formatThaiDate(estimate.created_at);
  }

  const isInactive = ['EXPIRED', 'CANCELLED', 'REJECTED'].includes(displayStatus) || ['EXPIRED', 'CANCELLED', 'REJECTED'].includes(item.status);

  return (
    <div
      onClick={onClick}
      className={
        isInactive
          ? "bg-zinc-950/40 border border-zinc-800/80 hover:border-zinc-700 p-4 rounded-[6px] transition-all duration-200 cursor-pointer flex justify-between items-center group opacity-85"
          : "bg-studio-card border border-studio-border hover:border-studio-red/40 p-4 rounded-[6px] transition-all duration-200 cursor-pointer flex justify-between items-center group"
      }
    >
      <div className="flex items-center space-x-3.5 flex-1 min-w-0">
        {/* Reference Image Thumbnail */}
        <div className={
          isInactive
            ? "w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-[4px] overflow-hidden shrink-0 grayscale contrast-75 opacity-70"
            : "w-14 h-14 bg-studio-main border border-studio-border rounded-[4px] overflow-hidden shrink-0"
        }>
          <CustomerReferenceImage
            src={previewImage}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* Row 1: Main Title + ID + Status Badge (+ Deposit Badge) */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            {isFlash && (
              <span className={
                isInactive
                  ? "text-[10px] bg-zinc-900 text-zinc-400 border border-zinc-800 px-1.5 py-0.5 rounded font-medium shrink-0"
                  : "text-[10px] bg-studio-red/20 text-studio-red border border-studio-red/50 px-1.5 py-0.5 rounded font-bold shrink-0"
              }>
                จองลาย Flash
              </span>
            )}
            <h4 className={isInactive ? "text-xs font-semibold text-zinc-300 truncate" : "text-xs font-bold text-studio-primary truncate"}>
              {mainTitle}
            </h4>
            <span className={isInactive ? "text-[10px] text-zinc-500 font-mono" : "text-[10px] text-studio-muted font-mono"}>
              #{item.id.slice(0, 8)}
            </span>
            <BookingStatusBadge status={displayStatus as any} type={type === 'flash' ? 'booking' : type} />
            {Boolean((item as any).is_date_proposed) && (
              <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-700/80 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 shrink-0 animate-pulse">
                <CalendarClock size={11} />
                <span>เลือกรอบนัดหมาย</span>
              </span>
            )}
            {displayStatus === 'WAITING_DEPOSIT' && deadlineInfo && !deadlineInfo.isExpired && (
              <span className="text-[10px] bg-[#D9A441]/10 border border-[#D9A441]/45 text-[#D9A441] px-1.5 py-0.2 rounded font-semibold font-mono">
                เหลือ {deadlineInfo.remainingText}
              </span>
            )}
          </div>

          {/* Row 2: Job Summary (Artist · Placement · Size) */}
          <div className={isInactive ? "text-[11px] text-zinc-400 truncate" : "text-[11px] text-studio-secondary truncate"}>
            {isFlash
              ? [artistDisplayName, flashPlacementStr, flashSizeStr].filter(Boolean).join(' · ')
              : `${artistDisplayName} · ${placementDisplay} · ${sizeDisplay}`}
          </div>


          {/* Row 3: Appointment (Date · Time) */}
          <div className={isInactive ? "flex items-center space-x-1.5 text-[11px] text-zinc-400" : "flex items-center space-x-1.5 text-[11px] text-studio-secondary"}>
            <Calendar size={12} className={isInactive ? "text-zinc-500 shrink-0" : "text-studio-red shrink-0"} />
            <span className="truncate">{appointmentDisplay}</span>
            {isBooking && booking.sessions && booking.sessions.length > 1 && (
              <span className={isInactive ? "flex items-center space-x-1 text-zinc-500 ml-1.5 shrink-0" : "flex items-center space-x-1 text-[#C9A86A] ml-1.5 shrink-0"}>
                <Layers size={11} />
                <span>({booking.sessions.length} รอบ)</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chevron Right Icon */}
      <ChevronRight size={16} className={isInactive ? "text-zinc-600 group-hover:text-zinc-400 transition-colors ml-4 shrink-0" : "text-studio-muted group-hover:text-studio-red transition-colors ml-4 shrink-0"} />
    </div>
  );
}
