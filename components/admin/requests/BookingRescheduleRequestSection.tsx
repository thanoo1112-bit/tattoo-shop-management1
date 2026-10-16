'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BlockedDateRecord, checkDateAvailability } from '@/lib/availabilityUtils';
import { getTattooDurationInfo, STUDIO_OPERATING_HOURS } from '@/lib/utils/tattooDuration';
import {
  RescheduleRequest,
  RESCHEDULE_REQUESTS_PROTOTYPE_MODE,
  getPendingRescheduleRequest,
  isRescheduleRequestUiEnabled,
  reviewRescheduleRequest,
  subscribeRescheduleRequests,
} from '@/lib/reschedule/rescheduleRequestStore';
import { BookingItem, formatDateBangkok, formatDateTimeBangkok } from './types';

function hhmmToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

interface Props {
  booking: BookingItem;
  customerName: string;
  artistDisplay: string;
  blockedDates: BlockedDateRecord[];
  reviewerId?: string | null;
  onApproved: (message: string) => void;
  onRejected?: (message: string) => void;
}

export default function BookingRescheduleRequestSection({
  booking,
  customerName,
  artistDisplay,
  blockedDates,
  reviewerId,
  onApproved,
  onRejected,
}: Props) {
  const bookingId = booking?.id || '';
  const [request, setRequest] = useState<RescheduleRequest | null>(() =>
    bookingId ? getPendingRescheduleRequest(bookingId) : null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  const syncFromStore = useCallback(() => {
    if (!bookingId) {
      setRequest(null);
      return;
    }
    const next = getPendingRescheduleRequest(bookingId);
    setRequest(next);
  }, [bookingId]);

  useEffect(() => {
    syncFromStore();
    return subscribeRescheduleRequests(syncFromStore);
  }, [syncFromStore]);

  if (!isRescheduleRequestUiEnabled() || !request || request.status !== 'PENDING') return null;

  const availableSessions = (booking.sessions || []).filter((s) => s.status !== 'CANCELLED');
  const targetSession = availableSessions.find((s) => s.status === 'SCHEDULED') || availableSessions[0] || null;

  const computeRequestedEndTime = (req: RescheduleRequest): string => {
    if (req.requested_end_time && req.requested_end_time.length >= 5) {
      return req.requested_end_time.slice(0, 5);
    }
    let durationMins = 0;
    if (targetSession?.start_at && targetSession?.end_at) {
      const diff = (new Date(targetSession.end_at).getTime() - new Date(targetSession.start_at).getTime()) / 60000;
      if (diff > 0) durationMins = diff;
    }
    if (!durationMins) {
      const info = getTattooDurationInfo(
        booking.estimated_size_tier || booking.size_label,
        booking.width_cm,
        booking.height_cm,
        booking.description || booking.customer_note
      );
      durationMins = info.blockingMinutes;
    }
    const endMins = Math.min(STUDIO_OPERATING_HOURS.CLOSE_MINUTES, hhmmToMins(req.requested_start_time) + durationMins);
    return minsToHHMM(endMins);
  };

  const handleApprove = async () => {
    if (!request || request.status !== 'PENDING') return;
    setErrorMsg(null);

    if (!booking.artist_id) {
      setErrorMsg('ไม่พบข้อมูลช่างผู้รับผิดชอบสำหรับตรวจสอบตารางว่าง');
      return;
    }

    setIsProcessing(true);
    try {
      const supabase = createClient();

      // 1. Re-verify Studio & Artist blocked dates (fetch live if prop is empty)
      let effectiveBlockedDates: BlockedDateRecord[] = blockedDates;
      if (!effectiveBlockedDates || effectiveBlockedDates.length === 0) {
        const { data: liveBlocks } = await supabase
          .from('artist_blocked_dates')
          .select('id, scope, artist_id, blocked_date, reason');
        if (Array.isArray(liveBlocks)) {
          effectiveBlockedDates = liveBlocks as BlockedDateRecord[];
        }
      }

      const availCheck = checkDateAvailability(
        request.requested_date,
        booking.artist_id,
        effectiveBlockedDates || [],
        artistDisplay
      );
      if (availCheck.isBlocked) {
        setErrorMsg(availCheck.errorMessage || 'ไม่สามารถอนุมัติได้ เนื่องจากร้านหรือช่างปิดรับคิวในวันที่ลูกค้าขอเลื่อน');
        setIsProcessing(false);
        return;
      }

      const newDate = request.requested_date;
      const newStart = request.requested_start_time.slice(0, 5);
      const newEnd = computeRequestedEndTime(request);

      const dayStartIso = `${newDate}T00:00:00+07:00`;
      const dayEndIso = `${newDate}T23:59:59+07:00`;
      const newStartIso = `${newDate}T${newStart}:00+07:00`;
      const newEndIso = `${newDate}T${newEnd}:00+07:00`;
      const newStartMs = new Date(newStartIso).getTime();
      const newEndMs = new Date(newEndIso).getTime();

      // 2. Re-verify artist daily capacity & strict time overlap on newDate (excluding this booking/session)
      const [{ data: dateBookings }, { data: dateSessions }] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, status, requested_date, requested_start_time')
          .eq('artist_id', booking.artist_id)
          .eq('requested_date', newDate)
          .in('status', ['WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS']),
        supabase
          .from('booking_sessions')
          .select('id, booking_id, status, start_at, end_at')
          .eq('artist_id', booking.artist_id)
          .gte('start_at', dayStartIso)
          .lte('start_at', dayEndIso)
          .in('status', ['SCHEDULED', 'IN_PROGRESS']),
      ]);

      const otherBookingIds = new Set<string>();
      (dateBookings || []).forEach((b: any) => {
        if (b.id && b.id !== booking.id) otherBookingIds.add(b.id);
      });
      (dateSessions || []).forEach((s: any) => {
        if (s.booking_id && s.booking_id !== booking.id) otherBookingIds.add(s.booking_id);
      });

      if (otherBookingIds.size >= 3) {
        setErrorMsg('ไม่สามารถอนุมัติได้: ช่างรับงานครบ 3 คิวในวันที่ลูกค้าขอเลื่อนแล้ว (เต็มโควตารายวัน)');
        setIsProcessing(false);
        return;
      }

      // Check time overlap against other active sessions on newDate (excluding targetSession being moved)
      for (const ses of dateSessions || []) {
        if (targetSession && ses.id === targetSession.id) continue;
        if (ses.booking_id === booking.id) continue;
        if (!ses.start_at || !ses.end_at) continue;
        const existStartMs = new Date(ses.start_at).getTime();
        const existEndMs = new Date(ses.end_at).getTime();
        if (newStartMs < existEndMs && newEndMs > existStartMs) {
          const conflictStart = new Date(ses.start_at).toLocaleTimeString('th-TH', {
            timeZone: 'Asia/Bangkok',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          setErrorMsg(`ไม่สามารถอนุมัติได้: เวลา ${conflictStart} น. ในวันที่ ${formatDateBangkok(newDate)} มีคิวอื่นทับซ้อนแล้ว`);
          setIsProcessing(false);
          return;
        }
      }

      // 3. Apply reschedule using SECURITY DEFINER RPCs (works identically for both Artist and Admin)
      //    with direct table update fallback
      const reschedNote = targetSession?.note
        ? targetSession.note
        : `เลื่อนนัดตามคำขอลูกค้า: ${request.reason}`;

      let sessionUpdated = false;
      let bookingUpdated = false;

      if (targetSession && targetSession.status === 'SCHEDULED') {
        const { error: rpcSessionErr } = await supabase.rpc('artist_reschedule_session_item', {
          p_session_id: targetSession.id,
          p_new_date: newDate,
          p_new_start_time: newStart,
          p_new_end_time: newEnd,
          p_note: reschedNote,
        });
        if (!rpcSessionErr) {
          sessionUpdated = true;
          bookingUpdated = true;
        }
      }

      if (!sessionUpdated || !bookingUpdated) {
        const { error: rpcBookingErr } = await supabase.rpc('artist_reschedule_booking', {
          p_booking_id: booking.id,
          p_session_id: targetSession?.id ?? null,
          p_new_date: newDate,
          p_new_start_time: newStart,
          p_new_end_time: newEnd,
          p_note: reschedNote,
        });
        if (!rpcBookingErr) {
          if (targetSession) sessionUpdated = true;
          bookingUpdated = true;
        }
      }

      // Direct table fallback (for Admin or non-SCHEDULED session states)
      if (targetSession && !sessionUpdated) {
        const { error: updateErr } = await supabase
          .from('booking_sessions')
          .update({
            start_at: newStartIso,
            end_at: newEndIso,
            note: reschedNote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetSession.id);
        if (updateErr) throw updateErr;
      }

      if (!bookingUpdated) {
        await supabase
          .from('bookings')
          .update({
            requested_date: newDate,
            requested_start_time: newStart,
          })
          .eq('id', booking.id);
      }

      reviewRescheduleRequest(request.id, 'APPROVED', {
        reviewed_by: reviewerId ?? null,
      });
      syncFromStore();

      onApproved('อนุมัติคำขอเลื่อนนัดแล้ว');
    } catch (err: any) {
      console.error('[RescheduleRequest] Error approving reschedule:', err);
      setErrorMsg(err?.message || 'เกิดข้อผิดพลาดในการอนุมัติคำขอเลื่อนนัด');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!request || request.status !== 'PENDING') return;
    setErrorMsg(null);
    reviewRescheduleRequest(request.id, 'REJECTED', {
      reviewed_by: reviewerId ?? null,
      review_note: rejectNote.trim() || null,
    });
    syncFromStore();
    setShowRejectBox(false);
    setRejectNote('');
    if (onRejected) {
      onRejected('ปฏิเสธคำขอเลื่อนนัดแล้ว (คงวันและเวลาเดิม)');
    }
  };

  const statusBadge = (
    <span className="bg-amber-500/15 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1">
      <Clock size={11} className="animate-pulse" />
      รอพิจารณา
    </span>
  );

  return (
    <div className="bg-studio-card border border-amber-500/40 rounded-xl p-4 space-y-3 font-prompt">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 text-[#ECE4D3] text-[11px] uppercase tracking-wider font-semibold">
          <CalendarClock size={14} className="text-amber-400" />
          <span>คำขอเลื่อนวันนัด</span>
        </div>
        {statusBadge}
      </div>

      {RESCHEDULE_REQUESTS_PROTOTYPE_MODE && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-2.5 py-1.5 text-[10px] text-amber-200/90">
          โหมดต้นแบบ (Prototype): ข้อมูลคำขอเลื่อนนัดนี้อ่านจากเบราว์เซอร์ปัจจุบัน (localStorage)
        </div>
      )}

      <div className="bg-studio-sec/80 border border-studio-border rounded-lg p-3 space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-[#B8B0A3]">ลูกค้า:</span>
          <span className="text-studio-primary font-semibold text-right">
            {request.customer_name || customerName}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[#B8B0A3]">วัน/เวลาเดิม:</span>
          <span className="text-[#ECE4D3] font-medium text-right">
            {formatDateBangkok(request.original_date)} · {request.original_start_time} น.
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-[#B8B0A3]">วัน/เวลาใหม่ที่ลูกค้าขอ:</span>
          <span className="text-amber-300 font-bold text-right">
            {formatDateBangkok(request.requested_date)} · {request.requested_start_time} น.
          </span>
        </div>
        <div className="pt-1 border-t border-studio-border/50 space-y-1">
          <span className="text-[#B8B0A3] block text-[11px]">เหตุผล:</span>
          <p className="text-[#ECE4D3] bg-studio-card/70 px-2.5 py-1.5 rounded border border-studio-border/50 whitespace-pre-wrap">
            {request.reason}
          </p>
        </div>
        <div className="flex justify-between gap-3 pt-1 text-[11px]">
          <span className="text-[#B8B0A3]">วันที่ส่งคำขอ:</span>
          <span className="text-[#ECE4D3] font-mono">{formatDateTimeBangkok(request.created_at)}</span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 bg-red-950/50 border border-red-800/70 rounded-lg text-xs text-red-300 flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {request.status === 'PENDING' && (
        <div className="space-y-2 pt-1">
          {!showRejectBox ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleApprove}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{isProcessing ? 'กำลังตรวจสอบ...' : 'อนุมัติการเลื่อนนัด'}</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  setErrorMsg(null);
                  setShowRejectBox(true);
                }}
                className="py-2.5 px-3 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/60 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <XCircle size={14} className="shrink-0" />
                <span>ปฏิเสธคำขอ</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleReject} className="pt-2 border-t border-studio-border/50 space-y-2">
              <span className="text-[11px] text-red-300 font-semibold block">
                ระบุหมายเหตุการปฏิเสธคำขอเลื่อนนัด (ถ้ามี)
              </span>
              <input
                type="text"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="เช่น ช่างติดคิวอื่นในเวลาดังกล่าว กรุณาเลือกวันอื่น..."
                className="w-full bg-studio-sec border border-studio-border rounded-lg px-2.5 py-1.5 text-xs text-studio-primary focus:outline-none focus:border-red-400"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectBox(false);
                    setRejectNote('');
                  }}
                  className="px-3 py-1.5 text-xs text-[#B8B0A3] hover:text-studio-primary cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-xs text-white rounded-lg font-semibold cursor-pointer"
                >
                  ยืนยันปฏิเสธคำขอ
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
