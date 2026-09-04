'use client';

import React, { useState } from 'react';
import { Calendar, Clock, Plus, X, AlertCircle } from 'lucide-react';
import { BookingItem, toBangkokDateString } from './types';
import { createClient } from '@/lib/supabase/client';

interface CreateSessionDialogProps {
  booking: BookingItem;
  existingSessionCount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CreateSessionDialog({
  booking,
  existingSessionCount,
  onSuccess,
  onCancel,
}: CreateSessionDialogProps) {
  const [sessionDate, setSessionDate] = useState<string>(
    booking.requested_date || toBangkokDateString(new Date())
  );
  const [startTime, setStartTime] = useState<string>('13:00');
  const [endTime, setEndTime] = useState<string>('16:00');
  const [sessionNote, setSessionNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!sessionDate || !startTime || !endTime) {
      setErrorMessage('กรุณาระบุวันที่ เวลาเริ่ม และเวลาสิ้นสุดให้ครบถ้วน');
      return;
    }

    if (startTime >= endTime) {
      setErrorMessage('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มรอบสัก');
      return;
    }

    if (!booking.artist_id) {
      setErrorMessage('คิวงานนี้ยังไม่ได้รับการมอบหมายช่างสัก ไม่สามารถสร้างรอบสักได้');
      return;
    }

    // Convert local Asia/Bangkok time into standard ISO string with +07:00 timezone offset
    // e.g. "2026-12-05T13:00:00+07:00"
    const startAtIso = `${sessionDate}T${startTime}:00+07:00`;
    const endAtIso = `${sessionDate}T${endTime}:00+07:00`;

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('booking_sessions').insert({
        booking_id: booking.id,
        artist_id: booking.artist_id,
        session_number: existingSessionCount + 1,
        start_at: startAtIso,
        end_at: endAtIso,
        status: 'SCHEDULED',
        note: sessionNote.trim() || null,
      });

      if (error) {
        // Section 21: Map GiST double booking exclusion error
        if (
          error.code === '23P01' ||
          error.message?.includes('overlap') ||
          error.message?.includes('exclusion') ||
          error.message?.includes('booking_sessions_artist_no_overlap')
        ) {
          throw new Error('ช่วงเวลานี้ช่างมีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น');
        }
        throw error;
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
            className="text-[#7A7265] hover:text-[#ECE4D3] p-1 rounded"
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

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                เวลาเริ่ม <span className="text-[#9C2F2F]">*</span>
              </label>
              <input
                id="input-session-start"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                เวลาสิ้นสุด <span className="text-[#9C2F2F]">*</span>
              </label>
              <input
                id="input-session-end"
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400"
              />
            </div>
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
              placeholder="เช่น รอบที่ 1 เดินเส้นและลงโครงสร้างหลัก..."
              className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg p-2.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-emerald-400 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/50">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] text-xs text-[#A89F91] hover:text-[#ECE4D3] rounded-md transition-colors"
            >
              ยกเลิก
            </button>
            <button
              id="btn-confirm-create-session"
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white rounded-md transition-colors flex items-center gap-1.5 shadow"
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
