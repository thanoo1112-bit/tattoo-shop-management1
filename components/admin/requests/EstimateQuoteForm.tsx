'use client';

import React, { useState } from 'react';
import { Calendar, Clock, DollarSign, FileText, CheckCircle2, X, AlertCircle, Loader2 } from 'lucide-react';
import { EstimateRequestItem } from './types';
import { createClient } from '@/lib/supabase/client';
import { parseNoteWithPreferredTime, getInitialStartTime, extractHHMM } from '@/lib/noteUtils';
import { BlockedDateRecord, checkDateAvailability } from '@/lib/availabilityUtils';

interface EstimateQuoteFormProps {
  estimate: EstimateRequestItem;
  blockedDates?: BlockedDateRecord[];
  onSuccess: (status?: string) => void;
  onCancel: () => void;
}

export default function EstimateQuoteForm({
  estimate,
  blockedDates = [],
  onSuccess,
  onCancel,
}: EstimateQuoteFormProps) {
  // 1. Initial State: Default date to customer preferred date or today
  const defaultDate = estimate.preferred_date || new Date().toISOString().split('T')[0];
  const initialDurationHours = estimate.estimated_duration_minutes
    ? String(Math.max(1, Math.round(estimate.estimated_duration_minutes / 60)))
    : '5';

  const [appointmentDate, setAppointmentDate] = useState<string>(defaultDate);
  const [durationHours, setDurationHours] = useState<string>(initialDurationHours);
  const [quotedPrice, setQuotedPrice] = useState<string>(
    estimate.quoted_price !== null && estimate.quoted_price !== undefined ? String(estimate.quoted_price) : '0'
  );
  const [depositRequired, setDepositRequired] = useState<string>(
    estimate.deposit_required !== null && estimate.deposit_required !== undefined ? String(estimate.deposit_required) : '0'
  );
  const [adminNote, setAdminNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync form state when estimate prop changes or modal opens
  React.useEffect(() => {
    const dDate = estimate.preferred_date || new Date().toISOString().split('T')[0];
    const dDuration = estimate.estimated_duration_minutes
      ? String(Math.max(1, Math.round(estimate.estimated_duration_minutes / 60)))
      : '5';
    setAppointmentDate(dDate);
    setDurationHours(dDuration);
    setQuotedPrice(
      estimate.quoted_price !== null && estimate.quoted_price !== undefined ? String(estimate.quoted_price) : '0'
    );
    setDepositRequired(
      estimate.deposit_required !== null && estimate.deposit_required !== undefined ? String(estimate.deposit_required) : '0'
    );
    setAdminNote('');
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [estimate.id, estimate.preferred_date, estimate.estimated_duration_minutes, estimate.quoted_price, estimate.deposit_required]);

  // Helper function to calculate internal end_at from internal start_at + duration_hours
  const calculateEndTime = (startHHMM: string, durationInHours: number): string => {
    const [hStr, mStr] = startHHMM.split(':');
    const startH = parseInt(hStr || '13', 10);
    const startM = parseInt(mStr || '0', 10);

    const startTotalMinutes = startH * 60 + startM;
    const durationMinutes = Math.round(durationInHours * 60);
    let totalMinutes = startTotalMinutes + durationMinutes;

    // Cap at 23:59 so that end_time > start_time remains valid for single-day range
    if (totalMinutes >= 24 * 60) {
      totalMinutes = 23 * 60 + 59;
    }

    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;

    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 2. Validation
    if (!appointmentDate) {
      setErrorMessage('กรุณาระบุวันนัดจริง');
      return;
    }

    const availCheck = checkDateAvailability(
      appointmentDate,
      estimate.artist_id,
      blockedDates,
      estimate.artist_nickname || estimate.artist_name
    );

    if (availCheck.isBlocked) {
      setErrorMessage(availCheck.errorMessage || 'ไม่สามารถเลือกวันที่นี้ได้ เนื่องจากเป็นวันที่ปิดรับคิว');
      return;
    }

    const durationVal = parseFloat(durationHours);
    if (!durationHours.trim() || isNaN(durationVal) || durationVal < 1) {
      setErrorMessage('กรุณาระบุระยะเวลาสักโดยประมาณ');
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
      const internalStartTime = getInitialStartTime(estimate, '13:00');
      const internalEndTime = calculateEndTime(internalStartTime, durationVal);

      const formattedStartTime = internalStartTime.length === 5 ? `${internalStartTime}:00` : internalStartTime;
      const formattedEndTime = internalEndTime.length === 5 ? `${internalEndTime}:00` : internalEndTime;

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
          error.code === '23505' ||
          error.message?.includes('already exists') ||
          error.message?.includes('must be PENDING') ||
          error.message?.includes('is in status ACCEPTED')
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
    <div className="bg-studio-card border border-studio-border rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 font-prompt">
      {/* Form Header */}
      <div className="flex items-center justify-between border-b border-studio-border pb-3">
        <h3 className="font-semibold text-sm text-studio-primary">จัดการคำขอจองคิวสัก</h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-studio-secondary hover:text-white cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Error Message Box */}
      {errorMessage && (
        <div className="p-3 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs flex items-start gap-2">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form Fields */}
      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        {/* 1. Appointment Date */}
        <div>
          <label className="block text-studio-secondary mb-1">
            วันนัดหมาย *
          </label>
          <input
            id="input-appointment-date"
            type="date"
            required
            disabled={isSubmitting}
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red"
          />
          {(() => {
            const rawTime = estimate.preferred_time || (estimate as any).preferredTime;
            const { extractedTime } = parseNoteWithPreferredTime(estimate.description);
            let displayTime: string | null = null;
            if (rawTime) {
              const hhmm = extractHHMM(rawTime) || rawTime;
              displayTime = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
            } else if (extractedTime) {
              displayTime = extractedTime;
            }
            if (!estimate.preferred_date && !displayTime) return null;
            return (
              <p className="text-[10px] text-studio-muted mt-1 flex flex-wrap gap-x-3">
                {estimate.preferred_date && (
                  <span>วันที่ลูกค้าสะดวก: <span className="text-studio-primary">{estimate.preferred_date}</span></span>
                )}
                {displayTime && (
                  <span>เวลาที่สะดวก: <span className="text-studio-primary">{displayTime}</span></span>
                )}
              </p>
            );
          })()}
        </div>

        {/* 2. Estimated Duration */}
        <div>
          <label htmlFor="input-duration-hours" className="block text-studio-secondary mb-1">
            ระยะเวลาสักโดยประมาณ *
          </label>
          <div className="relative flex items-center">
            <input
              id="input-duration-hours"
              type="number"
              min="1"
              step="any"
              required
              disabled={isSubmitting}
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              placeholder="5"
              className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red pr-14"
            />
            <span className="absolute right-3 text-studio-secondary text-xs pointer-events-none">
              ชั่วโมง
            </span>
          </div>
        </div>

        {/* 3. Tattoo Price & Deposit */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-studio-secondary mb-1">
              ราคางานสัก (฿)
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
              className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
            />
          </div>

          <div>
            <label className="block text-studio-secondary mb-1">
              เงินมัดจำ (฿)
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
              className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
            />
          </div>
        </div>

        {/* 4. Admin / Shop Note */}
        <div>
          <label className="block text-studio-secondary mb-1">
            หมายเหตุของร้าน/ช่าง
          </label>
          <textarea
            id="input-admin-note"
            rows={2}
            disabled={isSubmitting}
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="รายละเอียดเพิ่มเติมสำหรับการนัดหมาย..."
            className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary focus:outline-none focus:border-studio-red resize-none"
          />
        </div>

        {/* Form Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-studio-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full py-2.5 px-3 rounded-xl border border-studio-border bg-studio-sec hover:bg-studio-card text-studio-secondary font-medium text-xs cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            id="btn-confirm-booking-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>กำลังบันทึก...</span>
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
