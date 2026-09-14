'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CalendarSessionEvent,
  CalendarArtist,
  ViewMode,
  SessionStatus,
} from './types';
import {
  getTodayBangkokStr,
  formatDateBangkok,
  getDateStrBangkok,
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

export default function AdminMasterCalendar() {
  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('WEEK');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArtistId, setSelectedArtistId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<CalendarSessionEvent | null>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data State
  const [artists, setArtists] = useState<CalendarArtist[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateItem[]>([]);
  const [sessions, setSessions] = useState<CalendarSessionEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Adjust default view mode based on screen width on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('DAY');
    }
  }, []);

  // --------------------------------------------------------------------------
  // Data Fetching: Live Supabase Integration
  // --------------------------------------------------------------------------
  const loadCalendarData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();

      // 1. Fetch Active Artists, Blocked Dates, and Sessions in Parallel
      const [artistsRes, blockedRes, sessionsRes] = await Promise.all([
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
          .select('*')
          .order('start_at', { ascending: true }),
      ]);

      if (artistsRes.error) throw artistsRes.error;
      setArtists((artistsRes.data as CalendarArtist[]) || []);
      setBlockedDates((blockedRes.data as BlockedDateItem[]) || []);

      if (sessionsRes.error) throw sessionsRes.error;

      const rawSessions = sessionsRes.data || [];

      const bookingIds = Array.from(new Set(rawSessions.map((s) => s.booking_id)));

      if (bookingIds.length > 0) {
        const [bookingsRes, financialsRes] = await Promise.all([
          supabase
            .from('bookings')
            .select(
              'id, status, customer_user_id, artist_id, requested_date, requested_start_time, customer_note, admin_note, started_at, completed_at, created_at, estimate_request_id'
            )
            .in('id', bookingIds),
          supabase
            .from('booking_payment_summary')
            .select('*')
            .in('booking_id', bookingIds),
        ]);

        if (bookingsRes.error) throw bookingsRes.error;

        const bookingsMap = new Map((bookingsRes.data || []).map((b) => [b.id, b]));
        const financialsMap = new Map((financialsRes.data || []).map((f) => [f.booking_id, f]));

        const customerUids = Array.from(
          new Set(
            (bookingsRes.data || [])
              .map((b) => b.customer_user_id)
              .filter(Boolean)
          )
        );

        const estimateIds = Array.from(
          new Set(
            (bookingsRes.data || [])
              .map((b) => b.estimate_request_id)
              .filter(Boolean)
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

        let estimatesMap = new Map<string, any>();
        if (estimateIds.length > 0) {
          const { data: estimatesData } = await supabase
            .from('estimate_requests')
            .select('id, style, width_cm, height_cm, placement, reference_images, work_type, description')
            .in('id', estimateIds);

          if (estimatesData) {
            estimatesMap = new Map(estimatesData.map((e) => [e.id, e]));
          }
        }

        const artistsMap = new Map(((artistsRes.data as CalendarArtist[]) || []).map((a) => [a.id, a]));

        // Hydrate Booking Sessions
        const hydratedSessionEvents: CalendarSessionEvent[] = rawSessions.map((s) => {
          const parentBooking = bookingsMap.get(s.booking_id) || null;
          const parentFinancial = financialsMap.get(s.booking_id) || null;
          const parentEstimate = parentBooking?.estimate_request_id
            ? estimatesMap.get(parentBooking.estimate_request_id) || null
            : null;
          const customerInfo = parentBooking?.customer_user_id
            ? customersMap.get(parentBooking.customer_user_id) || null
            : null;
          const artistInfo = artistsMap.get(s.artist_id) || null;

          return {
            id: s.id,
            booking_id: s.booking_id,
            artist_id: s.artist_id,
            session_number: s.session_number,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status as SessionStatus,
            note: s.note,
            created_at: s.created_at,
            artist: artistInfo,
            booking: parentBooking,
            estimate: parentEstimate,
            customer: {
              user_id: parentBooking?.customer_user_id || null,
              display_name: customerInfo?.display_name || 'ลูกค้า',
              phone: customerInfo?.phone || null,
              email: customerInfo?.email || null,
            },
            financial: parentFinancial,
          };
        });

        setSessions(hydratedSessionEvents);
      } else {
        setSessions([]);
      }
    } catch (err: any) {
      console.error('Error loading calendar data:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการโหลดตารางงาน');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendarData();
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

      // 2. Session Status Filter
      if (selectedStatus !== 'ALL' && ev.status !== selectedStatus) {
        return false;
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
  }, [selectedDateStr, viewMode]);

  return (
    <div className="space-y-4">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#ECE4D3] tracking-tight">
            ปฏิทินงานสัก
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5">
            ดูตารางนัดหมายและรอบงานของช่างทั้งหมดในร้าน
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

      {/* 4. Filter & Search Controls */}
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

      {/* 6. Calendar Views */}
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

      {/* 8. Availability Block Modal */}
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
