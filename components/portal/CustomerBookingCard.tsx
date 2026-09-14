'use client';

import React from 'react';
import { CustomerPortalBooking, CustomerPortalEstimate } from './types';
import BookingStatusBadge from './BookingStatusBadge';
import { Calendar, User, ChevronRight, Layers } from 'lucide-react';
import { formatThaiDate, formatTimeBangkok, resolveCustomerDisplayStatus } from './portalUtils';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';

interface CustomerBookingCardProps {
  item: CustomerPortalBooking | CustomerPortalEstimate;
  type: 'estimate' | 'booking';
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
  const booking = item as CustomerPortalBooking;
  const estimate = item as CustomerPortalEstimate;

  const hasPendingSlip = Boolean((item as any).has_pending_payment_submission);
  const displayStatus = resolveCustomerDisplayStatus(item.status, hasPendingSlip);

  // Matching Estimate for fallback lookup
  const matchingEst = isBooking
    ? estimates?.find((e) => e.id === booking.estimate_request_id)
    : null;

  // 1. Resolve Artist Name
  const artistDisplayName = item.artist?.nickname || item.artist?.name || 'ช่างสักประจำร้าน';

  // 2. Resolve Preview Image
  const previewImage = isBooking
    ? (booking.reference_images?.[0] || booking.artwork_image_url || matchingEst?.reference_images?.[0] || null)
    : (estimate.reference_images?.[0] || null);

  // 3. Resolve Tattoo Style & Main Title
  const rawStyle = isBooking
    ? (booking.style || matchingEst?.style)
    : estimate.style;

  const realStyle = (rawStyle && rawStyle !== 'Custom' && rawStyle !== 'CUSTOM') ? rawStyle : null;

  let mainTitle = '';
  if (realStyle) {
    mainTitle = `งานสัก ${realStyle}`;
  } else if (isBooking && booking.artwork_title && booking.artwork_title !== 'งานสัก Custom' && booking.artwork_title !== 'Custom') {
    mainTitle = booking.artwork_title;
  } else {
    mainTitle = isBooking ? 'งานสัก' : 'คำขอประเมินราคางานสัก';
  }

  // 4. Resolve Placement Display
  const rawPlacement = isBooking
    ? (booking.placement || matchingEst?.placement)
    : estimate.placement;
  const placementDisplay = rawPlacement && rawPlacement.trim() !== '' ? rawPlacement : 'ไม่ระบุตำแหน่ง';

  // 5. Resolve Size Display
  const w = isBooking ? (booking.width_cm || matchingEst?.width_cm) : estimate.width_cm;
  const h = isBooking ? (booking.height_cm || matchingEst?.height_cm) : estimate.height_cm;
  const sizeDisplay = (w && h) ? `${w} × ${h} ซม.` : 'ไม่ระบุขนาด';

  // 6. Resolve Appointment Date & Time
  const nextSession = isBooking && booking.sessions && booking.sessions.length > 0
    ? (booking.sessions.find((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS') || booking.sessions[0])
    : null;

  let appointmentDisplay = '';
  if (isBooking) {
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

  const depositRequired = isBooking
    ? booking.financial?.deposit_required
    : estimate.deposit_required;

  return (
    <div
      onClick={onClick}
      className="bg-studio-card border border-studio-border hover:border-studio-red/40 p-4 rounded-[6px] transition-all duration-200 cursor-pointer flex justify-between items-center group"
    >
      <div className="flex items-center space-x-3.5 flex-1 min-w-0">
        {/* Reference Image Thumbnail */}
        <div className="w-14 h-14 bg-studio-main border border-studio-border rounded-[4px] overflow-hidden shrink-0">
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
            <h4 className="text-xs font-bold text-studio-primary truncate">
              {mainTitle}
            </h4>
            <span className="text-[10px] text-studio-muted font-mono">
              #{item.id.slice(0, 8)}
            </span>
            <BookingStatusBadge status={displayStatus as any} type={type} />
            {displayStatus === 'WAITING_DEPOSIT' && depositRequired && depositRequired > 0 && (
              <span className="text-[10px] bg-[#D9A441]/10 border border-[#D9A441]/45 text-[#D9A441] px-1.5 py-0.2 rounded font-semibold">
                มัดจำ ฿{depositRequired.toLocaleString()}
              </span>
            )}
          </div>

          {/* Row 2: Job Summary (Artist · Placement · Size) */}
          <div className="text-[11px] text-studio-secondary truncate">
            {artistDisplayName} · {placementDisplay} · {sizeDisplay}
          </div>

          {/* Row 3: Appointment (Date · Time) */}
          <div className="flex items-center space-x-1.5 text-[11px] text-studio-secondary">
            <Calendar size={12} className="text-studio-red shrink-0" />
            <span className="truncate">{appointmentDisplay}</span>
            {isBooking && booking.sessions && booking.sessions.length > 1 && (
              <span className="flex items-center space-x-1 text-[#C9A86A] ml-1.5 shrink-0">
                <Layers size={11} />
                <span>({booking.sessions.length} รอบ)</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chevron Right Icon */}
      <ChevronRight size={16} className="text-studio-muted group-hover:text-studio-red transition-colors ml-4 shrink-0" />
    </div>
  );
}
