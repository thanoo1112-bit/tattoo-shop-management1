'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  Calendar,
  Phone,
  AlertTriangle,
  Wallet,
  History,
  Lock,
  CreditCard,
} from 'lucide-react';
import { PaymentBookingDetail, BookingPaymentRecord } from './types';
import PaymentHistory from './PaymentHistory';
import { createClient } from '@/lib/supabase/client';

interface PaymentDetailPanelProps {
  booking: PaymentBookingDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenRecordModal?: () => void;
  onOpenAdjustPriceModal?: () => void;
  onOpenVoidModal: (payment: BookingPaymentRecord) => void;
  refreshTrigger?: number;
}

export default function PaymentDetailPanel({
  booking,
  isOpen,
  onClose,
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
  const statusUpper = String(booking.status || '').toUpperCase();
  const isCompleted = statusUpper === 'COMPLETED';

  // Financial values calculation
  const quotedPrice = Number(summary.quoted_price || 0);

  // Deposit received sum
  const recordedDepositSum = payments
    .filter((p) => String(p.payment_type || '').toUpperCase() === 'DEPOSIT' && String(p.status || '').toUpperCase() === 'RECORDED')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const depositRequired = Number(summary.deposit_required || 0);
  const depositPaid = recordedDepositSum > 0
    ? recordedDepositSum
    : (summary.paid_total > 0 ? Math.min(summary.paid_total, depositRequired || 500) : (summary.deposit_paid ? depositRequired || 500 : 0));

  // Balance / Final Close Payment
  const recordedBalanceSum = payments
    .filter((p) => ['BALANCE', 'FULL_PAYMENT'].includes(String(p.payment_type || '').toUpperCase()) && String(p.status || '').toUpperCase() === 'RECORDED')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const finalClosePayment = recordedBalanceSum > 0
    ? recordedBalanceSum
    : Math.max(0, quotedPrice - depositPaid);

  // Total Actual Paid sum
  const totalRecordedPaid = payments
    .filter((p) => String(p.status || '').toUpperCase() === 'RECORDED')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalPaidAmount = totalRecordedPaid > 0 ? totalRecordedPaid : Number(summary.paid_total || 0);

  // Fully paid check
  const isFullyPaid = (quotedPrice > 0 && totalPaidAmount >= quotedPrice) || isCompleted;

  // Price lock condition (quotedPrice already set > 0)
  const isPriceLocked = quotedPrice > 0;

  // Section 16: Check if Booking is WAITING_DEPOSIT but has a SCHEDULED session
  const hasScheduledSessionWaitingDeposit =
    statusUpper === 'WAITING_DEPOSIT' &&
    booking.sessions.some((s) => s.status === 'SCHEDULED');

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/75 backdrop-blur-sm animate-fadeIn font-prompt h-[100dvh]">
      {/* Click outside backdrop (z-[60] covering all page tabs and content) */}
      <div className="absolute inset-0 z-[60]" onClick={onClose} />

      {/* Drawer Container (Full-width on mobile, 540px on desktop, z-[70] above backdrop) */}
      <div className="relative z-[70] w-full md:w-[540px] bg-[#171512] border-l border-[#4A443A] h-full h-[100dvh] flex flex-col shadow-2xl animate-slideLeft">
        {/* Drawer Header (Shrink-0 header with standard Admin Drawer pattern) */}
        <div className="p-5 sm:p-6 border-b border-[#4A443A]/60 bg-[#0E0D0C] shrink-0 space-y-3">
          {/* Top Bar: Category Tag & Close Button */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <CreditCard size={15} className="text-[#9C2F2F]" />
              <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                FINANCIAL DETAILS • รายละเอียดการเงิน
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1.5 rounded-md hover:bg-[#171512]"
              title="ปิด"
            >
              <X size={20} />
            </button>
          </div>

          {/* Customer Name & Queue ID */}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg sm:text-xl font-heading font-semibold text-[#ECE4D3]">
                {booking.customer_name}
              </h3>
              <span className="text-[10px] bg-[#1F1D1A] text-[#A89F91] border border-[#4A443A] px-2 py-0.5 rounded font-mono">
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
        </div>

        {/* Scrollable Body (flex-1 min-h-0 overflow-y-auto with touch scroll & safe-area bottom padding) */}
        <div
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-5"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          }}
        >
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

          {/* Read-Only Financial Summary Card (Layout C) */}
          <div className="bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-2.5">
              <span className="text-xs font-heading font-medium text-[#ECE4D3] flex items-center gap-1.5">
                <Wallet size={14} className="text-[#9C2F2F]" />
                สรุปภาพรวมการเงิน
              </span>

              {/* Read-only status badge */}
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${
                isCompleted || recordedBalanceSum > 0
                  ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/50'
                  : 'bg-amber-950/50 text-amber-400 border-amber-800/50'
              }`}>
                {isCompleted || recordedBalanceSum > 0 ? 'ชำระครบแล้ว' : 'รอปิดงาน'}
              </span>
            </div>

            {/* Layout C: 2 Side-by-side Boxes (Left: Deposit & Balance, Right: Total Recorded) */}
            <div className="grid grid-cols-2 gap-2.5 font-mono">
              {/* Left Box: มัดจำที่รับแล้ว (Top) & รับเพิ่มวันปิดงาน (Bottom) separated by thin line */}
              <div className="bg-[#171512] p-3 rounded-lg border border-[#4A443A]/60 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] text-[#7A7265] font-sans">มัดจำที่รับแล้ว</span>
                  <span className="text-xs font-semibold text-amber-400">
                    {recordedDepositSum > 0 ? `฿${recordedDepositSum.toLocaleString('th-TH')}` : '—'}
                  </span>
                </div>
                <div className="border-t border-[#4A443A]/40" />
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] text-[#7A7265] font-sans">รับเพิ่มวันปิดงาน</span>
                  <span className="text-xs font-semibold text-emerald-400">
                    {recordedBalanceSum > 0 ? `฿${recordedBalanceSum.toLocaleString('th-TH')}` : '—'}
                  </span>
                </div>
              </div>

              {/* Right Box: Dark green bg & border, centered ยอดรับจริงรวม & large green sum */}
              <div className="bg-emerald-950/40 border border-emerald-800/60 p-3 rounded-lg flex flex-col items-center justify-center text-center">
                <span className="text-[11px] text-emerald-300/80 font-sans font-medium">
                  ยอดรับจริงรวม
                </span>
                <span className="text-lg sm:text-xl font-bold text-emerald-400 mt-0.5">
                  ฿{totalRecordedPaid.toLocaleString('th-TH')}
                </span>
              </div>
            </div>

            {/* Booking State Footer */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-[#7A7265] pt-1 border-t border-[#4A443A]/20">
              <span>สถานะคิวงาน: <strong className="text-[#ECE4D3]">{booking.status}</strong></span>
              {booking.confirmed_at && (
                <span>ยืนยันเมื่อ: <span className="text-[#A89F91]">{new Date(booking.confirmed_at).toLocaleDateString('th-TH')}</span></span>
              )}
            </div>
          </div>

          {/* Read-Only Status Info Banner */}
          {isCompleted ? (
            <div className="p-3 bg-[#0E0D0C] border border-[#4A443A]/60 rounded-lg text-center text-xs text-[#7A7265] flex items-center justify-center gap-2">
              <Lock size={13} className="text-emerald-400 shrink-0" />
              <span>รายการการเงินปิดสมบูรณ์แล้ว (Read-only)</span>
            </div>
          ) : (
            <div className="p-3 bg-[#0E0D0C] border border-[#4A443A]/60 rounded-lg text-center text-xs text-[#A89F91] flex items-center justify-center gap-2">
              <Lock size={13} className="text-amber-400 shrink-0" />
              <span>จะกำหนดราคางานและรับยอดสุดท้ายเมื่อปิดงาน</span>
            </div>
          )}

          {/* Section: Payment History (Strictly Read-Only) */}
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
              readOnly={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
