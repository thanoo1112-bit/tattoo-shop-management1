'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Calendar,
  Phone,
  Mail,
  Plus,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  Clock3,
  CreditCard,
  History,
} from 'lucide-react';
import { PaymentBookingDetail, BookingPaymentRecord } from './types';
import PaymentHistory from './PaymentHistory';
import { createClient } from '@/lib/supabase/client';

interface PaymentDetailPanelProps {
  booking: PaymentBookingDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenRecordModal: () => void;
  onOpenVoidModal: (payment: BookingPaymentRecord) => void;
  refreshTrigger?: number;
}

export default function PaymentDetailPanel({
  booking,
  isOpen,
  onClose,
  onOpenRecordModal,
  onOpenVoidModal,
  refreshTrigger,
}: PaymentDetailPanelProps) {
  const [payments, setPayments] = useState<BookingPaymentRecord[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);

  // Fetch live payments for this booking
  useEffect(() => {
    if (!booking) return;

    let isMounted = true;
    async function fetchPayments() {
      setIsLoadingPayments(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('booking_payments')
          .select('*')
          .eq('booking_id', booking!.id)
          .order('paid_at', { ascending: false });

        if (!error && data && isMounted) {
          setPayments(data as BookingPaymentRecord[]);
        }
      } catch (err) {
        console.error('Fetch payments error:', err);
      } finally {
        if (isMounted) setIsLoadingPayments(false);
      }
    }

    fetchPayments();
    return () => {
      isMounted = false;
    };
  }, [booking?.id, refreshTrigger]);

  if (!isOpen || !booking) return null;

  const summary = booking.summary;

  // Section 16: Check if Booking is WAITING_DEPOSIT but has a SCHEDULED session
  const hasScheduledSessionWaitingDeposit =
    booking.status === 'WAITING_DEPOSIT' &&
    booking.sessions.some((s) => s.status === 'SCHEDULED');

  // Can this booking receive payments? (Section 9: Database allows APPROVED, WAITING_DEPOSIT, CONFIRMED, IN_PROGRESS, COMPLETED)
  const canRecordPayment = !['PENDING', 'REJECTED', 'CANCELLED'].includes(booking.status);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/70 backdrop-blur-sm animate-fadeIn font-prompt">
      {/* Click outside backdrop */}
      <div className="flex-1 hidden md:block" onClick={onClose} />

      {/* Drawer Container (Full-width on mobile, 540px on desktop) */}
      <div className="w-full md:w-[540px] bg-[#171512] border-l border-[#4A443A] h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#4A443A] flex items-start justify-between gap-3 bg-[#0E0D0C]/60">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-heading font-semibold text-[#ECE4D3]">
                {booking.customer_name}
              </h3>
              <span className="text-[10px] bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded">
                คิว #{booking.id.slice(0, 8)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#7A7265] mt-1.5">
              <span className="flex items-center gap-1 text-[#A89F91]">
                <User size={12} className="text-[#7A7265]" />
                ช่างสัก: {booking.artist_name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {booking.requested_date || 'ยังไม่ระบุวัน'}
              </span>
              {booking.customer_phone && (
                <span className="flex items-center gap-1">
                  <Phone size={12} />
                  {booking.customer_phone}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors p-1.5 rounded-md hover:bg-[#0E0D0C]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Section 16 Warning Banner */}
          {hasScheduledSessionWaitingDeposit && (
            <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-semibold text-amber-300">
                  คิวนี้มีรอบนัดหมายอยู่ แต่ยังรอการชำระมัดจำ
                </p>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  พบรอบการสักสถานะ SCHEDULED ในระบบ แต่ Booking ถูกปรับสถานะกลับเป็น WAITING_DEPOSIT กรุณาติดตามเงินมัดจำจากลูกค้า หรือยกเลิกรอบนัดหมายตามความเหมาะสม
                </p>
              </div>
            </div>
          )}

          {/* Financial Summary Card (Section 8) */}
          <div className="bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-2.5">
              <span className="text-xs font-heading font-medium text-[#ECE4D3] flex items-center gap-1.5">
                <Wallet size={14} className="text-[#9C2F2F]" />
                สรุปภาพรวมการเงิน
              </span>

              {/* Status Badges */}
              <div className="flex items-center gap-1.5 text-[10px]">
                {summary.is_fully_paid ? (
                  <span className="bg-emerald-950/50 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded-full font-medium">
                    ชำระครบแล้ว
                  </span>
                ) : summary.deposit_paid ? (
                  <span className="bg-blue-950/50 text-blue-400 border border-blue-800/50 px-2 py-0.5 rounded-full font-medium">
                    มัดจำเรียบร้อย
                  </span>
                ) : summary.deposit_required > 0 ? (
                  <span className="bg-amber-950/50 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full font-medium">
                    รอมัดจำ
                  </span>
                ) : (
                  <span className="bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded-full font-medium">
                    ไม่มีมัดจำ
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/60">
                <p className="text-[10px] text-[#7A7265]">ราคางานสักที่ตกลง</p>
                <p className="text-base font-heading font-semibold text-[#ECE4D3] mt-0.5">
                  ฿{summary.quoted_price.toLocaleString('th-TH')}
                </p>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/60">
                <p className="text-[10px] text-[#7A7265]">มัดจำที่กำหนด</p>
                <p className="text-base font-heading font-semibold text-amber-300 mt-0.5">
                  ฿{summary.deposit_required.toLocaleString('th-TH')}
                </p>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/60">
                <p className="text-[10px] text-emerald-400/80">รับเงินจริงแล้ว</p>
                <p className="text-base font-heading font-semibold text-emerald-400 mt-0.5">
                  ฿{summary.paid_total.toLocaleString('th-TH')}
                </p>
              </div>

              <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/60">
                <p className="text-[10px] text-red-400/80">ยอดคงเหลือ</p>
                <p className="text-base font-heading font-semibold text-red-400 mt-0.5">
                  ฿{summary.remaining_balance.toLocaleString('th-TH')}
                </p>
              </div>
            </div>

            {/* Booking State Badges */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-[#7A7265] pt-1">
              <span>สถานะคิวงาน: <strong className="text-[#ECE4D3]">{booking.status}</strong></span>
              {booking.confirmed_at && (
                <span>ยืนยันเมื่อ: <span className="text-[#A89F91]">{new Date(booking.confirmed_at).toLocaleDateString('th-TH')}</span></span>
              )}
            </div>
          </div>

          {/* Action Button (Section 9) */}
          {canRecordPayment ? (
            <button
              id="btn-open-record-modal"
              onClick={onOpenRecordModal}
              className="w-full py-2.5 px-4 bg-[#9C2F2F] hover:bg-[#852727] text-[#ECE4D3] text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 border border-red-800/60 shadow-lg"
            >
              <Plus size={15} />
              <span>+ บันทึกรับเงิน</span>
            </button>
          ) : (
            <div className="p-2.5 bg-[#0E0D0C] border border-[#4A443A]/60 rounded-lg text-center text-xs text-[#7A7265]">
              คิวงานอยู่ในสถานะ <strong className="text-[#A89F91]">{booking.status}</strong> จึงยังไม่สามารถบันทึกเงินได้
            </div>
          )}

          {/* Section: Payment History (Section 13) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-heading font-semibold text-[#ECE4D3] flex items-center gap-1.5 uppercase tracking-wider">
                <History size={13} className="text-[#9C2F2F]" />
                ประวัติการชำระเงิน ({payments.length})
              </h4>
            </div>

            <PaymentHistory
              payments={payments}
              onOpenVoidModal={onOpenVoidModal}
              isLoading={isLoadingPayments}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
