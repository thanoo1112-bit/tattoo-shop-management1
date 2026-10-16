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
  getEventStatusConfig,
  THAI_MONTHS_FULL,
  resolveBookingCalendarStatus,
} from './calendarUtils';
import CalendarToolbar from './CalendarToolbar';
import CalendarFilters from './CalendarFilters';
import MonthCalendarView from './MonthCalendarView';
import WeekCalendarView from './WeekCalendarView';
import DayAgendaView from './DayAgendaView';
import AdminQueueTableView from './AdminQueueTableView';
import AvailabilityBlockModal, { BlockedDateItem } from './AvailabilityBlockModal';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import BookingDetailPanel from '@/components/admin/requests/BookingDetailPanel';
import PaymentSubmissionReviewDrawer from '@/components/admin/payments/PaymentSubmissionReviewDrawer';
import { BookingItem } from '@/components/admin/requests/types';
import { PaymentSubmissionDetail } from '@/components/admin/payments/types';
import { fetchWorkQueueBookings, getActiveQueueSessionDateTime } from '@/components/admin/requests/bookingHydration';
import { isConfirmedDepositBooking } from '@/components/portal/portalUtils';
import {
  isRescheduleRequestUiEnabled,
  readAll,
  subscribeRescheduleRequests,
} from '@/lib/reschedule/rescheduleRequestStore';

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
  const [, setRescheduleTick] = useState(0);

  // Data State
  const [artists, setArtists] = useState<CalendarArtist[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDateItem[]>([]);
  const [sessions, setSessions] = useState<CalendarSessionEvent[]>([]);
  const [allBookings, setAllBookings] = useState<BookingItem[]>([]);
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

      // 1. Fetch Active Artists, Blocked Dates, Sessions, Bookings, Financials, and Pending Slips in Parallel
      const [artistsRes, blockedRes, sessionsRes, bookingsRes, financialsRes, pendingSubsRes] = await Promise.all([
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
            'id, status, customer_id, customer_user_id, artist_id, requested_date, requested_start_time, customer_note, admin_note, started_at, completed_at, created_at, approved_at, estimate_request_id'
          )
          .in('status', ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED']),
        supabase
          .from('booking_financial_summary')
          .select('booking_id, total_price, total_paid, balance_due, deposit_amount, deposit_status, quoted_price, deposit_required, paid_total, remaining_balance, deposit_paid, is_fully_paid'),
        supabase
          .from('booking_payment_submissions')
          .select('booking_id')
          .eq('status', 'PENDING'),
      ]);

      if (artistsRes.error) throw artistsRes.error;
      setArtists((artistsRes.data as CalendarArtist[]) || []);
      setBlockedDates((blockedRes.data as BlockedDateItem[]) || []);

      if (sessionsRes.error) throw sessionsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;

      const rawSessions = sessionsRes.data || [];
      const bookingsData = bookingsRes.data || [];
      const financialsData = financialsRes.data || [];
      const pendingSlipBookingIds = new Set(
        (pendingSubsRes?.data || []).map((p: any) => p.booking_id)
      );

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

      // Collect customer_user_ids and customer_ids for customer lookup
      const customerUids = Array.from(
        new Set(
          bookingsData
            .map((b) => b.customer_user_id)
            .filter((id): id is string => Boolean(id))
        )
      );
      const customerIds = Array.from(
        new Set(
          bookingsData
            .map((b) => b.customer_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let customersMap = new Map<string, any>();
      if (customerUids.length > 0 || customerIds.length > 0) {
        let query = supabase
          .from('customers')
          .select('id, user_id, display_name, phone, email, date_of_birth, has_medical_condition, medical_condition_note, medical_conditions, has_allergy, allergy_note, allergies, eligibility_confirmed_at, profile_completed_at');

        if (customerUids.length > 0 && customerIds.length > 0) {
          query = query.or(`user_id.in.(${customerUids.join(',')}),id.in.(${customerIds.join(',')})`);
        } else if (customerUids.length > 0) {
          query = query.in('user_id', customerUids);
        } else {
          query = query.in('id', customerIds);
        }

        const { data: customersData } = await query;

        if (customersData) {
          customersData.forEach((c) => {
            if (c.user_id) customersMap.set(c.user_id, c);
            if (c.id) customersMap.set(c.id, c);
          });
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
        // Skip terminal statuses
        if (b.status === 'CANCELLED' || b.status === 'REJECTED' || b.status === 'EXPIRED') {
          return;
        }

        const parentFinancial = financialsMap.get(b.id) || null;
        const parentEstimate = b.estimate_request_id
          ? estimatesMap.get(b.estimate_request_id) || null
          : null;

        // Calendar rule: Strictly reserved for confirmed deposit bookings and completed history.
        // WAITING_DEPOSIT, PENDING, and pending slip verification are NOT permitted in Calendar.
        const hasPendingSlip = pendingSlipBookingIds.has(b.id);
        const isConfirmedOrCompleted =
          (isConfirmedDepositBooking(b, parentEstimate, undefined, parentFinancial) || b.status === 'COMPLETED') &&
          !hasPendingSlip;

        if (!isConfirmedOrCompleted) {
          return;
        }

        const bSessions = sessionsByBookingMap.get(b.id) || [];
        const hasSessionOne = bSessions.some((s) => s.session_number === 1);
        const customerInfo = (b.customer_user_id ? customersMap.get(b.customer_user_id) : null) || (b.customer_id ? customersMap.get(b.customer_id) : null);
        const artistInfo = b.artist_id ? artistsMap.get(b.artist_id) || null : null;

        const customerPayload = {
          id: customerInfo?.id || b.customer_id || null,
          user_id: b.customer_user_id || null,
          display_name: customerInfo?.display_name || 'ลูกค้า',
          phone: customerInfo?.phone || null,
          email: customerInfo?.email || null,
          date_of_birth: customerInfo?.date_of_birth || null,
          has_medical_condition: customerInfo?.has_medical_condition !== undefined && customerInfo?.has_medical_condition !== null
            ? Boolean(customerInfo.has_medical_condition)
            : customerInfo?.medical_conditions?.trim()
            ? (customerInfo.medical_conditions === 'ไม่มี' || customerInfo.medical_conditions === 'false' ? false : true)
            : null,
          medical_condition_note: customerInfo?.medical_condition_note || customerInfo?.medical_conditions || null,
          has_allergy: customerInfo?.has_allergy !== undefined && customerInfo?.has_allergy !== null
            ? Boolean(customerInfo.has_allergy)
            : customerInfo?.allergies?.trim()
            ? (customerInfo.allergies === 'ไม่มี' || customerInfo.allergies === 'false' ? false : true)
            : null,
          allergy_note: customerInfo?.allergy_note || customerInfo?.allergies || null,
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
            total_sessions_count: bSessions.length || 1,
            start_at: startAtIso,
            end_at: endAtIso,
            status: sessionStatus,
            note: b.admin_note || b.customer_note || null,
            created_at: b.created_at || new Date().toISOString(),
            booking: { ...b, sessions: bSessions },
            estimate: parentEstimate,
            customer: customerPayload,
            artist: artistPayload,
            financial: parentFinancial,
          });
        }

        // Hydrate all explicitly created sessions (session 1 for legacy, session 2+ for extra rounds)
        bSessions.forEach((s) => {
          if (s.status === 'CANCELLED' || s.status === 'REJECTED' || s.status === 'EXPIRED') {
            return;
          }
          const sessionArtistInfo = s.artist_id ? artistsMap.get(s.artist_id) || artistInfo : artistInfo;
          hydratedEvents.push({
            id: s.id,
            booking_id: s.booking_id,
            artist_id: s.artist_id,
            session_number: s.session_number,
            total_sessions_count: bSessions.length || 1,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
            note: s.note,
            created_at: s.created_at || new Date().toISOString(),
            booking: { ...b, sessions: bSessions },
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
      setAllBookings(workQueueRes.allBookings);
      const confirmedWorkQueue = workQueueRes.workQueueBookings.filter((b) => {
        if (b.status === 'WAITING_DEPOSIT' || b.status === 'PENDING' || b.status === 'APPROVED' || b.status === 'REJECTED' || b.status === 'EXPIRED') {
          return false;
        }
        if (b.has_pending_payment_submission || b.pending_submission?.status === 'PENDING' || b.operational_status?.key === 'WAITING_SLIP_VERIFICATION') {
          return false;
        }
        return isConfirmedDepositBooking(b, undefined, undefined, b.financial) || b.status === 'COMPLETED' || b.status === 'CANCELLED';
      });
      setWorkQueueBookings(confirmedWorkQueue);
      setSelectedBookingForDetail((prev) => {
        if (!prev) return null;
        return (
          workQueueRes.allBookings.find((b) => b.id === prev.id) ||
          confirmedWorkQueue.find((b) => b.id === prev.id) ||
          null
        );
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
        loadCalendarData();
      }
    });
  }, [loadCalendarData]);

  // --------------------------------------------------------------------------
  // Filtering & Search Pipeline
  // --------------------------------------------------------------------------
  const filteredSessions = useMemo(() => {
    return sessions.filter((ev) => {
      // 0. Hide terminal statuses (CANCELLED, REJECTED, EXPIRED) unless filtering by CANCELLED
      const effStatus = getEffectiveEventStatus(ev);
      const isTerminal = effStatus === 'CANCELLED' || effStatus === 'REJECTED' || effStatus === 'EXPIRED' || ev.status === 'CANCELLED' || ev.booking?.status === 'CANCELLED' || ev.booking?.status === 'REJECTED' || ev.booking?.status === 'EXPIRED';

      if (selectedStatus !== 'CANCELLED' && isTerminal) {
        return false;
      }
      if (selectedStatus === 'CANCELLED' && !isTerminal) {
        return false;
      }

      // 1. Artist Filter
      if (selectedArtistId !== 'ALL' && ev.artist_id !== selectedArtistId) {
        return false;
      }

      // 2. Status Filter Aligned with Artist Queue
      if (selectedStatus !== 'ALL' && selectedStatus !== 'CANCELLED') {
        const cfg = getEventStatusConfig(ev);
        if (selectedStatus === 'SCHEDULED' || selectedStatus === 'CONFIRMED' || selectedStatus === 'SESSIONS') {
          // Active appointment ("นัดหมายแล้ว")
          if (cfg.label !== 'นัดหมายแล้ว' && effStatus !== 'CONFIRMED') return false;
        } else if (selectedStatus === 'COMPLETED') {
          if (effStatus !== 'COMPLETED' && cfg.label !== 'งานเสร็จสิ้น') return false;
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
    if (viewMode === 'MONTH' || viewMode === 'QUEUE') {
      const [y, m, d] = selectedDateStr.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevY = prevDate.getFullYear();
      const prevM = prevDate.getMonth() + 1;
      const daysInPrevMonth = new Date(prevY, prevM, 0).getDate();
      const targetDay = Math.min(d, daysInPrevMonth);
      const yStr = String(prevY);
      const mStr = String(prevM).padStart(2, '0');
      const dStr = String(targetDay).padStart(2, '0');
      setSelectedDateStr(`${yStr}-${mStr}-${dStr}`);
    } else if (viewMode === 'WEEK') {
      const d = new Date(selectedDateStr + 'T12:00:00');
      d.setDate(d.getDate() - 7);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      setSelectedDateStr(`${yStr}-${mStr}-${dStr}`);
    } else {
      const d = new Date(selectedDateStr + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      setSelectedDateStr(`${yStr}-${mStr}-${dStr}`);
    }
  };

  const handleNextDate = () => {
    if (viewMode === 'MONTH' || viewMode === 'QUEUE') {
      const [y, m, d] = selectedDateStr.split('-').map(Number);
      const nextDate = new Date(y, m, 1);
      const nextY = nextDate.getFullYear();
      const nextM = nextDate.getMonth() + 1;
      const daysInNextMonth = new Date(nextY, nextM, 0).getDate();
      const targetDay = Math.min(d, daysInNextMonth);
      const yStr = String(nextY);
      const mStr = String(nextM).padStart(2, '0');
      const dStr = String(targetDay).padStart(2, '0');
      setSelectedDateStr(`${yStr}-${mStr}-${dStr}`);
    } else if (viewMode === 'WEEK') {
      const d = new Date(selectedDateStr + 'T12:00:00');
      d.setDate(d.getDate() + 7);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      setSelectedDateStr(`${yStr}-${mStr}-${dStr}`);
    } else {
      const d = new Date(selectedDateStr + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      setSelectedDateStr(`${yStr}-${mStr}-${dStr}`);
    }
  };

  const handleToday = () => {
    setSelectedDateStr(todayStr);
  };

  // Month status counts for Admin Queue view
  const adminQueueCounts = useMemo(() => {
    const targetYM = selectedDateStr.slice(0, 7);
    let all = 0;
    let scheduled = 0;
    let completed = 0;
    let cancelled = 0;

    workQueueBookings.forEach((b) => {
      if (b.status === 'REJECTED' || b.status === 'EXPIRED') return;
      if (selectedArtistId !== 'ALL') {
        const matchesArtist =
          b.artist_id === selectedArtistId ||
          (b.sessions && b.sessions.some((s) => s.artist_id === selectedArtistId));
        if (!matchesArtist) return;
      }
      const { displayDate } = getActiveQueueSessionDateTime(b);
      if (!displayDate || !displayDate.startsWith(targetYM)) return;

      const overallStatus = resolveBookingCalendarStatus(b.sessions, b.status);
      all++;
      if (overallStatus === 'COMPLETED') {
        completed++;
      } else if (
        overallStatus === 'CANCELLED' ||
        b.status === 'CANCELLED' ||
        overallStatus === 'REJECTED' ||
        overallStatus === 'EXPIRED'
      ) {
        cancelled++;
      } else if (overallStatus === 'SCHEDULED' || overallStatus === 'IN_PROGRESS') {
        scheduled++;
      }
    });

    return { all, scheduled, completed, cancelled };
  }, [workQueueBookings, selectedArtistId, selectedDateStr]);

  // --------------------------------------------------------------------------
  // Title Label Calculation
  // --------------------------------------------------------------------------
  const titleLabel = useMemo(() => {
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    const yearBE = (y || 2026) + 543;
    const monthIndex = (m || 9) - 1;

    if (viewMode === 'MONTH' || viewMode === 'QUEUE') {
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
  }, [selectedDateStr, viewMode, filteredSessions.length]);

  const handleSelectEvent = useCallback(
    (ev: CalendarSessionEvent | null) => {
      if (!ev) {
        setSelectedEvent(null);
        return;
      }
      setSelectedEvent(ev);

      if (!ev.booking_id) return;

      const bObj =
        allBookings.find((b) => b.id === ev.booking_id) ||
        workQueueBookings.find((b) => b.id === ev.booking_id);
      if (bObj) {
        setSelectedBookingForDetail(bObj);
      } else {
        const b = ev.booking;
        const est = ev.estimate;
        const cust = ev.customer;
        const art = ev.artist;

        const synthetic: BookingItem = {
          id: ev.booking_id,
          customer_id: cust?.id || b?.customer_id || null,
          customer_user_id: cust?.user_id || b?.customer_user_id || null,
          customer_name: cust?.display_name || 'ลูกค้า',
          customer_phone: cust?.phone || undefined,
          customer_email: cust?.email || undefined,
          date_of_birth: cust?.date_of_birth || (b as any)?.date_of_birth || null,
          customer_dob: cust?.date_of_birth || (b as any)?.customer_dob || null,
          is_age_confirmed: Boolean(cust?.date_of_birth),
          artist_id: ev.artist_id || null,
          artist_name: art ? (art.nickname ? `${art.name} (${art.nickname})` : art.name) : 'ช่างประจำร้าน',
          artist_nickname: art?.nickname || null,
          requested_date: b?.requested_date || null,
          requested_time: b?.requested_start_time || null,
          requested_start_time: b?.requested_start_time || null,
          status: b?.status || (ev.status === 'COMPLETED' ? 'COMPLETED' : 'CONFIRMED'),
          artwork_title: est?.description || b?.description || (est?.work_type === 'FLASH' ? 'งานสัก Flash' : 'งานสัก Custom'),
          placement: est?.placement || b?.placement || undefined,
          width_cm: est?.width_cm || b?.width_cm || undefined,
          height_cm: est?.height_cm || b?.height_cm || undefined,
          style_preference: est?.style || b?.style_preference || undefined,
          description: est?.description || b?.description || b?.customer_note || null,
          reference_images: Array.isArray(est?.reference_images) && est.reference_images.length > 0 ? est.reference_images : (Array.isArray(b?.reference_images) ? b.reference_images : null),
          work_type: est?.work_type || b?.work_type || null,
          has_medical_condition: cust?.has_medical_condition ?? (est as any)?.has_medical_condition ?? null,
          medical_condition_note: cust?.medical_condition_note || (est as any)?.medical_condition_note || null,
          has_allergy: cust?.has_allergy ?? (est as any)?.has_allergy ?? null,
          allergy_note: cust?.allergy_note || (est as any)?.allergy_note || null,
          created_at: ev.created_at,
          updated_at: ev.created_at,
          estimate_request_id: b?.estimate_request_id || null,
          financial: {
            quoted_price: ev.financial?.quoted_price || est?.quoted_price || 0,
            deposit_required: ev.financial?.deposit_required || est?.deposit_required || 0,
            total_paid: ev.financial?.paid_total || 0,
            remaining_balance: ev.financial?.remaining_balance || 0,
            is_deposit_paid: ev.financial?.deposit_paid || false,
            is_fully_paid: ev.financial?.is_fully_paid || false,
          },
          sessions: sessions
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
        setSelectedBookingForDetail(synthetic);
      }
    },
    [allBookings, workQueueBookings, sessions]
  );

  return (
    <div className="space-y-4 font-prompt">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#ECE4D3] tracking-tight">
            ปฏิทิน
          </h1>
          <p className="text-xs text-[#B8B0A3] mt-0.5">
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

      {/* 4. Filter & Search Controls (for Calendar & Queue Views) */}
      <CalendarFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        artists={artists}
        selectedArtistId={selectedArtistId}
        onArtistChange={setSelectedArtistId}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        statusCounts={viewMode === 'QUEUE' ? adminQueueCounts : undefined}
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
        <div className="bg-[#12100E] border border-[#4A443A]/40 rounded-xl p-12 text-center text-xs text-[#B8B0A3]">
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
              onSelectEvent={handleSelectEvent}
              todayStr={todayStr}
            />
          )}

          {viewMode === 'QUEUE' && (
            <AdminQueueTableView
              events={filteredSessions}
              bookings={workQueueBookings}
              searchQuery={searchQuery}
              selectedArtistId={selectedArtistId}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              selectedDateStr={selectedDateStr}
              onSelectEvent={handleSelectEvent}
              onOpenBookingDetail={(bId) => {
                const bObj =
                  allBookings.find((b) => b.id === bId) ||
                  workQueueBookings.find((b) => b.id === bId);
                if (bObj) {
                  setSelectedBookingForDetail(bObj);
                } else {
                  const ev = filteredSessions.find((s) => s.booking_id === bId);
                  if (ev) handleSelectEvent(ev);
                }
              }}
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
              }}
              onSelectEvent={handleSelectEvent}
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
              onSelectEvent={handleSelectEvent}
              todayStr={todayStr}
            />
          )}
        </>
      )}

      {/* 8. Booking Detail Panel (Table View & Direct Item Selection) */}
      {selectedBookingForDetail && (
        <BookingDetailPanel
          booking={
            allBookings.find((b) => b.id === selectedBookingForDetail.id) ||
            workQueueBookings.find((b) => b.id === selectedBookingForDetail.id) ||
            selectedBookingForDetail
          }
          artists={artists.map((a) => ({ id: a.id, name: a.name, nickname: a.nickname }))}
          blockedDates={blockedDates}
          isDashboard={true}
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
