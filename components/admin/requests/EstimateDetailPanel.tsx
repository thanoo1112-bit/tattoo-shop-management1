'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Clock,
  Sparkles,
  ShieldCheck,
  Maximize2,
  FileText,
  AlertCircle,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Image as ImageIcon,
  CreditCard,
  Eye,
  Layers,
  Trash2,
} from 'lucide-react';
import { EstimateRequestItem, formatCurrency, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok, getTattooWorkTypeLabel, getColorTechniqueLabel } from './types';
import EstimateQuoteForm from './EstimateQuoteForm';
import { createClient } from '@/lib/supabase/client';
import { parseNoteWithPreferredTime } from '@/lib/noteUtils';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import { useApp } from '@/components/AppContext';
import { BlockedDateRecord, checkExistingDateWarning } from '@/lib/availabilityUtils';

interface EstimateDetailPanelProps {
  estimate: EstimateRequestItem | null;
  blockedDates?: BlockedDateRecord[];
  onClose: () => void;
  onRefresh: () => void;
  onCheckSlip?: (bookingId: string) => void;
  onDeleteRequest?: (estimate: EstimateRequestItem) => void;
}

export default function EstimateDetailPanel({
  estimate,
  blockedDates = [],
  onClose,
  onRefresh,
  onCheckSlip,
  onDeleteRequest,
}: EstimateDetailPanelProps) {
  const { artists } = useApp();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [isManaging, setIsManaging] = useState(false);
  const [previewModal, setPreviewModal] = useState<{ src: string; type: 'reference' | 'slip' } | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Admin Review Gate State
  const [isSendingToArtist, setIsSendingToArtist] = useState(false);
  const [selectedArtistForReview, setSelectedArtistForReview] = useState<string>(estimate?.artist_id || '');
  const [sendError, setSendError] = useState<string | null>(null);

  // Payment Slip Actions State
  const [isApprovingSlip, setIsApprovingSlip] = useState(false);
  const [isRejectingSlip, setIsRejectingSlip] = useState(false);
  const [slipRejectReason, setSlipRejectReason] = useState('');
  const [isSubmittingSlipReject, setIsSubmittingSlipReject] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);

  // Customer Confirmation Resolution State
  const [confirmationState, setConfirmationState] = useState<'loading' | 'confirmed' | 'not_confirmed' | 'error'>('loading');

  React.useEffect(() => {
    if (!estimate) {
      setConfirmationState('not_confirmed');
      return;
    }

    if (estimate.is_age_confirmed === true) {
      setConfirmationState('confirmed');
      return;
    }

    const customerUserId = estimate.customer_user_id || estimate.linked_booking?.customer_user_id;
    if (!customerUserId) {
      setConfirmationState('not_confirmed');
      return;
    }

    let isMounted = true;
    setConfirmationState('loading');
    const supabase = createClient();

    async function fetchStatus() {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('eligibility_confirmed_at, profile_completed_at')
          .eq('user_id', customerUserId)
          .maybeSingle();

        if (!isMounted) return;

        if (error) {
          console.error('Error fetching admin customer confirmation:', error);
          setConfirmationState('error');
          return;
        }

        if (data) {
          const isConfirmed = Boolean(data.eligibility_confirmed_at || data.profile_completed_at);
          setConfirmationState(isConfirmed ? 'confirmed' : 'not_confirmed');
        } else {
          setConfirmationState('not_confirmed');
        }
      } catch (err) {
        console.error('Exception fetching admin customer confirmation:', err);
        if (isMounted) setConfirmationState('error');
      }
    }

    fetchStatus();

    return () => {
      isMounted = false;
    };
  }, [estimate?.id, estimate?.customer_user_id, estimate?.linked_booking?.customer_user_id, estimate?.is_age_confirmed]);

  const handleSendToArtist = async () => {
    if (!estimate) return;
    const targetArtistId = selectedArtistForReview || estimate.artist_id;
    if (!targetArtistId) {
      setSendError('กรุณาเลือกช่างสักก่อนย้ายช่างผู้รับผิดชอบ');
      return;
    }

    setIsSendingToArtist(true);
    setSendError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('estimate_requests')
        .update({
          artist_id: targetArtistId,
          updated_at: new Date().toISOString()
        })
        .eq('id', estimate.id);

      if (updateError) throw updateError;

      setSuccessToast('ย้ายช่างผู้รับผิดชอบเรียบร้อยแล้ว');
      setTimeout(() => {
        onRefresh();
      }, 800);
    } catch (err: any) {
      console.error('Error reassigning artist:', err);
      setSendError(err.message || 'เกิดข้อผิดพลาดในการย้ายช่างผู้รับผิดชอบ');
    } finally {
      setIsSendingToArtist(false);
    }
  };

  if (!estimate) return null;

  const linkedBooking = estimate.linked_booking;
  const hasBooking = Boolean(linkedBooking || estimate.status !== 'PENDING');
  const pendingSubmission = estimate.linked_booking?.pending_submission || estimate.pending_submission;

  const customerName = linkedBooking?.customer_name || estimate.customer_name;
  const customerPhone = linkedBooking?.customer_phone || estimate.customer_phone;
  const customerEmail = estimate.customer_email || linkedBooking?.customer_email || '';

  const isHealthUnknown =
    estimate.has_medical_condition === undefined ||
    estimate.has_medical_condition === null ||
    estimate.has_allergy === undefined ||
    estimate.has_allergy === null;

  const isHealthy =
    !isHealthUnknown &&
    estimate.has_medical_condition === false &&
    estimate.has_allergy === false;

  const rawArtistName = linkedBooking?.artist_name || estimate.artist_name || 'ยังไม่ระบุช่าง';
  const rawArtistNickname = linkedBooking?.artist_nickname || estimate.artist_nickname;
  const artistDisplay = rawArtistNickname ? `${rawArtistName} (${rawArtistNickname})` : rawArtistName;

  const styleDisplay = linkedBooking?.style_preference || estimate.style_preference || estimate.style || 'ไม่ระบุ';
  const placementDisplay = linkedBooking?.placement || estimate.placement || 'ไม่ระบุ';

  const wCm = linkedBooking?.width_cm ?? estimate.width_cm;
  const hCm = linkedBooking?.height_cm ?? estimate.height_cm;
  const sizeDisplay = wCm && hCm ? `${wCm} × ${hCm} ซม.` : 'ไม่ระบุขนาด';

  const activeSession = linkedBooking?.sessions?.find((s) => s.status !== 'CANCELLED') || linkedBooking?.sessions?.[0];
  const appointmentDateDisplay = activeSession?.start_at
    ? formatDateBangkok(activeSession.start_at)
    : linkedBooking?.requested_date
    ? formatDateBangkok(linkedBooking.requested_date)
    : estimate.preferred_date ? formatDateBangkok(estimate.preferred_date) : 'ไม่ระบุวัน';

  const appointmentStartTimeDisplay = activeSession?.start_at
    ? `${formatTimeBangkok(activeSession.start_at)} น.`
    : linkedBooking?.requested_time
    ? (linkedBooking.requested_time.length >= 5 ? `${linkedBooking.requested_time.slice(0, 5)} น.` : linkedBooking.requested_time)
    : 'ไม่ระบุเวลา';

  const preferredDateDisplay = estimate.preferred_date ? formatDateBangkok(estimate.preferred_date) : 'ไม่ระบุวันสะดวก';

  const rawDescription = linkedBooking?.description || estimate.description || '';
  const { cleanNote, extractedTime } = parseNoteWithPreferredTime(rawDescription);
  const preferredTimeDisplay = extractedTime || 'ไม่ระบุ';

  const quotedPrice = linkedBooking?.financial?.quoted_price ?? estimate.quoted_price ?? 0;
  const depositRequired = linkedBooking?.financial?.deposit_required ?? estimate.deposit_required ?? 0;

  const descriptionDisplay = cleanNote || 'ไม่มีคำอธิบายเพิ่มเติม';
  const refImages = (linkedBooking?.reference_images && linkedBooking.reference_images.length > 0)
    ? linkedBooking.reference_images
    : (estimate.reference_images || []);

  const requestCode = `REQ-${estimate.id.slice(0, 8).toUpperCase()}`;

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            รอตรวจสอบ
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ยืนยันคำขอแล้ว
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ปฏิเสธแล้ว
          </span>
        );
      case 'QUOTED':
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            เสนอราคาแล้ว
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2.5 py-0.5 rounded text-xs font-semibold">
            หมดอายุ
          </span>
        );
      default:
        return null;
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('ยืนยันการปฏิเสธคำขอจองนี้หรือไม่?')) return;

    setIsSubmittingReject(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('estimate_requests')
        .update({
          status: 'REJECTED',
          quote_note: rejectReason.trim() ? `ปฏิเสธ: ${rejectReason.trim()}` : 'ร้านไม่สามารถรับคิวงานนี้ได้ในขณะนี้',
        })
        .eq('id', estimate.id);

      if (error) throw error;
      setIsRejecting(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      console.error('Error rejecting estimate:', err);
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const handleConfirmSuccess = (bookingStatus?: string) => {
    setIsManaging(false);
    const msg =
      bookingStatus === 'WAITING_DEPOSIT'
        ? 'ยืนยันคิวแล้ว — รอชำระเงินมัดจำ'
        : 'ยืนยันคิวสักเรียบร้อยแล้ว';
    setSuccessToast(msg);
    setTimeout(() => {
      onRefresh();
      onClose();
    }, 1200);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 animate-fadeIn"
      />

      {/* Drawer Body */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] md:w-[560px] bg-studio-card border-l border-studio-border shadow-2xl flex flex-col font-prompt animate-slideInRight overflow-hidden">
        
        {/* SECTION 0: HEADER */}
        <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between bg-studio-card/95">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2.5 py-1 rounded border border-studio-border">
              {requestCode}
            </span>
            {(estimate.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || estimate.has_pending_payment_submission) &&
            estimate.linked_booking?.id &&
            onCheckSlip ? (
              <button
                type="button"
                onClick={() => onCheckSlip(estimate.linked_booking!.id)}
                title="กดเพื่อตรวจสลิป"
                className="bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded text-xs font-semibold inline-flex items-center animate-pulse transition-colors cursor-pointer"
              >
                <span>สลิปรอตรวจ</span>
              </button>
            ) : estimate.operational_status ? (
              <span className={`${estimate.operational_status.badgeClass} px-2.5 py-0.5 rounded text-xs font-semibold`}>
                {estimate.operational_status.label}
              </span>
            ) : (
              getStatusBadge(estimate.status)
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-secondary hover:text-studio-primary hover:bg-studio-sec border border-studio-border transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toast Feedback */}
        {successToast && (
          <div className="p-3 bg-emerald-950/80 border-b border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span className="font-semibold">{successToast}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-24 text-xs">
          
          {/* SECTION 1: ADMIN VIEW INTRO */}
          <div className="p-3.5 bg-studio-sec/80 border border-studio-border rounded-xl flex items-start space-x-3 text-studio-secondary">
            <ShieldCheck size={16} className="text-studio-red shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-studio-primary block text-xs">
                รายละเอียดคำขอจองงานสัก (Admin View)
              </span>
              <p className="text-[11px] text-studio-muted leading-relaxed">
                ดูรายละเอียดคำขอ ติดตามสถานะ และจัดการขั้นตอนของงานสัก
              </p>
            </div>
          </div>

          {/* SECTION 2: ข้อมูลลูกค้าที่ติดต่อ */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
              <User size={14} className="text-studio-red" />
              <span>ข้อมูลลูกค้าที่ติดต่อ</span>
            </div>
            <div className="space-y-2.5 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-studio-muted">ชื่อลูกค้า:</span>
                <span className="text-studio-primary font-medium">{customerName || 'ลูกค้า (ไม่ระบุชื่อ)'}</span>
              </div>
              {customerEmail ? (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">อีเมล:</span>
                  <span className="text-studio-secondary font-mono truncate max-w-[220px]">{customerEmail}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">อีเมล:</span>
                  <span className="text-studio-muted text-xs">ไม่ระบุอีเมล</span>
                </div>
              )}
              {customerPhone ? (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">เบอร์โทรศัพท์:</span>
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
                  <span className="text-studio-muted">เบอร์โทรศัพท์:</span>
                  <span className="text-studio-muted text-xs">ไม่ระบุเบอร์โทร</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2">
                <span className="text-studio-muted">การยืนยันอายุและเงื่อนไข:</span>
                {confirmationState === 'loading' ? (
                  <span className="inline-flex items-center space-x-1 text-studio-muted bg-studio-card/80 border border-studio-border px-2.5 py-0.5 rounded text-[11px]">
                    <span>กำลังตรวจสอบ...</span>
                  </span>
                ) : confirmationState === 'confirmed' ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                    <CheckCircle2 size={12} />
                    <span>ยืนยันแล้ว</span>
                  </span>
                ) : confirmationState === 'error' ? (
                  <span className="inline-flex items-center space-x-1 text-amber-400/80 bg-amber-950/30 border border-amber-800/30 px-2.5 py-0.5 rounded text-[11px]">
                    <span>! ไม่สามารถตรวจสอบได้</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                    <span>ยังไม่ยืนยัน</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION 2.5: ข้อมูลสุขภาพที่ลูกค้าแจ้ง */}
          <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 space-y-3 font-prompt">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
                <AlertTriangle size={14} className={isHealthUnknown ? "text-[#A89F91] shrink-0" : isHealthy ? "text-emerald-400 shrink-0" : "text-amber-400 shrink-0"} />
                <span>ข้อมูลสุขภาพที่ลูกค้าแจ้ง</span>
              </div>
            </div>

            {isHealthUnknown ? (
              <div className="flex items-center space-x-2 text-xs text-[#A89F91] bg-studio-sec/60 border border-[#4A443A]/50 p-2.5 rounded-lg">
                <AlertCircle size={15} className="shrink-0 text-[#A89F91]" />
                <span>ไม่มีข้อมูลสุขภาพ</span>
              </div>
            ) : isHealthy ? (
              <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                <span>สุขภาพปกติ (ไม่มีโรคประจำตัวและไม่มีประวัติการแพ้)</span>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {/* โรคประจำตัว */}
                {estimate.has_medical_condition ? (
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
                    {estimate.medical_condition_note?.trim() ? (
                      <p className="text-xs text-red-200/90 bg-[#0E0D0C] p-2.5 rounded-lg border border-red-900/50 whitespace-pre-wrap leading-relaxed">
                        {estimate.medical_condition_note.trim()}
                      </p>
                    ) : (
                      <p className="text-xs text-red-300/70 bg-[#0E0D0C] p-2 rounded-lg border border-red-900/40 font-light italic">
                        ลูกค้าแจ้งว่ามีโรคประจำตัว (ไม่ได้ระบุรายละเอียด)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-studio-muted">โรคประจำตัว:</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={12} /> ไม่มี
                    </span>
                  </div>
                )}

                {/* ประวัติการแพ้ */}
                {estimate.has_allergy ? (
                  <div className={`space-y-1.5 ${estimate.has_medical_condition ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#ECE4D3] font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        ประวัติการแพ้
                      </span>
                      <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2.5 py-0.5 rounded text-[11px] font-medium">
                        <AlertTriangle size={11} className="shrink-0" />
                        <span>มีประวัติการแพ้</span>
                      </span>
                    </div>
                    {estimate.allergy_note?.trim() ? (
                      <p className="text-xs text-amber-200/90 bg-[#0E0D0C] p-2.5 rounded-lg border border-amber-900/50 whitespace-pre-wrap leading-relaxed">
                        {estimate.allergy_note.trim()}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-300/70 bg-[#0E0D0C] p-2 rounded-lg border border-amber-900/40 font-light italic">
                        ลูกค้าแจ้งว่ามีประวัติการแพ้ (ไม่ได้ระบุรายละเอียด)
                      </p>
                    )}
                  </div>
                ) : (
                  <div className={`flex items-center justify-between text-xs py-0.5 ${estimate.has_medical_condition ? 'pt-2.5 border-t border-[#4A443A]/40' : ''}`}>
                    <span className="text-studio-muted">ประวัติการแพ้:</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-1 text-[11px]">
                      <CheckCircle2 size={12} /> ไม่มี
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 3: วันที่ต้องการสัก & วันที่ส่งคำขอ */}
          {(() => {
            const prefWarning = estimate.preferred_date
              ? checkExistingDateWarning(estimate.preferred_date, estimate.artist_id, blockedDates, rawArtistNickname || rawArtistName)
              : { hasWarning: false, warningMessage: null };

            return (
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
                      {preferredTimeDisplay}
                    </span>
                  </div>
                  <div>
                    <span className="text-studio-muted text-[10px] block">วันที่ส่งคำขอ</span>
                    <span className="text-xs font-medium text-studio-secondary">
                      {estimate.created_at ? formatDateTimeBangkok(estimate.created_at) : '-'}
                    </span>
                  </div>
                </div>
                {prefWarning.hasWarning && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300 flex items-center gap-2 mt-2">
                    <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                    <span>{prefWarning.warningMessage}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* SECTION 4: รายละเอียดงานสักที่ต้องการ */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <div className="flex items-center space-x-2 text-studio-secondary text-[11px] uppercase tracking-wider font-semibold">
              <Layers size={14} className="text-studio-red" />
              <span>รายละเอียดงานสักที่ต้องการ</span>
            </div>
            <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
              <div className="flex justify-between items-center pb-2">
                <span className="text-studio-muted">ตำแหน่งที่สัก:</span>
                <span className="text-studio-primary font-medium">{placementDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-studio-muted">ขนาดประมาณ:</span>
                <span className="text-studio-primary font-mono">{sizeDisplay}</span>
              </div>
              {estimate.work_type && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">ประเภทงานสัก:</span>
                  <span className="text-studio-primary font-medium">{getTattooWorkTypeLabel(estimate.work_type)}</span>
                </div>
              )}
              {estimate.color_technique && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-studio-muted">ลักษณะการลงสี:</span>
                  <span className="text-studio-primary font-medium">{getColorTechniqueLabel(estimate.color_technique)}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-2">
                <span className="text-studio-muted">สไตล์ลายสัก:</span>
                <span className="text-studio-primary font-medium">{styleDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-studio-muted">วันที่ต้องการ:</span>
                <span className="text-studio-primary font-medium">{preferredDateDisplay}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-studio-muted">เวลาที่สะดวก:</span>
                <span className="text-studio-primary font-medium">{preferredTimeDisplay}</span>
              </div>
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

          {/* SECTION 5: รูปภาพอ้างอิง */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <span className="text-studio-secondary text-[11px] uppercase tracking-wider font-semibold block">
              รูปภาพอ้างอิง
            </span>
            {refImages.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {refImages.map((imgUrl: string, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewModal({ src: imgUrl, type: 'reference' })}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-studio-border bg-studio-sec cursor-pointer hover:border-studio-red/60 transition-colors relative group"
                  >
                    <CustomerReferenceImage src={imgUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <Maximize2 size={14} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-studio-sec/40 border border-studio-border/60 rounded-lg text-center text-studio-muted text-[11px]">
                ไม่มีภาพอ้างอิงแนบมากับคำขอนี้
              </div>
            )}
          </div>

          {/* SECTION 6: มอบหมายช่างผู้รับผิดชอบ (ADMIN CONTROL) */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
            <span className="text-studio-secondary text-[11px] uppercase tracking-wider font-semibold block">
              มอบหมายช่างผู้รับผิดชอบ
            </span>
            <p className="text-[11px] text-studio-muted leading-relaxed">
              เลือกช่างที่รับผิดชอบงานนี้ โดยสามารถเปลี่ยนมอบหมายให้ช่างคนอื่นได้
            </p>
            <div className="space-y-2 pt-1">
              <div className="flex justify-between items-center">
                <span className="text-studio-muted">ช่างปัจจุบัน:</span>
                <span className="text-studio-primary font-medium">{artistDisplay}</span>
              </div>

              {sendError && (
                <div className="p-2 bg-red-950/40 border border-red-900/60 rounded text-xs text-red-400 text-left">
                  {sendError}
                </div>
              )}

              <div className="pt-2 border-t border-studio-border/50 space-y-1.5">
                <label className="text-[11px] text-studio-muted font-medium block">ช่างผู้รับผิดชอบ:</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedArtistForReview || estimate.artist_id || ''}
                    onChange={(e) => setSelectedArtistForReview(e.target.value)}
                    className="flex-1 bg-studio-sec border border-studio-border rounded-xl p-2.5 text-xs text-studio-primary focus:outline-none focus:border-studio-red"
                  >
                    <option value="">-- กรุณาเลือกช่างสัก --</option>
                    {artists.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} {a.nickname ? `(${a.nickname})` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedArtistForReview && selectedArtistForReview !== estimate.artist_id && (
                    <button
                      type="button"
                      disabled={isSendingToArtist}
                      onClick={handleSendToArtist}
                      className="px-3.5 py-2.5 bg-studio-red hover:bg-[#b53838] text-xs font-semibold text-white rounded-xl transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      {isSendingToArtist ? 'กำลังบันทึก...' : 'ย้ายช่าง'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 8: สถานะการจอง / การชำระเงิน */}
          {(hasBooking || pendingSubmission) && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
              <span className="text-studio-secondary text-[11px] uppercase tracking-wider font-semibold block">
                สถานะการจองและการชำระเงิน
              </span>

              {hasBooking && (
                <div className="space-y-2 pt-1 divide-y divide-studio-border/50">
                  <div className="flex justify-between items-center pb-2">
                    <span className="text-studio-muted">สถานะคิวงาน:</span>
                    {estimate.operational_status ? (
                      <span className={`${estimate.operational_status.badgeClass} px-2.5 py-0.5 rounded text-xs font-semibold`}>
                        {estimate.operational_status.label}
                      </span>
                    ) : (
                      <span className="text-studio-primary font-medium">{linkedBooking?.status || estimate.status}</span>
                    )}
                  </div>
                  {appointmentDateDisplay !== 'ไม่ระบุวัน' && (
                    <>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">วันที่นัด:</span>
                        <span className="text-studio-primary font-medium">{appointmentDateDisplay}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-studio-muted">เวลานัด:</span>
                        <span className="text-studio-primary font-medium">{appointmentStartTimeDisplay}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Pending Deposit Payment Submission */}
              {pendingSubmission && (
                <div className="bg-studio-sec border border-amber-800/60 rounded-xl p-3.5 space-y-3 mt-2 font-prompt">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block">
                      หลักฐานการชำระเงินมัดจำ
                    </span>
                  </div>

                  <div className="space-y-2 bg-studio-card p-2.5 rounded-lg border border-studio-border text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-studio-muted">ยอดเงินที่ลูกค้าแจ้ง:</span>
                      <span className="text-sm font-bold text-amber-300 font-mono">
                        {formatCurrency(pendingSubmission.claimed_amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-studio-border/50">
                      <span className="text-studio-muted">หลักฐานที่ส่ง:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const slipUrl = pendingSubmission.proof_image_url || pendingSubmission.slip_path || null;
                          if (slipUrl) setPreviewModal({ src: slipUrl, type: 'slip' });
                        }}
                        className="px-3 py-1 bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>ดูสลิป</span>
                      </button>
                    </div>
                  </div>

                  {/* Slip Error Feedback */}
                  {slipError && (
                    <div className="p-2.5 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-center gap-1.5">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{slipError}</span>
                    </div>
                  )}

                  {/* Slip Actions */}
                  {isRejectingSlip ? (
                    <form onSubmit={handleRejectSlip} className="pt-2 border-t border-studio-border/50 space-y-2.5 animate-fadeIn">
                      <span className="text-[11px] text-red-400 font-semibold block">ระบุเหตุผลในการปฏิเสธสลิป</span>
                      <input
                        type="text"
                        required
                        value={slipRejectReason}
                        onChange={(e) => setSlipRejectReason(e.target.value)}
                        placeholder="เช่น สลิปไม่ชัดเจน, ไม่พบยอดเงินโอน..."
                        className="w-full bg-studio-card border border-studio-border rounded-lg p-2 text-xs text-studio-primary focus:outline-none focus:border-red-400"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsRejectingSlip(false)}
                          className="px-3 py-1.5 bg-studio-card text-xs text-studio-muted rounded border border-studio-border hover:text-studio-primary"
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
                  ) : (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isApprovingSlip}
                        onClick={handleApproveSlip}
                        className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50 min-w-0"
                      >
                        <CheckCircle2 size={15} className="shrink-0" />
                        <span className="truncate">{isApprovingSlip ? 'กำลังบันทึก...' : 'ยืนยันการชำระเงิน'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsRejectingSlip(true)}
                        className="px-3 py-2.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/80 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
                      >
                        <XCircle size={15} className="shrink-0" />
                        <span className="truncate">ปฏิเสธสลิป</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SECTION 9: ADMIN ACTIONS */}
          {estimate.status === 'PENDING' && (
            <div className="bg-studio-card border border-studio-border rounded-xl p-4 space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-studio-border/50 pb-2">
                  <span className="text-xs font-bold text-studio-primary">จัดการคำขอจองคิวสัก</span>
                  <span className="text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded font-mono font-semibold">
                    คำขอใหม่
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    id="btn-open-manage-form"
                    type="button"
                    onClick={() => setIsManaging(true)}
                    className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-bold text-white rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow cursor-pointer min-w-0"
                  >
                    <Calendar size={15} className="shrink-0" />
                    <span className="truncate">กำหนดราคา/ลงคิว</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    className="px-3 py-2.5 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
                  >
                    <XCircle size={15} className="shrink-0" />
                    <span className="truncate">ปฏิเสธคำขอ</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {estimate.status === 'REJECTED' && onDeleteRequest && (
            <div className="bg-studio-card border border-red-900/60 rounded-xl p-4 space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-studio-border/50 pb-2">
                  <span className="text-xs font-bold text-red-400">การจัดการคำขอที่ถูกปฏิเสธ</span>
                  <span className="text-[10px] bg-red-950/80 text-red-300 border border-red-800/80 px-2 py-0.5 rounded font-semibold">
                    ปฏิเสธแล้ว
                  </span>
                </div>
                <p className="text-[11px] text-[#A89F91] leading-relaxed">
                  คำขอนี้ถูกปฏิเสธแล้ว คุณสามารถลบคำขอนี้ออกจากระบบแบบถาวรได้
                </p>
                <button
                  type="button"
                  onClick={() => onDeleteRequest(estimate)}
                  className="w-full py-2.5 px-4 bg-[#9C2F2F] hover:bg-[#B53838] active:scale-[0.99] text-xs font-bold text-white rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer border border-[#B53838]/40"
                >
                  <Trash2 size={15} />
                  <span>ลบคำขอนี้ถาวร</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quote / Schedule Child Modal Overlay */}
      {isManaging && mounted && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="w-full max-w-md my-auto max-h-[90dvh] overflow-y-auto rounded-2xl shadow-2xl">
            <EstimateQuoteForm
              estimate={estimate}
              blockedDates={blockedDates}
              onSuccess={handleConfirmSuccess}
              onCancel={() => setIsManaging(false)}
            />
          </div>
        </div>,
        document.body
      )}

      {/* Admin Reject Request Child Modal Overlay */}
      {isRejecting && mounted && createPortal(
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-prompt overflow-y-auto">
          <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl font-prompt my-auto max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-studio-border pb-3">
              <h3 className="font-semibold text-sm text-red-400">ระบุเหตุผลในการปฏิเสธคำขอ</h3>
              <button
                type="button"
                onClick={() => setIsRejecting(false)}
                className="text-studio-secondary hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleReject} className="space-y-4 text-xs">
              <textarea
                required
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="เช่น คิวงานเต็ม หรือสไตล์ไม่ตรงกับทางร้าน..."
                className="w-full bg-studio-sec border border-studio-border rounded-xl p-3 text-xs text-studio-primary focus:outline-none focus:border-red-400"
              />
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => setIsRejecting(false)}
                  className="px-4 py-2 bg-studio-sec hover:bg-studio-card text-xs text-studio-secondary rounded-xl border border-studio-border font-medium cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReject}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-xs text-white rounded-xl font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReject ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox Modal for Image Preview */}
      {previewModal && mounted && createPortal(
        <div
          onClick={() => setPreviewModal(null)}
          className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 cursor-pointer animate-fadeIn font-prompt"
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
            className="absolute top-4 right-4 text-[#ECE4D3] bg-[#171512] border border-[#4A443A] p-2 rounded-full hover:border-[#9C2F2F] transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
