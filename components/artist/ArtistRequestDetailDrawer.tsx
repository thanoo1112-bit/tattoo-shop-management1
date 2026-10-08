'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { formatTattooSize } from '@/lib/utils/formatters';
import { calculateBlockingEndTime } from '@/lib/utils/tattooDuration';
import { 
  X, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  Image as ImageIcon, 
  Layers, 
  FileText, 
  Clock, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { formatDateBangkok } from '@/components/admin/calendar/calendarUtils';
import { parseNoteWithPreferredTime, extractHHMM, getInitialStartTime } from '@/lib/noteUtils';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { formatCustomerAgeDisplay } from '@/lib/customerUtils';
import { useApp } from '@/components/AppContext';
import EstimateQuoteForm from '@/components/admin/requests/EstimateQuoteForm';
import { BlockedDateRecord, checkDateAvailability } from '@/lib/availabilityUtils';

export interface ArtistPendingEstimateDetail {
  id: string;
  customer_user_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_dob?: string | null;
  date_of_birth?: string | null;
  artist_id?: string | null;
  artist_name?: string | null;
  placement?: string | null;
  description?: string | null;
  width_cm?: number | null;
  height_cm?: number | null;
  style_preference?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  reference_images?: string[] | null;
  flash_image_url?: string | null;
  flash_title?: string | null;
  flash_style?: string | null;
  flash_size_label?: string | null;
  has_medical_condition?: boolean;
  medical_condition_note?: string | null;
  has_allergy?: boolean;
  allergy_note?: string | null;
  proposed_date?: string | null;
  proposed_time?: string | null;
  proposed_price?: number | null;
  proposed_artist_note?: string | null;
  is_date_proposed?: boolean;
  quoted_price?: number | null;
  status: string;
  created_at?: string | null;
  is_age_confirmed?: boolean;
  is_flash?: boolean;
  item_type?: string;
  sourceType?: 'CUSTOM' | 'FLASH';
}

interface Props {
  estimate: ArtistPendingEstimateDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ArtistRequestDetailDrawer({ estimate, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const { staffArtistId } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [blockedDates, setBlockedDates] = useState<BlockedDateRecord[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    async function loadBlockedDates() {
      try {
        const { data } = await supabase.from('artist_blocked_dates').select('*');
        if (data) setBlockedDates(data as BlockedDateRecord[]);
      } catch (err) {
        console.error('Error fetching blocked dates in ArtistRequestDetailDrawer:', err);
      }
    }
    loadBlockedDates();
  }, [isOpen]);

  const [signedImageUrls, setSignedImageUrls] = useState<{ path: string; url: string }[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showFlashLightbox, setShowFlashLightbox] = useState(false);

  // Secure Customer Confirmation Resolution State
  const [confirmationState, setConfirmationState] = useState<'loading' | 'confirmed' | 'not_confirmed' | 'error'>('loading');

  useEffect(() => {
    if (!estimate) {
      setConfirmationState('not_confirmed');
      return;
    }

    if (estimate.is_age_confirmed === true) {
      setConfirmationState('confirmed');
      return;
    }

    const customerUserId = estimate.customer_user_id;
    if (!customerUserId) {
      setConfirmationState('not_confirmed');
      return;
    }

    let isMounted = true;
    setConfirmationState('loading');

    async function fetchConfirmation() {
      try {
        const { data, error } = await supabase.rpc('artist_get_customer_confirmation', {
          p_customer_user_id: customerUserId
        });

        if (!isMounted) return;

        if (error) {
          console.error('Error in artist_get_customer_confirmation RPC:', error);
          setConfirmationState('error');
          return;
        }

        const res = Array.isArray(data) ? data[0] : data;
        if (res && res.is_confirmed !== undefined) {
          setConfirmationState(res.is_confirmed ? 'confirmed' : 'not_confirmed');
        } else if (res && res.is_confirmed === null) {
          setConfirmationState('not_confirmed');
        } else {
          // If 0 rows returned (e.g. denied or not found)
          setConfirmationState('not_confirmed');
        }
      } catch (err) {
        console.error('Confirmation fetch exception:', err);
        if (isMounted) setConfirmationState('error');
      }
    }

    fetchConfirmation();

    return () => {
      isMounted = false;
    };
  }, [estimate]);

  // Accept / Reject Modal State
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const [rejectReason, setRejectReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPending = estimate?.status === 'PENDING';

  const resetRejectState = () => {
    setRejectReason('');
  };

  const handleConfirmReject = async () => {
    if (!estimate) return;
    if (!rejectReason.trim()) {
      setErrorMsg('กรุณาระบุเหตุผลในการปฏิเสธ');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      if ((estimate as any).is_flash || (estimate as any).item_type === 'FLASH' || (estimate as any).sourceType === 'FLASH') {
        const { data, error } = await supabase.rpc('admin_process_flash_reservation', {
          p_reservation_id: estimate.id,
          p_action: 'REJECT',
          p_admin_note: rejectReason.trim(),
        });

        if (error || !data?.success) {
          setErrorMsg(error?.message || data?.error || 'เกิดข้อผิดพลาดในการปฏิเสธงาน');
        } else {
          resetRejectState();
          setShowRejectModal(false);
          if (onSuccess) onSuccess();
          onClose();
        }
      } else {
        const { data, error } = await supabase.rpc('artist_reject_booking_request', {
          p_estimate_request_id: estimate.id,
          p_rejection_reason: rejectReason.trim(),
        });

        if (error || !data?.success) {
          setErrorMsg(error?.message || data?.error || 'เกิดข้อผิดพลาดในการปฏิเสธงาน');
        } else {
          resetRejectState();
          setShowRejectModal(false);
          if (onSuccess) onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธงาน');
    } finally {
      setSubmitting(false);
    }
  };

  const [acceptError, setAcceptError] = useState<string | null>(null);

  const handleOpenAccept = () => {
    setAcceptError(null);
    setErrorMsg(null);
    setShowAcceptModal(true);
  };

  const handleAcceptRequest = async () => {
    if (!estimate) return;
    setAcceptError(null);
    setSubmitting(true);

    try {
      if ((estimate as any).is_flash || (estimate as any).item_type === 'FLASH' || (estimate as any).sourceType === 'FLASH') {
        const { data, error } = await supabase.rpc('admin_process_flash_reservation', {
          p_reservation_id: estimate.id,
          p_action: 'APPROVE',
          p_admin_note: 'อนุมัติโดยช่าง',
        });

        if (error || !data?.success) {
          setAcceptError(error?.message || data?.error || 'เกิดข้อผิดพลาดในการอนุมัติคำขอ Flash');
          return;
        }

        setShowAcceptModal(false);
        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      const internalStartTime = getInitialStartTime(estimate, '10:00');
      const formattedStartTime = internalStartTime.length === 5 ? `${internalStartTime}:00` : internalStartTime;

      const calcEndTime = calculateBlockingEndTime(
        internalStartTime,
        (estimate as any)?.estimated_size_tier,
        estimate.width_cm,
        estimate.height_cm,
        estimate.description
      );
      const formattedEndTime = calcEndTime.length === 5 ? `${calcEndTime}:00` : calcEndTime;

      const appointmentDate = estimate.preferred_date || new Date().toISOString().split('T')[0];

      const apptDateTime = new Date(`${appointmentDate}T${formattedStartTime}`);
      if (apptDateTime.getTime() < Date.now()) {
        setAcceptError('เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่');
        return;
      }

      if (estimate.artist_id && staffArtistId && estimate.artist_id !== staffArtistId) {
        setAcceptError('คุณไม่มีสิทธิ์ยืนยันคำขอของช่างคนอื่น');
        return;
      }

      const availCheck = checkDateAvailability(
        appointmentDate,
        estimate.artist_id,
        blockedDates,
        estimate.customer_name || 'ช่าง'
      );
      if (availCheck.isBlocked) {
        setAcceptError(availCheck.errorMessage || 'ไม่สามารถเลือกวันที่นี้ได้ เนื่องจากเป็นวันที่ปิดรับคิว');
        return;
      }

      const { data, error } = await supabase.rpc('artist_confirm_booking_request', {
        p_estimate_request_id: estimate.id,
        p_appointment_date: appointmentDate,
        p_start_time: formattedStartTime,
        p_end_time: formattedEndTime,
        p_deposit_required: 500,
        p_artist_note: null,
      });

      if (error || !data?.success) {
        const errObj: any = error || { message: data?.error };
        if (errObj.message?.includes('PAST_APPOINTMENT_TIME')) {
          setAcceptError('เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่');
        } else if (
          errObj.code === '23P01' ||
          errObj.message?.includes('no_artist_double_booking') ||
          errObj.message?.includes('conflicts with existing key')
        ) {
          setAcceptError('ช่วงเวลานี้มีคิวของช่างอยู่แล้ว');
        } else if (errObj.code === '42501' || errObj.message?.includes('Unauthorized')) {
          setAcceptError('คุณไม่มีสิทธิ์ยืนยันคำขอนี้');
        } else if (
          errObj.code === '23505' ||
          errObj.message?.includes('already exists') ||
          errObj.message?.includes('must be PENDING') ||
          errObj.message?.includes('is in status ACCEPTED')
        ) {
          setAcceptError('คำขอนี้ได้รับการยืนยันไปแล้ว');
        } else {
          setAcceptError(errObj.message || 'เกิดข้อผิดพลาดในการยืนยันคำขอ');
        }
        return;
      }

      setShowAcceptModal(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error accepting estimate request:', err);
      setAcceptError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
    } finally {
      setSubmitting(false);
    }
  };



  const [hydratedHealth, setHydratedHealth] = useState<{
    hasMedicalCondition?: boolean | null;
    medicalConditionNote?: string | null;
    hasAllergy?: boolean | null;
    allergyNote?: string | null;
  }>({});

  useEffect(() => {
    if (!estimate || !isOpen) return;
    let isMounted = true;
    const cUid = estimate.customer_user_id || (estimate as any).user_id;
    const cId = (estimate as any).customer_id;

    async function loadHealth() {
      let resolvedHasMed: boolean | null | undefined = estimate?.has_medical_condition;
      let resolvedMedNote: string | null = estimate?.medical_condition_note || null;
      let resolvedHasAlg: boolean | null | undefined = estimate?.has_allergy;
      let resolvedAlgNote: string | null = estimate?.allergy_note || null;

      // Check customers master profile
      if ((resolvedHasMed === undefined || resolvedHasAlg === undefined) && (cUid || cId)) {
        try {
          let q = supabase.from('customers').select('has_medical_condition, medical_condition_note, has_allergy, allergy_note, medical_conditions, allergies');
          if (cUid) q = q.eq('user_id', cUid);
          else if (cId) q = q.eq('id', cId);

          const { data: cust } = await q.maybeSingle();
          if (cust) {
            if (resolvedHasMed === undefined && cust.has_medical_condition !== undefined && cust.has_medical_condition !== null) {
              resolvedHasMed = Boolean(cust.has_medical_condition);
              resolvedMedNote = cust.medical_condition_note || cust.medical_conditions || null;
            } else if (resolvedHasMed === undefined && cust.medical_conditions?.trim()) {
              resolvedHasMed = true;
              resolvedMedNote = cust.medical_conditions.trim();
            }

            if (resolvedHasAlg === undefined && cust.has_allergy !== undefined && cust.has_allergy !== null) {
              resolvedHasAlg = Boolean(cust.has_allergy);
              resolvedAlgNote = cust.allergy_note || cust.allergies || null;
            } else if (resolvedHasAlg === undefined && cust.allergies?.trim()) {
              resolvedHasAlg = true;
              resolvedAlgNote = cust.allergies.trim();
            }
          }
        } catch (e) {
          console.warn('Error fetching customer master profile in ArtistRequestDetailDrawer:', e);
        }
      }

      // Fallback to estimate_requests history
      if ((resolvedHasMed === undefined || resolvedHasAlg === undefined) && (cUid || cId)) {
        try {
          let q = supabase
            .from('estimate_requests')
            .select('has_medical_condition, medical_condition_note, has_allergy, allergy_note')
            .order('created_at', { ascending: false })
            .limit(5);

          if (cUid) q = q.eq('customer_user_id', cUid);
          else if (cId) q = q.eq('customer_id', cId);

          const { data: estHist } = await q;
          if (Array.isArray(estHist) && estHist.length > 0) {
            for (const rec of estHist) {
              if (resolvedHasMed === undefined) {
                const mNote = (rec.medical_condition_note || '').trim();
                if (mNote) {
                  resolvedHasMed = true;
                  resolvedMedNote = mNote;
                } else if (rec.has_medical_condition === false) {
                  resolvedHasMed = false;
                } else if (rec.has_medical_condition === true) {
                  resolvedHasMed = true;
                  resolvedMedNote = 'มีโรคประจำตัว';
                }
              }
              if (resolvedHasAlg === undefined) {
                const aNote = (rec.allergy_note || '').trim();
                if (aNote) {
                  resolvedHasAlg = true;
                  resolvedAlgNote = aNote;
                } else if (rec.has_allergy === false) {
                  resolvedHasAlg = false;
                } else if (rec.has_allergy === true) {
                  resolvedHasAlg = true;
                  resolvedAlgNote = 'มีประวัติการแพ้';
                }
              }
            }
          }
        } catch (e) {
          console.warn('Error fetching estimate_requests history in ArtistRequestDetailDrawer:', e);
        }
      }

      if (resolvedHasMed === undefined) resolvedHasMed = null;
      if (resolvedHasAlg === undefined) resolvedHasAlg = null;

      if (!isMounted) return;
      setHydratedHealth({
        hasMedicalCondition: resolvedHasMed,
        medicalConditionNote: resolvedMedNote,
        hasAllergy: resolvedHasAlg,
        allergyNote: resolvedAlgNote,
      });
    }

    loadHealth();

    return () => { isMounted = false; };
  }, [estimate, isOpen, supabase]);

  // Load signed URLs for reference images
  useEffect(() => {
    if (!estimate || !isOpen) {
      setSignedImageUrls([]);
      setLightboxIndex(null);
      return;
    }

    const imagesToSign: string[] = [];
    if (estimate.reference_images && Array.isArray(estimate.reference_images)) {
      imagesToSign.push(...estimate.reference_images.filter(Boolean));
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
          const cleanPath = imgPath.replace(/^customer-references\//, '');
          const { data, error } = await supabase.storage
            .from('customer-references')
            .createSignedUrl(cleanPath, 3600);

          if (!error && data?.signedUrl) {
            signedList.push({ path: imgPath, url: data.signedUrl });
          } else {
            // Fallback try public URL or direct path
            const { data: pubData } = supabase.storage
              .from('customer-references')
              .getPublicUrl(cleanPath);
            if (pubData?.publicUrl) {
              signedList.push({ path: imgPath, url: pubData.publicUrl });
            }
          }
        }
        if (isSubscribed) {
          setSignedImageUrls(signedList);
        }
      } catch (err) {
        console.error('Error signing request reference images:', err);
      } finally {
        if (isSubscribed) setLoadingImages(false);
      }
    }

    signImages();

    return () => {
      isSubscribed = false;
    };
  }, [estimate, isOpen, supabase]);

  if (!isOpen || !estimate) return null;

  const isFlash = Boolean(estimate.is_flash || estimate.sourceType === 'FLASH' || estimate.item_type === 'FLASH');
  const requestCode = isFlash ? `FLASH-${estimate.id.slice(0, 8).toUpperCase()}` : `REQ-${estimate.id.slice(0, 8).toUpperCase()}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end font-prompt bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative w-full max-w-lg bg-studio-card border-l border-studio-border h-full flex flex-col shadow-2xl z-10 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between bg-studio-card">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2.5 py-1 rounded border border-studio-border">
              {requestCode}
            </span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${estimate.status === 'REJECTED' ? 'bg-red-950/60 text-red-400 border-red-800/60' : 'bg-blue-950/60 text-blue-400 border-blue-800/60'}`}>
              {estimate.status === 'REJECTED' ? 'ปฏิเสธ' : 'คำขอใหม่'}
            </span>
            {isFlash && (
              <span className="text-xs px-2.5 py-0.5 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium flex items-center gap-1">
                <Sparkles size={12} /> Flash
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-24 text-xs">
          {/* Read-only Notice */}
          <div className="p-3.5 bg-studio-sec/80 border border-studio-border rounded-xl flex items-start space-x-3 text-studio-secondary">
            <ShieldCheck size={16} className="text-studio-red shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-studio-primary block text-xs">
                {isFlash ? 'รายละเอียดคำขอ Flash (Artist View)' : 'รายละเอียดคำขอจองงานสัก (Artist View)'}
              </span>
              <p className="text-[11px] text-studio-muted leading-relaxed">
                {isFlash
                  ? 'คำขอจองลาย Flash ที่ลูกค้าระบุเข้าหาช่างโดยตรง ท่านสามารถตรวจสอบรายละเอียด ขนาด วันนัดหมาย และรูปภาพลาย Flash ได้ทันที'
                  : 'คำขอใหม่ที่ลูกค้าระบุช่างสักเข้ามาโดยตรง ท่านสามารถเปิดดูรายละเอียด ภาพอ้างอิง และเตรียมความพร้อมสำหรับคิวนัดหมายได้ทันที'}
              </p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
              <User size={14} className="text-studio-red" />
              <span>ข้อมูลลูกค้าที่ติดต่อ</span>
            </div>
            <div className="space-y-2.5 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-studio-muted">ชื่อลูกค้า:</span>
                <span className="text-studio-primary font-medium">{estimate.customer_name ?? 'ลูกค้า (ไม่ระบุชื่อ)'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-studio-muted">เบอร์โทรศัพท์:</span>
                {estimate.customer_phone ? (
                  <a
                    href={`tel:${estimate.customer_phone}`}
                    className="flex items-center space-x-1.5 text-emerald-400 hover:text-emerald-300 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded transition-colors"
                  >
                    <Phone size={12} />
                    <span>{estimate.customer_phone}</span>
                  </a>
                ) : (
                  <span className="text-studio-muted text-xs">ไม่ระบุเบอร์โทร</span>
                )}
              </div>
              {estimate.customer_email && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">อีเมล:</span>
                  <span className="text-studio-secondary font-mono truncate max-w-[200px]">{estimate.customer_email}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2">
                <span className="text-studio-muted">อายุลูกค้า:</span>
                <span className="text-studio-primary font-mono text-xs font-semibold">
                  {formatCustomerAgeDisplay(estimate.customer_dob ?? estimate.date_of_birth)}
                </span>
              </div>
            </div>
          </div>

          {/* Health Disclosure Card (Artist View) */}
          {(() => {
            const hasMed = hydratedHealth.hasMedicalCondition ?? estimate.has_medical_condition;
            const medConditionNote = hydratedHealth.medicalConditionNote || estimate.medical_condition_note;
            const hasAll = hydratedHealth.hasAllergy ?? estimate.has_allergy;
            const allergyNote = hydratedHealth.allergyNote || estimate.allergy_note;

            const isBothFalse = hasMed === false && hasAll === false;
            const isBothNullOrUndefined = (hasMed === null || hasMed === undefined) && (hasAll === null || hasAll === undefined);
            const isWarningState = hasMed === true || hasAll === true;

            return (
              <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 space-y-3 font-prompt">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                    <AlertTriangle
                      size={14}
                      className={
                        isWarningState
                          ? "text-amber-400 shrink-0"
                          : isBothFalse
                          ? "text-emerald-400 shrink-0"
                          : "text-studio-muted shrink-0"
                      }
                    />
                    <span>ข้อมูลสุขภาพที่ลูกค้าแจ้ง</span>
                  </div>
                </div>

                {isBothFalse ? (
                  <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg">
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                    <span>สุขภาพปกติ (ไม่มีโรคประจำตัวและไม่มีประวัติภูมิแพ้)</span>
                  </div>
                ) : isBothNullOrUndefined ? (
                  <div className="flex items-center space-x-2 text-xs text-studio-muted bg-studio-sec/40 border border-studio-border/60 p-2.5 rounded-lg">
                    <AlertCircle size={15} className="shrink-0 text-studio-muted" />
                    <span>ยังไม่ให้ข้อมูล (ยังไม่ได้ระบุโรคประจำตัวและประวัติการแพ้)</span>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    {/* โรคประจำตัว */}
                    {hasMed === true ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#ECE4D3] font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                            โรคประจำตัว
                          </span>
                          <span className="inline-flex items-center space-x-1 text-red-400 bg-red-950/50 border border-red-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                            <AlertTriangle size={11} className="shrink-0" />
                            <span>มีโรคประจำตัว</span>
                          </span>
                        </div>
                        <p className="text-xs text-red-200/90 bg-[#0E0D0C] p-2.5 rounded-lg border border-red-900/50 whitespace-pre-wrap leading-relaxed">
                          {medConditionNote?.trim() || 'ลูกค้าแจ้งว่ามี แต่ไม่ได้ระบุรายละเอียด'}
                        </p>
                      </div>
                    ) : hasMed === false ? (
                      <div className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-studio-muted">โรคประจำตัว:</span>
                        <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                          <CheckCircle2 size={12} /> ไม่มีโรคประจำตัว
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs py-0.5">
                        <span className="text-studio-muted">โรคประจำตัว:</span>
                        <span className="text-studio-muted text-[11px]">ไม่พบข้อมูล</span>
                      </div>
                    )}

                    {/* ประวัติภูมิแพ้ */}
                    {hasAll === true ? (
                      <div className={`space-y-1.5 ${hasMed !== undefined && hasMed !== null ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#ECE4D3] font-medium flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            ประวัติภูมิแพ้ / แพ้ยา
                          </span>
                          <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                            <AlertTriangle size={11} className="shrink-0" />
                            <span>มีประวัติภูมิแพ้</span>
                          </span>
                        </div>
                        <p className="text-xs text-amber-200/90 bg-[#0E0D0C] p-2.5 rounded-lg border border-amber-900/50 whitespace-pre-wrap leading-relaxed">
                          {allergyNote?.trim() || 'ลูกค้าแจ้งว่ามี แต่ไม่ได้ระบุรายละเอียด'}
                        </p>
                      </div>
                    ) : hasAll === false ? (
                      <div className={`flex items-center justify-between text-xs py-0.5 ${hasMed !== undefined && hasMed !== null ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                        <span className="text-studio-muted">ประวัติภูมิแพ้ / แพ้ยา:</span>
                        <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                          <CheckCircle2 size={12} /> ไม่มีอาการแพ้
                        </span>
                      </div>
                    ) : (
                      <div className={`flex items-center justify-between text-xs py-0.5 ${hasMed !== undefined && hasMed !== null ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                        <span className="text-studio-muted">ประวัติภูมิแพ้ / แพ้ยา:</span>
                        <span className="text-studio-muted text-[11px]">ไม่พบข้อมูล</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tattoo Request Details & Dates Card */}
          {(() => {
            const rawTime = estimate.preferred_time || (estimate as any).preferredTime;
            const { cleanNote, extractedTime } = parseNoteWithPreferredTime(estimate.description ?? '');
            let timeDisplay = 'ไม่ระบุ';
            if (rawTime) {
              const hhmm = extractHHMM(rawTime) || rawTime;
              timeDisplay = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
            } else if (extractedTime) {
              timeDisplay = extractedTime;
            }

            if (isFlash) {
              const flashReqDate = (estimate as any).requested_date || estimate.preferred_date;
              const flashReqTime = (estimate as any).requested_start_time || estimate.preferred_time || (estimate as any).preferredTime;

              let flashTimeDisplay = '-';
              if (flashReqTime) {
                const hhmm = extractHHMM(flashReqTime) || flashReqTime;
                flashTimeDisplay = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
              }

              const flashTitleDisplay = estimate.flash_title ?? (estimate as any).flash_design_title ?? (estimate as any).flash_designs?.title ?? (estimate as any).title;
              const flashStyleDisplay = estimate.flash_style ?? estimate.style_preference ?? (estimate as any).style ?? (estimate as any).flash_design_style ?? 'ไม่ระบุ';
              const flashSizeDisplay = formatTattooSize(
                estimate.width_cm,
                estimate.height_cm,
                estimate.flash_size_label || (estimate as any).size_label || (estimate as any).flash_design_size_label
              );

              return (
                <>
                  {/* การ์ดวันที่ต้องการสัก & วันที่ส่งคำขอ */}
                  <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3 font-prompt">
                    <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                      <Calendar size={14} className="text-studio-red" />
                      <span>วันที่ต้องการสัก & วันที่ส่งคำขอ</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <span className="text-studio-muted text-[10px] block">วันที่ต้องการสัก</span>
                        <span className="text-sm font-semibold text-studio-primary">
                          {flashReqDate ? formatDateBangkok(flashReqDate) : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-studio-muted text-[10px] block">เวลาที่สะดวก</span>
                        <span className="text-sm font-semibold text-studio-primary">
                          {flashTimeDisplay}
                        </span>
                      </div>
                      <div>
                        <span className="text-studio-muted text-[10px] block">วันที่ส่งคำขอ</span>
                        <span className="text-xs font-medium text-studio-secondary">
                          {estimate.created_at ? formatDateBangkok(estimate.created_at, true) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* รายละเอียดคำขอจอง FLASH */}
                  <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3 font-prompt">
                    <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                      <Layers size={14} className="text-studio-red" />
                      <span>รายละเอียดคำขอจอง FLASH</span>
                    </div>
                    <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
                      {flashTitleDisplay && (
                        <div className="flex justify-between items-center pb-2">
                          <span className="text-studio-muted">ชื่อลาย Flash:</span>
                          <span className="text-studio-primary font-medium">{flashTitleDisplay}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">สไตล์ลายสัก:</span>
                        <span className="text-studio-primary font-medium">{flashStyleDisplay}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">ตำแหน่งที่สัก:</span>
                        <span className="text-studio-primary font-medium">{estimate.placement ?? 'ไม่ระบุ'}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">ขนาดประมาณ:</span>
                        <span className="text-studio-primary font-mono">{flashSizeDisplay}</span>
                      </div>
                    </div>

                    {cleanNote && (
                      <div className="pt-2 border-t border-studio-border/60">
                        <span className="text-studio-muted text-[10px] block mb-1">รายละเอียดหรือหมายเหตุจากลูกค้า:</span>
                        <p className="text-studio-primary text-xs bg-studio-sec p-3 rounded-lg border border-studio-border whitespace-pre-wrap leading-relaxed">
                          {cleanNote}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              );
            }

            return (
              <>
                <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                    <Calendar size={14} className="text-studio-red" />
                    <span>วันที่ต้องการสัก & วันที่ส่งคำขอ</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <span className="text-studio-muted text-[10px] block">วันที่ลูกค้าสะดวก</span>
                      <span className="text-sm font-semibold text-studio-primary">
                        {estimate.preferred_date ? formatDateBangkok(estimate.preferred_date) : 'ไม่ระบุ'}
                      </span>
                    </div>
                    <div>
                      <span className="text-studio-muted text-[10px] block">เวลาที่สะดวก</span>
                      <span className="text-sm font-semibold text-studio-primary">
                        {timeDisplay}
                      </span>
                    </div>
                    <div>
                      <span className="text-studio-muted text-[10px] block">วันที่ส่งคำขอ</span>
                      <span className="text-xs font-medium text-studio-secondary">
                        {estimate.created_at ? formatDateBangkok(estimate.created_at, true) : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tattoo Specs */}
                <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                    <Layers size={14} className="text-studio-red" />
                    <span>รายละเอียดงานสักที่ต้องการ</span>
                  </div>
                  <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
                    <div className="flex justify-between items-center pb-2">
                      <span className="text-studio-muted">ตำแหน่งที่สัก:</span>
                      <span className="text-studio-primary font-medium">{estimate.placement ?? 'ไม่ระบุ'}</span>
                    </div>
                    {(estimate.width_cm || estimate.height_cm) && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">ขนาดประมาณ:</span>
                        <span className="text-studio-primary font-mono">
                          {formatTattooSize(estimate.width_cm, estimate.height_cm)}
                        </span>
                      </div>
                    )}
                    {(estimate.style_preference || (estimate as any).style) && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">สไตล์ลายสัก:</span>
                        <span className="text-studio-primary font-medium">{estimate.style_preference ?? (estimate as any).style}</span>
                      </div>
                    )}
                  </div>

                  {cleanNote && (
                    <div className="pt-2 border-t border-studio-border/60">
                      <span className="text-studio-muted text-[10px] block mb-1">รายละเอียดเพิ่มเติมจากลูกค้า:</span>
                      <p className="text-studio-primary text-xs bg-studio-sec p-3 rounded-lg border border-studio-border whitespace-pre-wrap leading-relaxed">
                        {cleanNote}
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Flash Design Image Card (Dedicated Section) */}
          {isFlash && estimate.flash_image_url && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3 font-prompt">
              <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
                <ImageIcon size={14} className="text-amber-400" />
                <span>ภาพลาย Flash (Flash Design Image)</span>
              </div>
              <div
                onClick={() => setShowFlashLightbox(true)}
                className="w-32 h-32 sm:w-40 sm:h-40 bg-studio-sec rounded-xl border border-studio-border overflow-hidden relative shadow-md cursor-pointer hover:border-amber-500/60 transition-colors group"
              >
                <CustomerReferenceImage
                  src={estimate.flash_image_url}
                  alt={estimate.flash_title ?? "ภาพลาย Flash"}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <Maximize2 size={16} />
                </div>
              </div>
            </div>
          )}

          {/* Reference Images attached by customer */}
          {(!isFlash || loadingImages || signedImageUrls.length > 0) && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
              <span className="text-studio-secondary text-[11px] uppercase tracking-wider font-semibold block">
                {isFlash ? 'ภาพอ้างอิงที่ลูกค้าแนบ (Customer Reference Images)' : 'ภาพตัวอย่าง (Reference Images)'}
              </span>

              {loadingImages ? (
                <div className="p-4 text-center text-studio-muted text-[11px] animate-pulse">
                  กำลังโหลดรูปภาพ...
                </div>
              ) : signedImageUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {signedImageUrls.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setLightboxIndex(idx)}
                      className="relative aspect-square bg-studio-sec rounded-lg border border-studio-border overflow-hidden group cursor-pointer hover:border-studio-red/60 transition-colors"
                    >
                      <img
                        src={item.url}
                        alt={`Ref ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Maximize2 size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-studio-sec/40 border border-studio-border/60 rounded-lg text-center text-studio-muted text-[11px]">
                  ไม่มีภาพเรฟเฟอเรนซ์แนบมากับคำขอนี้
                </div>
              )}
            </div>
          )}

          {/* Rejection Reason (Artist View) */}
          {estimate.status === 'REJECTED' && (
            <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 space-y-2 font-prompt">
              <div className="flex items-center space-x-2 text-red-400 text-[11px] uppercase tracking-wider font-semibold">
                <AlertTriangle size={14} className="shrink-0" />
                <span>เหตุผลที่ปฏิเสธ</span>
              </div>
              <p className="text-xs text-red-200/90 leading-relaxed font-light bg-black/40 p-3 rounded-lg border border-red-900/40">
                {(estimate as any).quote_note || (estimate as any).rejection_reason || 'ขออภัย ทางร้านไม่สามารถรับคำขอจองนี้ได้เนื่องจากไม่ตรงตามเงื่อนไข'}
              </p>
            </div>
          )}
        </div>

        {/* Drawer Footer with Operational Actions */}
        <div className="p-4 border-t border-studio-border bg-studio-card space-y-2">
          {isPending ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenAccept}
                className="py-2.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs shadow transition-colors cursor-pointer text-center"
              >
                รับคำขอ
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  resetRejectState();
                  setShowRejectModal(true);
                }}
                className="py-2.5 px-2 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 rounded-xl font-semibold text-xs transition-colors cursor-pointer text-center"
              >
                ปฏิเสธคำขอ
              </button>
            </div>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-studio-sec hover:bg-studio-border text-studio-primary rounded-xl font-semibold text-xs border border-studio-border transition-colors cursor-pointer"
            >
              ปิด
            </button>
          )}
        </div>
      </div>

      {/* Accept Request Confirmation Modal (Exact match to Admin / Screenshot) */}
      {showAcceptModal && mounted && estimate && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 font-prompt my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-studio-primary">ยืนยันรับคำขอ</h3>
              <button
                type="button"
                onClick={() => {
                  setShowAcceptModal(false);
                  setAcceptError(null);
                }}
                disabled={submitting}
                className="text-studio-secondary hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-3 text-xs">
              <p className="text-studio-secondary leading-relaxed">
                ระบบจะส่งคำขอมัดจำ 500 บาทให้ลูกค้า และคงล็อกวัน/เวลาที่ลูกค้าเลือกไว้
              </p>

              {acceptError && (
                <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{acceptError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => {
                    setShowAcceptModal(false);
                    setAcceptError(null);
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-studio-sec hover:bg-studio-card text-xs text-studio-secondary rounded-xl border border-studio-border font-medium cursor-pointer disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleAcceptRequest}
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs text-white rounded-xl font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? (
                    <span>กำลังบันทึก...</span>
                  ) : (
                    <span>รับคำขอและส่งคำขอมัดจำ</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reject Request Modal Form */}
      {showRejectModal && mounted && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-auto max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-studio-primary">ระบุเหตุผลในการปฏิเสธคำขอ</h3>
              <button
                onClick={() => {
                  resetRejectState();
                  setShowRejectModal(false);
                }}
                className="text-studio-secondary hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-studio-secondary mb-1.5 text-xs">
                เหตุผลในการปฏิเสธคำขอ <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="ระบุเหตุผลที่ปฏิเสธ เพื่อแจ้งให้ลูกค้าทราบ"
                disabled={submitting}
                className="w-full bg-studio-sec border border-studio-border rounded-xl p-3 text-xs text-studio-primary placeholder-studio-muted focus:outline-none focus:border-red-500 font-prompt resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-studio-border">
              <button
                type="button"
                onClick={() => {
                  resetRejectState();
                  setShowRejectModal(false);
                }}
                disabled={submitting}
                className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={submitting || !rejectReason.trim()}
                className="w-full py-2.5 px-3 rounded-xl bg-red-800 hover:bg-red-900 text-white font-semibold text-xs shadow flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox Modal */}
      {lightboxIndex !== null && signedImageUrls[lightboxIndex] && mounted && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 font-prompt">
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white hover:text-studio-red p-2 cursor-pointer"
          >
            <X size={24} />
          </button>
          <div className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center">
            <img
              src={signedImageUrls[lightboxIndex].url}
              alt="Reference detail"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
          {signedImageUrls.length > 1 && (
            <div className="flex items-center space-x-4 mt-4 text-white">
              <button
                onClick={() => setLightboxIndex((prev) => (prev! > 0 ? prev! - 1 : signedImageUrls.length - 1))}
                className="p-2 bg-studio-card border border-studio-border rounded-full hover:bg-studio-red cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs font-mono">
                {lightboxIndex + 1} / {signedImageUrls.length}
              </span>
              <button
                onClick={() => setLightboxIndex((prev) => (prev! < signedImageUrls.length - 1 ? prev! + 1 : 0))}
                className="p-2 bg-studio-card border border-studio-border rounded-full hover:bg-studio-red cursor-pointer"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Flash Image Lightbox Modal */}
      {showFlashLightbox && estimate?.flash_image_url && mounted && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4 font-prompt animate-in fade-in duration-150">
          <button
            onClick={() => setShowFlashLightbox(false)}
            className="absolute top-4 right-4 text-white hover:text-studio-red p-2 cursor-pointer"
          >
            <X size={24} />
          </button>
          <div className="relative max-w-4xl max-h-[85vh] w-full h-full flex items-center justify-center">
            <CustomerReferenceImage
              src={estimate.flash_image_url}
              alt={estimate.flash_title ?? "ภาพลาย Flash"}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
