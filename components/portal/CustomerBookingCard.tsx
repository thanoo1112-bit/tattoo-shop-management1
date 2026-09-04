'use client';

import React from 'react';
import { CustomerPortalBooking, CustomerPortalEstimate } from './types';
import BookingStatusBadge from './BookingStatusBadge';
import { Calendar, User, ChevronRight, Layers } from 'lucide-react';
import { formatThaiDate, formatTimeBangkok } from './portalUtils';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

interface CustomerBookingCardProps {
  item: CustomerPortalBooking | CustomerPortalEstimate;
  type: 'estimate' | 'booking';
  onClick: () => void;
}

export default function CustomerBookingCard({ item, type, onClick }: CustomerBookingCardProps) {
  const isBooking = type === 'booking';
  const booking = item as CustomerPortalBooking;
  const estimate = item as CustomerPortalEstimate;

  const artistDisplayName = item.artist?.name
    ? `${item.artist.name}${item.artist.nickname ? ` (${item.artist.nickname})` : ''}`
    : 'ช่างสักประจำร้าน';

  // Preview Image
  const previewImage = isBooking
    ? booking.artwork_image_url || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=100'
    : estimate.reference_images?.[0] || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=100';

  // Title
  const title = isBooking
    ? booking.artwork_title || 'งานสัก Custom'
    : `คำขอขนาด ${estimate.width_cm}x${estimate.height_cm} ซม. (${estimate.style || 'Custom'})`;

  // Tag
  const tagLabel = isBooking
    ? `งานสัก ${booking.booking_source === 'FLASH' ? 'Flash' : 'Custom'}`
    : 'ขอประเมินราคา';

  // Booking Session date summary
  const nextSession = isBooking && booking.sessions && booking.sessions.length > 0
    ? booking.sessions.find(s => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS') || booking.sessions[0]
    : null;

  const displayDate = isBooking
    ? (nextSession ? formatThaiDate(nextSession.start_at) : formatThaiDate(booking.requested_date))
    : formatThaiDate(estimate.created_at);

  return (
    <div
      onClick={onClick}
      className="bg-studio-card border border-studio-border hover:border-studio-red/40 p-4 rounded-[6px] transition-all duration-200 cursor-pointer flex justify-between items-center group"
    >
      <div className="flex items-center space-x-3.5 flex-1 min-w-0">
        {/* Preview image */}
        <div className="w-14 h-14 bg-studio-main border border-studio-border rounded-[4px] overflow-hidden shrink-0">
          <CustomerReferenceImage
            src={previewImage}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] uppercase tracking-wider text-studio-red font-semibold">
              {tagLabel}
            </span>
            <BookingStatusBadge status={item.status as any} type={type} />
          </div>

          <h4 className="text-xs font-bold text-studio-primary mt-1 truncate">
            {title}
          </h4>

          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mt-2 text-[10px] text-studio-secondary">
            <span className="flex items-center space-x-1">
              <User size={12} className="text-studio-red" />
              <span>ช่าง: {artistDisplayName}</span>
            </span>

            <span className="flex items-center space-x-1">
              <Calendar size={12} className="text-studio-red" />
              <span>{isBooking ? `นัดหมาย: ${displayDate}` : `วันที่ส่ง: ${displayDate}`}</span>
            </span>

            {isBooking && booking.sessions && booking.sessions.length > 1 && (
              <span className="flex items-center space-x-1 text-[#C9A86A]">
                <Layers size={11} />
                <span>{booking.sessions.length} รอบสัก</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right chevron arrow */}
      <ChevronRight size={16} className="text-studio-muted group-hover:text-studio-red transition-colors ml-4 shrink-0" />
    </div>
  );
}
