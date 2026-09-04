'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CalendarSessionEvent,
  CalendarArtist,
  CalendarSummaryMetrics,
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
import CalendarSummaryStrip from './CalendarSummaryStrip';
import MonthCalendarView from './MonthCalendarView';
import WeekCalendarView from './WeekCalendarView';
import DayAgendaView from './DayAgendaView';
import CalendarSessionDetailDrawer from './CalendarSessionDetailDrawer';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminMasterCalendar() {
  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('WEEK');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArtistId, setSelectedArtistId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<CalendarSessionEvent | null>(null);

  // Data State
  const [artists, setArtists] = useState<CalendarArtist[]>([]);
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

      // 1. Fetch Active Artists
      const { data: artistsData, error: artistsError } = await supabase
        .from('artists')
        .select('id, name, nickname, avatar_url, is_active, working_days, specialties')
        .eq('is_active', true)
        .order('name');

      if (artistsError) throw artistsError;
      setArtists((artistsData as CalendarArtist[]) || []);

      // 2. Fetch Sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('booking_sessions')
        .select('*')
        .order('start_at', { ascending: true });

      if (sessionsError) throw sessionsError;

      const rawSessions = sessionsData || [];

      // 3. Batch Fetch Related Bookings & Financial Summaries
      if (rawSessions.length > 0) {
        const bookingIds = Array.from(new Set(rawSessions.map((s) => s.booking_id)));

        const [bookingsRes, financialsRes] = await Promise.all([
          supabase
            .from('bookings')
            .select(
              'id, status, customer_user_id, requested_date, requested_start_time, customer_note, admin_note, started_at, completed_at, created_at'
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

        // 4. Batch Fetch Customer Profiles
        const customerUids = Array.from(
          new Set(
            (bookingsRes.data || [])
              .map((b) => b.customer_user_id)
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

        const artistsMap = new Map((artistsData || []).map((a) => [a.id, a]));

        // 5. Combine and Hydrate Calendar Events
        const hydratedEvents: CalendarSessionEvent[] = rawSessions.map((s) => {
          const parentBooking = bookingsMap.get(s.booking_id) || null;
          const parentFinancial = financialsMap.get(s.booking_id) || null;
          const customerInfo = parentBooking
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
            customer: customerInfo,
            financial: parentFinancial,
          };
        });

        setSessions(hydratedEvents);
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
  // Metrics Computation
  // --------------------------------------------------------------------------
  const metrics: CalendarSummaryMetrics = useMemo(() => {
    const todaySessions = sessions.filter(
      (s) => getDateStrBangkok(s.start_at) === todayStr
    );
    const inProgress = sessions.filter((s) => s.status === 'IN_PROGRESS');
    const waitingDeposit = sessions.filter(
      (s) => s.booking?.status === 'WAITING_DEPOSIT'
    );
    const activeArtistsToday = new Set(todaySessions.map((s) => s.artist_id));

    return {
      todaySessionsCount: todaySessions.length,
      inProgressCount: inProgress.length,
      waitingDepositCount: waitingDeposit.length,
      activeArtistsCount: activeArtistsToday.size,
    };
  }, [sessions, todayStr]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#ECE4D3] tracking-tight">
            ปฏิทินงานสัก
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5">
            ดูตารางนัดหมายและรอบงานของช่างทั้งหมดในร้าน
          </p>
        </div>
      </div>

      {/* 2. Top Summary KPI Strip */}
      <CalendarSummaryStrip metrics={metrics} />

      {/* 3. Toolbar (Date Nav, Title, View Switcher) */}
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
      />

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
            className="px-3 py-1 bg-red-900/60 hover:bg-red-800/80 rounded text-xs font-semibold text-white transition-colors"
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
              onSelectDate={(date) => {
                setSelectedDateStr(date);
                setViewMode('DAY');
              }}
              onSelectEvent={setSelectedEvent}
              todayStr={todayStr}
            />
          )}

          {viewMode === 'WEEK' && (
            <WeekCalendarView
              selectedDateStr={selectedDateStr}
              events={filteredSessions}
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

      {/* 7. Side Drawer / Bottom Sheet Detail */}
      <CalendarSessionDetailDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
