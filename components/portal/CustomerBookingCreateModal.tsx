'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CustomerPortalEstimate } from './types';
import { createClient } from '@/lib/supabase/client';
import BookingCalendar, { BusyRange } from '../booking/BookingCalendar';
import DualTimePicker from '../estimate/DualTimePicker';
import { X, Calendar, Clock, AlertTriangle, CheckCircle2, Ban, Info, RefreshCw } from 'lucide-react';
import {
  formatThaiDate,
  formatCurrency,
  formatTimeBangkok,
  getThailandTodayStr,
  getThailandTomorrowStr,
  getTattooDurationInfo,
  isStartTimeAllowedForSize,
  calculateBlockingEndTime,
} from './portalUtils';

interface CustomerBookingCreateModalProps {
  estimate: CustomerPortalEstimate;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
}

export default function CustomerBookingCreateModal({
  estimate,
  onClose,
  onSuccess,
}: CustomerBookingCreateModalProps) {
  const durationInfo = useMemo(() => {
    return getTattooDurationInfo(
      estimate.estimated_size_tier,
      estimate.width_cm,
      estimate.height_cm,
      estimate.description
    );
  }, [estimate]);

  const [requestedDate, setRequestedDate] = useState(() => {
    const minBookable = getThailandTodayStr();
    if (estimate.preferred_date && estimate.preferred_date >= minBookable) {
      return estimate.preferred_date;
    }
    return minBookable;
  });
  const [requestedTime, setRequestedTime] = useState(() => {
    if (estimate.preferred_time) {
      return estimate.preferred_time.length >= 5 ? estimate.preferred_time.slice(0, 5) : estimate.preferred_time;
    }
    return '10:00';
  });
  const [customerNote, setCustomerNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Availability state
  const [busyRanges, setBusyRanges] = useState<BusyRange[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [currentViewYear, setCurrentViewYear] = useState(() => {
    if (estimate.preferred_date) {
      const parts = estimate.preferred_date.split('-');
      if (parts.length === 3) return parseInt(parts[0], 10);
    }
    return new Date().getFullYear();
  });
  const [currentViewMonth, setCurrentViewMonth] = useState(() => {
    if (estimate.preferred_date) {
      const parts = estimate.preferred_date.split('-');
      if (parts.length === 3) return parseInt(parts[1], 10) - 1;
    }
    return new Date().getMonth();
  });

  const artistId = estimate.artist?.id || estimate.artist_id;
  const artistWorkingDays = estimate.artist?.working_days || [];
  const durationMinutes = durationInfo.blockingMinutes;

  const artistName = estimate.artist?.name
    ? `${estimate.artist.name}${estimate.artist.nickname ? ` (${estimate.artist.nickname})` : ''}`
    : 'ช่างสักประจำร้าน';

  // Helper to fetch busy ranges for a given year and month
  const fetchMonthBusyRanges = useCallback(
    async (yr: number, mo: number) => {
      if (!artistId) return;

      const padMo = mo + 1 < 10 ? `0${mo + 1}` : `${mo + 1}`;
      const lastDay = new Date(yr, mo + 1, 0).getDate();
      const startDate = `${yr}-${padMo}-01`;
      const endDate = `${yr}-${padMo}-${lastDay < 10 ? `0${lastDay}` : lastDay}`;

      setLoadingAvailability(true);
      try {
        const supabase = createClient();
        const { data, error: rpcErr } = await supabase.rpc('get_artist_busy_ranges', {
          p_artist_id: artistId,
          p_start_date: startDate,
          p_end_date: endDate,
        });

        if (!rpcErr && Array.isArray(data)) {
          setBusyRanges(data);
        } else {
          setBusyRanges([]);
        }
      } catch (err) {
        console.error('Failed to load artist availability:', err);
        setBusyRanges([]);
      } finally {
        setLoadingAvailability(false);
      }
    },
    [artistId]
  );

  // Load on mount and when view month changes
  useEffect(() => {
    fetchMonthBusyRanges(currentViewYear, currentViewMonth);
  }, [currentViewYear, currentViewMonth, fetchMonthBusyRanges]);

  // Handle month change from calendar
  const handleMonthChange = (yr: number, mo: number) => {
    setCurrentViewYear(yr);
    setCurrentViewMonth(mo);
  };

  // Busy ranges for the selected date
  const selectedDateBusyRanges = useMemo(() => {
    if (!requestedDate || busyRanges.length === 0) return [];
    return busyRanges.filter((r) => {
      try {
        const startD = new Date(r.start_at);
        const bkkDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(startD);
        return bkkDateStr === requestedDate;
      } catch {
        return false;
      }
    });
  }, [requestedDate, busyRanges]);

  // Form Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedDate || requestedDate < getThailandTodayStr()) {
      setError('ไม่สามารถเลือกวันที่ย้อนหลังได้');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = createClient();

      // Canonical RPC: create_booking_from_estimate
      const { data, error: rpcError } = await supabase.rpc('create_booking_from_estimate', {
        p_estimate_request_id: estimate.id,
        p_requested_date: requestedDate,
        p_requested_start_time: requestedTime.length === 5 ? `${requestedTime}:00` : requestedTime,
        p_customer_note: customerNote.trim() || null,
      });

      if (rpcError) throw rpcError;

      const newBookingId = typeof data === 'object' && data?.id ? data.id : (data || estimate.id);
      onSuccess(newBookingId);
      onClose();
    } catch (err: any) {
      console.error('Create booking error:', err);
      setError(err.message || 'ไม่สามารถส่งคำขอจองคิวได้');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-studio-main/90 backdrop-blur-sm overflow-y-auto font-prompt">
      <div className="w-full max-w-xl bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px] shadow-2xl relative my-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-xs text-[#B8B0A3] hover:text-studio-red font-bold p-1"
        >
          ✕ ปิดหน้าต่าง
        </button>

        <div className="border-b border-studio-border pb-3 mb-4">
          <span className="text-[10px] uppercase font-bold text-studio-red tracking-wider block">
            CONFIRM YOUR APPOINTMENT REQUEST
          </span>
          <h2 className="text-lg sm:text-xl font-heading text-studio-primary mt-0.5">
            ดำเนินการจองคิวตามราคาประเมิน — สไตล์ {estimate.style}
          </h2>
          <p className="text-[11px] text-studio-secondary mt-0.5 font-light">
            เลือกวันและเวลาที่ท่านสะดวกส่งคำขอ ร้านจะทำการตรวจสอบและยืนยันรอบนัดหมายอีกครั้ง
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Summary Box */}
          <div className="bg-studio-main border border-studio-border p-3 rounded-[4px] space-y-1.5">
            <div className="flex justify-between">
              <span className="text-studio-secondary">ช่างสักผู้รับผิดชอบ:</span>
              <strong className="text-studio-primary">{artistName}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-studio-secondary">ราคาประเมิน:</span>
              <strong className="text-studio-primary">฿{formatCurrency(estimate.quoted_price)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-studio-red">มัดจำที่ต้องชำระเมื่อร้านยืนยันคิว:</span>
              <strong className="text-studio-red">฿{formatCurrency(estimate.deposit_required)}</strong>
            </div>
            {durationMinutes > 0 && (
              <div className="flex justify-between text-[11px] text-[#B8B0A3] pt-1 border-t border-studio-border/40">
                <span>ระยะเวลาประเมินโดยช่าง:</span>
                <span>{durationMinutes} นาที ({Math.round((durationMinutes / 60) * 10) / 10} ชม.)</span>
              </div>
            )}
          </div>

          {/* Dynamic Artist Availability Calendar */}
          <div className="space-y-1.5">
            <label className="block text-studio-secondary font-medium flex items-center gap-1.5">
              <Calendar size={13} className="text-studio-red" />
              <span>1. เลือกวันที่ต้องการ (ปฏิทินคิวงานของช่าง) *</span>
            </label>

            <BookingCalendar
              selectedDate={requestedDate}
              onDateSelect={(dateStr) => {
                setRequestedDate(dateStr);
                setError('');
              }}
              artistWorkingDays={artistWorkingDays}
              busyRanges={busyRanges}
              loading={loadingAvailability}
              onMonthChange={handleMonthChange}
            />
          </div>

          {/* Busy Ranges Info for Selected Date */}
          {requestedDate && (
            <div className="bg-studio-main/70 border border-studio-border/70 p-3 rounded-[4px] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-studio-primary font-semibold flex items-center gap-1">
                  <Clock size={12} className="text-studio-red" />
                  ตารางคิววันที่ {formatThaiDate(requestedDate, true)}:
                </span>
                {loadingAvailability && (
                  <span className="text-[10px] text-[#B8B0A3] animate-pulse">กำลังอัปเดต...</span>
                )}
              </div>

              {selectedDateBusyRanges.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-[10px] text-amber-400 block font-medium">
                    ● มีช่วงเวลาที่ติดคิวแล้วในวันนี้:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDateBusyRanges.map((range, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-red-950/40 text-red-300 border border-red-900/50 px-2 py-0.5 rounded font-mono"
                      >
                        {formatTimeBangkok(range.start_at)} - {formatTimeBangkok(range.end_at)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <span className="text-[10px] text-emerald-400 block">
                  ✓ ยังไม่พบช่วงเวลาติดคิวในวันนี้ (สามารถส่งคำขอเวลาที่สะดวกได้)
                </span>
              )}
            </div>
          )}

          {/* Time Picker - 10:00 - 23:00 */}
          <div className="space-y-1">
            <label className="block text-studio-secondary font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-studio-red" />
                <span>2. เลือกเวลาที่ต้องการเริ่มสัก *</span>
              </span>
              <span className="text-[10px] text-[#E2DDD4] font-normal">
                (10:00 - 23:00 น.)
              </span>
            </label>

            <DualTimePicker
              value={requestedTime}
              onChange={(val) => {
                setRequestedTime(val);
                setError('');
              }}
            />
          </div>

          {/* Customer Note */}
          <div>
            <label className="block text-studio-secondary font-medium mb-1">
              ข้อความหรือหมายเหตุเพิ่มเติมถึงช่างสัก (ไม่บังคับ)
            </label>
            <textarea
              rows={2}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="ระบุข้อความ เช่น สะดวกเดินทางโดย BTS หรือต้องการสอบถามเรื่องการเตรียมตัว..."
              className="w-full bg-studio-sec border border-studio-border focus:border-studio-red text-studio-primary px-3 py-2 rounded-[4px] outline-none resize-none font-light"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-studio-border flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div className="text-[10px] text-[#B8B0A3]">
              * การส่งคำขอนี้ยังไม่ใช่นัดหมายที่ยืนยัน ร้านจะติดต่อยืนยันรอบนัดหมายอีกครั้ง
            </div>

            <div className="flex justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-3.5 py-2 bg-transparent border border-studio-border hover:bg-studio-main text-studio-secondary rounded-[4px] font-medium"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-studio-red border border-studio-red text-studio-paper hover:bg-tattoo-red-dark rounded-[4px] font-bold disabled:opacity-40 flex items-center gap-1.5"
              >
                {loading ? 'กำลังส่งคำขอ...' : 'ส่งคำขอจองคิว'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
