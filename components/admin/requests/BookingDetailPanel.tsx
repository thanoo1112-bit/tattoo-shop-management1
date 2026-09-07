'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  CreditCard,
  UserCheck,
  Image as ImageIcon,
  Maximize2,
  Eye,
} from 'lucide-react';
import { BookingItem, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok, formatCurrency } from './types';
import BookingFinancialSummary from './BookingFinancialSummary';
import BookingSessionList from './BookingSessionList';
import { CompleteBookingDialog } from './CompleteBookingDialog';
import { createClient } from '@/lib/supabase/client';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';

interface BookingDetailPanelProps {
  booking: BookingItem | null;
  artists: Array<{ id: string; name: string; nickname: string | null }>;
  onClose: () => void;
  onRefresh: () => void;
  onCheckSlip?: (bookingId: string) => void;
}

export default function BookingDetailPanel({
  booking,
  artists,
  onClose,
  onRefresh,
  onCheckSlip,
}: BookingDetailPanelProps) {
  const [selectedArtistId, setSelectedArtistId] = useState<string>(
    booking?.artist_id || artists[0]?.id || ''
  );
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [previewModal, setPreviewModal] = useState<{ src: string; type: 'reference' | 'slip' } | null>(null);

  // Payment Slip Actions State
  const [isApprovingSlip, setIsApprovingSlip] = useState(false);
  const [isRejectingSlip, setIsRejectingSlip] = useState(false);
  const [slipRejectReason, setSlipRejectReason] = useState('');
  const [isSubmittingSlipReject, setIsSubmittingSlipReject] = useState(false);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  if (!booking) return null;

  const pendingSubmission = booking.pending_submission;

  const customerName = booking.customer_name;
  const customerPhone = booking.customer_phone;

  const rawArtistName = booking.artist_name || 'ยังไม่มอบหมายช่าง';
  const rawArtistNickname = booking.artist_nickname;
  const artistDisplay = rawArtistNickname ? `${rawArtistName} (${rawArtistNickname})` : rawArtistName;

  const styleDisplay = booking.style_preference || 'ไม่ระบุ';
  const placementDisplay = booking.placement || 'ไม่ระบุ';

  const wCm = booking.width_cm;
  const hCm = booking.height_cm;
  const sizeDisplay = wCm && hCm ? `${wCm} × ${hCm} ซม.` : 'ไม่ระบุขนาด';

  const activeSession = booking.sessions?.find((s) => s.status !== 'CANCELLED') || booking.sessions?.[0];
  const appointmentDateDisplay = activeSession?.start_at
    ? formatDateBangkok(activeSession.start_at)
    : booking.requested_date
    ? formatDateBangkok(booking.requested_date)
    : 'ไม่ระบุวัน';

  const appointmentTimeDisplay = activeSession?.start_at && activeSession?.end_at
    ? `${formatTimeBangkok(activeSession.start_at)} – ${formatTimeBangkok(activeSession.end_at)} น.`
    : booking.requested_time || 'ไม่ระบุเวลา';

  const quotedPrice = booking.financial?.quoted_price ?? 0;
  const depositRequired = booking.financial?.deposit_required ?? 0;

  const descriptionDisplay = booking.description || booking.customer_note || 'ไม่มีรายละเอียดเพิ่มเติม';
  const refImages = booking.reference_images || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            รออนุมัติคิว
          </span>
        );
      case 'APPROVED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            อนุมัติแล้ว
          </span>
        );
      case 'WAITING_DEPOSIT':
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            รอมัดจำ
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ยืนยันคิวแล้ว
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="bg-purple-950/60 text-purple-400 border border-purple-800/60 px-2.5 py-0.5 rounded text-xs font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            กำลังดำเนินงาน
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            เสร็จสิ้นสมบูรณ์
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2.5 py-0.5 rounded text-xs font-semibold">
            ปฏิเสธแล้ว
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2.5 py-0.5 rounded text-xs font-semibold">
            ยกเลิกแล้ว
          </span>
        );
      default:
        return null;
    }
  };

  // Section 14: Approve Booking
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

  // Section 15: Reject Booking
  const handleRejectBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    setIsRejecting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'REJECTED',
          admin_note: rejectReason.trim() ? `ปฏิเสธ: ${rejectReason.trim()}` : 'ร้านไม่สามารถรับคิวงานนี้ได้',
        })
        .eq('id', booking.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error rejecting booking:', err);
      setActionError(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธคิว');
    } finally {
      setIsRejecting(false);
    }
  };

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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] md:w-[600px] bg-[#171512] border-l border-[#4A443A] shadow-2xl flex flex-col font-prompt animate-slideInRight">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#4A443A] flex items-center justify-between bg-[#0E0D0C]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#171512] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
              <Calendar size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
                  รายละเอียดคิวงาน
                </h3>
                {(booking.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || booking.has_pending_payment_submission) &&
                onCheckSlip ? (
                  <button
                    type="button"
                    onClick={() => onCheckSlip(booking.id)}
                    title="กดเพื่อตรวจสลิป"
                    className="bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded text-xs font-semibold inline-flex items-center animate-pulse transition-colors cursor-pointer"
                  >
                    <span>สลิปรอตรวจ</span>
                  </button>
                ) : booking.operational_status ? (
                  <span className={`${booking.operational_status.badgeClass} px-2.5 py-0.5 rounded text-xs font-semibold`}>
                    {booking.operational_status.label}
                  </span>
                ) : (
                  getStatusBadge(booking.status)
                )}
              </div>
              <p className="text-[10px] text-[#7A7265] mt-0.5">
                คิว #{booking.id.slice(0, 8)} • สร้างเมื่อ: {formatDateTimeBangkok(booking.created_at)}
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
          {actionError && (
            <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Customer Information Card */}
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
              {booking.is_age_confirmed ? (
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

          {/* Consolidated Booking Details (2-Column Grid) */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-3">
            <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
              รายละเอียดคิวงาน
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Row 1: Artist & Style */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">ช่างสัก</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{artistDisplay}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">สไตล์งาน</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{styleDisplay}</span>
              </div>

              {/* Row 3: Placement & Size */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">ตำแหน่งสัก</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{placementDisplay}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">ขนาดงาน</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{sizeDisplay}</span>
              </div>

              {/* Row 4: Date & Time */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">วันนัดหมาย</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{appointmentDateDisplay}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">เวลา</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{appointmentTimeDisplay}</span>
              </div>

              {/* Row 5: Price & Deposit */}
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

              {/* Full Width: Description */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0 col-span-2">
                <span className="text-[10px] text-[#7A7265] block mb-1">รายละเอียดงานสัก</span>
                <p className="text-[#ECE4D3] font-light leading-relaxed whitespace-pre-wrap break-words">
                  {descriptionDisplay}
                </p>
              </div>

              {booking.admin_note && (
                <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0 col-span-2">
                  <span className="text-[10px] text-[#7A7265] block mb-0.5">หมายเหตุจากแอดมิน</span>
                  <p className="text-[#ECE4D3] font-light leading-relaxed whitespace-pre-wrap break-words">{booking.admin_note}</p>
                </div>
              )}

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

          {/* Section 14 & 15: Approve / Reject Actions (Only if PENDING) */}
          {booking.status === 'PENDING' && (
            <div className="bg-[#0E0D0C] border border-blue-900/50 rounded-xl p-4 space-y-3.5">
              <span className="text-xs font-semibold text-blue-400 block">
                คิวงานนี้รอการอนุมัติจากผู้ดูแลระบบ
              </span>

              {/* Artist Assignment Dropdown */}
              <div>
                <label className="block text-[11px] text-[#A89F91] mb-1">
                  มอบหมายช่างสัก <span className="text-[#9C2F2F]">*</span>
                </label>
                <select
                  id="select-booking-artist"
                  value={selectedArtistId}
                  onChange={(e) => setSelectedArtistId(e.target.value)}
                  className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-blue-400"
                >
                  <option value="" disabled>-- เลือกช่างสัก --</option>
                  {artists.map((art) => (
                    <option key={art.id} value={art.id}>
                      {art.name} {art.nickname ? `(${art.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  id="btn-approve-booking"
                  type="button"
                  disabled={isApproving}
                  onClick={handleApproveBooking}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow"
                >
                  <CheckCircle2 size={14} />
                  <span>{isApproving ? 'กำลังอนุมัติ...' : 'อนุมัติคิวงาน'}</span>
                </button>

                <button
                  id="btn-open-reject-booking"
                  type="button"
                  onClick={() => setIsRejecting(true)}
                  className="px-3 py-2 bg-[#171512] hover:bg-red-950/40 text-xs text-[#A89F91] hover:text-red-400 rounded-lg border border-[#4A443A] hover:border-red-900/60 transition-colors"
                >
                  ปฏิเสธคิว
                </button>
              </div>

              {/* Reject Form inside modal */}
              {isRejecting && (
                <form onSubmit={handleRejectBooking} className="pt-2 border-t border-[#4A443A]/40 space-y-2 animate-fadeIn">
                  <span className="text-[11px] text-red-400 block">ระบุเหตุผลการปฏิเสธ</span>
                  <input
                    type="text"
                    required
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="เช่น ช่างคิวเต็ม หรือไม่สะดวกในวันดังกล่าว..."
                    className="w-full bg-[#171512] border border-[#4A443A] rounded px-2.5 py-1.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className="px-2.5 py-1 text-xs text-[#A89F91]"
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
            </div>
          )}

          {/* Financial Summary */}
          <BookingFinancialSummary booking={booking} onCheckSlip={onCheckSlip} />

          {/* Section: Complete Booking Action (Only when IN_PROGRESS and all sessions completed) */}
          {booking.status === 'IN_PROGRESS' &&
            booking.sessions?.some((s) => s.status === 'COMPLETED') &&
            !booking.sessions?.some((s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS') && (
              <div className="bg-[#0E0D0C] border border-emerald-900/50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold text-emerald-400 block">รอบสักทั้งหมดเสร็จสิ้นแล้ว</span>
                    <span className="text-[11px] text-[#A89F91]">สามารถกดยืนยันเพื่อปิดงานสักให้สมบูรณ์</span>
                  </div>
                  <button
                    id="btn-open-complete-booking"
                    type="button"
                    onClick={() => setIsCompleteDialogOpen(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-bold text-white rounded-lg transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 shrink-0"
                  >
                    <CheckCircle2 size={14} />
                    <span>ปิดงานสัก</span>
                  </button>
                </div>
              </div>
            )}

          {/* Completed State Banner */}
          {booking.status === 'COMPLETED' && (
            <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>งานสักนี้เสร็จสิ้นสมบูรณ์แล้ว</span>
              </div>
              {booking.completed_at && (
                <span className="text-[11px] text-[#A89F91]">
                  ปิดงานเมื่อ: {formatDateTimeBangkok(booking.completed_at)}
                </span>
              )}
            </div>
          )}

          {/* Sessions List & Management */}
          <BookingSessionList booking={booking} onRefresh={onRefresh} />
        </div>
      </div>

      {/* Complete Booking Modal Dialog */}
      <CompleteBookingDialog
        booking={booking}
        isOpen={isCompleteDialogOpen}
        onClose={() => setIsCompleteDialogOpen(false)}
        onSuccess={onRefresh}
      />

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
