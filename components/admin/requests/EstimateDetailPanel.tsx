'use client';

import React, { useState } from 'react';
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
  XCircle,
  CheckCircle2,
  Image as ImageIcon,
  CreditCard,
  Eye,
} from 'lucide-react';
import { EstimateRequestItem, formatCurrency, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok } from './types';
import EstimateQuoteForm from './EstimateQuoteForm';
import { createClient } from '@/lib/supabase/client';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';

interface EstimateDetailPanelProps {
  estimate: EstimateRequestItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onCheckSlip?: (bookingId: string) => void;
}

export default function EstimateDetailPanel({
  estimate,
  onClose,
  onRefresh,
  onCheckSlip,
}: EstimateDetailPanelProps) {
  const [isManaging, setIsManaging] = useState(false);
  const [previewModal, setPreviewModal] = useState<{ src: string; type: 'reference' | 'slip' } | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Payment Slip Actions State
  const [isApprovingSlip, setIsApprovingSlip] = useState(false);
  const [isRejectingSlip, setIsRejectingSlip] = useState(false);
  const [slipRejectReason, setSlipRejectReason] = useState('');
  const [isSubmittingSlipReject, setIsSubmittingSlipReject] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);

  if (!estimate) return null;

  const linkedBooking = estimate.linked_booking;
  const hasBooking = Boolean(linkedBooking || estimate.status !== 'PENDING');
  const pendingSubmission = estimate.linked_booking?.pending_submission || estimate.pending_submission;

  const customerName = linkedBooking?.customer_name || estimate.customer_name;
  const customerPhone = linkedBooking?.customer_phone || estimate.customer_phone;

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
    : estimate.preferred_date || 'ไม่ระบุวัน';

  const appointmentTimeDisplay = activeSession?.start_at && activeSession?.end_at
    ? `${formatTimeBangkok(activeSession.start_at)} – ${formatTimeBangkok(activeSession.end_at)} น.`
    : linkedBooking?.requested_time || 'ไม่ระบุเวลา';

  const preferredDateDisplay = estimate.preferred_date || 'ไม่ระบุวันสะดวก';

  const quotedPrice = linkedBooking?.financial?.quoted_price ?? estimate.quoted_price ?? 0;
  const depositRequired = linkedBooking?.financial?.deposit_required ?? estimate.deposit_required ?? 0;

  const descriptionDisplay = linkedBooking?.description || estimate.description || 'ไม่มีคำอธิบายเพิ่มเติม';
  const refImages = (linkedBooking?.reference_images && linkedBooking.reference_images.length > 0)
    ? linkedBooking.reference_images
    : (estimate.reference_images || []);

  const handleApproveSlip = async () => {
    if (!pendingSubmission) return;
    if (!window.confirm(`ยืนยันอนุมัติหลักฐานการชำระเงินมัดจำจำนวน ฿${formatCurrency(pendingSubmission.claimed_amount)} หรือไม่?`)) {
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
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] md:w-[560px] bg-[#171512] border-l border-[#4A443A] shadow-2xl flex flex-col font-prompt animate-slideInRight">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#4A443A] flex items-center justify-between bg-[#0E0D0C]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#171512] border border-[#4A443A] flex items-center justify-center text-[#ECE4D3]">
              <FileText size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
                  คำขอจองคิวสัก
                </h3>
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
              <p className="text-[10px] text-[#7A7265] mt-0.5">
                รหัส: #{estimate.id.slice(0, 8)} • ยื่นเมื่อ: {formatDateTimeBangkok(estimate.created_at)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#7A7265] hover:text-[#ECE4D3] hover:bg-[#1F1D1A] rounded-lg transition-colors"
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Customer Information */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
              ข้อมูลลูกค้า
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                <User size={14} className="text-[#9C2F2F]" />
                {customerName}
              </span>
              {customerPhone ? (
                <a
                  href={`tel:${customerPhone}`}
                  className="text-xs text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-1 bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A]/50"
                >
                  <Phone size={11} className="text-emerald-400" />
                  {customerPhone}
                </a>
              ) : (
                <span className="text-xs text-[#7A7265] bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A]/50">
                  ไม่ระบุเบอร์โทร
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-[#4A443A]/40">
              <span className="text-[11px] text-[#7A7265]">ยืนยันเงื่อนไขก่อนรับบริการ:</span>
              {estimate.is_age_confirmed ? (
                <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  <span>✓ ยืนยันแล้ว</span>
                </span>
              ) : (
                <span className="text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
                  ยังไม่ยืนยัน
                </span>
              )}
            </div>
          </div>

          {/* Request / Queue Details (2-Column Grid) */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-3">
            <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
              {hasBooking ? 'รายละเอียดคิวงาน' : 'รายละเอียดคำขอ'}
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Row 1: Artist & Style */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">{hasBooking ? 'ช่างสัก' : 'ช่างที่ต้องการ'}</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{artistDisplay}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">{hasBooking ? 'สไตล์งาน' : 'สไตล์ที่ต้องการ'}</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{styleDisplay}</span>
              </div>

              {/* Row 3: Placement & Size */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">{hasBooking ? 'ตำแหน่งสัก' : 'ตำแหน่งที่ต้องการ'}</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{placementDisplay}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">{hasBooking ? 'ขนาดงาน' : 'ขนาดที่ต้องการ'}</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{sizeDisplay}</span>
              </div>

              {/* Row 4 & 5: Appointment Date/Time & Price/Deposit OR Preferred Date */}
              {hasBooking ? (
                <>
                  <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                    <span className="text-[10px] text-[#7A7265] block">วันนัดหมาย</span>
                    <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{appointmentDateDisplay}</span>
                  </div>

                  <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                    <span className="text-[10px] text-[#7A7265] block">เวลา</span>
                    <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{appointmentTimeDisplay}</span>
                  </div>

                  <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                    <span className="text-[10px] text-[#7A7265] block">ราคางานสัก</span>
                    <span className="font-semibold text-[#ECE4D3] mt-0.5 block truncate">
                      {quotedPrice > 0 ? formatCurrency(quotedPrice) : 'ไม่ระบุ'}
                    </span>
                  </div>

                  <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                    <span className="text-[10px] text-[#7A7265] block">เงินมัดจำ</span>
                    <span className="font-semibold text-emerald-400 mt-0.5 block truncate">
                      {depositRequired > 0 ? formatCurrency(depositRequired) : 'ไม่มีมัดจำ'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0 col-span-2">
                  <span className="text-[10px] text-[#7A7265] block">วันที่ลูกค้าสะดวก</span>
                  <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{preferredDateDisplay}</span>
                </div>
              )}

              {/* Full Width: Description */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0 col-span-2">
                <span className="text-[10px] text-[#7A7265] block mb-1">รายละเอียดงานสัก</span>
                <p className="text-[#ECE4D3] font-light leading-relaxed whitespace-pre-wrap break-words">
                  {descriptionDisplay}
                </p>
              </div>

              {/* Full Width: Reference Gallery */}
              {refImages.length > 0 && (
                <div className="col-span-2 pt-1">
                  <span className="text-[10px] text-[#7A7265] block mb-1.5 flex items-center gap-1">
                    <ImageIcon size={12} />
                    รูปภาพอ้างอิง ({refImages.length} รูป)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {refImages.map((imgUrl: string, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => setPreviewModal({ src: imgUrl, type: 'reference' })}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-[#4A443A] bg-[#171512] cursor-pointer hover:border-[#ECE4D3] transition-all relative group"
                      >
                        <CustomerReferenceImage src={imgUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[#ECE4D3] transition-opacity">
                          <Maximize2 size={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pending Deposit Payment Submission Section */}
          {pendingSubmission && (
            <div className="bg-[#0E0D0C] border border-amber-800/60 rounded-xl p-3.5 space-y-3 font-prompt">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block">
                  หลักฐานการชำระเงินมัดจำ
                </span>
                <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded text-xs font-semibold animate-pulse">
                  สลิปรอตรวจ
                </span>
              </div>

              <div className="space-y-2 bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#A89F91]">ยอดเงินที่ลูกค้าแจ้ง:</span>
                  <span className="text-sm font-bold text-amber-300 font-mono">
                    {formatCurrency(pendingSubmission.claimed_amount)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#4A443A]/30">
                  <span className="text-[#A89F91]">หลักฐานที่ส่ง:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const slipUrl = pendingSubmission.proof_image_url || pendingSubmission.slip_path || null;
                      if (slipUrl) setPreviewModal({ src: slipUrl, type: 'slip' });
                    }}
                    className="px-3 py-1 bg-amber-950/70 hover:bg-amber-900 active:bg-amber-950 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
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

              {/* Actions: Side-by-side buttons */}
              {isRejectingSlip ? (
                <form onSubmit={handleRejectSlip} className="pt-2 border-t border-[#4A443A]/40 space-y-2.5 animate-fadeIn">
                  <span className="text-[11px] text-red-400 font-semibold block">ระบุเหตุผลในการปฏิเสธสลิป</span>
                  <input
                    type="text"
                    required
                    value={slipRejectReason}
                    onChange={(e) => setSlipRejectReason(e.target.value)}
                    placeholder="เช่น สลิปไม่ชัดเจน, ไม่พบยอดเงินโอน..."
                    className="w-full bg-[#171512] border border-[#4A443A] rounded-lg p-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejectingSlip(false)}
                      className="px-3 py-1.5 bg-[#171512] text-xs text-[#A89F91] rounded border border-[#4A443A] hover:text-[#ECE4D3]"
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
                    className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50 min-w-0"
                  >
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span className="truncate">{isApprovingSlip ? 'กำลังบันทึก...' : 'ยืนยันการชำระเงิน'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRejectingSlip(true)}
                    className="px-3 py-2.5 bg-red-950/60 hover:bg-red-900/80 active:bg-red-900 text-red-300 border border-red-800/80 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
                  >
                    <XCircle size={15} className="shrink-0" />
                    <span className="truncate">ปฏิเสธสลิป</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action / Confirmation Form */}
          {estimate.status === 'PENDING' ? (
            isManaging ? (
              <EstimateQuoteForm
                estimate={estimate}
                onSuccess={handleConfirmSuccess}
                onCancel={() => setIsManaging(false)}
              />
            ) : isRejecting ? (
              <form onSubmit={handleReject} className="bg-[#0E0D0C] border border-red-900/60 rounded-xl p-4 space-y-3 animate-fadeIn">
                <span className="text-xs font-semibold text-red-400 block">ระบุเหตุผลในการปฏิเสธคำขอ</span>
                <textarea
                  required
                  rows={2}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="เช่น คิวงานเต็ม หรือสไตล์ไม่ตรงกับทางร้าน..."
                  className="w-full bg-[#171512] border border-[#4A443A] rounded-lg p-2.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(false)}
                    className="px-3 py-1.5 bg-[#171512] text-xs text-[#A89F91] rounded border border-[#4A443A]"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReject}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white rounded font-medium"
                  >
                    {isSubmittingReject ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 bg-[#0E0D0C] border border-[#4A443A] rounded-xl space-y-3 text-center">
                <p className="text-xs text-[#A89F91]">
                  คำขอนี้รอการตรวจสอบ กรุณากำหนดวันและเวลานัดหมายเพื่อลงคิวสัก
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    id="btn-open-manage-form"
                    type="button"
                    onClick={() => setIsManaging(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5 shadow"
                  >
                    <Calendar size={14} />
                    <span>จัดการคำขอจอง</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    className="px-3 py-2 bg-[#171512] hover:bg-red-950/40 text-xs text-[#A89F91] hover:text-red-400 rounded-lg border border-[#4A443A] hover:border-red-900/60 transition-colors"
                  >
                    ปฏิเสธคำขอ
                  </button>
                </div>
              </div>
            )
          ) : (
            /* Accepted / Rejected Overview */
            <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-3">
              <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
                สถานะการดำเนินการ (Booking Resolution)
              </span>

              {estimate.status === 'ACCEPTED' && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#A89F91]">สถานะการดำเนินงาน:</span>
                    {estimate.operational_status ? (
                      <span className={`${estimate.operational_status.badgeClass} px-2.5 py-0.5 rounded text-xs font-semibold`}>
                        {estimate.operational_status.label}
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-semibold">ร้านยืนยันคิวแล้ว</span>
                    )}
                  </div>
                  {estimate.deposit_required !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#A89F91]">เงินมัดจำ:</span>
                      <span className="text-[#ECE4D3] font-semibold">
                        {estimate.deposit_required > 0 ? formatCurrency(estimate.deposit_required) : 'ไม่มีมัดจำ'}
                      </span>
                    </div>
                  )}
                  {estimate.quote_note && (
                    <div className="pt-2 border-t border-emerald-900/40">
                      <span className="text-[10px] text-[#7A7265] block mb-0.5">หมายเหตุของร้าน:</span>
                      <p className="text-[#ECE4D3] font-light">{estimate.quote_note}</p>
                    </div>
                  )}
                </div>
              )}

              {estimate.status === 'REJECTED' && (
                <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#A89F91]">สถานะคำขอ:</span>
                    <span className="text-red-400 font-semibold">ปฏิเสธคำขอแล้ว</span>
                  </div>
                  {estimate.quote_note && (
                    <p className="text-[#ECE4D3] font-light text-xs">{estimate.quote_note}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Lightbox Modal for Image Preview */}
      {previewModal && (
        <div
          onClick={() => setPreviewModal(null)}
          className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4 cursor-pointer animate-fadeIn"
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
            className="absolute top-4 right-4 text-[#ECE4D3] bg-[#171512] border border-[#4A443A] p-2 rounded-full hover:border-[#9C2F2F] transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
