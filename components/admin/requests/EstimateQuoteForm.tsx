'use client';

import React, { useState } from 'react';
import { DollarSign, Clock, FileText, Send, X, ShieldCheck } from 'lucide-react';
import { EstimateRequestItem } from './types';
import { createClient } from '@/lib/supabase/client';

interface EstimateQuoteFormProps {
  estimate: EstimateRequestItem;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function EstimateQuoteForm({
  estimate,
  onSuccess,
  onCancel,
}: EstimateQuoteFormProps) {
  const [quotedPrice, setQuotedPrice] = useState<string>('');
  const [depositRequired, setDepositRequired] = useState<string>('1500');
  const [durationMinutes, setDurationMinutes] = useState<string>('180');
  const [quoteNote, setQuoteNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const price = parseFloat(quotedPrice);
    const deposit = parseFloat(depositRequired) || 0;
    const duration = parseInt(durationMinutes, 10) || null;

    if (isNaN(price) || price <= 0) {
      setErrorMessage('กรุณาระบุราคางานสักที่ถูกต้อง (มากกว่า 0 บาท)');
      return;
    }

    if (deposit < 0 || deposit > price) {
      setErrorMessage('เงินมัดจำต้องไม่ติดลบ และไม่เกินราคางานสัก');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('estimate_requests')
        .update({
          status: 'QUOTED',
          quoted_price: price,
          deposit_required: deposit,
          estimated_duration_minutes: duration,
          quote_note: quoteNote.trim() || null,
          quoted_at: new Date().toISOString(),
        })
        .eq('id', estimate.id);

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      console.error('Error submitting quote:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการส่งใบเสนอราคา');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-4 sm:p-5 space-y-4 font-prompt">
      <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#171512] border border-[#4A443A] flex items-center justify-center text-blue-400">
            <DollarSign size={15} />
          </div>
          <div>
            <h4 className="text-sm font-heading font-semibold text-[#ECE4D3]">
              ส่งใบเสนอราคา / ประเมินคิวงาน
            </h4>
            <p className="text-[11px] text-[#A89F91]">
              กำหนดราคา ระยะเวลา และเงินมัดจำสำหรับคำขอนี้
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[#7A7265] hover:text-[#ECE4D3] p-1 rounded"
        >
          <X size={15} />
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Quoted Price */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              ราคางานสักที่ประเมิน (บาท) <span className="text-[#9C2F2F]">*</span>
            </label>
            <input
              id="input-quoted-price"
              type="number"
              min="1"
              step="any"
              required
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(e.target.value)}
              placeholder="เช่น 5500"
              className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Deposit Required */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              เงินมัดจำที่กำหนด (บาท)
            </label>
            <input
              id="input-deposit-required"
              type="number"
              min="0"
              step="any"
              value={depositRequired}
              onChange={(e) => setDepositRequired(e.target.value)}
              placeholder="เช่น 1500 (ใส่ 0 หากไม่ต้องมัดจำ)"
              className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* Estimated Duration */}
        <div>
          <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
            ระยะเวลาโดยประมาณ (นาที)
          </label>
          <input
            id="input-duration-minutes"
            type="number"
            min="1"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="เช่น 180 (3 ชั่วโมง)"
            className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* Quote Note */}
        <div>
          <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
            หมายเหตุการประเมินราคา (ส่งให้ลูกค้าดู)
          </label>
          <textarea
            id="input-quote-note"
            rows={2}
            value={quoteNote}
            onChange={(e) => setQuoteNote(e.target.value)}
            placeholder="เช่น ราคานี้รวมค่าออกแบบและลงสีดำเทาแล้ว หรือคำแนะนำเพิ่มเติม..."
            className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-blue-400 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/50">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#A89F91] hover:text-[#ECE4D3] rounded-md transition-colors"
          >
            ยกเลิก
          </button>
          <button
            id="btn-submit-quote"
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white rounded-md transition-colors flex items-center gap-1.5 shadow"
          >
            <Send size={13} />
            <span>{isSubmitting ? 'กำลังส่ง...' : 'ส่งใบเสนอราคา'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
