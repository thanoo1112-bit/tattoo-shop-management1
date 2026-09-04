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
} from 'lucide-react';
import { formatThaiDate, formatTimeBangkok, formatCurrency } from './portalUtils';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

interface CustomerBookingDetailProps {
  item: CustomerPortalBooking | CustomerPortalEstimate;
  type: 'estimate' | 'booking';
  onClose: () => void;
  onRefresh?: () => void;
  onTransitionToBooking?: (estimate: CustomerPortalEstimate) => void;
}

export default function CustomerBookingDetail({
  item,
  type,
  onClose,
  onRefresh,
  onTransitionToBooking,
}: CustomerBookingDetailProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isBooking = type === 'booking';
  const booking = item as CustomerPortalBooking;
  const estimate = item as CustomerPortalEstimate;

  const artistDisplayName = item.artist?.name
    ? `${item.artist.name}${item.artist.nickname ? ` (${item.artist.nickname})` : ''}`
    : 'ช่างสักประจำร้าน';

  // 1. Accept Quote RPC
  const handleAcceptQuote = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('accept_estimate_quote', {
        p_estimate_id: estimate.id,
      });

      if (rpcError) throw rpcError;

      if (onTransitionToBooking) {
        onTransitionToBooking({
          ...estimate,
          status: 'ACCEPTED',
        });
      }
      if (onRefresh) onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถยอมรับราคาประเมินได้');
    } finally {
      setLoading(false);
    }
  };

  // 2. Reject Quote RPC
  const handleRejectQuote = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc('reject_estimate_quote', {
        p_estimate_id: estimate.id,
      });

      if (rpcError) throw rpcError;

      if (onRefresh) onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถปฏิเสธราคาประเมินได้');
    } finally {
      setLoading(false);
    }
  };

  // 3. Cancel Booking Request RPC (Strictly allowed ONLY when status is PENDING)
  const handleCancelBooking = async () => {
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

  // Preview Image
  const previewImage = isBooking
    ? booking.artwork_image_url || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500'
    : estimate.reference_images?.[0] || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-studio-main/80 backdrop-blur-sm animate-fadeIn font-prompt">
      <div className="relative w-full max-w-md bg-studio-card border border-studio-border rounded-[8px] overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
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
              <span className="text-[9px] uppercase tracking-wider text-studio-red font-semibold block">
                {isBooking ? 'รายละเอียดคิวจอง' : 'รายละเอียดการขอประเมิน'}
              </span>
              <h3 className="text-base font-bold text-studio-primary mt-1">
                {isBooking
                  ? booking.artwork_title || 'งานสัก Custom'
                  : `สไตล์ ${estimate.style || 'Custom'}`}
              </h3>
            </div>
            <BookingStatusBadge status={item.status as any} type={type} />
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-[10px] text-red-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Reference Image */}
          <div className="w-full aspect-video rounded-[6px] border border-studio-border overflow-hidden bg-studio-main">
            <CustomerReferenceImage
              src={previewImage}
              alt="Reference"
              className="w-full h-full object-cover"
            />
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

                {/* 2. Multi-Session Schedule List */}
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
                                {formatTimeBangkok(ses.start_at)} - {formatTimeBangkok(ses.end_at)}
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

                {/* 3. Financial Summary */}
                {booking.financial && (
                  <div className="pt-2 border-t border-studio-border/30 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-studio-secondary block flex items-center gap-1">
                      <BadgeDollarSign size={11} /> ข้อมูลการเงินของคิวงาน
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="bg-studio-card p-1.5 rounded border border-studio-border/40">
                        <span className="text-[9px] text-studio-secondary block">ราคาประเมิน</span>
                        <span className="font-bold text-studio-primary">
                          ฿{formatCurrency(booking.financial.quoted_price)}
                        </span>
                      </div>
                      <div className="bg-studio-card p-1.5 rounded border border-studio-border/40">
                        <span className="text-[9px] text-studio-secondary block">มัดจำที่ต้องชำระ</span>
                        <span className="font-bold text-studio-primary">
                          ฿{formatCurrency(booking.financial.deposit_required)}
                        </span>
                      </div>
                      <div className="bg-studio-card p-1.5 rounded border border-studio-border/40">
                        <span className="text-[9px] text-studio-secondary block">ชำระแล้วทั้งหมด</span>
                        <span className="font-bold text-emerald-400">
                          ฿{formatCurrency(booking.financial.paid_total)}
                        </span>
                      </div>
                      <div className="bg-studio-card p-1.5 rounded border border-studio-border/40">
                        <span className="text-[9px] text-studio-secondary block">คงเหลือชำระหน้าร้าน</span>
                        <span
                          className={`font-bold ${
                            Number(booking.financial.remaining_balance ?? 0) > 0
                              ? 'text-studio-red'
                              : 'text-studio-secondary'
                          }`}
                        >
                          ฿{formatCurrency(booking.financial.remaining_balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Customer Note */}
                {booking.customer_note && (
                  <div className="pt-2 border-t border-studio-border/20">
                    <span className="text-studio-secondary block mb-1">บันทึกจากลูกค้า:</span>
                    <p className="text-[11px] text-studio-secondary bg-studio-card/85 p-2 border border-studio-border/40 rounded-[4px] font-light">
                      {booking.customer_note}
                    </p>
                  </div>
                )}

                {/* 5. Rejection Reason */}
                {booking.rejection_reason && (
                  <div className="pt-2 border-t border-studio-border/20 text-red-400">
                    <span className="text-[10px] uppercase font-bold block mb-1">เหตุผลที่ปฏิเสธ:</span>
                    <p className="text-[11px] bg-red-950/20 p-2 rounded border border-red-900/40">
                      {booking.rejection_reason}
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
                  <span className="text-studio-secondary">ตำแหน่งที่สัก</span>
                  <span className="font-semibold">{estimate.placement}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-studio-secondary">สไตล์งาน</span>
                  <span className="font-semibold">{estimate.style}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-studio-secondary">วันที่สะดวก</span>
                  <span className="font-semibold">
                    {formatThaiDate(estimate.preferred_date, true)}
                  </span>
                </div>
                {estimate.description && (
                  <div className="pt-2 border-t border-studio-border/20">
                    <span className="text-studio-secondary block mb-1">รายละเอียดเพิ่มเติม:</span>
                    <p className="text-[11px] text-studio-secondary leading-relaxed bg-studio-card/85 p-2 border border-studio-border/40 rounded-[4px] font-light">
                      {estimate.description}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pricing Quote Display for Estimates */}
          {!isBooking && estimate.status !== 'PENDING' && (
            <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] space-y-3 text-xs">
              <span className="text-[10px] uppercase tracking-wider text-studio-red font-bold block border-b border-studio-border/40 pb-1.5">
                ผลประเมินราคางานสัก
              </span>
              <div className="flex justify-between">
                <span className="text-studio-secondary">ราคางานสักประมาณการ:</span>
                <span className="font-bold text-studio-primary">
                  {estimate.quoted_price ? `฿${formatCurrency(estimate.quoted_price)}` : 'ไม่ระบุ'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-studio-secondary">ระยะเวลาสักโดยประมาณ:</span>
                <span className="font-bold text-studio-primary">
                  {estimate.estimated_duration_minutes
                    ? `${estimate.estimated_duration_minutes / 60} ชั่วโมง`
                    : 'ไม่ระบุ'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-studio-red font-medium">เงินมัดจำรับประกันคิว:</span>
                <span className="font-bold text-studio-red">
                  {estimate.deposit_required ? `฿${formatCurrency(estimate.deposit_required)}` : 'ไม่ระบุ'}
                </span>
              </div>
              {estimate.quote_note && (
                <div className="pt-2 border-t border-studio-border/20">
                  <span className="text-studio-secondary block mb-1">หมายเหตุจากช่างสัก:</span>
                  <p className="text-[11px] text-studio-secondary italic font-light">
                    &ldquo;{estimate.quote_note}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Estimate Actions */}
          {!isBooking && estimate.status === 'QUOTED' && (
            <div className="bg-studio-main border border-studio-red/30 p-4 rounded-[6px] flex flex-col space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAcceptQuote}
                  disabled={loading}
                  className="flex-1 bg-studio-red border border-studio-red text-studio-primary hover:bg-transparent hover:text-studio-red text-[11px] uppercase tracking-wider py-2.5 px-3 font-bold transition-all duration-300 rounded-[4px] disabled:opacity-50"
                >
                  {loading ? 'กำลังดำเนินการ...' : 'ยอมรับราคาและไปจองคิวต่อ'}
                </button>
                <button
                  type="button"
                  onClick={handleRejectQuote}
                  disabled={loading}
                  className="bg-transparent border border-studio-border text-studio-secondary hover:text-red-400 hover:border-red-400/50 text-[11px] uppercase tracking-wider py-2.5 px-3 font-bold transition-all duration-300 rounded-[4px] disabled:opacity-50"
                >
                  {loading ? '...' : 'ปฏิเสธ'}
                </button>
              </div>
            </div>
          )}

          {!isBooking && estimate.status === 'ACCEPTED' && (
            <div className="bg-studio-red/10 border border-studio-red/30 p-4 rounded-[6px] text-center space-y-3">
              <div className="flex items-center justify-center space-x-2 text-studio-red text-xs font-bold">
                <CheckCircle2 size={16} />
                <span>ยอมรับข้อเสนอราคาแล้ว</span>
              </div>
              <p className="text-[10px] text-studio-secondary leading-relaxed">
                ท่านยอมรับข้อเสนอนี้แล้ว สามารถคลิกปุ่มด้านล่างเพื่อดำเนินการจัดนัดหมายล็อกคิวเวลาสัก
              </p>
              {!estimate.booking_id && (
                <button
                  type="button"
                  onClick={() => {
                    if (onTransitionToBooking) {
                      onTransitionToBooking(estimate);
                    }
                    onClose();
                  }}
                  className="w-full bg-studio-red text-studio-primary text-[10px] uppercase tracking-wider py-2 px-3 font-bold rounded-[4px] hover:bg-studio-red/80 transition-all"
                >
                  ดำเนินการจองคิวสัก
                </button>
              )}
            </div>
          )}

          {!isBooking && estimate.status === 'REJECTED' && (
            <div className="bg-studio-border/20 border border-studio-border p-4 rounded-[6px] text-center text-studio-secondary text-xs font-semibold flex items-center justify-center space-x-1.5">
              <X size={16} className="text-red-500" />
              <span>ปฏิเสธข้อเสนอราคานี้แล้ว</span>
            </div>
          )}

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
    </div>
  );
}
