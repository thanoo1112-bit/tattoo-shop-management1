'use client';

import React, { useState } from 'react';
import { X, DollarSign, AlertCircle, ArrowUpRight, ArrowDownRight, Check, Loader2 } from 'lucide-react';
import { formatCurrency } from './types';

interface UpdateBookingPriceModalProps {
  isOpen: boolean;
  currentPrice: number;
  paidTotal: number;
  onClose: () => void;
  onSubmit: (newPrice: number, note: string) => Promise<void>;
}

export default function UpdateBookingPriceModal({
  isOpen,
  currentPrice,
  paidTotal,
  onClose,
  onSubmit,
}: UpdateBookingPriceModalProps) {
  const [newPriceStr, setNewPriceStr] = useState<string>(String(currentPrice || ''));
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const newPriceNum = parseFloat(newPriceStr) || 0;
  const diff = newPriceNum - currentPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isNaN(newPriceNum) || newPriceNum <= 0) {
      setError('ราคางานใหม่ต้องมากกว่า 0 บาท');
      return;
    }

    if (newPriceNum === currentPrice) {
      setError('ราคางานใหม่ต้องไม่เท่ากับราคาปัจจุบัน');
      return;
    }

    if (newPriceNum < paidTotal) {
      setError(`ราคางานใหม่ต้องไม่น้อยกว่ายอดที่ลูกค้าชำระแล้ว (ชำระแล้ว ฿${formatCurrency(paidTotal)})`);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(newPriceNum, note.trim());
      onClose();
    } catch (err: any) {
      console.error('Error updating price:', err);
      setError(err.message || 'เกิดข้อผิดพลาดในการอัปเดตราคางาน');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#121110] border border-[#4A443A] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden font-prompt">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#4A443A]/50 bg-[#171512]">
          <div className="flex items-center gap-2 text-[#ECE4D3]">
            <DollarSign className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold">อัปเดตราคางาน</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#26231F] rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Financial Context */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#171512] p-3 rounded-xl border border-[#4A443A]/40">
              <span className="text-[10px] text-[#7A7265] block">ราคาปัจจุบัน</span>
              <span className="text-sm font-semibold text-[#ECE4D3] mt-0.5 block">
                ฿{formatCurrency(currentPrice)}
              </span>
            </div>
            <div className="bg-[#171512] p-3 rounded-xl border border-[#4A443A]/40">
              <span className="text-[10px] text-[#7A7265] block">ชำระแล้ว</span>
              <span className="text-sm font-semibold text-emerald-400 mt-0.5 block">
                ฿{formatCurrency(paidTotal)}
              </span>
            </div>
          </div>

          {/* New Price Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#ECE4D3]">
              ราคางานใหม่ (บาท) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#7A7265] font-semibold">
                ฿
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={newPriceStr}
                onChange={(e) => setNewPriceStr(e.target.value)}
                placeholder="ระบุราคางานใหม่"
                disabled={isSubmitting}
                className="w-full pl-8 pr-4 py-2.5 bg-[#171512] border border-[#4A443A] focus:border-amber-400/80 rounded-xl text-sm text-[#ECE4D3] focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* Difference Indicator */}
          {newPriceNum > 0 && newPriceNum !== currentPrice && (
            <div className="flex items-center justify-between p-3 bg-[#171512] border border-[#4A443A]/60 rounded-xl text-xs">
              <span className="text-[#A89F91]">ผลต่างการปรับราคา:</span>
              <span
                className={`font-semibold flex items-center gap-1 ${
                  diff > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {diff > 0 ? (
                  <>
                    <ArrowUpRight size={14} /> +฿{formatCurrency(diff)}
                  </>
                ) : (
                  <>
                    <ArrowDownRight size={14} /> -฿{formatCurrency(Math.abs(diff))}
                  </>
                )}
              </span>
            </div>
          )}

          {/* Adjustment Details Note */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#ECE4D3]">
              รายละเอียดการปรับราคา
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ระบุรายละเอียด เช่น เพิ่มรายละเอียดบริเวณต้นแขน, ปรับขนาดลายหน้างาน"
              disabled={isSubmitting}
              className="w-full p-3 bg-[#171512] border border-[#4A443A] focus:border-amber-400/80 rounded-xl text-xs text-[#ECE4D3] focus:outline-none transition-colors resize-none placeholder:text-[#5A5347]"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#4A443A]/40">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-[#4A443A] text-xs font-medium text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#26231F] transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-xs font-bold text-stone-950 flex items-center gap-1.5 shadow-lg shadow-amber-950/40 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>บันทึกราคา</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
