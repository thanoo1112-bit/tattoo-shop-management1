'use client';

import React, { useEffect, useState } from 'react';
import { Clock, Ban, CheckCircle } from 'lucide-react';
import { useApp } from '../AppContext';

export interface TimeSlot {
  start: string;
  end: string;
  duration: number; // in hours
}

interface TimeSlotPickerProps {
  selectedSlot: TimeSlot | null;
  onSlotSelect: (slot: TimeSlot) => void;
  requiredDuration?: number;
  artistId?: string;
  selectedDate?: string;
}

export default function TimeSlotPicker({
  selectedSlot,
  onSlotSelect,
  requiredDuration = 2,
  artistId,
  selectedDate,
}: TimeSlotPickerProps) {
  const { getArtistBusySlots } = useApp();
  const [busySlots, setBusySlots] = useState<{ startAt: string; endAt: string }[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  // Preset time slots for studio operations
  const slots: TimeSlot[] = [
    { start: '10:00', end: '12:00', duration: 2 },
    { start: '10:00', end: '13:00', duration: 3 },
    { start: '13:00', end: '17:00', duration: 4 },
    { start: '13:30', end: '17:30', duration: 4 },
    { start: '17:30', end: '20:30', duration: 3 },
  ];

  useEffect(() => {
    let isSubscribed = true;
    const loadBusySlots = async () => {
      if (!artistId || !selectedDate) {
        setBusySlots([]);
        return;
      }

      setLoadingAvailability(true);
      try {
        const slotsData = await getArtistBusySlots(artistId, selectedDate, selectedDate);
        if (isSubscribed) {
          setBusySlots(slotsData);
        }
      } catch (err) {
        console.error('Error fetching busy slots:', err);
      } finally {
        if (isSubscribed) {
          setLoadingAvailability(false);
        }
      }
    };

    loadBusySlots();

    return () => {
      isSubscribed = false;
    };
  }, [artistId, selectedDate, getArtistBusySlots]);

  const isSlotOverlap = (candidate: TimeSlot): boolean => {
    if (!selectedDate || busySlots.length === 0) return false;

    const parseTimeToMins = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const candStart = parseTimeToMins(candidate.start);
    const candEnd = parseTimeToMins(candidate.end);

    return busySlots.some(busy => {
      const busyStart = new Date(busy.startAt).getHours() * 60 + new Date(busy.startAt).getMinutes();
      const busyEnd = new Date(busy.endAt).getHours() * 60 + new Date(busy.endAt).getMinutes();
      return Math.max(candStart, busyStart) < Math.min(candEnd, busyEnd);
    });
  };

  return (
    <div className="bg-studio-main border border-studio-border p-5 rounded-[6px] w-full">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-studio-border/60">
        <div className="flex items-center space-x-2">
          <Clock size={15} className="text-studio-red" />
          <span className="text-xs uppercase tracking-wider text-studio-primary font-bold">
            เลือกช่วงเวลาปฏิบัติงาน (Time Slot)
          </span>
        </div>
        {loadingAvailability && (
          <span className="text-[10px] text-studio-muted animate-pulse">กำลังตรวจคิวว่าง...</span>
        )}
      </div>

      {/* Desktop 2-Column Grid of Time Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {slots.map((slot, index) => {
          const isSelected = selectedSlot?.start === slot.start && selectedSlot?.end === slot.end;
          const isRecommended = slot.duration === requiredDuration;
          const isBusy = isSlotOverlap(slot);

          return (
            <button
              key={index}
              type="button"
              disabled={isBusy}
              onClick={() => onSlotSelect(slot)}
              className={`p-4 flex flex-col justify-between rounded-[4px] border transition-all duration-200 text-left ${
                isBusy
                  ? 'bg-studio-main/40 border-studio-border/40 text-studio-muted opacity-40 cursor-not-allowed'
                  : isSelected
                  ? 'bg-studio-red/10 border-studio-red text-studio-red font-semibold shadow-inner'
                  : 'bg-studio-card border-studio-border text-studio-primary hover:border-studio-red/60'
              }`}
            >
              <div className="flex justify-between items-start w-full">
                <div>
                  <span className="text-sm font-bold text-studio-primary block">
                    {slot.start} — {slot.end}
                  </span>
                  <span className="text-xs text-studio-secondary mt-0.5 block">
                    ระยะเวลาปฏิบัติงาน: <strong className="text-studio-red">{slot.duration} ชั่วโมง</strong>
                  </span>
                </div>
                {isSelected && (
                  <CheckCircle size={16} className="text-studio-red shrink-0" />
                )}
                {isBusy && (
                  <span className="text-[10px] text-red-400 font-medium flex items-center gap-1 bg-red-950/40 border border-red-900/60 px-2 py-0.5 rounded">
                    <Ban size={10} /> ติดจอง
                  </span>
                )}
              </div>
              
              {!isBusy && isRecommended && (
                <span className="text-[9px] bg-studio-red/20 text-studio-red border border-studio-red/30 px-2 py-0.5 rounded font-semibold uppercase tracking-wider mt-3 self-start">
                  แนะนำสำหรับขนาดนี้
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
