'use client';

import React, { useMemo, useCallback } from 'react';
import { TriangleAlert, ChevronRight, Eye, Image as ImageIcon, Sparkles } from 'lucide-react';
import { CalendarSessionEvent } from './types';
import { BookingItem } from '@/components/admin/requests/types';
import { getActiveQueueSessionDateTime } from '@/components/admin/requests/bookingHydration';
import { formatDateBangkok, formatTimeBangkok } from './calendarUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

interface AdminQueueTableViewProps {
  events?: CalendarSessionEvent[];
  bookings?: BookingItem[];
  searchQuery?: string;
  selectedArtistId?: string;
  selectedStatus?: string;
  onSelectEvent?: (ev: CalendarSessionEvent) => void;
  onOpenBookingDetail?: (bookingId: string) => void;
}

export default function AdminQueueTableView({
  events = [],
  bookings = [],
  searchQuery = '',
  selectedArtistId = 'ALL',
  selectedStatus = 'ALL',
  onSelectEvent,
  onOpenBookingDetail,
}: AdminQueueTableViewProps) {
  // Synthesize booking items list for 1 Row per Booking requirement
  const displayBookings = useMemo(() => {
    // 1. If explicit bookings array is provided from AdminMasterCalendar (loaded via fetchWorkQueueBookings)
    let list: BookingItem[] = [];

    if (bookings && bookings.length > 0) {
      list = [...bookings];
    } else if (events && events.length > 0) {
      // Fallback: group events by booking_id into synthetic BookingItem objects
      const map = new Map<string, BookingItem>();
      events.forEach((ev) => {
        if (!ev.booking_id) return;
        if (!map.has(ev.booking_id)) {
          const b = ev.booking;
          const est = ev.estimate;
          const cust = ev.customer;
          const art = ev.artist;

          const synthetic: BookingItem = {
            id: ev.booking_id,
            requested_date: b?.requested_date || null,
            status: b?.status || (ev.status === 'COMPLETED' ? 'COMPLETED' : 'CONFIRMED'),
            customer_name: cust?.display_name || 'ลูกค้า',
            artist_name: art ? (art.nickname ? `${art.name} (${art.nickname})` : art.name) : 'ช่างประจำร้าน',
            artwork_title: est?.description || (est?.work_type === 'FLASH' ? 'งานสัก Flash' : 'งานสัก Custom'),
            placement: est?.placement || undefined,
            width_cm: est?.width_cm || undefined,
            height_cm: est?.height_cm || undefined,
            style_preference: est?.style || undefined,
            created_at: ev.created_at,
            updated_at: ev.created_at,
            estimate_request_id: b?.estimate_request_id || null,
            artist_id: ev.artist_id || null,
            financial: {
              quoted_price: ev.financial?.quoted_price || est?.quoted_price || 0,
              deposit_required: ev.financial?.deposit_required || est?.deposit_required || 0,
              total_paid: ev.financial?.paid_total || 0,
              remaining_balance: ev.financial?.remaining_balance || 0,
              is_deposit_paid: ev.financial?.deposit_paid || false,
              is_fully_paid: ev.financial?.is_fully_paid || false,
            },
            sessions: events
              .filter((s) => s.booking_id === ev.booking_id)
              .map((s) => ({
                id: s.id,
                booking_id: s.booking_id,
                artist_id: s.artist_id,
                session_number: s.session_number,
                start_at: s.start_at,
                end_at: s.end_at,
                status: s.status,
                note: s.note,
                created_at: s.created_at,
                updated_at: s.created_at,
              })),
          };
          map.set(ev.booking_id, synthetic);
        }
      });
      list = Array.from(map.values());
    }

    // 2. Filter list based on top calendar filter states
    return list.filter((b) => {
      // Skip cancelled/rejected/expired from queue table by default unless explicitly filtered
      if (selectedStatus !== 'CANCELLED' && (b.status === 'CANCELLED' || b.status === 'REJECTED' || b.status === 'EXPIRED')) {
        return false;
      }

      // Artist Filter
      if (selectedArtistId !== 'ALL') {
        const matchesArtist =
          b.artist_id === selectedArtistId ||
          (b.sessions && b.sessions.some((s) => s.artist_id === selectedArtistId));
        if (!matchesArtist) return false;
      }

      // Status Filter
      if (selectedStatus !== 'ALL') {
        const isMultiSession = Boolean(
          (b.sessions && b.sessions.length > 1) ||
          (b.sessions && b.sessions.some((s) => (s.session_number || 1) >= 2))
        );
        const isCompleted = b.status === 'COMPLETED' || b.operational_status?.key === 'COMPLETED';
        const isCancelled =
          b.status === 'CANCELLED' ||
          b.status === 'REJECTED' ||
          b.status === 'EXPIRED' ||
          b.operational_status?.key === 'CANCELLED';

        if (selectedStatus === 'SCHEDULED') {
          if (isCancelled || isCompleted || isMultiSession) return false;
        } else if (selectedStatus === 'SESSIONS') {
          if (isCancelled || isCompleted || !isMultiSession) return false;
        } else if (selectedStatus === 'COMPLETED') {
          if (!isCompleted) return false;
        } else if (selectedStatus === 'CANCELLED') {
          if (!isCancelled) return false;
        }
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCustomer = b.customer_name?.toLowerCase().includes(q);
        const matchArtist = b.artist_name?.toLowerCase().includes(q) || b.artist_nickname?.toLowerCase().includes(q);
        const matchId = b.id?.toLowerCase().includes(q);
        const matchTitle = b.artwork_title?.toLowerCase().includes(q);
        const matchStyle = b.style_preference?.toLowerCase().includes(q);
        if (!matchCustomer && !matchArtist && !matchId && !matchTitle && !matchStyle) {
          return false;
        }
      }

      return true;
    });
  }, [bookings, events, selectedArtistId, selectedStatus, searchQuery]);

  // Health Alert Renderer (matching Admin Requests Queue)
  const renderHealthAlertBadge = (b: BookingItem) => {
    const hasMed = b.has_medical_condition;
    const hasAll = b.has_allergy;

    const isAlert = hasMed === true || hasAll === true;
    const isHealthy = hasMed === false && hasAll === false;

    if (isAlert) {
      return (
        <span
          title="มีข้อมูลสุขภาพ กรุณาตรวจสอบรายละเอียดก่อนให้บริการ"
          className="bg-[#2A1212] text-[#E8B4B4] border border-[#9C2F2F] px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-help"
        >
          <TriangleAlert size={11} className="text-[#E8B4B4] shrink-0" />
          <span>มีข้อมูล</span>
        </span>
      );
    }

    if (isHealthy) {
      return (
        <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center">
          ปกติ
        </span>
      );
    }

    return (
      <span className="bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center">
        ไม่ระบุ
      </span>
    );
  };

  // Status Badge Renderer (matching Admin Requests Queue classifier)
  const renderStatusBadge = (b: BookingItem) => {
    const isDirectBooking = b.booking_source === 'ADMIN_CALENDAR' || (b as any).request_type === 'DIRECT_BOOKING';

    if (
      (b.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || b.has_pending_payment_submission) &&
      b.id
    ) {
      return (
        <div className="flex items-center gap-1">
          {isDirectBooking && (
            <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
              สร้างโดยแอดมิน
            </span>
          )}
          <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center animate-pulse">
            สลิปรอตรวจ
          </span>
        </div>
      );
    }

    const isMultiSession = Boolean(
      (b.sessions && b.sessions.length > 1) ||
      (b.sessions && b.sessions.some((s) => (s.session_number || 1) >= 2))
    );
    const isCompleted = b.status === 'COMPLETED' || b.operational_status?.key === 'COMPLETED';
    const isCancelled = b.status === 'CANCELLED' || b.status === 'REJECTED' || b.status === 'EXPIRED' || b.operational_status?.key === 'CANCELLED';

    if (isCompleted) {
      return (
        <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded text-[10px] font-semibold">
          เสร็จสิ้น
        </span>
      );
    }

    if (isCancelled) {
      return (
        <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold">
          ยกเลิก
        </span>
      );
    }

    if (isMultiSession) {
      return (
        <div className="flex items-center gap-1">
          {isDirectBooking && (
            <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
              สร้างโดยแอดมิน
            </span>
          )}
          <span className="bg-teal-950/60 text-teal-400 border border-teal-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            รอบนัด
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1">
        {isDirectBooking && (
          <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
            สร้างโดยแอดมิน
          </span>
        )}
        <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
          นัดหมายแล้ว
        </span>
      </div>
    );
  };

  const handleRowClick = (b: BookingItem) => {
    if (onOpenBookingDetail) {
      onOpenBookingDetail(b.id);
    } else if (onSelectEvent && events.length > 0) {
      const ev = events.find((s) => s.booking_id === b.id);
      if (ev) onSelectEvent(ev);
    }
  };

  if (displayBookings.length === 0) {
    return (
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-8 sm:p-12 text-center shadow-lg font-prompt space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#221F1B] border border-[#4A443A] flex items-center justify-center mx-auto text-[#7A7265]">
          <Eye size={20} />
        </div>
        <h3 className="text-sm sm:text-base font-semibold text-[#ECE4D3]">ไม่พบคิวงานในตาราง</h3>
        <p className="text-xs text-[#7A7265] max-w-sm mx-auto">
          ลองปรับเปลี่ยนเงื่อนไขตัวกรองช่างสัก หรือข้อความค้นหาใหม่อีกครั้ง
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-3 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Desktop & Tablet Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs text-[#ECE4D3] border-collapse">
          <thead className="bg-[#0E0D0C] text-[#7A7265] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
            <tr>
              <th className="py-3.5 px-4 font-medium">รหัส / ลูกค้า</th>
              <th className="py-3.5 px-4 font-medium">งานที่จองและขนาด</th>
              <th className="py-3.5 px-4 font-medium">ช่างสัก / สไตล์</th>
              <th className="py-3.5 px-4 font-medium">วันและเวลานัดหมาย</th>
              <th className="py-3.5 px-4 font-medium text-center">แจ้งเตือนสุขภาพ</th>
              <th className="py-3.5 px-4 font-medium text-center">สถานะ</th>
              <th className="py-3.5 px-4 font-medium text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#4A443A]/50 font-prompt">
            {displayBookings.map((b) => {
              const { displayDate, displayTime } = getActiveQueueSessionDateTime(b);
              const timeFormatted = displayTime
                ? displayTime.length >= 5
                  ? displayTime.slice(0, 5)
                  : displayTime
                : null;

              // Format work title & size details
              const artworkTitle =
                b.artwork_title ||
                (b.flash_reservation_id ? 'งานสัก Flash' : 'งานสัก Custom');
              const placementStr = b.placement ? b.placement : null;
              const dimStr =
                b.width_cm && b.height_cm ? `${b.width_cm} × ${b.height_cm} ซม.` : null;
              const sizeLabelStr = b.size_label || b.estimated_size_tier || null;

              const detailsList = [placementStr, sizeLabelStr, dimStr].filter(Boolean);
              const detailsText = detailsList.join(' · ');

              const isFlash = Boolean(
                b.flash_reservation_id ||
                b.work_type === 'FLASH' ||
                (b as any).request_type === 'FLASH'
              );

              // Trace & resolve thumbnail image URL (Custom or Flash reference image)
              const flashDesignObj = b.flash_reservation?.flash_design || (b.flash_reservation as any)?.flash_designs;
              const thumbnailUrl =
                b.artwork_image_url ||
                (Array.isArray(b.reference_images) && b.reference_images.length > 0 ? b.reference_images[0] : null) ||
                flashDesignObj?.image_url ||
                (b.flash_reservation as any)?.flash_design_image_url ||
                null;

              const artistDisplayName =
                b.artist_name ||
                (b.artist_nickname ? `ช่าง${b.artist_nickname}` : 'ช่างประจำร้าน');
              const styleStr = b.style_preference || 'Custom';

              return (
                <tr
                  key={b.id}
                  onClick={() => handleRowClick(b)}
                  className="hover:bg-[#1F1D1A]/80 transition-colors group cursor-pointer"
                >
                  {/* Column 1: รหัส / ลูกค้า */}
                  <td className="py-3.5 px-4 text-[#ECE4D3]">
                    <span className="text-[10px] text-[#7A7265] font-mono block font-semibold">
                      #{b.id.slice(0, 8).toUpperCase()}
                    </span>
                    <div className="font-semibold text-xs text-[#ECE4D3] mt-0.5">
                      {b.customer_name || 'ไม่ระบุชื่อ'}
                    </div>
                  </td>

                  {/* Column 2: งานที่จองและขนาด */}
                  <td className="py-3.5 px-4 text-[#ECE4D3] max-w-[260px]">
                    <div className="flex items-center gap-3">
                      {thumbnailUrl ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#4A443A] shrink-0 bg-[#0E0D0C]">
                          <CustomerReferenceImage
                            src={thumbnailUrl}
                            alt={artworkTitle}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-[#4A443A] shrink-0 bg-[#0E0D0C] flex items-center justify-center text-[#7A7265]">
                          {isFlash ? (
                            <Sparkles size={16} className="text-amber-400/80" />
                          ) : (
                            <ImageIcon size={16} />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-xs text-[#ECE4D3] truncate">{artworkTitle}</div>
                        {detailsText ? (
                          <div className="text-[11px] text-[#A89F91] truncate mt-0.5">{detailsText}</div>
                        ) : (
                          <div className="text-[11px] text-[#7A7265] truncate mt-0.5">ไม่ได้ระบุขนาด</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Column 3: ช่างสัก / สไตล์ */}
                  <td className="py-3.5 px-4 text-[#A89F91]">
                    <div className="font-medium text-xs text-[#ECE4D3]">{artistDisplayName}</div>
                    <div className="text-[11px] text-[#7A7265] mt-0.5">{styleStr}</div>
                  </td>

                  {/* Column 4: วันและเวลานัดหมาย */}
                  <td className="py-3.5 px-4 text-[#ECE4D3]">
                    <div className="font-medium text-xs text-[#ECE4D3]">
                      {displayDate ? formatDateBangkok(displayDate) : 'ไม่ได้ระบุ'}
                    </div>
                    {timeFormatted ? (
                      <div className="text-[11px] text-amber-400 font-mono mt-0.5">
                        {timeFormatted} น.
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#7A7265] font-mono mt-0.5">
                        ไม่ได้ระบุเวลา
                      </div>
                    )}
                  </td>

                  {/* Column 5: แจ้งเตือนสุขภาพ */}
                  <td className="py-3.5 px-4 text-center">
                    {renderHealthAlertBadge(b)}
                  </td>

                  {/* Column 6: สถานะ */}
                  <td className="py-3.5 px-4 text-center">
                    {renderStatusBadge(b)}
                  </td>

                  {/* Column 7: การจัดการ */}
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(b);
                      }}
                      className="px-3 py-1.5 text-xs bg-[#1F1D1A] group-hover:bg-[#2A2723] text-[#ECE4D3] border border-[#4A443A] hover:border-[#7A7265] rounded-lg transition-colors font-medium inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <span>รายละเอียด</span>
                      <ChevronRight size={13} className="text-[#A89F91]" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Compact Card List (Matching Admin Requests Queue 1:1) */}
      <div className="md:hidden space-y-3 font-prompt">
        {displayBookings.map((b) => {
          const isInactive = b.status === 'CANCELLED' || b.status === 'REJECTED' || b.status === 'EXPIRED';
          const { displayDate, displayTime } = getActiveQueueSessionDateTime(b);
          const dateDisplay = displayDate ? formatDateBangkok(displayDate, true) : 'ไม่ระบุวัน';
          
          let timeDisplay = '';
          if (displayTime) {
            if (displayTime.includes('T')) {
              timeDisplay = formatTimeBangkok(displayTime);
            } else {
              const clean = displayTime.replace(' น.', '').trim();
              const parts = clean.split(':');
              timeDisplay = parts.length >= 2 ? `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')} น.` : displayTime;
            }
          }

          const placementText = b.placement || 'ไม่ระบุตำแหน่ง';
          const sizeText = formatTattooSize(b.width_cm, b.height_cm, b.size_label || b.estimated_size_tier);
          const placementAndSize = sizeText !== 'ไม่ระบุขนาด'
            ? `${placementText} • ${sizeText}`
            : `${placementText} • ไม่ระบุขนาด`;

          const styleText = b.style_preference || (b as any).style || 'ไม่ระบุสไตล์';
          const artistAndStyle = `${b.artist_name || (b.artist_nickname ? `ช่าง${b.artist_nickname}` : 'ยังไม่มอบหมายช่าง')} · ${styleText}`;

          return (
            <div
              key={b.id}
              onClick={() => handleRowClick(b)}
              className={
                isInactive
                  ? 'bg-zinc-950/40 border border-zinc-800/70 rounded-xl p-3.5 space-y-2.5 shadow opacity-85 cursor-pointer'
                  : 'bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-xl p-3.5 space-y-2.5 shadow cursor-pointer active:scale-[0.99] transition-all'
              }
            >
              {/* Top Header: ID (#9C2F2F), Health Badge & Status */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-mono font-bold ${isInactive ? 'text-zinc-500' : 'text-[#9C2F2F]'}`}>
                  #{b.id.slice(0, 8).toUpperCase()}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {renderHealthAlertBadge(b)}
                  {renderStatusBadge(b)}
                </div>
              </div>

              {/* Info Row: Date & Customer */}
              <div className="flex items-center justify-between text-xs border-y border-[#4A443A]/40 py-2 my-1">
                <div>
                  <span className="text-[10px] text-[#7A7265] block font-medium">วัน/เวลานัดหมาย</span>
                  <span className="font-semibold text-[#ECE4D3]">
                    {dateDisplay} {timeDisplay}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#7A7265] block font-medium">ลูกค้า</span>
                  <span className="font-semibold text-[#ECE4D3]">{b.customer_name || 'ไม่ระบุชื่อ'}</span>
                </div>
              </div>

              {/* Bottom Row: Artist/Style, Placement/Size & Action Button */}
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-[#7A7265] block font-medium">ช่างสัก / สไตล์ • ตำแหน่งและขนาด</span>
                  <p className="font-medium text-[#ECE4D3] truncate">
                    {artistAndStyle}
                  </p>
                  <p className="text-[11px] text-[#A89F91] truncate">
                    {placementAndSize}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 self-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(b);
                    }}
                    className={
                      isInactive
                        ? "text-xs font-medium text-zinc-400 hover:text-zinc-300 flex items-center gap-0.5 cursor-pointer"
                        : "text-xs font-medium text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-0.5 cursor-pointer"
                    }
                  >
                    <span>ดูรายละเอียด</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
