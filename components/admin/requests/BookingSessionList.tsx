'use client';

import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  PlayCircle,
  CheckCircle2,
  Plus,
  AlertCircle,
  Check,
} from 'lucide-react';
import { BookingItem, BookingSessionItem, formatDateTimeBangkok, formatTimeBangkok } from './types';
import CreateSessionDialog from './CreateSessionDialog';
import { createClient } from '@/lib/supabase/client';

interface BookingSessionListProps {
  booking: BookingItem;
  onRefresh: () => void;
}

export default function BookingSessionList({
  booking,
  onRefresh,
}: BookingSessionListProps) {
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const canCreateSession = booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS';

  const handleStartSession = async (session: BookingSessionItem) => {
    setSessionError(null);

    // Section 23: Block starting session if booking is WAITING_DEPOSIT
    if (booking.status === 'WAITING_DEPOSIT') {
      setSessionError('ยังไม่สามารถเริ่มงานได้ เนื่องจากคิวรอการชำระมัดจำ');
      return;
    }

    setUpdatingSessionId(session.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('booking_sessions')
        .update({ status: 'IN_PROGRESS' })
        .eq('id', session.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error starting session:', err);
      setSessionError(err.message || 'เกิดข้อผิดพลาดในการเริ่มรอบสัก');
    } finally {
      setUpdatingSessionId(null);
    }
  };

  const handleCompleteSession = async (session: BookingSessionItem) => {
    setSessionError(null);
    setUpdatingSessionId(session.id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('booking_sessions')
        .update({ status: 'COMPLETED' })
        .eq('id', session.id);

      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      console.error('Error completing session:', err);
      setSessionError(err.message || 'เกิดข้อผิดพลาดในการจบรอบสัก');
    } finally {
      setUpdatingSessionId(null);
    }
  };

  const getSessionBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            นัดหมายแล้ว
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="bg-purple-950/60 text-purple-400 border border-purple-800/60 px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            กำลังสัก
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            เสร็จสิ้นรอบนี้
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold">
            ยกเลิกแล้ว
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-xl p-3.5 sm:p-4 space-y-3 font-prompt">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#4A443A]/50 pb-2.5">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[#ECE4D3]" />
          <span className="text-xs font-semibold text-[#ECE4D3]">
            รอบนัดหมายการสัก ({booking.sessions?.length || 0} รอบ)
          </span>
        </div>

        {canCreateSession && (
          <button
            id="btn-open-create-session"
            type="button"
            onClick={() => setIsCreatingSession(true)}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 shadow"
          >
            <Plus size={12} />
            <span>เพิ่มรอบสัก</span>
          </button>
        )}
      </div>

      {sessionError && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-900/60 rounded-lg text-xs text-amber-400 flex items-start gap-1.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{sessionError}</span>
        </div>
      )}

      {/* Sessions List */}
      {!booking.sessions || booking.sessions.length === 0 ? (
        <div className="py-5 text-center text-xs text-[#7A7265] border border-dashed border-[#4A443A]/50 rounded-lg bg-[#171512]/40">
          {canCreateSession
            ? 'ยังไม่มีรอบนัดหมาย กดปุ่ม "+ เพิ่มรอบสัก" เพื่อกำหนดวันและเวลาทำงาน'
            : 'ยังไม่มีรอบนัดหมาย (สามารถเพิ่มรอบสักได้เมื่อคิวได้รับการยืนยันแล้ว)'}
        </div>
      ) : (
        <div className="space-y-2">
          {booking.sessions.map((ses) => (
            <div
              key={ses.id}
              className="bg-[#171512] border border-[#4A443A]/60 rounded-lg p-3 space-y-2 hover:border-[#7A7265] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#ECE4D3]">
                    รอบที่ {ses.session_number}
                  </span>
                  {getSessionBadge(ses.status)}
                </div>

                {/* Session Actions (Section 23 & 24) */}
                <div className="flex items-center gap-1.5">
                  {ses.status === 'SCHEDULED' && (
                    <button
                      id={`btn-start-session-${ses.session_number}`}
                      type="button"
                      disabled={updatingSessionId === ses.id}
                      onClick={() => handleStartSession(ses)}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-medium rounded transition-colors flex items-center gap-1"
                    >
                      <PlayCircle size={11} />
                      <span>{updatingSessionId === ses.id ? 'กำลังเริ่ม...' : 'เริ่มงาน'}</span>
                    </button>
                  )}

                  {ses.status === 'IN_PROGRESS' && (
                    <button
                      id={`btn-complete-session-${ses.session_number}`}
                      type="button"
                      disabled={updatingSessionId === ses.id}
                      onClick={() => handleCompleteSession(ses)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium rounded transition-colors flex items-center gap-1"
                    >
                      <Check size={11} />
                      <span>{updatingSessionId === ses.id ? 'กำลังบันทึก...' : 'จบรอบสัก'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#A89F91]">
                <div>
                  <span className="text-[#7A7265] block">วัน-เวลา:</span>
                  <span className="font-medium text-[#ECE4D3]">
                    {formatDateTimeBangkok(ses.start_at)} - {formatTimeBangkok(ses.end_at)} น.
                  </span>
                </div>
                {ses.note && (
                  <div>
                    <span className="text-[#7A7265] block">หมายเหตุ:</span>
                    <span className="text-[#ECE4D3] truncate block">{ses.note}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog for Creating Session */}
      {isCreatingSession && (
        <CreateSessionDialog
          booking={booking}
          existingSessionCount={booking.sessions?.length || 0}
          onSuccess={() => {
            setIsCreatingSession(false);
            onRefresh();
          }}
          onCancel={() => setIsCreatingSession(false)}
        />
      )}
    </div>
  );
}
