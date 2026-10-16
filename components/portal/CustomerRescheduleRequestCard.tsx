'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Calendar, Clock, User, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import DatePickerPopover from '@/components/booking/DatePickerPopover';
import { BusyRange, getArtistDailyCapacityStatus } from '@/components/booking/BookingCalendar';
import DualTimePicker from '@/components/estimate/DualTimePicker';
import { getThailandTodayStr, formatThaiDate } from '@/components/portal/portalUtils';
import { getTattooDurationInfo, isStartTimeAllowedForSize, STUDIO_OPERATING_HOURS } from '@/lib/utils/tattooDuration';
import {
  RescheduleRequest,
  RESCHEDULE_REQUESTS_PROTOTYPE_MODE,
  createRescheduleRequest,
  getLatestRescheduleRequest,
  getPendingRescheduleRequest,
  isRescheduleRequestUiEnabled,
  subscribeRescheduleRequests,
} from '@/lib/reschedule/rescheduleRequestStore';
import type { CustomerPortalBooking } from './types';

const BKK = 'Asia/Bangkok';

function bkkDateStr(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BKK, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function bkkTimeStr(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: BKK, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

function hhmmToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Convert busy ranges returned by get_artist_busy_ranges into [startMins,endMins] for one Bangkok date. */
function rangesToIntervals(ranges: BusyRange[], dateStr: string): { startMins: number; endMins: number }[] {
  const out: { startMins: number; endMins: number }[] = [];
  for (const r of ranges) {
    try {
      if (bkkDateStr(r.start_at) !== dateStr) continue;
      out.push({ startMins: hhmmToMins(bkkTimeStr(r.start_at)), endMins: hhmmToMins(bkkTimeStr(r.end_at)) });
    } catch (_) {}
  }
  return out;
}

interface CurrentAppointment {
  date: string;
  start: string;
  end: string;
  durationMins: number;
  ownStartMs: number[];
}

function resolveCurrentAppointment(
  booking: CustomerPortalBooking,
  approvedReq?: RescheduleRequest | null
): CurrentAppointment | null {
  const sessions = (booking.sessions || []).filter((s) => s.status !== 'CANCELLED');
  const active = sessions.find((s) => s.status === 'SCHEDULED') || sessions[0];
  const info = getTattooDurationInfo(null, booking.width_cm, booking.height_cm, booking.customer_note);
  const ownStartMs = sessions.map((s) => new Date(s.start_at).getTime()).filter((n) => !isNaN(n));

  if (approvedReq && approvedReq.status === 'APPROVED' && approvedReq.requested_date && approvedReq.requested_start_time) {
    const start = approvedReq.requested_start_time.slice(0, 5);
    let durationMins = info.blockingMinutes;
    if (active?.start_at && active?.end_at) {
      const diff = (new Date(active.end_at).getTime() - new Date(active.start_at).getTime()) / 60000;
      if (diff > 0) durationMins = diff;
    }
    const end =
      approvedReq.requested_end_time && approvedReq.requested_end_time.length >= 5
        ? approvedReq.requested_end_time.slice(0, 5)
        : minsToHHMM(Math.min(STUDIO_OPERATING_HOURS.CLOSE_MINUTES, hhmmToMins(start) + durationMins));
    ownStartMs.push(new Date(`${approvedReq.requested_date}T${start}:00+07:00`).getTime());
    return { date: approvedReq.requested_date, start, end, durationMins, ownStartMs };
  }

  if (active?.start_at) {
    const start = bkkTimeStr(active.start_at);
    const diff = active.end_at ? (new Date(active.end_at).getTime() - new Date(active.start_at).getTime()) / 60000 : 0;
    const durationMins = diff > 0 ? diff : info.blockingMinutes;
    const end = active.end_at ? bkkTimeStr(active.end_at) : minsToHHMM(Math.min(STUDIO_OPERATING_HOURS.CLOSE_MINUTES, hhmmToMins(start) + durationMins));
    return { date: bkkDateStr(active.start_at), start, end, durationMins, ownStartMs };
  }

  if (booking.requested_date && booking.requested_start_time) {
    const start = booking.requested_start_time.slice(0, 5);
    const durationMins = info.blockingMinutes;
    const end = minsToHHMM(Math.min(STUDIO_OPERATING_HOURS.CLOSE_MINUTES, hhmmToMins(start) + durationMins));
    ownStartMs.push(new Date(`${booking.requested_date}T${start}:00+07:00`).getTime());
    return { date: booking.requested_date, start, end, durationMins, ownStartMs };
  }
  return null;
}

interface Props {
  booking: CustomerPortalBooking | null | undefined;
  artistName: string;
  /** Only true when the booking is confirmed (CONFIRMED) — not in progress / completed / cancelled / expired / rejected. */
  isConfirmed: boolean;
  onRefresh?: () => void;
}

export default function CustomerRescheduleRequestCard({ booking, artistName, isConfirmed, onRefresh }: Props) {
  const { user, customerName } = useApp();
  const [open, setOpen] = useState(false);
  const bookingId = booking?.id || '';
  const [pending, setPending] = useState<RescheduleRequest | null>(() =>
    bookingId ? getPendingRescheduleRequest(bookingId) : null
  );
  const [latest, setLatest] = useState<RescheduleRequest | null>(() =>
    bookingId ? getLatestRescheduleRequest(bookingId) : null
  );
  const lastRefreshedApprovalKeyRef = React.useRef<string | null>(null);

  const syncFromStore = useCallback(() => {
    if (!bookingId) {
      setPending(null);
      setLatest(null);
      return;
    }
    const nextPending = getPendingRescheduleRequest(bookingId);
    const nextLatest = getLatestRescheduleRequest(bookingId);
    setPending(nextPending);
    setLatest(nextLatest);
  }, [bookingId]);

  useEffect(() => {
    syncFromStore();
    return subscribeRescheduleRequests(syncFromStore);
  }, [syncFromStore]);

  const activeRequest = pending || latest;

  // When a reschedule request becomes APPROVED, refresh parent booking data once per approval
  useEffect(() => {
    if (!activeRequest || activeRequest.status !== 'APPROVED') return;
    const approvalKey = `${activeRequest.id}_${activeRequest.reviewed_at || 'approved'}`;
    if (lastRefreshedApprovalKeyRef.current !== approvalKey) {
      lastRefreshedApprovalKeyRef.current = approvalKey;
      if (onRefresh) onRefresh();
    }
  }, [activeRequest, onRefresh]);

  const current = useMemo(
    () => (booking ? resolveCurrentAppointment(booking, activeRequest?.status === 'APPROVED' ? activeRequest : null) : null),
    [booking, activeRequest]
  );

  if (!isRescheduleRequestUiEnabled() || !booking || !isConfirmed || !booking.artist_id || !current) return null;

  return (
    <>
      <div className="bg-[#171512] border border-[#4A443A] p-3.5 rounded-[6px] space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-[#ECE4D3]">
          <CalendarClock size={14} className="text-studio-red" />
          <span>ต้องการเลื่อนวันนัด?</span>
        </div>
        <p className="text-[11px] text-[#E2DDD4] leading-relaxed font-light">
          หากไม่สะดวกตามวันและเวลาปัจจุบัน สามารถส่งคำขอเลื่อนนัดให้ช่างสักหรือร้านพิจารณาได้
        </p>

        {activeRequest && activeRequest.status === 'PENDING' ? (
          <div className="bg-amber-950/30 border border-amber-800/50 rounded-[6px] p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Clock size={14} className="text-amber-400 animate-pulse" />
              <span>รอพิจารณาเลื่อนนัด</span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-3">
                <span className="text-[#B8B0A3]">วัน/เวลาเดิม</span>
                <span className="text-[#ECE4D3] font-semibold text-right">
                  {formatThaiDate(activeRequest.original_date)} · {activeRequest.original_start_time} น.
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[#B8B0A3]">วัน/เวลาใหม่ที่ขอ</span>
                <span className="text-amber-300 font-semibold text-right">
                  {formatThaiDate(activeRequest.requested_date)} · {activeRequest.requested_start_time} น.
                </span>
              </div>
              <div>
                <span className="text-[#B8B0A3] block">เหตุผล</span>
                <p className="text-[#E2DDD4] whitespace-pre-wrap mt-0.5">{activeRequest.reason}</p>
              </div>
            </div>
            <p className="text-[11px] text-amber-200/90 font-light">ระหว่างรอการพิจารณา วันนัดเดิมยังคงมีผลอยู่</p>
            <button
              type="button"
              disabled
              className="w-full bg-[#1F1D1A] border border-[#4A443A] text-[#8C8479] py-2.5 rounded-[4px] text-xs font-semibold cursor-not-allowed"
            >
              ส่งคำขอเลื่อนแล้ว
            </button>
          </div>
        ) : (
          <>
            {activeRequest && activeRequest.status === 'REJECTED' && (
              <div className="bg-red-950/25 border border-red-900/50 rounded-[6px] p-3 space-y-2 text-[11px]">
                <div className="flex items-center gap-2 text-xs font-bold text-red-400">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>คำขอเลื่อนนัดถูกปฏิเสธ</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="text-[#B8B0A3]">วัน/เวลาเดิม</span>
                    <span className="text-[#ECE4D3] font-semibold text-right">
                      {formatThaiDate(activeRequest.original_date)} · {activeRequest.original_start_time} น.
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-[#B8B0A3]">วัน/เวลาใหม่ที่เคยขอ</span>
                    <span className="text-red-300 font-semibold text-right">
                      {formatThaiDate(activeRequest.requested_date)} · {activeRequest.requested_start_time} น.
                    </span>
                  </div>
                  <div>
                    <span className="text-[#B8B0A3] block">เหตุผลที่ลูกค้าขอ</span>
                    <p className="text-[#E2DDD4] whitespace-pre-wrap mt-0.5">{activeRequest.reason}</p>
                  </div>
                  {activeRequest.review_note && (
                    <div className="pt-1 border-t border-red-900/30">
                      <span className="text-[#B8B0A3] block">หมายเหตุจากช่าง/ร้าน</span>
                      <p className="text-red-200 whitespace-pre-wrap mt-0.5">{activeRequest.review_note}</p>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[#ECE4D3] font-medium pt-0.5">
                  วันและเวลานัดเดิมยังคงมีผลอยู่
                </p>
              </div>
            )}

            {activeRequest && activeRequest.status === 'APPROVED' && (
              <div className="bg-emerald-950/25 border border-emerald-800/50 rounded-[6px] p-3 space-y-2 text-[11px]">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>อนุมัติการเลื่อนนัดแล้ว</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="text-[#B8B0A3]">วัน/เวลานัดปัจจุบัน (ใหม่)</span>
                    <span className="text-emerald-300 font-bold text-right">
                      {formatThaiDate(activeRequest.requested_date)} · {activeRequest.requested_start_time} น.
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-[#B8B0A3]">วัน/เวลาเดิมก่อนเลื่อน</span>
                    <span className="text-[#8C8479] text-right">
                      {formatThaiDate(activeRequest.original_date)} · {activeRequest.original_start_time} น.
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full bg-studio-red hover:bg-studio-red/80 border border-studio-red text-white py-2.5 rounded-[4px] text-xs font-bold tracking-wider transition-colors"
            >
              ขอเลื่อนวันนัด
            </button>
          </>
        )}
      </div>

      {open && (
        <RescheduleModal
          booking={booking}
          current={current}
          artistName={artistName}
          requestedBy={user?.id || null}
          customerName={customerName || null}
          onClose={() => setOpen(false)}
          onSubmitted={() => setOpen(false)}
        />
      )}
    </>
  );
}

function RescheduleModal({
  booking,
  current,
  artistName,
  requestedBy,
  customerName,
  onClose,
  onSubmitted,
}: {
  booking: CustomerPortalBooking;
  current: CurrentAppointment;
  artistName: string;
  requestedBy: string | null;
  customerName: string | null;
  onClose: () => void;
  onSubmitted: (req: RescheduleRequest) => void;
}) {
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [rawRanges, setRawRanges] = useState<BusyRange[]>([]);
  const artistId = booking.artist_id;

  // Same availability source the customer date picker already uses: RPC get_artist_busy_ranges
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const supabase = createClient();
        const todayStr = getThailandTodayStr();
        const [yStr, mStr] = todayStr.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10) - 1;
        const startDate = `${yStr}-${mStr}-01`;
        const endObj = new Date(y, m + 4, 0);
        const endDate = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
        const { data, error: rpcErr } = await supabase.rpc('get_artist_busy_ranges', {
          p_artist_id: artistId,
          p_start_date: startDate,
          p_end_date: endDate,
        });
        if (isMounted && !rpcErr && Array.isArray(data)) setRawRanges(data as BusyRange[]);
      } catch (err) {
        console.error('[RescheduleRequest] Error loading busy ranges:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [artistId]);

  // Exclude this booking's own slot so it never blocks its own reschedule
  const busyRanges = useMemo(
    () => rawRanges.filter((r) => !current.ownStartMs.includes(new Date(r.start_at).getTime())),
    [rawRanges, current.ownStartMs]
  );

  const intervals = useMemo(() => (newDate ? rangesToIntervals(busyRanges, newDate) : []), [busyRanges, newDate]);
  const capacity = useMemo(
    () => (newDate ? getArtistDailyCapacityStatus(busyRanges, newDate) : { isFullDayBlocked: false, dailyJobCount: 0, isCapacityReached: false }),
    [busyRanges, newDate]
  );

  const todayStr = getThailandTodayStr();
  const nowMins = useMemo(() => hhmmToMins(bkkTimeStr(new Date().toISOString())), []);

  const isTimeDisabled = useCallback(
    (t: string): boolean => {
      if (!t) return false;
      if (!isStartTimeAllowedForSize(t, null, booking.width_cm, booking.height_cm)) return true;
      if (newDate === current.date && t === current.start) return true; // never the current slot
      const startMins = hhmmToMins(t);
      if (newDate === todayStr && startMins <= nowMins) return true;
      const endMins = Math.min(STUDIO_OPERATING_HOURS.CLOSE_MINUTES, startMins + current.durationMins);
      return intervals.some((b) => startMins < b.endMins && endMins > b.startMins);
    },
    [booking.width_cm, booking.height_cm, newDate, current.date, current.start, current.durationMins, intervals, todayStr, nowMins]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newDate) return setError('กรุณาเลือกวันที่ใหม่');
    if (newDate < todayStr) return setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
    if (!newTime) return setError('กรุณาเลือกเวลาใหม่');
    if (newDate === current.date && newTime === current.start) return setError('วันและเวลาใหม่ต้องไม่ซ้ำกับวันนัดปัจจุบัน');
    if (capacity.isFullDayBlocked) return setError('ช่างหรือร้านปิดรับคิวในวันที่เลือก กรุณาเลือกวันอื่น');
    if (capacity.isCapacityReached) return setError('ช่างรับงานครบในวันที่เลือกแล้ว กรุณาเลือกวันอื่น');
    if (isTimeDisabled(newTime)) return setError('เวลาที่เลือกไม่ว่าง กรุณาเลือกเวลาอื่น');
    if (!reason.trim()) return setError('กรุณาระบุเหตุผลในการขอเลื่อนนัด');

    try {
      const endMins = Math.min(STUDIO_OPERATING_HOURS.CLOSE_MINUTES, hhmmToMins(newTime) + current.durationMins);
      const created = createRescheduleRequest({
        booking_id: booking.id,
        artist_id: artistId,
        customer_name: customerName,
        original_date: current.date,
        original_start_time: current.start,
        original_end_time: current.end,
        requested_date: newDate,
        requested_start_time: newTime,
        requested_end_time: minsToHHMM(endMins),
        reason: reason.trim(),
        requested_by: requestedBy,
      });
      onSubmitted(created);
    } catch (err: any) {
      setError(err?.message || 'ไม่สามารถส่งคำขอเลื่อนนัดได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm animate-fadeIn font-prompt">
      <div
        className="relative w-full max-w-md bg-studio-card border border-studio-border rounded-t-2xl sm:rounded-[8px] shadow-2xl overflow-y-auto"
        style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-bottom, 0px) - 1rem)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 bg-studio-main/60 hover:bg-studio-red text-[#ECE4D3] hover:text-white rounded-full transition-colors"
          title="ปิด"
        >
          <X size={16} />
        </button>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 pb-7">
          <div className="border-b border-studio-border pb-3 pr-8">
            <div className="flex items-center gap-2 text-sm font-bold text-[#ECE4D3]">
              <CalendarClock size={16} className="text-studio-red" />
              <span>ขอเลื่อนวันนัด</span>
            </div>
            <p className="text-[11px] text-[#B8B0A3] mt-1 font-light">
              ส่งคำขอให้ช่างสักหรือร้านพิจารณา วันนัดเดิมจะยังคงมีผลจนกว่าคำขอจะได้รับการอนุมัติ
            </p>
          </div>

          {RESCHEDULE_REQUESTS_PROTOTYPE_MODE && (
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-[6px] p-2.5 text-[10px] text-amber-200 leading-relaxed">
              โหมดต้นแบบ (Prototype): ระบบยังไม่ได้เชื่อมฐานข้อมูลสำหรับคำขอเลื่อนนัด คำขอจะถูกบันทึกในเบราว์เซอร์นี้เท่านั้นและยังไม่ถูกส่งถึงช่าง
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start gap-2 text-[11px] text-red-400">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-[#171512] border border-[#4A443A] rounded-[6px] p-3 space-y-1.5 text-[11px]">
            <div className="flex justify-between gap-3">
              <span className="text-[#B8B0A3] flex items-center gap-1.5"><Calendar size={12} className="text-studio-red" /> วันนัดปัจจุบัน</span>
              <span className="text-[#ECE4D3] font-semibold text-right">{formatThaiDate(current.date)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#B8B0A3] flex items-center gap-1.5"><Clock size={12} className="text-studio-red" /> เวลาปัจจุบัน</span>
              <span className="text-[#ECE4D3] font-semibold">{current.start} น.</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[#B8B0A3] flex items-center gap-1.5"><User size={12} className="text-studio-red" /> ช่างสัก</span>
              <span className="text-[#ECE4D3] font-semibold text-right">{artistName}</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-studio-secondary font-medium flex items-center gap-1">
              <Calendar size={12} className="text-studio-red" /> วันใหม่ <span className="text-studio-red">*</span>
            </label>
            <DatePickerPopover
              value={newDate}
              onChange={(d) => {
                setNewDate(d);
                setNewTime('');
                setError('');
              }}
              artistId={artistId}
              artistWorkingDays={booking.artist?.working_days || undefined}
              busyRanges={busyRanges}
              minDate={todayStr}
              placeholder="-- เลือกวันใหม่ --"
            />
            {newDate && (capacity.isFullDayBlocked || capacity.isCapacityReached) && (
              <p className="text-[10px] text-red-400">
                {capacity.isFullDayBlocked ? 'ช่างหรือร้านปิดรับคิวในวันนี้' : 'ช่างรับงานครบในวันนี้แล้ว'} กรุณาเลือกวันอื่น
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-studio-secondary font-medium flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-studio-red" /> เวลาใหม่ <span className="text-studio-red">*</span>
              </span>
              <span className="text-[10px] text-[#E2DDD4] font-normal">(10:00 - 23:00 น.)</span>
            </label>
            <DualTimePicker
              value={newTime}
              onChange={(t) => {
                setNewTime(t);
                setError('');
              }}
              disabled={!newDate}
              isTimeDisabled={isTimeDisabled}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-studio-secondary font-medium">
              เหตุผลในการขอเลื่อนนัด <span className="text-studio-red">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              rows={3}
              placeholder="เช่น ติดธุระสำคัญ / ไม่สะดวกเดินทางในวันดังกล่าว"
              className="w-full bg-[#171512] border border-[#4A443A] text-xs text-[#ECE4D3] p-3 rounded-[4px] outline-none focus:border-studio-red placeholder:text-[#8C8479] resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-transparent border border-studio-border text-studio-secondary hover:text-studio-primary hover:border-studio-red/40 py-2.5 rounded-[4px] text-xs font-semibold transition-all"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-[2] bg-studio-red hover:bg-studio-red/80 border border-studio-red text-white py-2.5 rounded-[4px] text-xs font-bold tracking-wider transition-all shadow-md shadow-studio-red/20"
            >
              ส่งคำขอเลื่อนนัด
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
