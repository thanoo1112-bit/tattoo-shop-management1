'use client';

import React, { useState } from 'react';
import { CustomerPortalBooking, CustomerPortalEstimate } from './types';
import { createClient } from '@/lib/supabase/client';
import BookingStatusBadge from './BookingStatusBadge';
import {
  X,
  Calendar,
  Clock,
  User,
  Maximize2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Layers,
  FileText,
  BadgeDollarSign,
  Sparkles,
  MapPin,
  Palette,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from 'lucide-react';
import { formatThaiDate, formatTimeBangkok, formatCurrency, resolveCustomerDisplayStatus, formatServiceTypeLabel } from './portalUtils';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import CustomerDepositPaymentSection from './CustomerDepositPaymentSection';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';

interface CustomerBookingDetailProps {
  item: CustomerPortalBooking | CustomerPortalEstimate;
  type: 'estimate' | 'booking';
  estimates?: CustomerPortalEstimate[];
  onClose: () => void;
  onRefresh?: () => void;
  onTransitionToBooking?: (estimate: CustomerPortalEstimate) => void;
}

export default function CustomerBookingDetail({
  item,
  type,
  estimates,
  onClose,
  onRefresh,
}: CustomerBookingDetailProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isBooking = type === 'booking';
  const booking = item as CustomerPortalBooking;
  const estimate = item as CustomerPortalEstimate;

  const hasPendingSlip = Boolean((item as any).has_pending_payment_submission);
  const displayStatus = resolveCustomerDisplayStatus(item.status, hasPendingSlip);

  const artistDisplayName = item.artist?.name
    ? `${item.artist.name}${item.artist.nickname ? ` (${item.artist.nickname})` : ''}`
    : 'ช่างสักประจำร้าน';

  // Cancel Booking Request RPC (Strictly allowed ONLY when status is PENDING)
  const handleCancelBooking = async () => {
    if (!window.confirm('ท่านต้องการยกเลิกคำขอจองคิวนี้ใช่หรือไม่?')) return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('cancel_booking_request', {
        p_booking_id: booking.id,
      });

      if (rpcError) throw rpcError;

      if (onRefresh) onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถยกเลิกคำขอจองได้');
    } finally {
      setLoading(false);
    }
  };

  const canCancelBooking = isBooking && booking.status === 'PENDING';

  // ESC keypress listener for Lightbox
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      }
    };
    if (lightboxIndex !== null) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxIndex]);

  // Reference Images array
  const referenceImages = isBooking
    ? (booking.reference_images && booking.reference_images.length > 0
        ? booking.reference_images
        : (booking.artwork_image_url ? [booking.artwork_image_url] : []))
    : (estimate.reference_images || []);

  // Preview Image
  const previewImage = referenceImages[0] || null;

  const depositAmount = isBooking
    ? booking.financial?.deposit_required
    : estimate.deposit_required;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-studio-main/80 backdrop-blur-sm animate-fadeIn font-prompt">
      <div className="relative w-full max-w-lg bg-studio-card border border-studio-border rounded-[8px] overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-10 p-1.5 bg-studio-main/60 hover:bg-studio-red text-studio-primary rounded-full transition-colors duration-200"
          title="ปิด"
        >
          <X size={16} />
        </button>

        {/* Scrollable Container */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Header */}
          <div className="border-b border-studio-border pb-4 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider text-studio-red font-semibold block">
                  {isBooking ? 'รายละเอียดคิวจองสัก' : 'รายละเอียดคำขอจองคิว'}
                </span>
                <span className="text-[10px] text-studio-muted font-mono">
                  #{item.id.slice(0, 8)}
                </span>
                {isBooking && booking.estimate_request_id && (
                  <span className="text-[10px] text-studio-muted font-mono">
                    (สร้างจากคำขอ #{booking.estimate_request_id.slice(0, 8).toUpperCase()})
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-studio-primary mt-1">
                {isBooking
                  ? booking.artwork_title || 'งานสัก Custom'
                  : `งานสักสไตล์ ${estimate.style || 'Custom'}`}
              </h3>
            </div>
            <BookingStatusBadge status={displayStatus as any} type={type} />
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-[10px] text-red-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Status Context Banner */}
          {item.status === 'PENDING' && (
            <div className="bg-[#171512] border border-[#4A443A] p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#ECE4D3]">
                <Clock size={14} className="text-[#9C2F2F] animate-pulse" />
                <span>ส่งคำขอจองแล้ว (รอร้านตรวจสอบ)</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                ทางร้านได้รับคำขอจองคิวของคุณแล้ว ขณะนี้กำลังรอช่างสักและผู้จัดการร้านตรวจสอบรายละเอียด วันที่สะดวก และจัดคิวงานให้คุณ
              </p>
            </div>
          )}

          {item.status === 'WAITING_DEPOSIT' && (
            <div className="bg-[#171512] border border-[#9C2F2F]/50 p-3.5 rounded-[6px] space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#ECE4D3]">
                  <Wallet size={14} className="text-studio-red" />
                  <span>ยืนยันคิวแล้ว — รอชำระเงินมัดจำ</span>
                </div>
                {depositAmount && depositAmount > 0 && (
                  <span className="text-xs font-bold text-studio-red">
                    ฿{formatCurrency(depositAmount)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                ทางร้านได้กำหนดวันและเวลาคิวสักให้เรียบร้อยแล้ว กรุณาชำระเงินมัดจำเพื่อยืนยันและล็อกคิวการนัดหมายอย่างสมบูรณ์
              </p>
            </div>
          )}

          {item.status === 'CONFIRMED' && (
            <div className="bg-[#171512] border border-emerald-800/40 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 size={14} />
                <span>ยืนยันคิวเรียบร้อยแล้ว</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                คิวสักของคุณได้รับการยืนยันและลงตารางนัดหมายเรียบร้อยแล้ว กรุณาเดินทางมาถึงสตูดิโอก่อนเวลานัดหมาย 10-15 นาที
              </p>
            </div>
          )}

          {item.status === 'IN_PROGRESS' && (
            <div className="bg-[#171512] border border-[#9C2F2F]/60 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-studio-red">
                <Sparkles size={14} />
                <span>กำลังดำเนินงานสัก</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                คิวสักของคุณกำลังอยู่ในขั้นตอนการให้บริการสักที่สตูดิโอ
              </p>
            </div>
          )}

          {item.status === 'COMPLETED' && (
            <div className="bg-[#171512] border border-[#4A443A] p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <CheckCircle2 size={14} />
                <span>งานสักเสร็จสิ้นแล้ว</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                ขอบคุณที่ไว้วางใจใช้บริการกับ 157 TATTOO Studio ดูแลรอยสักตามคำแนะนำของช่างเพื่อผลลัพธ์ที่ดีที่สุด
              </p>
            </div>
          )}

          {item.status === 'REJECTED' && (
            <div className="bg-red-950/30 border border-red-900/40 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-red-400">
                <AlertTriangle size={14} />
                <span>
                  {(booking.rejection_reason || estimate.quote_note || '').includes('มัดจำ')
                    ? 'ปฏิเสธ — ไม่ได้ชำระมัดจำภายในเวลาที่กำหนด'
                    : 'ไม่สามารถรับคำขอนี้ได้'}
                </span>
              </div>
              <p className="text-[11px] text-red-300/80 leading-relaxed font-light">
                {booking.rejection_reason || estimate.quote_note || 'ขออภัย ทางร้านไม่สามารถรับคำขอจองนี้ได้เนื่องจากคิวงานเต็มหรือไม่ตรงตามเงื่อนไข'}
              </p>
            </div>
          )}

          {item.status === 'CANCELLED' && (
            <div className="bg-[#171512] border border-red-900/30 p-3.5 rounded-[6px] space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[#A89F91]">
                <X size={14} className="text-red-400" />
                <span>ยกเลิกคิวแล้ว</span>
              </div>
              <p className="text-[11px] text-[#A89F91] leading-relaxed font-light">
                รายการจองคิวนี้ถูกยกเลิกแล้ว
              </p>
            </div>
          )}

          {/* Reference Image Gallery */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-studio-secondary block">
              รูปภาพอ้างอิง {referenceImages.length > 0 ? `(${referenceImages.length} รูป)` : ''}
            </span>
            {referenceImages.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 max-w-full">
                {referenceImages.slice(0, 5).map((imgUrl, idx) => (
                  <div
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-[6px] border border-studio-border hover:border-studio-red bg-studio-main overflow-hidden shrink-0 cursor-pointer group shadow-sm transition-all"
                    title={`คลิกเพื่อดูรูปที่ ${idx + 1}`}
                  >
                    <CustomerReferenceImage
                      src={imgUrl}
                      alt={`Reference ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ZoomIn size={16} className="text-white" />
                    </div>
                    <span className="absolute bottom-1 left-1 bg-black/80 text-[9px] font-mono text-[#ECE4D3] px-1 py-0.2 rounded border border-white/10 select-none">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2.5 bg-studio-main border border-studio-border/60 rounded-[6px] text-center text-xs text-studio-muted italic font-light">
                ไม่มีรูปอ้างอิง
              </div>
            )}
          </div>

          {/* Core Info Specs Grid */}
          <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] space-y-3 text-xs text-studio-primary">
            <div className="flex justify-between">
              <span className="text-studio-secondary flex items-center gap-1.5">
                <User size={13} /> ช่างสัก
              </span>
              <span className="font-semibold">{artistDisplayName}</span>
            </div>

            {isBooking ? (
              <>
                {/* 1. Booking Requested Date */}
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Calendar size={13} /> วันที่ระบุในคำขอ
                  </span>
                  <span className="font-semibold">
                    {formatThaiDate(booking.requested_date, true)}
                  </span>
                </div>

                {/* 2. Multi-Session Schedule List (Real appointment time) */}
                {booking.sessions && booking.sessions.length > 0 && (
                  <div className="pt-2 border-t border-studio-border/30 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-studio-primary">
                      <span className="flex items-center gap-1 text-studio-red">
                        <Layers size={12} /> รอบการนัดหมายสักจริง ({booking.sessions.length} รอบ)
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {booking.sessions.map((ses) => (
                        <div
                          key={ses.id}
                          className="bg-studio-card/80 border border-studio-border/60 p-2 rounded-[4px] flex items-center justify-between text-[11px]"
                        >
                          <div className="space-y-0.5">
                            <span className="font-bold text-studio-primary">
                              รอบ #{ses.session_number} — {formatThaiDate(ses.start_at)}
                            </span>
                            <div className="text-[10px] text-studio-secondary flex items-center gap-1">
                              <Clock size={10} className="text-studio-red" />
                              <span>
                                {formatTimeBangkok(ses.start_at)} - {formatTimeBangkok(ses.end_at)} น.
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                              ses.status === 'IN_PROGRESS'
                                ? 'bg-studio-red/20 text-studio-red border border-studio-red/40'
                                : ses.status === 'COMPLETED'
                                ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                                : 'bg-[#171512] text-[#ECE4D3] border border-[#4A443A]'
                            }`}
                          >
                            {ses.status === 'IN_PROGRESS'
                              ? 'กำลังสัก'
                              : ses.status === 'COMPLETED'
                              ? 'เสร็จสิ้น'
                              : ses.status === 'CANCELLED'
                              ? 'ยกเลิก'
                              : 'นัดหมายแล้ว'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Placement & Dimensions */}
                {(booking.placement || booking.width_cm || booking.height_cm) && (
                  <div className="pt-2 border-t border-studio-border/30 space-y-2">
                    {booking.placement && (
                      <div className="flex justify-between">
                        <span className="text-studio-secondary flex items-center gap-1.5">
                          <MapPin size={13} /> ตำแหน่งที่สัก
                        </span>
                        <span className="font-semibold">{booking.placement}</span>
                      </div>
                    )}
                    {booking.width_cm && booking.height_cm && (
                      <div className="flex justify-between">
                        <span className="text-studio-secondary flex items-center gap-1.5">
                          <Maximize2 size={13} /> ขนาดรอยสัก
                        </span>
                        <span className="font-semibold">
                          {booking.width_cm} x {booking.height_cm} ซม.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Financial Summary Breakdown */}
                {booking.financial && (booking.financial.quoted_price || booking.financial.deposit_required) && (
                  <div className="pt-2 border-t border-studio-border/30 space-y-1.5">
                    {Boolean(booking.financial.quoted_price && booking.financial.quoted_price > 0) && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-studio-secondary flex items-center gap-1.5">
                          <BadgeDollarSign size={13} /> ราคางานสัก
                        </span>
                        <span className="font-semibold text-studio-primary">
                          ฿{formatCurrency(booking.financial.quoted_price!)}
                        </span>
                      </div>
                    )}
                    {Boolean(booking.financial.deposit_required && booking.financial.deposit_required > 0) && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-studio-secondary flex items-center gap-1.5">
                          <Wallet size={13} /> มัดจำ
                        </span>
                        <span className="font-semibold text-studio-red">
                          ฿{formatCurrency(booking.financial.deposit_required!)}
                        </span>
                      </div>
                    )}
                    {Boolean(booking.financial.quoted_price && booking.financial.quoted_price > 0) && (
                      <div className="flex justify-between items-center text-xs pt-1 border-t border-studio-border/20">
                        <span className="text-studio-primary font-bold flex items-center gap-1.5">
                          ชำระวันจริง
                        </span>
                        <span className="font-bold text-emerald-400">
                          ฿{formatCurrency((booking.financial.quoted_price || 0) - (booking.financial.deposit_required || 0))}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Deposit Payment Section (QR, Slip Upload & Verification Status) */}
                {(booking.status === 'WAITING_DEPOSIT' ||
                  booking.status === 'CONFIRMED' ||
                  Boolean(booking.financial && (booking.financial.deposit_required || booking.financial.paid_total > 0))) && (
                  <div className="pt-2 border-t border-studio-border/30">
                    <CustomerDepositPaymentSection
                      booking={booking}
                      onRefresh={onRefresh}
                    />
                  </div>
                )}


                {/* 5. Customer Note */}
                {booking.customer_note && (
                  <div className="pt-2 border-t border-studio-border/20">
                    <span className="text-studio-secondary block mb-1">บันทึกจากลูกค้า:</span>
                    <p className="text-[11px] text-studio-secondary bg-studio-card/85 p-2 border border-studio-border/40 rounded-[4px] font-light">
                      {booking.customer_note}
                    </p>
                  </div>
                )}

                {/* 6. Admin Note */}
                {booking.admin_note && (
                  <div className="pt-2 border-t border-studio-border/20">
                    <span className="text-studio-secondary block mb-1">หมายเหตุจากทางร้าน:</span>
                    <p className="text-[11px] text-studio-primary bg-studio-card/85 p-2 border border-studio-border/40 rounded-[4px] font-light">
                      {booking.admin_note}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Maximize2 size={13} /> ขนาดรอยสัก
                  </span>
                  <span className="font-semibold">
                    {estimate.width_cm} x {estimate.height_cm} ซม.
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <MapPin size={13} /> ตำแหน่งที่สัก
                  </span>
                  <span className="font-semibold">{estimate.placement}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Palette size={13} /> สไตล์งาน
                  </span>
                  <span className="font-semibold">{estimate.style}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-studio-secondary flex items-center gap-1.5">
                    <Calendar size={13} /> วันที่สะดวก
                  </span>
                  <span className="font-semibold">
                    {formatThaiDate(estimate.preferred_date, true)}
                  </span>
                </div>
                {(() => {
                  const rawTime = estimate.preferred_time || (estimate as any).preferredTime || null;
                  const { cleanNote } = parseNoteWithPreferredTime(estimate.description);
                  let preferredTimeDisplay: string | null = null;
                  if (rawTime && rawTime.trim()) {
                    const hhmm = extractHHMM(rawTime.trim()) || rawTime.trim();
                    preferredTimeDisplay = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
                  }
                  return (
                    <>
                      {preferredTimeDisplay && (
                        <div className="flex justify-between">
                          <span className="text-studio-secondary flex items-center gap-1.5">
                            <Clock size={13} /> เวลาที่สะดวก
                          </span>
                          <span className="font-semibold text-studio-primary">
                            {preferredTimeDisplay}
                          </span>
                        </div>
                      )}

                      {/* Financial Summary Breakdown */}
                      {(estimate.quoted_price || estimate.deposit_required) && (
                        <div className="pt-2 border-t border-studio-border/30 space-y-1.5">
                          {Boolean(estimate.quoted_price && estimate.quoted_price > 0) && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-studio-secondary flex items-center gap-1.5">
                                <BadgeDollarSign size={13} /> ราคางานสัก
                              </span>
                              <span className="font-semibold text-studio-primary">
                                ฿{formatCurrency(estimate.quoted_price!)}
                              </span>
                            </div>
                          )}
                          {Boolean(estimate.deposit_required && estimate.deposit_required > 0) && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-studio-secondary flex items-center gap-1.5">
                                <Wallet size={13} /> มัดจำ
                              </span>
                              <span className="font-semibold text-studio-red">
                                ฿{formatCurrency(estimate.deposit_required!)}
                              </span>
                            </div>
                          )}
                          {Boolean(estimate.quoted_price && estimate.quoted_price > 0) && (
                            <div className="flex justify-between items-center text-xs pt-1 border-t border-studio-border/20">
                              <span className="text-studio-primary font-bold flex items-center gap-1.5">
                                ชำระวันจริง
                              </span>
                              <span className="font-bold text-emerald-400">
                                ฿{formatCurrency((estimate.quoted_price || 0) - (estimate.deposit_required || 0))}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {cleanNote && (
                        <div className="pt-2 border-t border-studio-border/20">
                          <span className="text-studio-secondary block mb-1">รายละเอียดเพิ่มเติม:</span>
                          <p className="text-[11px] text-studio-secondary leading-relaxed bg-studio-card/85 p-2 border border-studio-border/40 rounded-[4px] font-light">
                            {cleanNote}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>

          {/* Booking Actions: Cancel strictly only when PENDING */}
          {canCancelBooking && (
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleCancelBooking}
                disabled={loading}
                className="w-full bg-transparent border border-studio-border text-studio-secondary hover:text-red-400 hover:border-red-500/40 text-xs uppercase tracking-wider py-2 px-4 font-semibold transition-all rounded-[4px] disabled:opacity-50"
              >
                {loading ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอจองคิว'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Gallery Modal */}
      {lightboxIndex !== null && referenceImages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-pointer animate-fadeIn font-prompt"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white hover:text-studio-red bg-black/60 hover:bg-black/90 border border-white/20 p-2 rounded-full transition-colors z-20"
            title="ปิด (Esc)"
          >
            <X size={20} />
          </button>

          {/* Main Image Container */}
          <div
            className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <CustomerReferenceImage
              src={referenceImages[lightboxIndex]}
              alt={`Reference View ${lightboxIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
              showSkeleton={true}
            />
          </div>

          {/* Next / Previous Controls */}
          {referenceImages.length > 1 && (
            <div
              className="flex items-center space-x-4 mt-4 text-[#ECE4D3] z-20 select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev > 0 ? prev - 1 : referenceImages.length - 1) : 0
                  )
                }
                className="p-2 bg-studio-card border border-studio-border hover:border-studio-red hover:bg-studio-red text-white rounded-full transition-colors shadow-lg"
                title="รูปก่อนหน้า"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs font-mono font-semibold bg-studio-card px-3 py-1 rounded border border-studio-border">
                {lightboxIndex + 1} / {referenceImages.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev < referenceImages.length - 1 ? prev + 1 : 0) : 0
                  )
                }
                className="p-2 bg-studio-card border border-studio-border hover:border-studio-red hover:bg-studio-red text-white rounded-full transition-colors shadow-lg"
                title="รูปถัดไป"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
