'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import CustomerBookingCard from '@/components/portal/CustomerBookingCard';
import CustomerBookingDetail from '@/components/portal/CustomerBookingDetail';
import CustomerBookingCreateModal from '@/components/portal/CustomerBookingCreateModal';
import CustomerFlashReservations from '@/components/portal/CustomerFlashReservations';
import { useApp, checkIsCustomerProfileComplete } from '@/components/AppContext';
import {
  CustomerPortalBooking,
  CustomerPortalEstimate,
  CustomerPortalSession,
  CustomerPortalFinancialSummary,
  CustomerPortalArtist,
  NextAppointmentInfo,
} from '@/components/portal/types';
import {
  formatThaiDate,
  formatTimeBangkok,
  calculateDurationHours,
  formatCurrency,
} from '@/components/portal/portalUtils';
import {
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  Compass,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import Link from 'next/link';
import { formatThaiPhoneForDisplay, sanitizeDigitsOnly } from '@/lib/phoneUtils';

function CustomerPortalContent() {
  const {
    supabase,
    user,
    customerPhone,
    customerEmail,
    customerName,
    isCustomerProfileComplete,
    isLoggedIn,
    authLoading,
    logoutCustomer,
    updateCustomerPhone,
  } = useApp();

  const router = useRouter();

  // Guard: Verify profile completion before redirecting to /complete-profile
  useEffect(() => {
    let isCancelled = false;

    async function verifyAndGuard() {
      if (!isLoggedIn || !user) {
        router.replace('/login');
        return;
      }

      if (isCustomerProfileComplete) {
        return;
      }

      // Query live customer master before deciding to redirect
      try {
        const { data: cData } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        const { data: pData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (isCancelled) return;

        const effectivePhone = pData?.phone || cData?.phone || '';
        const isComplete = checkIsCustomerProfileComplete(
          pData?.role,
          pData?.is_active,
          effectivePhone,
          cData?.profile_completed_at,
          cData?.eligibility_confirmed_at
        );

        if (!isComplete) {
          router.replace('/complete-profile');
        }
      } catch (_) {
        if (!isCustomerProfileComplete) {
          router.replace('/complete-profile');
        }
      }
    }

    if (!authLoading) {
      verifyAndGuard();
    }

    return () => {
      isCancelled = true;
    };
  }, [authLoading, isLoggedIn, isCustomerProfileComplete, router, user, supabase]);

  // Live Data States
  const [liveBookings, setLiveBookings] = useState<CustomerPortalBooking[]>([]);
  const [liveEstimates, setLiveEstimates] = useState<CustomerPortalEstimate[]>([]);
  const [nextAppointment, setNextAppointment] = useState<NextAppointmentInfo | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const searchParams = useSearchParams();

  // Active Tab & Selection States
  const [activeTab, setActiveTab] = useState<'all' | 'bookings' | 'estimates' | 'flash' | 'profile'>('all');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['all', 'bookings', 'estimates', 'flash', 'profile'].includes(tabParam)) {
      setActiveTab(tabParam as any);
    }
  }, [searchParams]);
  const [selectedItem, setSelectedItem] = useState<CustomerPortalBooking | CustomerPortalEstimate | null>(null);
  const [selectedType, setSelectedType] = useState<'booking' | 'estimate' | null>(null);

  // Phone Edit States
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);

  // Transition Modal State: Quoted Estimate to Booking
  const [transitionalEstimate, setTransitionalEstimate] = useState<CustomerPortalEstimate | null>(null);

  // Core Live Data Fetcher Scoped to Customer Auth UUID
  const fetchPortalData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);

    try {
      // 1. Fetch own estimate_requests
      const { data: estData } = await supabase
        .from('estimate_requests')
        .select('*')
        .eq('customer_user_id', user.id)
        .order('created_at', { ascending: false });

      // 2. Fetch own bookings
      const { data: bookData } = await supabase
        .from('bookings')
        .select('*')
        .eq('customer_user_id', user.id)
        .order('created_at', { ascending: false });

      const rawBookings = bookData || [];
      const rawEstimates = estData || [];
      const ownBookingIds = rawBookings.map((b: any) => b.id);

      // 3. Batch fetch booking_sessions for own bookings
      let rawSessions: any[] = [];
      if (ownBookingIds.length > 0) {
        const { data: sessData } = await supabase
          .from('booking_sessions')
          .select('*')
          .in('booking_id', ownBookingIds)
          .order('start_at', { ascending: true });
        rawSessions = sessData || [];
      }

      // 4. Batch fetch booking_payment_summary for own bookings
      let rawFinancials: CustomerPortalFinancialSummary[] = [];
      if (user.id) {
        const { data: finData } = await supabase
          .from('booking_payment_summary')
          .select('*')
          .eq('customer_user_id', user.id);
        rawFinancials = (finData || []).map((f: any) => ({
          booking_id: f.booking_id,
          estimate_request_id: f.estimate_request_id,
          customer_user_id: f.customer_user_id,
          artist_id: f.artist_id,
          quoted_price: f.quoted_price ? Number(f.quoted_price) : null,
          deposit_required: f.deposit_required ? Number(f.deposit_required) : null,
          paid_total: Number(f.paid_total) || 0,
          remaining_balance: f.remaining_balance ? Number(f.remaining_balance) : null,
          deposit_paid: Boolean(f.deposit_paid),
          is_fully_paid: Boolean(f.is_fully_paid),
        }));
      }

      // 5. Batch fetch artists
      const allArtistIds = Array.from(
        new Set([
          ...rawBookings.map((b: any) => b.artist_id).filter(Boolean),
          ...rawEstimates.map((e: any) => e.artist_id).filter(Boolean),
          ...rawSessions.map((s: any) => s.artist_id).filter(Boolean),
        ])
      );

      let artistsList: CustomerPortalArtist[] = [];
      if (allArtistIds.length > 0) {
        const { data: artData } = await supabase
          .from('artists')
          .select('id, name, nickname, avatar_url, specialties')
          .in('id', allArtistIds);
        artistsList = artData || [];
      } else {
        const { data: activeArts } = await supabase
          .from('artists')
          .select('id, name, nickname, avatar_url, specialties')
          .eq('is_active', true);
        artistsList = activeArts || [];
      }

      // 6. Map and Hydrate Bookings
      const hydratedBookings: CustomerPortalBooking[] = rawBookings.map((b: any) => {
        const bSessions: CustomerPortalSession[] = rawSessions
          .filter((s: any) => s.booking_id === b.id)
          .map((s: any) => ({
            id: s.id,
            booking_id: s.booking_id,
            artist_id: s.artist_id,
            session_number: s.session_number,
            start_at: s.start_at,
            end_at: s.end_at,
            status: s.status,
            note: s.note,
            created_at: s.created_at,
            artist: artistsList.find((a) => a.id === s.artist_id) || null,
          }));

        const bFinancial = rawFinancials.find((f) => f.booking_id === b.id) || null;
        const bArtist = artistsList.find((a) => a.id === b.artist_id) || null;

        return {
          id: b.id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          estimate_request_id: b.estimate_request_id,
          booking_source: b.booking_source,
          source_ref: b.source_ref,
          artwork_title: b.artwork_title,
          artwork_image_url: b.artwork_image_url,
          placement: b.placement,
          width_cm: b.width_cm ? Number(b.width_cm) : null,
          height_cm: b.height_cm ? Number(b.height_cm) : null,
          description: b.description,
          requested_date: b.requested_date,
          requested_start_time: b.requested_start_time,
          customer_note: b.customer_note,
          admin_note: b.admin_note,
          rejection_reason: b.rejection_reason,
          status: b.status,
          started_at: b.started_at,
          completed_at: b.completed_at,
          created_at: b.created_at,
          artist: bArtist,
          sessions: bSessions,
          financial: bFinancial,
        };
      });

      // 7. Map and Hydrate Estimates
      const hydratedEstimates: CustomerPortalEstimate[] = rawEstimates.map((e: any) => {
        const eArtist = artistsList.find((a) => a.id === e.artist_id) || null;
        const linkedBooking = hydratedBookings.find((b) => b.estimate_request_id === e.id);

        return {
          id: e.id,
          customer_user_id: e.customer_user_id,
          artist_id: e.artist_id,
          reference_images: e.reference_images || [],
          width_cm: Number(e.width_cm) || 10,
          height_cm: Number(e.height_cm) || 10,
          placement: e.placement || 'ไม่ระบุ',
          style: e.style || 'Fine Line',
          description: e.description || '',
          preferred_date: e.preferred_date || null,
          status: e.status,
          quoted_price: e.quoted_price ? Number(e.quoted_price) : null,
          estimated_duration_minutes: e.estimated_duration_minutes
            ? Number(e.estimated_duration_minutes)
            : null,
          deposit_required: e.deposit_required ? Number(e.deposit_required) : null,
          quote_note: e.quote_note || null,
          quoted_at: e.quoted_at || null,
          accepted_at: e.accepted_at || null,
          rejected_at: e.rejected_at || null,
          created_at: e.created_at,
          artist: eArtist,
          booking_id: linkedBooking?.id || null,
        };
      });

      setLiveBookings(hydratedBookings);
      setLiveEstimates(hydratedEstimates);

      // 8. Next Appointment Authority: Strictly from public.booking_sessions
      // Priority 1: An IN_PROGRESS session
      // Priority 2: Earliest upcoming SCHEDULED session where end_at is in future
      const allActiveSessions: { session: CustomerPortalSession; booking: CustomerPortalBooking }[] = [];
      hydratedBookings.forEach((b) => {
        b.sessions.forEach((s) => {
          if (s.status === 'IN_PROGRESS' || s.status === 'SCHEDULED') {
            allActiveSessions.push({ session: s, booking: b });
          }
        });
      });

      const inProgressSession = allActiveSessions.find((item) => item.session.status === 'IN_PROGRESS');
      if (inProgressSession) {
        setNextAppointment({
          session: inProgressSession.session,
          booking: inProgressSession.booking,
          artist: inProgressSession.session.artist || inProgressSession.booking.artist || null,
        });
      } else {
        // Sort by start_at ASC
        allActiveSessions.sort(
          (a, b) => new Date(a.session.start_at).getTime() - new Date(b.session.start_at).getTime()
        );
        const upcoming = allActiveSessions[0];
        if (upcoming) {
          setNextAppointment({
            session: upcoming.session,
            booking: upcoming.booking,
            artist: upcoming.session.artist || upcoming.booking.artist || null,
          });
        } else {
          setNextAppointment(null);
        }
      }
    } catch (err) {
      console.error('Error loading portal live data:', err);
    } finally {
      setDataLoading(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    if (user && !authLoading) {
      fetchPortalData();
    }
  }, [user, authLoading, fetchPortalData]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-studio-main flex flex-col justify-center items-center font-prompt">
        <span className="text-sm text-studio-secondary animate-pulse">กำลังตรวจสอบสิทธิ์...</span>
      </div>
    );
  }

  // Financial Status Aggregations directly from live booking_payment_summary
  const verifiedDepositsTotal = liveBookings.reduce((sum, b) => {
    if (!b.financial) return sum;
    // Semantics: confirmedDepositAmount = min(max(paid_total, 0), max(deposit_required, 0))
    const paidTotal = Math.max(Number(b.financial.paid_total || 0), 0);
    const depositReq = Math.max(Number(b.financial.deposit_required || 0), 0);
    const confirmedDepositAmount = Math.min(paidTotal, depositReq);
    return sum + confirmedDepositAmount;
  }, 0);

  const remainingBalanceTotal = liveBookings.reduce((sum, b) => {
    if (!b.financial) return sum;
    // Include all non-cancelled/non-rejected bookings with outstanding balance (including COMPLETED)
    if (!['CANCELLED', 'REJECTED'].includes(b.status) && Number(b.financial.remaining_balance ?? 0) > 0) {
      return sum + Number(b.financial.remaining_balance);
    }
    return sum;
  }, 0);

  const handleCardClick = (
    item: CustomerPortalBooking | CustomerPortalEstimate,
    type: 'estimate' | 'booking'
  ) => {
    setSelectedItem(item);
    setSelectedType(type);
  };

  const handleTransitionToBooking = (estimate: CustomerPortalEstimate) => {
    setTransitionalEstimate(estimate);
    setSelectedItem(null);
  };

  return (
    <div className="min-h-screen bg-studio-main pb-28 md:pb-16 text-studio-primary font-prompt">
      {/* Top Header Navigation */}
      <CustomerHeader />

      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 md:px-12 xl:px-16 py-6 md:py-12">
        {/* DESKTOP SPLIT CONTAINER: LEFT 65% / RIGHT 35% */}
        <div className="flex flex-col lg:flex-row gap-8 xl:gap-12 items-start">
          {/* LEFT SIDE: 65% Next Appointment & Activities */}
          <div className="w-full lg:w-[65%] space-y-8">
            {/* Top Greeting */}
            <div>
              <span className="text-xs uppercase tracking-widest text-studio-secondary font-heading block">
                Customer Portal
              </span>
              <h1 className="text-3xl md:text-5xl font-heading font-normal tracking-wide text-studio-primary mt-0.5">
                ยินดีต้อนรับ, {customerName}
              </h1>
              <p className="text-xs text-studio-secondary mt-1 font-light">
                ศูนย์รวมรายการนัดหมาย คิวสัก และติดตามสถานะการประเมินราคาของคุณ
              </p>
            </div>

            {/* 1. HERO CARD: NEXT APPOINTMENT (Aged Flash Paper Panel) */}
            {nextAppointment ? (
              <div
                onClick={() => handleCardClick(nextAppointment.booking, 'booking')}
                className="bg-paper text-studio-sec border border-studio-border hover:border-studio-red p-6 md:p-7 rounded-[8px] transition-all cursor-pointer space-y-5 shadow-lg group relative overflow-hidden"
              >
                <div className="flex justify-between items-center border-b border-studio-border/50 pb-3">
                  <div className="flex items-center space-x-2">
                    <Sparkles size={16} className="text-studio-red" />
                    <span className="text-xs uppercase font-heading font-normal text-studio-sec tracking-wider">
                      NEXT APPOINTMENT • คิวนัดหมายถัดไปของคุณ
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded border ${
                      nextAppointment.session.status === 'IN_PROGRESS'
                        ? 'bg-studio-red/20 border-studio-red/50 text-studio-red animate-pulse'
                        : nextAppointment.booking.status === 'CONFIRMED'
                        ? 'bg-green-900/10 border-green-800/40 text-green-800'
                        : 'bg-studio-red/10 border-studio-red/30 text-studio-red'
                    }`}
                  >
                    {nextAppointment.session.status === 'IN_PROGRESS'
                      ? '● กำลังสักรอบ #' + nextAppointment.session.session_number
                      : nextAppointment.booking.status === 'CONFIRMED'
                      ? '✓ ยืนยันคิวแล้ว'
                      : 'รอมัดจำ'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <img
                      src={
                        nextAppointment.booking.artwork_image_url ||
                        'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=200'
                      }
                      alt=""
                      className="w-20 h-20 object-cover rounded-[4px] border border-studio-border/60 bg-studio-main shrink-0"
                    />
                    <div className="space-y-1">
                      <h3 className="text-lg font-heading font-normal text-studio-sec tracking-wide">
                        {nextAppointment.booking.artwork_title || 'งานสัก Custom'}
                        {nextAppointment.booking.sessions.length > 1 && (
                          <span className="text-xs font-sans text-studio-muted ml-2 font-normal">
                            (รอบ #{nextAppointment.session.session_number} จาก {nextAppointment.booking.sessions.length} รอบ)
                          </span>
                        )}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-muted">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-studio-red" />{' '}
                          {formatThaiDate(nextAppointment.session.start_at, true)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock size={13} className="text-studio-red" />{' '}
                          {formatTimeBangkok(nextAppointment.session.start_at)} -{' '}
                          {formatTimeBangkok(nextAppointment.session.end_at)} (
                          {calculateDurationHours(
                            nextAppointment.session.start_at,
                            nextAppointment.session.end_at
                          )}{' '}
                          ชม.)
                        </span>
                      </div>
                      <div className="text-xs text-studio-sec">
                        ช่างสักผู้รับผิดชอบ:{' '}
                        <strong className="text-studio-sec">
                          {nextAppointment.artist?.name || 'ช่างสักประจำร้าน'}
                          {nextAppointment.artist?.nickname
                            ? ` (${nextAppointment.artist.nickname})`
                            : ''}
                        </strong>
                      </div>
                      <p className="font-caveat text-sm text-studio-muted">
                        &ldquo;Your session is prepared with sterile craft & precision&rdquo;
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-none border-studio-border/30 flex sm:flex-col justify-between items-center sm:items-end">
                    <span className="text-xs text-studio-muted">
                      ราคาค่าสัก ฿{formatCurrency(nextAppointment.booking.financial?.quoted_price)}
                    </span>
                    <span className="text-base font-bold text-studio-red">
                      {nextAppointment.booking.status === 'CONFIRMED'
                        ? `คงเหลือชำระหน้าร้าน ฿${formatCurrency(
                            nextAppointment.booking.financial?.remaining_balance
                          )}`
                        : `มัดจำที่ต้องชำระ ฿${formatCurrency(
                            nextAppointment.booking.financial?.deposit_required
                          )}`}
                    </span>
                    <span className="text-xs text-studio-red group-hover:underline flex items-center gap-1 mt-1 font-semibold">
                      ดูรายละเอียด <ArrowRight size={12} />
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-studio-card border border-studio-border p-8 rounded-[8px] text-center space-y-3">
                <Calendar size={32} className="text-studio-muted mx-auto" />
                <h4 className="text-sm font-semibold text-studio-primary">
                  ยังไม่มีนัดหมายที่กำลังจะมาถึง
                </h4>
                <p className="text-xs text-studio-secondary max-w-sm mx-auto">
                  คุณสามารถเลือกชมแบบลายสักว่างในแกลเลอรี หรือส่งคำขอประเมินราคาเพื่อเริ่มจองคิวใหม่
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <Link
                    href="/flash"
                    className="min-h-[44px] bg-studio-red text-studio-paper px-4 py-2.5 rounded-[4px] text-xs font-semibold uppercase tracking-wider hover:bg-tattoo-red-dark transition-all border border-studio-red flex items-center"
                  >
                    ดูลาย Flash ว่าง
                  </Link>
                  <Link
                    href="/portfolio"
                    className="min-h-[44px] bg-transparent border border-studio-border text-studio-primary px-4 py-2.5 rounded-[4px] text-xs font-medium uppercase tracking-wider hover:bg-studio-sec transition-all flex items-center"
                  >
                    ขอประเมินราคา
                  </Link>
                </div>
              </div>
            )}

            {/* Tab Navigation Filter */}
            <div className="flex border-b border-studio-border space-x-6 text-xs uppercase tracking-wider font-semibold">
              {[
                {
                  key: 'all',
                  label: `ทั้งหมด (${liveBookings.length + liveEstimates.length})`,
                },
                { key: 'bookings', label: `คิวจองสัก (${liveBookings.length})` },
                { key: 'estimates', label: `คำขอประเมินราคา (${liveEstimates.length})` },
                { key: 'flash', label: 'Flash ของฉัน' },
                { key: 'profile', label: 'โปรไฟล์' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key as any)}
                  className={`pb-3 relative transition-colors ${
                    activeTab === t.key
                      ? 'text-studio-primary font-bold'
                      : 'text-studio-secondary hover:text-studio-primary'
                  }`}
                >
                  <span>{t.label}</span>
                  {activeTab === t.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-studio-red animate-fadeIn" />
                  )}
                </button>
              ))}
            </div>

            {/* TAB CONTENTS */}
            {activeTab === 'all' && (
              <div className="space-y-6">
                {/* Bookings block */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-heading tracking-wider text-studio-secondary">
                      รายการจองคิวสักล่าสุด
                    </span>
                    <Link
                      href="/flash"
                      className="text-xs text-studio-primary hover:text-studio-red hover:underline"
                    >
                      + จองลายเพิ่ม
                    </Link>
                  </div>
                  {liveBookings.length === 0 ? (
                    <p className="text-xs text-studio-muted py-6 bg-studio-card border border-studio-border rounded-[6px] text-center">
                      ไม่มีประวัติการจองคิวสัก
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {liveBookings.map((b) => (
                        <CustomerBookingCard
                          key={b.id}
                          item={b}
                          type="booking"
                          onClick={() => handleCardClick(b, 'booking')}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Estimates block */}
                <div className="space-y-3 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-heading tracking-wider text-studio-secondary">
                      คำขอประเมินราคาล่าสุด
                    </span>
                    <Link
                      href="/portfolio"
                      className="text-xs text-studio-primary hover:text-studio-red hover:underline"
                    >
                      + ส่งคำขอใหม่
                    </Link>
                  </div>
                  {liveEstimates.length === 0 ? (
                    <p className="text-xs text-studio-muted py-6 bg-studio-card border border-studio-border rounded-[6px] text-center">
                      ไม่มีประวัติการขอประเมินราคา
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {liveEstimates.map((e) => (
                        <CustomerBookingCard
                          key={e.id}
                          item={e}
                          type="estimate"
                          onClick={() => handleCardClick(e, 'estimate')}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'bookings' && (
              <div className="space-y-3">
                {liveBookings.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการจองคิวสักในระบบ
                  </p>
                ) : (
                  liveBookings.map((b) => (
                    <CustomerBookingCard
                      key={b.id}
                      item={b}
                      type="booking"
                      onClick={() => handleCardClick(b, 'booking')}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'estimates' && (
              <div className="space-y-3">
                {liveEstimates.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการคำขอประเมินราคาในระบบ
                  </p>
                ) : (
                  liveEstimates.map((e) => (
                    <CustomerBookingCard
                      key={e.id}
                      item={e}
                      type="estimate"
                      onClick={() => handleCardClick(e, 'estimate')}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'flash' && (
              <CustomerFlashReservations />
            )}

            {activeTab === 'profile' && (
              <div className="bg-studio-card border border-studio-border p-6 rounded-[8px] space-y-6 shadow-md">
                <div className="flex items-center space-x-4 border-b border-studio-border/60 pb-6">
                  <div className="w-16 h-16 rounded-full bg-studio-sec border border-studio-border flex items-center justify-center text-studio-red text-2xl font-bold">
                    {customerName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-heading text-studio-primary">{customerName}</h3>
                    <p className="text-xs text-studio-secondary">
                      {formatThaiPhoneForDisplay(customerPhone) || customerEmail || 'บัญชีลูกค้า'}
                    </p>
                    <span className="text-[10px] bg-studio-sec text-studio-paper px-2 py-0.5 rounded border border-studio-border inline-block mt-1 font-medium">
                      Member Account
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-studio-secondary">
                  <div className="flex justify-between py-2 border-b border-studio-border/30">
                    <span>ชื่อผู้ใช้งาน:</span>
                    <strong className="text-studio-primary">{customerName}</strong>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-studio-border/30">
                    <span>เบอร์โทรศัพท์ (ติดต่อ):</span>
                    <div className="flex items-center gap-2">
                      <strong className="text-studio-primary">
                        {formatThaiPhoneForDisplay(customerPhone) || 'ยังไม่ได้ระบุ'}
                      </strong>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPhone(!editingPhone);
                          setPhoneInput(customerPhone || '');
                          setPhoneError('');
                          setPhoneSuccess('');
                        }}
                        className="text-xs text-studio-red hover:underline font-semibold ml-2"
                      >
                        {editingPhone ? 'ยกเลิก' : customerPhone ? 'แก้ไข' : '+ เพิ่มเบอร์โทร'}
                      </button>
                    </div>
                  </div>

                  {editingPhone && (
                    <div className="bg-studio-main/60 border border-studio-border p-4 rounded-[6px] space-y-3 animate-fadeIn">
                      <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-medium">
                        กรอกเบอร์โทรศัพท์มือถือ 10 หลัก (สำหรับติดต่อเรื่องคิวงาน)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={10}
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(sanitizeDigitsOnly(e.target.value))}
                          placeholder="0812345678"
                          className="flex-1 bg-studio-sec border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3 py-2.5 outline-none rounded-[4px]"
                        />
                        <button
                          type="button"
                          disabled={phoneLoading}
                          onClick={async () => {
                            setPhoneError('');
                            setPhoneSuccess('');
                            setPhoneLoading(true);
                            const res = await updateCustomerPhone(phoneInput);
                            setPhoneLoading(false);
                            if (res.success) {
                              setPhoneSuccess('บันทึกเบอร์โทรศัพท์สำเร็จ');
                              setEditingPhone(false);
                            } else {
                              setPhoneError(res.error || 'เกิดข้อผิดพลาด');
                            }
                          }}
                          className="bg-studio-red text-studio-paper px-4 py-2 text-xs font-semibold rounded-[4px] hover:bg-tattoo-red-dark transition-all disabled:opacity-50"
                        >
                          {phoneLoading ? 'บันทึก...' : 'บันทึก'}
                        </button>
                      </div>
                      {phoneError && <p className="text-xs text-red-400">{phoneError}</p>}
                      {phoneSuccess && <p className="text-xs text-green-400">{phoneSuccess}</p>}
                    </div>
                  )}

                  <div className="flex justify-between py-2 border-b border-studio-border/30">
                    <span>สถานะความปลอดภัย:</span>
                    <strong className="text-green-400">Supabase Auth Verified</strong>
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-center border-t border-studio-border/60">
                  <button
                    type="button"
                    onClick={logoutCustomer}
                    className="min-h-[44px] bg-transparent border border-studio-border hover:bg-studio-main text-studio-secondary hover:text-studio-primary px-5 py-2.5 rounded-[4px] text-xs font-semibold transition-all"
                  >
                    ออกจากระบบ
                  </button>
                  <span className="text-[10px] text-studio-muted">
                    157 TATTOO Studio Customer Session
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: 35% Customer Balance & Actions Panel */}
          <div className="w-full lg:w-[35%] space-y-6 sticky top-[88px]">
            {/* Quick Actions Card */}
            <div className="bg-studio-card border border-studio-border p-6 rounded-[8px] space-y-4 shadow-md">
              <span className="text-xs uppercase tracking-wider font-heading text-studio-secondary block">
                Quick Actions • ดำเนินการด่วน
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                <Link
                  href="/flash"
                  className="min-h-[46px] w-full bg-studio-sec hover:bg-studio-main border border-studio-border hover:border-studio-red/60 text-studio-primary p-3 rounded-[4px] text-xs font-semibold flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles size={14} className="text-studio-red" />
                    <span>เลือกลายสักพร้อมจอง (Flash)</span>
                  </span>
                  <ArrowUpRight size={14} className="text-studio-muted" />
                </Link>

                <Link
                  href="/portfolio"
                  className="min-h-[46px] w-full bg-studio-sec hover:bg-studio-main border border-studio-border hover:border-studio-red/60 text-studio-primary p-3 rounded-[4px] text-xs font-semibold flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Compass size={14} className="text-studio-red" />
                    <span>ส่งขอประเมินราคาใหม่ (Custom)</span>
                  </span>
                  <ArrowUpRight size={14} className="text-studio-muted" />
                </Link>
              </div>
            </div>

            {/* Financial Summary Card */}
            <div className="bg-studio-card border border-studio-border p-6 rounded-[8px] space-y-4 shadow-md">
              <span className="text-xs uppercase tracking-wider font-heading text-studio-secondary block">
                Financial Status • สถานะการเงิน
              </span>

              <div className="space-y-3 text-xs">
                <div className="bg-studio-main p-3.5 rounded-[4px] border border-studio-border space-y-1">
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block">
                    ยอดมัดจำที่ยืนยันแล้ว
                  </span>
                  <span className="text-xl font-bold text-studio-primary">
                    ฿{formatCurrency(verifiedDepositsTotal)}
                  </span>
                </div>

                <div className="bg-studio-main p-3.5 rounded-[4px] border border-studio-border space-y-1">
                  <span className="text-[10px] text-studio-muted uppercase tracking-wider block">
                    ยอดคงเหลือชำระหน้าร้าน
                  </span>
                  <span className="text-xl font-bold text-studio-red">
                    ฿{formatCurrency(remainingBalanceTotal)}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-studio-muted pt-2 border-t border-studio-border/40 space-y-1 leading-relaxed font-light">
                <p>• การชำระมัดจำทุกยอดจะต้องผ่านการตรวจสอบหลักฐานสลิปโดยผู้จัดการร้าน</p>
                <p>• ยอดคงเหลือชำระในวันเข้ารับบริการจริงที่สตูดิโอ (เงินสด/โอนเงิน)</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Item Detail Modal (Booking or Estimate) */}
      {selectedItem && (
        <CustomerBookingDetail
          item={selectedItem}
          type={selectedType || 'booking'}
          onClose={() => setSelectedItem(null)}
          onRefresh={fetchPortalData}
          onTransitionToBooking={handleTransitionToBooking}
        />
      )}

      {/* Transition Modal: Quoted Estimate to Booking */}
      {transitionalEstimate && (
        <CustomerBookingCreateModal
          estimate={transitionalEstimate}
          onClose={() => setTransitionalEstimate(null)}
          onSuccess={() => {
            setTransitionalEstimate(null);
            fetchPortalData();
          }}
        />
      )}

      <MobileBottomNav />
    </div>
  );
}

export default function CustomerPortalPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt text-xs text-studio-secondary">
          กำลังโหลดศูนย์รวมข้อมูลลูกค้า...
        </div>
      }
    >
      <CustomerPortalContent />
    </React.Suspense>
  );
}
