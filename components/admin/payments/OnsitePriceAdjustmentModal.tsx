'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Check,
  Loader2,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import { PaymentBookingDetail } from './types';
import { createClient } from '@/lib/supabase/client';

interface OnsitePriceAdjustmentModalProps {
  booking: PaymentBookingDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (errorMessage: string) => void;
}

export default function OnsitePriceAdjustmentModal({
  booking,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: OnsitePriceAdjustmentModalProps) {
  const [adjustType, setAdjustType] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [amountStr, setAmountStr] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form when modal opens or booking changes
  useEffect(() => {
    if (isOpen) {
      setAdjustType('INCREASE');
      setAmountStr('');
      setNote('');
      setValidationError(null);
    }
  }, [isOpen, booking?.id]);

  if (!isOpen || !booking) return null;

  const currentPrice = booking.summary.quoted_price || 0;
  const paidTotal = booking.summary.paid_total || 0;

  const amountNum = parseFloat(amountStr) || 0;

  // Calculate new quoted price based on adjustment type
  const adjustmentAmount = adjustType === 'INCREASE' ? amountNum : -amountNum;
  const newQuotedPrice = currentPrice + adjustmentAmount;
  const newRemainingBalance = Math.max(0, newQuotedPrice - paidTotal);

  // Quick preset suggestions
  const quickAmountOptions = [500, 1000, 1500, 2000, 3000];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Guard 1: Amount must be > 0
    if (isNaN(amountNum) || amountNum <= 0) {
      setValidationError('กรุณาระบุจำนวนเงินที่ปรับ (ต้องมากกว่า 0 บาท)');
      return;
    }

    // Guard 2: New price cannot be <= 0
    if (newQuotedPrice <= 0) {
      setValidationError('ราคางานใหม่ต้องมากกว่า 0 บาท');
      return;
    }

    // Guard 3: New price cannot be less than total paid amount
    if (newQuotedPrice < paidTotal) {
      setValidationError(
        `ราคางานใหม่ (฿${newQuotedPrice.toLocaleString('th-TH')}) ไม่สามารถต่ำกว่ายอดที่ชำระแล้ว (฿${paidTotal.toLocaleString('th-TH')})`
      );
      return;
    }

    // Guard 4: Booking status check
    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(booking.status)) {
      setValidationError(`ไม่สามารถปรับราคางานในสถานะ ${booking.status} ได้`);
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();

      // Call Supabase RPC admin_update_booking_price
      const { data, error } = await supabase.rpc('admin_update_booking_price', {
        p_booking_id: booking.id,
        p_new_price: newQuotedPrice,
        p_note: note.trim()
          ? `[ปรับราคาหน้างาน: ${adjustType === 'INCREASE' ? 'เพิ่ม' : 'ลด'} ฿${amountNum.toLocaleString('th-TH')}] ${note.trim()}`
          : `[ปรับราคาหน้างาน: ${adjustType === 'INCREASE' ? 'เพิ่ม' : 'ลด'} ฿${amountNum.toLocaleString('th-TH')}]`,
      });

      if (error) {
        console.error('RPC admin_update_booking_price error:', error);
        let userMsg = error.message;
        if (error.message?.includes('P0001')) {
          userMsg = error.message.replace(/^.*P0001:\s*/, '');
        }
        setValidationError(userMsg || 'เกิดข้อผิดพลาดในการอัปเดตราคางาน');
        setIsSubmitting(false);
        return;
      }

      const actionText = adjustType === 'INCREASE' ? 'เพิ่มราคา' : 'ลดราคา';
      const successMsg = `ปรับราคาหน้างาน (${actionText} ฿${amountNum.toLocaleString('th-TH')}) เป็น ฿${newQuotedPrice.toLocaleString('th-TH')} เรียบร้อยแล้ว`;
      
      onSuccess(successMsg);
      onClose();
    } catch (err: any) {
      console.error('Unexpected error adjusting price:', err);
      setValidationError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
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
            <div className="w-8 h-8 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-amber-400">
              <SlidersHorizontal size={16} />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-[#ECE4D3]">
                ปรับราคาหน้างาน (On-site Price Adjustment)
              </h3>
              <p className="text-[11px] text-[#A89F91]">
                ลูกค้า: <span className="text-[#ECE4D3] font-medium">{booking.customer_name}</span> • ช่างสัก: {booking.artist_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Validation Error Alert */}
        {validationError && (
          <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-lg flex items-start gap-2.5 text-xs text-red-300 animate-fadeIn">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Adjustment Type Selector (เพิ่มราคา vs ลดราคา) */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
              เลือกประเภทการปรับราคา <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdjustType('INCREASE');
                  setValidationError(null);
                }}
                className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  adjustType === 'INCREASE'
                    ? 'bg-amber-950/60 border-amber-500 text-amber-300 ring-1 ring-amber-500/50 shadow-md'
                    : 'bg-[#0E0D0C] border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] hover:border-[#7A7265]'
                }`}
              >
                <TrendingUp size={15} className={adjustType === 'INCREASE' ? 'text-amber-400' : ''} />
                <span>+ เพิ่มราคาหน้างาน</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustType('DECREASE');
                  setValidationError(null);
                }}
                className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  adjustType === 'DECREASE'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/50 shadow-md'
                    : 'bg-[#0E0D0C] border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] hover:border-[#7A7265]'
                }`}
              >
                <TrendingDown size={15} className={adjustType === 'DECREASE' ? 'text-emerald-400' : ''} />
                <span>- ลดราคาหน้างาน</span>
              </button>
            </div>
          </div>

          {/* 2. Amount Input & Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#ECE4D3]">
                จำนวนเงินที่ปรับ (บาท) <span className="text-red-400">*</span>
              </label>
              <span className="text-[10px] text-[#A89F91]">
                {adjustType === 'INCREASE' ? 'เพิ่มจากราคากลางเดิม' : 'ลดจากราคากลางเดิม'}
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#7A7265] font-semibold">
                ฿
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={amountStr}
                onChange={(e) => {
                  setAmountStr(e.target.value);
                  setValidationError(null);
                }}
                placeholder="ระบุจำนวนเงิน เช่น 500, 1000"
                disabled={isSubmitting}
                className="w-full pl-8 pr-4 py-2.5 bg-[#0E0D0C] border border-[#4A443A] focus:border-amber-400/80 rounded-lg text-sm text-[#ECE4D3] font-semibold focus:outline-none transition-colors"
                required
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
              <span className="text-[10px] text-[#7A7265] shrink-0">ตัวเลือกด่วน:</span>
              {quickAmountOptions.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setAmountStr(amt.toString());
                    setValidationError(null);
                  }}
                  className="px-2 py-0.5 bg-[#0E0D0C] hover:bg-[#26231F] border border-[#4A443A] text-[10px] text-[#A89F91] hover:text-[#ECE4D3] rounded transition-colors"
                >
                  +{amt.toLocaleString('th-TH')}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Reason for Adjustment */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1.5">
              เหตุผลการปรับราคา <span className="text-[#7A7265] font-normal">(บันทึกในประวัติ)</span>
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                adjustType === 'INCREASE'
                  ? 'ระบุเหตุผล เช่น เพิ่มรายละเอียดลายสัก, เพิ่มขนาดชิ้นงาน, เติมสีพิเศษ'
                  : 'ระบุเหตุผล เช่น ลดขนาดลายหน้างาน, ปรับแก้ดีไซน์ให้กระชับขึ้น, ตกลงส่วนลดพิเศษ'
              }
              disabled={isSubmitting}
              className="w-full p-2.5 bg-[#0E0D0C] border border-[#4A443A] focus:border-amber-400/80 rounded-lg text-xs text-[#ECE4D3] focus:outline-none transition-colors resize-none placeholder:text-[#5A5347]"
            />
          </div>

          {/* 4. Real-time Live Calculation Preview Box */}
          <div className="bg-[#0E0D0C] border border-[#4A443A]/80 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs border-b border-[#4A443A]/40 pb-2">
              <span className="text-[#A89F91] font-medium flex items-center gap-1">
                <Info size={13} className="text-amber-400" />
                สรุปการคำนวณยอดเงินใหม่ (Real-time Preview)
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              {/* Row 1: Current Quoted Price */}
              <div className="flex justify-between items-center text-[#A89F91]">
                <span>ราคางานเดิม (Current Price):</span>
                <span className="text-[#ECE4D3]">฿{currentPrice.toLocaleString('th-TH')}</span>
              </div>

              {/* Row 2: Adjustment Amount (+/-) */}
              <div className="flex justify-between items-center font-semibold">
                <span>ยอดที่ปรับ ({adjustType === 'INCREASE' ? 'เพิ่ม' : 'ลด'}):</span>
                <span className={adjustType === 'INCREASE' ? 'text-amber-400' : 'text-emerald-400'}>
                  {adjustType === 'INCREASE' ? '+' : '-'}฿{amountNum.toLocaleString('th-TH')}
                </span>
              </div>

              {/* Row 3: New Quoted Price */}
              <div className="flex justify-between items-center pt-1 border-t border-[#4A443A]/40 text-sm font-bold">
                <span className="font-prompt text-[#ECE4D3]">ราคางานใหม่ (New Price):</span>
                <span className={newQuotedPrice < paidTotal ? 'text-red-400' : 'text-[#ECE4D3]'}>
                  ฿{newQuotedPrice.toLocaleString('th-TH')}
                </span>
              </div>

              {/* Row 4: Total Paid */}
              <div className="flex justify-between items-center text-[#7A7265]">
                <span className="font-prompt">ชำระแล้วจริง (Total Paid):</span>
                <span className="text-emerald-400 font-semibold">฿{paidTotal.toLocaleString('th-TH')}</span>
              </div>

              {/* Row 5: New Remaining Balance */}
              <div className="flex justify-between items-center pt-1.5 border-t border-[#4A443A]/40 text-xs font-semibold">
                <span className="font-prompt text-[#A89F91]">ยอดคงเหลือใหม่ (New Remaining Balance):</span>
                <span className="text-amber-300 font-bold text-sm">
                  ฿{newRemainingBalance.toLocaleString('th-TH')}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/60">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs text-[#A89F91] hover:text-[#ECE4D3] bg-[#0E0D0C] border border-[#4A443A] rounded-lg transition-colors"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={isSubmitting || amountNum <= 0}
              className="px-4 py-2 text-xs font-bold text-stone-950 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-amber-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>กำลังบันทึกราคา...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>บันทึกการปรับราคา</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
