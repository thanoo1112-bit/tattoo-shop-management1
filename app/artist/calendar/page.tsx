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
  RefreshCw,
  Lock,
  Unlock,
  Ban,
  Eye
} from 'lucide-react';
import { 
  getTodayBangkokStr, 
  getDateStrBangkok, 
  formatDateBangkok, 
  formatTimeBangkok, 
  THAI_MONTHS_FULL, 
  THAI_DAYS_SHORT 
} from '@/components/admin/calendar/calendarUtils';
import { parseNoteWithPreferredTime } from '@/lib/noteUtils';

export default function ArtistCalendarPage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [bookingsMap, setBookingsMap] = useState<Map<string, any>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, any>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const [estimatesMap, setEstimatesMap] = useState<Map<string, any>>(new Map());
  const [flashReservationsMap, setFlashReservationsMap] = useState<Map<string, any>>(new Map());
  const [paymentSummaryMap, setPaymentSummaryMap] = useState<Map<string, any>>(new Map());
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [blockLoading, setBlockLoading] = useState<boolean>(false);

  // Month Calendar View State
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
      // 1. Query booking_sessions (scoped to staffArtistId, excluding CANCELLED)
      const { data: dbSessions, error: sessErr } = await supabase
        .from('booking_sessions')
        .select('id, booking_id, artist_id, session_number, start_at, end_at, status, note, created_at, updated_at')
        .eq('artist_id', staffArtistId)
        .neq('status', 'CANCELLED')
        .order('start_at', { ascending: true });

      if (sessErr) {
        console.error('Error fetching artist sessions:', sessErr);
        setLoading(false);
        return;
      }

      const sessionList = dbSessions || [];
      setSessions(sessionList);

      // 2. Query bookings explicitly scoped to staffArtistId (excluding CANCELLED)
      const { data: bData, error: bErr } = await supabase
        .from('bookings')
        .select('id, customer_id, customer_user_id, artist_id, estimate_request_id, flash_reservation_id, booking_number, status, appointment_date, appointment_time, end_time, work_type, custom_work_title, style, placement, width_cm, height_cm, requested_start_time, requested_date, artwork_title, artwork_image_url, description, customer_note, staff_note, rejection_reason, quoted_price, deposit_required, deposit_status, created_at, updated_at, request_type, booking_source, is_walkin, admin_notes, payment_status, cancellation_reason, next_session_number, total_sessions')
        .eq('artist_id', staffArtistId)
        .neq('status', 'CANCELLED');

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
          .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, work_type, estimated_min_price, estimated_max_price, price_estimated_at, request_type')
          .in('id', estimateIds);
        dbEstimates = estData || [];
      }
      const estMap = new Map<string, any>();
      dbEstimates.forEach((e: any) => estMap.set(e.id, e));
      setEstimatesMap(estMap);

      // 3.5 Query linked flash reservations
      const flashResIds = Array.from(new Set(dbBookings.map((b: any) => b.flash_reservation_id).filter(Boolean)));
      let dbFlashReservations: any[] = [];
      if (flashResIds.length > 0) {
        const { data: flashData } = await supabase
          .from('flash_reservations')
          .select('*, flash_designs(*)')
          .in('id', flashResIds);
        dbFlashReservations = flashData || [];
      }
      const flashMap = new Map<string, any>();
      dbFlashReservations.forEach((f: any) => flashMap.set(f.id, f));
      setFlashReservationsMap(flashMap);

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

        // 4a. Query via secure Artist RPC
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

  // Calculate maximum session_number per booking_id across all sessions
  const maxSessionNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      const bId = s.booking_id;
      const num = s.session_number || 0;
      const currentMax = map.get(bId) || 0;
      if (num > currentMax) {
        map.set(bId, num);
      }
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

  // Mon-Sun short Thai day names
  const THAI_DAYS_MON_FIRST = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

  // Calendar Grid Days Calculation (Month View: 7 Columns Mon-Sun)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Convert getDay() (0=Sun, 1=Mon...6=Sat) to Mon-first offset (0=Mon...6=Sun)
    const startDayOffset = (firstDayOfMonth.getDay() + 6) % 7;
    const totalCells = Math.ceil((startDayOffset + daysInMonth) / 7) * 7;

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      sessions: any[];
      isBlocked: boolean;
    }> = [];

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(currentYear, currentMonth, 1 - startDayOffset + i);
      const cYear = d.getFullYear();
      const cMonth = d.getMonth();
      const cDay = d.getDate();

      const mStr = String(cMonth + 1).padStart(2, '0');
      const dStr = String(cDay).padStart(2, '0');
      const dateStr = `${cYear}-${mStr}-${dStr}`;
      const daySessions = sessionsByDate.get(dateStr) || [];

      days.push({
        dateStr,
        dayNum: cDay,
        isCurrentMonth: cMonth === currentMonth && cYear === currentYear,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDateStr,
        sessions: daySessions,
        isBlocked: daySessions.length === 0 && blockedDatesSet.has(dateStr),
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

  // Month navigation handlers
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

  // Helper to resolve main booking status badge config
  const getBookingStatusBadge = (bookingStatus?: string) => {
    switch (bookingStatus) {
      case 'IN_PROGRESS':
        return {
          label: 'กำลังสัก',
          className: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
        };
      case 'COMPLETED':
        return {
          label: 'งานเสร็จสิ้น',
          className: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
        };
      case 'WAITING_DEPOSIT':
      case 'PENDING_SLIP':
        return {
          label: 'รอมัดจำ',
          className: 'bg-purple-950/60 text-purple-400 border-purple-800/60',
        };
      case 'CANCELLED':
      case 'REJECTED':
        return {
          label: 'ยกเลิก',
          className: 'bg-red-950/60 text-red-400 border-red-800/60',
        };
      case 'CONFIRMED':
      default:
        return {
          label: 'นัดหมายแล้ว',
          className: 'bg-blue-950/60 text-blue-400 border-blue-800/60',
        };
    }
  };

  // Clean Start Time Only string ("เวลานัด HH:mm น.")
  const formatStartOnlyTime = (startAt: string) => {
    const raw = formatTimeBangkok(startAt);
    const clean = raw.replace(/\s*น\.?$/gi, '').trim();
    return `เวลานัด ${clean} น.`;
  };

  // Helper to format artwork display title & style
  const getArtworkDisplayTitle = (sess: any) => {
    const booking = bookingsMap.get(sess.booking_id);
    const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
    const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
    const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
    const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
    const flashStyle = flashDesignObj?.style || flashRes?.flash_design_style;

    const rawWorkTitle = (booking?.artwork_title && booking.artwork_title !== 'ลาย Flash' && booking.artwork_title !== 'งานสัก')
      ? booking.artwork_title
      : (flashTitle ? `ลาย Flash: ${flashTitle}` : (estimate?.request_type === 'FLASH' || booking?.flash_reservation_id ? 'ลาย Flash' : 'งานสัก'));
    const workTitle = rawWorkTitle.replace(/\s*custom\s*/gi, '').trim() || 'งานสัก';
    const rawStyle = flashStyle || estimate?.style || estimate?.style_preference || booking?.style_preference || '';
    const styleName = rawStyle.toLowerCase() === 'custom' ? '' : rawStyle;

    return (styleName && !workTitle.toLowerCase().includes(styleName.toLowerCase()))
      ? `${workTitle} (${styleName})`
      : workTitle;
  };

  // Helper to get placement text
  const getPlacementDisplay = (sess: any) => {
    const booking = bookingsMap.get(sess.booking_id);
    const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
    const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
    return booking?.placement || flashRes?.placement || estimate?.placement || 'ไม่ระบุตำแหน่ง';
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
      artwork_title: getArtworkDisplayTitle(sess),
      artwork_image_url: booking?.artwork_image_url,
      placement: getPlacementDisplay(sess),
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
      <div className="min-h-screen bg-[#0E0D0C] flex items-center justify-center font-prompt">
        <span className="text-xs text-[#A89F91] animate-pulse">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0D0C] text-[#ECE4D3] font-prompt flex flex-col pb-20 md:pb-10 overflow-x-hidden">
      {/* Header */}
      <ArtistHeader />

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Top Controls: Title, Today Button, Month Nav, Month Year Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#12100E] border border-[#4A443A]/40 p-4 rounded-xl shadow-lg">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#ECE4D3] flex items-center gap-2">
              <CalendarIcon size={20} className="text-red-500" />
              <span>ปฏิทินของฉัน</span>
            </h1>
            <p className="text-xs text-[#A89F91] mt-0.5">
              ตารางรอบนัดหมายฝั่งช่าง (แสดงตามวันเวลาจริง)
            </p>
          </div>

          {/* Month Navigation & Today Button */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="text-sm sm:text-base font-bold text-[#ECE4D3] bg-[#171512] border border-[#4A443A]/40 px-3.5 py-1.5 rounded-lg shadow-inner">
              {THAI_MONTHS_FULL[currentMonth]} {currentYear + 543}
            </div>

            <div className="flex items-center space-x-1 bg-[#171512] border border-[#4A443A]/40 p-1 rounded-lg">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-md hover:bg-[#1A1815] text-[#A89F91] hover:text-[#ECE4D3] transition-colors cursor-pointer"
                title="เดือนก่อนหน้า"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-md hover:bg-[#1A1815] text-[#A89F91] hover:text-[#ECE4D3] transition-colors cursor-pointer"
                title="เดือนถัดไป"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={handleGoToday}
                className="px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-800/80 text-xs text-red-200 font-bold rounded-md transition-colors cursor-pointer ml-1"
              >
                วันนี้
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => fetchArtistData()}
              disabled={loading}
              className="p-2 bg-[#171512] border border-[#4A443A]/40 hover:border-red-600/50 text-[#A89F91] hover:text-[#ECE4D3] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-red-500' : ''} />
            </button>
          </div>
        </div>

        {/* Layout Grid: Left Month Calendar (Desktop ~70% lg:col-span-8) + Right Panel (Desktop ~30% lg:col-span-4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Monthly Calendar Grid (7 Columns Mon-Sun) */}
          <div className="lg:col-span-8 bg-[#12100E] border border-[#4A443A]/40 rounded-xl p-3.5 sm:p-5 shadow-xl space-y-3">
            {/* Weekday Header Row (Mon - Sun) */}
            <div className="grid grid-cols-7 border-b border-[#4A443A]/40 bg-[#171512] text-center rounded-t-lg">
              {THAI_DAYS_MON_FIRST.map((dName) => (
                <div
                  key={dName}
                  className="py-2 text-xs font-bold text-[#A89F91] uppercase tracking-wider border-r border-[#4A443A]/20 last:border-r-0"
                >
                  {dName}
                </div>
              ))}
            </div>

            {/* Days Grid Cells */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {calendarDays.map((day, idx) => {
                const isSelected = day.isSelected;
                const isToday = day.isToday;
                const activeSessions = day.sessions;
                const totalCount = activeSessions.length;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDateStr(day.dateStr)}
                    className={`min-h-[75px] sm:min-h-[95px] p-1.5 sm:p-2 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer group relative overflow-hidden ${
                      isSelected
                        ? 'bg-red-950/30 border-red-600 ring-2 ring-red-500/50 shadow-lg z-10'
                        : isToday
                        ? 'bg-[#171512] border-[#4A443A] ring-1 ring-[#ECE4D3]/30'
                        : day.isCurrentMonth
                        ? 'bg-[#12100E] border-[#4A443A]/40 hover:bg-[#171512]'
                        : 'bg-[#0E0D0C]/60 border-[#4A443A]/20 opacity-40 hover:opacity-70'
                    }`}
                  >
                    {/* Date Cell Header */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-mono font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                          isToday
                            ? 'bg-red-600 text-white'
                            : isSelected
                            ? 'text-red-400 font-extrabold'
                            : day.isCurrentMonth
                            ? 'text-[#ECE4D3]'
                            : 'text-[#7A7265]'
                        }`}
                      >
                        {day.dayNum}
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-semibold text-red-400 bg-red-950/80 px-1 rounded border border-red-800/60 hidden sm:inline">
                          วันนี้
                        </span>
                      )}
                    </div>

                    {/* Session Pills in Month Cell */}
                    <div className="mt-1 space-y-1 min-w-0">
                      {totalCount > 0 ? (
                        <div className="space-y-1 min-w-0">
                          {/* Desktop View: Session Pills */}
                          <div className="hidden sm:block space-y-1 min-w-0">
                            {activeSessions.slice(0, 2).map((s: any) => {
                              const sessNum = s.session_number || 1;
                              const maxNum = maxSessionNumberMap.get(s.booking_id) || 1;
                              const isLatest = sessNum >= maxNum;
                              const timeStr = formatTimeBangkok(s.start_at).replace(/\s*น\.?$/gi, '').trim();
                              const booking = bookingsMap.get(s.booking_id);
                              const bBadge = getBookingStatusBadge(booking?.status);

                              return (
                                <div
                                  key={s.id}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium border truncate flex items-center justify-between gap-1 ${
                                    isLatest
                                      ? `${bBadge.className}`
                                      : 'bg-[#171512] text-[#A89F91] border-[#4A443A]/40'
                                  }`}
                                  title={`รอบที่ ${sessNum} • ${timeStr} น.`}
                                >
                                  <span className="truncate font-mono font-bold">รอบ {sessNum}</span>
                                  <span className="truncate text-[9.5px] opacity-90">{timeStr}</span>
                                </div>
                              );
                            })}
                            {totalCount > 2 && (
                              <span className="text-[9.5px] text-[#A89F91] font-semibold block px-1 truncate">
                                +{totalCount - 2} คิว
                              </span>
                            )}
                          </div>

                          {/* Mobile View: Compact Status-Aware Badge */}
                          {(() => {
                            const sessionStatusInfos = activeSessions.map((s: any) => {
                              const booking = bookingsMap.get(s.booking_id);
                              const statusKey = booking?.status || s.status || 'CONFIRMED';
                              let colorClass = 'text-blue-400';
                              if (statusKey === 'WAITING_DEPOSIT' || statusKey === 'PENDING_SLIP') {
                                colorClass = 'text-purple-400';
                              } else if (statusKey === 'COMPLETED') {
                                colorClass = 'text-emerald-400';
                              } else if (statusKey === 'IN_PROGRESS') {
                                colorClass = 'text-amber-400';
                              } else if (statusKey === 'CANCELLED' || statusKey === 'REJECTED') {
                                colorClass = 'text-red-400';
                              }
                              return { key: statusKey, colorClass };
                            });

                            const uniqueInfos = Array.from(
                              new Map(sessionStatusInfos.map((info) => [info.key, info])).values()
                            );

                            if (uniqueInfos.length === 1) {
                              const singleInfo = uniqueInfos[0];
                              return (
                                <div className="flex sm:hidden items-center gap-1">
                                  <span className={`text-[9px] font-bold truncate flex items-center gap-1 ${singleInfo.colorClass}`}>
                                    <span>●</span>
                                    <span>{totalCount} คิว</span>
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div className="flex sm:hidden items-center gap-1">
                                <div className="flex items-center gap-0.5 shrink-0 text-[9px]">
                                  {uniqueInfos.map((info) => (
                                    <span key={info.key} className={info.colorClass}>●</span>
                                  ))}
                                </div>
                                <span className="text-[9px] font-bold text-[#ECE4D3] truncate">
                                  {totalCount} คิว
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ) : day.isBlocked ? (
                        <div className="text-[9.5px] text-zinc-400 bg-zinc-900 border border-zinc-700/60 px-1 py-0.5 rounded truncate">
                          🔒 ปิดรับคิว
                        </div>
                      ) : (
                        <div className="h-2" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Selected Date Appointment List (Desktop ~30% lg:col-span-4) */}
          <div className="lg:col-span-4 bg-[#12100E] border border-[#4A443A]/40 rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
            {/* Right Panel Header */}
            <div className="flex items-center justify-between border-b border-[#4A443A]/40 pb-3">
              <div>
                <span className="text-[10px] text-[#A89F91] uppercase tracking-wider block font-semibold">
                  รายการนัดของวันที่เลือก
                </span>
                <h3 className="text-sm sm:text-base font-bold text-[#ECE4D3] flex items-center gap-1.5 mt-0.5">
                  <CalendarIcon size={15} className="text-red-500" />
                  <span>{formatDateBangkok(selectedDateStr, true)}</span>
                </h3>
              </div>
              <span className="text-xs font-bold text-red-400 bg-red-950/60 border border-red-800/60 px-2.5 py-1 rounded-full">
                {selectedDateSessions.length} รายการ
              </span>
            </div>

            {/* List of Appointment Cards */}
            <div className="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
              {loading ? (
                <div className="p-8 text-center text-[#A89F91] animate-pulse text-xs">
                  กำลังโหลดข้อมูล...
                </div>
              ) : selectedDateSessions.length === 0 ? (
                <div className="p-6 text-center bg-[#171512] border border-dashed border-[#4A443A]/40 rounded-xl space-y-2">
                  <CalendarIcon size={24} className="mx-auto text-[#7A7265]" />
                  <p className="text-xs text-[#ECE4D3] font-medium">ไม่มีคิวนัดหมายในวันนี้</p>
                  <p className="text-[11px] text-[#7A7265]">
                    เลือกวันอื่นบนปฏิทินเพื่อดูรายการนัด
                  </p>
                </div>
              ) : (
                selectedDateSessions.map((sess: any) => {
                  const booking = bookingsMap.get(sess.booking_id);
                  const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                  const customerUserId = booking?.customer_user_id || estimate?.customer_user_id;
                  const customerName = getCleanCustomerName(customerUserId);
                  const artworkTitle = getArtworkDisplayTitle(sess);
                  const placementDisplay = getPlacementDisplay(sess);

                  const sessNum = sess.session_number || 1;
                  const maxNum = maxSessionNumberMap.get(sess.booking_id) || 1;
                  const isLatestSession = sessNum >= maxNum;
                  const bBadge = getBookingStatusBadge(booking?.status);

                  return (
                    <div
                      key={sess.id}
                      onClick={() => handleOpenDetail(sess)}
                      className="group bg-[#171512] border border-[#4A443A]/40 hover:border-red-600/60 p-3.5 sm:p-4 rounded-xl transition-all cursor-pointer space-y-2.5 shadow-md"
                    >
                      {/* Round Badge & Booking Status (Status Badge ONLY on Latest Session) */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono font-bold text-[#ECE4D3] bg-[#12100E] px-2.5 py-0.5 rounded border border-[#4A443A]/40">
                            รอบที่ {sessNum}
                          </span>
                          {isLatestSession && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${bBadge.className}`}>
                              {bBadge.label}
                            </span>
                          )}
                        </div>

                        {/* View Details Action */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(sess);
                          }}
                          className="px-2.5 py-1 bg-[#12100E] hover:bg-[#1A1815] text-[#A89F91] group-hover:text-[#ECE4D3] text-[11px] font-semibold rounded-lg border border-[#4A443A]/40 transition-colors flex items-center space-x-1 cursor-pointer"
                        >
                          <Eye size={12} />
                          <span>ดูรายละเอียด</span>
                        </button>
                      </div>

                      {/* Artwork Title & Time (Start time only "เวลานัด HH:mm น.") */}
                      <div className="space-y-1">
                        <h4 className="text-xs sm:text-sm font-semibold text-[#ECE4D3] group-hover:text-red-400 transition-colors">
                          {artworkTitle}
                        </h4>
                        <div className="flex items-center space-x-1.5 text-xs font-mono text-red-400 font-semibold">
                          <Clock size={12} className="shrink-0" />
                          <span>{formatStartOnlyTime(sess.start_at)}</span>
                        </div>
                      </div>

                      {/* Customer Name & Placement */}
                      <div className="pt-2 border-t border-[#4A443A]/30 flex items-center justify-between text-[11px] text-[#A89F91]">
                        <div className="flex items-center space-x-1.5 truncate max-w-[160px]">
                          <User size={12} className="shrink-0 text-[#7A7265]" />
                          <span className="text-[#ECE4D3] truncate font-medium">{customerName}</span>
                        </div>
                        <div className="flex items-center space-x-1.5 truncate max-w-[140px]">
                          <Layers size={12} className="shrink-0 text-[#7A7265]" />
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
