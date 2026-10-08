'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, DollarSign, FileText, CheckCircle2, X, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { parseNoteWithPreferredTime, getInitialStartTime, extractHHMM } from '@/lib/noteUtils';
import { calculateBlockingEndTime, STUDIO_OPERATING_HOURS } from '@/lib/utils/tattooDuration';
import { BlockedDateRecord, checkDateAvailability } from '@/lib/availabilityUtils';

interface EstimateQuoteFormProps {
  estimate: any;
  blockedDates?: BlockedDateRecord[];
  mode?: 'admin' | 'artist';
  currentArtistId?: string | null;
  onSuccess: (status?: string) => void;
  onCancel: () => void;
}

export default function EstimateQuoteForm({
  estimate,
  blockedDates = [],
  mode = 'admin',
  currentArtistId = null,
  onSuccess,
  onCancel,
}: EstimateQuoteFormProps) {
  const defaultDate = estimate.preferred_date || new Date().toISOString().split('T')[0];
  const initialStartTime = getInitialStartTime(estimate, '10:00');
  const initialEndTime = calculateBlockingEndTime(
    initialStartTime,
    (estimate as any)?.estimated_size_tier,
    estimate.width_cm,
    estimate.height_cm,
    estimate.description
  );

  const [appointmentDate, setAppointmentDate] = useState<string>(defaultDate);
  const [startTime, setStartTime] = useState<string>(initialStartTime);
  const [endTime, setEndTime] = useState<string>(initialEndTime);
  const [quotedPrice, setQuotedPrice] = useState<string>(
    estimate.quoted_price !== null && estimate.quoted_price !== undefined ? String(estimate.quoted_price) : '0'
  );
  const [depositRequired, setDepositRequired] = useState<string>(
    estimate.deposit_required !== null && estimate.deposit_required !== undefined ? String(estimate.deposit_required) : '500'
  );
  const [adminNote, setAdminNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync form state when estimate prop changes or modal opens
  useEffect(() => {
    const dDate = estimate.preferred_date || new Date().toISOString().split('T')[0];
    const sTime = getInitialStartTime(estimate, '10:00');
    const eTime = calculateBlockingEndTime(
      sTime,
      (estimate as any)?.estimated_size_tier,
      estimate.width_cm,
      estimate.height_cm,
      estimate.description
    );

    setAppointmentDate(dDate);
    setStartTime(sTime);
    setEndTime(eTime);
    setQuotedPrice(
      estimate.quoted_price !== null && estimate.quoted_price !== undefined ? String(estimate.quoted_price) : '0'
    );
    setDepositRequired(
      estimate.deposit_required !== null && estimate.deposit_required !== undefined ? String(estimate.deposit_required) : '500'
    );
    setAdminNote('');
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [estimate.id, estimate.preferred_date, estimate.quoted_price, estimate.deposit_required]);

  // When startTime changes, update default calculated endTime
  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    if (newStartTime) {
      const calcEnd = calculateBlockingEndTime(
        newStartTime,
        (estimate as any)?.estimated_size_tier,
        estimate.width_cm,
        estimate.height_cm,
        estimate.description
      );
      setEndTime(calcEnd);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Ownership & Permission check for Artist mode
    if (mode === 'artist' && estimate.artist_id && currentArtistId && estimate.artist_id !== currentArtistId) {
      setErrorMessage('คุณไม่มีสิทธิ์ยืนยันคำขอของช่างคนอื่น');
      return;
    }

    // 2. Date Validation
    if (!appointmentDate) {
      setErrorMessage('กรุณาระบุวันนัดจริง');
      return;
    }

    // 3. Blocked Dates Check
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

    // 4. Time Validation (Operating Hours 10:00 - 23:00)
    if (!startTime || !endTime) {
      setErrorMessage('กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด');
      return;
    }

    const parseMinutes = (tStr: string) => {
      const [h, m] = tStr.split(':').map((v) => parseInt(v, 10) || 0);
      return h * 60 + m;
    };

    const startTotalMin = parseMinutes(startTime);
    const endTotalMin = parseMinutes(endTime);
    const openMin = STUDIO_OPERATING_HOURS.OPEN_MINUTES; // 600 (10:00)
    const closeMin = STUDIO_OPERATING_HOURS.CLOSE_MINUTES; // 1380 (23:00)

    if (startTotalMin < openMin || endTotalMin > closeMin) {
      setErrorMessage('เวลาที่เลือกอยู่นอกเวลาทำการของร้าน (10:00 - 23:00 น.)');
      return;
    }

    if (endTotalMin <= startTotalMin) {
      setErrorMessage('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม');
      return;
    }

    // 5. Price & Deposit Validation
    const priceVal = parseFloat(quotedPrice);
    if (mode === 'admin') {
      if (isNaN(priceVal) || priceVal < 0) {
        setErrorMessage('ราคางานสักต้องเป็นตัวเลขและไม่ติดลบ (ระบุ 0 หากไม่ระบุราคา)');
        return;
      }
    }

    const depositVal = parseFloat(depositRequired);
    if (isNaN(depositVal) || depositVal < 0) {
      setErrorMessage('เงินมัดจำต้องเป็นตัวเลขและไม่ติดลบ (ระบุ 0 หากไม่มีมัดจำ)');
      return;
    }

    if (mode === 'admin' && priceVal > 0 && depositVal > priceVal) {
      setErrorMessage('เงินมัดจำต้องไม่เกินราคางานสัก');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const formattedStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      const formattedEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;

      const apptDateTime = new Date(`${appointmentDate}T${formattedStartTime}`);
      if (apptDateTime.getTime() < Date.now()) {
        setErrorMessage('เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่');
        setIsSubmitting(false);
        return;
      }

      if (mode === 'artist') {
        // Execute Artist Confirmation RPC (Artist does not estimate price)
        const { data, error } = await supabase.rpc('artist_confirm_booking_request', {
          p_estimate_request_id: estimate.id,
          p_appointment_date: appointmentDate,
          p_start_time: formattedStartTime,
          p_end_time: formattedEndTime,
          p_quoted_price: null,
          p_deposit_required: depositVal,
          p_artist_note: adminNote.trim() || null,
        });

        if (error) {
          console.error('RPC artist_confirm_booking_request error:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
          const isStatusMismatch =
            error.message?.includes('must be PENDING') ||
            error.message?.includes('is in status ACCEPTED') ||
            error.message?.includes('A booking already exists for estimate request');

          if (isStatusMismatch) {
            setErrorMessage('คำขอนี้ได้รับการยืนยันไปแล้ว');
          } else if (error.message?.includes('PAST_APPOINTMENT_TIME')) {
            setErrorMessage('เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่');
          } else if (
            error.code === '23P01' ||
            error.message?.includes('no_artist_double_booking') ||
            error.message?.includes('conflicts with existing key')
          ) {
            setErrorMessage('ช่วงเวลานี้มีคิวของช่างอยู่แล้ว กรุณาเลือกเวลาอื่น');
          } else if (error.code === '42501' || error.message?.includes('Unauthorized')) {
            setErrorMessage('คุณไม่มีสิทธิ์ยืนยันคำขอนี้');
          } else if (error.code === 'P0002') {
            setErrorMessage('ไม่พบคำขอจองนี้ในระบบ');
          } else if (error.code === '23505' || error.message?.includes('already exists')) {
            setErrorMessage('บันทึกการยืนยันไม่สำเร็จ กรุณาตรวจสอบข้อมูลที่เกี่ยวข้อง');
          } else {
            setErrorMessage(error.message || 'เกิดข้อผิดพลาดในการยืนยันคิวสัก');
          }
          return;
        }
      } else {
        // Execute Admin Confirmation RPC
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
          console.error('RPC admin_confirm_booking_request error:', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
          const isStatusMismatch =
            error.message?.includes('must be PENDING') ||
            error.message?.includes('is in status ACCEPTED') ||
            error.message?.includes('A booking already exists for estimate request');

          if (isStatusMismatch) {
            setErrorMessage('คำขอนี้ได้รับการยืนยันไปแล้ว');
          } else if (
            error.code === '23P01' ||
            error.message?.includes('no_artist_double_booking') ||
            error.message?.includes('conflicts with existing key')
          ) {
            setErrorMessage('ช่วงเวลานี้มีคิวของช่างอยู่แล้ว กรุณาเลือกเวลาอื่น');
          } else if (error.code === '42501' || error.message?.includes('Unauthorized')) {
            setErrorMessage('คุณไม่มีสิทธิ์ยืนยันคำขอนี้');
          } else if (error.code === 'P0002') {
            setErrorMessage('ไม่พบคำขอจองนี้ในระบบ');
          } else if (error.code === '23505' || error.message?.includes('already exists')) {
            setErrorMessage('บันทึกการยืนยันไม่สำเร็จ กรุณาตรวจสอบข้อมูลที่เกี่ยวข้อง');
          } else {
            setErrorMessage(error.message || 'เกิดข้อผิดพลาดในการยืนยันคิวสัก');
          }
          return;
        }
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
        <h3 className="font-semibold text-sm text-studio-primary">
          {mode === 'artist' ? 'ยืนยันรับงานและลงคิวสัก' : 'จัดการคำขอจองคิวสัก'}
        </h3>
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
            วันนัดหมาย <span className="text-red-400">*</span>
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

        {/* 2. Start Time & End Time */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-studio-secondary mb-1">
              เวลาเริ่ม <span className="text-red-400">*</span>
            </label>
            <input
              id="input-start-time"
              type="time"
              required
              disabled={isSubmitting}
              value={startTime}
              onChange={(e) => handleStartTimeChange(e.target.value)}
              className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
            />
          </div>
          <div>
            <label className="block text-studio-secondary mb-1">
              เวลาสิ้นสุด <span className="text-red-400">*</span>
            </label>
            <input
              id="input-end-time"
              type="time"
              required
              disabled={isSubmitting}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
            />
          </div>
        </div>

        {/* 3. Deposit (and Price for Admin) */}
        {mode === 'admin' ? (
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
                placeholder="500"
                className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
              />
            </div>
          </div>
        ) : (
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
              placeholder="500"
              className="w-full bg-studio-sec border border-studio-border rounded-xl px-3 py-2 text-studio-primary font-mono focus:outline-none focus:border-studio-red"
            />
          </div>
        )}

        {/* 4. Note to Customer */}
        <div>
          <label className="block text-studio-secondary mb-1">
            {mode === 'artist' ? 'หมายเหตุถึงลูกค้า' : 'หมายเหตุของร้าน/ช่าง'}
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
                <span>{mode === 'artist' ? 'ยืนยันรับงาน' : 'ยืนยันและลงคิวสัก'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
