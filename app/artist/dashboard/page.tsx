'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '@/components/AppContext';
import { createClient } from '@/lib/supabase/client';
import ArtistHeader from '@/components/artist/ArtistHeader';
import ArtistMobileNav from '@/components/artist/ArtistMobileNav';
import ArtistAppointmentDetailDrawer, { ArtistSessionDetail } from '@/components/artist/ArtistAppointmentDetailDrawer';
import ArtistRequestDetailDrawer, { ArtistPendingEstimateDetail } from '@/components/artist/ArtistRequestDetailDrawer';
import ArtistPaymentReviewDrawer from '@/components/artist/ArtistPaymentReviewDrawer';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import PaymentSlipLightbox from '@/components/common/PaymentSlipLightbox';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
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
  Wallet
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
  const [bookingsMap, setBookingsMap] = useState<Map<string, any>>(new Map());
  const [customersMap, setCustomersMap] = useState<Map<string, any>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());
  const [estimatesMap, setEstimatesMap] = useState<Map<string, any>>(new Map());
  
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
  const [todayArtistRevenueTotal, setTodayArtistRevenueTotal] = useState<number>(0);

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

      // 3. Query linked estimate requests for bookings
      const estimateIds = Array.from(new Set(dbBookings.map((b: any) => b.estimate_request_id).filter(Boolean)));
      let dbEstimates: any[] = [];
      if (estimateIds.length > 0) {
        const { data: estData } = await supabase
          .from('estimate_requests')
          .select('*')
          .in('id', estimateIds);
        dbEstimates = estData || [];
      }
      const estMap = new Map<string, any>();
      dbEstimates.forEach((e: any) => estMap.set(e.id, e));
      setEstimatesMap(estMap);

      // 4. Query PENDING estimate_requests strictly assigned to staffArtistId
      const { data: pEstData, error: pEstErr } = await supabase
        .from('estimate_requests')
        .select('*')
        .eq('artist_id', staffArtistId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (pEstErr) {
        console.error('Error fetching pending estimate requests:', pEstErr);
      }
      const pEstimatesList = pEstData || [];
      setPendingEstimates(pEstimatesList);

      // 4.5 Query pending payment submissions for own bookings
      const dbBookingIds = dbBookings.map((b: any) => b.id);
      let pSubmissions: any[] = [];
      let todayRev = 0;
      const tBangkokStr = getTodayBangkokStr();

      if (dbBookingIds.length > 0) {
        const { data: subData } = await supabase
          .from('booking_payment_submissions')
          .select('*')
          .in('booking_id', dbBookingIds)
          .eq('status', 'PENDING');
        pSubmissions = subData || [];

        // 4.6 Query recorded booking payments for today's revenue metric
        const { data: payData } = await supabase
          .from('booking_payments')
          .select('amount, paid_at, status')
          .in('booking_id', dbBookingIds)
          .eq('status', 'RECORDED');

        if (payData) {
          todayRev = payData
            .filter((p: any) => p.paid_at && getDateStrBangkok(p.paid_at) === tBangkokStr)
            .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
        }
      }
      setPendingSubmissions(pSubmissions);
      setTodayArtistRevenueTotal(todayRev);

      // 5. Collect all customer user IDs (from bookings + pending estimates + pending payment submissions)
      const customerUserIds = Array.from(
        new Set([
          ...dbBookings.map((b: any) => b.customer_user_id),
          ...pEstimatesList.map((e: any) => e.customer_user_id),
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

        setCustomersMap(cMap);
        setProfilesMap(pMap);
      }
    } catch (err) {
      console.error('Exception fetching artist dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, isAuthorized, staffArtistId]);

  const handleApprovePayment = async (subId: string, claimedAmount: number) => {
    try {
      const { data, error } = await supabase.rpc('artist_approve_payment_submission', {
        p_submission_id: subId,
        p_verified_amount: claimedAmount
      });
      if (error) {
        alert(`ไม่สามารถอนุมัติสลิปได้: ${error.message}`);
        return;
      }
      fetchArtistData();
    } catch (err: any) {
      console.error('Error approving payment submission:', err);
    }
  };

  const handleRejectPayment = async (subId: string) => {
    const reason = prompt('กรุณาระบุเหตุผลการปฏิเสธสลิป:');
    if (reason === null) return;
    try {
      const { data, error } = await supabase.rpc('artist_reject_payment_submission', {
        p_submission_id: subId,
        p_rejection_reason: reason.trim() || 'สลิปไม่ถูกต้อง'
      });
      if (error) {
        alert(`ไม่สามารถปฏิเสธสลิปได้: ${error.message}`);
        return;
      }
      fetchArtistData();
    } catch (err: any) {
      console.error('Error rejecting payment submission:', err);
    }
  };

  useEffect(() => {
    if (isAuthorized && staffArtistId) {
      fetchArtistData();
    }
  }, [isAuthorized, staffArtistId, fetchArtistData]);

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

  const getIsAgeConfirmed = (uid?: string | null) => {
    if (!uid) return false;
    const c = customersMap.get(uid);
    return Boolean(c?.eligibility_confirmed_at || c?.profile_completed_at);
  };

  // Today Bangkok Date String
  const todayStr = useMemo(() => getTodayBangkokStr(), []);

  // Today's sessions & upcoming sessions
  const todaySessions = useMemo(() => {
    return sessions.filter((s: any) => getDateStrBangkok(s.start_at) === todayStr);
  }, [sessions, todayStr]);

  const upcomingSessions = useMemo(() => {
    return sessions
      .filter((s: any) => getDateStrBangkok(s.start_at) > todayStr && s.status !== 'CANCELLED')
      .slice(0, 10);
  }, [sessions, todayStr]);

  // KPI Metrics Calculations
  const pendingRequestsCount = pendingEstimates.length;

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

  const nextUpcomingSession = useMemo(() => {
    const nowMs = Date.now();
    return sessions.find((s: any) => {
      if (s.status === 'CANCELLED' || s.status === 'COMPLETED') return false;
      const endMs = new Date(s.end_at).getTime();
      if (endMs <= nowMs) return false;
      const b = bookingsMap.get(s.booking_id);
      if (!b) return false;
      return b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'COMPLETED';
    }) || null;
  }, [sessions, bookingsMap]);

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

    const siblingSessions = sessions
      .filter((s: any) => s.booking_id === sess.booking_id)
      .map((s: any) => ({
        id: s.id,
        session_number: s.session_number,
        start_at: s.start_at,
        end_at: s.end_at,
        status: s.status,
        notes: s.notes,
      }))
      .sort((a, b) => a.session_number - b.session_number);

    const detail: ArtistSessionDetail = {
      session_id: sess.id,
      session_number: sess.session_number || 1,
      session_title: sess.session_title,
      start_at: sess.start_at,
      end_at: sess.end_at,
      session_status: sess.status,
      session_notes: sess.notes,

      booking_id: sess.booking_id,
      booking_status: booking?.status || 'CONFIRMED',
      booking_source: booking?.booking_source,
      artwork_title: booking?.artwork_title,
      artwork_image_url: booking?.artwork_image_url,
      placement: booking?.placement || estimate?.placement,
      width_cm: booking?.width_cm || estimate?.width_cm,
      height_cm: booking?.height_cm || estimate?.height_cm,
      description: booking?.description || estimate?.description,
      customer_note: booking?.customer_note,
      staff_note: booking?.staff_note,

      customer_name: getCleanCustomerName(customerUserId),
      customer_phone: customer?.phone || prof?.phone || null,
      customer_email: prof?.email || customer?.email || null,
      is_age_confirmed: getIsAgeConfirmed(customerUserId),

      estimate_request_id: booking?.estimate_request_id,
      style: estimate?.style || null,
      reference_images: estimate?.reference_images || (booking?.artwork_image_url ? [booking.artwork_image_url] : null),

      all_sessions: siblingSessions.length > 0 ? siblingSessions : undefined,
    };

    setSelectedSessionDetail(detail);
    setIsSessionDrawerOpen(true);
  };

  // Handler to open Pending Estimate Request Detail Drawer (Read-Only)
  const handleOpenRequestDetail = (est: any) => {
    const customer = est.customer_user_id ? customersMap.get(est.customer_user_id) : null;
    const prof = est.customer_user_id ? profilesMap.get(est.customer_user_id) : null;

    const detail: ArtistPendingEstimateDetail = {
      id: est.id,
      customer_user_id: est.customer_user_id,
      customer_name: getCleanCustomerName(est.customer_user_id),
      customer_phone: customer?.phone || prof?.phone || null,
      customer_email: prof?.email || customer?.email || null,
      is_age_confirmed: getIsAgeConfirmed(est.customer_user_id),
      artist_id: est.artist_id,
      placement: est.placement,
      description: est.description,
      width_cm: est.width_cm,
      height_cm: est.height_cm,
      style_preference: est.style || est.style_preference,
      preferred_date: est.preferred_date,
      reference_images: est.reference_images,
      status: est.status,
      created_at: est.created_at,
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: คำขอใหม่ */}
          <div className="bg-studio-card border border-studio-border p-4 sm:p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">คำขอใหม่</span>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-amber-400">
                {pendingRequestsCount} <span className="text-xs font-normal text-studio-muted">รายการ</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-950/30 border border-amber-800/40 flex items-center justify-center text-amber-400">
              <Inbox size={22} />
            </div>
          </div>

          {/* Card 2: คิววันนี้ */}
          <div className="bg-studio-card border border-studio-border p-4 sm:p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">คิววันนี้</span>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-studio-primary">
                {todaySessionCount} <span className="text-xs font-normal text-studio-muted">รอบ</span>
              </div>
              <div className="text-xs text-studio-muted">
                รวม {formattedTodayHours} ชม.
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-studio-sec border border-studio-border flex items-center justify-center text-studio-red">
              <CalendarIcon size={22} />
            </div>
          </div>

          {/* Card 3: คิวถัดไป */}
          <div className="bg-studio-card border border-studio-border p-4 sm:p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1 min-w-0 pr-2">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">คิวถัดไป</span>
              {nextUpcomingSession ? (
                <>
                  <div className="text-base sm:text-lg font-bold text-studio-primary truncate">
                    {nextSessionCustomerName}
                  </div>
                  <div className="text-xs text-studio-muted truncate">
                    {nextSessionDateLabel} • {nextSessionTimeStr}
                  </div>
                  <div className="text-xs text-studio-secondary truncate">
                    {nextSessionPlacement || 'ไม่ระบุตำแหน่ง'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-base sm:text-lg font-medium text-studio-muted">
                    ไม่มีคิวถัดไป
                  </div>
                  <div className="text-xs text-studio-muted">-</div>
                </>
              )}
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-950/20 border border-amber-800/40 flex items-center justify-center text-amber-400 shrink-0">
              <Clock size={22} />
            </div>
          </div>

          {/* Card 4: ยอดค่ามือวันนี้ */}
          <div className="bg-studio-card border border-studio-border p-4 sm:p-5 rounded-xl flex items-center justify-between shadow-lg">
            <div className="space-y-1">
              <span className="text-xs text-studio-secondary uppercase tracking-wider font-medium">ยอดค่ามือวันนี้</span>
              <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">
                ฿{todayArtistRevenueTotal.toLocaleString('th-TH')}
              </div>
              <div className="text-xs text-studio-muted">
                รายได้จากงานสักวันนี้
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-950/20 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
              <Wallet size={22} />
            </div>
          </div>
        </div>

        {/* Section 2: คำขอใหม่ (New Pending Estimate Requests assigned to current Artist) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-studio-border/60 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
                คำขอใหม่ ({pendingEstimates.length})
              </h2>
            </div>
            <span className="text-xs text-studio-muted font-mono">
              ระบุถึง: {artistName}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse">
              กำลังโหลดรายการคำขอใหม่...
            </div>
          ) : pendingEstimates.length === 0 ? (
            <div className="p-6 sm:p-8 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-1.5">
              <div className="w-10 h-10 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
                <Inbox size={18} />
              </div>
              <p className="text-sm font-medium text-studio-primary">ไม่มีคำขอใหม่ในขณะนี้</p>
              <p className="text-xs text-studio-muted">
                คำขอจองคิวใหม่จากลูกค้าที่เลือกคุณจะปรากฏในส่วนนี้เมื่อมีคำขอเข้ามา
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingEstimates.map((item: any) => {
                const customer = item.customer_user_id ? customersMap.get(item.customer_user_id) : null;
                const prof = item.customer_user_id ? profilesMap.get(item.customer_user_id) : null;
                const customerName = prof?.display_name || (customer?.first_name ? `${customer.first_name} ${customer.last_name || ''}`.trim() : null) || prof?.email?.split('@')[0] || 'ลูกค้าประจำ';
                const requestCode = `REQ-${item.id.slice(0, 8).toUpperCase()}`;

                return (
                  <div
                    key={item.id}
                    className="bg-studio-card border border-studio-border hover:border-amber-500/50 p-4 sm:p-5 rounded-xl transition-all duration-200 shadow-md flex flex-col justify-between space-y-4 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2 py-0.5 rounded border border-studio-border">
                            {requestCode}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-950/60 text-amber-400 border-amber-800/60 font-medium">
                            รอพิจารณา
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-studio-primary pt-1 truncate">
                          {item.style_preference || 'งานสัก Custom'}
                        </h3>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[11px] text-studio-muted block">ส่งเมื่อ</span>
                        <span className="text-xs font-mono text-studio-secondary">
                          {formatDateBangkok(item.created_at, true)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-studio-border/60">
                      <div className="flex items-center space-x-1.5 text-studio-secondary truncate">
                        <User size={13} className="text-studio-muted shrink-0" />
                        <span className="truncate">{customerName}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-studio-secondary truncate justify-end">
                        <CalendarIcon size={13} className="text-studio-muted shrink-0" />
                        <span className="truncate">{item.preferred_date ? formatDateBangkok(item.preferred_date) : 'ไม่ระบุวัน'}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-studio-secondary truncate">
                        <Layers size={13} className="text-studio-muted shrink-0" />
                        <span className="truncate">{item.placement || 'ไม่ระบุตำแหน่ง'}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-studio-secondary truncate justify-end">
                        <span className="text-studio-muted font-mono text-[10px]">ขนาด:</span>
                        <span className="font-mono text-studio-primary">
                          {item.width_cm && item.height_cm ? `${item.width_cm}x${item.height_cm} cm` : 'ไม่ระบุ'}
                        </span>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-xs text-studio-secondary bg-studio-sec/50 p-2.5 rounded border border-studio-border/60 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-studio-border/40">
                      <div className="flex items-center space-x-1.5 text-[11px] text-studio-muted">
                        {item.reference_images?.length ? (
                          <span className="flex items-center space-x-1 text-studio-secondary">
                            <ImageIcon size={13} className="text-studio-red" />
                            <span>มีรูปตัวอย่าง ({item.reference_images.length})</span>
                          </span>
                        ) : (
                          <span>ไม่มีรูปตัวอย่าง</span>
                        )}
                      </div>

                      <button
                        onClick={() => handleOpenRequestDetail(item)}
                        className="px-3 py-1.5 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded-lg border border-studio-border transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>ดูรายละเอียด</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2.5: สลิปรอตรวจ (Exact Admin UnifiedActionQueue Payment Item Matching) */}
        {pendingSubmissions.length > 0 && (
          <section className="space-y-4 font-prompt">
            <div className="flex items-center justify-between border-b border-studio-border/60 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
                  สลิปรอตรวจ ({pendingSubmissions.length})
                </h2>
              </div>
              <span className="text-xs text-studio-muted font-mono">
                สลิปชำระมัดจำสำหรับงานของคุณ
              </span>
            </div>

            <div className="space-y-3">
              {pendingSubmissions.map((sub: any) => {
                const booking = bookingsMap.get(sub.booking_id);
                const estimate = booking?.estimate_request_id ? estimatesMap.get(booking.estimate_request_id) : null;
                const customerName = getCleanCustomerName(sub.customer_user_id);
                const customerPhone = getCustomerPhone(sub.customer_user_id);
                const tattooTitle = booking?.artwork_title || estimate?.style || 'งานสัก Custom';
                const depositRequired = Number(booking?.deposit_required ?? estimate?.deposit_required ?? 0);
                const claimedAmount = Number(sub.claimed_amount || 0);

                return (
                  <div
                    key={sub.id}
                    className="bg-studio-main border border-amber-900/40 hover:border-amber-700/60 p-4 rounded-[6px] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                  >
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      {/* Single Slip Thumbnail */}
                      <div className="w-14 h-14 bg-studio-card border border-amber-900/50 rounded overflow-hidden shrink-0">
                        <PaymentSlipImage src={sub.slip_path} className="w-full h-full object-cover" />
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            สลิปรอตรวจ
                          </span>
                          <span className="text-[10px] text-studio-muted font-mono">#{sub.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-studio-secondary font-mono">
                            {formatDateBangkok(sub.submitted_at, true)}
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-studio-primary group-hover:text-amber-400 transition-colors">
                          แจ้งโอน ฿{claimedAmount.toLocaleString('th-TH')} (มัดจำ: ฿{depositRequired.toLocaleString('th-TH')})
                        </h4>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                          <span>ลูกค้า: <strong className="text-studio-primary">{customerName}</strong></span>
                          <span>ช่างสัก: <strong className="text-studio-primary">{artistName}{artistNickname}</strong></span>
                          <span>งาน: {tattooTitle}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentReviewSub({ sub, booking, estimate, customerName, customerPhone, depositRequired })}
                        className="w-full sm:w-auto px-4 py-2 bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-800 text-xs font-semibold rounded transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                      >
                        <ShieldCheck size={14} />
                        <span>ตรวจสลิป</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 3: Today's Appointments */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-studio-border/60 pb-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-studio-red animate-ping" />
              <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
                คิวสักวันนี้ ({todaySessions.length})
              </h2>
            </div>
            <span className="text-xs text-studio-muted font-mono">
              {formatDateBangkok(new Date().toISOString())}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse">
              กำลังโหลดข้อมูลคิวงาน...
            </div>
          ) : todaySessions.length === 0 ? (
            <div className="p-8 sm:p-12 text-center bg-studio-card/60 border border-dashed border-studio-border rounded-xl space-y-2">
              <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
                <Sparkles size={20} />
              </div>
              <p className="text-sm text-studio-primary font-medium">ไม่มีคิวนัดหมายสำหรับวันนี้</p>
              <p className="text-xs text-studio-muted max-w-sm mx-auto">
                ขอให้เป็นวันที่ดี! คุณสามารถตรวจสอบคิวนัดหมายล่วงหน้าหรือดูปฏิทินงานสักได้ที่เมนูปฏิทิน
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {todaySessions.map((sess: any) => {
                const booking = bookingsMap.get(sess.booking_id);
                const customerUserId = booking?.customer_user_id;
                const customer = customerUserId ? customersMap.get(customerUserId) : null;
                const prof = customerUserId ? profilesMap.get(customerUserId) : null;
                const customerName = prof?.display_name || customer?.first_name || 'ลูกค้าประจำ';
                const sConf = getSessionStatusConfig(sess.status as any);

                return (
                  <div
                    key={sess.id}
                    onClick={() => handleOpenSessionDetail(sess)}
                    className="group bg-studio-card border border-studio-border hover:border-studio-red/60 p-4 sm:p-5 rounded-xl transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl relative overflow-hidden flex flex-col justify-between space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono font-bold text-studio-secondary bg-studio-sec px-2 py-0.5 rounded border border-studio-border">
                            รอบที่ {sess.session_number || 1}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sConf.badgeBg} ${sConf.badgeText} ${sConf.border}`}>
                            {sConf.label}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-studio-primary group-hover:text-studio-red transition-colors flex items-center gap-1.5 pt-1">
                          <span>{booking?.artwork_title || 'งานสัก Custom'}</span>
                        </h3>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-semibold text-studio-primary flex items-center justify-end gap-1">
                          <Clock size={12} className="text-studio-muted" />
                          {formatTimeBangkok(sess.start_at)} - {formatTimeBangkok(sess.end_at)}
                        </span>
                        <span className="text-[10px] text-studio-muted block">
                          {calculateDurationText(sess.start_at, sess.end_at)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-studio-border/60">
                      <div className="flex items-center space-x-1.5 text-studio-secondary truncate">
                        <User size={13} className="text-studio-muted shrink-0" />
                        <span className="truncate">{customerName}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-studio-secondary truncate justify-end">
                        <Layers size={13} className="text-studio-muted shrink-0" />
                        <span className="truncate">{booking?.placement || 'ตามที่ระบุ'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-studio-muted pt-1">
                      <span>คลิกเพื่อดูรายละเอียด / รูปภาพ</span>
                      <ChevronRight size={14} className="text-studio-secondary group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 4: Upcoming Appointments */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-studio-border/60 pb-3">
            <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
              คิวนัดหมายที่กำลังจะมาถึง ({upcomingSessions.length})
            </h2>
            <a
              href="/artist/calendar"
              className="text-xs text-studio-secondary hover:text-studio-red transition-colors flex items-center space-x-1"
            >
              <span>เปิดดูปฏิทินเต็ม</span>
              <ChevronRight size={13} />
            </a>
          </div>

          {loading ? (
            <div className="p-8 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse">
              กำลังโหลดข้อมูล...
            </div>
          ) : upcomingSessions.length === 0 ? (
            <div className="p-6 text-center bg-studio-card/40 border border-studio-border rounded-xl text-xs text-studio-muted">
              ไม่มีคิวนัดหมายล่วงหน้าในระบบขณะนี้
            </div>
          ) : (
            <div className="bg-studio-card border border-studio-border rounded-xl overflow-hidden divide-y divide-studio-border/60">
              {upcomingSessions.map((sess: any) => {
                const booking = bookingsMap.get(sess.booking_id);
                const customerUserId = booking?.customer_user_id;
                const customer = customerUserId ? customersMap.get(customerUserId) : null;
                const prof = customerUserId ? profilesMap.get(customerUserId) : null;
                const customerName = prof?.display_name || customer?.first_name || 'ลูกค้าประจำ';
                const sConf = getSessionStatusConfig(sess.status as any);

                return (
                  <div
                    key={sess.id}
                    onClick={() => handleOpenSessionDetail(sess)}
                    className="p-3.5 sm:p-4 hover:bg-studio-sec/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-start sm:items-center space-x-3">
                      <div className="w-10 h-10 rounded-lg bg-studio-sec border border-studio-border flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] text-studio-muted uppercase font-mono">รอบ</span>
                        <span className="text-xs font-bold text-studio-primary font-mono">
                          #{sess.session_number || 1}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-studio-primary group-hover:text-studio-red transition-colors">
                            {booking?.artwork_title || 'งานสัก Custom'}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded border ${sConf.badgeBg} ${sConf.badgeText} ${sConf.border}`}>
                            {sConf.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-studio-secondary flex items-center space-x-2">
                          <span>ลูกค้า: {customerName}</span>
                          <span>•</span>
                          <span>ตำแหน่ง: {booking?.placement || 'ไม่ระบุ'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end space-x-4 shrink-0 text-xs">
                      <div className="text-left sm:text-right">
                        <span className="font-semibold text-studio-primary block">
                          {formatDateBangkok(sess.start_at)}
                        </span>
                        <span className="text-[11px] text-studio-secondary font-mono">
                          {formatTimeBangkok(sess.start_at)} - {formatTimeBangkok(sess.end_at)}
                        </span>
                      </div>
                      <button className="p-1.5 rounded bg-studio-sec border border-studio-border text-studio-secondary group-hover:text-studio-red group-hover:border-studio-red/50 transition-colors">
                        <Eye size={14} />
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
          onApprove={handleApprovePayment}
          onReject={handleRejectPayment}
        />
      )}

      {/* Standalone Payment Slip Lightbox Modal */}
      <PaymentSlipLightbox
        src={activeLightboxSlipPath}
        isOpen={Boolean(activeLightboxSlipPath)}
        onClose={() => setActiveLightboxSlipPath(null)}
      />
    </div>
  );
}
