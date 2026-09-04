'use client';

import React, { useState } from 'react';
import { Plus, X, Wallet, Loader2, AlertCircle } from 'lucide-react';
import { PaymentBookingDetail } from './types';
import { createClient } from '@/lib/supabase/client';

interface RecordPaymentFormProps {
  booking: PaymentBookingDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (errorMessage: string) => void;
}

export default function RecordPaymentForm({
  booking,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: RecordPaymentFormProps) {
  const [paymentType, setPaymentType] = useState<'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT' | 'OTHER'>('DEPOSIT');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'QR' | 'OTHER'>('QR');
  
  // Format current local datetime for datetime-local input
  const getNowLocalString = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const [paidAt, setPaidAt] = useState<string>(getNowLocalString());
  const [referenceNo, setReferenceNo] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !booking) return null;

  const summary = booking.summary;
  const depositRemaining = Math.max(0, summary.deposit_required - summary.paid_total);
  const remainingTotal = summary.remaining_balance;

  const handleQuickAmount = (val: number) => {
    setAmount(val.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      onError('กรุณาระบุจำนวนเงินที่ถูกต้อง (มากกว่า 0)');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      // Section 11: strictly send ONLY allowed fields
      // Do NOT send created_by, status, voided_at, voided_by, void_reason!
      const payload: Record<string, any> = {
        booking_id: booking.id,
        payment_type: paymentType,
        amount: numAmount,
        payment_method: paymentMethod,
        paid_at: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(),
        reference_no: referenceNo.trim() || null,
        note: note.trim() || null,
      };

      const { data, error } = await supabase
        .from('booking_payments')
        .insert([payload])
        .select();

      if (error) {
        console.error('Insert payment error:', error);
        // Translate known database exceptions to clean Thai
        let userMessage = error.message;
        if (error.message?.includes('Cannot record payment for booking') && error.message?.includes('PENDING')) {
          userMessage = 'ไม่สามารถบันทึกเงินได้: คิวงานยังอยู่ในสถานะ PENDING ต้องได้รับอนุมัติก่อน';
        } else if (error.message?.includes('Cannot record payment')) {
          userMessage = `ไม่สามารถบันทึกเงินได้: คิวงานอยู่ในสถานะ ${booking.status}`;
        }
        onError(userMessage);
        return;
      }

      onSuccess(`บันทึกรับเงิน ฿${numAmount.toLocaleString('th-TH')} เรียบร้อยแล้ว`);
      onClose();
    } catch (err: any) {
      console.error('Unexpected error recording payment:', err);
      onError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-prompt">
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#4A443A] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-emerald-400">
              <Wallet size={16} />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-[#ECE4D3]">
                บันทึกการรับเงิน
              </h3>
              <p className="text-[11px] text-[#A89F91]">
                ลูกค้า: <span className="text-[#ECE4D3] font-medium">{booking.customer_name}</span> • ช่างสัก: {booking.artist_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Current Financial Context Quick Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0E0D0C] border border-[#4A443A]/60 rounded-lg p-3 text-center text-xs">
          <div>
            <span className="text-[10px] text-[#7A7265]">ราคางาน</span>
            <p className="font-medium text-[#ECE4D3] mt-0.5">฿{summary.quoted_price.toLocaleString('th-TH')}</p>
          </div>
          <div>
            <span className="text-[10px] text-amber-400/80">มัดจำที่กำหนด</span>
            <p className="font-medium text-amber-300 mt-0.5">฿{summary.deposit_required.toLocaleString('th-TH')}</p>
          </div>
          <div>
            <span className="text-[10px] text-emerald-400/80">รับเงินแล้ว</span>
            <p className="font-semibold text-emerald-400 mt-0.5">฿{summary.paid_total.toLocaleString('th-TH')}</p>
          </div>
          <div>
            <span className="text-[10px] text-red-400/80">คงเหลือ</span>
            <p className="font-semibold text-red-400 mt-0.5">฿{summary.remaining_balance.toLocaleString('th-TH')}</p>
          </div>
        </div>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* 1. Payment Type */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
              ประเภทการชำระ <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { label: 'เงินมัดจำ', value: 'DEPOSIT' },
                { label: 'ยอดคงเหลือ', value: 'BALANCE' },
                { label: 'ชำระเต็ม', value: 'FULL_PAYMENT' },
                { label: 'อื่น ๆ', value: 'OTHER' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentType(opt.value as any)}
                  className={`py-1.5 px-2 text-xs rounded-md border font-medium transition-colors ${
                    paymentType === opt.value
                      ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3]'
                      : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Amount with Quick Buttons */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#ECE4D3]">
                จำนวนเงิน (บาท) <span className="text-red-400">*</span>
              </label>
              {/* Quick Amount Pills */}
              <div className="flex items-center gap-1.5 text-[11px]">
                {depositRemaining > 0 && (
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(depositRemaining)}
                    className="text-amber-400 hover:text-amber-300 underline"
                  >
                    มัดจำ (฿{depositRemaining.toLocaleString('th-TH')})
                  </button>
                )}
                {remainingTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(remainingTotal)}
                    className="text-emerald-400 hover:text-emerald-300 underline"
                  >
                    ยอดคงเหลือ (฿{remainingTotal.toLocaleString('th-TH')})
                  </button>
                )}
              </div>
            </div>
            <input
              id="input-payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md px-3 py-2 text-sm text-[#ECE4D3] font-semibold focus:outline-none focus:border-[#ECE4D3] transition-colors"
            />
          </div>

          {/* 3. Payment Method */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
              วิธีชำระเงิน <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { label: 'เงินสด', value: 'CASH' },
                { label: 'โอนธนาคาร', value: 'BANK_TRANSFER' },
                { label: 'QR', value: 'QR' },
                { label: 'อื่น ๆ', value: 'OTHER' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  id={`btn-method-${opt.value.toLowerCase()}`}
                  onClick={() => setPaymentMethod(opt.value as any)}
                  className={`py-1.5 px-2 text-xs rounded-md border font-medium transition-colors ${
                    paymentMethod === opt.value
                      ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3]'
                      : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Paid At Date / Time */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              วันที่รับเงิน
            </label>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md px-3 py-1.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#ECE4D3] transition-colors"
            />
          </div>

          {/* 5. Reference No */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              เลขอ้างอิง / สลิป (Optional)
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="เช่น หมายเลขอ้างอิงธนาคาร, รหัสสลิป..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md px-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3] transition-colors"
            />
          </div>

          {/* 6. Note */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              หมายเหตุ (Optional)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น รับเงินสดหน้าร้าน, จ่ายเพิ่มเติม..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md p-2 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3] transition-colors"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/60">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs text-[#A89F91] hover:text-[#ECE4D3] bg-[#0E0D0C] border border-[#4A443A] rounded-md transition-colors"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              id="btn-submit-record-payment"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-medium text-[#ECE4D3] bg-[#9C2F2F] hover:bg-[#852727] border border-red-900/60 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <Plus size={13} />
                  <span>บันทึกรับเงิน</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
