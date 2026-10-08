'use client';

import React, { useState, useMemo } from 'react';
import { Calendar, Plus, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { BookingItem, toBangkokDateString } from './types';
import { createClient } from '@/lib/supabase/client';
import { BlockedDateRecord, checkDateAvailability } from '@/lib/availabilityUtils';

interface CreateSessionDialogProps {
  booking: BookingItem;
  blockedDates?: BlockedDateRecord[];
  existingSessionCount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export interface DurationResolution {
  durationMinutes: number | null;
  sourceText: string;
  sourceType: 'EXISTING_SESSION' | 'ESTIMATED_DURATION' | 'SIZE_TIER' | 'DIMENSIONS' | 'NONE';
}

/**
 * Resolves authoritative duration in minutes for a booking based on:
 * 1. Existing non-cancelled session duration
 * 2. Explicit estimated_duration_minutes / duration
 * 3. Tattoo size tier / physical dimensions (Phase 47 business rules)
 */
export function resolveBookingDuration(booking: BookingItem): DurationResolution {
  // 1. Check existing non-cancelled sessions (if any)
  const sessions = booking.sessions || [];
  const validSession = sessions.find(
    (s) => s.start_at && s.end_at && s.status !== 'CANCELLED'
  );
  if (validSession) {
    const startMs = new Date(validSession.start_at).getTime();
    const endMs = new Date(validSession.end_at).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
      const mins = Math.round((endMs - startMs) / 60000);
      if (mins > 0) {
        return {
          durationMinutes: mins,
          sourceText: 'อ้างอิงรอบสักเดิม',
          sourceType: 'EXISTING_SESSION',
        };
      }
    }
  }

  // 2. Check explicit estimated_duration_minutes or duration
  const estMins =
    (booking as any).estimated_duration_minutes ||
    (booking as any).estimate_request?.estimated_duration_minutes;
  if (typeof estMins === 'number' && estMins > 0) {
    return {
      durationMinutes: estMins,
      sourceText: 'อ้างอิงระยะเวลาประเมิน',
      sourceType: 'ESTIMATED_DURATION',
    };
  }

  const durationHours = (booking as any).duration;
  if (typeof durationHours === 'number' && durationHours > 0) {
    return {
      durationMinutes: durationHours * 60,
      sourceText: 'อ้างอิงระยะเวลาประเมิน',
      sourceType: 'ESTIMATED_DURATION',
    };
  }

  // 3. Check Size Tier / Dimensions (Phase 47 rules)
  const sizeTier = (
    (booking as any).estimated_size_tier ||
    (booking as any).estimate_request?.estimated_size_tier ||
    ''
  ).toUpperCase();

  const width = booking.width_cm || (booking as any).estimate_request?.width_cm;
  const height = booking.height_cm || (booking as any).estimate_request?.height_cm;

  if (sizeTier) {
    if (sizeTier === 'XXL' || sizeTier === 'FULL_PROJECT' || sizeTier.includes('XXL')) {
      return { durationMinutes: 360, sourceText: 'อ้างอิงขนาด XXL / เต็มโครงการ', sourceType: 'SIZE_TIER' };
    }
    if (sizeTier === 'XL') {
      return { durationMinutes: 360, sourceText: 'อ้างอิงขนาด XL', sourceType: 'SIZE_TIER' };
    }
    if (sizeTier === 'L' || sizeTier === 'LARGE') {
      return { durationMinutes: 240, sourceText: 'อ้างอิงขนาด L', sourceType: 'SIZE_TIER' };
    }
    if (sizeTier === 'M' || sizeTier === 'SMALL_MED') {
      return { durationMinutes: 120, sourceText: 'อ้างอิงขนาด M', sourceType: 'SIZE_TIER' };
    }
    if (sizeTier === 'S' || sizeTier === 'MICRO') {
      return { durationMinutes: 60, sourceText: 'อ้างอิงขนาด S', sourceType: 'SIZE_TIER' };
    }
  }

  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    const maxDim = Math.max(width, height);
    if (maxDim > 25) {
      return { durationMinutes: 360, sourceText: `อ้างอิงขนาด ${width}x${height} ซม. (XXL)`, sourceType: 'DIMENSIONS' };
    }
    if (maxDim > 15) {
      return { durationMinutes: 360, sourceText: `อ้างอิงขนาด ${width}x${height} ซม. (XL)`, sourceType: 'DIMENSIONS' };
    }
    if (maxDim > 10) {
      return { durationMinutes: 240, sourceText: `อ้างอิงขนาด ${width}x${height} ซม. (L)`, sourceType: 'DIMENSIONS' };
    }
    if (maxDim > 5) {
      return { durationMinutes: 120, sourceText: `อ้างอิงขนาด ${width}x${height} ซม. (M)`, sourceType: 'DIMENSIONS' };
    }
    return { durationMinutes: 60, sourceText: `อ้างอิงขนาด ${width}x${height} ซม. (S)`, sourceType: 'DIMENSIONS' };
  }

  return {
    durationMinutes: null,
    sourceText: 'ไม่พบข้อมูลระยะเวลาจากระบบ',
    sourceType: 'NONE',
  };
}

/**
 * Calculates local end time string (HH:MM) and ISO timestamp (+07:00) with overnight rollover handling.
 */
export function calculateEndTimeAndIso(
  sessionDateStr: string,
  startTimeStr: string,
  durationMinutes: number
): { endTimeStr: string; endAtIso: string; isCrossDay: boolean } {
  if (!startTimeStr || durationMinutes <= 0) {
    return { endTimeStr: '--:--', endAtIso: '', isCrossDay: false };
  }

  const [startH, startM] = startTimeStr.split(':').map(Number);
  if (isNaN(startH) || isNaN(startM)) {
    return { endTimeStr: '--:--', endAtIso: '', isCrossDay: false };
  }

  const totalMins = startH * 60 + startM + durationMinutes;
  const daysToAdd = Math.floor(totalMins / 1440);
  const endMinsInDay = totalMins % 1440;

  const endH = Math.floor(endMinsInDay / 60);
  const endM = endMinsInDay % 60;

  const endHStr = String(endH).padStart(2, '0');
  const endMStr = String(endM).padStart(2, '0');
  const endTimeStr = `${endHStr}:${endMStr}`;

  const [yr, mo, dy] = sessionDateStr.split('-').map(Number);
  const targetDate = new Date(Date.UTC(yr, mo - 1, dy + daysToAdd));
  const endYr = targetDate.getUTCFullYear();
  const endMo = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const endDy = String(targetDate.getUTCDate()).padStart(2, '0');
  const endDateStr = `${endYr}-${endMo}-${endDy}`;

  const endAtIso = `${endDateStr}T${endTimeStr}:00+07:00`;
  return { endTimeStr, endAtIso, isCrossDay: daysToAdd > 0 };
}

export default function CreateSessionDialog({
  booking,
  blockedDates = [],
  existingSessionCount,
  onSuccess,
  onCancel,
}: CreateSessionDialogProps) {
  const [sessionDate, setSessionDate] = useState<string>(
    booking.requested_date || toBangkokDateString(new Date())
  );
  const [startTime, setStartTime] = useState<string>('13:00');
  const [sessionNote, setSessionNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resolve authoritative duration from booking context
  const durationInfo = useMemo(() => resolveBookingDuration(booking), [booking]);

  // Compute end time dynamically for DB insertion & collision checking
  const computedTiming = useMemo(() => {
    if (!durationInfo.durationMinutes) {
      return { endTimeStr: '--:--', endAtIso: '', isCrossDay: false };
    }
    return calculateEndTimeAndIso(sessionDate, startTime, durationInfo.durationMinutes);
  }, [sessionDate, startTime, durationInfo.durationMinutes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!sessionDate || !startTime) {
      setErrorMessage('กรุณาระบุวันที่ และเวลาเริ่มให้ครบถ้วน');
      return;
    }

    if (!durationInfo.durationMinutes || !computedTiming.endTimeStr || computedTiming.endTimeStr === '--:--') {
      setErrorMessage('ไม่สามารถคำนวณเวลาสิ้นสุดรอบสักได้ กรุณาตรวจสอบเวลาเริ่มและข้อมูลระยะเวลา');
      return;
    }

    if (!booking.artist_id) {
      setErrorMessage('คิวงานนี้ยังไม่ได้รับการมอบหมายช่างสัก ไม่สามารถสร้างรอบสักได้');
      return;
    }

    const availCheck = checkDateAvailability(
      sessionDate,
      booking.artist_id,
      blockedDates,
      booking.artist_nickname || booking.artist_name
    );

    if (availCheck.isBlocked) {
      setErrorMessage(availCheck.errorMessage || 'ไม่สามารถเลือกวันที่นี้ได้ ร้านหรือช่างปิดรับคิวในวันที่เลือก');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('add_booking_session', {
        p_booking_id: booking.id,
        p_session_date: sessionDate,
        p_start_time: startTime,
        p_end_time: computedTiming.endTimeStr,
        p_note: sessionNote.trim() || null,
      });

      if (error) {
        if (
          error.code === '23P01' ||
          error.message?.includes('overlap') ||
          error.message?.includes('exclusion') ||
          error.message?.includes('booking_sessions_artist_no_overlap') ||
          error.message?.includes('ช่างมีคิวในวันที่เลือกแล้ว')
        ) {
          throw new Error(error.message || 'ช่วงเวลานี้ช่างมีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น');
        }
        throw error;
      }

      if (data && data.success === false) {
        throw new Error(data.message || 'ไม่สามารถสร้างรอบสักได้');
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error creating session:', err);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการสร้างรอบสัก');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 font-prompt animate-fadeIn">
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#4A443A] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-emerald-400">
              <Calendar size={16} />
            </div>
            <div>
              <h3 className="text-sm font-heading font-semibold text-[#ECE4D3]">
                เพิ่มรอบการสัก (รอบที่ {existingSessionCount + 1})
              </h3>
              <p className="text-[11px] text-[#A89F91]">
                ช่าง: {booking.artist_name} • คิว #{booking.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-[#7A7265] hover:text-[#ECE4D3] p-1 rounded cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg text-xs text-red-400 flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {durationInfo.sourceType === 'NONE' && (
          <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">ไม่พบข้อมูลระยะเวลาจากระบบ</p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                ไม่สามารถคำนวณเวลาเพื่อกันคิวได้ เนื่องจากคิวงานนี้ไม่มีข้อมูลระยะเวลาประเมิน ขนาดงาน หรือรอบสักก่อนหน้า
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              วันที่นัดหมายรอบสัก <span className="text-[#9C2F2F]">*</span>
            </label>
            <input
              id="input-session-date"
              type="date"
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
            />
          </div>

          {/* Appointment Time */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              เวลานัด <span className="text-[#9C2F2F]">*</span>
            </label>
            <input
              id="input-session-start"
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400 font-mono"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              หมายเหตุรอบสัก (ถ้ามี)
            </label>
            <textarea
              id="input-session-note"
              rows={2}
              value={sessionNote}
              onChange={(e) => setSessionNote(e.target.value)}
              placeholder={existingSessionCount > 0 ? `เช่น รอบที่ ${existingSessionCount + 1} ลงสีและเก็บรายละเอียด...` : 'เช่น เดินเส้นและลงโครงสร้างหลัก...'}
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg p-2.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/50">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#A89F91] hover:text-[#ECE4D3] rounded-md transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              id="btn-confirm-create-session"
              type="submit"
              disabled={isSubmitting || !durationInfo.durationMinutes}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-xs font-semibold text-white rounded-md transition-colors flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Plus size={13} />
              <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกรอบสัก'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
