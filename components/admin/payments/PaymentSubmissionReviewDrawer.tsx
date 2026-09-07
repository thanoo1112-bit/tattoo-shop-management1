'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PaymentSubmissionDetail } from './types';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Phone,
  Calendar,
  Layers,
  FileText,
  CreditCard,
  Building2,
  ZoomIn,
  RefreshCw,
  Send,
  AlertCircle,
  Eye,
  ShieldCheck,
  Ban,
  Image as ImageIcon,
  Maximize2,
} from 'lucide-react';
import Image from 'next/image';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import { formatDateBangkok, formatTimeBangkok } from '@/components/admin/calendar/calendarUtils';

interface PaymentSubmissionReviewDrawerProps {
  submission: PaymentSubmissionDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export default function PaymentSubmissionReviewDrawer({
  submission,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: PaymentSubmissionReviewDrawerProps) {
  const supabase = createClient();

  const [slipSignedUrl, setSlipSignedUrl] = useState<string | null>(null);
  const [loadingSlip, setLoadingSlip] = useState(false);

  // Hydrated full details state
  const [hydratedDetails, setHydratedDetails] = useState<{
    customerName?: string;
    customerPhone?: string;
    artistName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    bookingStatus?: string;
    placement?: string;
    widthCm?: number | null;
    heightCm?: number | null;
    style?: string | null;
    description?: string | null;
    quotedPrice?: number;
    depositRequired?: number;
    paidTotal?: number;
    refImages?: string[];
  } | null>(null);

  // Approve Form State
  const [verifiedAmount, setVerifiedAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'QR' | 'CASH' | 'OTHER'>('BANK_TRANSFER');
  const [referenceNo, setReferenceNo] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reject Dialog State
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Lightbox
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Complete self-hydration effect for linked entity relationships
  useEffect(() => {
    if (!submission) return;
    const currentSub = submission;

    let isMounted = true;

    async function loadFullData() {
      try {
        // 1. Fetch booking with joined artist and booking_sessions
        const { data: b } = await supabase
          .from('bookings')
          .select('*, artists(id, name, nickname), booking_sessions(id, session_number, start_at, end_at, status)')
          .eq('id', currentSub.booking_id)
          .maybeSingle();

        // 2. Fetch linked estimate_request if exists
        const estId = b?.estimate_request_id || currentSub.estimate_request_id;
        const { data: est } = estId
          ? await supabase.from('estimate_requests').select('*').eq('id', estId).maybeSingle()
          : { data: null };

        // 3. Fetch customer and profile for real customer information
        const cUid = currentSub.customer_user_id;
        const { data: cust } = await supabase.from('customers').select('*').eq('user_id', cUid).maybeSingle();
        const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', cUid).maybeSingle();

        // 4. Fetch payment summary
        const { data: summary } = await supabase
          .from('booking_payment_summary')
          .select('*')
          .eq('booking_id', currentSub.booking_id)
          .maybeSingle();

        if (!isMounted) return;

        // Resolve Customer Name (first_name/last_name > display_name > email)
        const custName = cust?.first_name
          ? `${cust.first_name} ${cust.last_name || ''}`.trim()
          : cust?.display_name && cust.display_name !== 'ลูกค้าประจำ'
          ? cust.display_name
          : prof?.display_name && prof.display_name !== 'ลูกค้าประจำ'
          ? prof.display_name
          : currentSub.customer_name || 'ลูกค้า';

        const custPhone = prof?.phone || cust?.phone || currentSub.customer_phone || 'ไม่ระบุ';

        // Resolve Artist Name
        const artistObj = Array.isArray(b?.artists) ? b.artists[0] : b?.artists;
        const artName = artistObj?.name
          ? `${artistObj.name}${artistObj.nickname ? ` (${artistObj.nickname})` : ''}`
          : currentSub.artist_name || 'ช่างสักประจำร้าน';

        // Resolve Appointment Date and Start/End Time primarily from booking_session
        const sessions = b?.booking_sessions || currentSub.sessions || [];
        let apptDate = 'ไม่ระบุ';
        let apptTime = 'ไม่ระบุเวลา';

        if (sessions && sessions.length > 0) {
          const activeSes = sessions.find((s: any) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS') || sessions[0];
          if (activeSes?.start_at) {
            apptDate = formatDateBangkok(activeSes.start_at);
            if (activeSes.end_at) {
              apptTime = `${formatTimeBangkok(activeSes.start_at)} – ${formatTimeBangkok(activeSes.end_at)}`;
            } else {
              apptTime = formatTimeBangkok(activeSes.start_at);
            }
          }
        } else if (b?.requested_date) {
          apptDate = formatDateBangkok(b.requested_date);
          apptTime = b.requested_start_time ? formatTimeBangkok(`2026-01-01T${b.requested_start_time}`) : 'ไม่ระบุเวลา';
        } else if (currentSub.requested_date) {
          apptDate = formatDateBangkok(currentSub.requested_date);
        }

        // Resolve original tattoo reference images: estimate_requests -> booking -> artwork_image_url
        let images: string[] = [];
        if (est?.reference_images && Array.isArray(est.reference_images) && est.reference_images.length > 0) {
          images = est.reference_images;
        } else if (currentSub.estimate_reference_images && currentSub.estimate_reference_images.length > 0) {
          images = currentSub.estimate_reference_images;
        } else if (b?.reference_images && Array.isArray(b.reference_images) && b.reference_images.length > 0) {
          images = b.reference_images;
        } else if (currentSub.reference_images && currentSub.reference_images.length > 0) {
          images = currentSub.reference_images;
        } else if (b?.artwork_image_url) {
          images = [b.artwork_image_url];
        } else if (currentSub.artwork_image_url) {
          images = [currentSub.artwork_image_url];
        }

        setHydratedDetails({
          customerName: custName,
          customerPhone: custPhone,
          artistName: artName,
          appointmentDate: apptDate,
          appointmentTime: apptTime,
          bookingStatus: b?.status || currentSub.booking_status || 'WAITING_DEPOSIT',
          placement: b?.placement || est?.placement || currentSub.placement || 'ไม่ระบุ',
          widthCm: b?.width_cm ?? est?.width_cm ?? currentSub.width_cm ?? null,
          heightCm: b?.height_cm ?? est?.height_cm ?? currentSub.height_cm ?? null,
          style: est?.style || currentSub.style || 'Custom',
          description: est?.description || b?.description || currentSub.description || '',
          quotedPrice: Number(summary?.quoted_price ?? est?.quoted_price ?? currentSub.quoted_price ?? 0),
          depositRequired: Number(summary?.deposit_required ?? est?.deposit_required ?? currentSub.deposit_required ?? 0),
          paidTotal: Number(summary?.paid_total ?? currentSub.paid_total ?? 0),
          refImages: images,
        });
      } catch (err) {
        console.error('[PaymentSubmissionReviewDrawer] Hydration error:', err);
      }
    }

    loadFullData();

    return () => {
      isMounted = false;
    };
  }, [submission, supabase]);

  // Sync Form defaults when submission changes
  useEffect(() => {
    if (submission) {
      setVerifiedAmount(submission.claimed_amount.toString());
      setPaymentMethod('BANK_TRANSFER');
      setReferenceNo(submission.reference_no || '');
      setAdminNote('');
      setIsRejectDialogOpen(false);
      setRejectionReason('');

      // Fetch Slip Signed URL
      if (submission.slip_path) {
        setLoadingSlip(true);
        supabase.storage
          .from('booking-payment-slips')
          .createSignedUrl(submission.slip_path, 3600)
          .then(({ data }) => {
            setSlipSignedUrl(data?.signedUrl || null);
            setLoadingSlip(false);
          })
          .catch(() => {
            setSlipSignedUrl(null);
            setLoadingSlip(false);
          });
      } else {
        setSlipSignedUrl(null);
      }
    }
  }, [submission, supabase]);

  if (!isOpen || !submission) return null;

  const verifiedAmountNum = parseFloat(verifiedAmount) || 0;
  const depRequiredNum = hydratedDetails?.depositRequired ?? submission.deposit_required ?? 0;
  const paidTotalNum = hydratedDetails?.paidTotal ?? submission.paid_total ?? 0;
  const outstandingNum = Math.max(0, depRequiredNum - paidTotalNum);
  const isOverpayment = verifiedAmountNum > outstandingNum && outstandingNum > 0;

  // Format Helpers
  const formatCurrency = (amount: number) => {
    return Number(amount || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatThaiDate = (dateStr?: string | null) => {
    if (!dateStr) return 'ไม่ระบุ';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Handle Approve Action
  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (verifiedAmountNum <= 0) {
      onError('กรุณาระบุยอดเงินที่ตรวจสอบแล้วที่มากกว่า 0 บาท');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('admin_approve_payment_submission', {
        p_submission_id: submission.id,
        p_verified_amount: verifiedAmountNum,
        p_payment_method: paymentMethod,
        p_reference_no: referenceNo.trim() ? referenceNo.trim() : null,
        p_admin_note: adminNote.trim() ? adminNote.trim() : null,
      });

      if (error) {
        console.error('Approval RPC Error:', error);
        throw new Error(error.message || 'ไม่สามารถอนุมัติสลิปได้');
      }

      const remainingAfter = Math.max(0, outstandingNum - verifiedAmountNum);
      if (remainingAfter === 0) {
        onSuccess('ยืนยันการชำระเงินเรียบร้อย — คิวยืนยันแล้ว');
      } else {
        onSuccess('บันทึกรับมัดจำแล้ว — ยังมียอดมัดจำคงเหลือ ฿' + formatCurrency(remainingAfter));
      }
      onClose();
    } catch (err: any) {
      onError(err.message || 'เกิดข้อผิดพลาดในการอนุมัติสลิป');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reject Action
  const handleReject = async () => {
    if (isRejecting) return;

    if (!rejectionReason.trim()) {
      onError('กรุณาระบุเหตุผลในการปฏิเสธหลักฐาน');
      return;
    }

    setIsRejecting(true);
    try {
      const { data, error } = await supabase.rpc('admin_reject_payment_submission', {
        p_submission_id: submission.id,
        p_rejection_reason: rejectionReason.trim(),
      });

      if (error) {
        console.error('Reject RPC Error:', error);
        throw new Error(error.message || 'ไม่สามารถปฏิเสธสลิปได้');
      }

      onSuccess('ปฏิเสธหลักฐานการชำระเงินเรียบร้อยแล้ว');
      onClose();
    } catch (err: any) {
      onError(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธสลิป');
    } finally {
      setIsRejecting(false);
    }
  };

  const displayCustName = hydratedDetails?.customerName || submission.customer_name || 'ลูกค้า';
  const displayCustPhone = hydratedDetails?.customerPhone || submission.customer_phone;
  const displayArtistName = hydratedDetails?.artistName || submission.artist_name || 'ยังไม่มอบหมายช่าง';
  const displayApptDate = hydratedDetails?.appointmentDate || 'ไม่ระบุวัน';
  const displayApptTime = hydratedDetails?.appointmentTime || 'ไม่ระบุเวลา';
  const displayPlacement = hydratedDetails?.placement || submission.placement || 'ไม่ระบุ';
  const wCm = hydratedDetails?.widthCm ?? submission.width_cm;
  const hCm = hydratedDetails?.heightCm ?? submission.height_cm;
  const displaySize = wCm && hCm ? `${wCm} × ${hCm} ซม.` : 'ไม่ระบุขนาด';
  const displayStyle = hydratedDetails?.style || submission.style || 'ไม่ระบุ';
  const displayQuotedPrice = hydratedDetails?.quotedPrice ?? submission.quoted_price ?? 0;
  const descriptionDisplay = hydratedDetails?.description || 'ไม่มีคำอธิบายเพิ่มเติม';
  const refImages = hydratedDetails?.refImages || [];

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
                  ตรวจสอบสลิปการโอนเงิน
                </h3>
                <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded text-xs font-semibold animate-pulse">
                  สลิปรอตรวจ
                </span>
              </div>
              <p className="text-[10px] text-[#7A7265] mt-0.5">
                คิว #{submission.booking_id.slice(0, 8)} • ส่งเมื่อ: {formatThaiDate(submission.submitted_at)} {formatTimeBangkok(submission.submitted_at)}
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Customer Information Card */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-semibold text-[#7A7265] uppercase tracking-wider block">
              ข้อมูลลูกค้า
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                <User size={14} className="text-[#9C2F2F]" />
                {displayCustName}
              </span>
              {displayCustPhone && displayCustPhone !== 'ไม่ระบุ' ? (
                <a
                  href={`tel:${displayCustPhone}`}
                  className="text-xs text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-1 bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A]/50"
                >
                  <Phone size={11} className="text-emerald-400" />
                  {displayCustPhone}
                </a>
              ) : (
                <span className="text-xs text-[#7A7265] bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A]/50">
                  ไม่ระบุเบอร์โทร
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-[#4A443A]/40">
              <span className="text-[11px] text-[#7A7265]">ยืนยันเงื่อนไขก่อนรับบริการ:</span>
              <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                <CheckCircle2 size={11} />
                <span>✓ ยืนยันแล้ว</span>
              </span>
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
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{displayArtistName}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">สไตล์งาน</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{displayStyle}</span>
              </div>

              {/* Row 2: Placement & Size */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">ตำแหน่งสัก</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{displayPlacement}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">ขนาดงาน</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{displaySize}</span>
              </div>

              {/* Row 3: Date & Time */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">วันนัดหมาย</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{displayApptDate}</span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">เวลา</span>
                <span className="font-medium text-[#ECE4D3] mt-0.5 block truncate">{displayApptTime}</span>
              </div>

              {/* Row 4: Price & Deposit */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">ราคางานสัก</span>
                <span className="font-semibold text-[#ECE4D3] mt-0.5 block truncate">
                  {displayQuotedPrice > 0 ? `฿${formatCurrency(displayQuotedPrice)}` : 'ไม่ระบุ'}
                </span>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0">
                <span className="text-[10px] text-[#7A7265] block">เงินมัดจำ</span>
                <span className="font-semibold text-emerald-400 mt-0.5 block truncate">
                  {depRequiredNum > 0 ? `฿${formatCurrency(depRequiredNum)}` : 'ไม่มีมัดจำ'}
                </span>
              </div>

              {/* Full Width: Description */}
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 min-w-0 col-span-2">
                <span className="text-[10px] text-[#7A7265] block mb-1">รายละเอียดงานสัก</span>
                <p className="text-[#ECE4D3] font-light leading-relaxed whitespace-pre-wrap break-words">
                  {hydratedDetails?.description || 'ไม่มีคำอธิบายเพิ่มเติม'}
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
                        onClick={() => {
                          setPreviewImage(imgUrl);
                          setIsLightboxOpen(true);
                        }}
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

          {/* Compact Payment Evidence Section */}
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
                  ฿{formatCurrency(submission.claimed_amount)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#4A443A]/30">
                <span className="text-[#A89F91]">หลักฐานที่ส่ง:</span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewImage(null);
                    setIsLightboxOpen(true);
                  }}
                  className="px-3 py-1 bg-amber-950/70 hover:bg-amber-900 active:bg-amber-950 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Eye size={14} />
                  <span>ดูสลิป</span>
                </button>
              </div>
            </div>

            {/* Actions: Side-by-side buttons */}
            {submission.status === 'PENDING' && (
              isRejectDialogOpen ? (
                <form onSubmit={handleReject} className="pt-2 border-t border-[#4A443A]/40 space-y-2.5 animate-fadeIn">
                  <span className="text-[11px] text-red-400 font-semibold block">ระบุเหตุผลในการปฏิเสธสลิป</span>
                  <input
                    type="text"
                    required
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="เช่น สลิปไม่ชัดเจน, ไม่พบยอดเงินโอน..."
                    className="w-full bg-[#171512] border border-[#4A443A] rounded-lg p-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-red-400"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejectDialogOpen(false)}
                      className="px-3 py-1.5 bg-[#171512] text-xs text-[#A89F91] rounded border border-[#4A443A] hover:text-[#ECE4D3]"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={isRejecting || !rejectionReason.trim()}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white rounded font-medium disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isRejecting ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>กำลังบันทึก...</span>
                        </>
                      ) : (
                        <span>ยืนยันปฏิเสธสลิป</span>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleApprove}
                    className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50 min-w-0"
                  >
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span className="truncate">{isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการชำระเงิน'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRejectDialogOpen(true)}
                    className="px-3 py-2.5 bg-red-950/60 hover:bg-red-900/80 active:bg-red-900 text-red-300 border border-red-800/80 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
                  >
                    <Ban size={15} className="shrink-0" />
                    <span className="truncate">ปฏิเสธสลิป</span>
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Zoom Modal */}
      {isLightboxOpen && (
        <div
          onClick={() => {
            setIsLightboxOpen(false);
            setPreviewImage(null);
          }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm cursor-pointer animate-fadeIn"
        >
          <div className="max-w-full max-h-[90vh] overflow-hidden rounded-lg shadow-2xl flex items-center justify-center">
            {previewImage ? (
              <CustomerReferenceImage
                src={previewImage}
                alt="Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <PaymentSlipImage
                src={slipSignedUrl || (submission as any).proof_image_url || submission.slip_path}
                alt="Payment Slip Proof"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              />
            )}
          </div>
          <button
            onClick={() => {
              setIsLightboxOpen(false);
              setPreviewImage(null);
            }}
            className="absolute top-4 right-4 text-white bg-[#171512] border border-[#4A443A] p-2 rounded-full"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
