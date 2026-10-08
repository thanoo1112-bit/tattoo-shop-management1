'use client';

import React, { useState } from 'react';
import { Wallet, X, AlertCircle } from 'lucide-react';
import { BookingItem } from './types';
import { createClient } from '@/lib/supabase/client';

interface RecordPaymentDialogProps {
  booking: BookingItem;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function RecordPaymentDialog({
  booking,
  onSuccess,
  onCancel,
}: RecordPaymentDialogProps) {
  const quotedPrice = Number(booking.financial?.quoted_price ?? (booking as any)?.quoted_price ?? 0);
  const totalPaid = Number(booking.financial?.total_paid ?? 0);
  const remainingBalance = Math.max(0, quotedPrice - totalPaid);

  const [amountInput, setAmountInput] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const amount = Number(amountInput);
    if (!amountInput || isNaN(amount) || amount <= 0) {
      setErrorMessage('กรุณาระบุยอดเงินที่รับชำระ (ต้องมากกว่า 0 บาท)');
      return;
    }

    if (quotedPrice > 0 && (totalPaid + amount) > quotedPrice) {
      setErrorMessage('ยอดรับเงินเกินราคางานที่ตกลง');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      const { error } = await supabase.rpc('admin_record_booking_payment', {
        p_booking_id: booking.id,
        p_amount: amount,
        p_note: paymentNote.trim() || null,
      });

      if (error) {
        throw error;
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error recording payment:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการบันทึกรับเงิน');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 font-prompt animate-fadeIn">
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#4A443A] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-emerald-400 shrink-0">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
                บันทึกรับเงิน
              </h3>
              <p className="text-[11px] text-[#A89F91]">
                ลูกค้า: {booking.customer_name} • ช่าง: {booking.artist_name || 'ไม่ระบุ'}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-[#7A7265] hover:text-[#ECE4D3] p-1 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Financial Summary */}
        <div className="bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-3.5 space-y-2 text-xs">
          {quotedPrice > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[#A89F91]">ราคางานสักที่ตกลงทั้งหมด:</span>
                <span className="text-[#ECE4D3] font-mono font-semibold">
                  ฿{quotedPrice.toLocaleString('th-TH')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#A89F91]">รับชำระแล้ว:</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  ฿{totalPaid.toLocaleString('th-TH')}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-[#4A443A]/50">
                <span className="text-[#ECE4D3] font-medium">ยอดคงเหลือ:</span>
                <span className="text-amber-400 font-mono font-bold text-sm">
                  ฿{remainingBalance.toLocaleString('th-TH')}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[11px] text-[#A89F91]">
              ยังไม่ได้ระบุราคางานสัก คุณสามารถบันทึกรับเงินได้ตามปกติ
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              ยอดเงินที่รับชำระ (บาท) <span className="text-[#9C2F2F]">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A89F91] font-mono text-xs">฿</span>
              <input
                id="input-record-payment-amount"
                type="number"
                min="1"
                step="1"
                required
                placeholder="0"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setErrorMessage(null);
                }}
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg pl-7 pr-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {/* Note Input */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              หมายเหตุการชำระเงิน (ถ้ามี)
            </label>
            <textarea
              id="input-record-payment-note"
              rows={2}
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="เช่น ชำระมัดจำเพิ่ม, ชำระหน้าร้าน, โอนเงินผ่านบัญชี..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg p-2.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/50">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#A89F91] hover:text-[#ECE4D3] rounded-lg transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              id="btn-confirm-record-payment"
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wallet size={14} />
              <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกรับเงิน'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
