'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import CustomerBookingCard from '@/components/portal/CustomerBookingCard';
import CustomerBookingDetail from '@/components/portal/CustomerBookingDetail';
import CustomerFlashReservations from '@/components/portal/CustomerFlashReservations';
import CustomerPostConfirmationGuide from '@/components/portal/CustomerPostConfirmationGuide';
import { useApp, checkIsCustomerProfileComplete } from '@/components/AppContext';
import {
  CustomerPortalBooking,
  CustomerPortalEstimate,
  CustomerPortalSession,
  CustomerPortalFinancialSummary,
  CustomerPortalArtist,
  CustomerFlashReservationRecord,
  NextAppointmentInfo,
} from '@/components/portal/types';
import {
  formatThaiDate,
  formatTimeBangkok,
  calculateDurationHours,
  formatCurrency,
  getDepositDeadlineInfo,
  formatCustomerDateOfBirthAndAge,
  resolveCustomerDisplayStatus,
  getEstimatedTattooDuration,
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
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

function CustomerPortalContent() {
  const {
    supabase,
    user,
    customerPhone,
    customerDateOfBirth,
    customerEmail,
    customerName,
    isCustomerProfileComplete,
    isLoggedIn,
    authLoading,
    logoutCustomer,
    updateCustomerName,
    updateCustomerPhone,
    updateCustomerDateOfBirth,
  } = useApp();

  const router = useRouter();

  // Guard: Verify profile completion before redirecting to /complete-profile
  const { profile } = useApp();

  useEffect(() => {
    let isCancelled = false;

    async function verifyAndGuard() {
      if (!isLoggedIn || !user) {
        router.replace('/login');
        return;
      }

      const role = profile?.role || 'customer';
      if (['admin', 'owner', 'manager'].includes(role)) {
        router.replace('/admin/dashboard');
        return;
      }

      if (role === 'artist') {
        router.replace('/artist/dashboard');
        return;
      }

      if (profile && profile.role !== 'customer') {
        router.replace('/admin/dashboard');
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

        const liveRole = pData?.role || role;
        if (['admin', 'owner', 'manager'].includes(liveRole)) {
          router.replace('/admin/dashboard');
          return;
        }
        if (liveRole === 'artist') {
          router.replace('/artist/dashboard');
          return;
        }

        const effectivePhone = pData?.phone || cData?.phone || '';
        const isComplete = checkIsCustomerProfileComplete(
          liveRole,
          pData?.is_active !== false,
          effectivePhone,
          cData?.profile_completed_at,
          cData?.eligibility_confirmed_at,
          cData?.date_of_birth
        );

        if (!isComplete) {
          router.replace('/complete-profile');
        }
      } catch (err) {
        console.error('[portal-guard] error:', err);
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
  }, [authLoading, isLoggedIn, isCustomerProfileComplete, router, user, supabase, profile]);

  // Live Data States
  const [liveBookings, setLiveBookings] = useState<CustomerPortalBooking[]>([]);
  const [liveEstimates, setLiveEstimates] = useState<CustomerPortalEstimate[]>([]);
  const [liveFlashReservations, setLiveFlashReservations] = useState<CustomerFlashReservationRecord[]>([]);
  const [nextAppointment, setNextAppointment] = useState<NextAppointmentInfo | null>(null);
  const [hasApprovedDeposit, setHasApprovedDeposit] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const searchParams = useSearchParams();

  // Active Tab & Selection States
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'waiting_deposit' | 'slip_review' | 'confirmed' | 'completed' | 'cancelled' | 'profile'>('all');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      if (['all', 'pending', 'waiting_deposit', 'slip_review', 'confirmed', 'completed', 'cancelled', 'profile'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      } else if (tabParam === 'bookings' || tabParam === 'flash') {
        setActiveTab('waiting_deposit');
      } else if (tabParam === 'estimates') {
        setActiveTab('confirmed');
      }
    }
  }, [searchParams]);

  const [selectedItem, setSelectedItem] = useState<CustomerPortalBooking | CustomerPortalEstimate | CustomerFlashReservationRecord | null>(null);
  const [selectedType, setSelectedType] = useState<'booking' | 'estimate' | 'flash' | null>(null);

  // Auto-select booking modal if booking_id parameter is present in URL
  useEffect(() => {
    const bookingIdParam = searchParams.get('booking_id');
    if (bookingIdParam && liveBookings.length > 0) {
      const foundBooking = liveBookings.find((b) => b.id === bookingIdParam);
      if (foundBooking) {
        setSelectedItem(foundBooking);
        setSelectedType('booking');
      }
    }
  }, [searchParams, liveBookings]);

  // Name Edit States
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [nameLoading, setNameLoading] = useState(false);

  // Phone Edit States
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);

  // DOB Edit States
  const [editingDob, setEditingDob] = useState(false);
  const [dobInput, setDobInput] = useState('');
  const [dobError, setDobError] = useState('');
  const [dobSuccess, setDobSuccess] = useState('');
  const [dobLoading, setDobLoading] = useState(false);

  // Core Live Data Fetcher Scoped to Customer Auth UUID
  const fetchPortalData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);

    try {
      // 1. Fetch own estimate_requests
      let estData: any[] = [];
      const { data: estDataPrimary, error: estErr } = await supabase
        .from('estimate_requests')
        .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, request_type, service_type, work_type, estimated_min_price, estimated_max_price, price_estimated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note, customer_hidden_at')
        .eq('customer_user_id', user.id)
        .is('customer_hidden_at', null)
        .order('created_at', { ascending: false });

      if (estErr && estErr.code === '42703') {
        const { data: estFallback } = await supabase
          .from('estimate_requests')
          .select('id, customer_user_id, artist_id, reference_images, width_cm, height_cm, placement, style, description, preferred_date, preferred_time, status, quoted_price, estimated_duration_minutes, deposit_required, quote_note, quoted_at, accepted_at, rejected_at, created_at, updated_at, request_type, service_type, work_type, estimated_min_price, estimated_max_price, price_estimated_at, has_medical_condition, medical_condition_note, has_allergy, allergy_note')
          .eq('customer_user_id', user.id)
          .order('created_at', { ascending: false });
        estData = estFallback || [];
      } else {
        estData = estDataPrimary || [];
      }

      // 2. Fetch own bookings
      const { data: bookData } = await supabase
        .from('bookings')
        .select('*')
        .eq('customer_user_id', user.id)
        .order('created_at', { ascending: false });

      // 2.5 Fetch own flash_reservations
      let flashData: any[] = [];
      const { data: flashPrimary, error: flashErr } = await supabase
        .from('flash_reservations')
        .select(`
          id,
          flash_design_id,
          customer_user_id,
          status,
          requested_date,
          requested_start_time,
          placement,
          width_cm,
          height_cm,
          customer_note,
          admin_note,
          approved_at,
          rejected_at,
          cancelled_at,
          completed_at,
          created_at,
          customer_hidden_at,
          flash_designs (
            id,
            title,
            style,
            size_label,
            price,
            deposit_amount,
            image_url,
            is_repeatable,
            artists (
              id,
              name,
              nickname
            )
          )
        `)
        .eq('customer_user_id', user.id)
        .is('customer_hidden_at', null)
        .order('created_at', { ascending: false });

      if (flashErr && flashErr.code === '42703') {
        const { data: flashFallback } = await supabase
          .from('flash_reservations')
          .select(`
            id,
            flash_design_id,
            customer_user_id,
            status,
            requested_date,
            requested_start_time,
            placement,
            width_cm,
            height_cm,
            customer_note,
            admin_note,
            approved_at,
            rejected_at,
            cancelled_at,
            completed_at,
            created_at,
            flash_designs (
              id,
              title,
              style,
              size_label,
              price,
              deposit_amount,
              image_url,
              is_repeatable,
              artists (
                id,
                name,
                nickname
              )
            )
          `)
          .eq('customer_user_id', user.id)
          .order('created_at', { ascending: false });
        flashData = flashFallback || [];
      } else {
        flashData = flashPrimary || [];
      }

      const hiddenEstimateIds = new Set(
        (estData || []).filter((e: any) => Boolean(e.customer_hidden_at)).map((e: any) => e.id)
      );

      const rawBookings = (bookData || []).filter((b: any) => {
        if (b.estimate_request_id && hiddenEstimateIds.has(b.estimate_request_id)) {
          return false;
        }
        return true;
      });
      const rawEstimates = (estData || []).filter((e: any) => !e.customer_hidden_at);
      const rawFlashData = (flashData || []).filter((f: any) => !f.customer_hidden_at);
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

      // 4.5 Batch fetch pending payment submissions for own bookings
      let rawSubmissions: any[] = [];
      if (user.id) {
        const { data: subData } = await supabase
          .from('booking_payment_submissions')
          .select('id, booking_id, status')
          .eq('customer_user_id', user.id);
        rawSubmissions = subData || [];
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
        const matchingEst = rawEstimates.find((e: any) => e.id === b.estimate_request_id);
        const matchingFlash = rawFlashData.find((f: any) => f.id === b.flash_reservation_id);
        const flashDesignObj = matchingFlash?.flash_designs;
        const isFlashBooking = Boolean(b.flash_reservation_id || matchingFlash);

        const refImages: string[] = isFlashBooking
          ? (flashDesignObj?.image_url ? [flashDesignObj.image_url] : (b.artwork_image_url ? [b.artwork_image_url] : []))
          : ((matchingEst?.reference_images && matchingEst.reference_images.length > 0)
              ? matchingEst.reference_images
              : (b.artwork_image_url ? [b.artwork_image_url] : []));

        const hasPendingSlip = rawSubmissions.some(
          (s: any) => s.booking_id === b.id && s.status === 'PENDING'
        );

        const titleDisplay = isFlashBooking
          ? (flashDesignObj?.title || b.artwork_title || 'แบบลายสัก Flash')
          : (b.artwork_title || matchingEst?.style || null);

        const styleDisplay = isFlashBooking
          ? (flashDesignObj?.style || 'Flash')
          : (matchingEst?.style || b.style || null);

        const placementDisplay = isFlashBooking
          ? (matchingFlash?.placement || b.placement || 'ไม่ระบุตำแหน่ง')
          : (b.placement || matchingEst?.placement || null);

        const widthCmVal = isFlashBooking
          ? (matchingFlash?.width_cm ? Number(matchingFlash.width_cm) : (b.width_cm ? Number(b.width_cm) : null))
          : (b.width_cm ? Number(b.width_cm) : (matchingEst?.width_cm ? Number(matchingEst.width_cm) : null));

        const heightCmVal = isFlashBooking
          ? (matchingFlash?.height_cm ? Number(matchingFlash.height_cm) : (b.height_cm ? Number(b.height_cm) : null))
          : (b.height_cm ? Number(b.height_cm) : (matchingEst?.height_cm ? Number(matchingEst.height_cm) : null));

        return {
          id: b.id,
          customer_user_id: b.customer_user_id,
          artist_id: b.artist_id,
          estimate_request_id: b.estimate_request_id,
          flash_reservation_id: b.flash_reservation_id,
          booking_source: b.booking_source,
          source_ref: b.source_ref,
          artwork_title: titleDisplay,
          style: styleDisplay,
          work_type: matchingEst?.work_type || null,
          artwork_image_url: isFlashBooking ? (flashDesignObj?.image_url || b.artwork_image_url) : b.artwork_image_url,
          reference_images: refImages,
          placement: placementDisplay,
          width_cm: widthCmVal,
          height_cm: heightCmVal,
          description: b.description || matchingFlash?.customer_note || '',
          requested_date: b.requested_date || matchingFlash?.requested_date,
          requested_start_time: b.requested_start_time || matchingFlash?.requested_start_time,
          customer_note: b.customer_note || matchingFlash?.customer_note,
          admin_note: b.admin_note || matchingFlash?.admin_note,
          rejection_reason: b.rejection_reason,
          status: b.status,
          approved_at: b.approved_at || matchingFlash?.approved_at || null,
          started_at: b.started_at,
          completed_at: b.completed_at,
          created_at: b.created_at,
          has_pending_payment_submission: hasPendingSlip,
          has_medical_condition: matchingEst?.has_medical_condition ?? null,
          medical_condition_note: matchingEst?.medical_condition_note ?? null,
          has_allergy: matchingEst?.has_allergy ?? null,
          allergy_note: matchingEst?.allergy_note ?? null,
          artist: bArtist || (flashDesignObj?.artists ? {
            id: flashDesignObj.artists.id,
            name: flashDesignObj.artists.name,
            nickname: flashDesignObj.artists.nickname,
            avatar_url: null,
            specialties: null
          } : null),
          sessions: bSessions,
          financial: bFinancial,
          is_flash: isFlashBooking,
          flash_reservation: matchingFlash ? {
            ...matchingFlash,
            flash_design: flashDesignObj
          } : null,
        };
      });

      // 7. Map and Hydrate Estimates
      const hydratedEstimates: CustomerPortalEstimate[] = rawEstimates.map((e: any) => {
        const eArtist = artistsList.find((a) => a.id === e.artist_id) || null;
        const linkedBooking = hydratedBookings.find((b) => b.estimate_request_id === e.id);
        const hasPendingSlip = linkedBooking?.has_pending_payment_submission || false;

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
          preferred_time: e.preferred_time || null,
          status: e.status,
          request_type: e.request_type || null,
          work_type: e.work_type || null,
          quoted_price: e.quoted_price ? Number(e.quoted_price) : null,
          estimated_min_price: e.estimated_min_price ? Number(e.estimated_min_price) : null,
          estimated_max_price: e.estimated_max_price ? Number(e.estimated_max_price) : null,
          price_estimated_at: e.price_estimated_at || null,
          estimated_duration_minutes: e.estimated_duration_minutes
            ? Number(e.estimated_duration_minutes)
            : null,
          deposit_required: e.deposit_required ? Number(e.deposit_required) : null,
          quote_note: e.quote_note || null,
          quoted_at: e.quoted_at || null,
          accepted_at: e.accepted_at || null,
          rejected_at: e.rejected_at || null,
          created_at: e.created_at,
          has_pending_payment_submission: hasPendingSlip,
          has_medical_condition: e.has_medical_condition ?? null,
          medical_condition_note: e.medical_condition_note ?? null,
          has_allergy: e.has_allergy ?? null,
          allergy_note: e.allergy_note ?? null,
          artist: eArtist,
          booking_id: linkedBooking?.id || null,
        };
      });

      // 7.5 Map Flash Reservations
      const hydratedFlash: CustomerFlashReservationRecord[] = rawFlashData.map((r: any) => ({
        id: r.id,
        flash_design_id: r.flash_design_id,
        customer_user_id: r.customer_user_id,
        status: r.status,
        requested_date: r.requested_date,
        requested_start_time: r.requested_start_time,
        placement: r.placement,
        width_cm: r.width_cm ? Number(r.width_cm) : null,
        height_cm: r.height_cm ? Number(r.height_cm) : null,
        customer_note: r.customer_note,
        admin_note: r.admin_note,
        approved_at: r.approved_at,
        rejected_at: r.rejected_at,
        cancelled_at: r.cancelled_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
        flash_design: r.flash_designs ? {
          id: r.flash_designs.id,
          title: r.flash_designs.title,
          style: r.flash_designs.style,
          size_label: r.flash_designs.size_label,
          price: Number(r.flash_designs.price) || 0,
          deposit_amount: Number(r.flash_designs.deposit_amount) || 0,
          image_url: r.flash_designs.image_url,
          is_repeatable: Boolean(r.flash_designs.is_repeatable),
          artist: r.flash_designs.artists ? {
            id: r.flash_designs.artists.id,
            name: r.flash_designs.artists.name,
            nickname: r.flash_designs.artists.nickname,
          } : null,
        } : null,
      }));

      setLiveBookings(hydratedBookings);
      setLiveEstimates(hydratedEstimates);
      setLiveFlashReservations(hydratedFlash);

      // Check if customer has at least 1 approved deposit payment submission ONLY
      const hasApprovedSub = (rawSubmissions || []).some((s: any) => s.status === 'APPROVED');
      setHasApprovedDeposit(hasApprovedSub);

      // 8. Next Appointment Authority: From public.booking_sessions OR active bookings fallback
      const allActiveSessions: { session: CustomerPortalSession; booking: CustomerPortalBooking }[] = [];
      hydratedBookings.forEach((b) => {
        const approvedAt = b.approved_at || b.flash_reservation?.approved_at;
        const dlInfo = getDepositDeadlineInfo(approvedAt, b.created_at, b.requested_date, b.requested_start_time);
        const isExpired = b.status === 'EXPIRED' || (b.flash_reservation && (b.flash_reservation.status === 'EXPIRED' || b.flash_reservation.status === 'CANCELLED')) || (b.status === 'WAITING_DEPOSIT' && !b.has_pending_payment_submission && Boolean(dlInfo?.isExpired));

        if (isExpired || ['CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED'].includes(b.status)) {
          return;
        }

        const validSessions = (b.sessions || []).filter(
          (s) => s.status !== 'CANCELLED' && s.status !== 'COMPLETED'
        );

        if (validSessions.length > 0) {
          validSessions.forEach((s) => {
            allActiveSessions.push({ session: s, booking: b });
          });
        } else {
          // Fallback session object from booking's requested_date & requested_start_time
          const startTimeStr = b.requested_start_time
            ? (b.requested_start_time.includes(':') ? (b.requested_start_time.split(':').length === 2 ? `${b.requested_start_time}:00` : b.requested_start_time) : `${b.requested_start_time}:00:00`)
            : '10:00:00';
          const fallbackStartAt = b.requested_date
            ? `${b.requested_date}T${startTimeStr}`
            : b.created_at;

          const dummySession: CustomerPortalSession = {
            id: `virtual-${b.id}`,
            booking_id: b.id,
            artist_id: b.artist_id,
            session_number: 1,
            start_at: fallbackStartAt,
            end_at: fallbackStartAt,
            status: b.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SCHEDULED',
            note: null,
            created_at: b.created_at,
            artist: b.artist || null,
          };
          allActiveSessions.push({ session: dummySession, booking: b });
        }
      });

      // Priority 1: An IN_PROGRESS session
      const inProgressSession = allActiveSessions.find(
        (item) => item.session.status === 'IN_PROGRESS' || item.booking.status === 'IN_PROGRESS'
      );
      if (inProgressSession) {
        setNextAppointment({
          session: inProgressSession.session,
          booking: inProgressSession.booking,
          artist: inProgressSession.session.artist || inProgressSession.booking.artist || null,
        });
      } else {
        // Priority 2: Confirmed bookings first, then by earliest start_at / created_at date
        allActiveSessions.sort((a, b) => {
          const aIsConfirmed = a.booking.status === 'CONFIRMED' ? 1 : 0;
          const bIsConfirmed = b.booking.status === 'CONFIRMED' ? 1 : 0;
          if (aIsConfirmed !== bIsConfirmed) {
            return bIsConfirmed - aIsConfirmed; // CONFIRMED first
          }
          return new Date(a.session.start_at).getTime() - new Date(b.session.start_at).getTime();
        });

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

  // Flash Status Mapper helper
  const getFlashMappedStatus = (rawStatus: string): string => {
    const s = (rawStatus || '').toUpperCase();
    if (s === 'PENDING' || s === 'PENDING_REVIEW') return 'PENDING';
    if (s === 'WAITING_DEPOSIT' || s === 'PENDING_PAYMENT') return 'WAITING_DEPOSIT';
    if (s === 'SLIP_REVIEW' || s === 'VERIFICATION_PENDING') return 'SLIP_REVIEW';
    if (s === 'APPROVED' || s === 'CONFIRMED' || s === 'IN_PROGRESS') return 'CONFIRMED';
    if (s === 'COMPLETED') return 'COMPLETED';
    if (s === 'REJECTED' || s === 'CANCELLED' || s === 'EXPIRED') return 'CANCELLED';
    return s;
  };

  // Exclude flash_reservations that are already linked to a booking in liveBookings
  const linkedFlashIds = new Set(
    liveBookings.map((b: any) => b.flash_reservation_id).filter(Boolean)
  );

  const standaloneFlashReservations = liveFlashReservations.filter((f) => !linkedFlashIds.has(f.id));

  // Flash Reservation Status Groups (for standalone flash requests awaiting artist action)
  const pendingFlash = standaloneFlashReservations.filter((f) => getFlashMappedStatus(f.status) === 'PENDING');
  const waitingDepositFlash = standaloneFlashReservations.filter((f) => getFlashMappedStatus(f.status) === 'WAITING_DEPOSIT');
  const slipReviewFlash = standaloneFlashReservations.filter((f) => getFlashMappedStatus(f.status) === 'SLIP_REVIEW');
  const confirmedFlash = standaloneFlashReservations.filter((f) => getFlashMappedStatus(f.status) === 'CONFIRMED');
  const completedFlash = standaloneFlashReservations.filter((f) => getFlashMappedStatus(f.status) === 'COMPLETED');
  const cancelledOrRejectedFlash = standaloneFlashReservations.filter((f) => getFlashMappedStatus(f.status) === 'CANCELLED');

  // Tab 2: รอตรวจสอบ (Estimate/Request ที่ยังไม่มี Booking + Flash PENDING)
  const pendingEstimates = liveEstimates.filter(
    (e) => e.status === 'PENDING' && !e.booking_id && !liveBookings.some((b) => b.estimate_request_id === e.id)
  );
  const allPendingJobs = [
    ...pendingEstimates.map((e) => ({ item: e, type: 'estimate' as const, sortTime: new Date(e.created_at || 0).getTime() })),
    ...pendingFlash.map((f) => ({ item: f, type: 'flash' as const, sortTime: new Date(f.created_at || 0).getTime() })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // Tab 3: รอชำระมัดจำ (Booking WAITING_DEPOSIT ที่ยังไม่ส่งสลิป + Standalone Flash WAITING_DEPOSIT)
  const waitingDepositBookings = liveBookings.filter((b) => {
    if (b.status !== 'WAITING_DEPOSIT' || b.has_pending_payment_submission) return false;
    const approvedAt = b.approved_at || b.flash_reservation?.approved_at;
    const dl = getDepositDeadlineInfo(approvedAt, b.created_at, b.requested_date, b.requested_start_time);
    const isFlashExpired = b.flash_reservation?.status === 'EXPIRED' || b.flash_reservation?.status === 'CANCELLED';
    return !dl?.isExpired && !isFlashExpired;
  });
  const allWaitingDepositJobs = [
    ...waitingDepositBookings.map((b) => ({ item: b, type: b.is_flash ? ('flash' as const) : ('booking' as const), sortTime: new Date(b.created_at || 0).getTime() })),
    ...waitingDepositFlash.map((f) => ({ item: f, type: 'flash' as const, sortTime: new Date(f.created_at || 0).getTime() })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // Tab 4: รอตรวจสลิป (Booking WAITING_DEPOSIT ที่ส่งสลิปแล้วรอตรวจ + Standalone Flash SLIP_REVIEW)
  const slipReviewBookings = liveBookings.filter(
    (b) => b.status === 'WAITING_DEPOSIT' && Boolean(b.has_pending_payment_submission)
  );
  const allSlipReviewJobs = [
    ...slipReviewBookings.map((b) => ({ item: b, type: b.is_flash ? ('flash' as const) : ('booking' as const), sortTime: new Date(b.created_at || 0).getTime() })),
    ...slipReviewFlash.map((f) => ({ item: f, type: 'flash' as const, sortTime: new Date(f.created_at || 0).getTime() })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // Tab 5: ยืนยันคิว (Booking ที่ตรวจสลิปผ่านและยืนยันแล้ว + Standalone Flash APPROVED)
  const confirmedBookings = liveBookings.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS'
  );
  const allConfirmedJobs = [
    ...confirmedBookings.map((b) => ({ item: b, type: b.is_flash ? ('flash' as const) : ('booking' as const), sortTime: new Date(b.created_at || 0).getTime() })),
    ...confirmedFlash.map((f) => ({ item: f, type: 'flash' as const, sortTime: new Date(f.created_at || 0).getTime() })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // Tab 6: เสร็จสิ้น (Booking สถานะ COMPLETED + Standalone Flash COMPLETED)
  const completedBookings = liveBookings.filter(
    (b) => b.status === 'COMPLETED'
  );
  const allCompletedJobs = [
    ...completedBookings.map((b) => ({ item: b, type: b.is_flash ? ('flash' as const) : ('booking' as const), sortTime: new Date(b.created_at || 0).getTime() })),
    ...completedFlash.map((f) => ({ item: f, type: 'flash' as const, sortTime: new Date(f.created_at || 0).getTime() })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // Tab 7: ยกเลิก / ปฏิเสธ (คำขอหรือ Booking หรือ Standalone Flash ที่ถูก REJECTED, CANCELLED, EXPIRED)
  const rejectedOrCancelledBookings = liveBookings.filter((b) => {
    if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(b.status) || (b.flash_reservation && ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(b.flash_reservation.status))) {
      return true;
    }
    if (b.status === 'WAITING_DEPOSIT' && !b.has_pending_payment_submission) {
      const approvedAt = b.approved_at || b.flash_reservation?.approved_at;
      const dl = getDepositDeadlineInfo(approvedAt, b.created_at, b.requested_date, b.requested_start_time);
      return Boolean(dl?.isExpired);
    }
    return false;
  });
  const rejectedOrExpiredEstimates = liveEstimates.filter(
    (e) => ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(e.status) && !liveBookings.some((b) => b.estimate_request_id === e.id)
  );
  const cancelledOrRejectedJobs = [
    ...rejectedOrCancelledBookings.map((b) => ({ item: b, type: b.is_flash ? ('flash' as const) : ('booking' as const), sortTime: new Date(b.created_at || 0).getTime() })),
    ...rejectedOrExpiredEstimates.map((e) => ({ item: e, type: 'estimate' as const, sortTime: new Date(e.created_at || 0).getTime() })),
    ...cancelledOrRejectedFlash.map((f) => ({ item: f, type: 'flash' as const, sortTime: new Date(f.created_at || 0).getTime() })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // Tab 1: ทั้งหมด (รวมทุกสถานะแบบไม่ซ้ำ)
  const allVisibleJobs = [
    ...liveBookings.map((b) => ({ item: b, type: b.is_flash ? ('flash' as const) : ('booking' as const), sortTime: new Date(b.created_at || 0).getTime() })),
    ...pendingEstimates.map((e) => ({ item: e, type: 'estimate' as const, sortTime: new Date(e.created_at || 0).getTime() })),
    ...rejectedOrExpiredEstimates.map((e) => ({ item: e, type: 'estimate' as const, sortTime: new Date(e.created_at || 0).getTime() })),
    ...standaloneFlashReservations.map((f) => ({ item: f, type: 'flash' as const, sortTime: new Date(f.created_at || 0).getTime() })),
  ].sort((a, b) => b.sortTime - a.sortTime);

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
    item: CustomerPortalBooking | CustomerPortalEstimate | CustomerFlashReservationRecord,
    type: 'estimate' | 'booking' | 'flash'
  ) => {
    setSelectedItem(item);
    setSelectedType(type);
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
                ศูนย์รวมรายการนัดหมาย คิวสัก และติดตามสถานะคำขอจองคิวของคุณ
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
                  {(() => {
                    const nextBooking = nextAppointment.booking;
                    const nextSession = nextAppointment.session;
                    const displayStatus = resolveCustomerDisplayStatus(
                      nextBooking.status,
                      nextBooking.has_pending_payment_submission
                    );

                    let badgeText = 'รอชำระมัดจำ';
                    let badgeStyle = 'bg-[#D9A441]/10 border-[#D9A441]/45 text-[#D9A441]';

                    if (nextSession.status === 'IN_PROGRESS' || displayStatus === 'IN_PROGRESS') {
                      badgeText = '● กำลังสักรอบ #' + nextSession.session_number;
                      badgeStyle = 'bg-studio-red/20 border-studio-red/50 text-studio-red animate-pulse';
                    } else if (displayStatus === 'SLIP_REVIEW') {
                      badgeText = 'รอตรวจสลิป';
                      badgeStyle = 'bg-[#C9A86A]/10 border-[#C9A86A]/45 text-[#C9A86A]';
                    } else if (displayStatus === 'PENDING') {
                      badgeText = 'รอตรวจสอบ';
                      badgeStyle = 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]';
                    } else if (displayStatus === 'CONFIRMED') {
                      badgeText = '✓ ยืนยันคิว';
                      badgeStyle = 'bg-green-900/10 border-green-800/40 text-green-800';
                    } else if (displayStatus === 'WAITING_DEPOSIT') {
                      badgeText = 'รอชำระมัดจำ';
                      badgeStyle = 'bg-[#D9A441]/10 border-[#D9A441]/45 text-[#D9A441]';
                    }

                    return (
                      <span className={`text-xs font-semibold px-3 py-1 rounded border ${badgeStyle}`}>
                        {badgeText}
                      </span>
                    );
                  })()}
                </div>

                <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-20 h-20 rounded-[4px] border border-studio-border/60 bg-studio-main shrink-0 overflow-hidden">
                      <CustomerReferenceImage
                        src={
                          nextAppointment.booking.reference_images?.[0] ||
                          nextAppointment.booking.artwork_image_url ||
                          null
                        }
                        alt="Tattoo Reference"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-lg font-heading font-normal text-studio-sec tracking-wide">
                        {(() => {
                          const matchingEst = liveEstimates.find(
                            (e) => e.id === nextAppointment.booking.estimate_request_id
                          );
                          const rawStyle = nextAppointment.booking.style || matchingEst?.style;
                          const tattooStyle = (rawStyle && rawStyle !== 'Custom' && rawStyle !== 'CUSTOM') ? rawStyle : null;
                          const rawTitle = nextAppointment.booking.artwork_title;
                          const displayTitle = (rawTitle && rawTitle !== 'งานสัก Custom' && rawTitle !== 'Custom')
                            ? rawTitle
                            : (tattooStyle ? `สไตล์ ${tattooStyle}` : 'งานสัก Custom');

                          return displayTitle;
                        })()}
                        {nextAppointment.booking.sessions.length > 1 && (
                          <span className="text-xs font-sans text-studio-muted ml-2 font-normal">
                            (รอบ #{nextAppointment.session.session_number} จาก {nextAppointment.booking.sessions.length} รอบ)
                          </span>
                        )}
                      </h3>
                      <div className="text-xs">
                        <div className="flex items-center gap-1.5 text-studio-sec font-semibold">
                          <Calendar size={13} className="text-studio-red shrink-0" />
                          <span>
                            {formatThaiDate(nextAppointment.session.start_at, true)} · {formatTimeBangkok(nextAppointment.session.start_at)}
                          </span>
                        </div>
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
                    {nextAppointment.booking.status === 'CONFIRMED' ? (
                      <span className="text-base font-bold text-studio-red">
                        {Number(nextAppointment.booking.financial?.remaining_balance ?? 0) > 0
                          ? `คงเหลือชำระหน้าร้าน ฿${formatCurrency(nextAppointment.booking.financial?.remaining_balance)}`
                          : 'ยืนยันคิวเรียบร้อย'}
                      </span>
                    ) : (
                      <div className="text-right space-y-0.5">
                        <span className="text-base font-bold text-studio-red block">
                          มัดจำที่ต้องชำระ ฿{formatCurrency(
                            nextAppointment.booking.financial?.deposit_required
                          )}
                        </span>
                        {(() => {
                          const hasPending = nextAppointment.booking.has_pending_payment_submission;
                          if (hasPending) {
                            return (
                              <span className="text-[10px] text-[#C9A86A] font-medium block">
                                ส่งหลักฐานแล้ว — รอตรวจสอบ
                              </span>
                            );
                          }
                          const dlInfo = getDepositDeadlineInfo(nextAppointment.booking.approved_at);
                          if (!dlInfo) return null;
                          if (dlInfo.isExpired) {
                            return (
                              <span className="text-[10px] text-red-400 font-bold block">
                                หมดเวลาชำระมัดจำ
                              </span>
                            );
                          }
                          return (
                            <div className="text-[10px] text-[#D9A441] font-mono leading-tight">
                              <div>ชำระภายใน {dlInfo.deadlineDateStr}</div>
                              <div className="font-bold">เหลือเวลา {dlInfo.remainingText}</div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
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
                  คุณสามารถเลือกชมแบบลายสักว่างในแกลเลอรี หรือส่งคำขอจองคิวเพื่อเริ่มนัดหมายใหม่
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <Link
                    href="/flash"
                    className="min-h-[44px] bg-studio-red text-studio-paper px-4 py-2.5 rounded-[4px] text-xs font-semibold uppercase tracking-wider hover:bg-tattoo-red-dark transition-all border border-studio-red flex items-center"
                  >
                    ดูลาย Flash ว่าง
                  </Link>
                  <Link
                    href="/booking"
                    className="min-h-[44px] bg-transparent border border-studio-border text-studio-primary px-4 py-2.5 rounded-[4px] text-xs font-medium uppercase tracking-wider hover:bg-studio-sec transition-all flex items-center"
                  >
                    จองคิวสักทั่วไป
                  </Link>
                </div>
              </div>
            )}

            {/* Tab Navigation Filter */}
            <div className="flex border-b border-studio-border space-x-6 text-xs uppercase tracking-wider font-semibold overflow-x-auto no-scrollbar scrollbar-none whitespace-nowrap pb-0">
              {[
                { key: 'all', label: `ทั้งหมด (${allVisibleJobs.length})` },
                { key: 'pending', label: `รอตรวจสอบ (${allPendingJobs.length})` },
                { key: 'waiting_deposit', label: `รอชำระมัดจำ (${allWaitingDepositJobs.length})` },
                { key: 'slip_review', label: `รอตรวจสลิป (${allSlipReviewJobs.length})` },
                { key: 'confirmed', label: `ยืนยันคิว (${allConfirmedJobs.length})` },
                { key: 'completed', label: `เสร็จสิ้น (${allCompletedJobs.length})` },
                { key: 'cancelled', label: `ยกเลิก / ปฏิเสธ (${cancelledOrRejectedJobs.length})` },
                { key: 'profile', label: 'โปรไฟล์' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key as any)}
                  className={`pb-3 relative transition-colors shrink-0 whitespace-nowrap ${
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
              <div className="space-y-3">
                {allVisibleJobs.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีคิวนัดหมายหรือคำขอจอง
                  </p>
                ) : (
                  allVisibleJobs.map(({ item, type }) => (
                    <CustomerBookingCard
                      key={`${type}-${item.id}`}
                      item={item}
                      type={type}
                      estimates={liveEstimates}
                      onClick={() => handleCardClick(item, type)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'pending' && (
              <div className="space-y-3">
                {allPendingJobs.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการรอตรวจสอบ
                  </p>
                ) : (
                  allPendingJobs.map(({ item, type }) => (
                    <CustomerBookingCard
                      key={`${type}-${item.id}`}
                      item={item}
                      type={type}
                      estimates={liveEstimates}
                      onClick={() => handleCardClick(item, type)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'waiting_deposit' && (
              <div className="space-y-3">
                {allWaitingDepositJobs.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการรอชำระมัดจำ
                  </p>
                ) : (
                  allWaitingDepositJobs.map(({ item, type }) => (
                    <CustomerBookingCard
                      key={`${type}-${item.id}`}
                      item={item}
                      type={type}
                      estimates={liveEstimates}
                      onClick={() => handleCardClick(item, type)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'slip_review' && (
              <div className="space-y-3">
                {allSlipReviewJobs.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการรอตรวจสลิป
                  </p>
                ) : (
                  allSlipReviewJobs.map(({ item, type }) => (
                    <CustomerBookingCard
                      key={`${type}-${item.id}`}
                      item={item}
                      type={type}
                      estimates={liveEstimates}
                      onClick={() => handleCardClick(item, type)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'confirmed' && (
              <div className="space-y-3">
                {allConfirmedJobs.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการคิวที่ยืนยันแล้ว
                  </p>
                ) : (
                  allConfirmedJobs.map(({ item, type }) => (
                    <CustomerBookingCard
                      key={`${type}-${item.id}`}
                      item={item}
                      type={type}
                      estimates={liveEstimates}
                      onClick={() => handleCardClick(item, type)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'completed' && (
              <div className="space-y-3">
                {allCompletedJobs.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการที่เสร็จสิ้น
                  </p>
                ) : (
                  allCompletedJobs.map(({ item, type }) => (
                    <CustomerBookingCard
                      key={`${type}-${item.id}`}
                      item={item}
                      type={type}
                      estimates={liveEstimates}
                      onClick={() => handleCardClick(item, type)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === 'cancelled' && (
              <div className="space-y-3">
                {cancelledOrRejectedJobs.length === 0 ? (
                  <p className="text-xs text-studio-muted py-12 bg-studio-card border border-studio-border rounded-[6px] text-center">
                    ยังไม่มีรายการที่ถูกยกเลิกหรือปฏิเสธ
                  </p>
                ) : (
                  cancelledOrRejectedJobs.map(({ item, type }) => (
                    <CustomerBookingCard
                      key={`${type}-${item.id}`}
                      item={item}
                      type={type}
                      estimates={liveEstimates}
                      onClick={() => handleCardClick(item, type)}
                    />
                  ))
                )}
              </div>
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
                  <div className="flex justify-between items-center py-2 border-b border-studio-border/30">
                    <span>ชื่อผู้ใช้งาน:</span>
                    <div className="flex items-center gap-2">
                      <strong className="text-studio-primary">{customerName}</strong>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingName(!editingName);
                          setNameInput(customerName || '');
                          setNameError('');
                          setNameSuccess('');
                        }}
                        className="text-xs text-studio-red hover:underline font-semibold ml-2"
                      >
                        {editingName ? 'ยกเลิก' : 'แก้ไข'}
                      </button>
                    </div>
                  </div>

                  {editingName && (
                    <div className="bg-studio-main/60 border border-studio-border p-4 rounded-[6px] space-y-3 animate-fadeIn">
                      <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-medium">
                        แก้ไขชื่อผู้ใช้งาน
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder="กรอกชื่อผู้ใช้งาน"
                          className="flex-1 bg-studio-sec border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3 py-2.5 outline-none rounded-[4px]"
                        />
                        <button
                          type="button"
                          disabled={nameLoading}
                          onClick={async () => {
                            setNameError('');
                            setNameSuccess('');
                            setNameLoading(true);
                            const res = await updateCustomerName(nameInput);
                            setNameLoading(false);
                            if (res.success) {
                              setNameSuccess('บันทึกชื่อผู้ใช้งานสำเร็จ');
                              setEditingName(false);
                            } else {
                              setNameError(res.error || 'เกิดข้อผิดพลาด');
                            }
                          }}
                          className="bg-studio-red text-studio-paper px-4 py-2 text-xs font-semibold rounded-[4px] hover:bg-tattoo-red-dark transition-all disabled:opacity-50"
                        >
                          {nameLoading ? 'บันทึก...' : 'บันทึก'}
                        </button>
                      </div>
                      {nameError && <p className="text-xs text-red-400">{nameError}</p>}
                      {nameSuccess && <p className="text-xs text-green-400">{nameSuccess}</p>}
                    </div>
                  )}
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

                  <div className="flex justify-between items-center py-2 border-b border-studio-border/30">
                    <span>วันเกิด / อายุ:</span>
                    <strong className="text-studio-primary font-medium">
                      {formatCustomerDateOfBirthAndAge(customerDateOfBirth)}
                    </strong>
                  </div>

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
                  href="/booking"
                  className="min-h-[46px] w-full bg-studio-sec hover:bg-studio-main border border-studio-border hover:border-studio-red/60 text-studio-primary p-3 rounded-[4px] text-xs font-semibold flex items-center justify-between transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Compass size={14} className="text-studio-red" />
                    <span>จองคิวสักทั่วไป (Custom)</span>
                  </span>
                  <ArrowUpRight size={14} className="text-studio-muted" />
                </Link>
              </div>
            </div>

            {/* Post-Confirmation Guide Card (Displayed after deposit slip approval) */}
            <CustomerPostConfirmationGuide hasApprovedSubmission={hasApprovedDeposit} />
          </div>
        </div>
      </main>

      {/* Item Detail Modal (Booking or Estimate) */}
      {selectedItem && (
        <CustomerBookingDetail
          item={selectedItem}
          type={selectedType || 'booking'}
          estimates={liveEstimates}
          onClose={() => setSelectedItem(null)}
          onRefresh={fetchPortalData}
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
