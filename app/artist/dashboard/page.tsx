'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '../../../components/AppContext';
import { createClient } from '../../../lib/supabase/client';
import ArtistHeader from '../../../components/artist/ArtistHeader';
import ArtistMobileNav from '../../../components/artist/ArtistMobileNav';
import ArtistAppointmentDetailDrawer, { ArtistSessionDetail } from '../../../components/artist/ArtistAppointmentDetailDrawer';
import ArtistRequestDetailDrawer, { ArtistPendingEstimateDetail } from '../../../components/artist/ArtistRequestDetailDrawer';
import ArtistPaymentReviewDrawer from '../../../components/artist/ArtistPaymentReviewDrawer';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import PaymentSlipLightbox from '@/components/common/PaymentSlipLightbox';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import { getTattooSizeCategory } from '@/lib/utils/tattooDuration';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  CheckCircle2, 
  ChevronRight, 
  Sparkles, 
  User, 
  Phone, 
  Layers, 
  AlertCircle,
  RefreshCw,
  Eye,
  FileText,
  Inbox,
  Image as ImageIcon,
  ShieldCheck,
  Wallet,
  ArrowRight
} from 'lucide-react';
import { 
  getTodayBangkokStr, 
  getDateStrBangkok, 
  formatDateBangkok, 
  formatTimeBangkok, 
  calculateDurationText, 
  getSessionStatusConfig, 
  getBookingStatusConfig 
} from '@/components/admin/calendar/calendarUtils';

export default function ArtistDashboardPage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pendingEstimates, setPendingEstimates] = useState<any[]>([]);
  const [requestFilter, setRequestFilter] = useState<'ALL' | 'PENDING_SLIP' | 'NEW' | 'WAITING_DEPOSIT' | 'REJECTED' | 'CANCELLED_EXPIRED'>('ALL');
  const [allArtistRequests, setAllArtistRequests] = useState<any[]>([]);
  const [queueFilter, setQueueFilter] = useState<'ALL' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [bookingsMap, setBookingsMap] = useState<Map<string, any>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, any>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const [estimatesMap, setEstimatesMap] = useState<Map<string, any>>(new Map());
  const [paymentSummaryMap, setPaymentSummaryMap] = useState<Map<string, any>>(new Map());
  const [flashReservationsMap, setFlashReservationsMap] = useState<Map<string, any>>(new Map());
  
  // Drawer States
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<ArtistSessionDetail | null>(null);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);

  const [selectedPendingEstimate, setSelectedPendingEstimate] = useState<ArtistPendingEstimateDetail | null>(null);
  const [isRequestDrawerOpen, setIsRequestDrawerOpen] = useState(false);

  const [selectedPaymentReviewSub, setSelectedPaymentReviewSub] = useState<any | null>(null);
  const [activeLightboxSlipPath, setActiveLightboxSlipPath] = useState<string | null>(null);

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

  const [pendingSubmissions, setPendingSubmissions] = useState<any[]>([]);
  const [completedJobsThisMonth, setCompletedJobsThisMonth] = useState<number>(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState<number>(0);

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
      }
      const sessionList = dbSessions ? [...dbSessions] : [];

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

      // Synthesize virtual sessions for active bookings missing from booking_sessions
      const existingSessionBookingIds = new Set(sessionList.map((s: any) => s.booking_id));
      dbBookings.forEach((b: any) => {
        if (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status) && !existingSessionBookingIds.has(b.id)) {
          const reqDate = b.requested_date || getTodayBangkokStr();
          const reqTime = b.requested_start_time || '10:00:00';
          const startAtStr = reqDate.includes('T') ? reqDate : `${reqDate}T${reqTime.length === 5 ? reqTime + ':00' : reqTime}+07:00`;
          sessionList.push({
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
          });
        }
      });

      setSessions(sessionList);

      // 3. Query linked estimate requests for bookings
      const estimateIds = Array.from(new Set(dbBookings.map((b: any) => b.estimate_request_id).filter(Boolean)));
      let dbEstimates: any[] = [];
      if (estimateIds.length > 0) {
        const { data: estData } = await supabase
          .from('estimate_requests')
          .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, work_type, estimated_min_price, estimated_max_price, price_estimated_at, request_type')
          .in('id', estimateIds);
        dbEstimates = estData || [];
      }
      const estMap = new Map<string, any>();
      dbEstimates.forEach((e: any) => estMap.set(e.id, e));
      setEstimatesMap(estMap);

      // 4. Query ALL estimate_requests assigned to staffArtistId
      const { data: allEstData, error: pEstErr } = await supabase
        .from('estimate_requests')
        .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, request_type, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, work_type, proposed_date, proposed_time, proposed_price, proposed_artist_note, is_date_proposed')
        .eq('artist_id', staffArtistId)
        .order('created_at', { ascending: false });

      if (pEstErr) {
        console.error('Error fetching artist estimate requests:', pEstErr);
      }

      // 4.1 Query flash_reservations assigned to staffArtistId via RPC (bypasses RLS safely for assigned artist)
      const { data: flashRpcData, error: fErr } = await supabase
        .rpc('artist_get_flash_reservations', { p_artist_id: staffArtistId });

      if (fErr) {
        console.error('Error fetching artist flash reservations via RPC:', fErr);
      }

      const artistFlashRes = (flashRpcData || []).map((res: any) => ({
        ...res,
        placement: res.placement,
        width_cm: res.width_cm,
        height_cm: res.height_cm,
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

      // 4.5 Query pending payment submissions for own bookings & compute monthly KPIs
      const dbBookingIds = dbBookings.map((b: any) => b.id);
      let pSubmissions: any[] = [];
      let mRev = 0;
      const currentMonthStr = getTodayBangkokStr().slice(0, 7);

      // Count COMPLETED bookings in current month for logged-in artist using ONLY booking.completed_at
      const completedBookingsThisMonth = dbBookings.filter((b: any) => {
        if (b.status !== 'COMPLETED') return false;
        if (!b.completed_at) return false;
        return getDateStrBangkok(b.completed_at).slice(0, 7) === currentMonthStr;
      });

      const completedThisMonthCount = completedBookingsThisMonth.length;
      setCompletedJobsThisMonth(completedThisMonthCount);

      const completedBookingIdsThisMonth = new Set(completedBookingsThisMonth.map((b: any) => b.id));

      if (dbBookingIds.length > 0) {
        const { data: subData } = await supabase
          .from('booking_payment_submissions')
          .select('*')
          .in('booking_id', dbBookingIds)
          .eq('status', 'PENDING');
        pSubmissions = subData || [];

        // 4.6 Query RECORDED booking payments for completed bookings in current month
        if (completedBookingIdsThisMonth.size > 0) {
          const { data: payData, error: payErr } = await supabase
            .from('booking_payments')
            .select('id, booking_id, amount, status')
            .in('booking_id', Array.from(completedBookingIdsThisMonth))
            .eq('status', 'RECORDED');

          if (payErr) {
            console.error('Error fetching recorded payments for completed bookings:', payErr);
          }

          if (payData) {
            const seenPaymentIds = new Set<string>();
            mRev = payData.reduce((sum: number, p: any) => {
              if (p.id) {
                if (seenPaymentIds.has(p.id)) return sum;
                seenPaymentIds.add(p.id);
              }
              return sum + (Number(p.amount) || 0);
            }, 0);
          }
        }

        // 4.7 Query booking_payment_summary for financial status mapping
        const { data: sumData } = await supabase
          .from('booking_payment_summary')
          .select('*')
          .in('booking_id', dbBookingIds);

        const sumMap = new Map<string, any>();
        (sumData || []).forEach((s: any) => sumMap.set(s.booking_id, s));
        setPaymentSummaryMap(sumMap);

        // 4.8 Query flash_reservations for bookings linked via flash_reservation_id
        const flashResIds = Array.from(new Set(dbBookings.map((b: any) => b.flash_reservation_id).filter(Boolean)));
        let frMap = new Map<string, any>();
        artistFlashRes.forEach((fr: any) => {
          if (fr.id) frMap.set(fr.id, fr);
        });
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
      }
      setPendingSubmissions(pSubmissions);
      setMonthlyRevenue(mRev);

      // Build unified artist request list with operational status mapping
      const estItems = (allEstData || []).map((est: any) => {
        const linkedBooking = Array.from(bMap.values()).find((b: any) => b.estimate_request_id === est.id);
        const hasPendingSlip = linkedBooking
          ? pSubmissions.some((s: any) => s.booking_id === linkedBooking.id && s.status === 'PENDING')
          : false;

        let opStatus: 'NEW' | 'WAITING_DEPOSIT' | 'PENDING_SLIP' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'CONFIRMED' | 'OTHER' = 'NEW';

        if (est.status === 'CONFIRMED' || linkedBooking?.status === 'CONFIRMED' || linkedBooking?.status === 'IN_PROGRESS' || linkedBooking?.status === 'COMPLETED') {
          opStatus = 'CONFIRMED';
        } else if (est.status === 'EXPIRED' || linkedBooking?.status === 'EXPIRED') {
          opStatus = 'EXPIRED';
        } else if (est.status === 'CANCELLED' || linkedBooking?.status === 'CANCELLED') {
          opStatus = 'CANCELLED';
        } else if (est.status === 'REJECTED' || linkedBooking?.status === 'REJECTED') {
          opStatus = 'REJECTED';
        } else if (hasPendingSlip || est.status === 'SLIP_SUBMITTED' || est.status === 'PENDING_SLIP') {
          opStatus = 'PENDING_SLIP';
        } else if (est.status === 'PENDING') {
          opStatus = 'NEW';
        } else if (['ACCEPTED', 'QUOTED', 'APPROVED', 'WAITING_DEPOSIT', 'DEPOSIT_PENDING'].includes(est.status) || linkedBooking?.status === 'WAITING_DEPOSIT') {
          opStatus = 'WAITING_DEPOSIT';
        } else {
          opStatus = 'NEW';
        }

        return {
          ...est,
          id: est.id,
          item_type: 'ESTIMATE',
          requestCode: `REQ-${est.id.slice(0, 8).toUpperCase()}`,
          derived_operational_status: opStatus,
          style_display: est.style || est.style_preference || 'งานสัก Custom',
          ref_image: est.reference_images?.[0] || null,
          date_display: est.preferred_date,
          time_display: est.preferred_time,
          placement_display: est.placement || 'ไม่ระบุตำแหน่ง',
        };
      });

      const flashItems = (artistFlashRes || []).map((res: any) => {
        const linkedBooking = Array.from(bMap.values()).find(
          (b: any) => (b.flash_reservation_id && b.flash_reservation_id === res.id) || ((b as any).flash_reservation_id && (b as any).flash_reservation_id === res.id)
        );
        const hasPendingSlip = linkedBooking
          ? pSubmissions.some((s: any) => s.booking_id === linkedBooking.id && s.status === 'PENDING')
          : false;

        let opStatus: 'NEW' | 'WAITING_DEPOSIT' | 'PENDING_SLIP' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'CONFIRMED' | 'OTHER' = 'NEW';

        if (res.status === 'CONFIRMED' || res.status === 'COMPLETED' || linkedBooking?.status === 'CONFIRMED' || linkedBooking?.status === 'COMPLETED') {
          opStatus = 'CONFIRMED';
        } else if (res.status === 'EXPIRED' || linkedBooking?.status === 'EXPIRED') {
          opStatus = 'EXPIRED';
        } else if (res.status === 'CANCELLED' || linkedBooking?.status === 'CANCELLED') {
          opStatus = 'CANCELLED';
        } else if (res.status === 'REJECTED' || linkedBooking?.status === 'REJECTED') {
          opStatus = 'REJECTED';
        } else if (hasPendingSlip || res.status === 'SLIP_SUBMITTED' || res.status === 'PENDING_SLIP') {
          opStatus = 'PENDING_SLIP';
        } else if (res.status === 'PENDING') {
          opStatus = 'NEW';
        } else if (['ACCEPTED', 'QUOTED', 'APPROVED', 'WAITING_DEPOSIT', 'DEPOSIT_PENDING'].includes(res.status) || linkedBooking?.status === 'WAITING_DEPOSIT') {
          opStatus = 'WAITING_DEPOSIT';
        } else {
          opStatus = 'NEW';
        }

        const flashImgUrl = res.flash_design_image_url ?? res.flash_designs?.image_url ?? null;
        const flashTitle = res.flash_design_title ?? res.flash_designs?.title ?? null;
        const flashStyle = res.flash_design_style ?? res.flash_designs?.style ?? null;
        const flashSizeLabel = res.flash_design_size_label ?? res.flash_designs?.size_label ?? null;

        return {
          ...res,
          id: res.id,
          sourceType: 'FLASH',
          item_type: 'FLASH',
          is_flash: true,
          requestCode: `FLASH-${res.id.slice(0, 8).toUpperCase()}`,
          derived_operational_status: opStatus,
          style_display: flashStyle ?? 'Flash',
          ref_image: flashImgUrl,
          flash_image_url: flashImgUrl,
          flash_title: flashTitle,
          flash_style: flashStyle,
          flash_size_label: flashSizeLabel,
          date_display: res.requested_date,
          time_display: res.requested_start_time,
          placement_display: res.placement ?? 'ไม่ระบุตำแหน่ง',
          description: res.customer_note ?? '',
          width_cm: res.width_cm ?? null,
          height_cm: res.height_cm ?? null,
          size_label: flashSizeLabel,
          created_at: res.created_at,
          has_medical_condition: res.has_medical_condition ?? null,
          medical_condition_note: res.medical_condition_note ?? null,
          has_allergy: res.has_allergy ?? null,
          allergy_note: res.allergy_note ?? null,
        };
      });

      const combinedRequests = [...estItems, ...flashItems]
        .filter((r: any) => r.derived_operational_status !== 'CONFIRMED' && r.derived_operational_status !== 'OTHER')
        .sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );

      setAllArtistRequests(combinedRequests);
      setPendingEstimates(combinedRequests.filter((r: any) => r.derived_operational_status === 'NEW'));

      // 5. Collect all customer user IDs (from bookings + all requests + pending payment submissions)
      const customerUserIds = Array.from(
        new Set([
          ...dbBookings.map((b: any) => b.customer_user_id),
          ...combinedRequests.map((e: any) => e.customer_user_id),
          ...pSubmissions.map((s: any) => s.customer_user_id)
        ].filter(Boolean))
      );

      if (customerUserIds.length > 0) {
        // Fetch via secure Artist RPC (bypasses RLS restrictions for assigned artist customers)
        const { data: contactsData, error: contactsErr } = await supabase
          .rpc('artist_get_customer_contacts', {
            p_customer_user_ids: customerUserIds
          });

        if (contactsErr) {
          console.error('Error fetching artist customer contacts via RPC:', contactsErr);
        }

        const cMap = new Map<string, any>();
        const pMap = new Map<string, any>();

        (contactsData || []).forEach((c: any) => {
          if (c.user_id) {
            cMap.set(c.user_id, {
              user_id: c.user_id,
              display_name: c.display_name,
              phone: c.phone
            });
            pMap.set(c.user_id, {
              user_id: c.user_id,
              display_name: c.display_name,
              phone: c.phone
            });
          }
        });

        const { data: custRows } = await supabase
          .from('customers')
          .select('user_id, display_name, phone, email, date_of_birth')
          .in('user_id', customerUserIds);

        if (custRows) {
          custRows.forEach((c: any) => {
            if (c.user_id) {
              const existingC = cMap.get(c.user_id) || {};
              cMap.set(c.user_id, {
                ...existingC,
                ...c,
                display_name: existingC.display_name || c.display_name,
                phone: existingC.phone || c.phone,
                date_of_birth: c.date_of_birth || existingC.date_of_birth || null,
              });
            }
          });
        }

        setCustomersMap(cMap);
        setProfilesMap(pMap);
      }
    } catch (err) {
      console.error('Exception fetching artist dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, staffArtistId]);

  useEffect(() => {
    if (isAuthorized && staffArtistId) {
      fetchArtistData();
    }
  }, [isAuthorized, staffArtistId, fetchArtistData]);

  // Compute Request Status Counts across all assigned requests & pending payment submissions
  const statusCounts = useMemo(() => {
    let newReq = 0;
    let waitingDeposit = 0;
    let pendingSlip = pendingSubmissions.length;
    let rejected = 0;
    let expired = 0;
    let cancelled = 0;

    allArtistRequests.forEach((req) => {
      const op = req.derived_operational_status;
      if (op === 'NEW') newReq++;
      else if (op === 'WAITING_DEPOSIT') waitingDeposit++;
      else if (op === 'REJECTED') rejected++;
      else if (op === 'EXPIRED') expired++;
      else if (op === 'CANCELLED') cancelled++;
    });

    const all = pendingSlip + newReq + waitingDeposit;

    return {
      all,
      new: newReq,
      waitingDeposit,
      pendingSlip,
      rejected,
      expired,
      cancelled,
      cancelledExpiredTotal: expired + cancelled,
    };
  }, [allArtistRequests, pendingSubmissions]);

  const pendingRequestsCount = statusCounts.new;

  const filteredRequests = useMemo(() => {
    if (requestFilter === 'ALL') return allArtistRequests;
    if (requestFilter === 'REJECTED') {
      return allArtistRequests.filter(
        (req) => req.derived_operational_status === 'REJECTED'
      );
    }
    if (requestFilter === 'CANCELLED_EXPIRED') {
      return allArtistRequests.filter(
        (req) => req.derived_operational_status === 'EXPIRED' || req.derived_operational_status === 'CANCELLED'
      );
    }
    return allArtistRequests.filter((req) => req.derived_operational_status === requestFilter);
  }, [allArtistRequests, requestFilter]);

  const getStatusBadgeConfig = (opStatus: string) => {
    switch (opStatus) {
      case 'NEW':
        return {
          label: 'คำขอใหม่',
          className: 'bg-blue-950/60 text-blue-400 border-blue-800/60',
        };
      case 'WAITING_DEPOSIT':
        return {
          label: 'รอมัดจำ',
          className: 'bg-purple-950/60 text-purple-400 border-purple-800/60',
        };
      case 'PENDING_SLIP':
        return {
          label: 'สลิปรอตรวจ',
          className: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
        };
      case 'REJECTED':
        return {
          label: 'ปฏิเสธ',
          className: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
        };
      case 'EXPIRED':
        return {
          label: 'หมดเวลาชำระมัดจำ',
          className: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
        };
      case 'CANCELLED':
        return {
          label: 'ยกเลิก',
          className: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
        };
      default:
        return {
          label: 'รอตรวจสอบ',
          className: 'bg-blue-950/60 text-blue-400 border-blue-800/60',
        };
    }
  };

  // Helper for Queue Operational Status Resolution
  const resolveQueueOperationalStatus = (
    sessStatus: string,
    bookingStatus?: string
  ): 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' => {
    if (sessStatus === 'CANCELLED' || bookingStatus === 'CANCELLED') {
      return 'CANCELLED';
    }
    if (sessStatus === 'COMPLETED' || bookingStatus === 'COMPLETED') {
      return 'COMPLETED';
    }
    if (sessStatus === 'IN_PROGRESS') {
      return 'IN_PROGRESS';
    }
    return 'SCHEDULED';
  };

  // Today Bangkok Date String
  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  // Today's Queue Sessions (Filter only sessions scheduled for today for top KPI card)
  const todayQueueSessions = useMemo(() => {
    return sessions.filter((sess: any) => {
      const sessDateStr = getDateStrBangkok(sess.start_at);
      return sessDateStr === todayStr;
    });
  }, [sessions, todayStr]);

  // Filter sessions so that only confirmed/active bookings enter the Job Queue section & count
  const validQueueSessions = useMemo(() => {
    return sessions.filter((sess: any) => {
      const booking = bookingsMap.get(sess.booking_id);
      if (!booking) return false;
      // Pre-deposit approval requests (WAITING_DEPOSIT, PENDING_DEPOSIT, PENDING, SLIP_SUBMITTED, EXPIRED) MUST NOT appear in Job Queue
      if (['PENDING', 'WAITING_DEPOSIT', 'EXPIRED'].includes(booking.status)) {
        return false;
      }
      if (['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) {
        return true;
      }
      if (booking.status === 'CANCELLED' || sess.status === 'CANCELLED') {
        // Include cancelled sessions if deposit was approved or a real booking session was scheduled
        return Boolean(booking.approved_at || !sess.is_virtual || sess.status === 'CANCELLED');
      }
      return false;
    });
  }, [sessions, bookingsMap]);

  // Group valid queue sessions by booking_id (1 Card per 1 Booking)
  const groupedQueueBookings = useMemo(() => {
    const map = new Map<string, any[]>();
    validQueueSessions.forEach((sess: any) => {
      if (!map.has(sess.booking_id)) {
        map.set(sess.booking_id, []);
      }
      map.get(sess.booking_id)!.push(sess);
    });

    const currentMonthStr = getTodayBangkokStr().slice(0, 7);
    const result: any[] = [];

    map.forEach((bSessions, bookingId) => {
      const booking = bookingsMap.get(bookingId);
      if (!booking) return;

      const sortedSessions = [...bSessions].sort(
        (a, b) => (a.session_number || 0) - (b.session_number || 0)
      );

      // Select session with highest session_number (latest session)
      const activeSessions = sortedSessions.filter((s) => s.status !== 'CANCELLED');
      const displaySession = activeSessions.length > 0 
        ? activeSessions[activeSessions.length - 1] 
        : sortedSessions[sortedSessions.length - 1];

      const opStatus = resolveQueueOperationalStatus(displaySession.status, booking.status);

      // Filter out COMPLETED jobs using strictly booking.completed_at timestamp in Asia/Bangkok timezone
      if (opStatus === 'COMPLETED') {
        if (!booking.completed_at) {
          console.warn(`[ArtistDashboard] COMPLETED booking #${booking.id?.slice(0, 8)} (${booking.id}) is missing completed_at timestamp.`);
          return; // Strictly exclude from Dashboard completed jobs list if completed_at is missing!
        }

        const completedMonthStr = getDateStrBangkok(booking.completed_at).slice(0, 7);
        if (completedMonthStr !== currentMonthStr) {
          return; // Hide completed job from previous months on Dashboard
        }
      }

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
  }, [validQueueSessions, bookingsMap]);

  // Queue Status Counts across unique bookings
  const queueCounts = useMemo(() => {
    let all = groupedQueueBookings.length;
    let scheduled = 0;
    let completed = 0;
    let cancelled = 0;

    groupedQueueBookings.forEach((item: any) => {
      const op = item.derived_op_status;
      if (op === 'COMPLETED') {
        completed++;
      } else if (op === 'CANCELLED') {
        cancelled++;
      } else {
        scheduled++;
      }
    });

    return {
      all,
      scheduled,
      completed,
      cancelled,
    };
  }, [groupedQueueBookings]);

  // Queue List Filtered & Sorted (1 Card per 1 Booking)
  const filteredQueueBookings = useMemo(() => {
    let list = [...groupedQueueBookings];

    if (queueFilter === 'SCHEDULED') {
      list = list.filter(
        (item) => (item.derived_op_status === 'SCHEDULED' || item.derived_op_status === 'IN_PROGRESS')
      );
    } else if (queueFilter === 'COMPLETED') {
      list = list.filter((item) => item.derived_op_status === 'COMPLETED');
    } else if (queueFilter === 'CANCELLED') {
      list = list.filter((item) => item.derived_op_status === 'CANCELLED');
    }

    if (queueFilter === 'SCHEDULED') {
      // Nearest upcoming appointment first (displaySession.start_at ascending)
      list.sort((a, b) => new Date(a.displaySession.start_at).getTime() - new Date(b.displaySession.start_at).getTime());
    } else if (queueFilter === 'COMPLETED' || queueFilter === 'CANCELLED') {
      // Most recent completed/cancelled first (displaySession.start_at descending)
      list.sort((a, b) => new Date(b.displaySession.start_at).getTime() - new Date(a.displaySession.start_at).getTime());
    } else {
      // ALL tab: active/scheduled first (ascending), then completed/cancelled (descending)
      list.sort((a, b) => {
        const isACompleted = a.derived_op_status === 'COMPLETED' || a.derived_op_status === 'CANCELLED';
        const isBCompleted = b.derived_op_status === 'COMPLETED' || b.derived_op_status === 'CANCELLED';
        if (isACompleted && !isBCompleted) return 1;
        if (!isACompleted && isBCompleted) return -1;
        if (!isACompleted && !isBCompleted) {
          return new Date(a.displaySession.start_at).getTime() - new Date(b.displaySession.start_at).getTime();
        }
        return new Date(b.displaySession.start_at).getTime() - new Date(a.displaySession.start_at).getTime();
      });
    }

    return list;
  }, [groupedQueueBookings, queueFilter]);

  const getQueueBadgeConfig = (opStatus: string) => {
    if (opStatus === 'COMPLETED') {
      return {
        label: 'งานเสร็จสิ้น',
        className: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
      };
    }
    if (opStatus === 'CANCELLED') {
      return {
        label: 'ยกเลิก',
        className: 'bg-red-950/60 text-red-400 border-red-800/60',
      };
    }
    if (opStatus === 'IN_PROGRESS') {
      return {
        label: 'กำลังสัก',
        className: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
      };
    }
    return {
      label: 'นัดหมายแล้ว',
      className: 'bg-blue-950/60 text-blue-400 border-blue-800/60',
    };
  };

  // Clean customer name helper (NEVER fallback to "ลูกค้าประจำ")
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

  const getIsAgeConfirmed = (uid?: string | null): boolean | undefined => {
    if (!uid) return undefined;
    const c = customersMap.get(uid);
    if (c?.eligibility_confirmed_at || c?.profile_completed_at) {
      return true;
    }
    return undefined;
  };

  // Today's sessions & upcoming sessions
  const todaySessions = useMemo(() => {
    return sessions.filter((s: any) => {
      if (getDateStrBangkok(s.start_at) !== todayStr || s.status === 'CANCELLED') return false;
      const b = bookingsMap.get(s.booking_id);
      if (!b) return false;
      return b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'COMPLETED';
    });
  }, [sessions, todayStr, bookingsMap]);



  // KPI Metrics Calculations
  const todayActiveSessions = useMemo(() => {
    return sessions.filter((s: any) => {
      if (getDateStrBangkok(s.start_at) !== todayStr || s.status === 'CANCELLED') return false;
      const b = bookingsMap.get(s.booking_id);
      if (!b) return false;
      return b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'COMPLETED';
    });
  }, [sessions, todayStr, bookingsMap]);

  const todaySessionCount = todayActiveSessions.length;

  const formattedTodayHours = useMemo(() => {
    const totalHours = todayActiveSessions.reduce((sum: number, s: any) => {
      if (!s.start_at || !s.end_at) return sum;
      const startMs = new Date(s.start_at).getTime();
      const endMs = new Date(s.end_at).getTime();
      const diffMs = Math.max(0, endMs - startMs);
      return sum + diffMs / (1000 * 60 * 60);
    }, 0);
    return Number.isInteger(totalHours) ? totalHours : Number(totalHours.toFixed(1));
  }, [todayActiveSessions]);

  const upcomingSessions = useMemo(() => {
    const nowMs = Date.now();
    const list = sessions.filter((s: any) => {
      // 1. Session status must not be CANCELLED or COMPLETED
      if (s.status === 'CANCELLED' || s.status === 'COMPLETED') return false;

      // 2. Booking must exist and be active (CONFIRMED or IN_PROGRESS)
      const b = bookingsMap.get(s.booking_id);
      if (!b) return false;
      if (['CANCELLED', 'REJECTED', 'EXPIRED', 'PENDING'].includes(b.status)) return false;

      // 3. Time check: session end_at must be in the future, or session is IN_PROGRESS
      const startMs = new Date(s.start_at).getTime();
      const endMs = s.end_at ? new Date(s.end_at).getTime() : startMs + 2 * 3600 * 1000;
      if (s.status !== 'IN_PROGRESS' && endMs <= nowMs) {
        return false;
      }

      return true;
    });

    // 4. Sort strictly by start_at ascending (day and time ascending)
    list.sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    return list;
  }, [sessions, bookingsMap]);

  const nextUpcomingSession = useMemo(() => {
    return upcomingSessions.length > 0 ? upcomingSessions[0] : null;
  }, [upcomingSessions]);

  const nextSessionBooking = useMemo(() => {
    return nextUpcomingSession ? bookingsMap.get(nextUpcomingSession.booking_id) : null;
  }, [nextUpcomingSession, bookingsMap]);

  const nextSessionCustomerName = useMemo(() => {
    return nextSessionBooking ? getCleanCustomerName(nextSessionBooking.customer_user_id) : '';
  }, [nextSessionBooking, customersMap, profilesMap]);

  const nextSessionPlacement = useMemo(() => {
    if (!nextSessionBooking) return '';
    return nextSessionBooking.placement || (nextSessionBooking.estimate_request_id ? estimatesMap.get(nextSessionBooking.estimate_request_id)?.placement : '');
  }, [nextSessionBooking, estimatesMap]);

  const nextSessionTimeStr = useMemo(() => {
    return nextUpcomingSession ? formatTimeBangkok(nextUpcomingSession.start_at) : '';
  }, [nextUpcomingSession]);

  const nextSessionDateLabel = useMemo(() => {
    if (!nextUpcomingSession?.start_at) return '';
    const dateStr = getDateStrBangkok(nextUpcomingSession.start_at);
    const today = getTodayBangkokStr();

    const tomDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    tomDate.setDate(tomDate.getDate() + 1);
    const tomorrowStr = getDateStrBangkok(tomDate.toISOString());

    if (dateStr === today) {
      return 'วันนี้';
    }
    if (dateStr === tomorrowStr) {
      return 'พรุ่งนี้';
    }
    return formatDateBangkok(nextUpcomingSession.start_at);
  }, [nextUpcomingSession]);

  // Handler to open Session Detail Drawer
  const handleOpenSessionDetail = (sess: any) => {
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
    setIsSessionDrawerOpen(true);
  };

  // Handler to open Pending Estimate Request Detail Drawer (Read-Only)
  const handleOpenRequestDetail = (est: any) => {
    const customer = est.customer_user_id ? customersMap.get(est.customer_user_id) : null;
    const prof = est.customer_user_id ? profilesMap.get(est.customer_user_id) : null;

    const isFlash = Boolean(est.is_flash || est.item_type === 'FLASH' || est.sourceType === 'FLASH' || est.flash_design_id);

    const detail: ArtistPendingEstimateDetail = {
      id: est.id,
      customer_user_id: est.customer_user_id,
      customer_name: getCleanCustomerName(est.customer_user_id),
      customer_phone: customer?.phone ?? prof?.phone ?? null,
      customer_email: prof?.email ?? customer?.email ?? null,
      customer_dob: customer?.date_of_birth ?? prof?.date_of_birth ?? (est as any).date_of_birth ?? null,
      date_of_birth: customer?.date_of_birth ?? prof?.date_of_birth ?? (est as any).date_of_birth ?? null,
      is_age_confirmed: getIsAgeConfirmed(est.customer_user_id),
      artist_id: est.artist_id ?? est.flash_design_artist_id ?? est.flash_designs?.artist_id ?? null,
      artist_name: artistName,
      placement: est.placement ?? est.placement_display ?? null,
      description: est.customer_note ?? est.description ?? null,
      width_cm: est.width_cm ?? null,
      height_cm: est.height_cm ?? null,
      style_preference: est.flash_design_style ?? est.flash_designs?.style ?? est.style ?? est.style_preference ?? null,
      preferred_date: est.requested_date ?? est.preferred_date ?? null,
      preferred_time: est.requested_start_time ?? est.preferred_time ?? null,
      reference_images: est.reference_images ?? null,
      flash_image_url: est.flash_design_image_url ?? est.flash_designs?.image_url ?? est.flash_image_url ?? null,
      flash_title: est.flash_design_title ?? est.flash_designs?.title ?? est.flash_title ?? null,
      flash_size_label: est.flash_design_size_label ?? est.flash_designs?.size_label ?? est.size_label ?? null,
      has_medical_condition: est.has_medical_condition ?? (customer as any)?.has_medical_condition ?? null,
      medical_condition_note: est.medical_condition_note ?? (customer as any)?.medical_condition_note ?? null,
      has_allergy: est.has_allergy ?? (customer as any)?.has_allergy ?? null,
      allergy_note: est.allergy_note ?? (customer as any)?.allergy_note ?? null,
      proposed_date: est.proposed_date ?? null,
      proposed_time: est.proposed_time ?? null,
      proposed_price: est.proposed_price ?? null,
      proposed_artist_note: est.proposed_artist_note ?? null,
      is_date_proposed: est.is_date_proposed ?? false,
      quoted_price: est.quoted_price ?? null,
      status: est.status,
      created_at: est.created_at,
      is_flash: isFlash,
      sourceType: isFlash ? 'FLASH' : 'CUSTOM',
    };

    setSelectedPendingEstimate(detail);
    setIsRequestDrawerOpen(true);
  };

  if (authLoading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt">
        <span className="text-xs text-studio-secondary animate-pulse">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</span>
      </div>
    );
  }

  const artistName = staffArtistRecord?.name || profile?.display_name || 'ช่างประจำร้าน';
  const artistNickname = staffArtistRecord?.nickname ? `(${staffArtistRecord.nickname})` : '';

  return (
    <div className="min-h-screen bg-studio-main text-studio-primary font-prompt flex flex-col pb-20 md:pb-10">
      {/* Header */}
      <ArtistHeader />

      {/* Main Content */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Welcome & Refresh Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-studio-red uppercase tracking-wider font-semibold">
                Artist Workspace
              </span>
              <span className="text-studio-muted text-xs">•</span>
              <span className="text-xs text-studio-secondary">
                {formatDateBangkok(new Date().toISOString(), true)}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary mt-1">
              ยินดีต้อนรับ, {artistName} {artistNickname}
            </h1>
          </div>

          <button
            onClick={() => fetchArtistData()}
            disabled={loading}
            className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-studio-red' : ''} />
            <span>อัปเดตข้อมูล</span>
          </button>
        </div>

        {/* Section 1: Top 4 Summary KPI Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
          {/* Card 1: คำขอใหม่ */}
          <div className="bg-studio-card border border-studio-border p-3.5 sm:p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-0.5 min-w-0 pr-1">
              <span className="text-[11px] sm:text-xs text-studio-secondary uppercase tracking-wider font-medium block truncate">คำขอใหม่</span>
              <div className="text-xl sm:text-3xl font-bold font-mono text-amber-400 truncate">
                {pendingRequestsCount} <span className="text-xs font-normal text-studio-muted">รายการ</span>
              </div>
            </div>
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-amber-950/30 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
              <Inbox className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          {/* Card 2: คิววันนี้ */}
          <div className="bg-studio-card border border-studio-border p-3.5 sm:p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-0.5 min-w-0 pr-1">
              <span className="text-[11px] sm:text-xs text-studio-secondary uppercase tracking-wider font-medium block truncate">คิววันนี้</span>
              <div className="text-xl sm:text-3xl font-bold font-mono text-studio-primary truncate">
                {todaySessionCount} <span className="text-xs font-normal text-studio-muted">รอบ</span>
              </div>
              <div className="text-[11px] sm:text-xs text-studio-muted truncate">
                รวม {formattedTodayHours} ชม.
              </div>
            </div>
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-studio-sec border border-studio-border flex items-center justify-center text-studio-red shrink-0">
              <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          {/* Card 3: คิวถัดไป */}
          <div 
            onClick={() => {
              if (nextUpcomingSession) {
                handleOpenSessionDetail(nextUpcomingSession);
              }
            }}
            className={`bg-studio-card border border-studio-border p-3.5 sm:p-5 rounded-xl flex items-center justify-between shadow-lg ${
              nextUpcomingSession ? 'cursor-pointer hover:border-amber-500/50 transition-colors' : ''
            }`}
          >
            <div className="space-y-0.5 min-w-0 pr-1 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs text-studio-secondary uppercase tracking-wider font-medium block truncate">
                  คิวถัดไป
                </span>
                {upcomingSessions.length > 1 && (
                  <span className="text-[10px] font-mono bg-amber-950/60 text-amber-400 border border-amber-800/40 px-1.5 py-0.2 rounded font-semibold ml-1 shrink-0">
                    +{upcomingSessions.length - 1} คิวถัดไป
                  </span>
                )}
              </div>

              {nextUpcomingSession ? (
                <>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span className="text-sm sm:text-lg font-bold text-studio-primary truncate">
                      {nextSessionCustomerName}
                    </span>
                    {nextUpcomingSession.session_number && (
                      <span className="text-[10px] font-mono text-studio-secondary bg-studio-sec border border-studio-border px-1.5 py-0.2 rounded shrink-0">
                        รอบที่ {nextUpcomingSession.session_number}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] sm:text-xs text-amber-400 font-medium truncate leading-tight">
                    {nextSessionDateLabel} • {nextSessionTimeStr}
                  </div>
                  <div className="text-[11px] sm:text-xs text-studio-secondary truncate">
                    {nextSessionPlacement || 'ไม่ระบุตำแหน่ง'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm sm:text-lg font-medium text-studio-muted truncate mt-0.5">
                    ยังไม่มีคิวถัดไป
                  </div>
                  <div className="text-[11px] sm:text-xs text-studio-muted">-</div>
                </>
              )}
            </div>
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-amber-950/20 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0 ml-2">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>

          {/* Card 4: ผลงานเดือนนี้ */}
          <div className="bg-studio-card border border-studio-border p-3.5 sm:p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-0.5 min-w-0 pr-1">
              <span className="text-[11px] sm:text-xs text-studio-secondary uppercase tracking-wider font-medium block truncate">ผลงานเดือนนี้</span>
              <div className="text-xl sm:text-3xl font-bold font-mono text-studio-primary flex items-baseline space-x-1 truncate">
                <span>{completedJobsThisMonth}</span>
                <span className="text-xs sm:text-sm font-normal text-studio-muted">เคส</span>
              </div>
              <div className="text-[11px] sm:text-xs font-mono text-emerald-400 truncate">
                ยอดรวม ฿{monthlyRevenue.toLocaleString('th-TH')}
              </div>
            </div>
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-emerald-950/20 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>

        {/* Quick Action Shortcuts for Artist */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <a
            href="/artist/portfolio?action=add"
            className="group bg-studio-card border border-studio-border hover:border-studio-red/60 p-4 rounded-xl transition-all shadow-md flex items-center space-x-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-studio-red/15 border border-studio-red/30 flex items-center justify-center text-studio-red group-hover:scale-110 transition-transform shrink-0">
              <ImageIcon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-semibold text-studio-primary group-hover:text-studio-red transition-colors flex items-center justify-between">
                <span>เพิ่มผลงาน</span>
                <ChevronRight size={15} className="text-studio-muted group-hover:translate-x-1 transition-transform" />
              </h3>
              <p className="text-[11px] text-studio-secondary truncate">อัปโหลดรูปผลงานสักใหม่</p>
            </div>
          </a>

          <a
            href="/artist/flash?action=add"
            className="group bg-studio-card border border-studio-border hover:border-studio-red/60 p-4 rounded-xl transition-all shadow-md flex items-center space-x-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-950/30 border border-amber-800/40 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-semibold text-studio-primary group-hover:text-amber-400 transition-colors flex items-center justify-between">
                <span>เพิ่มลาย Flash</span>
                <ChevronRight size={15} className="text-studio-muted group-hover:translate-x-1 transition-transform" />
              </h3>
              <p className="text-[11px] text-studio-secondary truncate">สร้างลายสัก Flash ใหม่</p>
            </div>
          </a>
        </div>

        {/* Section 2: คำขอจากลูกค้า (Customer Requests assigned to current Artist) */}
        <section className="space-y-4 font-prompt">
          <div className="space-y-3 border-b border-studio-border/60 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
                  คำขอจากลูกค้า ({statusCounts.all})
                </h2>
              </div>
              <span className="text-xs text-studio-muted font-mono">
                ระบุถึง: {artistName}
              </span>
            </div>

            {/* Admin-styled Status Filter Tab Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'ALL', label: `ทั้งหมด (${statusCounts.all})` },
                { id: 'NEW', label: `คำขอใหม่ (${statusCounts.new})` },
                { id: 'WAITING_DEPOSIT', label: `รอมัดจำ (${statusCounts.waitingDeposit})` },
                { id: 'PENDING_SLIP', label: `สลิปรอตรวจ (${statusCounts.pendingSlip})` },
                { id: 'REJECTED', label: `ปฏิเสธ (${statusCounts.rejected})` },
                { id: 'CANCELLED_EXPIRED', label: `ยกเลิก / หมดอายุ (${statusCounts.cancelledExpiredTotal})` },
              ].map((tab) => {
                const isActive = requestFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRequestFilter(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-studio-sec text-amber-400 border-amber-500/60 shadow'
                        : 'bg-studio-card hover:bg-studio-sec text-studio-secondary hover:text-studio-primary border-studio-border'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse">
              กำลังโหลดรายการคำขอ...
            </div>
          ) : (
            (() => {
              const showPendingSlips = requestFilter === 'ALL' || requestFilter === 'PENDING_SLIP';
              const showRequests = requestFilter !== 'PENDING_SLIP';
              const requestsToRender = showRequests
                ? filteredRequests.filter((req) => req.derived_operational_status !== 'PENDING_SLIP')
                : [];

              const totalCountToRender = (showPendingSlips ? pendingSubmissions.length : 0) + requestsToRender.length;

              if (totalCountToRender === 0) {
                return (
                  <div className="p-6 sm:p-8 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-1.5">
                    <div className="w-10 h-10 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
                      <Inbox size={18} />
                    </div>
                    <p className="text-sm font-medium text-studio-primary">ไม่มีรายการคำขอในหมวดหมู่นี้</p>
                    <p className="text-xs text-studio-muted">
                      รายการคำขอจากลูกค้าตามสถานะที่เลือกจะปรากฏในส่วนนี้
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 gap-3.5">
                  {/* 1. Pending Payment Submissions (Slip Review Cards) */}
                  {showPendingSlips &&
                    pendingSubmissions.map((sub: any) => {
                      const booking = bookingsMap.get(sub.booking_id);
                      const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                      const customerName = getCleanCustomerName(sub.customer_user_id);
                      const customerPhone = getCustomerPhone(sub.customer_user_id);
                      const isFlashSub = Boolean(booking?.flash_reservation_id || (estimate as any)?.request_type === 'FLASH');
                      const rawSubStyle = (
                        (booking as any)?.style ||
                        (booking as any)?.style_preference ||
                        (estimate as any)?.style ||
                        (estimate as any)?.style_preference ||
                        (booking as any)?.flash_reservation?.flash_design?.style ||
                        (estimate as any)?.flash_reservation?.flash_design?.style ||
                        ''
                      );
                      const cleanStyle = rawSubStyle.replace(/\s*custom\s*/gi, '').trim();
                      const baseTitle = isFlashSub ? 'ลาย Flash' : 'งานสัก';
                      const tattooTitle = cleanStyle
                        ? (cleanStyle.toLowerCase() === baseTitle.toLowerCase() ? baseTitle : `${baseTitle} (${cleanStyle})`)
                        : (booking?.artwork_title?.replace(/\s*custom\s*/gi, '').trim() || baseTitle);

                      const depositRequired = Number(booking?.deposit_required ?? estimate?.deposit_required ?? 0);
                      const claimedAmount = Number(sub.claimed_amount || 0);

                      return (
                        <div
                          key={`SLIP-${sub.id}`}
                          className="bg-studio-card border border-amber-900/40 hover:border-amber-700/60 p-4 rounded-xl transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group shadow-md font-prompt"
                        >
                          <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                            {/* Single Slip Thumbnail */}
                            <div className="w-14 h-14 bg-studio-sec border border-amber-900/50 rounded-lg overflow-hidden shrink-0">
                              <PaymentSlipImage src={sub.slip_path} className="w-full h-full object-cover" />
                            </div>

                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded-full font-medium">
                                  สลิปรอตรวจ
                                </span>
                                <span className="text-[10px] text-studio-muted font-mono">#{sub.id.slice(0, 8)}</span>
                                <span className="text-[10px] text-studio-secondary font-mono">
                                  {formatDateBangkok(sub.submitted_at, true)}
                                </span>
                              </div>

                              <h4 className="text-sm font-semibold text-studio-primary group-hover:text-amber-400 transition-colors">
                                แจ้งโอนมัดจำ: ฿{(claimedAmount || depositRequired || 500).toLocaleString('th-TH')}
                              </h4>

                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                                <span>ลูกค้า: <strong className="text-studio-primary">{customerName}</strong></span>
                                <span>งาน: {tattooTitle}</span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 w-full sm:w-auto">
                            <button
                              type="button"
                              onClick={() => {
                                const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
                                const enrichedBooking = booking ? { ...booking, flash_reservation: flashRes || (booking as any).flash_reservation } : booking;
                                setSelectedPaymentReviewSub({ sub, booking: enrichedBooking, estimate, customerName, customerPhone, depositRequired });
                              }}
                              className="w-full sm:w-auto px-4 py-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border text-xs font-semibold rounded-lg transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                            >
                              <Eye size={14} />
                              <span>ดูรายละเอียด</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                  {/* 2. Customer Request Cards */}
                  {requestsToRender.map((item: any) => {
                    const customerName = getCleanCustomerName(item.customer_user_id);
                    const requestCode = item.requestCode || `REQ-${item.id.slice(0, 8).toUpperCase()}`;

                    const statusBadge = getStatusBadgeConfig(item.derived_operational_status);
                    const refImageSrc = item.ref_image || item.reference_images?.[0] || item.flash_designs?.image_url || null;
                    const isFlash = Boolean(item.is_flash || item.item_type === 'FLASH' || item.booking_type === 'FLASH' || item.flash_design_id);
                    const isInactive = item.derived_operational_status === 'EXPIRED' || item.derived_operational_status === 'CANCELLED' || item.derived_operational_status === 'REJECTED' || item.status === 'EXPIRED' || item.status === 'CANCELLED' || item.status === 'REJECTED';
                    const sizeCategory = getTattooSizeCategory(item.estimated_size_tier, item.width_cm, item.height_cm, item.size_text);
                    const { extractedTime } = parseNoteWithPreferredTime(item.description);
                    const rawTime = item.time_display ? extractHHMM(item.time_display) : item.preferred_time ? extractHHMM(item.preferred_time) : extractedTime;
                    const formattedTime = rawTime ? (rawTime.endsWith('น.') || rawTime.endsWith('น') ? rawTime : `${rawTime} น.`) : null;
                    const targetDate = item.date_display || item.preferred_date || item.requested_date;

                    const rawWorkTitle = isFlash
                      ? (item.flash_title || item.flash_designs?.title || item.title || item.artwork_title || 'ลาย Flash')
                      : (item.artwork_title || item.title || 'งานสัก');
                    const workTitle = rawWorkTitle.replace(/\s*custom\s*/gi, '').trim() || (isFlash ? 'ลาย Flash' : 'งานสัก');
                    const rawStyle = isFlash
                      ? (item.flash_style || item.flash_designs?.style || item.style || item.style_preference || '')
                      : (item.style || item.style_preference || item.style_display || '');
                    const styleName = rawStyle.toLowerCase() === 'custom' ? '' : rawStyle;
                    const placement = item.placement || 'ไม่ระบุตำแหน่ง';

                    return (
                      <div
                        key={`${item.item_type || 'REQ'}-${item.id}`}
                        className={
                          isInactive
                            ? "bg-zinc-950/40 border border-zinc-800/80 p-3.5 sm:p-4 rounded-xl transition-all duration-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 relative overflow-hidden font-prompt opacity-85"
                            : "bg-studio-card border border-studio-border hover:border-amber-500/50 p-3.5 sm:p-4 rounded-xl transition-all duration-200 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 relative overflow-hidden font-prompt"
                        }
                      >
                        {/* Top Row on Mobile / Left+Middle on Desktop */}
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          {/* Left: 64x64 Thumbnail */}
                          <div className={
                            isInactive
                              ? "w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 flex items-center justify-center relative grayscale contrast-75 opacity-70"
                              : "w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-studio-border/80 bg-studio-sec flex items-center justify-center relative shadow-sm"
                          }>
                            <CustomerReferenceImage
                              src={refImageSrc}
                              alt="งานสักอ้างอิง"
                              className="w-full h-full object-cover"
                            />
                          </div>

                          {/* Middle: Info (3 Lines) */}
                          <div className="flex-1 min-w-0 space-y-1">
                            {/* Line 1: Code Badge + Status Badge + Flash Badge */}
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className={
                                isInactive
                                  ? "text-xs font-mono font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800"
                                  : "text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2 py-0.5 rounded border border-studio-border"
                              }>
                                {requestCode}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadge.className}`}>
                                {statusBadge.label}
                              </span>
                              {isFlash && (
                                <span className={
                                  isInactive
                                    ? "text-[10px] px-2 py-0.5 rounded-full border bg-zinc-900/80 text-zinc-400 border-zinc-800 font-medium flex items-center gap-0.5"
                                    : "text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium flex items-center gap-0.5"
                                }>
                                  <Sparkles size={10} /> Flash
                                </span>
                              )}
                            </div>

                            {/* Line 2: Customer Name + Tattoo Title & Style + Size Badge */}
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs">
                              <span className={
                                isInactive
                                  ? "font-semibold text-zinc-300 truncate max-w-[140px] sm:max-w-[180px]"
                                  : "font-semibold text-studio-primary truncate max-w-[140px] sm:max-w-[180px]"
                              }>
                                {customerName}
                              </span>
                              <span className={isInactive ? "text-zinc-600" : "text-studio-muted"}>•</span>
                              <span className={isInactive ? "text-zinc-400 truncate" : "text-studio-secondary truncate"}>
                                {workTitle} {styleName && workTitle.toLowerCase() !== styleName.toLowerCase() ? `(${styleName})` : ''}
                              </span>
                              {sizeCategory ? (
                                <span className={
                                  isInactive
                                    ? "text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono"
                                    : "text-[10px] px-1.5 py-0.5 rounded bg-studio-sec text-amber-400 border border-amber-500/30 font-mono font-bold"
                                }>
                                  Size {sizeCategory}
                                </span>
                              ) : (item.width_cm && item.height_cm) ? (
                                <span className={
                                  isInactive
                                    ? "text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono"
                                    : "text-[10px] px-1.5 py-0.5 rounded bg-studio-sec text-studio-primary border border-studio-border font-mono"
                                }>
                                  {formatTattooSize(item.width_cm, item.height_cm)}
                                </span>
                              ) : null}
                            </div>

                            {/* Line 3: Placement, Date, Time */}
                            <div className={`flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs ${isInactive ? 'text-zinc-400' : 'text-studio-secondary'}`}>
                              <div className="flex items-center space-x-1">
                                <Layers size={13} className={isInactive ? 'text-zinc-500 shrink-0' : 'text-white shrink-0'} />
                                <span>ตำแหน่ง: <strong className={isInactive ? 'text-zinc-300 font-normal' : 'text-white font-normal'}>{placement}</strong></span>
                              </div>
                              <span className={isInactive ? 'text-zinc-600' : 'text-studio-muted'}>•</span>
                              <div className={`flex items-center space-x-1 font-mono font-medium ${isInactive ? 'text-zinc-300' : 'text-white'}`}>
                                <CalendarIcon size={13} className={isInactive ? 'text-zinc-500 shrink-0' : 'text-white shrink-0'} />
                                <span>{targetDate ? formatDateBangkok(targetDate) : 'ไม่ระบุวัน'}</span>
                              </div>
                              {formattedTime && (
                                <>
                                  <span className={isInactive ? 'text-zinc-600' : 'text-studio-muted'}>•</span>
                                  <div className={`flex items-center space-x-1 font-mono font-semibold ${isInactive ? 'text-zinc-300' : 'text-white'}`}>
                                    <Clock size={13} className={isInactive ? 'text-zinc-500 shrink-0' : 'text-white shrink-0'} />
                                    <span>{formattedTime}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Action Button */}
                        <button
                          onClick={() => handleOpenRequestDetail(item.rawItem || item)}
                          className={
                            isInactive
                              ? "w-full sm:w-auto px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded-lg border border-zinc-800 transition-all flex items-center justify-center space-x-1.5 cursor-pointer shrink-0"
                              : "w-full sm:w-auto px-4 py-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded-lg border border-studio-border transition-all flex items-center justify-center space-x-1.5 cursor-pointer shrink-0"
                          }
                        >
                          <Eye size={14} />
                          <span>ดูรายละเอียด</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </section>

        {/* Section 3: คิวงาน (Job Queue for Artist) */}
        <section className="space-y-4 font-prompt">
          <div className="space-y-3 border-b border-studio-border/60 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-studio-red animate-pulse" />
                <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
                  คิวงาน ({queueCounts.all})
                </h2>
              </div>
            </div>

            {/* Status Filter Tab Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'ALL', label: `ทั้งหมด (${queueCounts.all})` },
                { id: 'SCHEDULED', label: `นัดหมายแล้ว (${queueCounts.scheduled})` },
                { id: 'COMPLETED', label: `งานเสร็จสิ้น (${queueCounts.completed})` },
                { id: 'CANCELLED', label: `ยกเลิก (${queueCounts.cancelled})` },
              ].map((tab) => {
                const isActive = queueFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setQueueFilter(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-studio-sec text-amber-400 border-amber-500/60 shadow'
                        : 'bg-studio-card hover:bg-studio-sec text-studio-secondary hover:text-studio-primary border-studio-border'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse">
              กำลังโหลดข้อมูลคิวงาน...
            </div>
          ) : filteredQueueBookings.length === 0 ? (
            <div className="p-8 sm:p-12 text-center bg-studio-card/60 border border-dashed border-studio-border rounded-xl space-y-2">
              <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
                <Sparkles size={20} />
              </div>
              <p className="text-sm text-studio-primary font-medium">
                {queueFilter === 'SCHEDULED'
                  ? 'ยังไม่มีรายการนัดหมาย'
                  : queueFilter === 'COMPLETED'
                  ? 'ยังไม่มีคิวงานที่เสร็จสิ้น'
                  : queueFilter === 'CANCELLED'
                  ? 'ไม่มีคิวงานที่ถูกยกเลิก'
                  : 'ยังไม่มีรายการคิวงานในระบบ'}
              </p>
              <p className="text-xs text-studio-muted max-w-sm mx-auto">
                คุณสามารถตรวจสอบคิวนัดหมายล่วงหน้าหรือดูปฏิทินงานสักได้ที่เมนูปฏิทิน
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredQueueBookings.map((item: any) => {
                const sess = item.displaySession;
                const booking = item.booking || bookingsMap.get(item.booking_id);
                const customerUserId = booking?.customer_user_id;
                const customerName = getCleanCustomerName(customerUserId);
                const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                const summary = paymentSummaryMap.get(item.booking_id);
                const qBadge = getQueueBadgeConfig(item.derived_op_status);

                const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
                const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
                const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
                const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;
                const flashStyle = flashDesignObj?.style || flashRes?.flash_design_style;

                const refImageSrc = flashImgUrl 
                  || booking?.artwork_image_url 
                  || estimate?.reference_images?.[0] 
                  || null;

                const rawWorkTitle = (booking?.artwork_title && booking.artwork_title !== 'ลาย Flash' && booking.artwork_title !== 'งานสัก')
                  ? booking.artwork_title
                  : (flashTitle ? `ลาย Flash: ${flashTitle}` : (estimate?.request_type === 'FLASH' || booking?.flash_reservation_id ? 'ลาย Flash' : 'งานสัก'));
                const workTitle = rawWorkTitle.replace(/\s*custom\s*/gi, '').trim() || 'งานสัก';
                const rawStyle = flashStyle || estimate?.style || estimate?.style_preference || booking?.style_preference || '';
                const styleName = rawStyle.toLowerCase() === 'custom' ? '' : rawStyle;
                const placement = booking?.placement || flashRes?.placement || estimate?.placement || 'ไม่ระบุตำแหน่ง';
                const widthCm = booking?.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? flashRes?.flash_design_width_cm ?? estimate?.width_cm ?? null;
                const heightCm = booking?.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? flashRes?.flash_design_height_cm ?? estimate?.height_cm ?? null;
                const sizeCategory = getTattooSizeCategory(estimate?.estimated_size_tier, widthCm, heightCm, estimate?.size_text);
                const sizeStr = formatTattooSize(widthCm, heightCm);
                const depositReq = summary?.deposit_required ?? estimate?.deposit_required ?? 500;

                const hasPendingSlip = pendingSubmissions.some((sub: any) => sub.booking_id === item.booking_id);
                let depositStatusText = 'ยืนยันแล้ว';
                let depositStatusBadge = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60';

                if (booking?.status === 'CANCELLED' || booking?.status === 'REJECTED') {
                  depositStatusText = 'เสียสิทธิ์';
                  depositStatusBadge = 'bg-red-950/60 text-red-400 border-red-800/60';
                } else if (Number(depositReq) > 0) {
                  if (summary?.deposit_paid || summary?.deposit_paid === true || booking?.status === 'CONFIRMED' || booking?.status === 'IN_PROGRESS' || booking?.status === 'COMPLETED') {
                    depositStatusText = 'ยืนยันแล้ว';
                    depositStatusBadge = 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60';
                  } else if (hasPendingSlip) {
                    depositStatusText = 'ส่งหลักฐานแล้ว';
                    depositStatusBadge = 'bg-purple-950/60 text-purple-400 border-purple-800/60';
                  } else {
                    depositStatusText = 'รอมัดจำ';
                    depositStatusBadge = 'bg-amber-950/60 text-amber-400 border-amber-800/60';
                  }
                } else {
                  depositStatusText = 'ไม่ต้องมัดจำ';
                  depositStatusBadge = 'bg-blue-950/60 text-blue-400 border-blue-800/60';
                }

                const startTimeStr = formatTimeBangkok(sess.start_at);

                return (
                  <div
                    key={item.booking_id}
                    className="bg-studio-card border border-studio-border hover:border-amber-500/50 p-4 rounded-xl transition-all duration-200 shadow-md grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center font-prompt"
                  >
                    {/* Left: Thumbnail & Main Info (9 cols on MD) */}
                    <div className="md:col-span-9 flex items-center gap-3.5 min-w-0">
                      {/* 64x64 Thumbnail Image */}
                      <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-studio-border/80 bg-studio-sec flex items-center justify-center relative shadow-sm">
                        <CustomerReferenceImage
                          src={refImageSrc}
                          alt="งานสัก"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Info (3 Lines) */}
                      <div className="flex-1 min-w-0 space-y-1">
                        {/* Line 1: Queue Code + Session Number Badge ("รอบที่ N") + Booking Status Badge ("นัดหมายแล้ว") */}
                        <div className="flex items-center flex-wrap gap-1.5">
                          {booking?.id && (
                            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                              คิว #{booking.id.slice(0, 8).toUpperCase()}
                            </span>
                          )}
                          <span className="text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2 py-0.5 rounded border border-studio-border">
                            รอบที่ {sess.session_number || 1}
                          </span>
                          {/* Booking Status Badge */}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${qBadge.className}`} title="สถานะงานหลัก">
                            {qBadge.label}
                          </span>
                        </div>

                        {/* Line 2: Customer Name + Tattoo Title & Style + Size */}
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs">
                          <span className="font-semibold text-studio-primary truncate max-w-[140px] sm:max-w-[180px]">
                            {customerName}
                          </span>
                          <span className="text-studio-muted">•</span>
                          <span className="text-studio-secondary truncate">
                            {workTitle} {styleName ? `(${styleName})` : ''}
                          </span>
                          {sizeCategory ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-studio-sec text-white border border-studio-border font-mono font-bold">
                              Size {sizeCategory}
                            </span>
                          ) : (widthCm && heightCm) ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-studio-sec text-white border border-studio-border font-mono">
                              {sizeStr}
                            </span>
                          ) : null}
                        </div>

                        {/* Line 3: Placement, Date, Time of Next Session & Deposit status */}
                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-xs text-studio-secondary">
                          <div className="flex items-center space-x-1">
                            <Layers size={13} className="text-white shrink-0" />
                            <span>ตำแหน่ง: <strong className="text-white font-normal">{placement}</strong></span>
                          </div>
                          <span className="text-studio-muted">•</span>
                          <div className="flex items-center space-x-1 text-white font-mono font-medium">
                            <CalendarIcon size={13} className="text-white shrink-0" />
                            <span>{formatDateBangkok(sess.start_at)}</span>
                          </div>
                          <span className="text-studio-muted">•</span>
                          <div className="flex items-center space-x-1 font-mono text-white font-semibold">
                            <Clock size={13} className="text-white shrink-0" />
                            <span>{startTimeStr}</span>
                          </div>
                          {depositStatusText && depositStatusText !== 'ยืนยันแล้ว' && (
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-medium inline-block ml-1 ${depositStatusBadge}`}>
                              {depositStatusText}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Action Button (3 cols on MD) */}
                    <div className="md:col-span-3 flex md:justify-end items-center border-t md:border-t-0 border-studio-border/50 pt-2.5 md:pt-0">
                      <button
                        type="button"
                        onClick={() => handleOpenSessionDetail(sess)}
                        className="w-full md:w-auto px-4 py-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded-lg border border-studio-border transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                      >
                        <Eye size={14} />
                        <span>ดูรายละเอียด</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>


      </main>

      {/* Mobile Bottom Nav */}
      <ArtistMobileNav />

      {/* Session Detail Drawer */}
      <ArtistAppointmentDetailDrawer
        session={selectedSessionDetail}
        isOpen={isSessionDrawerOpen}
        onClose={() => {
          setIsSessionDrawerOpen(false);
          setSelectedSessionDetail(null);
        }}
        onRefresh={fetchArtistData}
      />

      {/* Read-Only / Operational Pending Request Detail Drawer */}
      <ArtistRequestDetailDrawer
        estimate={selectedPendingEstimate}
        isOpen={isRequestDrawerOpen}
        onClose={() => {
          setIsRequestDrawerOpen(false);
          setSelectedPendingEstimate(null);
        }}
        onSuccess={fetchArtistData}
      />

      {/* Artist Payment Review Drawer */}
      {selectedPaymentReviewSub && (
        <ArtistPaymentReviewDrawer
          isOpen={Boolean(selectedPaymentReviewSub)}
          onClose={() => setSelectedPaymentReviewSub(null)}
          submission={selectedPaymentReviewSub.sub}
          booking={selectedPaymentReviewSub.booking}
          estimate={selectedPaymentReviewSub.estimate}
          customerName={selectedPaymentReviewSub.customerName}
          customerPhone={selectedPaymentReviewSub.customerPhone}
          depositRequired={selectedPaymentReviewSub.depositRequired}
        />
      )}

      {/* Standalone Payment Slip Lightbox Modal */}
      <PaymentSlipLightbox
        src={activeLightboxSlipPath}
        isOpen={Boolean(activeLightboxSlipPath)}
        onClose={() => setActiveLightboxSlipPath(null)}
      />

      {/* Mobile Navigation */}
      <ArtistMobileNav />
    </div>
  );
}
