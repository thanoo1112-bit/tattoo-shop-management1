'use client';

import React, { useState } from 'react';
import { Calendar, Clock, DollarSign, FileText, CheckCircle2, X, AlertCircle, Loader2 } from 'lucide-react';
import { EstimateRequestItem } from './types';
import { createClient } from '@/lib/supabase/client';

interface EstimateQuoteFormProps {
  estimate: EstimateRequestItem;
  onSuccess: (status?: string) => void;
  onCancel: () => void;
}

export default function EstimateQuoteForm({
  estimate,
  onSuccess,
  onCancel,
}: EstimateQuoteFormProps) {
  // 1. Initial State: Default date to customer preferred date or today
  const defaultDate = estimate.preferred_date || new Date().toISOString().split('T')[0];
  const [appointmentDate, setAppointmentDate] = useState<string>(defaultDate);
  const [startTime, setStartTime] = useState<string>('13:00');
  const [endTime, setEndTime] = useState<string>('16:00');
  const [quotedPrice, setQuotedPrice] = useState<string>(
    estimate.quoted_price !== null && estimate.quoted_price !== undefined ? String(estimate.quoted_price) : '0'
  );
  const [depositRequired, setDepositRequired] = useState<string>(
    estimate.deposit_required !== null && estimate.deposit_required !== undefined ? String(estimate.deposit_required) : '0'
  );
  const [adminNote, setAdminNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 2. Validation
    if (!appointmentDate) {
      setErrorMessage('กรุณาระบุวันนัดจริง');
      return;
    }

    if (!startTime || !endTime) {
      setErrorMessage('กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด');
      return;
    }

    if (endTime <= startTime) {
      setErrorMessage('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
      return;
    }

    const priceVal = parseFloat(quotedPrice);
    if (isNaN(priceVal) || priceVal < 0) {
      setErrorMessage('ราคางานสักต้องเป็นตัวเลขและไม่ติดลบ (ระบุ 0 หากไม่ระบุราคา)');
      return;
    }

    const depositVal = parseFloat(depositRequired);
    if (isNaN(depositVal) || depositVal < 0) {
      setErrorMessage('เงินมัดจำต้องเป็นตัวเลขและไม่ติดลบ (ระบุ 0 หากไม่มีมัดจำ)');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const formattedStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      const formattedEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;

      // Update quoted_price on estimate_requests if provided
      if (!isNaN(priceVal)) {
        await supabase
          .from('estimate_requests')
          .update({ quoted_price: priceVal })
          .eq('id', estimate.id);
      }

      const { data, error } = await supabase.rpc('admin_confirm_booking_request', {
        p_estimate_request_id: estimate.id,
        p_appointment_date: appointmentDate,
        p_start_time: formattedStartTime,
        p_end_time: formattedEndTime,
        p_deposit_required: depositVal,
        p_admin_note: adminNote.trim() || null,
      });

      if (error) {
        console.error('RPC admin_confirm_booking_request error:', error);
        if (
          error.code === '23P01' ||
          error.message?.includes('no_artist_double_booking') ||
          error.message?.includes('conflicts with existing key')
        ) {
          setErrorMessage('ช่วงเวลานี้มีคิวของช่างอยู่แล้ว กรุณาเลือกเวลาอื่น');
        } else if (error.code === '42501' || error.message?.includes('Unauthorized')) {
          setErrorMessage('คุณไม่มีสิทธิ์ยืนยันคำขอนี้');
        } else if (error.code === 'P0002') {
          setErrorMessage('ไม่พบคำขอจองนี้ในระบบ');
        } else if (
          error.code === '22023' ||
          error.code === '23505' ||
          error.message?.includes('status') ||
          error.message?.includes('already exists')
        ) {
          setErrorMessage('คำขอนี้ได้รับการยืนยันไปแล้ว');
        } else {
          setErrorMessage(error.message || 'เกิดข้อผิดพลาดในการยืนยันคิวสัก');
        }
        return;
      }

      onSuccess(depositVal > 0 ? 'WAITING_DEPOSIT' : 'CONFIRMED');
    } catch (err: any) {
      console.error('Error in confirm booking:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-4 sm:p-5 space-y-4 font-prompt animate-fadeIn">
      {/* Form Header */}
      <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#171512] border border-[#4A443A] flex items-center justify-center text-emerald-400">
            <Calendar size={15} />
          </div>
          <div>
            <h4 className="text-sm font-heading font-semibold text-[#ECE4D3]">
              จัดการคำขอจองคิวสัก
            </h4>
            <p className="text-[11px] text-[#A89F91]">
              กำหนดวันเวลานัดหมายและมัดจำเพื่อลงตารางคิวสัก
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-[#7A7265] hover:text-[#ECE4D3] p-1 rounded"
        >
          <X size={15} />
        </button>
      </div>

      {/* Error Message Box */}
      {errorMessage && (
        <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-start gap-2">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form Fields */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Appointment Date */}
        <div>
          <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
            วันนัดจริง (Appointment Date) <span className="text-[#9C2F2F]">*</span>
          </label>
          <div className="relative">
            <input
              id="input-appointment-date"
              type="date"
              required
              disabled={isSubmitting}
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
              className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
            />
          </div>
          {estimate.preferred_date && (
            <p className="text-[10px] text-[#7A7265] mt-1">
              วันที่ลูกค้าสะดวก: <span className="text-[#ECE4D3]">{estimate.preferred_date}</span>
            </p>
          )}
        </div>

        {/* 2. Start Time & End Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              เวลาเริ่ม (Start Time) <span className="text-[#9C2F2F]">*</span>
            </label>
            <input
              id="input-start-time"
              type="time"
              required
              disabled={isSubmitting}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              เวลาสิ้นสุด (End Time) <span className="text-[#9C2F2F]">*</span>
            </label>
            <input
              id="input-end-time"
              type="time"
              required
              disabled={isSubmitting}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        {/* 3. Tattoo Price & Deposit (Same Row on Desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              ราคางานสัก (บาท)
            </label>
            <input
              id="input-quoted-price"
              type="number"
              min="0"
              step="any"
              disabled={isSubmitting}
              value={quotedPrice}
              onChange={(e) => setQuotedPrice(e.target.value)}
              placeholder="0"
              className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
            />
            <p className="text-[10px] text-[#7A7265] mt-1">
              ระบุ 0 หากยังไม่กำหนดราคา
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              เงินมัดจำ (บาท)
            </label>
            <input
              id="input-deposit-required"
              type="number"
              min="0"
              step="any"
              disabled={isSubmitting}
              value={depositRequired}
              onChange={(e) => setDepositRequired(e.target.value)}
              placeholder="0"
              className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
            />
            <p className="text-[10px] text-[#7A7265] mt-1">
              ระบุ 0 หากไม่เรียกเก็บมัดจำ
            </p>
          </div>
        </div>

        {/* 4. Admin / Shop Note */}
        <div>
          <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
            หมายเหตุของร้าน/ช่าง (Admin Note)
          </label>
          <textarea
            id="input-admin-note"
            rows={2}
            disabled={isSubmitting}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="ข้อความหรือคำแนะนำถึงลูกค้า / บันทึกภายในร้าน..."
            className="w-full bg-[#171512] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400 resize-none"
          />
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/60">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 bg-[#171512] hover:bg-[#1F1D1A] text-xs text-[#A89F91] hover:text-[#ECE4D3] rounded-lg border border-[#4A443A] transition-colors"
          >
            ยกเลิก
          </button>
          <button
            id="btn-confirm-booking-submit"
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5 shadow"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>กำลังยืนยันคิว...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                <span>ยืนยันและลงคิวสัก</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
