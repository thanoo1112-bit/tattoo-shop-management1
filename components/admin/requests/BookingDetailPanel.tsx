'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  CreditCard,
  UserCheck,
  Image as ImageIcon,
  Maximize2,
  Eye,
  Layers,
  Wallet,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react';
import { BookingItem, BookingSessionItem, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok, formatCurrency, getTattooWorkTypeLabel, getColorTechniqueLabel, toBangkokDateString } from './types';
import { calculateDurationText, resolveBookingCalendarStatus } from '@/components/admin/calendar/calendarUtils';
import { parseNoteWithPreferredTime } from '@/lib/noteUtils';
import BookingSessionList from './BookingSessionList';
import { CompleteBookingDialog } from './CompleteBookingDialog';
import CreateSessionDialog from './CreateSessionDialog';
import { checkAdminCompletionEligibility } from './adminCompletionGuard';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import { BlockedDateRecord, checkDateAvailability, checkExistingDateWarning } from '@/lib/availabilityUtils';
import { calculateCustomerAgeYears } from '@/lib/customerUtils';
import { formatTattooSize } from '@/lib/utils/formatters';
import { isConfirmedDepositBooking } from '@/components/portal/portalUtils';
import BookingRescheduleRequestSection from './BookingRescheduleRequestSection';
import {
  RescheduleRequest,
  getLatestRescheduleRequest,
  getPendingRescheduleRequest,
  isRescheduleRequestUiEnabled,
  subscribeRescheduleRequests,
} from '@/lib/reschedule/rescheduleRequestStore';

interface BookingDetailPanelProps {
  booking: BookingItem | null;
  artists: Array<{ id: string; name: string; nickname: string | null }>;
  blockedDates?: BlockedDateRecord[];
  isArtistView?: boolean;
  isDashboard?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onCheckSlip?: (bookingId: string) => void;
}

export default function BookingDetailPanel({
  booking,
  artists,
  blockedDates = [],
  isArtistView = false,
  isDashboard = false,
  onClose,
  onRefresh,
  onCheckSlip,
}: BookingDetailPanelProps) {
  const { profile, staffArtistRecord } = useApp();

  const [selectedArtistId, setSelectedArtistId] = useState<string>(
    booking?.artist_id || artists[0]?.id || ''
  );
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isCompletingActiveSession, setIsCompletingActiveSession] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [latestReschedule, setLatestReschedule] = useState<RescheduleRequest | null>(() =>
    booking?.id ? getLatestRescheduleRequest(booking.id) : null
  );

  useEffect(() => {
    const bId = booking?.id || '';
    const sync = () => setLatestReschedule(bId ? getLatestRescheduleRequest(bId) : null);
    sync();
    return subscribeRescheduleRequests(sync);
  }, [booking?.id]);

  // Reschedule Session Dialog State
  const [reschedulingSession, setReschedulingSession] = useState<BookingSessionItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState<string>('');
  const [rescheduleEndTime, setRescheduleEndTime] = useState<string>('');
  const [rescheduleNote, setRescheduleNote] = useState<string>('');
  const [sessionDurationMs, setSessionDurationMs] = useState<number>(8 * 3600 * 1000);
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState<boolean>(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Complete Active Session Dialog State
  const [completingSessionModal, setCompletingSessionModal] = useState<BookingSessionItem | null>(null);
  const [completingNote, setCompletingNote] = useState<string>('');

  const openRescheduleForSession = (session: BookingSessionItem) => {
    setReschedulingSession(session);
    setRescheduleError(null);

    let defaultDate = booking?.requested_date || '';
    let defaultStart = '10:00';
    let defaultEnd = '18:00';
    let duration = 8 * 3600 * 1000;

    if (session.start_at) {
      defaultDate = toBangkokDateString(session.start_at);
      const dStart = new Date(session.start_at);
      defaultStart = dStart.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
      if (session.end_at) {
        const dEnd = new Date(session.end_at);
        const diff = dEnd.getTime() - dStart.getTime();
        if (diff > 0) {
          duration = diff;
          defaultEnd = dEnd.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
        }
      }
    }

    setSessionDurationMs(duration);
    setRescheduleDate(defaultDate);
    setRescheduleStartTime(defaultStart);
    setRescheduleEndTime(defaultEnd);
    setRescheduleNote(session.note || '');
  };

  const handleOpenRescheduleModal = () => {
    if (!booking) return;
    const availableSessions = booking.sessions?.filter((s) => s.status !== 'CANCELLED') || [];
    const targetSession = availableSessions.find((s) => s.status === 'SCHEDULED') || availableSessions[0];
    if (!targetSession) {
      setActionError('ไม่พบรอบสักที่สามารถเลื่อนคิวได้ (กรุณาเพิ่มรอบสักก่อน)');
      return;
    }
    openRescheduleForSession(targetSession);
  };

  const handleExecuteReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingSession) return;
    const availCheck = checkDateAvailability(
      rescheduleDate,
      booking?.artist_id,
      blockedDates,
      booking?.artist_nickname || booking?.artist_name
    );

    if (availCheck.isBlocked) {
      setRescheduleError(availCheck.errorMessage || 'ไม่สามารถเลือกวันที่นี้ได้ ร้านหรือช่างปิดรับคิวในวันที่เลือก');
      return;
    }

    setIsSubmittingReschedule(true);
    setRescheduleError(null);
    try {
      const supabase = createClient();
      const cleanStartTime = rescheduleStartTime.length === 5 ? rescheduleStartTime + ':00' : rescheduleStartTime;
      const startAtIso = `${rescheduleDate}T${cleanStartTime}+07:00`;
      
      // Calculate end time automatically from preserved session duration
      const startMs = new Date(startAtIso).getTime();
      const endMs = startMs + sessionDurationMs;
      const computedEndTime = new Date(endMs).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
      const cleanEndTime = computedEndTime.length === 5 ? computedEndTime + ':00' : computedEndTime;
      const endAtIso = `${rescheduleDate}T${cleanEndTime}+07:00`;
      const finalNote = rescheduleNote.trim() ? rescheduleNote.trim() : null;

      const { error: updateErr } = await supabase
        .from('booking_sessions')
        .update({
          start_at: startAtIso,
          end_at: endAtIso,
          note: finalNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reschedulingSession.id);

      if (updateErr) {
        const { error: rpcErr } = await supabase.rpc('artist_reschedule_session_item', {
          p_session_id: reschedulingSession.id,
          p_new_date: rescheduleDate,
          p_new_start_time: rescheduleStartTime,
          p_new_end_time: computedEndTime,
          p_note: finalNote,
        });
        if (rpcErr) throw rpcErr;
      }

      setSuccessToast('เลื่อนคิวนัดหมายเรียบร้อยแล้ว');
      setReschedulingSession(null);
      onRefresh();
    } catch (err: any) {
      console.error('Error rescheduling session:', err);
      setRescheduleError(err.message || 'เกิดข้อผิดพลาดในการเลื่อนคิว');
    } finally {
      setIsSubmittingReschedule(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const [previewModal, setPreviewModal] = useState<{ src: string; type: 'reference' | 'slip' } | null>(null);

  // Payment Slip Actions State
  const [isApprovingSlip, setIsApprovingSlip] = useState(false);
  const [isRejectingSlip, setIsRejectingSlip] = useState(false);
  const [slipRejectReason, setSlipRejectReason] = useState('');
  const [isSubmittingSlipReject, setIsSubmittingSlipReject] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Resilient Customer Confirmation Resolution State
  const [confirmationState, setConfirmationState] = useState<'loading' | 'confirmed' | 'not_confirmed' | 'error'>('loading');
  const [customerDob, setCustomerDob] = useState<string | null>(booking?.date_of_birth || booking?.customer_dob || null);

  React.useEffect(() => {
    setCustomerDob(booking?.date_of_birth || booking?.customer_dob || null);
  }, [booking?.date_of_birth, booking?.customer_dob]);

  React.useEffect(() => {
    if (!booking) {
      setConfirmationState('not_confirmed');
      return;
    }

    const customerUserId = booking.customer_user_id;
    const customerId = (booking as any)?.customer_id;
    if (!customerUserId && !customerId) {
      setConfirmationState(booking.is_age_confirmed === true ? 'confirmed' : 'not_confirmed');
      return;
    }

    let isMounted = true;
    setConfirmationState('loading');
    const supabase = createClient();

    async function fetchStatus() {
      try {
        let query = supabase
          .from('customers')
          .select('eligibility_confirmed_at, profile_completed_at, date_of_birth');
        if (customerUserId) query = query.eq('user_id', customerUserId);
        else if (customerId) query = query.eq('id', customerId);

        const { data, error } = await query.maybeSingle();

        if (!isMounted) return;

        if (error) {
          console.error('Error fetching admin booking customer confirmation:', error);
          setConfirmationState('error');
          return;
        }

        if (data) {
          if (data.date_of_birth) {
            setCustomerDob(data.date_of_birth);
          }
          const isConfirmed = Boolean(data.eligibility_confirmed_at || data.profile_completed_at || booking?.is_age_confirmed);
          setConfirmationState(isConfirmed ? 'confirmed' : 'not_confirmed');
        } else {
          setConfirmationState(booking?.is_age_confirmed === true ? 'confirmed' : 'not_confirmed');
        }
      } catch (err) {
        console.error('Exception fetching admin booking customer confirmation:', err);
        if (isMounted) setConfirmationState('error');
      }
    }

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, [booking?.id, booking?.customer_user_id, (booking as any)?.customer_id, booking?.is_age_confirmed]);

  // Health Data Hydration from estimate_requests linked to booking.estimate_request_id
  const [healthState, setHealthState] = useState<{
    loading: boolean;
    has_medical_condition: boolean | null;
    medical_condition_note: string | null;
    has_allergy: boolean | null;
    allergy_note: string | null;
    error: boolean;
  }>({
    loading: booking?.has_medical_condition === undefined && booking?.has_allergy === undefined,
    has_medical_condition: booking?.has_medical_condition ?? null,
    medical_condition_note: (booking as any)?.medical_condition_note ?? null,
    has_allergy: booking?.has_allergy ?? null,
    allergy_note: (booking as any)?.allergy_note ?? null,
    error: false,
  });

  React.useEffect(() => {
    if (
      booking &&
      (booking.has_medical_condition !== undefined || booking.has_allergy !== undefined)
    ) {
      setHealthState((prev) => ({
        ...prev,
        has_medical_condition: booking.has_medical_condition ?? prev.has_medical_condition,
        medical_condition_note: (booking as any)?.medical_condition_note || prev.medical_condition_note,
        has_allergy: booking.has_allergy ?? prev.has_allergy,
        allergy_note: (booking as any)?.allergy_note || prev.allergy_note,
        loading: false,
      }));
    }
  }, [
    booking?.id,
    booking?.has_medical_condition,
    booking?.has_allergy,
    (booking as any)?.medical_condition_note,
    (booking as any)?.allergy_note,
  ]);

  React.useEffect(() => {
    const estimateRequestId = booking?.estimate_request_id;
    const customerUserId = booking?.customer_user_id;
    const customerId = (booking as any)?.customer_id;

    if (!customerUserId && !customerId && !estimateRequestId) {
      setHealthState({
        loading: false,
        has_medical_condition: booking?.has_medical_condition ?? null,
        medical_condition_note: (booking as any)?.medical_condition_note ?? null,
        has_allergy: booking?.has_allergy ?? null,
        allergy_note: (booking as any)?.allergy_note ?? null,
        error: false,
      });
      return;
    }

    let isMounted = true;
    setHealthState((prev) => ({
      ...prev,
      loading: prev.has_medical_condition === null && prev.has_allergy === null,
    }));
    const supabase = createClient();

    async function fetchHealthData() {
      try {
        let hasCustData = false;
        let healthObj = {
          has_medical_condition: null as boolean | null,
          medical_condition_note: null as string | null,
          has_allergy: null as boolean | null,
          allergy_note: null as string | null,
        };

        // 1. Check customers table by user_id or id first (works for Flash & Custom)
        if (customerUserId || customerId) {
          let query = supabase
            .from('customers')
            .select('has_medical_condition, medical_condition_note, medical_conditions, has_allergy, allergy_note, allergies, date_of_birth');
          if (customerUserId) query = query.eq('user_id', customerUserId);
          else if (customerId) query = query.eq('id', customerId);

          const { data: cData, error: cErr } = await query.maybeSingle();

          if (!cErr && cData) {
            if (cData.date_of_birth) {
              setCustomerDob((prev) => prev || cData.date_of_birth);
            }
            const hasMed = cData.has_medical_condition ?? (cData.medical_conditions ? true : (cData.medical_condition_note ? true : null));
            const hasAll = cData.has_allergy ?? (cData.allergies ? true : (cData.allergy_note ? true : null));
            const medNote = cData.medical_condition_note || cData.medical_conditions || null;
            const allNote = cData.allergy_note || cData.allergies || null;

            if (cData.has_medical_condition !== undefined || cData.has_allergy !== undefined || medNote || allNote) {
              hasCustData = true;
              healthObj = {
                has_medical_condition: hasMed,
                medical_condition_note: medNote,
                has_allergy: hasAll,
                allergy_note: allNote,
              };
            }
          }
        }

        // 2. Fallback to estimate_requests if health data still missing
        if ((!hasCustData || healthObj.has_medical_condition === null) && estimateRequestId) {
          const { data: eData, error: eErr } = await supabase
            .from('estimate_requests')
            .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note, date_of_birth, customer_dob')
            .eq('id', estimateRequestId)
            .maybeSingle();

          if (!eErr && eData) {
            if (eData.date_of_birth || eData.customer_dob) {
              setCustomerDob((prev) => prev || eData.date_of_birth || eData.customer_dob);
            }
            healthObj = {
              has_medical_condition: eData.has_medical_condition ?? null,
              medical_condition_note: eData.medical_condition_note ?? null,
              has_allergy: eData.has_allergy ?? null,
              allergy_note: eData.allergy_note ?? null,
            };
          }
        }

        if (!isMounted) return;

        setHealthState({
          loading: false,
          has_medical_condition: healthObj.has_medical_condition ?? booking?.has_medical_condition ?? null,
          medical_condition_note: healthObj.medical_condition_note || (booking as any)?.medical_condition_note || null,
          has_allergy: healthObj.has_allergy ?? booking?.has_allergy ?? null,
          allergy_note: healthObj.allergy_note || (booking as any)?.allergy_note || null,
          error: false,
        });
      } catch (err) {
        console.error('Exception fetching health data for admin booking detail:', err);
        if (isMounted) {
          setHealthState({
            loading: false,
            has_medical_condition: booking?.has_medical_condition ?? null,
            medical_condition_note: (booking as any)?.medical_condition_note ?? null,
            has_allergy: booking?.has_allergy ?? null,
            allergy_note: (booking as any)?.allergy_note ?? null,
            error: true,
          });
        }
      }
    }

    fetchHealthData();

    return () => {
      isMounted = false;
    };
  }, [booking?.id, booking?.customer_user_id, (booking as any)?.customer_id, booking?.estimate_request_id]);



  const isHealthUnknown =
    healthState.loading ||
    healthState.error ||
    healthState.has_medical_condition === null ||
    healthState.has_medical_condition === undefined ||
    healthState.has_allergy === null ||
    healthState.has_allergy === undefined;

  const isHealthy =
    !isHealthUnknown &&
    healthState.has_medical_condition === false &&
    healthState.has_allergy === false;

  if (!booking) return null;

  const pendingSubmission = booking.pending_submission;
  const customerName = booking.customer_name || 'ไม่ระบุชื่อ';
  const customerPhone = booking.customer_phone || null;
  const customerEmail = booking.customer_email || null;

  const rawArtistName = booking.artist_name || 'ยังไม่มอบหมายช่าง';
  const rawArtistNickname = booking.artist_nickname;
  const artistDisplay = rawArtistNickname ? `${rawArtistName} (${rawArtistNickname})` : rawArtistName;

  const rawStyle = booking.style_preference && booking.style_preference !== 'ไม่ระบุ' ? booking.style_preference : null;
  const styleDisplay = rawStyle || 'ไม่ระบุ';

  const rawPlacement = (booking.placement && booking.placement !== 'CUSTOM' && booking.placement !== 'ไม่ระบุ') ? booking.placement : null;
  const placementDisplay = rawPlacement || 'ไม่ระบุ';

  const wCm = booking.width_cm ?? null;
  const hCm = booking.height_cm ?? null;
  const sizeTierVal = booking.estimated_size_tier || booking.size_label || null;
  const sizeDisplay = formatTattooSize(wCm, hCm, sizeTierVal);

  const activeSession = booking.sessions?.find((s) => s.status !== 'CANCELLED') || booking.sessions?.[0];
  const hasApprovedReschedule =
    latestReschedule?.status === 'APPROVED' &&
    Boolean(latestReschedule.requested_date && latestReschedule.requested_start_time);

  const appointmentDateDisplay = hasApprovedReschedule
    ? formatDateBangkok(latestReschedule!.requested_date)
    : activeSession?.start_at
    ? formatDateBangkok(activeSession.start_at)
    : booking.requested_date
    ? formatDateBangkok(booking.requested_date)
    : 'ไม่ระบุวัน';

  const rawTimeStr = booking.requested_time || booking.requested_start_time;
  const formattedRawTime = rawTimeStr ? (rawTimeStr.length >= 5 ? `${rawTimeStr.slice(0, 5)} น.` : rawTimeStr) : 'ไม่ระบุเวลา';

  const appointmentTimeDisplay = hasApprovedReschedule
    ? `${latestReschedule!.requested_start_time.slice(0, 5)} น.`
    : activeSession?.start_at
    ? formatTimeBangkok(activeSession.start_at)
    : formattedRawTime;

  const durationText = activeSession?.start_at && activeSession?.end_at
    ? calculateDurationText(activeSession.start_at, activeSession.end_at)
    : null;

  const descriptionDisplay = booking.description || booking.customer_note || '';
  const cleanDescription = parseNoteWithPreferredTime(descriptionDisplay).cleanNote || null;
  // Resolve reference images defensively from booking, parent estimate, flash design, or artwork_image_url
  const rawRefs = booking.reference_images || (booking as any).estimate_requests?.reference_images || (booking as any).estimate?.reference_images;
  const flashImg = (booking as any).flash_reservations?.flash_designs?.image_url ||
                   (booking as any).flash_reservation?.flash_designs?.image_url ||
                   (booking as any).flash_reservation?.flash_design?.image_url ||
                   (booking as any).flash_design?.image_url;

  let refImages: string[] = [];
  if (flashImg) {
    refImages = [flashImg];
  } else if (Array.isArray(rawRefs) && rawRefs.length > 0) {
    refImages = rawRefs.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()));
  } else if (typeof rawRefs === 'string' && rawRefs.trim()) {
    try {
      const parsed = JSON.parse(rawRefs);
      if (Array.isArray(parsed) && parsed.length > 0) {
        refImages = parsed.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()));
      } else {
        refImages = [rawRefs.trim()];
      }
    } catch {
      refImages = [rawRefs.trim()];
    }
  } else if (booking.artwork_image_url) {
    refImages = [booking.artwork_image_url];
  }

  const isConfirmedDeposit = Boolean(
    booking &&
    (isConfirmedDepositBooking(booking, undefined, undefined, booking.financial) || booking.status === 'COMPLETED') &&
    !booking.has_pending_payment_submission &&
    booking.pending_submission?.status !== 'PENDING' &&
    booking.operational_status?.key !== 'WAITING_SLIP_VERIFICATION'
  );

  const dashboardCalendarStatus = (isDashboard || isArtistView)
    ? resolveBookingCalendarStatus(booking.sessions, booking.status)
    : null;

  const hasPendingReschedule = Boolean(
    booking.id && isRescheduleRequestUiEnabled() && getPendingRescheduleRequest(booking.id)
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-blue-500/15 text-blue-300 border border-blue-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            รออนุมัติคิว
          </span>
        );
      case 'APPROVED':
        return (
          <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            อนุมัติแล้ว
          </span>
        );
      case 'WAITING_DEPOSIT':
        return (
          <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            รอมัดจำ
          </span>
        );
      case 'CONFIRMED':
        if (hasPendingReschedule) {
          return (
            <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
              ขอเลื่อนนัด
            </span>
          );
        }
        if (isDashboard || isArtistView) {
          return (
            <span className="bg-sky-500/15 text-sky-300 border border-sky-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
              นัดหมายแล้ว
            </span>
          );
        }
        return (
          <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            คิวยืนยันแล้ว
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="bg-[#9C2F2F]/20 text-[#D64545] border border-[#9C2F2F]/60 px-2.5 py-0.5 rounded text-xs font-semibold flex items-center gap-1 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D64545] animate-pulse" />
            กำลังดำเนินงาน
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 px-2.5 py-0.5 rounded text-xs font-semibold">
            งานเสร็จสิ้น
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-500/15 text-red-300 border border-red-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
            ปฏิเสธแล้ว
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="bg-zinc-900/90 text-zinc-400 border border-zinc-700/80 px-2.5 py-0.5 rounded text-xs font-semibold">
            หมดอายุ
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#AFA79A] border border-[#4A443A] px-2.5 py-0.5 rounded text-xs font-semibold">
            ยกเลิกแล้ว
          </span>
        );
      default:
        return null;
    }
  };

  const handleApproveBooking = async () => {
    setActionError(null);
    const artistId = selectedArtistId || booking.artist_id;

    if (!artistId) {
      setActionError('กรุณาเลือกช่างสักก่อนทำการอนุมัติคิว');
      return;
    }

    setIsApproving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('bookings')
        .update({
          artist_id: artistId,
          status: 'APPROVED',
        })
        .eq('id', booking.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error approving booking:', err);
      setActionError(err.message || 'เกิดข้อผิดพลาดในการอนุมัติคิวงาน');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    setIsRejecting(true);
    const isConfirmed = booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';
    try {
      const supabase = createClient();
      const targetStatus = isConfirmed ? 'CANCELLED' : 'REJECTED';
      const defaultNote = isConfirmed ? 'ร้านขอยกเลิกคิวงานนี้' : 'ร้านไม่สามารถรับคิวงานนี้ได้';
      const notePrefix = isConfirmed ? 'ยกเลิก' : 'ปฏิเสธ';
      const cancellationReason = rejectReason.trim() ? `${notePrefix}: ${rejectReason.trim()}` : defaultNote;

      if (isArtistView && isConfirmed) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('artist_cancel_booking', {
          p_booking_id: booking.id,
          p_cancellation_reason: cancellationReason,
        });

        if (rpcErr || (rpcData && !(rpcData as any).success)) {
          console.error('artist_cancel_booking RPC failed, attempting direct update fallback:', rpcErr || rpcData);
          const { error: updateErr } = await supabase
            .from('bookings')
            .update({
              status: targetStatus,
              admin_note: cancellationReason,
            })
            .eq('id', booking.id);

          if (updateErr) throw (rpcErr || updateErr);
        }
      } else {
        const { error: updateErr } = await supabase
          .from('bookings')
          .update({
            status: targetStatus,
            admin_note: cancellationReason,
          })
          .eq('id', booking.id);

        if (updateErr) {
          if (isConfirmed) {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('artist_cancel_booking', {
              p_booking_id: booking.id,
              p_cancellation_reason: cancellationReason,
            });
            if (rpcErr || (rpcData && !(rpcData as any).success)) throw (updateErr || rpcErr);
          } else {
            throw updateErr;
          }
        }
      }

      setRejectReason('');
      setSuccessToast(isConfirmed ? 'ยกเลิกคิวงานเรียบร้อยแล้ว' : 'ปฏิเสธคิวงานเรียบร้อยแล้ว');
      onRefresh();
    } catch (err: any) {
      console.error('Error rejecting/cancelling booking:', err);
      setActionError(err.message || (isConfirmed ? 'เกิดข้อผิดพลาดในการยกเลิกคิว' : 'เกิดข้อผิดพลาดในการปฏิเสธคิว'));
    } finally {
      setIsRejecting(false);
    }
  };

  const handleStartActiveSession = async () => {
    if (!booking) return;
    const scheduledSession = booking.sessions?.find((s) => s.status === 'SCHEDULED');
    if (!scheduledSession && booking.sessions && booking.sessions.length > 0) {
      setActionError('ไม่พบรอบสักที่รอเริ่ม (Scheduled Session)');
      return;
    }
    setIsStartingSession(true);
    setActionError(null);
    try {
      const supabase = createClient();
      if (scheduledSession) {
        const { error: sErr } = await supabase
          .from('booking_sessions')
          .update({ status: 'IN_PROGRESS' })
          .eq('id', scheduledSession.id);
        if (sErr) throw sErr;
      }
      const { error: bErr } = await supabase
        .from('bookings')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', booking.id);
      if (bErr) throw bErr;
      setSuccessToast('เริ่มบันทึกเวลาการสักแล้ว');
      onRefresh();
    } catch (err: any) {
      console.error('Error starting active session:', err);
      setActionError(err.message || 'ไม่สามารถเริ่มรอบสักได้');
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleOpenCompleteActiveSessionModal = () => {
    if (!booking) return;
    const inProgressSession = booking.sessions?.find((s) => s.status === 'IN_PROGRESS') || booking.sessions?.find((s) => s.status === 'SCHEDULED');
    if (!inProgressSession) {
      setActionError('ไม่พบรอบสักที่กำลังดำเนินการหรือนัดหมายอยู่');
      return;
    }
    setCompletingSessionModal(inProgressSession);
    setCompletingNote(inProgressSession.note || '');
  };

  const handleExecuteCompleteSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking || !completingSessionModal) return;

    setIsCompletingActiveSession(true);
    setActionError(null);
    try {
      const supabase = createClient();
      const { error: sErr } = await supabase
        .from('booking_sessions')
        .update({
          status: 'COMPLETED',
          note: completingNote.trim() || null,
        })
        .eq('id', completingSessionModal.id);
      if (sErr) throw sErr;

      setSuccessToast(`บันทึกจบรอบสัก (รอบที่ ${completingSessionModal.session_number}) เรียบร้อยแล้ว`);
      setCompletingSessionModal(null);
      onRefresh();
    } catch (err: any) {
      console.error('Error completing active session:', err);
      setActionError(err.message || 'ไม่สามารถจบรอบสักได้');
    } finally {
      setIsCompletingActiveSession(false);
    }
  };

  const handleApproveSlip = async () => {
    if (!pendingSubmission) return;
    if (!window.confirm(`ยืนยันอนุมัติหลักฐานการชำระเงินมัดจำจำนวน ${formatCurrency(pendingSubmission.claimed_amount)} หรือไม่?`)) {
      return;
    }

    setIsApprovingSlip(true);
    setSlipError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_approve_payment_submission', {
        p_submission_id: pendingSubmission.id,
        p_verified_amount: Number(pendingSubmission.claimed_amount || 0),
        p_payment_method: 'BANK_TRANSFER',
        p_reference_no: pendingSubmission.reference_no || null,
        p_admin_note: null,
      });

      if (error) throw error;

      setSuccessToast('อนุมัติการชำระเงินมัดจำเรียบร้อยแล้ว — ยืนยันคิวแล้ว');
      setTimeout(() => {
        onRefresh();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error approving payment submission:', err);
      setSlipError(err.message || 'เกิดข้อผิดพลาดในการอนุมัติสลิป');
    } finally {
      setIsApprovingSlip(false);
    }
  };

  const handleRejectSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSubmission) return;

    if (!slipRejectReason.trim()) {
      setSlipError('กรุณาระบุเหตุผลในการปฏิเสธสลิป');
      return;
    }

    setIsSubmittingSlipReject(true);
    setSlipError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('admin_reject_payment_submission', {
        p_submission_id: pendingSubmission.id,
        p_rejection_reason: slipRejectReason.trim(),
      });

      if (error) throw error;

      setIsRejectingSlip(false);
      setSuccessToast('ปฏิเสธหลักฐานการชำระเงินเรียบร้อยแล้ว');
      setTimeout(() => {
        onRefresh();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error rejecting payment submission:', err);
      setSlipError(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธสลิป');
    } finally {
      setIsSubmittingSlipReject(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end font-prompt bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative w-full max-w-lg bg-studio-card border-l border-studio-border h-full flex flex-col shadow-2xl z-10 overflow-hidden font-prompt">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between bg-studio-card/95">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-mono font-bold text-[#B8B0A3] bg-studio-sec px-2 py-1 rounded border border-studio-border">
              คิว #{booking.id.slice(0, 8)}
            </span>
            {(booking.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || booking.has_pending_payment_submission) &&
            onCheckSlip ? (
              <button
                type="button"
                onClick={() => onCheckSlip(booking.id)}
                title="กดเพื่อตรวจสลิป"
                className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded text-xs font-semibold inline-flex items-center animate-pulse transition-colors cursor-pointer"
              >
                <span>สลิปรอตรวจ</span>
              </button>
            ) : (isDashboard || isArtistView) && dashboardCalendarStatus ? (
              dashboardCalendarStatus === 'IN_PROGRESS' ? (
                <span className="bg-[#9C2F2F]/20 text-[#D64545] border border-[#9C2F2F]/60 px-2.5 py-0.5 rounded text-xs font-semibold flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D64545] animate-pulse" />
                  กำลังสัก
                </span>
              ) : dashboardCalendarStatus === 'SCHEDULED' ? (
                hasPendingReschedule ? (
                  <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
                    ขอเลื่อนนัด
                  </span>
                ) : (
                  <span className="bg-sky-500/15 text-sky-300 border border-sky-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
                    นัดหมายแล้ว
                  </span>
                )
              ) : dashboardCalendarStatus === 'COMPLETED' ? (
                <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-700/80 px-2.5 py-0.5 rounded text-xs font-semibold">
                  งานเสร็จสิ้น
                </span>
              ) : dashboardCalendarStatus === 'CANCELLED' ? (
                <span className="bg-[#1F1D1A] text-[#AFA79A] border border-[#4A443A] px-2.5 py-0.5 rounded text-xs font-semibold">
                  ยกเลิกแล้ว
                </span>
              ) : dashboardCalendarStatus === 'REJECTED' ? (
                <span className="bg-red-500/15 text-red-300 border border-red-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
                  ปฏิเสธแล้ว
                </span>
              ) : dashboardCalendarStatus === 'EXPIRED' ? (
                <span className="bg-zinc-900/90 text-zinc-400 border border-zinc-700/80 px-2.5 py-0.5 rounded text-xs font-semibold">
                  หมดอายุ
                </span>
              ) : hasPendingReschedule ? (
                <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
                  ขอเลื่อนนัด
                </span>
              ) : (
                <span className="bg-sky-500/15 text-sky-300 border border-sky-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
                  นัดหมายแล้ว
                </span>
              )
            ) : booking.operational_status ? (
              hasPendingReschedule && booking.status === 'CONFIRMED' ? (
                <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded text-xs font-semibold">
                  ขอเลื่อนนัด
                </span>
              ) : (
                <span className={`${booking.operational_status.badgeClass} px-2.5 py-0.5 rounded text-xs font-semibold`}>
                  {booking.operational_status.label}
                </span>
              )
            ) : (
              getStatusBadge(booking.status)
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#B8B0A3] hover:text-studio-primary hover:bg-studio-sec border border-studio-border transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toast Feedback */}
        {successToast && (
          <div className="mx-4 mt-3 p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-lg text-xs flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            <span className="flex-1 font-medium">{successToast}</span>
          </div>
        )}

        {/* Action Error Banner */}
        {actionError && (
          <div className="mx-4 mt-3 p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-lg text-xs flex items-start space-x-2 animate-in fade-in">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <span className="flex-1">{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-32 md:pb-24 text-xs">
          {/* Section 1: Date & Time Card */}
          <div className="bg-studio-sec/80 border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
              <Calendar size={14} className="text-studio-red-bright" />
              <span>วันและเวลานัดหมาย (Bangkok Time)</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[#B8B0A3] text-[10px] block">วันที่</span>
                <span className="text-sm font-semibold text-studio-primary">
                  {appointmentDateDisplay}
                </span>
              </div>
              <div>
                <span className="text-[#B8B0A3] text-[10px] block">เวลานัด</span>
                <span className="text-sm font-semibold text-studio-primary font-mono flex items-center space-x-1">
                  <Clock size={13} className="text-[#B8B0A3] inline mr-1" />
                  {appointmentTimeDisplay}
                </span>
              </div>
            </div>
            {(() => {
              const targetDate = activeSession?.start_at ? toBangkokDateString(activeSession.start_at) : booking.requested_date;
              const bookingWarning = targetDate
                ? checkExistingDateWarning(targetDate, booking.artist_id, blockedDates, rawArtistNickname || rawArtistName)
                : { hasWarning: false, warningMessage: null };
              if (!bookingWarning.hasWarning) return null;
              return (
                <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-center gap-2 mt-2 font-prompt">
                  <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                  <span>{bookingWarning.warningMessage}</span>
                </div>
              );
            })()}
          </div>

          {/* Section 1B: Customer Reschedule Request Review (Artist & Admin) */}
          <BookingRescheduleRequestSection
            booking={booking}
            customerName={customerName}
            artistDisplay={rawArtistNickname || rawArtistName}
            blockedDates={blockedDates}
            reviewerId={profile?.id || staffArtistRecord?.id || null}
            onApproved={(msg) => {
              setSuccessToast(msg);
              onRefresh();
            }}
            onRejected={(msg) => {
              setSuccessToast(msg);
            }}
          />

          {/* Section 2: Admin Actions Panel (Matched with Artist Action Card Information Layout) */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                การจัดการคิวงาน (ADMIN ACTIONS)
              </span>
            </div>

            {/* CASE 1: Pending Payment Submission Action */}
            {pendingSubmission && (
              <div className="space-y-3 pt-1">
                {/* Context Info Box */}
                <div className="space-y-2 bg-studio-sec p-2.5 rounded-lg border border-studio-border/60 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#B8B0A3]">หลักฐานการชำระเงินมัดจำ:</span>
                    <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded text-[10px] font-semibold animate-pulse">
                      สลิปรอตรวจ
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#B8B0A3]">ยอดเงินที่ลูกค้าแจ้ง:</span>
                    <span className="text-sm font-bold text-amber-300 font-mono">
                      ฿{formatCurrency(pendingSubmission.claimed_amount)}
                    </span>
                  </div>
                </div>

                {slipError && (
                  <div className="p-2.5 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-center gap-1.5">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{slipError}</span>
                  </div>
                )}

                {/* Primary Action Full Width */}
                {!isRejectingSlip && (
                  <button
                    type="button"
                    disabled={isApprovingSlip}
                    onClick={handleApproveSlip}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>{isApprovingSlip ? 'กำลังบันทึก...' : 'ยืนยันการชำระเงิน'}</span>
                  </button>
                )}

                {/* Reject Slip Form */}
                {isRejectingSlip && (
                  <form onSubmit={handleRejectSlip} className="pt-2 border-t border-studio-border/40 space-y-2.5 animate-in fade-in">
                    <span className="text-[11px] text-red-400 font-semibold block">ระบุเหตุผลในการปฏิเสธสลิป</span>
                    <input
                      type="text"
                      required
                      value={slipRejectReason}
                      onChange={(e) => setSlipRejectReason(e.target.value)}
                      placeholder="เช่น สลิปไม่ชัดเจน, ไม่พบยอดเงินโอน..."
                      className="w-full bg-studio-sec border border-studio-border rounded-lg p-2 text-xs text-studio-primary focus:outline-none focus:border-red-400"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsRejectingSlip(false)}
                        className="px-3 py-1.5 bg-studio-sec text-xs text-[#B8B0A3] rounded border border-studio-border hover:text-studio-primary"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingSlipReject}
                        className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white rounded font-medium disabled:opacity-50"
                      >
                        {isSubmittingSlipReject ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธสลิป'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Divider & Secondary Actions Row */}
                {!isRejectingSlip && (
                  <div className="pt-2 border-t border-studio-border/60 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const slipUrl = pendingSubmission.proof_image_url || pendingSubmission.slip_path || null;
                        if (slipUrl) setPreviewModal({ src: slipUrl, type: 'slip' });
                      }}
                      className="py-2 px-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border rounded-xl font-medium text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Eye size={14} />
                      <span>ดูสลิป</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRejectingSlip(true)}
                      className="py-2 px-2.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded-xl font-medium text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <XCircle size={14} />
                      <span>ปฏิเสธสลิป</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CASE 2: Pending Queue Approval */}
            {!pendingSubmission && booking.status === 'PENDING' && (
              <div className="space-y-3 pt-1">
                <span className="text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold block">
                  มอบหมายช่างผู้รับผิดชอบ
                </span>
                <p className="text-[#B8B0A3] text-[11px] leading-relaxed">
                  เลือกช่างที่รับผิดชอบงานนี้ โดยสามารถเปลี่ยนมอบหมายให้ช่างคนอื่นได้
                </p>

                <div>
                  <label className="block text-[11px] text-[#B8B0A3] mb-1 font-medium">
                    ช่างผู้รับผิดชอบ: <span className="text-studio-red">*</span>
                  </label>
                  <select
                    id="select-booking-artist"
                    value={selectedArtistId}
                    onChange={(e) => setSelectedArtistId(e.target.value)}
                    className="w-full bg-studio-sec border border-studio-border rounded-lg px-3 py-2 text-xs text-studio-primary focus:outline-none focus:border-blue-400 font-prompt"
                  >
                    <option value="" disabled>-- เลือกช่างสัก --</option>
                    {artists.map((art) => (
                      <option key={art.id} value={art.id}>
                        {art.name} {art.nickname ? `(${art.nickname})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Primary Action Full Width */}
                {!isRejecting && (
                  <button
                    id="btn-approve-booking"
                    type="button"
                    disabled={isApproving}
                    onClick={handleApproveBooking}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 size={15} />
                    <span>{isApproving ? 'กำลังอนุมัติ...' : 'อนุมัติคิวงาน'}</span>
                  </button>
                )}

                {/* Reject Form */}
                {isRejecting && (
                  <form onSubmit={handleRejectBooking} className="pt-2 border-t border-studio-border/40 space-y-2 animate-in fade-in">
                    <span className="text-[11px] text-red-400 block font-semibold">ระบุเหตุผลการปฏิเสธ</span>
                    <input
                      type="text"
                      required
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="เช่น ช่างคิวเต็ม หรือไม่สะดวกในวันดังกล่าว..."
                      className="w-full bg-studio-sec border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-primary focus:outline-none focus:border-red-400"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsRejecting(false)}
                        className="px-2.5 py-1 text-xs text-[#B8B0A3]"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-red-600 text-xs text-white rounded font-medium"
                      >
                        ยืนยันปฏิเสธ
                      </button>
                    </div>
                  </form>
                )}

                {/* Divider & Secondary Action Row */}
                {!isRejecting && (
                  <div className="pt-2 border-t border-studio-border/60">
                    <button
                      id="btn-open-reject-booking"
                      type="button"
                      onClick={() => setIsRejecting(true)}
                      className="w-full py-2 px-3 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded-xl font-medium text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <XCircle size={14} />
                      <span>ปฏิเสธคิวงาน</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CASE 4: Completed Booking */}
            {!pendingSubmission && booking.status === 'COMPLETED' && (
              <div className="space-y-2 pt-1">
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/30 rounded-xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span>งานสักนี้เสร็จสิ้นสมบูรณ์แล้ว</span>
                  </div>
                </div>
              </div>
            )}

            {/* CASE 5: Confirmed or In Progress Booking */}
            {!pendingSubmission && (booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS') && (
              <div className="pt-1 space-y-3">
                {/* Primary Action Full Width: Complete Booking */}
                {!isRejecting && (() => {
                  const eligibility = checkAdminCompletionEligibility(booking);
                  return (
                    <div className="space-y-1.5">
                      <button
                        id="btn-open-complete-booking"
                        type="button"
                        onClick={() => {
                          setActionError(null);
                          if (!eligibility.allowed) {
                            setActionError(`${eligibility.title}: ${eligibility.reason}`);
                            return;
                          }
                          setIsCompleteDialogOpen(true);
                        }}
                        disabled={!eligibility.allowed}
                        className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-[0.99] ${
                          eligibility.allowed
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-75'
                        }`}
                      >
                        <CheckCircle2 size={15} />
                        <span>เสร็จสิ้นงาน</span>
                      </button>
                      {!eligibility.allowed && (
                        <p className="text-[11px] text-amber-300 font-medium text-center flex items-center justify-center gap-1">
                          <AlertTriangle size={12} className="shrink-0 text-amber-400" />
                          <span>{eligibility.reason}</span>
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Cancel Confirmation Form */}
                {isRejecting && (
                  <form onSubmit={handleRejectBooking} className="pt-2 border-t border-studio-border/40 space-y-2 animate-in fade-in">
                    <span className="text-[11px] text-red-400 block font-semibold">ระบุเหตุผลการยกเลิก</span>
                    <input
                      type="text"
                      required
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="เช่น ลูกค้าขอยกเลิก หรือไม่สะดวกในวันดังกล่าว..."
                      className="w-full bg-studio-sec border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-primary focus:outline-none focus:border-red-400 font-prompt placeholder:text-[#B8B0A3]"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRejecting(false);
                          setRejectReason('');
                        }}
                        className="px-2.5 py-1 text-xs text-[#B8B0A3] hover:text-studio-primary cursor-pointer"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 bg-red-600 hover:bg-red-500 text-xs text-white rounded font-medium cursor-pointer"
                      >
                        ยืนยันยกเลิก
                      </button>
                    </div>
                  </form>
                )}

                {/* Divider & 3-Column Secondary Action Row */}
                {!isRejecting && (
                  <div className="pt-2 border-t border-studio-border/60 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleOpenRescheduleModal}
                      className="py-2 px-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border rounded-xl font-medium text-[11px] transition-colors cursor-pointer text-center"
                    >
                      เลื่อนคิว
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCreatingSession(true)}
                      className="py-2 px-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border rounded-xl font-medium text-[11px] transition-colors cursor-pointer text-center"
                    >
                      เพิ่มรอบสัก
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsRejecting(true);
                        setRejectReason('');
                      }}
                      className="py-2 px-2.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded-xl font-medium text-[11px] transition-colors cursor-pointer text-center"
                    >
                      ยกเลิกคิว
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CASE 6: Waiting Deposit Banner */}
            {!pendingSubmission && booking.status === 'WAITING_DEPOSIT' && (
              <div className="pt-1 space-y-2">
                <p className="text-[#B8B0A3] text-[11px] leading-relaxed">
                  รอมัดจำ: อยู่ระหว่างรอลูกค้าชำระเงินและส่งหลักฐานสลิปมัดจำ
                </p>
              </div>
            )}

            {/* CASE 7: Cancelled or Rejected Banner */}
            {!pendingSubmission && (booking.status === 'CANCELLED' || booking.status === 'REJECTED') && (
              <div className="pt-1 space-y-2">
                <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-lg text-[11px] text-red-300">
                  <span>คิวนี้ถูก{booking.status === 'REJECTED' ? 'ปฏิเสธ' : 'ยกเลิก'}แล้ว</span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Customer Information */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
              <User size={14} className="text-studio-red-bright" />
              <span>ข้อมูลลูกค้า</span>
            </div>
            <div className="space-y-2.5 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-[#B8B0A3]">ชื่อลูกค้า:</span>
                <span className="text-studio-primary font-medium">{customerName}</span>
              </div>
              {customerEmail ? (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#B8B0A3]">อีเมล:</span>
                  <span className="text-[#ECE4D3] font-mono truncate max-w-[220px]">{customerEmail}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#B8B0A3]">อีเมล:</span>
                  <span className="text-[#B8B0A3] text-xs">ไม่ระบุอีเมล</span>
                </div>
              )}
              {customerPhone ? (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#B8B0A3]">เบอร์โทรศัพท์:</span>
                  <a
                    href={`tel:${customerPhone}`}
                    className="flex items-center space-x-1.5 text-emerald-400 hover:text-emerald-300 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded transition-colors"
                  >
                    <Phone size={12} />
                    <span>{customerPhone}</span>
                  </a>
                </div>
              ) : (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#B8B0A3]">เบอร์โทรศัพท์:</span>
                  <span className="text-[#B8B0A3] text-xs">ไม่ระบุเบอร์โทร</span>
                </div>
              )}
              {(() => {
                const customerAge = calculateCustomerAgeYears(customerDob || booking?.date_of_birth || booking?.customer_dob);
                return (
                  <div className="flex justify-between items-center py-2 border-t border-studio-border/30">
                    <span className="text-[#B8B0A3]">อายุลูกค้า:</span>
                    {customerAge !== null ? (
                      <span className="text-studio-primary font-mono text-xs font-semibold">
                        {customerAge} ปี
                      </span>
                    ) : (
                      <span className="text-[#B8B0A3] text-xs">
                        ไม่พบข้อมูลวันเกิด
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Section: ข้อมูลสุขภาพที่ลูกค้าแจ้ง */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3 font-prompt">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                <AlertTriangle
                  size={14}
                  className={
                    isHealthUnknown
                      ? 'text-studio-muted shrink-0'
                      : isHealthy
                      ? 'text-emerald-400 shrink-0'
                      : 'text-amber-400 shrink-0'
                  }
                />
                <span>ข้อมูลสุขภาพที่ลูกค้าแจ้ง</span>
              </div>
            </div>

            {healthState.loading ? (
              <div className="flex items-center space-x-2 text-xs text-[#B8B0A3] bg-studio-sec/60 border border-studio-border/50 p-2.5 rounded-lg">
                <span className="animate-pulse">กำลังโหลดข้อมูลสุขภาพ...</span>
              </div>
            ) : isHealthUnknown ? (
              <div className="flex items-center space-x-2 text-xs text-[#B8B0A3] bg-studio-sec/60 border border-studio-border/50 p-2.5 rounded-lg">
                <AlertCircle size={15} className="shrink-0 text-[#B8B0A3]" />
                <span>ยังไม่ให้ข้อมูล</span>
              </div>
            ) : isHealthy ? (
              <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                <div>
                  <span className="font-semibold block">สุขภาพปกติ</span>
                  <span className="text-[11px] text-emerald-400/80">ไม่มีโรคประจำตัวและไม่มีประวัติการแพ้</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {/* โรคประจำตัว */}
                {healthState.has_medical_condition ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-studio-primary font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        โรคประจำตัว
                      </span>
                      <span className="inline-flex items-center space-x-1 text-amber-300 bg-amber-500/15 border border-amber-400/40 px-2.5 py-0.5 rounded text-[11px] font-medium">
                        <AlertTriangle size={11} className="shrink-0 text-amber-400" />
                        <span>มีโรคประจำตัว</span>
                      </span>
                    </div>
                    {healthState.medical_condition_note?.trim() ? (
                      <p className="text-xs text-amber-200/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-400/40 whitespace-pre-wrap leading-relaxed">
                        {healthState.medical_condition_note.trim()}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-300 bg-amber-500/5 p-2 rounded-lg border border-amber-400/40 font-light italic">
                        ลูกค้าแจ้งว่ามีโรคประจำตัว (ไม่ได้ระบุรายละเอียด)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-[#B8B0A3]">โรคประจำตัว:</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={12} /> ไม่มี
                    </span>
                  </div>
                )}

                {/* ประวัติการแพ้ */}
                {healthState.has_allergy ? (
                  <div className={`space-y-1.5 ${healthState.has_medical_condition ? 'pt-2.5 border-t border-studio-border/50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-studio-primary font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        ประวัติการแพ้
                      </span>
                      <span className="inline-flex items-center space-x-1 text-amber-300 bg-amber-500/15 border border-amber-400/40 px-2.5 py-0.5 rounded text-[11px] font-medium">
                        <AlertTriangle size={11} className="shrink-0 text-amber-400" />
                        <span>มีประวัติการแพ้</span>
                      </span>
                    </div>
                    {healthState.allergy_note?.trim() ? (
                      <p className="text-xs text-amber-200/90 bg-amber-500/10 p-2.5 rounded-lg border border-amber-400/40 whitespace-pre-wrap leading-relaxed">
                        {healthState.allergy_note.trim()}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-300 bg-amber-500/5 p-2 rounded-lg border border-amber-400/40 font-light italic">
                        ลูกค้าแจ้งว่ามีประวัติการแพ้ (ไม่ได้ระบุรายละเอียด)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className={`flex items-center justify-between text-xs py-0.5 ${healthState.has_medical_condition ? 'pt-2.5 border-t border-studio-border/50' : ''}`}>
                    <span className="text-[#B8B0A3]">ประวัติการแพ้:</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={12} /> ไม่มี
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 4: Tattoo Details & Specs */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
              <Layers size={14} className="text-studio-red-bright" />
              <span>รายละเอียดงานสัก</span>
            </div>
            <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
              {!isArtistView && (
                <div className="flex justify-between items-center pb-2">
                  <span className="text-[#B8B0A3]">ช่างสัก:</span>
                  <span className="text-studio-primary font-medium">{artistDisplay}</span>
                </div>
              )}
              {(booking as any).color_technique && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-[#B8B0A3]">ลักษณะการลงสี:</span>
                  <span className="text-studio-primary font-medium">{getColorTechniqueLabel((booking as any).color_technique)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-[#B8B0A3]">สไตล์ลายสัก (Tattoo Style):</span>
                <span className="text-studio-primary font-medium">{styleDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[#B8B0A3]">ตำแหน่งที่สัก (Placement):</span>
                <span className="text-studio-primary font-medium">{placementDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[#B8B0A3]">ขนาดประมาณ (Size):</span>
                <span className="text-studio-primary font-mono">{sizeDisplay}</span>
              </div>
              {cleanDescription && (
                <div className="py-2 space-y-1">
                  <span className="text-[#B8B0A3] block text-[11px]">รายละเอียดเพิ่มเติม:</span>
                  <p className="text-[#ECE4D3] bg-studio-sec/50 p-2.5 rounded border border-studio-border/60 whitespace-pre-wrap leading-relaxed">
                    {cleanDescription}
                  </p>
                </div>
              )}

            </div>
          </div>

          {/* Section 6: Tattoo Sessions List */}
          {isConfirmedDeposit && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                <Calendar size={14} className="text-studio-red-bright" />
                <span>รอบการสักทั้งหมด ({booking.sessions?.length || 0} รอบ)</span>
              </div>
              <BookingSessionList booking={booking} blockedDates={blockedDates} onRefresh={onRefresh} embedMode={true} />
            </div>
          )}

          {/* Section 7: Reference Images Gallery */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                <ImageIcon size={14} className="text-studio-red-bright" />
                <span>ภาพเรฟเฟอเรนซ์ / แบบลายสัก</span>
              </div>
              <span className="text-[10px] text-[#B8B0A3]">
                {refImages.length} รูป
              </span>
            </div>

            {refImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                {refImages.map((imgUrl: string, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewModal({ src: imgUrl, type: 'reference' })}
                    className="group relative aspect-square bg-studio-sec rounded-lg border border-studio-border overflow-hidden cursor-pointer hover:border-studio-red/60 transition-colors"
                  >
                    <CustomerReferenceImage
                      src={imgUrl}
                      alt={`Reference ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <Maximize2 size={16} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-studio-sec/40 border border-studio-border/50 rounded-lg text-center text-[#B8B0A3] text-xs">
                ไม่มีภาพเรฟเฟอเรนซ์แนบมากับงานนี้
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Complete Booking Modal Dialog */}
      <CompleteBookingDialog
        booking={booking}
        isOpen={isCompleteDialogOpen}
        onClose={() => setIsCompleteDialogOpen(false)}
        onSuccess={onRefresh}
      />

      {/* Create Session Dialog Modal */}
      {isCreatingSession && (
        <CreateSessionDialog
          booking={booking}
          blockedDates={blockedDates}
          existingSessionCount={booking.sessions?.length || 0}
          onSuccess={() => {
            setIsCreatingSession(false);
            onRefresh();
          }}
          onCancel={() => setIsCreatingSession(false)}
        />
      )}

      {/* Reschedule Session Dialog Modal */}
      {reschedulingSession && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <div className="flex items-center space-x-2">
                <Calendar className="text-amber-400" size={16} />
                <h3 className="font-bold text-sm text-studio-primary">
                  เลื่อนคิวนัดหมาย (รอบที่ {reschedulingSession.session_number})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReschedulingSession(null)}
                className="text-[#B8B0A3] hover:text-studio-primary p-1 rounded-lg hover:bg-studio-sec cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {booking.sessions && booking.sessions.length > 1 && (
              <div>
                <label className="block text-[#B8B0A3] mb-1 font-medium">เลือกรอบสักที่ต้องการเลื่อน:</label>
                <select
                  value={reschedulingSession.id}
                  onChange={(e) => {
                    const sel = booking.sessions.find((s) => s.id === e.target.value);
                    if (sel) openRescheduleForSession(sel);
                  }}
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-prompt"
                >
                  {booking.sessions
                    .filter((s) => s.status !== 'CANCELLED')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        รอบที่ {s.session_number} ({s.status === 'COMPLETED' ? 'เสร็จแล้ว' : s.status === 'IN_PROGRESS' ? 'กำลังสัก' : 'นัดหมายแล้ว'})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {rescheduleError && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 rounded-xl flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0 text-red-400" />
                <span>{rescheduleError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteReschedule} className="space-y-3">
              <div>
                <label className="block text-[#B8B0A3] mb-1 font-medium">
                  วันที่นัดหมายใหม่ <span className="text-studio-red">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[#B8B0A3] mb-1 font-medium">
                  เวลาเริ่ม <span className="text-studio-red">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={rescheduleStartTime}
                  onChange={(e) => setRescheduleStartTime(e.target.value)}
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[#B8B0A3] mb-1 font-medium">หมายเหตุการเลื่อนคิว</label>
                <input
                  type="text"
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                  placeholder="ระบุเหตุผลการเลื่อนคิว (ถ้ามี)..."
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-studio-border/60">
                <button
                  type="button"
                  onClick={() => setReschedulingSession(null)}
                  disabled={isSubmittingReschedule}
                  className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-border text-[#B8B0A3] font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReschedule}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center justify-center space-x-1.5 shadow cursor-pointer disabled:opacity-50"
                >
                  <span>{isSubmittingReschedule ? 'กำลังบันทึก...' : 'ยืนยันเลื่อนคิว'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Complete Active Session Modal */}
      {completingSessionModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="text-emerald-400" size={16} />
                <h3 className="font-bold text-sm text-studio-primary">
                  บันทึกจบรอบสัก (รอบที่ {completingSessionModal.session_number})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletingSessionModal(null)}
                className="text-[#B8B0A3] hover:text-studio-primary p-1 rounded-lg hover:bg-studio-sec cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleExecuteCompleteSession} className="space-y-3">
              <div>
                <label className="block text-[#B8B0A3] mb-1 font-medium">
                  หมายเหตุการสักรอบนี้ (ถ้ามี)
                </label>
                <textarea
                  rows={3}
                  value={completingNote}
                  onChange={(e) => setCompletingNote(e.target.value)}
                  placeholder="เช่น เดินเส้นและลงโครงสร้างหลักเรียบร้อยแล้ว..."
                  className="w-full bg-studio-sec border border-studio-border rounded-xl p-2.5 text-studio-primary focus:outline-none focus:border-emerald-400 resize-none font-prompt"
                />
                <p className="text-[10px] text-[#B8B0A3] mt-1">
                  * ข้อความหมายเหตุนี้จะแสดงเฉพาะใต้การ์ดรอบสักรอบที่ {completingSessionModal.session_number} เท่านั้น
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-studio-border/60">
                <button
                  type="button"
                  onClick={() => setCompletingSessionModal(null)}
                  disabled={isCompletingActiveSession}
                  className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-border text-[#B8B0A3] font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isCompletingActiveSession}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center space-x-1.5 shadow cursor-pointer disabled:opacity-50"
                >
                  <span>{isCompletingActiveSession ? 'กำลังบันทึก...' : 'บันทึกจบรอบสัก'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Lightbox Modal for Image / Slip Preview */}
      {previewModal && mounted && createPortal(
        <div
          onClick={() => setPreviewModal(null)}
          className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center p-4 cursor-pointer animate-in fade-in font-prompt"
        >
          <div className="max-w-full max-h-[90vh] overflow-hidden rounded-lg shadow-2xl flex items-center justify-center">
            {previewModal.type === 'reference' ? (
              <CustomerReferenceImage
                src={previewModal.src}
                alt="Reference Image Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <PaymentSlipImage
                src={previewModal.src}
                alt="Payment Slip Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
          <button
            onClick={() => setPreviewModal(null)}
            className="absolute top-4 right-4 text-studio-primary bg-studio-card border border-studio-border p-2.5 rounded-full hover:bg-studio-red transition-colors cursor-pointer shadow-lg"
          >
            <X size={20} />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
