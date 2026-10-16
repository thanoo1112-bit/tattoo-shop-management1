'use client';

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { TriangleAlert, ChevronRight, Eye, Image as ImageIcon, Sparkles } from 'lucide-react';
import { CalendarSessionEvent } from './types';
import { BookingItem } from '@/components/admin/requests/types';
import { getActiveQueueSessionDateTime } from '@/components/admin/requests/bookingHydration';
import { formatDateBangkok, formatTimeBangkok, resolveBookingCalendarStatus } from './calendarUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import {
  getPendingRescheduleRequest,
  isRescheduleRequestUiEnabled,
  subscribeRescheduleRequests,
} from '@/lib/reschedule/rescheduleRequestStore';

interface AdminQueueTableViewProps {
  events?: CalendarSessionEvent[];
  bookings?: BookingItem[];
  searchQuery?: string;
  selectedArtistId?: string;
  selectedStatus?: string;
  selectedDateStr?: string;
  onStatusChange?: (status: string) => void;
  onSelectEvent?: (ev: CalendarSessionEvent) => void;
  onOpenBookingDetail?: (bookingId: string) => void;
}

export default function AdminQueueTableView({
  events = [],
  bookings = [],
  searchQuery = '',
  selectedArtistId = 'ALL',
  selectedStatus = 'ALL',
  selectedDateStr,
  onStatusChange,
  onSelectEvent,
  onOpenBookingDetail,
}: AdminQueueTableViewProps) {
  const [, setRescheduleTick] = useState(0);

  useEffect(() => {
    if (!isRescheduleRequestUiEnabled()) return;
    return subscribeRescheduleRequests(() => {
      setRescheduleTick((t) => t + 1);
    });
  }, []);

  // Target YYYY-MM from selectedDateStr
  const targetYearMonth = useMemo(() => {
    return selectedDateStr ? selectedDateStr.slice(0, 7) : null;
  }, [selectedDateStr]);

  // Synthesize booking items list for 1 Row per Booking requirement
  const rawBookings = useMemo(() => {
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

    return list;
  }, [bookings, events]);

  // Month Bookings: filtered by artist and active session month (before status & search query)
  const monthBookings = useMemo(() => {
    return rawBookings.filter((b) => {
      // Skip rejected/expired from queue table by default
      if (b.status === 'REJECTED' || b.status === 'EXPIRED') {
        return false;
      }

      // Artist Filter
      if (selectedArtistId !== 'ALL') {
        const matchesArtist =
          b.artist_id === selectedArtistId ||
          (b.sessions && b.sessions.some((s) => s.artist_id === selectedArtistId));
        if (!matchesArtist) return false;
      }

      // Month Filter: based on active/relevant session date (or requested_date fallback)
      if (targetYearMonth) {
        const { displayDate } = getActiveQueueSessionDateTime(b);
        if (!displayDate || !displayDate.startsWith(targetYearMonth)) {
          return false;
        }
      }

      return true;
    });
  }, [rawBookings, selectedArtistId, targetYearMonth]);

  // Status counts for the selected month
  const monthStatusCounts = useMemo(() => {
    let all = monthBookings.length;
    let scheduled = 0;
    let completed = 0;
    let cancelled = 0;

    monthBookings.forEach((b) => {
      const overallStatus = resolveBookingCalendarStatus(b.sessions, b.status);
      const isCompleted = overallStatus === 'COMPLETED';
      const isCancelled =
        overallStatus === 'CANCELLED' ||
        overallStatus === 'REJECTED' ||
        overallStatus === 'EXPIRED' ||
        b.status === 'CANCELLED' ||
        b.operational_status?.key === 'CANCELLED';

      if (isCompleted) {
        completed++;
      } else if (isCancelled) {
        cancelled++;
      } else if (overallStatus === 'SCHEDULED' || overallStatus === 'IN_PROGRESS') {
        scheduled++;
      }
    });

    return { all, scheduled, completed, cancelled };
  }, [monthBookings]);

  // Filter list based on top calendar status filter and search query
  const displayBookings = useMemo(() => {
    return monthBookings.filter((b) => {
      // Status Filter
      if (selectedStatus !== 'ALL') {
        const overallStatus = resolveBookingCalendarStatus(b.sessions, b.status);
        const isCompleted = overallStatus === 'COMPLETED';
        const isCancelled =
          overallStatus === 'CANCELLED' ||
          overallStatus === 'REJECTED' ||
          overallStatus === 'EXPIRED' ||
          b.status === 'CANCELLED' ||
          b.operational_status?.key === 'CANCELLED';

        if (selectedStatus === 'SCHEDULED' || selectedStatus === 'SESSIONS') {
          if (overallStatus !== 'SCHEDULED' && overallStatus !== 'IN_PROGRESS') return false;
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
  }, [monthBookings, selectedStatus, searchQuery]);

  // Health Alert Renderer (matching Admin Requests Queue)
  const renderHealthAlertBadge = (b: BookingItem) => {
    const hasMed = b.has_medical_condition;
    const hasAll = b.has_allergy;

    const isAlert = hasMed === true || hasAll === true;
    const isHealthy = hasMed === false && hasAll === false;

    const overallStatus = resolveBookingCalendarStatus(b.sessions, b.status);
    const isTerminal = overallStatus === 'COMPLETED' || overallStatus === 'CANCELLED' || overallStatus === 'EXPIRED' || overallStatus === 'REJECTED' ||
      b.status === 'COMPLETED' || b.status === 'CANCELLED' || b.status === 'EXPIRED' || b.status === 'REJECTED';

    // CANCELLED queues: still render real health badge, but in Neutral Gray (display only)
    const isCancelled = overallStatus === 'CANCELLED' || b.status === 'CANCELLED';
    const cancelledNeutralClass = "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1";

    if (isCancelled) {
      if (isAlert) {
        return (
          <span title="มีข้อมูลสุขภาพ (คิวถูกยกเลิก)" className={`${cancelledNeutralClass} cursor-help`}>
            <TriangleAlert size={11} className="text-zinc-500 shrink-0" />
            <span>มีข้อมูล</span>
          </span>
        );
      }
      return <span className={cancelledNeutralClass}>{isHealthy ? 'ปกติ' : 'ไม่ระบุ'}</span>;
    }

    if (isAlert) {
      // Health alert stays Amber for SCHEDULED / IN_PROGRESS / COMPLETED
      return (
        <span
          title="มีข้อมูลสุขภาพ กรุณาตรวจสอบรายละเอียดก่อนให้บริการ"
          className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-help"
        >
          <TriangleAlert size={11} className="text-amber-400 shrink-0" />
          <span>มีข้อมูล</span>
        </span>
      );
    }

    if (isHealthy) {
      return (
        <span className={isTerminal ? "bg-zinc-900/60 text-zinc-500 border border-zinc-800/80 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center" : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center"}>
          ปกติ
        </span>
      );
    }

    return (
      <span className={isTerminal ? "bg-zinc-900/60 text-zinc-500 border border-zinc-800/80 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center" : "bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center"}>
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

    const overallStatus = resolveBookingCalendarStatus(b.sessions, b.status);

    if (overallStatus === 'CANCELLED' || overallStatus === 'REJECTED' || overallStatus === 'EXPIRED' || b.status === 'CANCELLED') {
      return (
        <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold">
          {overallStatus === 'EXPIRED' || b.status === 'EXPIRED' ? 'หมดเวลาชำระมัดจำ' : overallStatus === 'REJECTED' || b.status === 'REJECTED' ? 'ปฏิเสธ' : 'ยกเลิก'}
        </span>
      );
    }

    if (overallStatus === 'IN_PROGRESS') {
      return (
        <div className="flex items-center gap-1">
          {isDirectBooking && (
            <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
              สร้างโดยแอดมิน
            </span>
          )}
          <span className="bg-[#9C2F2F]/20 text-[#D64545] border border-[#9C2F2F]/60 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D64545] animate-pulse" />
            กำลังสัก
          </span>
        </div>
      );
    }

    if (overallStatus === 'COMPLETED') {
      return (
        <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded text-[10px] font-semibold">
          งานเสร็จสิ้น
        </span>
      );
    }

    const hasPendingReschedule = Boolean(
      b.id && isRescheduleRequestUiEnabled() && getPendingRescheduleRequest(b.id)
    );

    if (hasPendingReschedule) {
      return (
        <div className="flex items-center gap-1">
          {isDirectBooking && (
            <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
              สร้างโดยแอดมิน
            </span>
          )}
          <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded text-[10px] font-semibold">
            ขอเลื่อนนัด
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
        <span className="bg-sky-500/15 text-sky-300 border border-sky-400/40 px-2 py-0.5 rounded text-[10px] font-semibold">
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

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-3 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Status Filter Tabs / Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {[
          { id: 'ALL', label: `ทั้งหมด (${monthStatusCounts.all})` },
          { id: 'SCHEDULED', label: `นัดหมายแล้ว (${monthStatusCounts.scheduled})` },
          { id: 'COMPLETED', label: `งานเสร็จสิ้น (${monthStatusCounts.completed})` },
          { id: 'CANCELLED', label: `ยกเลิก (${monthStatusCounts.cancelled})` },
        ].map((pill) => {
          const isSelected = selectedStatus === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => onStatusChange && onStatusChange(pill.id)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors border shrink-0 cursor-pointer ${
                isSelected
                  ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3] shadow'
                  : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3] hover:border-[#7A7265]'
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {displayBookings.length === 0 ? (
        <div className="bg-[#0E0D0C]/40 border border-dashed border-[#4A443A]/60 rounded-xl p-8 sm:p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#221F1B] border border-[#4A443A] flex items-center justify-center mx-auto text-[#7A7265]">
            <Eye size={20} />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-[#ECE4D3]">ไม่พบคิวงานในเดือนนี้</h3>
          <p className="text-xs text-[#B8B0A3] max-w-sm mx-auto">
            ลองเปลี่ยนเดือนด้วยปุ่มลูกศร &lt; &gt; หรือปรับเปลี่ยนเงื่อนไขตัวกรอง
          </p>
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table View */}
          <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs text-[#ECE4D3] border-collapse">
          <thead className="bg-[#0E0D0C] text-[#B8B0A3] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
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
                    <span className="text-[10px] text-[#B8B0A3] font-mono block font-semibold">
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
                        <div className="w-10 h-10 rounded-lg border border-[#4A443A] shrink-0 bg-[#0E0D0C] flex items-center justify-center text-[#B8B0A3]">
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
                          <div className="text-[11px] text-[#B8B0A3] truncate mt-0.5">{detailsText}</div>
                        ) : (
                          <div className="text-[11px] text-[#B8B0A3] truncate mt-0.5">ไม่ได้ระบุขนาด</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Column 3: ช่างสัก / สไตล์ */}
                  <td className="py-3.5 px-4 text-[#ECE4D3]">
                    <div className="font-medium text-xs text-[#ECE4D3]">{artistDisplayName}</div>
                    <div className="text-[11px] text-[#B8B0A3] mt-0.5">{styleStr}</div>
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
                      <div className="text-[11px] text-[#B8B0A3] font-mono mt-0.5">
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
                      <ChevronRight size={13} className="text-[#B8B0A3]" />
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
                  <span className="text-[10px] text-[#B8B0A3] block font-medium">วัน/เวลานัดหมาย</span>
                  <span className="font-semibold text-[#ECE4D3]">
                    {dateDisplay} {timeDisplay}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#B8B0A3] block font-medium">ลูกค้า</span>
                  <span className="font-semibold text-[#ECE4D3]">{b.customer_name || 'ไม่ระบุชื่อ'}</span>
                </div>
              </div>

              {/* Bottom Row: Artist/Style, Placement/Size & Action Button */}
              <div className="flex items-center justify-between text-xs gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-[#B8B0A3] block font-medium">ช่างสัก / สไตล์ • ตำแหน่งและขนาด</span>
                  <p className="font-medium text-[#ECE4D3] truncate">
                    {artistAndStyle}
                  </p>
                  <p className="text-[11px] text-[#B8B0A3] truncate">
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
                        : "text-xs font-medium text-[#B8B0A3] hover:text-[#ECE4D3] flex items-center gap-0.5 cursor-pointer"
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
      </>
      )}
    </div>
  );
}
