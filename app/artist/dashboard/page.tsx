'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '../../../components/AppContext';
import { createClient } from '../../../lib/supabase/client';
import ArtistHeader from '../../../components/artist/ArtistHeader';
import ArtistMobileNav from '../../../components/artist/ArtistMobileNav';
import ArtistAppointmentDetailDrawer, { ArtistSessionDetail } from '../../../components/artist/ArtistAppointmentDetailDrawer';
import PaymentSlipLightbox from '@/components/common/PaymentSlipLightbox';
import ReferenceImageLightbox from '@/components/common/ReferenceImageLightbox';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import { parseNoteWithPreferredTime } from '@/lib/noteUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import { getTattooSizeCategory } from '@/lib/utils/tattooDuration';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  ChevronRight, 
  Sparkles, 
  RefreshCw, 
  Inbox, 
  Image as ImageIcon, 
  Wallet, 
  ArrowRight,
  Eye,
  User,
  Phone,
  CalendarCheck,
  CheckCircle2,
  Plus,
  Layers,
  Palette,
  MapPin,
  Maximize2
} from 'lucide-react';
import { 
  getTodayBangkokStr, 
  getDateStrBangkok, 
  formatDateBangkok, 
  formatTimeBangkok 
} from '@/components/admin/calendar/calendarUtils';
import { getDepositDeadlineInfo } from '@/components/portal/portalUtils';

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

function isConfirmedDepositBooking(
  booking?: any,
  estimate?: any,
  session?: any,
  paymentSummary?: any
): boolean {
  if (!booking) return false;

  // 1. Strictly exclude pre-deposit, unverified slip, or terminal statuses
  if (['WAITING_DEPOSIT', 'PENDING', 'APPROVED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(booking.status)) {
    return false;
  }

  // 2. Must be in an active confirmed queue status
  if (!['CONFIRMED', 'IN_PROGRESS'].includes(booking.status)) {
    return false;
  }

  // 3. Must not be deposit-expired
  if (isDepositExpired(booking, estimate, session)) {
    return false;
  }

  // 4. Financial verification if payment summary is present and deposit is required
  if (paymentSummary && paymentSummary.deposit_required > 0) {
    if (paymentSummary.deposit_paid === false) {
      return false;
    }
  }

  return true;
}

export default function ArtistDashboardPage() {
  const { isStaffLoggedIn, staffRole, staffArtistId, staffArtistRecord, profile, authLoading } = useApp();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);
  const [allArtistRequests, setAllArtistRequests] = useState<any[]>([]);
  const [bookingsMap, setBookingsMap] = useState<Map<string, any>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, any>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const [estimatesMap, setEstimatesMap] = useState<Map<string, any>>(new Map());
  const [paymentSummaryMap, setPaymentSummaryMap] = useState<Map<string, any>>(new Map());
  const [flashReservationsMap, setFlashReservationsMap] = useState<Map<string, any>>(new Map());

  // Drawer States
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<ArtistSessionDetail | null>(null);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = useState(false);
  const [activeLightboxSlipPath, setActiveLightboxSlipPath] = useState<string | null>(null);
  const [activeReferenceImageUrl, setActiveReferenceImageUrl] = useState<string | null>(null);

  const isAuthorized = Boolean(
    isStaffLoggedIn && (staffRole === 'ARTIST' || (staffRole === 'ADMIN' && staffArtistId))
  );

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

  const fetchArtistData = useCallback(async () => {
    if (!isAuthorized || !staffArtistId) return;
    setLoading(true);

    try {
      const { data: dbSessions } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('artist_id', staffArtistId)
        .order('start_at', { ascending: true });

      const sessionList = dbSessions ? [...dbSessions] : [];

      const { data: bData } = await supabase
        .from('bookings')
        .select('*')
        .eq('artist_id', staffArtistId);

      const dbBookings = bData || [];
      const bMap = new Map<string, any>();
      dbBookings.forEach((b: any) => bMap.set(b.id, b));
      setBookingsMap(bMap);

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

      const { data: allEstData } = await supabase
        .from('estimate_requests')
        .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, request_type, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, work_type, proposed_date, proposed_time, proposed_price, proposed_artist_note, is_date_proposed')
        .eq('artist_id', staffArtistId)
        .order('created_at', { ascending: false });

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

      const dbBookingIds = dbBookings.map((b: any) => b.id);
      let pSubmissions: any[] = [];
      let mRev = 0;
      const currentMonthStr = getTodayBangkokStr().slice(0, 7);

      const completedBookingsThisMonth = dbBookings.filter((b: any) => {
        if (b.status !== 'COMPLETED') return false;
        if (!b.completed_at) return false;
        return getDateStrBangkok(b.completed_at).slice(0, 7) === currentMonthStr;
      });

      setCompletedJobsThisMonth(completedBookingsThisMonth.length);
      const completedBookingIdsThisMonth = new Set(completedBookingsThisMonth.map((b: any) => b.id));

      if (dbBookingIds.length > 0) {
        const { data: subData } = await supabase
          .from('booking_payment_submissions')
          .select('*')
          .in('booking_id', dbBookingIds)
          .eq('status', 'PENDING');
        pSubmissions = subData || [];

        if (completedBookingIdsThisMonth.size > 0) {
          const { data: payData } = await supabase
            .from('booking_payments')
            .select('id, booking_id, amount, status')
            .in('booking_id', Array.from(completedBookingIdsThisMonth))
            .eq('status', 'RECORDED');

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

        const { data: sumData } = await supabase
          .from('booking_payment_summary')
          .select('*')
          .in('booking_id', dbBookingIds);

        const sumMap = new Map<string, any>();
        (sumData || []).forEach((s: any) => sumMap.set(s.booking_id, s));
        setPaymentSummaryMap(sumMap);

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
      }
      setPendingSubmissions(pSubmissions);
      setMonthlyRevenue(mRev);

      const estItems = (allEstData || []).map((est: any) => {
        const linkedBooking = Array.from(bMap.values()).find((b: any) => b.estimate_request_id === est.id);
        const hasPendingSlip = linkedBooking
          ? pSubmissions.some((s: any) => s.booking_id === linkedBooking.id && s.status === 'PENDING')
          : false;

        let opStatus = 'NEW';
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
          if (isDepositExpired(linkedBooking, est)) {
            opStatus = 'EXPIRED';
          } else {
            opStatus = 'WAITING_DEPOSIT';
          }
        }
        return { ...est, derived_operational_status: opStatus };
      });

      const flashItems = (artistFlashRes || []).map((res: any) => {
        const linkedBooking = Array.from(bMap.values()).find((b: any) => b.flash_reservation_id === res.id);
        const hasPendingSlip = linkedBooking
          ? pSubmissions.some((s: any) => s.booking_id === linkedBooking.id && s.status === 'PENDING')
          : false;

        let opStatus = 'NEW';
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
          if (isDepositExpired(linkedBooking, res)) {
            opStatus = 'EXPIRED';
          } else {
            opStatus = 'WAITING_DEPOSIT';
          }
        }
        return { ...res, is_flash: true, derived_operational_status: opStatus };
      });

      const combinedRequests = [...estItems, ...flashItems]
        .filter((r: any) => r.derived_operational_status !== 'CONFIRMED')
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      setAllArtistRequests(combinedRequests);

      const customerUserIds = Array.from(
        new Set([
          ...dbBookings.map((b: any) => b.customer_user_id),
          ...combinedRequests.map((e: any) => e.customer_user_id),
          ...pSubmissions.map((s: any) => s.customer_user_id)
        ].filter(Boolean))
      );

      if (customerUserIds.length > 0) {
        const { data: contactsData } = await supabase
          .rpc('artist_get_customer_contacts', { p_customer_user_ids: customerUserIds });

        const cMap = new Map<string, any>();
        const pMap = new Map<string, any>();

        (contactsData || []).forEach((c: any) => {
          if (c.user_id) {
            cMap.set(c.user_id, { user_id: c.user_id, display_name: c.display_name, phone: c.phone });
            pMap.set(c.user_id, { user_id: c.user_id, display_name: c.display_name, phone: c.phone });
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

  const statusCounts = useMemo(() => {
    let newReq = 0;
    let waitingDeposit = 0;
    let pendingSlip = pendingSubmissions.length;

    allArtistRequests.forEach((req) => {
      const op = req.derived_operational_status;
      if (op === 'NEW') newReq++;
      else if (op === 'WAITING_DEPOSIT') waitingDeposit++;
    });

    return {
      all: pendingSlip + newReq + waitingDeposit,
      new: newReq,
      waitingDeposit,
      pendingSlip,
    };
  }, [allArtistRequests, pendingSubmissions]);

  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  const getCleanCustomerName = (uid?: string | null) => {
    if (!uid) return 'ลูกค้า';
    const c = customersMap.get(uid);
    const p = profilesMap.get(uid);
    const candidate = (c?.display_name && c.display_name !== 'ลูกค้าประจำ')
      ? c.display_name
      : (p?.display_name && p.display_name !== 'ลูกค้าประจำ')
      ? p.display_name
      : (c?.first_name ? `${c.first_name} ${c.last_name || ''}`.trim() : null);
    if (candidate && candidate !== 'ลูกค้าประจำ' && candidate !== 'ลูกค้า 157 TATTOO') return candidate;
    return 'ลูกค้า (ไม่ระบุชื่อ)';
  };

  const getCustomerPhone = (uid?: string | null) => {
    if (!uid) return '';
    const c = customersMap.get(uid);
    const p = profilesMap.get(uid);
    const phone = p?.phone || c?.phone || '';
    return phone ? formatThaiPhoneForDisplay(phone) : '';
  };

  const upcomingSessions = useMemo(() => {
    const nowMs = Date.now();
    const list = sessions.filter((s: any) => {
      if (s.status === 'CANCELLED' || s.status === 'COMPLETED') return false;
      const b = bookingsMap.get(s.booking_id);
      if (!b) return false;

      const estimate = b.estimate_request_id ? estimatesMap.get(b.estimate_request_id) : null;
      const paySum = paymentSummaryMap.get(b.id);

      // Enforce strict Target Business Rule: only confirmed deposit bookings qualify as queue
      if (!isConfirmedDepositBooking(b, estimate, s, paySum)) {
        return false;
      }

      const startMs = new Date(s.start_at).getTime();
      const endMs = s.end_at ? new Date(s.end_at).getTime() : startMs + 2 * 3600 * 1000;
      if (s.status !== 'IN_PROGRESS' && endMs <= nowMs) return false;
      return true;
    });
    list.sort((a: any, b: any) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    return list;
  }, [sessions, bookingsMap, estimatesMap, paymentSummaryMap]);

  const todaySessions = useMemo(() => {
    return upcomingSessions.filter((s: any) => getDateStrBangkok(s.start_at) === todayStr);
  }, [upcomingSessions, todayStr]);

  const activeTodaySession = useMemo(() => todaySessions[0] || null, [todaySessions]);

  const activeSessionBooking = useMemo(() => activeTodaySession ? bookingsMap.get(activeTodaySession.booking_id) : null, [activeTodaySession, bookingsMap]);
  const activeSessionCustomerName = useMemo(() => activeSessionBooking ? getCleanCustomerName(activeSessionBooking.customer_user_id) : '', [activeSessionBooking, customersMap, profilesMap]);
  const activeSessionCustomerPhone = useMemo(() => activeSessionBooking ? getCustomerPhone(activeSessionBooking.customer_user_id) : '', [activeSessionBooking, customersMap, profilesMap]);

  const activeSessionDetails = useMemo(() => {
    if (!activeSessionBooking) return null;
    const estimate = activeSessionBooking.estimate_request_id ? estimatesMap.get(activeSessionBooking.estimate_request_id) : null;
    const flashRes = activeSessionBooking.flash_reservation_id ? flashReservationsMap.get(activeSessionBooking.flash_reservation_id) : null;
    const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
    const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
    const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;
    const isFlash = Boolean(activeSessionBooking.flash_reservation_id || estimate?.request_type === 'FLASH');
    
    const rawTitle = activeSessionBooking.artwork_title || (flashTitle ? `ลาย Flash: ${flashTitle}` : (isFlash ? 'ลาย Flash' : 'งานสัก Custom'));
    const artworkTitle = rawTitle.replace(/\s*custom\s*/gi, '').trim() || (isFlash ? 'ลาย Flash' : 'งานสัก');
    const referenceImages: string[] = [];
    if (flashImgUrl) referenceImages.push(flashImgUrl);
    if (activeSessionBooking.artwork_image_url && !referenceImages.includes(activeSessionBooking.artwork_image_url)) {
      referenceImages.push(activeSessionBooking.artwork_image_url);
    }
    if (estimate?.reference_images) {
      let rawList = estimate.reference_images;
      if (typeof rawList === 'string') {
        try {
          rawList = JSON.parse(rawList);
        } catch {
          rawList = [rawList];
        }
      }
      if (Array.isArray(rawList)) {
        rawList.forEach((img: any) => {
          if (img && typeof img === 'string' && !referenceImages.includes(img)) {
            referenceImages.push(img);
          }
        });
      }
    }

    const refImageSrc = referenceImages[0] || flashImgUrl || activeSessionBooking.artwork_image_url || estimate?.reference_images?.[0] || null;

    const rawStyle = flashDesignObj?.style || flashRes?.flash_design_style || estimate?.style || estimate?.style_preference || activeSessionBooking.style_preference || '';
    const styleName = rawStyle.replace(/\s*custom\s*/gi, '').trim();

    const width = activeSessionBooking.width_cm ?? flashRes?.width_cm ?? flashDesignObj?.width_cm ?? estimate?.width_cm ?? null;
    const height = activeSessionBooking.height_cm ?? flashRes?.height_cm ?? flashDesignObj?.height_cm ?? estimate?.height_cm ?? null;
    const sizeCategory = getTattooSizeCategory(activeSessionBooking.size_tier || estimate?.estimated_size_tier, width, height, activeSessionBooking.size_text);
    const rawSizeText = activeSessionBooking.size_tier || estimate?.estimated_size_tier || activeSessionBooking.size_text || (sizeCategory ? `Size ${sizeCategory}` : null);
    const sizeDisplay = (width || height || activeSessionBooking.size_tier || estimate?.estimated_size_tier || sizeCategory)
      ? formatTattooSize(width, height, rawSizeText)
      : null;

    let sizeTier: string | null = null;
    let sizeDimension: string | null = null;

    if (sizeDisplay) {
      const parts = sizeDisplay.split(/\s+[•·]\s+/);
      if (parts.length >= 2) {
        sizeTier = parts[0].trim();
        sizeDimension = parts.slice(1).join(' ').trim();
      } else if (sizeDisplay.startsWith('Size ') || sizeDisplay.startsWith('ไซซ์ ')) {
        sizeTier = sizeDisplay.trim();
        sizeDimension = null;
      } else {
        sizeTier = null;
        sizeDimension = sizeDisplay.trim();
      }
    }

    const placement = activeSessionBooking.placement || flashRes?.placement || estimate?.placement || 'ไม่ระบุตำแหน่ง';

    return {
      artworkTitle,
      refImageSrc,
      referenceImages,
      styleName,
      placement,
      sizeDisplay,
      sizeTier,
      sizeDimension,
      isFlash,
    };
  }, [activeSessionBooking, estimatesMap, flashReservationsMap]);

  const handleOpenSessionDetail = (sess: any) => {
    const booking = bookingsMap.get(sess.booking_id);
    const customerUserId = booking?.customer_user_id;
    const customer = customerUserId ? customersMap.get(customerUserId) : null;
    const prof = customerUserId ? profilesMap.get(customerUserId) : null;
    const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;

    const flashRes = booking?.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
    const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
    const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
    const flashImgUrl = flashDesignObj?.image_url || flashRes?.flash_design_image_url;

    const detail: ArtistSessionDetail = {
      session_id: sess.id,
      session_number: sess.session_number || 1,
      session_title: sess.session_title,
      start_at: sess.start_at,
      end_at: sess.end_at,
      session_status: sess.status,
      session_notes: sess.session_notes || sess.notes || null,

      booking_id: sess.booking_id,
      booking_status: booking?.status || 'CONFIRMED',
      artwork_title: booking?.artwork_title || (flashTitle ? `ลาย Flash: ${flashTitle}` : null),
      artwork_image_url: flashImgUrl || booking?.artwork_image_url || null,
      placement: booking?.placement || flashRes?.placement || estimate?.placement || null,
      customer_name: getCleanCustomerName(customerUserId),
      customer_phone: customer?.phone || prof?.phone || null,
      customer_email: prof?.email || customer?.email || null,
    };

    setSelectedSessionDetail(detail);
    setIsSessionDrawerOpen(true);
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
    <div className="min-h-screen bg-studio-main text-studio-primary font-prompt flex flex-col md:pl-64 pb-20 md:pb-10">
      <ArtistHeader />

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 md:px-10 xl:px-12 py-5 md:py-7 space-y-5 md:space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-studio-border/50 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-amber-400 font-semibold uppercase tracking-wider">
                Artist Portal
              </span>
              <span className="text-studio-muted text-xs">•</span>
              <span className="text-xs text-studio-secondary">
                {formatDateBangkok(new Date().toISOString(), true)}
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-heading font-semibold text-studio-primary mt-0.5">
              ยินดีต้อนรับ, {artistName} {artistNickname}
            </h1>
          </div>

          <button
            onClick={() => fetchArtistData()}
            disabled={loading}
            className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 bg-studio-card border border-studio-border hover:border-studio-red/50 text-xs text-studio-secondary hover:text-studio-primary rounded-xl transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-studio-red-bright' : ''} />
            <span>อัปเดตข้อมูล</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TOP SECTION: 3 SUMMARY CARDS */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 font-prompt">
          {/* Card 1: คำขอใหม่ */}
          <a
            href="/artist/requests"
            className="bg-studio-card border border-studio-border hover:border-amber-500/50 p-4 rounded-xl flex items-center justify-between shadow-md transition-all cursor-pointer group"
          >
            <div className="space-y-0.5 min-w-0 pr-1">
              <span className="text-[11px] text-studio-secondary uppercase tracking-wider font-medium block truncate">
                คำขอใหม่
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400 truncate">
                {statusCounts.new} <span className="text-xs font-normal text-studio-muted">รายการ</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-950/30 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
              <Inbox size={18} />
            </div>
          </a>

          {/* Card 2: รอตรวจสอบสลิป */}
          <a
            href="/artist/requests"
            className="bg-studio-card border border-studio-border hover:border-orange-500/50 p-4 rounded-xl flex items-center justify-between shadow-md transition-all cursor-pointer group"
          >
            <div className="space-y-0.5 min-w-0 pr-1">
              <span className="text-[11px] text-studio-secondary uppercase tracking-wider font-medium block truncate">
                รอตรวจสอบสลิป
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-orange-400 truncate">
                {statusCounts.pendingSlip} <span className="text-xs font-normal text-studio-muted">รายการ</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-orange-950/30 border border-orange-800/40 flex items-center justify-center text-orange-400 shrink-0 group-hover:scale-105 transition-transform">
              <Wallet size={18} />
            </div>
          </a>

          {/* Card 3: คิวงาน */}
          <a
            href="/artist/calendar?view=queue"
            className="bg-studio-card border border-studio-border hover:border-blue-500/50 p-4 rounded-xl flex items-center justify-between shadow-md transition-all cursor-pointer group"
          >
            <div className="space-y-0.5 min-w-0 pr-1">
              <span className="text-[11px] text-studio-secondary uppercase tracking-wider font-medium block truncate">
                คิวงาน
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-blue-400 truncate">
                {Array.from(bookingsMap.values()).filter((b: any) => ['CONFIRMED', 'IN_PROGRESS'].includes(b.status)).length} <span className="text-xs font-normal text-studio-muted">งาน</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-blue-950/30 border border-blue-800/40 flex items-center justify-center text-blue-400 shrink-0 group-hover:scale-105 transition-transform">
              <CalendarCheck size={18} />
            </div>
          </a>
        </div>

        {/* ========================================================================= */}
        {/* MAIN SECTION: CONCEPT 1 (Hero Next Queue + Upcoming Appointments List) */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          
          {/* LEFT HERO: งานวันนี้ (lg:col-span-7) — CONCEPT 4 APP-STYLE CARD */}
          <div className="lg:col-span-7 bg-[#171512] border border-amber-500/30 p-5 rounded-2xl shadow-xl flex flex-col justify-between space-y-4.5 relative overflow-hidden font-prompt">
            {/* Ambient Gold Glow Background effect */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* 1. SECTION HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-studio-border/60 pb-3.5 z-10">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-studio-red-bright animate-pulse shrink-0" />
                <div>
                  <h2 className="text-sm sm:text-base font-heading font-bold text-[#ECE4D3] uppercase tracking-wider flex items-center gap-2">
                    <span>งานวันนี้</span>
                  </h2>
                  <p className="text-[11px] text-studio-secondary mt-0.5">
                    คิวงานของคุณในวันนี้ ทั้งหมด {todaySessions.length} รายการ
                  </p>
                </div>
              </div>
              {activeTodaySession && (
                <div className="self-start sm:self-auto">
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 px-3 py-1.5 rounded-full border border-amber-500/40 inline-flex items-center gap-1.5 shadow-xs">
                    <Clock size={13} className="text-amber-400" />
                    <span>วันนี้ • {formatTimeBangkok(activeTodaySession.start_at)}</span>
                  </span>
                </div>
              )}
            </div>

            {/* Content Body */}
            {loading ? (
              <div className="py-12 text-center text-studio-secondary animate-pulse text-xs">
                กำลังโหลดคิวงาน...
              </div>
            ) : activeTodaySession && activeSessionBooking ? (
              <div className="space-y-3.5 z-10 my-auto">
                
                {/* 2. APPOINTMENT CARD — TOP AREA */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0E0D0C] border border-studio-border/80">
                  {/* Left: Thumbnail & Customer Details */}
                  <div className="flex items-center space-x-3.5 min-w-0 w-full sm:w-auto">
                    {activeSessionDetails?.refImageSrc ? (
                      <div 
                        onClick={() => setActiveReferenceImageUrl(activeSessionDetails.refImageSrc)}
                        className="w-[110px] h-[110px] sm:w-[125px] sm:h-[125px] rounded-xl overflow-hidden border border-amber-500/30 bg-studio-card shrink-0 relative shadow-md group cursor-pointer"
                      >
                        <CustomerReferenceImage
                          src={activeSessionDetails.refImageSrc}
                          alt="รูปงานสัก"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye size={20} className="text-amber-400" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-[110px] h-[110px] sm:w-[125px] sm:h-[125px] rounded-xl border border-studio-border bg-studio-card shrink-0 flex items-center justify-center text-studio-muted">
                        <ImageIcon size={28} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/70">
                          รอบที่ {activeTodaySession.session_number || 1}
                        </span>
                        {activeTodaySession.status === 'IN_PROGRESS' ? (
                          <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-[#9C2F2F]/20 text-[#D64545] border border-[#9C2F2F]/60 inline-flex items-center gap-1 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#D64545] animate-pulse" />
                            กำลังสัก
                          </span>
                        ) : activeTodaySession.status === 'COMPLETED' ? (
                          <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/80">
                            งานเสร็จสิ้น
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-400/40">
                            นัดหมายแล้ว
                          </span>
                        )}
                        {activeSessionDetails?.isFlash && (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1">
                            <Sparkles size={10} /> Flash
                          </span>
                        )}
                        <span className="sm:hidden text-xs font-mono text-[#B8B0A3] ml-1 font-normal">
                          #{activeSessionBooking.id.slice(0, 8).toUpperCase()}
                        </span>
                      </div>

                      <h3 className="text-base sm:text-lg font-bold text-[#ECE4D3] truncate tracking-tight">
                        {activeSessionCustomerName}
                      </h3>

                      {activeSessionCustomerPhone && (
                        <div className="flex items-center space-x-1.5 text-xs text-studio-secondary font-mono">
                          <Phone size={12} className="text-amber-400/80 shrink-0" />
                          <span>{activeSessionCustomerPhone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Top: Booking Code (Desktop only) */}
                  <div className="hidden sm:block self-start shrink-0 text-right">
                    <span className="text-xs font-mono text-[#B8B0A3] bg-studio-card/80 px-2.5 py-1 rounded-lg border border-studio-border/60 inline-block">
                      #{activeSessionBooking.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* 3. JOB SUMMARY MINI CARDS */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
                  {/* Card 1: ประเภทงาน */}
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#0E0D0C] border border-studio-border/70 flex items-center space-x-2 sm:space-x-2.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                      <Layers size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-[#B8B0A3] block uppercase tracking-wider font-medium leading-none mb-1">ประเภทงาน</span>
                      <span className="text-xs font-semibold text-[#ECE4D3] leading-tight block break-words">
                        {activeSessionDetails?.isFlash ? 'Flash' : 'Custom'}
                      </span>
                    </div>
                  </div>

                  {/* Card 2: สไตล์ */}
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#0E0D0C] border border-studio-border/70 flex items-center space-x-2 sm:space-x-2.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                      <Palette size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-[#B8B0A3] block uppercase tracking-wider font-medium leading-none mb-1">สไตล์</span>
                      <span className="text-xs font-semibold text-[#ECE4D3] leading-tight block break-words">
                        {activeSessionDetails?.styleName || 'ไม่ระบุ'}
                      </span>
                    </div>
                  </div>

                  {/* Card 3: ตำแหน่ง */}
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#0E0D0C] border border-studio-border/70 flex items-center space-x-2 sm:space-x-2.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                      <MapPin size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-[#B8B0A3] block uppercase tracking-wider font-medium leading-none mb-1">ตำแหน่ง</span>
                      <span className="text-xs font-semibold text-[#ECE4D3] leading-tight block break-words">
                        {activeSessionDetails?.placement || 'ไม่ระบุ'}
                      </span>
                    </div>
                  </div>

                  {/* Card 4: ขนาดงาน */}
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#0E0D0C] border border-studio-border/70 flex items-center space-x-2 sm:space-x-2.5">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
                      <Maximize2 size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] text-[#B8B0A3] block uppercase tracking-wider font-medium leading-none mb-1">
                        ขนาดงาน
                      </span>
                      {activeSessionDetails?.sizeTier || activeSessionDetails?.sizeDimension ? (
                        <div className="space-y-0.5 leading-tight">
                          {activeSessionDetails.sizeTier && (
                            <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono block">
                              {activeSessionDetails.sizeTier}
                            </span>
                          )}
                          {activeSessionDetails.sizeDimension && (
                            <span className="text-[11px] sm:text-xs font-semibold text-[#ECE4D3] font-mono block">
                              {activeSessionDetails.sizeDimension}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-[#B8B0A3] block">
                          ไม่ระบุ
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. REFERENCE IMAGE STRIP */}
                {activeSessionDetails?.referenceImages && activeSessionDetails.referenceImages.length > 0 && (
                  <div className="p-3 sm:p-3.5 rounded-xl bg-[#0E0D0C] border border-studio-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Thumbnails */}
                    <div className="flex items-center space-x-2 overflow-x-auto max-w-full pb-1 sm:pb-0 scrollbar-none shrink-0">
                      {activeSessionDetails.referenceImages.map((imgUrl, idx) => (
                        <div
                          key={`ref-strip-${idx}`}
                          onClick={() => setActiveReferenceImageUrl(imgUrl)}
                          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden border bg-studio-card shrink-0 relative cursor-pointer group transition-all ${
                            idx === 0 ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-studio-border hover:border-amber-500/50'
                          }`}
                        >
                          <CustomerReferenceImage
                            src={imgUrl}
                            alt={`รูปอ้างอิง ${idx + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          {idx === 0 && (
                            <span className="absolute bottom-0 inset-x-0 bg-amber-950/90 text-amber-300 text-[8px] font-semibold text-center py-0.2">
                              หลัก
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Center & Right Text / Badge Area */}
                    <div className="min-w-0 flex-1 sm:px-2">
                      {/* Mobile View Title: ภาพตัวอย่างงาน · 5 ภาพ */}
                      <h4 className="text-xs font-semibold text-[#ECE4D3] sm:hidden">
                        ภาพตัวอย่างงาน <span className="text-studio-muted mx-0.5">·</span> <span className="text-amber-400 font-mono">{activeSessionDetails.referenceImages.length} ภาพ</span>
                      </h4>

                      {/* Desktop View Title */}
                      <h4 className="hidden sm:flex text-xs font-semibold text-[#ECE4D3] items-center gap-1.5">
                        <span>ภาพตัวอย่างงาน</span>
                      </h4>
                      {/* Subtitle (Desktop only) */}
                      <p className="hidden sm:block text-[10px] text-[#B8B0A3] mt-0.5">
                        คลิกเพื่อดูภาพขนาดใหญ่
                      </p>
                    </div>

                    {/* Right Badge (Desktop only) */}
                    <div className="hidden sm:block shrink-0 self-center">
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-800/50 inline-flex items-center gap-1">
                        <ImageIcon size={12} />
                        <span>{activeSessionDetails.referenceImages.length} ภาพ</span>
                      </span>
                    </div>
                  </div>
                )}

              </div>
            ) : (
              /* Clean Empty State */
              <div className="py-10 text-center bg-[#0E0D0C] border border-dashed border-studio-border/80 rounded-xl space-y-3 z-10 my-auto p-6">
                <div className="w-12 h-12 rounded-full bg-studio-card border border-studio-border mx-auto flex items-center justify-center text-studio-muted">
                  <CalendarCheck size={22} className="text-amber-500/70" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#ECE4D3]">วันนี้ไม่มีคิวงาน</h3>
                  <p className="text-xs text-[#B8B0A3] mt-1">เมื่อมีคิวนัดหมายสำหรับวันนี้ ข้อมูลจะแสดงในส่วนนี้</p>
                </div>
                <a
                  href="/artist/queue"
                  className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs text-amber-400 hover:text-amber-300 font-semibold bg-amber-950/30 border border-amber-800/40 rounded-xl transition-colors cursor-pointer"
                >
                  <span>ดูคิวงานทั้งหมด</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            )}

            {/* 5. ACTION BUTTON */}
            {activeTodaySession && (
              <div className="pt-1 z-10">
                <button
                  type="button"
                  onClick={() => handleOpenSessionDetail(activeTodaySession)}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-md shadow-amber-500/10 tracking-wide"
                >
                  <CalendarCheck size={16} />
                  <span>จัดการคิวงาน</span>
                </button>
              </div>
            )}
          </div>

          {/* RIGHT LIST: รายการนัดหมายถัดไป (lg:col-span-5) */}
          <div className="lg:col-span-5 bg-studio-card border border-studio-border p-5 rounded-2xl shadow-lg flex flex-col justify-between space-y-4 font-prompt">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-studio-border/50 pb-2.5">
                <div className="flex items-center space-x-2">
                  <CalendarIcon size={16} className="text-studio-muted" />
                  <h2 className="text-sm sm:text-base font-heading font-semibold text-studio-primary">
                    นัดหมายถัดไป
                  </h2>
                </div>
                <a
                  href="/artist/calendar"
                  className="text-xs text-studio-secondary hover:text-studio-primary flex items-center space-x-1"
                >
                  <span>ปฏิทิน</span>
                  <ChevronRight size={13} />
                </a>
              </div>

              {/* List of Upcoming Sessions */}
              {loading ? (
                <div className="py-8 text-center text-studio-secondary animate-pulse text-xs">
                  กำลังโหลดรายการนัดหมาย...
                </div>
              ) : upcomingSessions.length === 0 ? (
                <div className="py-8 text-center text-studio-muted text-xs">
                  ยังไม่มีรายการนัดหมายเพิ่มเติม
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {upcomingSessions.slice(0, 5).map((sess: any, idx: number) => {
                    const booking = bookingsMap.get(sess.booking_id);
                    if (!booking) return null;
                    const custName = getCleanCustomerName(booking.customer_user_id);
                    const estimate = booking.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                    const flashRes = booking.flash_reservation_id ? flashReservationsMap.get(booking.flash_reservation_id) : null;
                    const flashDesignObj = flashRes?.flash_designs || flashRes?.flash_design;
                    const flashTitle = flashDesignObj?.title || flashRes?.flash_design_title;
                    const isFlash = Boolean(booking.flash_reservation_id || estimate?.request_type === 'FLASH');
                    const artworkTitle = booking.artwork_title || (flashTitle ? `ลาย Flash: ${flashTitle}` : (isFlash ? 'งานสัก Flash' : 'งานสัก Custom'));
                    const isToday = getDateStrBangkok(sess.start_at) === todayStr;

                    return (
                      <div
                        key={`UP-SESS-${sess.id}`}
                        onClick={() => handleOpenSessionDetail(sess)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          idx === 0
                            ? 'bg-amber-950/20 border-amber-800/40 hover:border-amber-500/50'
                            : 'bg-studio-sec/60 border-studio-border hover:border-studio-red/40'
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-studio-primary truncate">
                              {custName}
                            </span>
                            {sess.session_number > 1 && (
                              <span className="text-[9px] font-mono text-studio-muted bg-studio-card px-1 rounded">
                                รอบ {sess.session_number}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-studio-secondary truncate">{artworkTitle}</p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                            isToday ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60' : 'bg-studio-card text-studio-secondary border border-studio-border'
                          }`}>
                            {isToday ? 'วันนี้' : formatDateBangkok(sess.start_at)} • {formatTimeBangkok(sess.start_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <a
              href="/artist/queue"
              className="w-full py-2 bg-studio-sec hover:bg-studio-border text-studio-secondary hover:text-studio-primary text-xs font-semibold rounded-xl border border-studio-border transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <span>ดูคิวงานทั้งหมด ({upcomingSessions.length})</span>
              <ChevronRight size={14} />
            </a>
          </div>
        </div>
      </main>

      <ArtistMobileNav />

      {/* Detail Drawer */}
      <ArtistAppointmentDetailDrawer
        isOpen={isSessionDrawerOpen}
        onClose={() => setIsSessionDrawerOpen(false)}
        session={selectedSessionDetail}
        onRefresh={() => fetchArtistData()}
        isDashboard={true}
      />

      <PaymentSlipLightbox
        isOpen={Boolean(activeLightboxSlipPath)}
        src={activeLightboxSlipPath}
        onClose={() => setActiveLightboxSlipPath(null)}
      />

      <ReferenceImageLightbox
        isOpen={Boolean(activeReferenceImageUrl)}
        src={activeReferenceImageUrl}
        onClose={() => setActiveReferenceImageUrl(null)}
      />
    </div>
  );
}
