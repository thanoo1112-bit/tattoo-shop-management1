'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CalendarSessionEvent,
  CalendarArtist,
  ViewMode,
} from './types';
import {
  getTodayBangkokStr,
  formatDateBangkok,
  getDateStrBangkok,
  getEffectiveEventStatus,
  THAI_MONTHS_FULL,
} from './calendarUtils';
import CalendarToolbar from './CalendarToolbar';
import CalendarFilters from './CalendarFilters';
import MonthCalendarView from './MonthCalendarView';
import WeekCalendarView from './WeekCalendarView';
import DayAgendaView from './DayAgendaView';
import CalendarSessionDetailDrawer from './CalendarSessionDetailDrawer';
import AvailabilityBlockModal, { BlockedDateItem } from './AvailabilityBlockModal';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import BookingDetailPanel from '@/components/admin/requests/BookingDetailPanel';
import PaymentSubmissionReviewDrawer from '@/components/admin/payments/PaymentSubmissionReviewDrawer';
import { BookingItem } from '@/components/admin/requests/types';
import { PaymentSubmissionDetail } from '@/components/admin/payments/types';
import { fetchWorkQueueBookings } from '@/components/admin/requests/bookingHydration';

export default function AdminMasterCalendar() {
  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArtistId, setSelectedArtistId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<CalendarSessionEvent | null>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<BookingItem | null>(null);
  const [selectedPaymentSub, setSelectedPaymentSub] = useState<PaymentSubmissionDetail | null>(null);

  // Data State
  const [artists, setArtists] = useState<CalendarArtist[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateItem[]>([]);
  const [sessions, setSessions] = useState<CalendarSessionEvent[]>([]);
  const [workQueueBookings, setWorkQueueBookings] = useState<BookingItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);



  // --------------------------------------------------------------------------
  // Data Fetching: Live Supabase Integration
  // --------------------------------------------------------------------------
  const loadCalendarData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();

      // 1. Fetch Active Artists, Blocked Dates, Sessions, Bookings, and Financials in Parallel
      const [artistsRes, blockedRes, sessionsRes, bookingsRes, financialsRes] = await Promise.all([
        supabase
          .from('artists')
          .select('id, name, nickname, avatar_url, is_active, working_days, specialties')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('artist_blocked_dates')
          .select('id, scope, artist_id, blocked_date, reason'),
        supabase
          .from('booking_sessions')
          .select('id, booking_id, artist_id, session_number, start_at, end_at, status, note, created_at, updated_at')
          .neq('status', 'CANCELLED')
          .order('start_at', { ascending: true }),
        supabase
          .from('bookings')
          .select(
            'id, status, customer_id, customer_user_id, artist_id, requested_date, requested_start_time, customer_note, admin_note, started_at, completed_at, created_at, estimate_request_id'
          )
          .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED")'),
        supabase
          .from('booking_financial_summary')
          .select('booking_id, total_price, total_paid, balance_due, deposit_amount, deposit_status, quoted_price, deposit_required, paid_total, remaining_balance, deposit_paid, is_fully_paid'),
      ]);

      if (artistsRes.error) throw artistsRes.error;
      setArtists((artistsRes.data as CalendarArtist[]) || []);
      setBlockedDates((blockedRes.data as BlockedDateItem[]) || []);

      if (sessionsRes.error) throw sessionsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;

      const rawSessions = sessionsRes.data || [];
      const bookingsData = bookingsRes.data || [];
      const financialsData = financialsRes.data || [];

      // Collect estimate_request_ids
      const estIds = Array.from(
        new Set(
          bookingsData
            .map((b) => b.estimate_request_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let estimatesMap = new Map<string, any>();
      if (estIds.length > 0) {
        const { data: estimatesData } = await supabase
          .from('estimate_requests')
          .select(
            'id, placement, style, width_cm, height_cm, reference_images, description, work_type, quoted_price, deposit_required'
          )
          .in('id', estIds);

        if (estimatesData) {
          estimatesMap = new Map(estimatesData.map((e) => [e.id, e]));
        }
      }

      // Collect customer_user_ids for customer lookup
      const customerUids = Array.from(
        new Set(
          bookingsData
            .map((b) => b.customer_user_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let customersMap = new Map<string, any>();
      if (customerUids.length > 0) {
        const { data: customersData } = await supabase
          .from('customers')
          .select('user_id, display_name, phone, email')
          .in('user_id', customerUids);

        if (customersData) {
          customersMap = new Map(customersData.map((c) => [c.user_id, c]));
        }
      }

      const financialsMap = new Map(financialsData.map((f) => [f.booking_id, f]));
      const artistsMap = new Map(
        (artistsRes.data || []).map((a) => [a.id, a])
      );

      // Group raw sessions by booking_id
      const sessionsByBookingMap = new Map<string, typeof rawSessions>();
      rawSessions.forEach((s) => {
        const list = sessionsByBookingMap.get(s.booking_id) || [];
        list.push(s);
        sessionsByBookingMap.set(s.booking_id, list);
      });

      const hydratedEvents: CalendarSessionEvent[] = [];

      // Process each booking to build unified calendar events
      bookingsData.forEach((b) => {
        // Skip any cancelled, rejected, or expired booking
        if (b.status === 'CANCELLED' || b.status === 'REJECTED' || b.status === 'EXPIRED') {
          return;
        }

        const bSessions = sessionsByBookingMap.get(b.id) || [];
        const hasSessionOne = bSessions.some((s) => s.session_number === 1);

        const parentFinancial = financialsMap.get(b.id) || null;
        const parentEstimate = b.estimate_request_id
          ? estimatesMap.get(b.estimate_request_id) || null
          : null;
        const customerInfo = b.customer_user_id
          ? customersMap.get(b.customer_user_id) || null
          : null;
        const artistInfo = b.artist_id ? artistsMap.get(b.artist_id) || null : null;

        const customerPayload = {
          user_id: b.customer_user_id || null,
          display_name: customerInfo?.display_name || 'ลูกค้า',
          phone: customerInfo?.phone || null,
          email: customerInfo?.email || null,
        };

        const artistPayload = artistInfo
          ? {
              id: artistInfo.id,
              name: artistInfo.name,
              nickname: artistInfo.nickname,
              avatar_url: artistInfo.avatar_url,
              is_active: artistInfo.is_active ?? true,
            }
          : null;

        // If NO session_number = 1 exists for this booking (New booking flow),
        // generate a Main Booking Event for Round 1 from requested_date & requested_start_time
        if (!hasSessionOne && b.requested_date) {
          const startTimeStr = b.requested_start_time ? String(b.requested_start_time).slice(0, 5) : '10:00';
          const [sh, sm] = startTimeStr.split(':').map(Number);
          const durMins = Number(parentEstimate?.estimated_duration_minutes) || 180;
          const endTotalMins = (sh || 10) * 60 + (sm || 0) + durMins;
          const eh = Math.min(23, Math.floor(endTotalMins / 60));
          const em = endTotalMins % 60;
          const endTimeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

          const startAtIso = `${b.requested_date}T${startTimeStr}:00+07:00`;
          const endAtIso = `${b.requested_date}T${endTimeStr}:00+07:00`;

          const sessionStatus = b.status === 'COMPLETED' ? 'COMPLETED' : b.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SCHEDULED';

          hydratedEvents.push({
            id: `main-${b.id}`,
            booking_id: b.id,
            artist_id: b.artist_id,
            session_number: 1,
            start_at: startAtIso,
            end_at: endAtIso,
            status: sessionStatus,
            note: b.admin_note || b.customer_note || null,
            created_at: b.created_at || new Date().toISOString(),
            booking: b,
            estimate: parentEstimate,
            customer: customerPayload,
            artist: artistPayload,
            financial: parentFinancial,
          });
        }

        // Hydrate all explicitly created sessions (session 1 for legacy, session 2+ for extra rounds)
        bSessions.forEach((s) => {
          const sessionArtistInfo = s.artist_id ? artistsMap.get(s.artist_id) || artistInfo : artistInfo;
          hydratedEvents.push({
            id: s.id,
            booking_id: s.booking_id,
            artist_id: s.artist_id,
            session_number: s.session_number,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
            note: s.note,
            created_at: s.created_at || new Date().toISOString(),
            booking: b,
            estimate: parentEstimate,
            customer: customerPayload,
            artist: sessionArtistInfo
              ? {
                  id: sessionArtistInfo.id,
                  name: sessionArtistInfo.name,
                  nickname: sessionArtistInfo.nickname,
                  avatar_url: sessionArtistInfo.avatar_url,
                  is_active: sessionArtistInfo.is_active ?? true,
                }
              : null,
            financial: parentFinancial,
          });
        });
      });

      setSessions(hydratedEvents);

      // Fetch Work Queue Bookings for Table View & Panel Management
      const workQueueRes = await fetchWorkQueueBookings(supabase);
      setWorkQueueBookings(workQueueRes.workQueueBookings);
      setSelectedBookingForDetail((prev) => {
        if (!prev) return null;
        return workQueueRes.workQueueBookings.find((b) => b.id === prev.id) || null;
      });
    } catch (err: any) {
      console.error('Error loading calendar data:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการโหลดตารางงาน');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpenCheckSlip = useCallback(async (bookingId: string) => {
    if (!bookingId) return;
    try {
      const supabase = createClient();
      const { data: sub, error } = await supabase
        .from('booking_payment_submissions')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('status', 'PENDING')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !sub) {
        alert('ไม่พบข้อมูลสลิปรอตรวจ');
        return;
      }

      const { data: b } = await supabase
        .from('bookings')
        .select('*, flash_reservations(*, flash_designs(*))')
        .eq('id', bookingId)
        .maybeSingle();

      const fr = Array.isArray(b?.flash_reservations) ? b.flash_reservations[0] : b?.flash_reservations;
      const fd = fr?.flash_designs;
      const isFlash = Boolean(b?.flash_reservation_id || fr);
      const flashResId = fr?.id || b?.flash_reservation_id || null;
      const flashCode = flashResId ? (flashResId.toUpperCase().startsWith('FLASH-') ? flashResId : `FLASH-${flashResId.slice(0, 8).toUpperCase()}`) : null;

      const subDetail: PaymentSubmissionDetail = {
        id: sub.id,
        booking_id: sub.booking_id,
        customer_user_id: sub.customer_user_id,
        claimed_amount: Number(sub.claimed_amount || 0),
        slip_path: sub.slip_path,
        reference_no: sub.reference_no,
        customer_note: sub.customer_note,
        status: sub.status,
        submitted_at: sub.submitted_at,
        created_at: sub.created_at,
        updated_at: sub.updated_at,
        customer_name: 'ลูกค้า',
        artist_name: 'ช่างสักประจำร้าน',
        booking_status: b?.status || 'WAITING_DEPOSIT',
        deposit_required: 500,
        paid_total: 0,
        outstanding_deposit: 500,
        flash_reservation_id: flashResId,
        flash_reservation_code: flashCode,
        artwork_title: fd?.title || b?.artwork_title || (isFlash ? 'งานสัก Flash' : 'งานสัก Custom'),
        artwork_image_url: fd?.image_url || b?.artwork_image_url || null,
        reference_images: fd?.image_url ? [fd.image_url] : (b?.reference_images || null),
        placement: fr?.placement || b?.placement || null,
        width_cm: fr?.width_cm || b?.width_cm || null,
        height_cm: fr?.height_cm || b?.height_cm || null,
        style: fd?.style || (isFlash ? 'Flash' : 'Custom'),
        description: fr?.customer_note || b?.description || null,
      };

      setSelectedPaymentSub(subDetail);
    } catch (err) {
      console.error('handleOpenCheckSlip error:', err);
      alert('เกิดข้อผิดพลาดในการดึงข้อมูลสลิป');
    }
  }, []);

  useEffect(() => {
    loadCalendarData();

    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (['bookings', 'booking_sessions', 'artist_blocked_dates', 'artists', 'customers'].includes(detail?.table)) {
        loadCalendarData();
      }
    };
    window.addEventListener('admin:realtime', handleRealtime);
    return () => window.removeEventListener('admin:realtime', handleRealtime);
  }, [loadCalendarData]);

  // --------------------------------------------------------------------------
  // Filtering & Search Pipeline
  // --------------------------------------------------------------------------
  const filteredSessions = useMemo(() => {
    return sessions.filter((ev) => {
      // 1. Artist Filter
      if (selectedArtistId !== 'ALL' && ev.artist_id !== selectedArtistId) {
        return false;
      }

      // 2. Status Filter
      if (selectedStatus !== 'ALL') {
        const effStatus = getEffectiveEventStatus(ev);
        if (selectedStatus === 'SCHEDULED' || selectedStatus === 'CONFIRMED') {
          if (effStatus !== 'CONFIRMED') return false;
        } else if (selectedStatus === 'WAITING_DEPOSIT') {
          if (effStatus !== 'WAITING_DEPOSIT') return false;
        } else if (selectedStatus === 'IN_PROGRESS') {
          if (effStatus !== 'IN_PROGRESS') return false;
        } else if (selectedStatus === 'COMPLETED') {
          if (effStatus !== 'COMPLETED') return false;
        } else if (selectedStatus === 'CANCELLED') {
          if (effStatus !== 'CANCELLED') return false;
        } else if (effStatus !== selectedStatus) {
          return false;
        }
      }

      // 3. Search Query (Customer display name or Artist name)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const custMatch = ev.customer?.display_name?.toLowerCase().includes(q);
        const artistMatch =
          ev.artist?.name?.toLowerCase().includes(q) ||
          ev.artist?.nickname?.toLowerCase().includes(q);
        if (!custMatch && !artistMatch) {
          return false;
        }
      }

      return true;
    });
  }, [sessions, selectedArtistId, selectedStatus, searchQuery]);

  // --------------------------------------------------------------------------
  // Date Navigation Helpers
  // --------------------------------------------------------------------------
  const handlePrevDate = () => {
    const d = new Date(selectedDateStr);
    if (viewMode === 'MONTH') {
      d.setMonth(d.getMonth() - 1);
    } else if (viewMode === 'WEEK') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setSelectedDateStr(d.toISOString().split('T')[0]);
  };

  const handleNextDate = () => {
    const d = new Date(selectedDateStr);
    if (viewMode === 'MONTH') {
      d.setMonth(d.getMonth() + 1);
    } else if (viewMode === 'WEEK') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setSelectedDateStr(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDateStr(todayStr);
  };

  // --------------------------------------------------------------------------
  // Title Label Calculation
  // --------------------------------------------------------------------------
  const titleLabel = useMemo(() => {
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    const yearBE = (y || 2026) + 543;
    const monthIndex = (m || 9) - 1;

    if (viewMode === 'MONTH') {
      return `${THAI_MONTHS_FULL[monthIndex]} ${yearBE}`;
    }

    if (viewMode === 'WEEK') {
      const cur = new Date(selectedDateStr);
      const dayOfWeek = cur.getDay();
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mon = new Date(cur);
      mon.setDate(cur.getDate() + diffToMon);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      const monStr = `${mon.getDate()} ${THAI_MONTHS_FULL[mon.getMonth()]}`;
      const sunStr = `${sun.getDate()} ${THAI_MONTHS_FULL[sun.getMonth()]} ${yearBE}`;
      return `${monStr} – ${sunStr}`;
    }

    return formatDateBangkok(selectedDateStr, true);
  }, [selectedDateStr, viewMode, workQueueBookings.length]);

  return (
    <div className="space-y-4">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#ECE4D3] tracking-tight">
            ปฏิทิน
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5">
            ดูวันและเวลานัดหมายของลูกค้า พร้อมติดตามรอบงานสักในระบบปฏิทิน
          </p>
        </div>
      </div>

      {/* 2. Toolbar (Date Nav, Title, View Switcher) */}
      <CalendarToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        titleLabel={titleLabel}
        onPrev={handlePrevDate}
        onNext={handleNextDate}
        onToday={handleToday}
        isToday={selectedDateStr === todayStr}
        onRefresh={loadCalendarData}
        isLoading={isLoading}
        onOpenBlockModal={() => setIsBlockModalOpen(true)}
      />

      {/* Success Alert */}
      {successMessage && (
        <div className="bg-emerald-950/60 border border-emerald-800/80 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-emerald-400 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. Filter & Search Controls (for Calendar Views) */}
      <CalendarFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        artists={artists}
        selectedArtistId={selectedArtistId}
        onArtistChange={setSelectedArtistId}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
      />

      {/* 5. Error Alert if any */}
      {errorMessage && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={loadCalendarData}
            className="px-3 py-1 bg-red-900/60 hover:bg-red-800/80 rounded text-xs font-semibold text-[#ECE4D3] transition-colors"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {/* 6. Calendar & Table Views */}
      {isLoading ? (
        <div className="bg-[#12100E] border border-[#4A443A]/40 rounded-xl p-12 text-center text-xs text-[#A89F91]">
          <div className="w-8 h-8 rounded-full border-2 border-[#9C2F2F] border-t-transparent animate-spin mx-auto mb-3" />
          <span>กำลังโหลดตารางงานจากฐานข้อมูล...</span>
        </div>
      ) : (
        <>
          {viewMode === 'MONTH' && (
            <MonthCalendarView
              currentDateStr={selectedDateStr}
              events={filteredSessions}
              artists={artists}
              blockedDates={blockedDates}
              selectedEvent={selectedEvent}
              onSelectDate={(date) => {
                setSelectedDateStr(date);
              }}
              onSelectEvent={setSelectedEvent}
              todayStr={todayStr}
            />
          )}

          {viewMode === 'WEEK' && (
            <WeekCalendarView
              selectedDateStr={selectedDateStr}
              events={filteredSessions}
              artists={artists}
              selectedEvent={selectedEvent}
              onSelectDate={(date) => {
                setSelectedDateStr(date);
                setViewMode('DAY');
              }}
              onSelectEvent={setSelectedEvent}
              todayStr={todayStr}
            />
          )}

          {viewMode === 'DAY' && (
            <DayAgendaView
              selectedDateStr={selectedDateStr}
              events={filteredSessions.filter(
                (s) => getDateStrBangkok(s.start_at) === selectedDateStr
              )}
              onSelectDate={setSelectedDateStr}
              onSelectEvent={setSelectedEvent}
              todayStr={todayStr}
            />
          )}
        </>
      )}

      {/* 7. Floating Side Drawer / Bottom Sheet Detail for MONTH & DAY views */}
      {viewMode !== 'WEEK' && (
        <CalendarSessionDetailDrawer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* 8. Booking Detail Panel (Table View & Direct Item Selection) */}
      {selectedBookingForDetail && (
        <BookingDetailPanel
          booking={selectedBookingForDetail}
          artists={artists.map((a) => ({ id: a.id, name: a.name, nickname: a.nickname }))}
          blockedDates={blockedDates}
          onClose={() => setSelectedBookingForDetail(null)}
          onRefresh={() => loadCalendarData()}
          onCheckSlip={handleOpenCheckSlip}
        />
      )}

      {/* 9. Payment Submission Review Drawer */}
      {selectedPaymentSub && (
        <PaymentSubmissionReviewDrawer
          isOpen={Boolean(selectedPaymentSub)}
          submission={selectedPaymentSub}
          onClose={() => setSelectedPaymentSub(null)}
          onSuccess={() => {
            setSelectedPaymentSub(null);
            loadCalendarData();
          }}
          onError={(err) => alert(err)}
        />
      )}

      {/* 10. Availability Block Modal */}
      <AvailabilityBlockModal
        isOpen={isBlockModalOpen}
        selectedDateStr={selectedDateStr}
        artists={artists}
        existingBlocks={blockedDates}
        onClose={() => setIsBlockModalOpen(false)}
        onSuccess={(msg) => {
          setSuccessMessage(msg);
          loadCalendarData();
        }}
        onError={(errMsg) => {
          setErrorMessage(errMsg);
        }}
      />
    </div>
  );
}
