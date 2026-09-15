'use client';

import React from 'react';
import Link from 'next/link';
import { DollarSign, ShieldCheck, AlertTriangle, ArrowRight, CreditCard, Sparkles, History, Edit3 } from 'lucide-react';
import { BookingItem, PriceAdjustmentItem, formatCurrency, formatDateTimeBangkok } from './types';

interface BookingFinancialSummaryProps {
  booking: BookingItem;
  priceAdjustments?: PriceAdjustmentItem[];
  onCheckSlip?: (bookingId: string) => void;
  onUpdatePrice?: () => void;
}

export default function BookingFinancialSummary({
  booking,
  priceAdjustments = [],
  onCheckSlip,
  onUpdatePrice,
}: BookingFinancialSummaryProps) {
  const fin = booking.financial || {
    quoted_price: 0,
    deposit_required: 0,
    total_paid: 0,
    remaining_balance: 0,
    is_deposit_paid: false,
    is_fully_paid: false,
  };

  // Sort price adjustments by created_at ASC to get the original/initial price from the first entry
  const sortedAdjustmentsAsc = [...priceAdjustments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Initial Price: earliest previous_price if adjustments exist, else current quoted_price
  const initialPrice = sortedAdjustmentsAsc.length > 0
    ? sortedAdjustmentsAsc[0].previous_price
    : fin.quoted_price;

  const currentPrice = fin.quoted_price;
  const isCompleted = booking.status === 'COMPLETED';
  const isEditableStatus = ['WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS'].includes(booking.status);

  // Adjustments sorted DESC for historical timeline display (newest first)
  const sortedAdjustmentsDesc = [...priceAdjustments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const hasScheduledSessions = (booking.sessions || []).some(
    (s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
  );

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
            ราคาและการชำระเงิน
          </span>
          {isCompleted ? (
            fin.is_fully_paid || (currentPrice > 0 && fin.total_paid >= currentPrice) ? (
              <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
                ชำระครบ
              </span>
            ) : (
              <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
                ค้างชำระ ฿{formatCurrency(Math.max(0, currentPrice - fin.total_paid))}
              </span>
            )
          ) : fin.is_fully_paid || (currentPrice > 0 && fin.total_paid >= currentPrice) ? (
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
      </div>

      {/* Pending Slip Banner */}
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

      {/* Waiting Deposit Warning Banner */}
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

      {/* System Estimated Price (if available) */}
      {booking.estimated_min_price && booking.estimated_max_price && (
        <div className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 flex justify-between items-center text-xs">
          <span className="text-[10px] text-[#7A7265] flex items-center gap-1">
            <Sparkles size={12} className="text-amber-400" /> ราคาประเมินโดยระบบ
          </span>
          <span className="text-xs font-heading font-semibold text-amber-400">
            ฿{formatCurrency(booking.estimated_min_price)} – ฿{formatCurrency(booking.estimated_max_price)}
          </span>
        </div>
      )}

      {/* Unified Financial Metrics Container Panel */}
      <div className="bg-[#171512] border border-[#4A443A]/60 rounded-xl p-3.5 space-y-3 text-xs">
        {/* Top: Pricing Breakdown */}
        <div className="grid grid-cols-2 gap-3 pb-2.5 border-b border-[#4A443A]/40">
          <div>
            <span className="text-[10px] text-[#7A7265] block font-medium">ราคาเบื้องต้น</span>
            <span className="text-sm font-heading font-semibold text-[#ECE4D3] mt-0.5 block">
              {initialPrice && initialPrice > 0 ? `฿${formatCurrency(initialPrice)}` : 'ยังไม่กำหนดราคา'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-[#7A7265] block font-medium">
              {isCompleted ? 'ราคาสรุปสุดท้าย' : 'ราคาปัจจุบัน'}
            </span>
            <span className="text-sm font-heading font-semibold text-amber-300 mt-0.5 block">
              {currentPrice && currentPrice > 0 ? `฿${formatCurrency(currentPrice)}` : 'ยังไม่กำหนดราคา'}
            </span>
          </div>
        </div>

        {/* Bottom: Payment Breakdown */}
        <div className="grid grid-cols-3 gap-2 items-center">
          <div>
            <span className="text-[10px] text-[#7A7265] block font-medium">มัดจำที่กำหนด</span>
            <span className="text-xs sm:text-sm font-heading font-semibold text-blue-400 mt-0.5 block">
              ฿{formatCurrency(fin.deposit_required)}
            </span>
          </div>

          <div className="text-center">
            <span className="text-[10px] text-[#7A7265] block font-medium">ชำระแล้ว</span>
            <span className="text-xs sm:text-sm font-heading font-semibold text-emerald-400 mt-0.5 block">
              ฿{formatCurrency(fin.total_paid)}
            </span>
          </div>

          <div className="text-right bg-amber-950/30 border border-amber-500/30 rounded-lg p-1.5 sm:p-2">
            <span className="text-[10px] text-amber-300/80 block font-medium">ยอดคงเหลือ</span>
            <span
              className={`text-xs sm:text-sm font-heading font-bold mt-0.5 block ${
                currentPrice && currentPrice > 0 && fin.remaining_balance > 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {currentPrice && currentPrice > 0
                ? `฿${formatCurrency(fin.remaining_balance)}`
                : 'รอราคา'}
            </span>
          </div>
        </div>
      </div>

      {/* Helper Text */}
      <p className="text-[11px] text-[#7A7265] font-light italic">
        ราคางานอาจเปลี่ยนแปลงตามรายละเอียดและหน้างาน
      </p>

      {/* Action Row (Bottom) */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#4A443A]/40">
        {!isCompleted && isEditableStatus && onUpdatePrice && (
          <button
            type="button"
            onClick={onUpdatePrice}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/60 hover:bg-amber-900/80 px-3.5 py-1.5 rounded-lg border border-amber-700/60 transition-colors cursor-pointer"
          >
            <Edit3 size={13} />
            <span>อัปเดตราคางาน</span>
          </button>
        )}

        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#ECE4D3] hover:text-white bg-[#171512] hover:bg-[#221F1B] px-3.5 py-1.5 rounded-lg border border-[#4A443A] hover:border-[#7A7265] transition-colors"
        >
          <span>จัดการการเงิน</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Price Adjustment History Section */}
      {sortedAdjustmentsDesc.length > 0 && (
        <div className="border-t border-[#4A443A]/40 pt-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ECE4D3]">
            <History size={13} className="text-amber-400" />
            <span>ประวัติราคา</span>
          </div>
          <div className="space-y-2 text-xs">
            {sortedAdjustmentsDesc.map((adj) => (
              <div key={adj.id} className="bg-[#171512] p-2.5 rounded-lg border border-[#4A443A]/40 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#A89F91]">
                    {formatDateTimeBangkok(adj.created_at)}
                  </span>
                  <span className="font-semibold text-[#ECE4D3]">
                    ฿{formatCurrency(adj.previous_price)} → ฿{formatCurrency(adj.new_price)}
                  </span>
                </div>
                {adj.note && (
                  <p className="text-[11px] text-[#ECE4D3]/80 font-light">
                    {adj.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
