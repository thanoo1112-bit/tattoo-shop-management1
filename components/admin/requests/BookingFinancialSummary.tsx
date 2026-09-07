'use client';

import React from 'react';
import Link from 'next/link';
import { DollarSign, ShieldCheck, AlertTriangle, ArrowRight, CreditCard } from 'lucide-react';
import { BookingItem, formatCurrency } from './types';

interface BookingFinancialSummaryProps {
  booking: BookingItem;
  onCheckSlip?: (bookingId: string) => void;
}

export default function BookingFinancialSummary({
  booking,
  onCheckSlip,
}: BookingFinancialSummaryProps) {
  const fin = booking.financial || {
    quoted_price: 0,
    deposit_required: 0,
    total_paid: 0,
    remaining_balance: 0,
    is_deposit_paid: false,
    is_fully_paid: false,
  };

  const hasScheduledSessions = (booking.sessions || []).some(
    (s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
  );

  // Section 26: Warning when booking is WAITING_DEPOSIT but has scheduled sessions and no pending slip submission
  const showWaitingDepositWarning =
    booking.status === 'WAITING_DEPOSIT' &&
    hasScheduledSessions &&
    !booking.has_pending_payment_submission;

  return (
    <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 sm:p-4 space-y-3.5 font-prompt">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#4A443A]/50 pb-2.5">
        <div className="flex items-center gap-2">
          <CreditCard size={14} className="text-[#ECE4D3]" />
          <span className="text-xs font-semibold text-[#ECE4D3]">
            สรุปสถานะการเงินของคิวงาน
          </span>
          {booking.status === 'COMPLETED' ? (
            fin.is_fully_paid || (fin.quoted_price > 0 && fin.total_paid >= fin.quoted_price) ? (
              <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
                ชำระครบ
              </span>
            ) : (
              <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
                ค้างชำระ {formatCurrency(Math.max(0, fin.quoted_price - fin.total_paid))}
              </span>
            )
          ) : fin.is_fully_paid || (fin.quoted_price > 0 && fin.total_paid >= fin.quoted_price) ? (
            <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
              ชำระครบ
            </span>
          ) : fin.total_paid > 0 ? (
            <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
              ชำระบางส่วน
            </span>
          ) : (
            <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
              รอมัดจำ
            </span>
          )}
        </div>

        {/* Action link to /admin/payments (Section 17) */}
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-1 text-[11px] text-[#A89F91] hover:text-[#ECE4D3] bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A] hover:border-[#7A7265] transition-colors font-medium"
        >
          <span>จัดการการเงิน</span>
          <ArrowRight size={11} />
        </Link>
      </div>

      {/* Pending Slip Verification Banner */}
      {booking.has_pending_payment_submission && (
        <div className="p-3 bg-amber-950/50 border border-amber-800/70 rounded-lg flex items-start justify-between gap-2 text-xs text-amber-300 animate-pulse">
          <div className="flex items-start gap-2">
            <CreditCard size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">
                ลูกค้าส่งหลักฐานการชำระมัดจำแล้ว และกำลังรอการตรวจสอบ
              </p>
              <p className="text-[11px] text-amber-400/80 mt-0.5">
                สลิปจะยังไม่นับเป็นยอดรับเงินจริงจนกว่าผู้จัดการร้านจะอนุมัติ
              </p>
            </div>
          </div>
          {onCheckSlip ? (
            <button
              type="button"
              onClick={() => onCheckSlip(booking.id)}
              className="shrink-0 text-[11px] font-bold text-amber-300 hover:underline bg-amber-900/60 hover:bg-amber-900 px-2.5 py-1 rounded border border-amber-700/60 cursor-pointer"
            >
              ตรวจสลิป
            </button>
          ) : (
            <Link
              href="/admin/payments"
              className="shrink-0 text-[11px] font-bold text-amber-300 hover:underline bg-amber-900/60 px-2 py-1 rounded border border-amber-700/60"
            >
              ตรวจสลิป
            </Link>
          )}
        </div>
      )}

      {/* Section 26 Warning Banner */}
      {showWaitingDepositWarning && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg flex items-start gap-2 text-xs text-amber-300 animate-fadeIn">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-300">
              คิวนี้มีรอบนัดหมายอยู่ แต่ยังรอการชำระมัดจำ
            </p>
            <p className="text-[11px] text-amber-400/80 mt-0.5">
              รอบนัดหมายจะไม่ถูกยกเลิกอัตโนมัติ แต่ยังไม่สามารถเริ่มงานสักได้จนกว่าจะบันทึกเงินมัดจำ
            </p>
          </div>
        </div>
      )}

      {/* Financial Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
          <span className="text-[10px] text-[#7A7265] block">ราคางานสักที่ตกลง</span>
          <span className="text-sm font-heading font-semibold text-[#ECE4D3] mt-0.5 block">
            {formatCurrency(fin.quoted_price)}
          </span>
        </div>

        <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
          <span className="text-[10px] text-[#7A7265] block">มัดจำที่กำหนด</span>
          <span className="text-sm font-heading font-semibold text-blue-400 mt-0.5 block">
            {formatCurrency(fin.deposit_required)}
          </span>
        </div>

        <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
          <span className="text-[10px] text-[#7A7265] block">รับเงินจริงแล้ว</span>
          <span className="text-sm font-heading font-semibold text-emerald-400 mt-0.5 block">
            {formatCurrency(fin.total_paid)}
          </span>
        </div>

        <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40">
          <span className="text-[10px] text-[#7A7265] block">ยอดคงเหลือ</span>
          <span
            className={`text-sm font-heading font-semibold mt-0.5 block ${
              fin.remaining_balance > 0 ? 'text-amber-400' : 'text-[#A89F91]'
            }`}
          >
            {formatCurrency(fin.remaining_balance)}
          </span>
        </div>
      </div>
    </div>
  );
}
