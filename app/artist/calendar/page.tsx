'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '../../../components/AppContext';
import { createClient } from '../../../lib/supabase/client';
import ArtistHeader from '../../../components/artist/ArtistHeader';
import ArtistMobileNav from '../../../components/artist/ArtistMobileNav';
import ArtistAppointmentDetailDrawer, { ArtistSessionDetail } from '../../../components/artist/ArtistAppointmentDetailDrawer';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipLightbox from '@/components/common/PaymentSlipLightbox';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import { parseNoteWithPreferredTime } from '@/lib/noteUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import { getTattooSizeCategory } from '@/lib/utils/tattooDuration';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Layers, 
  RefreshCw,
  Eye,
  Search,
  TriangleAlert,
  CalendarDays,
  LayoutList
} from 'lucide-react';
import { 
  getTodayBangkokStr, 
  getDateStrBangkok, 
  formatDateBangkok, 
  formatTimeBangkok, 
  THAI_MONTHS_FULL,
  resolveBookingCalendarStatus 
} from '@/components/admin/calendar/calendarUtils';
import { getDepositDeadlineInfo, isConfirmedDepositBooking } from '@/components/portal/portalUtils';
import {
  getPendingRescheduleRequest,
  isRescheduleRequestUiEnabled,
  readAll,
  subscribeRescheduleRequests,
} from '@/lib/reschedule/rescheduleRequestStore';

function isDepositExpired(booking?: any, estimate?: any, session?: any): boolean {
  const status = booking?.status || estimate?.status || session?.status;
  if (!status) return false;

  if (status === 'EXPIRED') return true;

  if (status === 'WAITING_DEPOSIT' || status === 'PENDING_DEPOSIT') {
    const approvedAt = booking?.approved_at || estimate?.accepted_at || estimate?.quoted_at;
    const createdAt = booking?.created_at || estimate?.created_at || session?.created_at;
    const requestedDate = booking?.requested_date || estimate?.preferred_date || (session?.start_at ? session.start_at.slice(0, 10) : null);
    const requestedStartTime = booking?.requested_start_time || estimate?.preferred_time || (session?.start_at ? session.start_at.slice(11, 19) : null);

    const dlInfo = getDepositDeadlineInfo(approvedAt, createdAt, requestedDate, requestedStartTime);
    return dlInfo?.isExpired ?? false;
  }

  return false;
}

function ArtistCalendarPageContent() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();
  const searchParams = useSearchParams();

  // View Switcher State ('calendar' | 'queue')
  const [viewMode, setViewMode] = useState<'calendar' | 'queue'>('calendar');

  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'queue' || viewParam === 'list') {
      setViewMode('queue');
    } else if (viewParam === 'calendar') {
      setViewMode('calendar');
    }
  }, [searchParams]);

  const handleSwitchView = (mode: 'calendar' | 'queue') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', mode);
      window.history.replaceState(null, '', url.toString());
    }
  };

  // Loading & Data States
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [queueSessions, setQueueSessions] = useState<any[]>([]);
  const [bookingsMap, setBookingsMap] = useState<Map<string, any>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, any>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const [estimatesMap, setEstimatesMap] = useState<Map<string, any>>(new Map());
  const [flashReservationsMap, setFlashReservationsMap] = useState<Map<string, any>>(new Map());
  const [paymentSummaryMap, setPaymentSummaryMap] = useState<Map<string, any>>(new Map());
  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  // Month Calendar View State
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth()); // 0-indexed
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => getTodayBangkokStr());

  // Queue List Filter & Search State
  const [queueFilter, setQueueFilter] = useState<'ALL' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer & Lightbox States
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<ArtistSessionDetail | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeLightboxSlipPath, setActiveLightboxSlipPath] = useState<string | null>(null);
  const [, setRescheduleTick] = useState(0);

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

  // Comprehensive Data Fetching for Artist
  const fetchArtistData = useCallback(async () => {
    if (!isAuthorized || !staffArtistId) return;
    setLoading(true);

    try {
      // 1. Query booking_sessions
      const { data: dbSessions, error: sessErr } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('artist_id', staffArtistId)
        .order('start_at', { ascending: true });

      if (sessErr) console.error('Error fetching artist sessions:', sessErr);
      const sessionList = dbSessions ? [...dbSessions] : [];

      // 2. Query bookings explicitly scoped to staffArtistId
      const { data: bData, error: bErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('artist_id', staffArtistId);

      if (bErr) console.error('Error fetching artist bookings:', bErr);

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
          .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, work_type, estimated_min_price, estimated_max_price, price_estimated_at, request_type, has_medical_condition, medical_condition_note, has_allergy, allergy_note')
          .in('id', estimateIds);
        dbEstimates = estData || [];
      }
      const estMap = new Map<string, any>();
      dbEstimates.forEach((e: any) => estMap.set(e.id, e));
      setEstimatesMap(estMap);

      // 3.5 Query flash reservations via RPC
      const { data: flashRpcData } = await supabase
        .rpc('artist_get_flash_reservations', { p_artist_id: staffArtistId });

      const artistFlashRes = (flashRpcData || []).map((res: any) => ({
        ...res,
        flash_designs: {
          id: res.flash_design_id,
          title: res.flash_design_title,
          style: res.flash_design_style,
          image_url: res.flash_design_image_url,
          price: res.flash_design_price,
          deposit_amount: res.flash_design_deposit_amount,
          width_cm: res.flash_design_width_cm || res.width_cm,
          height_cm: res.flash_design_height_cm || res.height_cm,
          artist_id: res.flash_design_artist_id,
        }
      }));

      const flashResIds = Array.from(new Set(dbBookings.map((b: any) => b.flash_reservation_id).filter(Boolean)));
      let frMap = new Map<string, any>();
      artistFlashRes.forEach((fr: any) => { if (fr.id) frMap.set(fr.id, fr); });
      if (flashResIds.length > 0) {
        const { data: frData } = await supabase
          .from('flash_reservations')
          .select('*, flash_designs(*)')
          .in('id', flashResIds);
        (frData || []).forEach((fr: any) => {
          if (fr.id && !frMap.has(fr.id)) frMap.set(fr.id, fr);
        });
      }
      setFlashReservationsMap(frMap);

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

        const { data: cData } = await supabase
          .from('customers')
          .select('user_id, display_name, first_name, last_name, phone, email, date_of_birth, eligibility_confirmed_at, profile_completed_at, has_medical_condition, has_allergy')
          .in('user_id', customerUserIds);

        (cData || []).forEach((c: any) => {
          const existing = cMap.get(c.user_id) || {};
          cMap.set(c.user_id, { ...existing, ...c });
        });

        const { data: pData } = await supabase
          .from('profiles')
          .select('user_id, display_name, email, phone, date_of_birth')
          .in('user_id', customerUserIds);

        (pData || []).forEach((p: any) => {
          const existing = pMap.get(p.user_id) || {};
          pMap.set(p.user_id, { ...existing, ...p });
        });

        setCustomersMap(cMap);
        setProfilesMap(pMap);
      }

      // 5. Financial Summary & Submissions
      const dbBookingIds = dbBookings.map((b: any) => b.id);
      const sumMap = new Map<string, any>();
      let pendingSubs: any[] = [];
      if (dbBookingIds.length > 0) {
        const { data: sumData } = await supabase
          .from('booking_payment_summary')
          .select('*')
          .in('booking_id', dbBookingIds);
        (sumData || []).forEach((s: any) => sumMap.set(s.booking_id, s));
        setPaymentSummaryMap(sumMap);

        const { data: subData } = await supabase
          .from('booking_payment_submissions')
          .select('*')
          .in('booking_id', dbBookingIds)
          .eq('status', 'PENDING');
        pendingSubs = subData || [];
        setPendingSubmissions(pendingSubs);
      }

      // Filter sessions for Confirmed-Deposit queues only
      const pendingSubBookingIds = new Set(
        pendingSubs.map((sub: any) => sub.booking_id)
      );
      const confirmedSessions: any[] = [];
      const queueSessionsList: any[] = [];

      sessionList.forEach((s: any) => {
        const b = bMap.get(s.booking_id);
        if (!b) return;
        // Strictly protect Artist Scope
        if (b.artist_id !== staffArtistId && s.artist_id !== staffArtistId) return;

        // Allow cancelled sessions of this artist's cancelled bookings for queue/table history
        if (b.status === 'CANCELLED') {
          queueSessionsList.push(s);
        }

        if (['CANCELLED', 'REJECTED', 'EXPIRED', 'PENDING', 'WAITING_DEPOSIT'].includes(b.status) || s.status === 'CANCELLED') return;
        if (pendingSubBookingIds.has(b.id)) return;

        const estimate = b.estimate_request_id ? estMap.get(b.estimate_request_id) : null;
        const paymentSummary = sumMap.get(b.id) || null;

        const isConfirmed = isConfirmedDepositBooking(b, estimate, s, paymentSummary);
        if (isConfirmed || b.status === 'COMPLETED') {
          confirmedSessions.push(s);
          queueSessionsList.push(s);
        }
      });

      // Synthesize virtual sessions ONLY for confirmed/completed/cancelled bookings without sessions
      const existingSessionBookingIds = new Set(confirmedSessions.map((s: any) => s.booking_id));
      const existingQueueBookingIds = new Set(queueSessionsList.map((s: any) => s.booking_id));
      dbBookings.forEach((b: any) => {
        // Strictly protect Artist Scope
        if (b.artist_id !== staffArtistId) return;
        if (pendingSubBookingIds.has(b.id)) return;

        const estimate = b.estimate_request_id ? estMap.get(b.estimate_request_id) : null;
        const paymentSummary = sumMap.get(b.id) || null;
        const isConfirmed = isConfirmedDepositBooking(b, estimate, undefined, paymentSummary);

        const reqDate = b.requested_date || getTodayBangkokStr();
        const reqTime = b.requested_start_time || '10:00:00';
        const startAtStr = reqDate.includes('T') ? reqDate : `${reqDate}T${reqTime.length === 5 ? reqTime + ':00' : reqTime}+07:00`;

        if (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status) && !existingSessionBookingIds.has(b.id)) {
          if (isConfirmed || b.status === 'COMPLETED') {
            const vSess = {
              id: `virtual-${b.id}`,
              booking_id: b.id,
              artist_id: b.artist_id,
              session_number: 1,
              start_at: startAtStr,
              end_at: startAtStr,
              status: b.status === 'COMPLETED' ? 'COMPLETED' : b.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SCHEDULED',
              created_at: b.created_at,
              updated_at: b.updated_at,
              is_virtual: true
            };
            confirmedSessions.push(vSess);
            if (!existingQueueBookingIds.has(b.id)) {
              queueSessionsList.push(vSess);
            }
          }
        }

        // For cancelled bookings without sessions in queueSessionsList:
        if (b.status === 'CANCELLED' && !existingQueueBookingIds.has(b.id)) {
          queueSessionsList.push({
            id: `virtual-cancel-${b.id}`,
            booking_id: b.id,
            artist_id: b.artist_id,
            session_number: 1,
            start_at: startAtStr,
            end_at: startAtStr,
            status: 'CANCELLED',
            created_at: b.created_at,
            updated_at: b.updated_at,
            is_virtual: true
          });
        }
      });

      setSessions(confirmedSessions);
      setQueueSessions(queueSessionsList);

      // 6. Query artist_blocked_dates
      const { data: bDatesData } = await supabase
        .from('artist_blocked_dates')
        .select('blocked_date')
        .eq('artist_id', staffArtistId);

      setBlockedDates((bDatesData || []).map((d: any) => d.blocked_date));
    } catch (err) {
      console.error('Exception fetching artist data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, staffArtistId]);

  useEffect(() => {
    if (isAuthorized && staffArtistId) {
      fetchArtistData();
    }
  }, [isAuthorized, staffArtistId, fetchArtistData]);

  useEffect(() => {
    if (!isRescheduleRequestUiEnabled()) return;
    const getApprovedSig = () =>
      readAll()
        .filter((r) => r.status === 'APPROVED')
        .map((r) => `${r.id}:${r.reviewed_at || ''}`)
        .sort()
        .join('|');
    let lastApprovedSig = getApprovedSig();

    return subscribeRescheduleRequests(() => {
      setRescheduleTick((t) => t + 1);
      const nextApprovedSig = getApprovedSig();
      if (nextApprovedSig !== lastApprovedSig) {
        lastApprovedSig = nextApprovedSig;
        if (isAuthorized && staffArtistId) {
          fetchArtistData();
        }
      }
    });
  }, [isAuthorized, staffArtistId, fetchArtistData]);

  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  // Map sessions by date string YYYY-MM-DD
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    const pendingSubBookingIds = new Set(
      (pendingSubmissions || []).map((sub: any) => sub.booking_id)
    );
    sessions.forEach((s) => {
      const booking = bookingsMap.get(s.booking_id);
      if (!booking) return;
      if (['CANCELLED', 'REJECTED', 'EXPIRED', 'PENDING', 'WAITING_DEPOSIT'].includes(booking.status) || s.status === 'CANCELLED') {
        return;
      }
      if (pendingSubBookingIds.has(booking.id)) {
        return;
      }
      const estimate = booking.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
      if (isDepositExpired(booking, estimate, s)) {
        return;
      }
      const paymentSummary = paymentSummaryMap.get(booking.id);
      if (!isConfirmedDepositBooking(booking, estimate, s, paymentSummary) && booking.status !== 'COMPLETED') {
        return;
      }
      const dStr = getDateStrBangkok(s.start_at);
      if (!map.has(dStr)) map.set(dStr, []);
      map.get(dStr)!.push(s);
    });
    return map;
  }, [sessions, bookingsMap, estimatesMap, paymentSummaryMap, pendingSubmissions]);

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

  const blockedDatesSet = useMemo(() => new Set(blockedDates), [blockedDates]);

  // Calendar Grid Days Calculation (Month View: 7 Columns Mon-Sun)
  const THAI_DAYS_MON_FIRST = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

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

  const selectedDateSessions = useMemo(() => {
    return sessionsByDate.get(selectedDateStr) || [];
  }, [sessionsByDate, selectedDateStr]);

  // Month Navigation Handlers
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

  // Helper Display Cleanups
  const getCleanCustomerName = (uid?: string | null) => {
    if (!uid) return 'ลูกค้า';
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
    return 'ลูกค้า (ไม่ระบุชื่อ)';
  };

  const getCustomerPhone = (uid?: string | null) => {
    if (!uid) return '';
    const c = customersMap.get(uid);
    const p = profilesMap.get(uid);
    const phone = p?.phone || c?.phone || '';
    return phone ? formatThaiPhoneForDisplay(phone) : '';
  };

  const getIsAgeConfirmed = (uid?: string | null) => {
    if (!uid) return undefined;
    const c = customersMap.get(uid);
    if (c?.eligibility_confirmed_at || c?.profile_completed_at) return true;
    return undefined;
  };

  const getBookingStatusBadge = (
    bookingStatus?: string,
    totalSessionsCount: number = 1,
    bookingId?: string
  ) => {
    switch (bookingStatus) {
      case 'IN_PROGRESS':
        return {
          label: 'กำลังสัก',
          className: 'bg-[#9C2F2F]/20 text-[#D64545] border border-[#9C2F2F]/60 animate-pulse',
        };
      case 'COMPLETED':
        return {
          label: 'งานเสร็จสิ้น',
          className: 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80',
        };
      case 'REJECTED':
        return {
          label: 'ปฏิเสธ',
          className: 'bg-red-950/50 text-red-400 border border-red-900/60',
        };
      case 'EXPIRED':
        return {
          label: 'หมดเวลาชำระมัดจำ',
          className: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
        };
      case 'CANCELLED':
        return {
          label: 'ยกเลิก',
          className: 'bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A]',
        };
      case 'CONFIRMED':
      default: {
        const hasPendingReschedule = Boolean(
          bookingId && isRescheduleRequestUiEnabled() && getPendingRescheduleRequest(bookingId)
        );
        if (hasPendingReschedule) {
          return {
            label: 'ขอเลื่อนนัด',
            className: 'bg-amber-500/15 text-amber-300 border border-amber-400/40',
          };
        }
        return {
          label: 'นัดหมายแล้ว',
          className: 'bg-sky-500/15 text-sky-300 border border-sky-400/40',
        };
      }
    }
  };

  const formatStartOnlyTime = (startAt: string) => {
    const raw = formatTimeBangkok(startAt);
    const clean = raw.replace(/\s*น\.?$/gi, '').trim();
    return `เวลานัด ${clean} น.`;
  };

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

  const getPlacementDisplay = (sess: any) => {
    const booking = bookingsMap.get(sess.booking_id);
    const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
    const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
    return booking?.placement || flashRes?.placement || estimate?.placement || 'ไม่ระบุตำแหน่ง';
  };

  // Queue List Calculations
  const resolveQueueOperationalStatus = (
    sessStatus: string,
    bookingStatus?: string
  ): 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' => {
    if (sessStatus === 'CANCELLED' || bookingStatus === 'CANCELLED') return 'CANCELLED';
    if (sessStatus === 'COMPLETED' || bookingStatus === 'COMPLETED') return 'COMPLETED';
    if (sessStatus === 'IN_PROGRESS') return 'IN_PROGRESS';
    return 'SCHEDULED';
  };

  const validQueueSessions = useMemo(() => {
    const pendingSubBookingIds = new Set(
      (pendingSubmissions || []).map((sub: any) => sub.booking_id)
    );
    return queueSessions.filter((sess: any) => {
      const booking = bookingsMap.get(sess.booking_id);
      if (!booking) return false;
      // Strictly protect Artist Scope
      if (booking.artist_id !== staffArtistId) return false;

      // Allow CANCELLED bookings belonging to this artist
      if (booking.status === 'CANCELLED') {
        return true;
      }

      // For non-cancelled bookings, skip individual cancelled sessions
      if (sess.status === 'CANCELLED') {
        return false;
      }

      if (['REJECTED', 'EXPIRED', 'PENDING', 'WAITING_DEPOSIT'].includes(booking.status)) {
        return false;
      }
      if (pendingSubBookingIds.has(booking.id)) {
        return false;
      }
      const estimate = booking.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
      if (isDepositExpired(booking, estimate, sess)) return false;
      const paymentSummary = paymentSummaryMap.get(booking.id);
      if (!isConfirmedDepositBooking(booking, estimate, sess, paymentSummary) && booking.status !== 'COMPLETED') {
        return false;
      }
      if (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) return true;
      return false;
    });
  }, [queueSessions, bookingsMap, estimatesMap, paymentSummaryMap, pendingSubmissions, staffArtistId]);

  const groupedQueueBookings = useMemo(() => {
    const map = new Map<string, any[]>();
    validQueueSessions.forEach((sess: any) => {
      if (!map.has(sess.booking_id)) map.set(sess.booking_id, []);
      map.get(sess.booking_id)!.push(sess);
    });

    const result: any[] = [];
    map.forEach((bSessions, bookingId) => {
      const booking = bookingsMap.get(bookingId);
      if (!booking) return;
      if (booking.artist_id !== staffArtistId) return;

      const sortedSessions = [...bSessions].sort(
        (a, b) => (a.session_number || 0) - (b.session_number || 0)
      );

      const activeSessions = sortedSessions.filter((s) => s.status !== 'CANCELLED');
      const scheduledSession = sortedSessions.find((s) => s.status === 'SCHEDULED');
      const inProgressSession = sortedSessions.find((s) => s.status === 'IN_PROGRESS');
      let displaySession = inProgressSession || scheduledSession || (activeSessions.length > 0 ? activeSessions[activeSessions.length - 1] : sortedSessions[sortedSessions.length - 1]);

      if (!displaySession || !displaySession.start_at) {
        const reqDate = booking.requested_date || getTodayBangkokStr();
        const reqTime = booking.requested_start_time || '10:00:00';
        const startAtStr = reqDate.includes('T') ? reqDate : `${reqDate}T${reqTime.length === 5 ? reqTime + ':00' : reqTime}+07:00`;
        displaySession = {
          id: `fallback-${booking.id}`,
          booking_id: booking.id,
          artist_id: booking.artist_id,
          session_number: 1,
          start_at: startAtStr,
          end_at: startAtStr,
          status: booking.status,
          created_at: booking.created_at,
          updated_at: booking.updated_at,
        };
      }

      const opStatus = resolveBookingCalendarStatus(sortedSessions, booking.status);

      result.push({
        booking_id: bookingId,
        booking,
        displaySession,
        allSessions: sortedSessions,
        totalSessionsCount: sortedSessions.length,
        derived_op_status: opStatus,
      });
    });

    return result;
  }, [validQueueSessions, bookingsMap, staffArtistId]);

  // Selected Target YYYY-MM
  const targetYearMonth = useMemo(() => {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  }, [currentYear, currentMonth]);

  // Bookings with relevant session date in the selected month
  const monthQueueBookings = useMemo(() => {
    return groupedQueueBookings.filter((item: any) => {
      const dateStr = item.displaySession?.start_at ? getDateStrBangkok(item.displaySession.start_at) : null;
      return dateStr ? dateStr.startsWith(targetYearMonth) : false;
    });
  }, [groupedQueueBookings, targetYearMonth]);

  const queueCounts = useMemo(() => {
    let all = monthQueueBookings.length;
    let scheduled = 0;
    let completed = 0;
    let cancelled = 0;

    monthQueueBookings.forEach((item: any) => {
      const op = item.derived_op_status;
      if (op === 'COMPLETED') completed++;
      else if (op === 'CANCELLED') cancelled++;
      else if (op === 'SCHEDULED' || op === 'IN_PROGRESS') scheduled++;
    });

    return { all, scheduled, completed, cancelled };
  }, [monthQueueBookings]);

  const filteredQueueBookings = useMemo(() => {
    let list = [...monthQueueBookings];

    if (queueFilter === 'SCHEDULED') {
      list = list.filter((item) => item.derived_op_status === 'SCHEDULED' || item.derived_op_status === 'IN_PROGRESS');
    } else if (queueFilter === 'COMPLETED') {
      list = list.filter((item) => item.derived_op_status === 'COMPLETED');
    } else if (queueFilter === 'CANCELLED') {
      list = list.filter((item) => item.derived_op_status === 'CANCELLED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) => {
        const cName = getCleanCustomerName(item.booking.customer_user_id).toLowerCase();
        const bId = item.booking.id.toLowerCase();
        const estimate = item.booking.estimate_request_id ? estimatesMap.get(item.booking.estimate_request_id) : null;
        const flashRes = item.booking.flash_reservation_id ? flashReservationsMap.get(item.booking.flash_reservation_id) : null;
        const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
        const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title || '';
        const title = (item.booking.artwork_title || flashTitle || '').toLowerCase();
        return cName.includes(q) || bId.includes(q) || title.includes(q);
      });
    }

    if (queueFilter === 'SCHEDULED') {
      list.sort((a, b) => (new Date(a.displaySession?.start_at || 0).getTime()) - (new Date(b.displaySession?.start_at || 0).getTime()));
    } else {
      list.sort((a, b) => (new Date(b.displaySession?.start_at || 0).getTime()) - (new Date(a.displaySession?.start_at || 0).getTime()));
    }

    return list;
  }, [monthQueueBookings, queueFilter, searchQuery, estimatesMap, flashReservationsMap, customersMap, profilesMap]);

  const renderHealthAlertBadge = (booking: any, estimate: any, customer: any, opStatus?: string) => {
    const hasMed = estimate?.has_medical_condition ?? customer?.has_medical_condition;
    const hasAll = estimate?.has_allergy ?? customer?.has_allergy;

    const isAlert = hasMed === true || hasAll === true;
    const isHealthy = hasMed === false && hasAll === false;

    const currentStatus = opStatus || booking?.status;
    const isTerminal = currentStatus === 'COMPLETED' || currentStatus === 'CANCELLED' || currentStatus === 'EXPIRED' || currentStatus === 'REJECTED';

    // CANCELLED queues: still render real health badge, but in Neutral Gray (display only)
    const isCancelled = currentStatus === 'CANCELLED' || booking?.status === 'CANCELLED';
    const cancelledNeutralClass = "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 shrink-0";

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
          className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-help shrink-0"
        >
          <TriangleAlert size={11} className="text-amber-400 shrink-0" />
          <span>มีข้อมูล</span>
        </span>
      );
    }

    if (isHealthy) {
      return (
        <span className={isTerminal ? "bg-zinc-900/60 text-zinc-500 border border-zinc-800/80 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center shrink-0" : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center shrink-0"}>
          ปกติ
        </span>
      );
    }

    return (
      <span className={isTerminal ? "bg-zinc-900/60 text-zinc-500 border border-zinc-800/80 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center shrink-0" : "bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center shrink-0"}>
        ไม่ระบุ
      </span>
    );
  };

  const renderStatusBadge = (
    derived_op_status: string,
    totalSessionsCount: number = 1,
    bookingId?: string
  ) => {
    switch (derived_op_status) {
      case 'IN_PROGRESS':
        return (
          <span className="bg-[#9C2F2F]/20 text-[#D64545] border border-[#9C2F2F]/60 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D64545] animate-pulse" />
            กำลังสัก
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 inline-flex items-center">
            งานเสร็จสิ้น
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 inline-flex items-center">
            ยกเลิก
          </span>
        );
      case 'SCHEDULED':
      default: {
        const hasPendingReschedule = Boolean(
          bookingId && isRescheduleRequestUiEnabled() && getPendingRescheduleRequest(bookingId)
        );
        if (hasPendingReschedule) {
          return (
            <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 inline-flex items-center">
              ขอเลื่อนนัด
            </span>
          );
        }
        return (
          <span className="bg-sky-500/15 text-sky-300 border border-sky-400/40 px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 inline-flex items-center">
            นัดหมายแล้ว
          </span>
        );
      }
    }
  };

  // Open detail drawer
  const handleOpenDetail = (sess: any) => {
    const booking = bookingsMap.get(sess.booking_id);
    const customerUserId = booking?.customer_user_id;
    const customer = customerUserId ? customersMap.get(customerUserId) : null;
    const prof = customerUserId ? profilesMap.get(customerUserId) : null;
    const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
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

    const pool = new Map<string, any>();
    sessions.forEach((s: any) => pool.set(s.id, s));
    queueSessions.forEach((s: any) => pool.set(s.id, s));
    const siblingSessions = Array.from(pool.values())
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

    const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
    const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
    const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
    const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;
    const flashStyle = flashDesignObj?.style || flashRes?.flash_design_style;
    const flashWidth = booking?.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? flashRes?.flash_design_width_cm ?? estimate?.width_cm ?? null;
    const flashHeight = booking?.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? flashRes?.flash_design_height_cm ?? estimate?.height_cm ?? null;

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
      booking_source: booking?.booking_source,
      artwork_title: booking?.artwork_title || (flashTitle ? `ลาย Flash: ${flashTitle}` : (booking?.flash_reservation_id ? 'ลาย Flash' : null)),
      artwork_image_url: flashImgUrl || booking?.artwork_image_url || null,
      placement: booking?.placement || flashRes?.placement || estimate?.placement || null,
      width_cm: flashWidth,
      height_cm: flashHeight,
      description: parseNoteWithPreferredTime(estimate?.description || booking?.description || flashRes?.customer_note).cleanNote || null,
      customer_note: booking?.customer_note || flashRes?.customer_note,
      staff_note: booking?.staff_note || flashRes?.admin_note,

      customer_name: getCleanCustomerName(customerUserId),
      customer_phone: customer?.phone || prof?.phone || null,
      customer_email: prof?.email || customer?.email || null,
      customer_dob: customer?.date_of_birth || prof?.date_of_birth || null,
      date_of_birth: customer?.date_of_birth || prof?.date_of_birth || null,
      is_age_confirmed: getIsAgeConfirmed(customerUserId),

      estimate_request_id: booking?.estimate_request_id,
      request_type: booking?.flash_reservation_id ? 'FLASH' : (estimate?.request_type || null),
      work_type: estimate?.work_type || (booking?.flash_reservation_id ? 'FLASH' : null),
      style: flashStyle || estimate?.style || estimate?.style_preference || booking?.style_preference || null,
      reference_images: flashImgUrl ? [flashImgUrl] : (estimate?.reference_images || (booking?.artwork_image_url ? [booking.artwork_image_url] : null)),

      quoted_price: summary?.quoted_price ?? estimate?.quoted_price ?? flashRes?.flash_design_price ?? flashDesignObj?.price ?? null,
      estimated_min_price: estimate?.estimated_min_price ?? null,
      estimated_max_price: estimate?.estimated_max_price ?? null,
      price_estimated_at: estimate?.price_estimated_at ?? null,
      deposit_required: summary?.deposit_required ?? estimate?.deposit_required ?? 500,
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
    <div className="min-h-screen bg-[#0E0D0C] text-[#ECE4D3] font-prompt flex flex-col md:pl-64 pb-20 md:pb-10 overflow-x-hidden">
      {/* Header */}
      <ArtistHeader />

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Top Header & View Switcher Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#12100E] border border-[#4A443A]/40 p-4 rounded-xl shadow-lg">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#ECE4D3] flex items-center gap-2">
              <CalendarIcon size={20} className="text-red-500" />
              <span>คิวงานและปฏิทิน</span>
            </h1>
            <p className="text-xs text-[#A89F91] mt-0.5">
              จัดการตารางคิวงาน นัดหมาย และดูปฏิทินรอบสักฝั่งช่าง
            </p>
          </div>

          {/* View Switcher Toggle Buttons & Refresh */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* View Switcher Tabs */}
            <div className="flex items-center p-1 bg-[#171512] border border-[#4A443A]/40 rounded-lg space-x-1">
              <button
                type="button"
                onClick={() => handleSwitchView('calendar')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'calendar'
                    ? 'bg-red-950/80 text-red-200 border border-red-800/80 shadow-xs'
                    : 'text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#1A1815]'
                }`}
              >
                <CalendarDays size={14} />
                <span>ปฏิทิน</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchView('queue')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'queue'
                    ? 'bg-red-950/80 text-red-200 border border-red-800/80 shadow-xs'
                    : 'text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#1A1815]'
                }`}
              >
                <LayoutList size={14} />
                <span>รายการคิว ({queueCounts.all})</span>
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

        {/* ========================================================================= */}
        {/* VIEW MODE 1: CALENDAR VIEW ("ปฏิทิน") */}
        {/* ========================================================================= */}
        {viewMode === 'calendar' && (
          <div className="space-y-4">
            {/* Month Navigation Row */}
            <div className="flex items-center justify-between bg-[#171512] border border-[#4A443A]/40 px-4 py-2.5 rounded-xl shadow-xs">
              <div className="text-sm sm:text-base font-bold text-[#ECE4D3]">
                {THAI_MONTHS_FULL[currentMonth]} {currentYear + 543}
              </div>

              <div className="flex items-center space-x-1 bg-[#12100E] border border-[#4A443A]/40 p-1 rounded-lg">
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
            </div>

            {/* Layout Grid: Left Month Calendar (Desktop lg:col-span-8) + Right Panel (Desktop lg:col-span-4) */}
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
                                  const timeStr = formatTimeBangkok(s.start_at).replace(/\s*น\.?$/gi, '').trim();
                                  const isCompleted = s.status === 'COMPLETED';
                                  const isInProgress = s.status === 'IN_PROGRESS';
                                  const hasPendingReschedule = Boolean(
                                    !isCompleted &&
                                    !isInProgress &&
                                    s.booking_id &&
                                    isRescheduleRequestUiEnabled() &&
                                    getPendingRescheduleRequest(s.booking_id)
                                  );
                                  const pillClass = isInProgress
                                    ? 'bg-[#9C2F2F]/20 text-[#D64545] border-[#9C2F2F]/60'
                                    : isCompleted
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80'
                                    : hasPendingReschedule
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-400/40'
                                    : 'bg-sky-500/15 text-sky-300 border-sky-400/40';

                                  return (
                                    <div
                                      key={s.id}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border truncate flex items-center justify-between gap-1 ${pillClass}`}
                                      title={`${hasPendingReschedule ? 'ขอเลื่อนนัด • ' : ''}รอบที่ ${sessNum} • ${timeStr} น.`}
                                    >
                                      <span className="truncate font-mono font-bold">
                                        {hasPendingReschedule ? 'ขอเลื่อนนัด' : `รอบ ${sessNum}`}
                                      </span>
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

                              {/* Mobile View: Compact Status Badge */}
                              {(() => {
                                const sessionStatusInfos = activeSessions.map((s: any) => {
                                  const booking = bookingsMap.get(s.booking_id);
                                  const rawStatusKey = booking?.status || s.status || 'CONFIRMED';
                                  const hasPendingReschedule = Boolean(
                                    rawStatusKey !== 'COMPLETED' &&
                                    rawStatusKey !== 'IN_PROGRESS' &&
                                    rawStatusKey !== 'CANCELLED' &&
                                    rawStatusKey !== 'REJECTED' &&
                                    rawStatusKey !== 'EXPIRED' &&
                                    s.booking_id &&
                                    isRescheduleRequestUiEnabled() &&
                                    getPendingRescheduleRequest(s.booking_id)
                                  );
                                  const statusKey = hasPendingReschedule ? 'RESCHEDULE_PENDING' : rawStatusKey;
                                  let colorClass = 'text-sky-300';
                                  if (statusKey === 'RESCHEDULE_PENDING') {
                                    colorClass = 'text-amber-300';
                                  } else if (statusKey === 'COMPLETED') {
                                    colorClass = 'text-emerald-300';
                                  } else if (statusKey === 'IN_PROGRESS') {
                                    colorClass = 'text-[#D64545]';
                                  } else if (statusKey === 'CANCELLED') {
                                    colorClass = 'text-[#7A7265]';
                                  } else if (statusKey === 'REJECTED') {
                                    colorClass = 'text-red-400';
                                  } else if (statusKey === 'EXPIRED') {
                                    colorClass = 'text-zinc-400';
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
                            <div className="text-[9.5px] text-rose-300 bg-rose-950/70 border border-rose-800/70 px-1 py-0.5 rounded truncate">
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

              {/* Right: Selected Date Appointment List (Desktop lg:col-span-4) */}
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
                      const bBadge = getBookingStatusBadge(booking?.status, maxNum, sess.booking_id);

                      return (
                        <div
                          key={sess.id}
                          onClick={() => handleOpenDetail(sess)}
                          className="group bg-[#171512] border border-[#4A443A]/40 hover:border-red-600/60 p-3.5 sm:p-4 rounded-xl transition-all cursor-pointer space-y-2.5 shadow-md"
                        >
                          {/* Session Number & Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-mono font-bold text-[#ECE4D3] bg-[#12100E] px-2.5 py-0.5 rounded border border-[#4A443A]/40">
                                รอบที่ {sessNum}
                              </span>
                              {(() => {
                                const hasPendingReschedule = Boolean(
                                  sess.status !== 'COMPLETED' &&
                                  sess.status !== 'IN_PROGRESS' &&
                                  sess.booking_id &&
                                  isRescheduleRequestUiEnabled() &&
                                  getPendingRescheduleRequest(sess.booking_id)
                                );
                                const sessBadge = sess.status === 'COMPLETED'
                                  ? { label: 'งานเสร็จสิ้น', className: 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80' }
                                  : sess.status === 'IN_PROGRESS'
                                  ? { label: 'กำลังสัก', className: 'bg-[#9C2F2F]/20 text-[#D64545] border border-[#9C2F2F]/60 animate-pulse' }
                                  : hasPendingReschedule
                                  ? { label: 'ขอเลื่อนนัด', className: 'bg-amber-500/15 text-amber-300 border border-amber-400/40' }
                                  : { label: 'นัดหมายแล้ว', className: 'bg-sky-500/15 text-sky-300 border border-sky-400/40' };
                                return (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${sessBadge.className}`}>
                                    {sessBadge.label}
                                  </span>
                                );
                              })()}
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

                          {/* Artwork Title & Time */}
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
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW MODE 2: QUEUE LIST VIEW ("รายการคิว") */}
        {/* ========================================================================= */}
        {viewMode === 'queue' && (
          <div className="space-y-4">
            {/* Month Navigation Row */}
            <div className="flex items-center justify-between bg-[#171512] border border-[#4A443A]/40 px-4 py-2.5 rounded-xl shadow-xs">
              <div className="text-sm sm:text-base font-bold text-[#ECE4D3]">
                {THAI_MONTHS_FULL[currentMonth]} {currentYear + 543}
              </div>

              <div className="flex items-center space-x-1 bg-[#12100E] border border-[#4A443A]/40 p-1 rounded-lg">
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
            </div>

            <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
            {/* Filter Bar & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {[
                  { id: 'ALL', label: `ทั้งหมด (${queueCounts.all})` },
                  { id: 'SCHEDULED', label: `นัดหมายแล้ว (${queueCounts.scheduled})` },
                  { id: 'COMPLETED', label: `งานเสร็จสิ้น (${queueCounts.completed})` },
                  { id: 'CANCELLED', label: `ยกเลิก (${queueCounts.cancelled})` },
                ].map((pill) => {
                  const isSelected = queueFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setQueueFilter(pill.id as any)}
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

              {/* Search Bar */}
              <div className="relative min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อลูกค้า, ลายสัก, รหัส..."
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3]"
                />
              </div>
            </div>

            {/* Queue List Table / Cards */}
            {loading ? (
              <div className="py-12 text-center text-[#A89F91] bg-[#0E0D0C]/40 border border-dashed border-[#4A443A] rounded-lg animate-pulse text-xs">
                กำลังโหลดข้อมูลคิวงาน...
              </div>
            ) : filteredQueueBookings.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40 space-y-2">
                <CalendarIcon size={28} className="text-[#7A7265] mx-auto opacity-60" />
                <h4 className="text-xs sm:text-sm font-semibold text-[#ECE4D3]">ยังไม่มีคิวงาน</h4>
                <p className="text-[11px] text-[#7A7265] max-w-sm mx-auto">
                  รายการคิวงานและนัดหมายที่ยืนยันแล้วจะแสดงในส่วนนี้
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-[#ECE4D3]">
                    <thead className="bg-[#0E0D0C] text-[#7A7265] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
                      <tr>
                        <th className="py-3 px-3">รหัส / ลูกค้า</th>
                        <th className="py-3 px-3">งานที่จองและขนาด</th>
                        <th className="py-3 px-3">สไตล์</th>
                        <th className="py-3 px-3">วันและเวลานัด</th>
                        <th className="py-3 px-3 text-center">แจ้งเตือนสุขภาพ</th>
                        <th className="py-3 px-3">สถานะ</th>
                        <th className="py-3 px-3 text-center">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#4A443A]/50">
                      {filteredQueueBookings.map((item: any) => {
                        const { booking, displaySession, derived_op_status } = item;
                        const customerName = getCleanCustomerName(booking.customer_user_id);
                        const customer = booking.customer_user_id ? customersMap.get(booking.customer_user_id) : null;
                        const estimate = booking.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                        const flashRes = booking.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
                        const isFlash = Boolean(booking.flash_reservation_id || estimate?.request_type === 'FLASH');
                        
                        const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
                        const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
                        const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;
                        const artworkTitle = booking.artwork_title || (flashTitle ? `ลาย Flash: ${flashTitle}` : (isFlash ? 'ลาย Flash' : 'งานสัก Custom'));
                        const refImageSrc = flashImgUrl || booking.artwork_image_url || estimate?.reference_images?.[0] || null;

                        const width = booking.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? estimate?.width_cm ?? null;
                        const height = booking.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? estimate?.height_cm ?? null;
                        const sizeCategory = getTattooSizeCategory(booking.size_tier || estimate?.estimated_size_tier, width, height, booking.size_text);
                        const rawSizeText = booking.size_tier || estimate?.estimated_size_tier || booking.size_text || (sizeCategory ? `Size ${sizeCategory}` : null);
                        const sizeDisplay = (width || height || booking.size_tier || estimate?.estimated_size_tier || sizeCategory)
                          ? formatTattooSize(width, height, rawSizeText)
                          : 'ไม่ระบุขนาด';

                        const rawStyle = flashDesignObj?.style || flashRes?.flash_design_style || estimate?.style || estimate?.style_preference || booking.style_preference || '';
                        const styleName = rawStyle ? rawStyle.replace(/\s*custom\s*/gi, '').trim() : 'ไม่ระบุสไตล์';
                        const placement = booking.placement || flashRes?.placement || estimate?.placement || 'ไม่ระบุตำแหน่ง';

                        return (
                          <tr
                            key={`QUEUE-ROW-${booking.id}`}
                            onClick={() => handleOpenDetail(displaySession)}
                            className="cursor-pointer transition-colors hover:bg-[#1F1D1A]/60"
                          >
                            {/* 1. รหัส / ลูกค้า */}
                            <td className="py-3 px-3 text-[#A89F91]">
                              <span className="text-[10px] text-[#7A7265] font-mono block font-semibold">
                                #{booking.id.slice(0, 8).toUpperCase()}
                              </span>
                              <div className="font-semibold text-xs text-[#ECE4D3] mt-0.5">
                                {customerName}
                              </div>
                            </td>

                            {/* 2. งานที่จองและขนาด */}
                            <td className="py-3 px-3">
                              <div className="flex items-center space-x-2.5">
                                <div className="w-10 h-10 rounded-lg bg-[#0E0D0C] border border-[#4A443A] overflow-hidden shrink-0">
                                  <CustomerReferenceImage src={refImageSrc} alt="รูปงาน" className="w-full h-full object-cover" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-xs text-[#ECE4D3] truncate max-w-[180px]">
                                    {artworkTitle}
                                  </div>
                                  <div className="text-[11px] text-[#A89F91] truncate max-w-[180px]">
                                    {placement !== 'ไม่ระบุตำแหน่ง' ? `${placement} • ${sizeDisplay}` : sizeDisplay}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* 3. สไตล์ */}
                            <td className="py-3 px-3 text-[#A89F91]">
                              <div className="font-medium text-xs text-[#ECE4D3]">
                                {styleName}
                              </div>
                            </td>

                            {/* 4. วันและเวลานัด */}
                            <td className="py-3 px-3 text-[#A89F91]">
                              <div className="font-medium text-xs text-[#ECE4D3] flex items-center gap-1.5">
                                <CalendarIcon size={12} className="text-[#7A7265] shrink-0" />
                                <span>{formatDateBangkok(displaySession.start_at)}</span>
                              </div>
                              <div className="text-[11px] text-[#A89F91] font-mono mt-0.5 flex items-center gap-1.5">
                                <Clock size={11} className="text-[#7A7265] shrink-0" />
                                <span>{formatTimeBangkok(displaySession.start_at)}</span>
                              </div>
                            </td>

                            {/* 5. แจ้งเตือนสุขภาพ */}
                            <td className="py-3 px-3 text-center">
                              {renderHealthAlertBadge(booking, estimate, customer, derived_op_status)}
                            </td>

                            {/* 6. สถานะ */}
                            <td className="py-3 px-3">
                              {renderStatusBadge(derived_op_status, item.totalSessionsCount, booking.id)}
                            </td>

                            {/* 7. การจัดการ */}
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDetail(displaySession);
                                }}
                                className="px-2.5 py-1 text-[11px] font-medium bg-[#1F1D1A] hover:bg-[#2A2723] text-[#ECE4D3] border border-[#4A443A] hover:border-[#7A7265] rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>รายละเอียด</span>
                                <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-2.5">
                  {filteredQueueBookings.map((item: any) => {
                    const { booking, displaySession, derived_op_status } = item;
                    const customerName = getCleanCustomerName(booking.customer_user_id);
                    const customer = booking.customer_user_id ? customersMap.get(booking.customer_user_id) : null;
                    const estimate = booking.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                    const flashRes = booking.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
                    const isFlash = Boolean(booking.flash_reservation_id || estimate?.request_type === 'FLASH');
                    
                    const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
                    const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
                    const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;
                    const artworkTitle = booking.artwork_title || (flashTitle ? `ลาย Flash: ${flashTitle}` : (isFlash ? 'ลาย Flash' : 'งานสัก Custom'));
                    const refImageSrc = flashImgUrl || booking.artwork_image_url || estimate?.reference_images?.[0] || null;

                    const width = booking.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? estimate?.width_cm ?? null;
                    const height = booking.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? estimate?.height_cm ?? null;
                    const sizeCategory = getTattooSizeCategory(booking.size_tier || estimate?.estimated_size_tier, width, height, booking.size_text);
                    const rawSizeText = booking.size_tier || estimate?.estimated_size_tier || booking.size_text || (sizeCategory ? `Size ${sizeCategory}` : null);
                    const sizeDisplay = (width || height || booking.size_tier || estimate?.estimated_size_tier || sizeCategory)
                      ? formatTattooSize(width, height, rawSizeText)
                      : 'ไม่ระบุขนาด';

                    const rawStyle = flashDesignObj?.style || flashRes?.flash_design_style || estimate?.style || estimate?.style_preference || booking.style_preference || '';
                    const styleName = rawStyle ? rawStyle.replace(/\s*custom\s*/gi, '').trim() : 'ไม่ระบุสไตล์';
                    const placement = booking.placement || flashRes?.placement || estimate?.placement || 'ไม่ระบุตำแหน่ง';

                    return (
                      <div
                        key={`MOBILE-QUEUE-${booking.id}`}
                        onClick={() => handleOpenDetail(displaySession)}
                        className="bg-[#0E0D0C] border border-[#4A443A]/70 hover:border-[#7A7265] rounded-lg p-3.5 space-y-2.5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] text-[#7A7265] font-mono font-semibold">
                                #{booking.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span className="font-semibold text-xs text-[#ECE4D3] truncate">{customerName}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {renderHealthAlertBadge(booking, estimate, customer, derived_op_status)}
                            {renderStatusBadge(derived_op_status, item.totalSessionsCount, booking.id)}
                          </div>
                        </div>

                        <div className="flex items-center space-x-3 pt-1 border-t border-[#4A443A]/40">
                          <div className="w-11 h-11 rounded-lg bg-[#171512] border border-[#4A443A] overflow-hidden shrink-0">
                            <CustomerReferenceImage src={refImageSrc} alt="รูปงาน" className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <h4 className="text-xs font-semibold text-[#ECE4D3] truncate">{artworkTitle}</h4>
                            <p className="text-[11px] text-[#A89F91] truncate">
                              {placement !== 'ไม่ระบุตำแหน่ง' ? `${placement} • ` : ''}ขนาด: {sizeDisplay}
                            </p>
                            <p className="text-[11px] text-[#7A7265] truncate">
                              สไตล์: <span className="text-[#A89F91]">{styleName}</span>
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#4A443A]/40 flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-2 text-[#ECE4D3] font-mono text-[11px]">
                            <CalendarIcon size={12} className="text-[#7A7265]" />
                            <span>{formatDateBangkok(displaySession.start_at)}</span>
                            <span className="text-[#7A7265]">•</span>
                            <Clock size={11} className="text-[#7A7265]" />
                            <span className="text-[#A89F91]">{formatTimeBangkok(displaySession.start_at)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDetail(displaySession);
                            }}
                            className="px-2 py-0.5 text-[10px] font-semibold bg-[#1F1D1A] text-[#ECE4D3] border border-[#4A443A] rounded flex items-center gap-0.5"
                          >
                            <span>รายละเอียด</span>
                            <ChevronRight size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          </div>
        )}
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

      {/* Slip Lightbox */}
      <PaymentSlipLightbox
        isOpen={Boolean(activeLightboxSlipPath)}
        src={activeLightboxSlipPath}
        onClose={() => setActiveLightboxSlipPath(null)}
      />
    </div>
  );
}

export default function ArtistCalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0E0D0C] flex items-center justify-center font-prompt text-xs text-[#A89F91]">
          <span className="animate-pulse">กำลังโหลดข้อมูลคิวงานและปฏิทิน...</span>
        </div>
      }
    >
      <ArtistCalendarPageContent />
    </Suspense>
  );
}
