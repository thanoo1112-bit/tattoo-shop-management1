'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
  Maximize2,
  Eye,
  Ban,
  RefreshCw,
} from 'lucide-react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import PaymentSlipLightbox from '@/components/common/PaymentSlipLightbox';
import { formatDateBangkok, formatTimeBangkok } from '@/components/admin/calendar/calendarUtils';
import { createClient } from '@/lib/supabase/client';

interface ArtistPaymentReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submission: any;
  booking: any;
  estimate: any;
  customerName: string;
  customerPhone: string;
  depositRequired: number;
}

export default function ArtistPaymentReviewDrawer({
  isOpen,
  onClose,
  submission,
  booking,
  estimate,
  customerName,
  customerPhone,
  depositRequired,
}: ArtistPaymentReviewDrawerProps) {
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [confirmationState, setConfirmationState] = useState<'loading' | 'confirmed' | 'not_confirmed' | 'error'>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const customerUserId = estimate?.customer_user_id || booking?.customer_user_id || submission?.customer_user_id;

  useEffect(() => {
    if (!isOpen) return;

    if (estimate?.is_age_confirmed === true || booking?.is_age_confirmed === true) {
      setConfirmationState('confirmed');
      return;
    }

    if (!customerUserId) {
      setConfirmationState('not_confirmed');
      return;
    }

    let isMounted = true;
    setConfirmationState('loading');

    const supabase = createClient();
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
  }, [isOpen, customerUserId, estimate?.is_age_confirmed]);

  if (!isOpen || !submission) return null;

  // Resolve customer tattoo reference images
  const refImages: string[] = (estimate?.reference_images && estimate.reference_images.length > 0)
    ? estimate.reference_images
    : (booking?.reference_images && booking.reference_images.length > 0)
    ? booking.reference_images
    : (booking?.artwork_image_url ? [booking.artwork_image_url] : []);

  const artworkTitle = booking?.artwork_title || estimate?.style || 'งานสัก Custom';
  const placement = booking?.placement || estimate?.placement || 'ไม่ระบุ';
  const widthCm = booking?.width_cm || estimate?.width_cm || null;
  const heightCm = booking?.height_cm || estimate?.height_cm || null;
  const tattooSize = widthCm && heightCm ? `${widthCm} × ${heightCm} ซม.` : 'ไม่ระบุขนาด';
  const description = estimate?.description || booking?.description || '';
  const quotedPrice = Number(booking?.total_price ?? estimate?.quoted_price ?? 0);

  const appointmentDate = booking?.requested_date
    ? formatDateBangkok(booking.requested_date)
    : estimate?.preferred_date
    ? formatDateBangkok(estimate.preferred_date)
    : 'รอนัดหมาย';

  const appointmentTime = booking?.requested_start_time
    ? formatTimeBangkok(`2026-01-01T${booking.requested_start_time}`)
    : 'ไม่ระบุเวลา';

  const formatCurrency = (amount: number) => {
    return Number(amount || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fadeIn font-prompt"
      />

      {/* Drawer Container (Right-side slide drawer matching Admin) */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] md:w-[600px] bg-studio-main border-l border-studio-border shadow-2xl flex flex-col font-prompt animate-slideInRight">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between bg-studio-card">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-studio-main border border-studio-border flex items-center justify-center text-studio-red">
              <Calendar size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-heading font-semibold text-studio-primary">
                  ตรวจสอบสลิปการโอนเงิน
                </h3>
                <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded text-xs font-semibold animate-pulse">
                  สลิปรอตรวจ
                </span>
              </div>
              <p className="text-[10px] text-studio-muted mt-0.5">
                คิว #{booking?.id?.slice(0, 8) || submission.booking_id.slice(0, 8)} • ส่งเมื่อ: {formatDateBangkok(submission.submitted_at, true)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-studio-muted hover:text-studio-primary hover:bg-studio-sec rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Card 1: ข้อมูลลูกค้า */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-3.5 space-y-2 shadow-sm">
            <span className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider block">
              ข้อมูลลูกค้า
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-studio-primary flex items-center gap-1.5">
                <User size={14} className="text-studio-red" />
                {customerName}
              </span>
              {customerPhone && customerPhone !== 'ไม่ระบุ' ? (
                <a
                  href={`tel:${customerPhone}`}
                  className="text-xs text-studio-secondary hover:text-studio-primary flex items-center gap-1 bg-studio-main px-2 py-0.5 rounded border border-studio-border"
                >
                  <Phone size={11} className="text-emerald-400" />
                  {customerPhone}
                </a>
              ) : (
                <span className="text-xs text-studio-muted bg-studio-main px-2 py-0.5 rounded border border-studio-border">
                  ไม่ระบุเบอร์โทร
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-studio-border/40">
              <span className="text-[11px] text-studio-muted">การยืนยันอายุและเงื่อนไข:</span>
              {confirmationState === 'loading' ? (
                <span className="text-studio-muted bg-studio-main px-2 py-0.5 rounded text-[10px]">
                  กำลังตรวจสอบ...
                </span>
              ) : confirmationState === 'confirmed' ? (
                <span className="text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  <span>ยืนยันแล้ว</span>
                </span>
              ) : confirmationState === 'error' ? (
                <span className="text-amber-400/80 bg-amber-950/30 border border-amber-800/30 px-2 py-0.5 rounded text-[10px]">
                  ! ไม่สามารถตรวจสอบได้
                </span>
              ) : (
                <span className="text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
                  ยังไม่ยืนยัน
                </span>
              )}
            </div>
          </div>

          {/* Card 2: รายละเอียดคิวงาน (2-Column Grid Layout matching Admin) */}
          <div className="bg-studio-card border border-studio-border rounded-xl p-3.5 space-y-3 shadow-sm">
            <span className="text-[11px] font-semibold text-studio-muted uppercase tracking-wider block">
              รายละเอียดคิวงาน
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Row 1: Style & Placement */}
              <div className="bg-studio-main p-2.5 rounded-lg border border-studio-border/60 min-w-0">
                <span className="text-[10px] text-studio-muted block">สไตล์งาน</span>
                <span className="font-medium text-studio-primary mt-0.5 block truncate">{artworkTitle}</span>
              </div>

              <div className="bg-studio-main p-2.5 rounded-lg border border-studio-border/60 min-w-0">
                <span className="text-[10px] text-studio-muted block">ตำแหน่งสัก</span>
                <span className="font-medium text-studio-primary mt-0.5 block truncate">{placement}</span>
              </div>

              {/* Row 2: Size & Quoted Price */}
              <div className="bg-studio-main p-2.5 rounded-lg border border-studio-border/60 min-w-0">
                <span className="text-[10px] text-studio-muted block">ขนาดงาน</span>
                <span className="font-medium text-studio-primary mt-0.5 block truncate">{tattooSize}</span>
              </div>

              <div className="bg-studio-main p-2.5 rounded-lg border border-studio-border/60 min-w-0">
                <span className="text-[10px] text-studio-muted block">ราคางานสัก</span>
                <span className="font-semibold text-studio-primary mt-0.5 block truncate">
                  {quotedPrice > 0 ? `฿${formatCurrency(quotedPrice)}` : 'ไม่ระบุ'}
                </span>
              </div>

              {/* Row 3: Appt Date & Time */}
              <div className="bg-studio-main p-2.5 rounded-lg border border-studio-border/60 min-w-0">
                <span className="text-[10px] text-studio-muted block">วันนัดหมาย</span>
                <span className="font-medium text-studio-primary mt-0.5 block truncate">{appointmentDate}</span>
              </div>

              <div className="bg-studio-main p-2.5 rounded-lg border border-studio-border/60 min-w-0">
                <span className="text-[10px] text-studio-muted block">เวลา</span>
                <span className="font-medium text-studio-primary mt-0.5 block truncate">{appointmentTime}</span>
              </div>

              {/* Full Width: Description */}
              {description && (
                <div className="bg-studio-main p-2.5 rounded-lg border border-studio-border/60 min-w-0 col-span-2">
                  <span className="text-[10px] text-studio-muted block mb-1">รายละเอียดงานสัก</span>
                  <p className="text-studio-primary font-light leading-relaxed whitespace-pre-wrap break-words">
                    {description}
                  </p>
                </div>
              )}

              {/* Full Width: Reference Gallery */}
              {refImages.length > 0 && (
                <div className="col-span-2 pt-1">
                  <span className="text-[10px] text-studio-muted block mb-1.5 flex items-center gap-1">
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
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border border-studio-border bg-studio-main cursor-pointer hover:border-studio-primary transition-all relative group"
                      >
                        <CustomerReferenceImage src={imgUrl} alt={`Reference ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Maximize2 size={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: หลักฐานการชำระเงินมัดจำ (Payment Summary & Proof) */}
          <div className="bg-studio-card border border-amber-900/60 rounded-xl p-3.5 space-y-3 shadow-sm font-prompt">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block">
                หลักฐานการชำระเงินมัดจำ
              </span>
              <span className="bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded text-xs font-semibold animate-pulse">
                สลิปรอตรวจ
              </span>
            </div>

            <div className="space-y-2 bg-studio-main p-2.5 rounded-lg border border-studio-border/60 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-studio-muted">ยอดมัดจำที่ต้องชำระ:</span>
                <span className="font-bold text-studio-red font-mono">
                  ฿{formatCurrency(depositRequired)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-studio-border/30 pt-2">
                <span className="text-studio-muted">ยอดเงินที่ลูกค้าแจ้ง:</span>
                <span className="text-sm font-bold text-amber-400 font-mono">
                  ฿{formatCurrency(Number(submission.claimed_amount))}
                </span>
              </div>

              {submission.reference_no && (
                <div className="flex items-center justify-between gap-2 border-t border-studio-border/30 pt-2">
                  <span className="text-studio-muted">เลขที่อ้างอิง:</span>
                  <span className="font-mono text-studio-primary">{submission.reference_no}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-studio-border/30">
                <span className="text-studio-muted">หลักฐานสลิป:</span>
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

            {/* Action Section for Artist */}
            <div className="pt-2 border-t border-studio-border/40 space-y-2">
              {actionError && (
                <div className="p-2.5 bg-red-950/60 border border-red-900/60 rounded-lg text-xs text-red-400">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded-lg text-xs text-emerald-300 font-semibold text-center">
                  {actionSuccess}
                </div>
              )}
              {submission.status === 'PENDING' && !actionSuccess && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async () => {
                    setActionError('');
                    setActionSuccess('');
                    setSubmitting(true);
                    try {
                      const supabase = createClient();
                      const amountToApprove = Number(submission.claimed_amount) || depositRequired || 500;
                      const { error: appErr } = await supabase.rpc('artist_approve_payment_submission', {
                        p_submission_id: submission.id,
                        p_verified_amount: amountToApprove,
                        p_payment_method: 'BANK_TRANSFER',
                        p_reference_no: submission.reference_no || null,
                        p_artist_note: 'ช่างตรวจสอบและอนุมัติสลิปมัดจำ'
                      });

                      if (appErr) {
                        console.error('Error approving payment submission:', appErr);
                        throw new Error(appErr.message || 'เกิดข้อผิดพลาดในการอนุมัติสลิป');
                      }

                      setActionSuccess('อนุมัติสลิปและยืนยันคิวเรียบร้อยแล้ว');
                      setTimeout(() => {
                        onClose();
                        if (typeof window !== 'undefined') window.location.reload();
                      }, 1000);
                    } catch (err: any) {
                      setActionError(err.message || 'ไม่สามารถอนุมัติสลิปได้');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>กำลังยืนยันคิว...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>ตรวจสอบสลิปผ่าน & ยืนยันคิว</span>
                    </>
                  )}
                </button>
              )}
            </div>
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
                src={submission.slip_path}
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
            className="absolute top-4 right-4 text-white bg-studio-card border border-studio-border p-2 rounded-full cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </>
  );
}
