'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '../../../components/AppContext';
import { createClient } from '../../../lib/supabase/client';
import ArtistHeader from '../../../components/artist/ArtistHeader';
import ArtistMobileNav from '../../../components/artist/ArtistMobileNav';
import ArtistAppointmentDetailDrawer, { ArtistSessionDetail } from '../../../components/artist/ArtistAppointmentDetailDrawer';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Layers, 
  CheckCircle2, 
  RefreshCw,
  Filter,
  Lock,
  Unlock,
  Ban
} from 'lucide-react';
import { 
  getTodayBangkokStr, 
  getDateStrBangkok, 
  formatDateBangkok, 
  formatTimeBangkok, 
  calculateDurationText, 
  getSessionStatusConfig, 
  THAI_MONTHS_FULL, 
  THAI_DAYS_SHORT 
} from '@/components/admin/calendar/calendarUtils';
import { parseNoteWithPreferredTime } from '@/lib/noteUtils';

export default function ArtistCalendarPage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [bookingsMap, setBookingsMap] = useState<Map<string, any>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, any>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const [estimatesMap, setEstimatesMap] = useState<Map<string, any>>(new Map());
  const [paymentSummaryMap, setPaymentSummaryMap] = useState<Map<string, any>>(new Map());
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [blockLoading, setBlockLoading] = useState<boolean>(false);

  // Calendar View State
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth()); // 0-indexed
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => getTodayBangkokStr());
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');

  // Drawer State
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<ArtistSessionDetail | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isAuthorized = Boolean(
    isStaffLoggedIn && (staffRole === 'ARTIST' || (staffRole === 'ADMIN' && staffArtistId))
  );

  // Route protection
  useEffect(() => {
    if (!authLoading && !isAuthorized) {
      if (typeof window !== 'undefined') {
        window.location.href = '/staff/login';
      }
    }
  }, [isAuthorized, authLoading]);

  // Fetch live operational data for Artist (strictly scoped to staffArtistId)
  const fetchArtistData = useCallback(async () => {
    if (!isAuthorized || !staffArtistId) return;
    setLoading(true);

    try {
      // 1. Query booking_sessions (explicitly scoped to staffArtistId)
      const { data: dbSessions, error: sessErr } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('artist_id', staffArtistId)
        .order('start_at', { ascending: true });

      if (sessErr) {
        console.error('Error fetching artist sessions:', sessErr);
        setLoading(false);
        return;
      }

      const sessionList = dbSessions || [];
      setSessions(sessionList);

      // 2. Query bookings explicitly scoped to staffArtistId
      const { data: bData, error: bErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('artist_id', staffArtistId);

      if (bErr) {
        console.error('Error fetching artist bookings:', bErr);
      }

      const dbBookings = bData || [];
      const bMap = new Map<string, any>();
      dbBookings.forEach((b: any) => bMap.set(b.id, b));
      setBookingsMap(bMap);

      // 3. Query linked estimate requests
      const estimateIds = Array.from(new Set(dbBookings.map((b: any) => b.estimate_request_id).filter(Boolean)));
      let dbEstimates: any[] = [];
      if (estimateIds.length > 0) {
        const { data: estData } = await supabase
          .from('estimate_requests')
          .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, work_type, estimated_min_price, estimated_max_price, price_estimated_at, request_type')
          .in('id', estimateIds);
        dbEstimates = estData || [];
      }
      const estMap = new Map<string, any>();
      dbEstimates.forEach((e: any) => estMap.set(e.id, e));
      setEstimatesMap(estMap);

      // 4. Query linked customers & profiles
      const customerUserIds = Array.from(
        new Set([
          ...dbBookings.map((b: any) => b.customer_user_id),
          ...dbEstimates.map((e: any) => e.customer_user_id),
        ].filter(Boolean))
      );

      if (customerUserIds.length > 0) {
        const cMap = new Map<string, any>();
        const pMap = new Map<string, any>();

        // 4a. Query via secure Artist RPC (bypasses RLS restrictions for assigned artist customers)
        const { data: contactsData, error: contactsErr } = await supabase
          .rpc('artist_get_customer_contacts', {
            p_customer_user_ids: customerUserIds
          });

        if (!contactsErr && contactsData) {
          (contactsData || []).forEach((c: any) => {
            if (c.user_id) {
              cMap.set(c.user_id, c);
              pMap.set(c.user_id, c);
            }
          });
        }

        // 4b. Direct table query to supplement extra fields
        const { data: cData } = await supabase
          .from('customers')
          .select('user_id, display_name, first_name, last_name, phone, email, eligibility_confirmed_at, profile_completed_at')
          .in('user_id', customerUserIds);

        (cData || []).forEach((c: any) => {
          const existing = cMap.get(c.user_id) || {};
          cMap.set(c.user_id, { ...existing, ...c });
        });

        const { data: pData } = await supabase
          .from('profiles')
          .select('user_id, display_name, email, phone')
          .in('user_id', customerUserIds);

        (pData || []).forEach((p: any) => {
          const existing = pMap.get(p.user_id) || {};
          pMap.set(p.user_id, { ...existing, ...p });
        });

        setCustomersMap(cMap);
        setProfilesMap(pMap);
      }

      // 4.5 Query booking_payment_summary & pending payment submissions
      const dbBookingIds = dbBookings.map((b: any) => b.id);
      if (dbBookingIds.length > 0) {
        const { data: sumData } = await supabase
          .from('booking_payment_summary')
          .select('*')
          .in('booking_id', dbBookingIds);
        const sumMap = new Map<string, any>();
        (sumData || []).forEach((s: any) => sumMap.set(s.booking_id, s));
        setPaymentSummaryMap(sumMap);

        const { data: subData } = await supabase
          .from('booking_payment_submissions')
          .select('*')
          .in('booking_id', dbBookingIds)
          .eq('status', 'PENDING');
        setPendingSubmissions(subData || []);
      }

      // 5. Query artist_blocked_dates for staffArtistId
      const { data: bDatesData, error: bDatesErr } = await supabase
        .from('artist_blocked_dates')
        .select('blocked_date')
        .eq('artist_id', staffArtistId);

      if (bDatesErr) {
        console.error('Error fetching artist blocked dates:', bDatesErr);
      } else {
        const bList = (bDatesData || []).map((d: any) => d.blocked_date);
        setBlockedDates(bList);
      }
    } catch (err) {
      console.error('Exception fetching artist calendar data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, staffArtistId]);

  useEffect(() => {
    if (isAuthorized && staffArtistId) {
      fetchArtistData();
    }
  }, [isAuthorized, staffArtistId, fetchArtistData]);

  // Today string
  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  // Map sessions by date string YYYY-MM-DD
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    sessions.forEach((s) => {
      const dStr = getDateStrBangkok(s.start_at);
      if (!map.has(dStr)) map.set(dStr, []);
      map.get(dStr)!.push(s);
    });
    return map;
  }, [sessions]);

  // Set of blocked dates
  const blockedDatesSet = useMemo(() => new Set(blockedDates), [blockedDates]);

  // Status Priority for selected date: BOOKED > BLOCKED > AVAILABLE
  const selectedDateStatus = useMemo(() => {
    const daySessions = sessionsByDate.get(selectedDateStr) || [];
    const hasActiveSession = daySessions.some(
      (s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS' || s.status === 'COMPLETED'
    );

    if (hasActiveSession || daySessions.length > 0) {
      return 'BOOKED';
    }
    if (blockedDatesSet.has(selectedDateStr)) {
      return 'BLOCKED';
    }
    return 'AVAILABLE';
  }, [sessionsByDate, selectedDateStr, blockedDatesSet]);

  // Handler for toggling date block status via RPC
  const handleToggleDayBlock = async (targetDateStr: string, blockStatus: boolean) => {
    if (!targetDateStr || targetDateStr < todayStr) return;
    setBlockLoading(true);
    try {
      const { error } = await supabase.rpc('artist_set_day_block', {
        p_date: targetDateStr,
        p_blocked: blockStatus,
        p_reason: blockStatus ? 'ช่างปิดรับคิววันดังกล่าว' : null
      });

      if (error) {
        alert(`ไม่สามารถดำเนินการได้: ${error.message}`);
      } else {
        await fetchArtistData();
      }
    } catch (err: any) {
      console.error('Error toggling day block:', err);
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะการรับคิว');
    } finally {
      setBlockLoading(false);
    }
  };

  // Calendar Grid Days Calculation
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      sessionCount: number;
      hasActive: boolean;
      isBlocked: boolean;
    }> = [];

    // Previous month padding
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      const dateStr = prevDate.toISOString().split('T')[0];
      const daySessions = sessionsByDate.get(dateStr) || [];
      const count = daySessions.length;
      const isBlocked = count === 0 && blockedDatesSet.has(dateStr);

      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        sessionCount: count,
        hasActive: daySessions.some((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'),
        isBlocked,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${currentYear}-${mStr}-${dStr}`;
      const daySessions = sessionsByDate.get(dateStr) || [];
      const count = daySessions.length;
      const isBlocked = count === 0 && blockedDatesSet.has(dateStr);

      days.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        sessionCount: count,
        hasActive: daySessions.some((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'),
        isBlocked,
      });
    }

    // Next month padding to fill 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nextDate = new Date(currentYear, currentMonth + 1, day);
      const dateStr = nextDate.toISOString().split('T')[0];
      const daySessions = sessionsByDate.get(dateStr) || [];
      const count = daySessions.length;
      const isBlocked = count === 0 && blockedDatesSet.has(dateStr);

      days.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        sessionCount: count,
        hasActive: daySessions.some((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'),
        isBlocked,
      });
    }

    return days;
  }, [currentYear, currentMonth, selectedDateStr, todayStr, sessionsByDate, blockedDatesSet]);

  // Selected Date Sessions (filtered)
  const selectedDateSessions = useMemo(() => {
    const list = sessionsByDate.get(selectedDateStr) || [];
    if (statusFilter === 'ACTIVE') {
      return list.filter((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS');
    }
    if (statusFilter === 'COMPLETED') {
      return list.filter((s) => s.status === 'COMPLETED');
    }
    return list;
  }, [sessionsByDate, selectedDateStr, statusFilter]);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDateStr(todayStr);
  };

  const getCleanCustomerName = (uid?: string | null) => {
    if (!uid) return 'ไม่ระบุชื่อลูกค้า';
    const c = customersMap.get(uid);
    const p = profilesMap.get(uid);
    const candidate = (c?.display_name && c.display_name !== 'ลูกค้าประจำ')
      ? c.display_name
      : (p?.display_name && p.display_name !== 'ลูกค้าประจำ')
      ? p.display_name
      : (c?.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : null);
    if (candidate && candidate !== 'ลูกค้าประจำ' && candidate !== 'ลูกค้า 157 TATTOO') {
      return candidate;
    }
    const emailPrefix = c?.email ? c.email.split('@')[0] : p?.email ? p.email.split('@')[0] : null;
    if (emailPrefix && emailPrefix !== 'ลูกค้าประจำ') {
      return emailPrefix;
    }
    return 'ไม่ระบุชื่อลูกค้า';
  };

  const getIsAgeConfirmed = (uid?: string | null) => {
    if (!uid) return false;
    const c = customersMap.get(uid);
    return Boolean(c?.eligibility_confirmed_at || c?.profile_completed_at);
  };

  // Open detail drawer
  const handleOpenDetail = (sess: any) => {
    const booking = bookingsMap.get(sess.booking_id);
    const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
    const customerUserId = booking?.customer_user_id || estimate?.customer_user_id;
    const customer = customerUserId ? customersMap.get(customerUserId) : null;
    const prof = customerUserId ? profilesMap.get(customerUserId) : null;
    const summary = paymentSummaryMap.get(sess.booking_id);
    const hasPendingSlip = pendingSubmissions.some((sub: any) => sub.booking_id === sess.booking_id);
    const depositReq = summary?.deposit_required ?? estimate?.deposit_required ?? 0;

    let depositStatus = 'ยืนยันแล้ว';
    if (booking?.status === 'CANCELLED' || booking?.status === 'REJECTED') {
      depositStatus = 'เสียสิทธิ์';
    } else if (Number(depositReq) > 0) {
      if (summary?.deposit_paid || summary?.deposit_paid === true || booking?.status === 'CONFIRMED' || booking?.status === 'IN_PROGRESS' || booking?.status === 'COMPLETED') {
        depositStatus = 'ยืนยันแล้ว';
      } else if (hasPendingSlip) {
        depositStatus = 'ส่งหลักฐานแล้ว';
      } else {
        depositStatus = 'รอมัดจำ';
      }
    } else {
      depositStatus = 'ไม่ต้องมัดจำ';
    }

    const siblingSessions = sessions
      .filter((s: any) => s.booking_id === sess.booking_id)
      .map((s: any) => ({
        id: s.id,
        session_number: s.session_number,
        start_at: s.start_at,
        end_at: s.end_at,
        status: s.status,
        notes: s.notes || s.session_notes || s.note || null,
      }))
      .sort((a, b) => a.session_number - b.session_number);

    const detail: ArtistSessionDetail = {
      session_id: sess.id,
      session_number: sess.session_number || 1,
      session_title: sess.session_title,
      start_at: sess.start_at,
      end_at: sess.end_at,
      session_status: sess.status,
      session_notes: sess.session_notes || sess.notes || sess.note || null,

      booking_id: sess.booking_id,
      booking_status: booking?.status || 'CONFIRMED',
      booking_source: null,
      artwork_title: estimate?.style || null,
      artwork_image_url: booking?.artwork_image_url,
      placement: estimate?.placement || booking?.placement || null,
      width_cm: estimate?.width_cm ?? booking?.width_cm ?? null,
      height_cm: estimate?.height_cm ?? booking?.height_cm ?? null,
      description: parseNoteWithPreferredTime(estimate?.description || booking?.description).cleanNote || null,
      customer_note: booking?.customer_note,
      staff_note: booking?.staff_note,

      customer_name: getCleanCustomerName(customerUserId),
      customer_phone: customer?.phone || prof?.phone || null,
      customer_email: prof?.email || customer?.email || null,
      is_age_confirmed: getIsAgeConfirmed(customerUserId),

      estimate_request_id: booking?.estimate_request_id,
      request_type: estimate?.request_type || null,
      work_type: estimate?.work_type || null,
      style: estimate?.style || estimate?.style_preference || booking?.style_preference || null,
      reference_images: estimate?.reference_images || (booking?.artwork_image_url ? [booking.artwork_image_url] : null),

      quoted_price: summary?.quoted_price ?? estimate?.quoted_price ?? null,
      estimated_min_price: estimate?.estimated_min_price ?? null,
      estimated_max_price: estimate?.estimated_max_price ?? null,
      price_estimated_at: estimate?.price_estimated_at ?? null,
      deposit_required: summary?.deposit_required ?? estimate?.deposit_required ?? null,
      paid_total: summary?.paid_total ?? null,
      remaining_balance: summary?.remaining_balance ?? null,
      deposit_status: depositStatus,
      is_deposit_paid: summary?.deposit_paid ?? false,
      is_fully_paid: summary?.is_fully_paid ?? false,

      all_sessions: siblingSessions.length > 0 ? siblingSessions : undefined,
    };

    setSelectedSessionDetail(detail);
    setIsDrawerOpen(true);
  };

  if (authLoading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt">
        <span className="text-xs text-studio-secondary animate-pulse">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-studio-main text-studio-primary font-prompt flex flex-col pb-20 md:pb-10">
      {/* Header */}
      <ArtistHeader />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Page Title & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary">
              ปฏิทินงานสักของฉัน
            </h1>
            <p className="text-xs text-studio-secondary mt-0.5">
              แสดงเฉพาะคิวนัดหมายที่ได้รับมอบหมายตามตารางงานของคุณ
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleGoToday}
              className="px-3 py-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-primary rounded-lg transition-colors cursor-pointer"
            >
              วันนี้
            </button>
            <button
              onClick={() => fetchArtistData()}
              disabled={loading}
              className="p-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-studio-red' : ''} />
            </button>
          </div>
        </div>

        {/* Layout: Calendar Grid (Left/Top) + Day Agenda (Right/Bottom) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Calendar Month View (7 Cols on LG) */}
          <div className="lg:col-span-7 bg-studio-card border border-studio-border rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
            {/* Month Header Navigation */}
            <div className="flex items-center justify-between border-b border-studio-border/60 pb-3">
              <div className="text-sm sm:text-base font-semibold text-studio-primary">
                {THAI_MONTHS_FULL[currentMonth]} {currentYear + 543}
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-md hover:bg-studio-sec text-studio-secondary hover:text-studio-primary border border-studio-border transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-md hover:bg-studio-sec text-studio-secondary hover:text-studio-primary border border-studio-border transition-colors cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-studio-muted py-1">
              {THAI_DAYS_SHORT.map((d, i) => (
                <div key={i} className={i === 0 ? 'text-studio-red/80' : ''}>
                  {d}
                </div>
              ))}
            </div>

            {/* Month Grid Cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((day, idx) => {
                const isSelected = day.isSelected;
                const isToday = day.isToday;
                const hasSessions = day.sessionCount > 0;

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDateStr(day.dateStr)}
                    className={`min-h-[58px] sm:min-h-[70px] p-1.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-studio-red/15 border-studio-red ring-1 ring-studio-red/40'
                        : isToday
                        ? 'bg-studio-sec border-studio-border ring-1 ring-studio-border'
                        : day.isCurrentMonth
                        ? 'bg-studio-card/80 border-studio-border/50 hover:bg-studio-sec/50'
                        : 'bg-studio-main/30 border-studio-border/20 opacity-40 hover:opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-mono font-medium ${
                          isToday
                            ? 'text-studio-red font-bold'
                            : isSelected
                            ? 'text-studio-primary font-bold'
                            : day.isCurrentMonth
                            ? 'text-studio-primary'
                            : 'text-studio-muted'
                        }`}
                      >
                        {day.dayNum}
                      </span>

                      {isToday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-studio-red" />
                      )}
                    </div>

                    {/* Session / Block indicators */}
                    <div className="pt-1">
                      {hasSessions ? (
                        <div className="flex items-center space-x-1">
                          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            day.hasActive
                              ? 'bg-studio-red text-white'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          }`}>
                            {day.sessionCount} คิว
                          </span>
                        </div>
                      ) : day.isBlocked ? (
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                            ปิดรับ
                          </span>
                        </div>
                      ) : (
                        <div className="h-3" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day Agenda View (5 Cols on LG) */}
          <div className="lg:col-span-5 bg-studio-card border border-studio-border rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
            {/* Date Availability Status & Action Card */}
            <div className="bg-studio-sec/60 border border-studio-border p-3.5 sm:p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-studio-secondary font-medium">สถานะการรับคิวประจำวัน:</span>
                {selectedDateStatus === 'BOOKED' && (
                  <span className="text-xs font-semibold text-studio-red bg-studio-red/10 border border-studio-red/30 px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-studio-red" />
                    <span>มีคิวยืนยันแล้ว</span>
                  </span>
                )}
                {selectedDateStatus === 'BLOCKED' && (
                  <span className="text-xs font-semibold text-zinc-400 bg-zinc-900 border border-zinc-700 px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1">
                    <Ban size={12} className="text-zinc-400" />
                    <span>ปิดรับคิว</span>
                  </span>
                )}
                {selectedDateStatus === 'AVAILABLE' && (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-0.5 rounded-full inline-flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>เปิดรับคิว</span>
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-studio-border/50">
                <div className="text-xs text-studio-muted">
                  {selectedDateStatus === 'BOOKED' && (
                    <span className="text-studio-secondary">ระบบปิดรับคิวอัตโนมัติ (1 ช่าง = 1 ลูกค้า / วัน)</span>
                  )}
                  {selectedDateStatus === 'BLOCKED' && (
                    <span className="text-zinc-300">วันนี้คุณปิดรับการจอง</span>
                  )}
                  {selectedDateStatus === 'AVAILABLE' && (
                    <span className="text-studio-muted">ยังไม่มีนัดหมาย</span>
                  )}
                </div>

                {/* Block/Unblock Action Buttons (Current & Future dates only) */}
                {selectedDateStr >= todayStr && selectedDateStatus !== 'BOOKED' && (
                  <div>
                    {selectedDateStatus === 'BLOCKED' ? (
                      <button
                        onClick={() => handleToggleDayBlock(selectedDateStr, false)}
                        disabled={blockLoading}
                        className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-studio-card hover:bg-studio-sec border border-zinc-700 text-xs font-medium text-studio-primary hover:text-emerald-400 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Unlock size={14} className="text-emerald-400" />
                        <span>{blockLoading ? 'กำลังบันทึก...' : 'เปิดรับคิวอีกครั้ง'}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleDayBlock(selectedDateStr, true)}
                        disabled={blockLoading}
                        className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300 hover:text-studio-red rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Lock size={14} className="text-zinc-400" />
                        <span>{blockLoading ? 'กำลังบันทึก...' : 'ปิดรับคิววันนี้'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Agenda Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-studio-border/60 pb-3 gap-2">
              <div>
                <span className="text-[11px] text-studio-secondary uppercase tracking-wider block font-semibold">
                  รายการนัดหมาย
                </span>
                <span className="text-sm sm:text-base font-semibold text-studio-primary">
                  {formatDateBangkok(selectedDateStr, true)}
                </span>
              </div>

              {/* Status Filter */}
              <div className="flex items-center space-x-1 bg-studio-sec p-1 rounded-lg border border-studio-border text-[11px]">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    statusFilter === 'ALL'
                      ? 'bg-studio-card text-studio-primary font-semibold border border-studio-border'
                      : 'text-studio-secondary hover:text-studio-primary'
                  }`}
                >
                  ทั้งหมด
                </button>
                <button
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-studio-card text-studio-red font-semibold border border-studio-border'
                      : 'text-studio-secondary hover:text-studio-primary'
                  }`}
                >
                  รอดำเนินการ
                </button>
                <button
                  onClick={() => setStatusFilter('COMPLETED')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    statusFilter === 'COMPLETED'
                      ? 'bg-studio-card text-emerald-400 font-semibold border border-studio-border'
                      : 'text-studio-secondary hover:text-studio-primary'
                  }`}
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>

            {/* Sessions List for Selected Date */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {loading ? (
                <div className="p-8 text-center text-studio-secondary animate-pulse text-xs">
                  กำลังโหลดข้อมูล...
                </div>
              ) : selectedDateSessions.length === 0 ? (
                <div className="p-8 text-center bg-studio-sec/30 border border-dashed border-studio-border/60 rounded-xl space-y-2">
                  <CalendarIcon size={24} className="mx-auto text-studio-muted" />
                  <p className="text-xs text-studio-primary font-medium">ไม่มีคิวนัดหมายในวันนี้</p>
                  <p className="text-[11px] text-studio-muted">
                    คุณสามารถเลือกวันอื่นบนปฏิทินเพื่อดูรายการนัดหมาย
                  </p>
                </div>
              ) : (
                selectedDateSessions.map((sess: any) => {
                  const booking = bookingsMap.get(sess.booking_id);
                  const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                  const customerUserId = booking?.customer_user_id || estimate?.customer_user_id;
                  const customerName = getCleanCustomerName(customerUserId);
                  const sConf = getSessionStatusConfig(sess.status as any);
                  const styleDisplay = estimate?.style || 'งานสัก';
                  const placementDisplay = estimate?.placement || booking?.placement || 'ไม่ระบุตำแหน่ง';

                  return (
                    <div
                      key={sess.id}
                      onClick={() => handleOpenDetail(sess)}
                      className="group bg-studio-sec/70 border border-studio-border hover:border-studio-red/60 p-3.5 sm:p-4 rounded-xl transition-all cursor-pointer space-y-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-studio-secondary bg-studio-card px-2 py-0.5 rounded border border-studio-border">
                          รอบที่ {sess.session_number || 1}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sConf.badgeBg} ${sConf.badgeText} ${sConf.border}`}>
                          {sConf.label}
                        </span>
                      </div>

                      <div className="space-y-0.5">
                        <h4 className="text-xs sm:text-sm font-semibold text-studio-primary group-hover:text-studio-red transition-colors">
                          {styleDisplay}
                        </h4>
                        <div className="flex items-center space-x-1.5 text-xs text-studio-secondary font-mono">
                          <Clock size={12} className="text-studio-muted" />
                          <span>{formatTimeBangkok(sess.start_at)} - {formatTimeBangkok(sess.end_at)}</span>
                          <span className="text-studio-muted text-[10px]">
                            ({calculateDurationText(sess.start_at, sess.end_at)})
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-studio-border/50 flex items-center justify-between text-[11px] text-studio-muted">
                        <div className="flex items-center space-x-1 truncate max-w-[150px]">
                          <User size={12} className="text-studio-secondary shrink-0" />
                          <span className="truncate">{customerName}</span>
                        </div>
                        <div className="flex items-center space-x-1 truncate max-w-[120px]">
                          <Layers size={12} className="text-studio-secondary shrink-0" />
                          <span className="truncate">{placementDisplay}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <ArtistMobileNav />

      {/* Detail Drawer */}
      <ArtistAppointmentDetailDrawer
        session={selectedSessionDetail}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedSessionDetail(null);
        }}
        onRefresh={fetchArtistData}
      />
    </div>
  );
}
