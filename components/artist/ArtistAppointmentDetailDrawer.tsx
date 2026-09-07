import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  X, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Image as ImageIcon, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Play,
  CheckCircle,
  Flag,
  Loader2,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { 
  formatDateBangkok, 
  formatTimeBangkok, 
  getDateStrBangkok,
  getTodayBangkokStr,
  calculateDurationText, 
  getSessionStatusConfig, 
  getBookingStatusConfig 
} from '@/components/admin/calendar/calendarUtils';

export interface ArtistSessionDetail {
  session_id: string;
  session_number: number;
  session_title?: string | null;
  start_at: string;
  end_at: string;
  session_status: string;
  session_notes?: string | null;
  
  // Booking Info
  booking_id: string;
  booking_status: string;
  booking_source?: string | null;
  artwork_title?: string | null;
  artwork_image_url?: string | null;
  placement?: string | null;
  width_cm?: number | null;
  height_cm?: number | null;
  description?: string | null;
  customer_note?: string | null;
  staff_note?: string | null;

  // Customer Info
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  is_age_confirmed?: boolean;

  // Estimate / Tattoo Details
  estimate_request_id?: string | null;
  style?: string | null;
  reference_images?: string[] | null;

  // Multi-session siblings
  all_sessions?: Array<{
    id: string;
    session_number: number;
    start_at: string;
    end_at: string;
    status: string;
    notes?: string | null;
  }>;
}

interface Props {
  session: ArtistSessionDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => Promise<void> | void;
}

export default function ArtistAppointmentDetailDrawer({ session, isOpen, onClose, onRefresh }: Props) {
  const supabase = createClient();
  
  // Local state for current session detail (can be updated on RPC success)
  const [currentSession, setCurrentSession] = useState<ArtistSessionDetail | null>(session);
  
  // Signed URLs for reference images
  const [signedImageUrls, setSignedImageUrls] = useState<{ path: string; url: string }[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Operational Action Modal States
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showCompleteSessionModal, setShowCompleteSessionModal] = useState(false);
  const [showCompleteJobConfirm, setShowCompleteJobConfirm] = useState(false);

  // New Operational Modals for Artist: Reschedule, Cancel, Add Session
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddSessionModal, setShowAddSessionModal] = useState(false);

  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('10:00');
  const [rescheduleEndTime, setRescheduleEndTime] = useState('13:00');
  const [rescheduleNote, setRescheduleNote] = useState('');

  const [cancelReason, setCancelReason] = useState('');

  const [addSessionDate, setAddSessionDate] = useState('');
  const [addSessionStartTime, setAddSessionStartTime] = useState('10:00');
  const [addSessionEndTime, setAddSessionEndTime] = useState('13:00');
  const [addSessionNote, setAddSessionNote] = useState('');
  
  // Action Form / Loading / Error / Toast States
  const [sessionNote, setSessionNote] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [isCompletingBooking, setIsCompletingBooking] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync prop changes
  useEffect(() => {
    setCurrentSession(session);
    setSessionNote(session?.session_notes || '');
    setActionError(null);
    setShowStartConfirm(false);
    setShowCompleteSessionModal(false);
    setShowCompleteJobConfirm(false);
    setShowRescheduleModal(false);
    setShowCancelModal(false);
    setShowAddSessionModal(false);
  }, [session, isOpen]);

  // Temporary toast auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Load signed URLs for reference images
  useEffect(() => {
    if (!currentSession || !isOpen) {
      setSignedImageUrls([]);
      setLightboxIndex(null);
      return;
    }

    const imagesToSign: string[] = [];
    if (currentSession.reference_images && Array.isArray(currentSession.reference_images)) {
      imagesToSign.push(...currentSession.reference_images.filter(Boolean));
    }
    if (currentSession.artwork_image_url && currentSession.artwork_image_url.startsWith('customer-references/')) {
      const cleanPath = currentSession.artwork_image_url.replace('customer-references/', '');
      if (!imagesToSign.includes(cleanPath)) {
        imagesToSign.push(cleanPath);
      }
    }

    if (imagesToSign.length === 0) {
      setSignedImageUrls([]);
      return;
    }

    let isSubscribed = true;
    setLoadingImages(true);

    async function signImages() {
      try {
        const signedList: { path: string; url: string }[] = [];
        for (const imgPath of imagesToSign) {
          if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
            signedList.push({ path: imgPath, url: imgPath });
            continue;
          }
          const { data, error } = await supabase.storage
            .from('customer-references')
            .createSignedUrl(imgPath, 3600);

          if (!error && data?.signedUrl) {
            signedList.push({ path: imgPath, url: data.signedUrl });
          } else {
            console.warn('Failed to sign image:', imgPath, error?.message);
          }
        }
        if (isSubscribed) {
          setSignedImageUrls(signedList);
        }
      } catch (err) {
        console.error('Error signing reference images:', err);
      } finally {
        if (isSubscribed) setLoadingImages(false);
      }
    }

    signImages();

    return () => {
      isSubscribed = false;
    };
  }, [currentSession, isOpen, supabase]);

  // Helper to re-fetch latest session & booking state from Supabase
  const refreshCurrentData = useCallback(async () => {
    if (!currentSession?.booking_id || !currentSession?.session_id) return;
    try {
      // 1. Fetch booking
      const { data: bData } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', currentSession.booking_id)
        .single();

      // 2. Fetch all sessions for this booking
      const { data: sData } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('booking_id', currentSession.booking_id)
        .order('session_number', { ascending: true });

      if (bData && sData) {
        const activeSess = sData.find((s: any) => s.id === currentSession.session_id) || sData[0];
        setCurrentSession((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            booking_status: bData.status,
            session_status: activeSess.status,
            session_notes: activeSess.note || activeSess.notes,
            all_sessions: sData.map((s: any) => ({
              id: s.id,
              session_number: s.session_number,
              start_at: s.start_at,
              end_at: s.end_at,
              status: s.status,
              notes: s.note || s.notes
            }))
          };
        });
      }

      // 3. Trigger parent page refresh
      if (onRefresh) {
        await onRefresh();
      }
    } catch (e) {
      console.error('Failed to refresh session data:', e);
    }
  }, [currentSession?.booking_id, currentSession?.session_id, supabase, onRefresh]);

  // Map PostgreSQL / RPC errors to friendly Thai messages
  const mapErrorMessage = (errorMsg: string): string => {
    if (errorMsg.includes('earlier sessions must be completed')) {
      return 'ต้องจบรอบก่อนหน้าก่อนเริ่มรอบนี้';
    }
    if (errorMsg.includes('another session under this booking is currently IN_PROGRESS') || errorMsg.includes('another session')) {
      return 'มีรอบสักอื่นของงานนี้กำลังดำเนินการอยู่';
    }
    if (errorMsg.includes('parent booking status is') || errorMsg.includes('must be CONFIRMED or IN_PROGRESS')) {
      return 'ยังไม่สามารถเริ่มสักได้ กรุณาตรวจสอบสถานะคิวก่อน';
    }
    if (errorMsg.includes('Unauthorized') || errorMsg.includes('42501')) {
      return 'คุณไม่มีสิทธิ์ดำเนินการกับคิวนี้';
    }
    if (errorMsg.includes('all scheduled or in-progress sessions must be completed')) {
      return 'ต้องจบรอบสักทั้งหมดก่อนจึงจะสามารถจบงานได้';
    }
    if (errorMsg.includes('at least one session must be COMPLETED')) {
      return 'ต้องมีรอบสักที่เสร็จสิ้นแล้วอย่างน้อย 1 รอบ';
    }
    if (errorMsg.includes('terminal status') || errorMsg.includes('cannot be modified')) {
      return 'งานสักนี้ปิดเสร็จสมบูรณ์แล้ว ไม่สามารถแก้ไขได้';
    }
    return 'เกิดข้อผิดพลาดในการดำเนินการ กรุณาลองใหม่อีกครั้ง';
  };

  // ---------------------------------------------------------------------------
  // OPERATIONAL ACTION HANDLERS
  // ---------------------------------------------------------------------------

  // 1. START TATTOO RPC: artist_start_session
  const handleStartSession = async () => {
    if (!currentSession || isStarting) return;
    setIsStarting(true);
    setActionError(null);

    try {
      const { data, error } = await supabase.rpc('artist_start_session', {
        p_session_id: currentSession.session_id
      });

      if (error) {
        setActionError(mapErrorMessage(error.message));
        return;
      }

      // Success (including idempotent already_in_progress = true)
      setShowStartConfirm(false);
      setToastMessage('เริ่มสักแล้ว');
      await refreshCurrentData();
    } catch (err: any) {
      console.error('Exception starting session:', err);
      setActionError('ไม่สามารถเริ่มรอบสักได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsStarting(false);
    }
  };

  // 2. COMPLETE SESSION RPC: artist_complete_session
  const handleCompleteSession = async () => {
    if (!currentSession || isCompletingSession) return;
    setIsCompletingSession(true);
    setActionError(null);

    try {
      const trimmedNote = sessionNote.trim();
      const { data, error } = await supabase.rpc('artist_complete_session', {
        p_session_id: currentSession.session_id,
        p_session_note: trimmedNote !== '' ? trimmedNote : null
      });

      if (error) {
        setActionError(mapErrorMessage(error.message));
        return;
      }

      // Success
      setShowCompleteSessionModal(false);
      setToastMessage('จบรอบสักเรียบร้อยแล้ว');
      await refreshCurrentData();
    } catch (err: any) {
      console.error('Exception completing session:', err);
      setActionError('ไม่สามารถจบรอบสักได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsCompletingSession(false);
    }
  };

  // 3. COMPLETE JOB RPC: artist_complete_booking
  const handleCompleteJob = async () => {
    if (!currentSession || isCompletingBooking) return;
    setIsCompletingBooking(true);
    setActionError(null);

    try {
      const { data, error } = await supabase.rpc('artist_complete_booking', {
        p_booking_id: currentSession.booking_id
      });

      if (error) {
        setActionError(mapErrorMessage(error.message));
        return;
      }

      // Success
      setShowCompleteJobConfirm(false);
      setToastMessage('งานสักเสร็จสิ้นแล้ว');
      await refreshCurrentData();
    } catch (err: any) {
      console.error('Exception completing booking:', err);
      setActionError('ไม่สามารถจบงานสักได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsCompletingBooking(false);
    }
  };

  // 4. RESCHEDULE RPC: artist_reschedule_booking
  const handleRescheduleBooking = async () => {
    if (!currentSession || isSubmittingAction) return;
    setIsSubmittingAction(true);
    setActionError(null);

    try {
      const { data, error } = await supabase.rpc('artist_reschedule_booking', {
        p_booking_id: currentSession.booking_id,
        p_session_id: currentSession.session_id,
        p_new_date: rescheduleDate,
        p_new_start_time: rescheduleStartTime,
        p_new_end_time: rescheduleEndTime,
        p_note: rescheduleNote.trim() || null
      });

      if (error) {
        setActionError(mapErrorMessage(error.message));
        return;
      }

      setShowRescheduleModal(false);
      setToastMessage('เลื่อนคิวเรียบร้อยแล้ว');
      await refreshCurrentData();
    } catch (err: any) {
      console.error('Exception rescheduling booking:', err);
      setActionError('ไม่สามารถเลื่อนคิวได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 5. CANCEL BOOKING RPC: artist_cancel_booking
  const handleCancelBooking = async () => {
    if (!currentSession || isSubmittingAction) return;
    setIsSubmittingAction(true);
    setActionError(null);

    try {
      const { data, error } = await supabase.rpc('artist_cancel_booking', {
        p_booking_id: currentSession.booking_id,
        p_cancellation_reason: cancelReason.trim() || null
      });

      if (error) {
        setActionError(mapErrorMessage(error.message));
        return;
      }

      setShowCancelModal(false);
      setToastMessage('ยกเลิกคิวเรียบร้อยแล้ว');
      await refreshCurrentData();
    } catch (err: any) {
      console.error('Exception cancelling booking:', err);
      setActionError('ไม่สามารถยกเลิกคิวได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 6. ADD SESSION RPC: artist_add_session
  const handleAddSession = async () => {
    if (!currentSession || isSubmittingAction) return;
    setIsSubmittingAction(true);
    setActionError(null);

    try {
      const { data, error } = await supabase.rpc('artist_add_session', {
        p_booking_id: currentSession.booking_id,
        p_appointment_date: addSessionDate,
        p_start_time: addSessionStartTime,
        p_end_time: addSessionEndTime,
        p_note: addSessionNote.trim() || null
      });

      if (error) {
        setActionError(mapErrorMessage(error.message));
        return;
      }

      setShowAddSessionModal(false);
      setToastMessage('เพิ่มรอบสักใหม่เรียบร้อยแล้ว');
      await refreshCurrentData();
    } catch (err: any) {
      console.error('Exception adding session:', err);
      setActionError('ไม่สามารถเพิ่มรอบสักได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  if (!isOpen || !currentSession) return null;

  const sessionStatusConfig = getSessionStatusConfig(currentSession.session_status as any);
  const bookingStatusConfig = getBookingStatusConfig(currentSession.booking_status as any);
  const allSessionsList = currentSession.all_sessions || [];
  const totalSessions = allSessionsList.length || 1;

  // Sibling Session State Metrics
  const completedSessionsCount = allSessionsList.filter((s) => s.status === 'COMPLETED').length;
  const scheduledSessionsCount = allSessionsList.filter((s) => s.status === 'SCHEDULED').length;
  const inProgressSessionsCount = allSessionsList.filter((s) => s.status === 'IN_PROGRESS').length;
  const nextScheduledSession = allSessionsList.find((s) => s.status === 'SCHEDULED');
  const hasOtherInProgress = allSessionsList.some(
    (s) => s.id !== currentSession.session_id && s.status === 'IN_PROGRESS'
  );

  // Operational Action Visibility Rules
  const isBookingWaitingDeposit = currentSession.booking_status === 'WAITING_DEPOSIT';
  const isBookingConfirmedOrInProgress =
    currentSession.booking_status === 'CONFIRMED' || currentSession.booking_status === 'IN_PROGRESS';
  
  // Can Start Session: Target session is SCHEDULED, parent booking is CONFIRMED or IN_PROGRESS
  const canStartTattoo =
    currentSession.session_status === 'SCHEDULED' && isBookingConfirmedOrInProgress && !isBookingWaitingDeposit;

  // Can Complete Session: Target session is IN_PROGRESS, parent booking is IN_PROGRESS
  const canCompleteSession =
    currentSession.session_status === 'IN_PROGRESS' && currentSession.booking_status === 'IN_PROGRESS';

  // Can Complete Job: Parent booking is IN_PROGRESS, at least 1 session COMPLETED, and 0 SCHEDULED/IN_PROGRESS
  const canCompleteJob =
    currentSession.booking_status === 'IN_PROGRESS' &&
    completedSessionsCount > 0 &&
    scheduledSessionsCount === 0 &&
    inProgressSessionsCount === 0;

  const isJobCompleted = currentSession.booking_status === 'COMPLETED';
  const isCancelled =
    currentSession.booking_status === 'CANCELLED' ||
    currentSession.booking_status === 'REJECTED' ||
    currentSession.session_status === 'CANCELLED';

  // Derive simple deposit / payment badge strictly from booking status (No financial amounts)
  const getDepositStateDisplay = (status: string) => {
    switch (status) {
      case 'WAITING_DEPOSIT':
        return { label: 'รอมัดจำ', text: 'text-amber-400', bg: 'bg-amber-950/40', border: 'border-amber-800/40' };
      case 'CONFIRMED':
        return { label: 'มัดจำเรียบร้อย (ยืนยันคิวแล้ว)', text: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800/40' };
      case 'IN_PROGRESS':
        return { label: 'มัดจำเรียบร้อย (กำลังสัก)', text: 'text-studio-primary', bg: 'bg-studio-red/20', border: 'border-studio-red/40' };
      case 'COMPLETED':
        return { label: 'เสร็จสมบูรณ์', text: 'text-emerald-400', bg: 'bg-emerald-950/40', border: 'border-emerald-800/40' };
      case 'CANCELLED':
      case 'REJECTED':
        return { label: 'ยกเลิก', text: 'text-red-400', bg: 'bg-red-950/40', border: 'border-red-800/40' };
      default:
        return { label: 'รอยืนยัน', text: 'text-yellow-400', bg: 'bg-yellow-950/40', border: 'border-yellow-800/40' };
    }
  };

  const depositState = getDepositStateDisplay(currentSession.booking_status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end font-prompt bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative w-full max-w-lg bg-studio-card border-l border-studio-border h-full flex flex-col shadow-2xl z-10 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between bg-studio-card/95">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-mono font-bold text-studio-secondary bg-studio-sec px-2 py-1 rounded border border-studio-border">
              รอบที่ {currentSession.session_number} {totalSessions > 1 ? `/ ${totalSessions}` : ''}
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border ${sessionStatusConfig.badgeBg} ${sessionStatusConfig.badgeText} ${sessionStatusConfig.border}`}>
              {sessionStatusConfig.label}
            </span>
            {currentSession.booking_status === 'COMPLETED' && (
              <span className="text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full font-medium">
                งานเสร็จสิ้น
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-secondary hover:text-studio-primary hover:bg-studio-sec border border-studio-border transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

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

        {/* Action Success Toast */}
        {toastMessage && (
          <div className="mx-4 mt-3 p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-200 rounded-lg text-xs flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            <span className="flex-1 font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-32 md:pb-24 text-xs">
          {/* Section 1: Date & Time Card */}
          <div className="bg-studio-sec/80 border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
              <Calendar size={14} className="text-studio-red" />
              <span>วันและเวลานัดหมาย (Bangkok Time)</span>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-studio-muted text-[10px] block">วันที่</span>
                <span className="text-sm font-semibold text-studio-primary">
                  {formatDateBangkok(currentSession.start_at, true)}
                </span>
              </div>
              <div>
                <span className="text-studio-muted text-[10px] block">เวลาสัก</span>
                <span className="text-sm font-semibold text-studio-primary font-mono flex items-center space-x-1">
                  <Clock size={13} className="text-studio-secondary inline mr-1" />
                  {formatTimeBangkok(currentSession.start_at)} - {formatTimeBangkok(currentSession.end_at)}
                </span>
                <span className="text-[10px] text-studio-secondary block mt-0.5">
                  ({calculateDurationText(currentSession.start_at, currentSession.end_at)})
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Operational Action Panel (Prominent) */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                การดำเนินการรอบสัก (Artist Actions)
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sessionStatusConfig.badgeBg} ${sessionStatusConfig.badgeText} ${sessionStatusConfig.border} font-mono`}>
                {sessionStatusConfig.label}
              </span>
            </div>

            {/* CASE 1: Can Start Tattoo */}
            {canStartTattoo && (
              <div className="pt-1 space-y-2">
                <p className="text-studio-muted text-[11px] leading-relaxed">
                  เมื่อลูกค้ามาถึงและพร้อมเริ่มงานสัก สามารถกดปุ่มเพื่อเริ่มบันทึกเวลาการสักได้ทันที
                </p>
                <button
                  onClick={() => {
                    setActionError(null);
                    setShowStartConfirm(true);
                  }}
                  disabled={isStarting || hasOtherInProgress}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold flex items-center justify-center space-x-2 text-sm transition-all shadow-md cursor-pointer ${
                    hasOtherInProgress
                      ? 'bg-studio-sec border border-studio-border text-studio-muted cursor-not-allowed'
                      : 'bg-studio-red hover:bg-red-700 text-white active:scale-[0.99]'
                  }`}
                >
                  <Play size={16} className="fill-current" />
                  <span>เริ่มสัก (Start Tattoo)</span>
                </button>
                {hasOtherInProgress && (
                  <p className="text-[11px] text-amber-400">
                    * มีรอบสักอื่นของงานนี้กำลังดำเนินการอยู่ กรุณาจบรอบดังกล่าวก่อน
                  </p>
                )}
              </div>
            )}

            {/* CASE 2: Can Complete Active Session */}
            {canCompleteSession && (
              <div className="pt-1 space-y-2">
                <div className="p-2.5 bg-studio-red/10 border border-studio-red/30 rounded-lg text-[11px] text-studio-primary flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-studio-red animate-ping" />
                  <span className="font-medium">รอบสักนี้กำลังดำเนินการอยู่ (In Progress)</span>
                </div>
                <button
                  onClick={() => {
                    setActionError(null);
                    setShowCompleteSessionModal(true);
                  }}
                  disabled={isCompletingSession}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 text-sm transition-all shadow-md cursor-pointer active:scale-[0.99]"
                >
                  <CheckCircle size={16} />
                  <span>จบรอบสัก (Complete Session)</span>
                </button>
              </div>
            )}

            {/* CASE 3: Session Completed & Another Scheduled Round Exists */}
            {currentSession.session_status === 'COMPLETED' && scheduledSessionsCount > 0 && (
              <div className="pt-1 space-y-2.5">
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg space-y-1.5">
                  <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
                    <CheckCircle2 size={14} />
                    <span>รอบสักที่ {currentSession.session_number} เสร็จสิ้นแล้ว</span>
                  </div>
                  {nextScheduledSession && (
                    <div className="text-[11px] text-studio-secondary pt-1 border-t border-emerald-900/40">
                      <span className="text-studio-muted block">รอบถัดไป:</span>
                      <span className="font-semibold text-studio-primary">
                        รอบที่ {nextScheduledSession.session_number}: {formatDateBangkok(nextScheduledSession.start_at)} ({formatTimeBangkok(nextScheduledSession.start_at)} - {formatTimeBangkok(nextScheduledSession.end_at)})
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-studio-muted">
                  * หากต้องการเพิ่มรอบสักใหม่นอกเหนือจากในตาราง กรุณาแจ้งเจ้าของร้านเพื่อจัดตารางรอบถัดไป
                </p>
              </div>
            )}

            {/* CASE 4: Final Session Completed -> Can Complete Job */}
            {canCompleteJob && (
              <div className="pt-1 space-y-3">
                <div className="p-3 bg-studio-sec/80 border border-studio-border rounded-lg space-y-1">
                  <div className="flex items-center space-x-2 text-studio-primary font-semibold text-xs">
                    <Flag size={14} className="text-emerald-400" />
                    <span>รอบสักทั้งหมดที่มีในตารางเสร็จแล้ว</span>
                  </div>
                  <p className="text-[11px] text-studio-muted leading-relaxed">
                    งานสักทั้งหมดเสร็จสมบูรณ์แล้วหรือไม่? หากเสร็จสิ้นแล้ว สามารถกดปุ่มเพื่อปิดงานได้ทันที
                  </p>
                </div>
                <button
                  onClick={() => {
                    setActionError(null);
                    setShowCompleteJobConfirm(true);
                  }}
                  disabled={isCompletingBooking}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 text-sm transition-all shadow-md cursor-pointer active:scale-[0.99]"
                >
                  <CheckCircle2 size={16} />
                  <span>จบงานทั้งหมด (Complete Job)</span>
                </button>
                <div className="p-2.5 bg-studio-sec/40 border border-studio-border/60 rounded-lg text-[11px] text-studio-secondary">
                  <span>หากต้องมีรอบสักเพิ่มเติม กรุณาอย่าเพิ่งจบงาน และแจ้งเจ้าของร้านเพื่อจัดตารางรอบถัดไป</span>
                </div>
              </div>
            )}

            {/* CASE 5: Job Completed (Read-Only) */}
            {isJobCompleted && (
              <div className="p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-lg flex items-center space-x-2 text-emerald-400 font-medium text-xs">
                <CheckCircle2 size={15} />
                <span>งานสักนี้เสร็จสมบูรณ์เรียบร้อยแล้ว (Completed)</span>
              </div>
            )}

            {/* CASE 6: Waiting Deposit */}
            {isBookingWaitingDeposit && (
              <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-[11px] text-amber-200/90 leading-relaxed">
                <span>รอมัดจำ: ยังไม่สามารถเริ่มงานได้จนกว่าคิวจะได้รับการยืนยันการชำระมัดจำจากทางร้าน</span>
              </div>
            )}

            {/* CASE 7: Cancelled */}
            {isCancelled && (
              <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-lg text-[11px] text-red-300">
                <span>คิวนี้ถูกยกเลิกแล้ว (Cancelled)</span>
              </div>
            )}

            {/* ARTIST EXTRA OPERATIONS: Reschedule, Add Session, Cancel Booking */}
            {!isCancelled && !isJobCompleted && (
              <div className="pt-3 border-t border-studio-border/60 grid grid-cols-3 gap-2">
                {currentSession.session_status === 'SCHEDULED' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRescheduleDate(getDateStrBangkok(currentSession.start_at));
                      setRescheduleStartTime(formatTimeBangkok(currentSession.start_at));
                      setRescheduleEndTime(formatTimeBangkok(currentSession.end_at));
                      setRescheduleNote('');
                      setShowRescheduleModal(true);
                    }}
                    className="py-2 px-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border rounded-xl font-medium text-[11px] transition-colors cursor-pointer text-center"
                  >
                    เลื่อนคิว
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAddSessionDate(getTodayBangkokStr());
                    setAddSessionStartTime('10:00');
                    setAddSessionEndTime('13:00');
                    setAddSessionNote('');
                    setShowAddSessionModal(true);
                  }}
                  className="py-2 px-2.5 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border rounded-xl font-medium text-[11px] transition-colors cursor-pointer text-center"
                >
                  เพิ่มรอบสัก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCancelReason('');
                    setShowCancelModal(true);
                  }}
                  className="py-2 px-2.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 rounded-xl font-medium text-[11px] transition-colors cursor-pointer text-center"
                >
                  ยกเลิกคิว
                </button>
              </div>
            )}
          </div>

          {/* Section 3: Customer Information */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
              <User size={14} className="text-studio-red" />
              <span>ข้อมูลลูกค้า</span>
            </div>
            <div className="space-y-2.5 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-studio-muted">ชื่อลูกค้า:</span>
                <span className="text-studio-primary font-medium">{currentSession.customer_name || 'ลูกค้า (ไม่ระบุชื่อ)'}</span>
              </div>
              {currentSession.customer_phone && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">เบอร์โทรศัพท์:</span>
                  <a
                    href={`tel:${currentSession.customer_phone}`}
                    className="flex items-center space-x-1.5 text-emerald-400 hover:text-emerald-300 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded transition-colors"
                  >
                    <Phone size={12} />
                    <span>{currentSession.customer_phone}</span>
                  </a>
                </div>
              )}
              <div className="flex justify-between items-center pt-2">
                <span className="text-studio-muted">ยืนยันเงื่อนไขก่อนรับบริการ:</span>
                {currentSession.is_age_confirmed ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                    <CheckCircle2 size={12} />
                    <span>✓ ยืนยันแล้ว</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                    <span>ยังไม่ยืนยัน</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Tattoo Details & Specs */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
              <Layers size={14} className="text-studio-red" />
              <span>รายละเอียดงานสัก</span>
            </div>
            <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-studio-muted">ชื่องาน / รูปแบบ:</span>
                <span className="text-studio-primary font-medium text-right">
                  {currentSession.artwork_title || currentSession.style || 'งานสัก Custom'}
                </span>
              </div>
              {currentSession.style && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">สไตล์ลายสัก:</span>
                  <span className="text-studio-primary">{currentSession.style}</span>
                </div>
              )}
              {currentSession.placement && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">ตำแหน่งที่สัก:</span>
                  <span className="text-studio-primary font-medium">{currentSession.placement}</span>
                </div>
              )}
              {(currentSession.width_cm || currentSession.height_cm) && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">ขนาดประมาณ:</span>
                  <span className="text-studio-primary font-mono">
                    {currentSession.width_cm || '-'} x {currentSession.height_cm || '-'} ซม.
                  </span>
                </div>
              )}
              {currentSession.description && (
                <div className="py-2 space-y-1">
                  <span className="text-studio-muted block text-[11px]">รายละเอียดเพิ่มเติม:</span>
                  <p className="text-studio-secondary bg-studio-sec/50 p-2.5 rounded border border-studio-border/60 whitespace-pre-wrap leading-relaxed">
                    {currentSession.description}
                  </p>
                </div>
              )}
              {currentSession.customer_note && (
                <div className="py-2 space-y-1">
                  <span className="text-studio-muted block text-[11px]">บันทึกจากลูกค้า:</span>
                  <p className="text-studio-secondary bg-studio-sec/50 p-2.5 rounded border border-studio-border/60 whitespace-pre-wrap leading-relaxed">
                    {currentSession.customer_note}
                  </p>
                </div>
              )}
              {currentSession.session_notes && (
                <div className="py-2 space-y-1">
                  <span className="text-studio-muted block text-[11px]">บันทึกประจำรอบนี้:</span>
                  <p className="text-amber-200/90 bg-amber-950/20 p-2.5 rounded border border-amber-800/40 whitespace-pre-wrap leading-relaxed">
                    {currentSession.session_notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Booking & Deposit State (Read-only status) */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                สถานะการจอง & มัดจำ
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full border ${depositState.bg} ${depositState.text} ${depositState.border} font-medium`}>
                {depositState.label}
              </span>
            </div>
            <p className="text-[11px] text-studio-muted leading-relaxed">
              * ข้อมูลการชำระเงินและสลิปได้รับการตรวจสอบโดยผู้จัดการร้าน/แอดมิน ช่างสามารถตรวจสอบคิวนัดเพื่อเตรียมงานได้ทันที
            </p>
          </div>

          {/* Section 6: Multi-session List */}
          {allSessionsList.length > 1 && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                <Calendar size={14} className="text-studio-red" />
                <span>รอบการสักทั้งหมด ({allSessionsList.length} รอบ)</span>
              </div>
              <div className="space-y-2 pt-1">
                {allSessionsList.map((s) => {
                  const isCurrent = s.id === currentSession.session_id;
                  const sConf = getSessionStatusConfig(s.status as any);
                  return (
                    <div
                      key={s.id}
                      className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${
                        isCurrent
                          ? 'bg-studio-red/10 border-studio-red/50 ring-1 ring-studio-red/30'
                          : 'bg-studio-sec/60 border-studio-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-studio-primary">
                            รอบที่ {s.session_number}
                          </span>
                          {isCurrent && (
                            <span className="text-[9px] bg-studio-red text-white px-1.5 py-0.2 rounded uppercase font-bold">
                              รอบปัจจุบัน
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${sConf.badgeBg} ${sConf.badgeText} ${sConf.border}`}>
                          {sConf.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-studio-secondary block font-mono">
                        {formatDateBangkok(s.start_at)} ({formatTimeBangkok(s.start_at)} - {formatTimeBangkok(s.end_at)})
                      </span>
                      {s.notes && (
                        <div className="text-[10px] text-amber-300/80 bg-black/20 p-1.5 rounded border border-studio-border/40">
                          บันทึก: {s.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 7: Reference Images Gallery */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                <ImageIcon size={14} className="text-studio-red" />
                <span>ภาพเรฟเฟอเรนซ์ / แบบลายสัก</span>
              </div>
              <span className="text-[10px] text-studio-muted">
                {signedImageUrls.length} รูป
              </span>
            </div>

            {loadingImages ? (
              <div className="p-6 text-center text-studio-secondary animate-pulse">
                กำลังโหลดภาพเรฟเฟอเรนซ์...
              </div>
            ) : signedImageUrls.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                {signedImageUrls.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className="group relative aspect-square bg-studio-sec rounded-lg border border-studio-border overflow-hidden cursor-pointer hover:border-studio-red/60 transition-colors"
                  >
                    <img
                      src={item.url}
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
              <div className="p-4 bg-studio-sec/40 border border-studio-border/50 rounded-lg text-center text-studio-muted text-xs">
                ไม่มีภาพเรฟเฟอเรนซ์แนบมากับงานนี้
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 1. START TATTOO CONFIRMATION MODAL */}
      {/* --------------------------------------------------------------------- */}
      {showStartConfirm && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 text-studio-primary font-bold text-base">
              <Play size={18} className="text-studio-red fill-current" />
              <span>เริ่มรอบสักนี้?</span>
            </div>
            
            <div className="bg-studio-sec/80 border border-studio-border/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-studio-muted">ลูกค้า:</span>
                <span className="font-semibold text-studio-primary">{currentSession.customer_name || 'ลูกค้าประจำ'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-studio-muted">รอบที่:</span>
                <span className="font-mono font-semibold text-studio-primary">รอบที่ {currentSession.session_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-studio-muted">เวลานัด:</span>
                <span className="font-mono text-studio-secondary">
                  {formatTimeBangkok(currentSession.start_at)} - {formatTimeBangkok(currentSession.end_at)}
                </span>
              </div>
            </div>

            <p className="text-xs text-studio-secondary leading-relaxed">
              เมื่อเริ่มแล้ว สถานะคิวจะเปลี่ยนเป็น <span className="text-studio-primary font-semibold">“กำลังสัก”</span> และบันทึกเวลาเริ่มงาน
            </p>

            {actionError && (
              <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-200 rounded-lg text-xs flex items-center space-x-1.5">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowStartConfirm(false);
                  setActionError(null);
                }}
                disabled={isStarting}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium text-xs transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleStartSession}
                disabled={isStarting}
                className="w-full py-2.5 px-3 rounded-xl bg-studio-red hover:bg-red-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow"
              >
                {isStarting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>กำลังเริ่ม...</span>
                  </>
                ) : (
                  <span>เริ่มสัก</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 2. COMPLETE SESSION MODAL (with optional note) */}
      {/* --------------------------------------------------------------------- */}
      {showCompleteSessionModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 text-studio-primary font-bold text-base">
              <CheckCircle size={18} className="text-emerald-400" />
              <span>จบรอบสักครั้งที่ {currentSession.session_number}</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-medium text-studio-secondary">
                <label className="flex items-center space-x-1.5">
                  <MessageSquare size={13} className="text-studio-muted" />
                  <span>บันทึกรอบสัก (ไม่บังคับ)</span>
                </label>
                <span className="text-[10px] text-studio-muted font-mono">
                  {sessionNote.length}/1000
                </span>
              </div>
              <textarea
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
                maxLength={1000}
                placeholder="เช่น รอบแรกเสร็จแล้ว นัดเก็บรายละเอียดรอบถัดไป"
                rows={3}
                className="w-full p-3 bg-studio-sec border border-studio-border rounded-xl text-xs text-studio-primary placeholder:text-studio-muted focus:outline-none focus:border-studio-red transition-colors resize-none"
              />
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-200 rounded-lg text-xs flex items-center space-x-1.5">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteSessionModal(false);
                  setActionError(null);
                }}
                disabled={isCompletingSession}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium text-xs transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCompleteSession}
                disabled={isCompletingSession}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow"
              >
                {isCompletingSession ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <span>ยืนยันจบรอบสัก</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3. COMPLETE JOB CONFIRMATION DIALOG */}
      {/* --------------------------------------------------------------------- */}
      {showCompleteJobConfirm && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 text-studio-primary font-bold text-base">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>ยืนยันจบงานสักทั้งหมด?</span>
            </div>

            <p className="text-xs text-studio-secondary leading-relaxed bg-studio-sec/80 p-3 rounded-xl border border-studio-border/80">
              การดำเนินการนี้จะปิดงานนี้เป็นเสร็จสิ้น หากยังต้องมีรอบสักเพิ่มเติม กรุณาอย่าจบงาน และแจ้งเจ้าของร้านเพื่อเพิ่มรอบนัดหมาย
            </p>

            {actionError && (
              <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-200 rounded-lg text-xs flex items-center space-x-1.5">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteJobConfirm(false);
                  setActionError(null);
                }}
                disabled={isCompletingBooking}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium text-xs transition-colors cursor-pointer"
              >
                ยังไม่จบงาน
              </button>
              <button
                type="button"
                onClick={handleCompleteJob}
                disabled={isCompletingBooking}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shadow"
              >
                {isCompletingBooking ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>กำลังจบงาน...</span>
                  </>
                ) : (
                  <span>ยืนยันจบงาน</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. RESCHEDULE MODAL */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-studio-primary">เลื่อนคิวนัดหมาย (รอบที่ {currentSession.session_number})</h3>
              <button onClick={() => setShowRescheduleModal(false)} className="text-studio-secondary hover:text-white">
                <X size={16} />
              </button>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-200 rounded-lg flex items-center space-x-1.5">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-studio-secondary mb-1">วันที่นัดใหม่ *</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-studio-secondary mb-1">เวลาเริ่ม *</label>
                  <input
                    type="time"
                    value={rescheduleStartTime}
                    onChange={(e) => setRescheduleStartTime(e.target.value)}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
                  />
                </div>
                <div>
                  <label className="block text-studio-secondary mb-1">เวลาสิ้นสุด *</label>
                  <input
                    type="time"
                    value={rescheduleEndTime}
                    onChange={(e) => setRescheduleEndTime(e.target.value)}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
                  />
                </div>
              </div>

              <div>
                <label className="block text-studio-secondary mb-1">หมายเหตุการเลื่อนคิว</label>
                <input
                  type="text"
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                  placeholder="ระบุเหตุผล หรือรายละเอียด..."
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-studio-border">
              <button
                type="button"
                onClick={() => setShowRescheduleModal(false)}
                disabled={isSubmittingAction}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleRescheduleBooking}
                disabled={isSubmittingAction}
                className="w-full py-2.5 px-3 rounded-xl bg-studio-red hover:bg-red-700 text-white font-semibold flex items-center justify-center space-x-1.5 shadow"
              >
                {isSubmittingAction ? 'กำลังบันทึก...' : 'ยืนยันเลื่อนคิว'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD SESSION MODAL */}
      {showAddSessionModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-studio-primary">เพิ่มรอบการสักใหม่</h3>
              <button onClick={() => setShowAddSessionModal(false)} className="text-studio-secondary hover:text-white">
                <X size={16} />
              </button>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-200 rounded-lg flex items-center space-x-1.5">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-studio-secondary mb-1">วันที่นัดหมาย *</label>
                <input
                  type="date"
                  value={addSessionDate}
                  onChange={(e) => setAddSessionDate(e.target.value)}
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-studio-secondary mb-1">เวลาเริ่ม *</label>
                  <input
                    type="time"
                    value={addSessionStartTime}
                    onChange={(e) => setAddSessionStartTime(e.target.value)}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
                  />
                </div>
                <div>
                  <label className="block text-studio-secondary mb-1">เวลาสิ้นสุด *</label>
                  <input
                    type="time"
                    value={addSessionEndTime}
                    onChange={(e) => setAddSessionEndTime(e.target.value)}
                    className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
                  />
                </div>
              </div>

              <div>
                <label className="block text-studio-secondary mb-1">หมายเหตุสำหรับรอบนี้</label>
                <input
                  type="text"
                  value={addSessionNote}
                  onChange={(e) => setAddSessionNote(e.target.value)}
                  placeholder="เช่น สักเก็บงาน, ลงสี..."
                  className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-studio-border">
              <button
                type="button"
                onClick={() => setShowAddSessionModal(false)}
                disabled={isSubmittingAction}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleAddSession}
                disabled={isSubmittingAction}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center space-x-1.5 shadow"
              >
                {isSubmittingAction ? 'กำลังบันทึก...' : 'เพิ่มรอบสัก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CANCEL BOOKING MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-studio-primary">ยกเลิกคิวนัดหมาย</h3>
              <button onClick={() => setShowCancelModal(false)} className="text-studio-secondary hover:text-white">
                <X size={16} />
              </button>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-200 rounded-lg flex items-center space-x-1.5">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div>
              <label className="block text-studio-secondary mb-1">เหตุผลการยกเลิก</label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="ระบุเหตุผลการยกเลิกคิว..."
                className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-studio-border">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                disabled={isSubmittingAction}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCancelBooking}
                disabled={isSubmittingAction}
                className="w-full py-2.5 px-3 rounded-xl bg-red-800 hover:bg-red-900 text-white font-semibold flex items-center justify-center space-x-1.5 shadow"
              >
                {isSubmittingAction ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกคิว'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && signedImageUrls[lightboxIndex] && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="absolute top-4 right-4 flex items-center space-x-3">
            <span className="text-xs text-studio-secondary font-mono">
              {lightboxIndex + 1} / {signedImageUrls.length}
            </span>
            <button
              onClick={() => setLightboxIndex(null)}
              className="p-2 rounded-full bg-studio-card/80 text-white hover:bg-studio-red transition-colors border border-studio-border"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Controls */}
          {signedImageUrls.length > 1 && (
            <>
              <button
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : signedImageUrls.length - 1))}
                className="absolute left-4 p-2 rounded-full bg-studio-card/80 text-white hover:bg-studio-red transition-colors border border-studio-border"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={() => setLightboxIndex((prev) => (prev !== null && prev < signedImageUrls.length - 1 ? prev + 1 : 0))}
                className="absolute right-4 p-2 rounded-full bg-studio-card/80 text-white hover:bg-studio-red transition-colors border border-studio-border"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          <div className="max-w-4xl max-h-[80vh] flex items-center justify-center p-2">
            <img
              src={signedImageUrls[lightboxIndex].url}
              alt="Full Preview"
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl border border-studio-border"
            />
          </div>
        </div>
      )}
    </div>
  );
}
