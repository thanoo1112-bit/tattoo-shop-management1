'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CustomerFlashReservationRecord } from './types';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import PlacementSelector from '@/components/estimate/PlacementSelector';
import TattooSizeInput from '@/components/estimate/TattooSizeInput';
import DatePickerPopover from '@/components/booking/DatePickerPopover';
import DualTimePicker from '@/components/estimate/DualTimePicker';
import { getThailandTodayStr } from '@/components/portal/portalUtils';
import { getTattooDurationInfo, isStartTimeAllowedForSize } from '@/lib/utils/tattooDuration';
import {
  X,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  MapPin,
  Maximize2,
  Palette,
  Image as ImageIcon,
  Lock,
  FileText,
  ZoomIn,
} from 'lucide-react';

function parseNoteForEdit(noteText?: string | null): {
  parsedPlacement: string | null;
  parsedWidth: number | null;
  parsedHeight: number | null;
  cleanNote: string;
} {
  if (!noteText || !noteText.trim()) {
    return { parsedPlacement: null, parsedWidth: null, parsedHeight: null, cleanNote: '' };
  }

  let text = noteText.trim();
  let parsedPlacement: string | null = null;
  let parsedWidth: number | null = null;
  let parsedHeight: number | null = null;

  // Placement extraction
  const placementMatch = text.match(/\[(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\]]+)\]/i);
  if (placementMatch) {
    parsedPlacement = placementMatch[1].trim();
    text = text.replace(/\[(?:ตำแหน่ง|ตำแหน่งที่สัก):\s*([^\]]+)\]/gi, '');
  }

  // Size extraction e.g. [ขนาด: 5x5 ซม.] or [ขนาด: 10x15]
  const sizeMatch = text.match(/\[(?:ขนาด|ขนาดงานสัก):\s*([^\]]+)\]/i);
  if (sizeMatch) {
    const raw = sizeMatch[1].trim().toLowerCase();
    text = text.replace(/\[(?:ขนาด|ขนาดงานสัก):\s*([^\]]+)\]/gi, '');
    if (raw.includes('5x5') || raw.includes('5 x 5') || raw.includes('size s')) {
      parsedWidth = 5;
      parsedHeight = 5;
    } else if (raw.includes('5x10') || raw.includes('5 x 10') || raw.includes('size m')) {
      parsedWidth = 5;
      parsedHeight = 10;
    } else if (raw.includes('10x15') || raw.includes('10 x 15') || raw.includes('size l')) {
      parsedWidth = 10;
      parsedHeight = 15;
    } else if (raw.includes('15x25') || raw.includes('15 x 25') || raw.includes('size xl')) {
      parsedWidth = 15;
      parsedHeight = 25;
    } else if (raw.includes('21x30') || raw.includes('a4') || raw.includes('xxl')) {
      parsedWidth = 21;
      parsedHeight = 30;
    }
  }

  // Remove time/date legacy tags
  text = text
    .replace(/\[(?:เวลาสะดวก|เวลาที่สะดวก|เวลาเริ่ม|วันสะดวก|วันที่สะดวก|วันนัด):\s*([^\]]+)\]/gi, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    parsedPlacement,
    parsedWidth,
    parsedHeight,
    cleanNote: text,
  };
}

interface CustomerEditFlashModalProps {
  item: CustomerFlashReservationRecord;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CustomerEditFlashModal({
  item,
  onClose,
  onSuccess,
}: CustomerEditFlashModalProps) {
  const { user } = useApp();
  const flash = item.flash_design;
  const targetArtistId = flash?.artist?.id || (flash as any)?.artist_id || (item as any)?.artist_id;

  const { parsedPlacement, parsedWidth, parsedHeight, cleanNote } = parseNoteForEdit(item.customer_note);

  const initialPlacement = (item.placement && item.placement.trim())
    ? item.placement.trim()
    : (parsedPlacement || '');

  const initialWidth = item.width_cm ? Number(item.width_cm) : (parsedWidth || 5);
  const initialHeight = item.height_cm ? Number(item.height_cm) : (parsedHeight || 5);

  const [requestedDate, setRequestedDate] = useState(item.requested_date || '');
  const [requestedTime, setRequestedTime] = useState(
    item.requested_start_time ? item.requested_start_time.slice(0, 5) : '13:00'
  );
  const [placement, setPlacement] = useState(initialPlacement);
  const [width, setWidth] = useState<number>(initialWidth);
  const [height, setHeight] = useState<number>(initialHeight);
  const [customerNote, setCustomerNote] = useState(cleanNote);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showImageZoom, setShowImageZoom] = useState(false);

  const [disabledDates, setDisabledDates] = useState<string[]>([]);
  const [busyIntervals, setBusyIntervals] = useState<{ startMins: number; endMins: number }[]>([]);

  const artistName = flash?.artist?.name
    ? `${flash.artist.name}${flash.artist.nickname ? ` (${flash.artist.nickname})` : ''}`
    : 'ช่างสักประจำร้าน';

  // 1. Fetch Month Busy Dates for targetArtistId with self-exclusion for item.id
  useEffect(() => {
    if (!targetArtistId) return;
    let isMounted = true;

    async function loadBusyRanges() {
      try {
        const supabase = createClient();
        const todayStr = getThailandTodayStr();
        const [yStr, mStr] = todayStr.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10) - 1;

        const startDate = `${yStr}-${mStr}-01`;
        const endDateObj = new Date(y, m + 4, 0);
        const endYear = endDateObj.getFullYear();
        const endMonth = String(endDateObj.getMonth() + 1).padStart(2, '0');
        const endDay = String(endDateObj.getDate()).padStart(2, '0');
        const endDate = `${endYear}-${endMonth}-${endDay}`;

        const { data: busyData, error: rpcErr } = await supabase.rpc('get_artist_busy_ranges', {
          p_artist_id: targetArtistId,
          p_start_date: startDate,
          p_end_date: endDate,
        });

        if (!isMounted) return;

        const rawBusyDates = new Set<string>();
        if (!rpcErr && Array.isArray(busyData)) {
          for (const r of busyData) {
            try {
              const startD = new Date(r.start_at);
              const bkkDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(startD);
              rawBusyDates.add(bkkDate);
            } catch (_) {}
          }
        }

        // Self-exclusion check for item.requested_date
        const currentResDate = item.requested_date;
        if (currentResDate && rawBusyDates.has(currentResDate)) {
          const { data: otherFlash } = await supabase
            .from('flash_reservations')
            .select('id, flash_designs!inner(artist_id)')
            .eq('requested_date', currentResDate)
            .eq('flash_designs.artist_id', targetArtistId)
            .neq('id', item.id)
            .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")');

          const { data: otherBookings } = await supabase
            .from('bookings')
            .select('id')
            .eq('requested_date', currentResDate)
            .eq('artist_id', targetArtistId)
            .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")');

          const { data: otherEstimates } = await supabase
            .from('estimate_requests')
            .select('id')
            .eq('artist_id', targetArtistId)
            .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")')
            .or(`preferred_date.eq.${currentResDate},and(is_date_proposed.eq.true,proposed_date.eq.${currentResDate})`);

          const { data: otherBlocked } = await supabase
            .from('artist_blocked_dates')
            .select('id')
            .eq('blocked_date', currentResDate)
            .or(`scope.eq.STUDIO,and(scope.eq.ARTIST,artist_id.eq.${targetArtistId})`);

          const hasOtherConflict =
            (otherFlash && otherFlash.length > 0) ||
            (otherBookings && otherBookings.length > 0) ||
            (otherEstimates && otherEstimates.length > 0) ||
            (otherBlocked && otherBlocked.length > 0);

          if (!hasOtherConflict) {
            rawBusyDates.delete(currentResDate);
          }
        }

        setDisabledDates(Array.from(rawBusyDates));
      } catch (err) {
        console.error('[CustomerEditFlashModal] Error loading busy dates:', err);
      }
    }

    loadBusyRanges();
    return () => {
      isMounted = false;
    };
  }, [targetArtistId, item.id, item.requested_date]);

  // 2. Load busy time intervals on requestedDate
  useEffect(() => {
    if (!targetArtistId || !requestedDate) {
      setBusyIntervals([]);
      return;
    }
    let isMounted = true;

    async function loadDateBusyIntervals() {
      try {
        const supabase = createClient();
        const intervals: { startMins: number; endMins: number }[] = [];

        // flash_reservations (excluding item.id)
        const { data: flashResList } = await supabase
          .from('flash_reservations')
          .select('id, requested_start_time, width_cm, height_cm, customer_note, flash_designs!inner(artist_id)')
          .eq('requested_date', requestedDate)
          .eq('flash_designs.artist_id', targetArtistId)
          .neq('id', item.id)
          .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")');

        if (flashResList && flashResList.length > 0) {
          for (const fRes of flashResList) {
            if (fRes.requested_start_time) {
              const [h, m] = fRes.requested_start_time.split(':').map(Number);
              const startM = h * 60 + (m || 0);
              const duration = getTattooDurationInfo(null, fRes.width_cm, fRes.height_cm, fRes.customer_note);
              const endM = Math.min(1380, startM + duration.blockingMinutes);
              intervals.push({ startMins: startM, endMins: endM });
            } else {
              intervals.push({ startMins: 600, endMins: 1380 });
            }
          }
        }

        // booking_sessions
        const { data: sessionsList } = await supabase
          .from('booking_sessions')
          .select('start_at, end_at, bookings!inner(artist_id, status)')
          .eq('bookings.artist_id', targetArtistId)
          .in('status', ['SCHEDULED', 'IN_PROGRESS'])
          .not('bookings.status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")');

        if (sessionsList && sessionsList.length > 0) {
          for (const s of sessionsList) {
            try {
              const startD = new Date(s.start_at);
              const endD = new Date(s.end_at);
              const bkkDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Bangkok',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(startD);

              if (bkkDate === requestedDate) {
                const startH = parseInt(startD.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false }), 10);
                const startM = parseInt(startD.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', minute: 'numeric' }), 10);
                const endH = parseInt(endD.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false }), 10);
                const endM = parseInt(endD.toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', minute: 'numeric' }), 10);

                const sMins = startH * 60 + (isNaN(startM) ? 0 : startM);
                const eMins = endH * 60 + (isNaN(endM) ? 0 : endM);
                intervals.push({ startMins: sMins, endMins: eMins });
              }
            } catch (_) {}
          }
        }

        // bookings / estimate_requests / artist_blocked_dates
        const { data: bookingsList } = await supabase
          .from('bookings')
          .select('id')
          .eq('requested_date', requestedDate)
          .eq('artist_id', targetArtistId)
          .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")');

        if (bookingsList && bookingsList.length > 0) {
          intervals.push({ startMins: 600, endMins: 1380 });
        }

        const { data: estimatesList } = await supabase
          .from('estimate_requests')
          .select('id')
          .eq('artist_id', targetArtistId)
          .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")')
          .or(`preferred_date.eq.${requestedDate},and(is_date_proposed.eq.true,proposed_date.eq.${requestedDate})`);

        if (estimatesList && estimatesList.length > 0) {
          intervals.push({ startMins: 600, endMins: 1380 });
        }

        const { data: blockedList } = await supabase
          .from('artist_blocked_dates')
          .select('id')
          .eq('blocked_date', requestedDate)
          .or(`scope.eq.STUDIO,and(scope.eq.ARTIST,artist_id.eq.${targetArtistId})`);

        if (blockedList && blockedList.length > 0) {
          intervals.push({ startMins: 600, endMins: 1380 });
        }

        if (isMounted) {
          setBusyIntervals(intervals);
        }
      } catch (err) {
        console.error('[CustomerEditFlashModal] Error loading time intervals:', err);
      }
    }

    loadDateBusyIntervals();
    return () => {
      isMounted = false;
    };
  }, [targetArtistId, requestedDate, item.id]);

  // 3. Callback to determine if a time string is disabled for DualTimePicker
  const isTimeDisabled = useCallback(
    (timeStr: string): boolean => {
      if (!timeStr) return false;
      const allowedBySize = isStartTimeAllowedForSize(timeStr, null, width, height);
      if (!allowedBySize) return true;

      if (busyIntervals.length === 0) return false;

      const [h, m] = timeStr.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return false;

      const durationInfo = getTattooDurationInfo(null, width, height);
      const effectiveBlockingMins = durationInfo.isXXL ? 360 : durationInfo.blockingMinutes;
      const startMins = h * 60 + m;
      const endMins = Math.min(1380, startMins + effectiveBlockingMins);

      for (const busy of busyIntervals) {
        if (startMins < busy.endMins && endMins > busy.startMins) {
          return true;
        }
      }

      return false;
    },
    [width, height, busyIntervals]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user) {
      setError('กรุณาล็อกอินก่อนทำการแก้ไขคำขอ');
      return;
    }

    const currentStatus = (item.status || '').toUpperCase();
    if (currentStatus !== 'PENDING') {
      setError('สามารถแก้ไขได้เฉพาะคำขอที่อยู่ในสถานะรอตรวจสอบ (PENDING) เท่านั้น');
      return;
    }

    if (!placement || !placement.trim() || placement.trim() === 'อื่น ๆ' || placement.trim() === 'อื่น ๆ:') {
      setError('กรุณาเลือกหรือระบุตำแหน่งที่ต้องการสัก');
      return;
    }

    if (!requestedDate) {
      setError('กรุณาเลือกวันนัดหมายเข้ารับบริการ');
      return;
    }

    if (requestedDate < getThailandTodayStr()) {
      setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
      return;
    }

    if (!requestedTime || !requestedTime.trim() || !requestedTime.includes(':')) {
      setError('กรุณาเลือกเวลาที่สะดวกเริ่มสัก');
      return;
    }

    if (requestedDate && targetArtistId) {
      if (disabledDates.includes(requestedDate)) {
        setError('วันที่เลือกมีคิวงานที่ยืนยันแล้วของช่างสักท่านนี้ กรุณาเลือกวันอื่น');
        return;
      }
      if (isTimeDisabled(requestedTime)) {
        setError('เวลาที่เลือกไม่ว่างเนื่องจากมีคิวงานอื่นหรือเกินเวลาทำการของร้าน กรุณาเลือกเวลาอื่น');
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc('update_flash_reservation', {
        p_reservation_id: item.id,
        p_requested_date: requestedDate,
        p_requested_start_time: requestedTime.length === 5 ? `${requestedTime}:00` : requestedTime,
        p_customer_note: customerNote.trim() || null,
        p_placement: placement.trim(),
        p_width_cm: width,
        p_height_cm: height,
      });

      if (rpcErr) throw rpcErr;

      setSuccessMsg('แก้ไขคำขอจองลาย Flash สำเร็จแล้ว!');
      setTimeout(() => {
        onSuccess();
        onClose();

      }, 1200);
    } catch (err: any) {
      console.error('Error updating flash reservation:', err);
      setError(err.message || 'ไม่สามารถแก้ไขคำขอได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-studio-main/90 backdrop-blur-sm overflow-y-auto font-prompt animate-fadeIn">
      <div className="w-full max-w-2xl bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px] shadow-2xl relative my-6 text-studio-primary max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Modal Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-xs text-studio-muted hover:text-studio-red font-bold p-1 transition-colors z-10"
        >
          ✕ ปิดหน้าต่าง
        </button>

        {/* Modal Header */}
        <div className="border-b border-studio-border pb-3.5 mb-5">
          <div className="inline-flex items-center space-x-1.5 bg-studio-red/10 border border-studio-red/30 px-2 py-0.5 rounded text-studio-red text-[10px] uppercase font-bold tracking-widest mb-1.5">
            <Sparkles size={11} />
            <span>EDIT FLASH RESERVATION REQUEST</span>
          </div>
          <h2 className="text-lg sm:text-xl font-heading text-studio-primary">
            แก้ไขคำขอจองคิวสักแบบลาย Flash — {flash?.title || 'แบบลายสัก Flash'}
          </h2>
          <p className="text-xs text-studio-secondary mt-0.5 font-light">
            ปรับเปลี่ยนตำแหน่ง ขนาด วันนัดหมาย หรือรายละเอียดเพิ่มเติม (สถานะ: รอตรวจสอบ)
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 bg-emerald-950/40 border border-emerald-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-emerald-400">
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 text-xs">
          {/* SECTION 1 — ช่างสักประจำลาย (Artist Section) - LOCKED */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary font-semibold flex items-center gap-1.5">
                <User size={13} className="text-studio-red" />
                <span>1. ช่างสักประจำลาย (Artist)</span>
              </label>
              <span className="text-[10px] bg-studio-main border border-studio-border text-studio-muted px-2 py-0.5 rounded flex items-center gap-1">
                <Lock size={10} /> ล็อกช่างสักเจ้าของลาย
              </span>
            </div>

            <div className="bg-studio-main border border-studio-border p-3.5 rounded-[6px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-studio-card border border-studio-red/40 flex items-center justify-center text-studio-red font-bold text-sm shrink-0">
                  <User size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-studio-primary text-sm">{artistName}</h4>
                  <p className="text-[11px] text-studio-secondary font-light">
                    ช่างสักประจำร้าน 157 TATTOO
                  </p>
                </div>
              </div>
              <span className="text-[11px] bg-studio-red/10 border border-studio-red/30 text-studio-red px-2.5 py-1 rounded font-bold shrink-0">
                เจ้าของลาย
              </span>
            </div>
          </section>

          {/* SECTION 2 — รูปภาพอ้างอิงงานสัก (Reference Image Section) - LOCKED */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary font-semibold flex items-center gap-1.5">
                <ImageIcon size={13} className="text-studio-red" />
                <span>2. รูปภาพอ้างอิงงานสัก (Reference Image)</span>
              </label>
              <span className="text-[10px] text-studio-muted flex items-center gap-1">
                <Lock size={10} strokeWidth={2} /> รูปต้นแบบ Flash ของร้าน (ห้ามแก้ไข)
              </span>
            </div>

            <div className="bg-studio-main border border-studio-border p-3.5 rounded-[6px] space-y-2.5">
              <div className="flex items-start gap-3.5">
                {flash?.image_url && (
                  <div
                    onClick={() => setShowImageZoom(true)}
                    className="w-24 h-28 sm:w-28 sm:h-32 bg-studio-card rounded-[6px] overflow-hidden shrink-0 border border-studio-border/80 relative cursor-pointer group"
                  >
                    <img
                      src={flash.image_url}
                      alt={flash.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <ZoomIn size={18} />
                    </div>
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                  <h4 className="font-bold text-studio-primary text-sm truncate">{flash?.title}</h4>
                  <div className="text-xs text-studio-secondary space-y-0.5">
                    <p>สไตล์: <strong className="text-studio-primary">{flash?.style || '-'}</strong></p>
                    <p className="text-[11px] text-studio-muted font-light">
                      • รูปอ้างอิงต้นแบบสงวนลิขสิทธิ์ของช่างประจำร้าน (ล็อกตามแบบ)
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3 — รายละเอียดงานสัก (Tattoo Details) - EDITABLE */}
          <section className="space-y-3.5">
            <div className="border-b border-studio-border pb-2">
              <h3 className="text-xs font-bold text-studio-primary uppercase tracking-wider flex items-center gap-1.5">
                <Palette size={13} className="text-studio-red" />
                <span>3. รายละเอียดงานสัก</span>
              </h3>
            </div>

            {/* 3.1 Style (Locked) */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold">
                สไตล์งานสัก
              </label>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-[4px] text-xs bg-studio-red border border-studio-red text-white font-semibold shadow-md inline-block">
                  {flash?.style || '-'}
                </span>
                <span className="text-[11px] text-studio-muted font-light">
                  (สไตล์ตามแบบลาย Flash)
                </span>
              </div>
            </div>

            {/* 3.2 Placement Selector */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center gap-1">
                <MapPin size={12} className="text-studio-red" />
                <span>ตำแหน่งที่ต้องการสัก <span className="text-studio-red">*</span></span>
              </label>
              <PlacementSelector
                value={placement}
                onChange={(val) => {
                  setPlacement(val);
                  setError('');
                }}
              />
            </div>

            {/* 3.3 Size Selector */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center gap-1">
                <Maximize2 size={12} className="text-studio-red" />
                <span>ขนาดของงานสัก <span className="text-studio-red">*</span></span>
              </label>
              <TattooSizeInput
                width={width}
                height={height}
                onWidthChange={(w) => {
                  setWidth(w);
                  setError('');
                }}
                onHeightChange={(h) => {
                  setHeight(h);
                  setError('');
                }}
              />
            </div>

            {/* 3.4 Customer Note / Description */}
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-semibold flex items-center gap-1">
                <FileText size={12} className="text-studio-red" />
                <span>รายละเอียดเพิ่มเติม / หมายเหตุถึงช่างสัก (ไม่บังคับ)</span>
              </label>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="ระบุข้อความถึงช่างสักเพิ่มเติม เช่น ข้อจำกัดเรื่องผิว รายละเอียดที่ต้องการ..."
                rows={3}
                className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary p-2.5 rounded-[4px] outline-none focus:border-studio-red resize-none"
              />
            </div>
          </section>

          {/* SECTION 4 — วันนัดและเวลาเริ่มสัก (Appointment Schedule) - EDITABLE */}
          <section className="space-y-3 pt-1">
            <div className="border-b border-studio-border pb-2">
              <h3 className="text-xs font-bold text-studio-primary uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={13} className="text-studio-red" />
                <span>4. วันนัดหมายและเวลาเริ่มสัก</span>
              </h3>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-studio-secondary font-medium flex items-center gap-1">
                  <Calendar size={12} className="text-studio-red" />
                  <span>วันนัดหมายเข้ารับบริการ <span className="text-studio-red">*</span></span>
                </label>
                <DatePickerPopover
                  value={requestedDate}
                  onChange={(dateStr) => {
                    setRequestedDate(dateStr);
                    setError('');
                  }}
                  artistId={targetArtistId}
                  disabledDates={disabledDates}
                  placeholder="-- เลือกวันนัดหมายเข้ารับบริการ --"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-studio-secondary font-medium flex items-center gap-1">
                  <Clock size={12} className="text-studio-red" />
                  <span>เวลาที่สะดวกเริ่มสัก <span className="text-studio-red">*</span></span>
                </label>
                <DualTimePicker
                  value={requestedTime}
                  onChange={(t) => {
                    setRequestedTime(t);
                    setError('');
                  }}
                  isTimeDisabled={isTimeDisabled}
                />
              </div>
            </div>
          </section>

          {/* Submit Actions */}
          <div className="flex gap-2 pt-2 border-t border-studio-border">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-transparent border border-studio-border text-studio-secondary hover:text-studio-primary hover:border-studio-red/40 py-2.5 px-3 rounded-[4px] text-xs font-semibold transition-all"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading || !!successMsg}
              className="flex-[2] bg-studio-red border border-studio-red text-studio-primary hover:bg-studio-red/80 py-2.5 px-3 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-md shadow-studio-red/20"
            >
              {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไขคำขอ'}
            </button>
          </div>
        </form>

        {/* Lightbox / Zoom Modal for Reference Image */}
        {showImageZoom && flash?.image_url && (
          <div
            onClick={() => setShowImageZoom(false)}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
          >
            <div className="relative max-w-3xl max-h-[85vh]">
              <img
                src={flash.image_url}
                alt={flash.title}
                className="max-w-full max-h-[85vh] object-contain rounded-lg border border-white/20 shadow-2xl"
              />
              <p className="text-center text-xs text-studio-secondary mt-2">
                {flash.title} — รูปภาพต้นแบบ Flash (ร้าน 157 TATTOO)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
