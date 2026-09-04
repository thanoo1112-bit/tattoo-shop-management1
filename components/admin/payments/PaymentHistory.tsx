'use client';

import React from 'react';
import {
  Clock,
  Ban,
  FileText,
  AlertCircle,
  Hash,
  CreditCard,
  QrCode,
  Building2,
  Banknote,
  Calendar,
} from 'lucide-react';
import { BookingPaymentRecord } from './types';

interface PaymentHistoryProps {
  payments: BookingPaymentRecord[];
  onOpenVoidModal: (payment: BookingPaymentRecord) => void;
  isLoading?: boolean;
}

const PAYMENT_TYPE_MAP: Record<string, { label: string; class: string }> = {
  DEPOSIT: { label: 'เงินมัดจำ', class: 'bg-amber-950/40 text-amber-400 border-amber-800/40' },
  BALANCE: { label: 'ยอดคงเหลือ', class: 'bg-blue-950/40 text-blue-400 border-blue-800/40' },
  FULL_PAYMENT: { label: 'ชำระเต็ม', class: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40' },
  OTHER: { label: 'อื่น ๆ', class: 'bg-[#1F1D1A] text-[#A89F91] border-[#4A443A]' },
};

const PAYMENT_METHOD_MAP: Record<string, { label: string; icon: any }> = {
  CASH: { label: 'เงินสด', icon: Banknote },
  BANK_TRANSFER: { label: 'โอนธนาคาร', icon: Building2 },
  QR: { label: 'QR Code', icon: QrCode },
  OTHER: { label: 'อื่น ๆ', icon: CreditCard },
};

function formatBangkokDateTime(isoString: string) {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export default function PaymentHistory({
  payments,
  onOpenVoidModal,
  isLoading,
}: PaymentHistoryProps) {
  if (isLoading) {
    return (
      <div className="py-6 text-center text-xs text-[#7A7265] animate-pulse">
        กำลังโหลดประวัติการชำระเงิน...
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="bg-[#0E0D0C] border border-[#4A443A]/60 rounded-lg p-6 text-center">
        <p className="text-xs text-[#A89F91]">ยังไม่มีประวัติการชำระเงิน</p>
        <p className="text-[11px] text-[#7A7265] mt-0.5">
          เมื่อบันทึกรับเงิน รายการจะแสดงที่นี่ตามลำดับเวลา
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 font-prompt">
      {payments.map((p) => {
        const typeInfo = PAYMENT_TYPE_MAP[p.payment_type] || PAYMENT_TYPE_MAP.OTHER;
        const methodInfo = PAYMENT_METHOD_MAP[p.payment_method] || PAYMENT_METHOD_MAP.OTHER;
        const MethodIcon = methodInfo.icon;
        const isVoided = p.status === 'VOIDED';

        return (
          <div
            key={p.id}
            className={`border rounded-lg p-3 transition-all ${
              isVoided
                ? 'bg-[#121110] border-red-950/40 opacity-75'
                : 'bg-[#0E0D0C] border-[#4A443A] hover:border-[#7A7265]'
            }`}
          >
            {/* Row 1: Amount & Type & Status */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-base sm:text-lg font-heading font-semibold ${
                  isVoided ? 'line-through text-[#7A7265]' : 'text-emerald-400'
                }`}>
                  ฿{p.amount.toLocaleString('th-TH')}
                </span>

                <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${typeInfo.class}`}>
                  {typeInfo.label}
                </span>

                <span className="text-[11px] text-[#A89F91] flex items-center gap-1 bg-[#171512] px-2 py-0.5 rounded border border-[#4A443A]/60">
                  <MethodIcon size={12} className="text-[#7A7265]" />
                  <span>{methodInfo.label}</span>
                </span>
              </div>

              {/* Status or Void Action */}
              <div>
                {isVoided ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-red-950/40 text-red-400 border border-red-900/40 px-2 py-0.5 rounded">
                    <Ban size={10} />
                    ยกเลิกรายการแล้ว
                  </span>
                ) : (
                  <button
                    type="button"
                    data-action="void-payment"
                    onClick={() => onOpenVoidModal(p)}
                    className="text-[11px] text-[#A89F91] hover:text-red-400 bg-[#171512] hover:bg-red-950/20 border border-[#4A443A] hover:border-red-900/50 px-2.5 py-1 rounded transition-colors flex items-center gap-1"
                    title="ยกเลิกรายการรับเงินนี้"
                  >
                    <Ban size={11} />
                    <span>ยกเลิกรายการ</span>
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Date & Reference */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#7A7265] mt-2 pt-2 border-t border-[#4A443A]/40">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                <span>รับเงินเมื่อ: {formatBangkokDateTime(p.paid_at)}</span>
              </span>

              {p.reference_no && (
                <span className="flex items-center gap-1 text-[#A89F91]">
                  <Hash size={11} />
                  <span>อ้างอิง: {p.reference_no}</span>
                </span>
              )}
            </div>

            {/* Row 3: Note (if any) */}
            {p.note && (
              <p className="text-[11px] text-[#A89F91] bg-[#171512] p-2 rounded mt-2 border border-[#4A443A]/40">
                <span className="text-[#7A7265]">หมายเหตุ:</span> {p.note}
              </p>
            )}

            {/* Row 4: Void Details (if voided) */}
            {isVoided && (
              <div className="mt-2.5 p-2 rounded bg-red-950/20 border border-red-900/30 text-[11px] space-y-0.5">
                <div className="flex items-center gap-1 text-red-400 font-medium">
                  <AlertCircle size={12} />
                  <span>เหตุผลที่ยกเลิก:</span> {p.void_reason || 'ไม่ได้ระบุเหตุผล'}
                </div>
                {p.voided_at && (
                  <p className="text-[10px] text-red-400/70">
                    ยกเลิกเมื่อ: {formatBangkokDateTime(p.voided_at)}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
