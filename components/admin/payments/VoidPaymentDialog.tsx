'use client';

import React, { useState } from 'react';
import { Ban, X, AlertTriangle, Loader2 } from 'lucide-react';
import { BookingPaymentRecord } from './types';
import { createClient } from '@/lib/supabase/client';

interface VoidPaymentDialogProps {
  payment: BookingPaymentRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (errorMessage: string) => void;
}

export default function VoidPaymentDialog({
  payment,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: VoidPaymentDialogProps) {
  const [voidReason, setVoidReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !payment) return null;

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidReason.trim()) {
      onError('กรุณาระบุเหตุผลในการยกเลิกรายการ');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();

      // Section 14: strictly send ONLY status and void_reason. Do NOT send voided_by or voided_at!
      const { error } = await supabase
        .from('booking_payments')
        .update({
          status: 'VOIDED',
          void_reason: voidReason.trim(),
        })
        .eq('id', payment.id);

      if (error) {
        console.error('Void payment error:', error);
        onError(error.message || 'ไม่สามารถยกเลิกรายการรับเงินได้');
        return;
      }

      setVoidReason('');
      onSuccess(`ยกเลิกรายการรับเงิน ฿${payment.amount.toLocaleString('th-TH')} สำเร็จ`);
      onClose();
    } catch (err: any) {
      console.error('Void unexpected error:', err);
      onError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-prompt">
      <div className="bg-[#171512] border border-red-900/50 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#4A443A] pb-3">
          <div className="flex items-center gap-2 text-red-400">
            <div className="w-8 h-8 rounded-full bg-red-950/60 border border-red-900/60 flex items-center justify-center">
              <Ban size={16} />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-[#ECE4D3]">
                ยกเลิกรายการรับเงิน?
              </h3>
              <p className="text-[11px] text-[#A89F91]">
                การดำเนินการนี้ไม่สามารถย้อนกลับได้
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

        {/* Payment Summary Box */}
        <div className="bg-[#0E0D0C] border border-[#4A443A] rounded-lg p-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-[#7A7265]">จำนวนเงิน:</span>
            <span className="font-semibold text-lg text-[#ECE4D3] font-heading">
              ฿{payment.amount.toLocaleString('th-TH')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7A7265]">ประเภท:</span>
            <span className="text-[#ECE4D3]">{payment.payment_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7A7265]">วิธีชำระ:</span>
            <span className="text-[#ECE4D3]">{payment.payment_method}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#7A7265]">วันที่บันทึก:</span>
            <span className="text-[#A89F91]">
              {new Date(payment.paid_at).toLocaleString('th-TH')}
            </span>
          </div>
        </div>

        {/* Warning Alert */}
        <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-900/40 rounded-lg p-2.5 text-[11px] text-amber-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            หากการยกเลิกนี้ทำให้เงินมัดจำลดลงต่ำกว่าเกณฑ์ คิวงานอาจถูกปรับสถานะกลับเป็น <strong>WAITING_DEPOSIT</strong> อัตโนมัติ
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleConfirmVoid} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
              ระบุเหตุผลในการยกเลิก <span className="text-red-400">*</span>
            </label>
            <textarea
              id="input-void-reason"
              required
              rows={3}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="เช่น ลูกค้าขอเปลี่ยนวิธีการชำระเงิน, บันทึกจำนวนเงินผิดพลาด..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-md p-2.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-red-500 transition-colors"
            />
          </div>

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
              id="btn-confirm-void-payment"
              disabled={isSubmitting || !voidReason.trim()}
              className="px-4 py-1.5 text-xs font-medium text-white bg-red-800 hover:bg-red-700 border border-red-700 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 size={13} className="animate-spin" />}
              <span>ยืนยันยกเลิกรายการ</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
