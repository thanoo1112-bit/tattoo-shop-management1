'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import { BusyRange } from '../booking/BookingCalendar';

export interface TattooSlotInfo {
  slotNumber: 1 | 2 | 3;
  id: string; // 'SLOT_1' | 'SLOT_2' | 'SLOT_3'
  title: string;
  timeRange: string;
  value: string; // '10:00' | '14:30' | '19:00'
  startMinutes: number;
  endMinutes: number;
}

export const THREE_SLOTS: TattooSlotInfo[] = [
  {
    slotNumber: 1,
    id: 'SLOT_1',
    title: 'รอบที่ 1',
    timeRange: '10:00 - 14:00 น.',
    value: '10:00',
    startMinutes: 10 * 60, // 600
    endMinutes: 14 * 60, // 840
  },
  {
    slotNumber: 2,
    id: 'SLOT_2',
    title: 'รอบที่ 2',
    timeRange: '14:30 - 18:30 น.',
    value: '14:30',
    startMinutes: 14 * 60 + 30, // 870
    endMinutes: 18 * 60 + 30, // 1110
  },
  {
    slotNumber: 3,
    id: 'SLOT_3',
    title: 'รอบที่ 3',
    timeRange: '19:00 - 23:00 น.',
    value: '19:00',
    startMinutes: 19 * 60, // 1140
    endMinutes: 23 * 60, // 1380
  },
];

/**
 * Checks if a given slot is occupied based on busy ranges.
 * Supports:
 *   1. Full-day block (00:00 - 23:59) -> All 3 slots busy.
 *   2. Phase 95 distinct slot windows (10:00-14:00, 14:30-18:30, 19:00-23:00).
 *   3. Custom / historical start times overlapping with slot window.
 */
export function isSlotBusy(
  slot: TattooSlotInfo,
  dateStr: string,
  busyRanges: BusyRange[]
): boolean {
  if (!dateStr || !busyRanges || busyRanges.length === 0) return false;

  for (const range of busyRanges) {
    try {
      const startD = new Date(range.start_at);
      const endD = new Date(range.end_at);

      const bkkDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(startD);

      if (bkkDateStr !== dateStr) continue;

      // Extract hours & minutes in Bangkok timezone
      const startParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(startD);
      const startH = parseInt(startParts.find((p) => p.type === 'hour')?.value || '0', 10);
      const startM = parseInt(startParts.find((p) => p.type === 'minute')?.value || '0', 10);
      const rangeStartMins = startH * 60 + startM;

      const endParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(endD);
      const endH = parseInt(endParts.find((p) => p.type === 'hour')?.value || '0', 10);
      const endM = parseInt(endParts.find((p) => p.type === 'minute')?.value || '0', 10);
      const rangeEndMins = endH * 60 + endM;

      // Full-day block check (starts <= 01:00 and ends >= 23:00)
      if (rangeStartMins <= 60 && rangeEndMins >= 1380) {
        return true;
      }

      // Check slot window overlap
      const hasOverlap =
        Math.max(slot.startMinutes, rangeStartMins) < Math.min(slot.endMinutes, rangeEndMins);

      if (hasOverlap) {
        return true;
      }
    } catch {
      // Ignore invalid timestamp
    }
  }

  return false;
}

interface ThreeSlotPickerProps {
  value: string; // '10:00' | '14:30' | '19:00' or historical value like '11:00'
  onChange: (val: string) => void;
  selectedDate?: string;
  busyRanges?: BusyRange[];
  disabled?: boolean;
}

export default function ThreeSlotPicker({
  value,
  onChange,
  selectedDate = '',
  busyRanges = [],
  disabled = false,
}: ThreeSlotPickerProps) {
  // Check if current value is one of standard slots or historical
  const matchedStandardSlot = THREE_SLOTS.find(
    (s) => s.value === value || value?.startsWith(s.value)
  );
  const isHistorical = Boolean(value && !matchedStandardSlot);

  return (
    <div className="w-full space-y-2 font-prompt">
      {/* Historical Time Banner if existing booking has custom non-standard time */}
      {isHistorical && (
        <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-[4px] text-xs text-amber-200 flex items-center justify-between">
          <span>
            เวลานัดเดิม: <strong>{value} น.</strong>
          </span>
          <span className="text-[10px] text-amber-400">
            (เลือกหนึ่งใน 3 รอบด้านล่างเพื่อเปลี่ยนเวลานัด)
          </span>
        </div>
      )}

      {/* 3 Slot Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {THREE_SLOTS.map((slot) => {
          const isBusy = selectedDate ? isSlotBusy(slot, selectedDate, busyRanges) : false;
          const isSelected = matchedStandardSlot?.id === slot.id;
          const isCardDisabled = disabled || isBusy;

          return (
            <button
              key={slot.id}
              type="button"
              disabled={isCardDisabled}
              onClick={() => {
                if (!isCardDisabled) {
                  onChange(slot.value);
                }
              }}
              className={`min-h-[58px] p-2.5 rounded-[4px] border text-left transition-all duration-200 flex flex-col justify-between relative select-none cursor-pointer ${
                isSelected
                  ? 'bg-studio-red border-studio-red text-white shadow-md'
                  : isCardDisabled
                  ? 'bg-studio-main/30 border-studio-border/30 text-studio-muted/50 cursor-not-allowed opacity-50'
                  : 'bg-studio-main border-studio-border text-[#ECE4D3] hover:border-studio-border/80 hover:bg-studio-card'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-xs font-bold leading-tight ${
                    isSelected ? 'text-white' : 'text-[#F2EEE8]'
                  }`}
                >
                  {slot.title}
                </span>
                {isBusy && (
                  <span className="text-[9px] bg-red-950/80 border border-red-800 text-red-300 px-1 py-0.2 rounded font-medium">
                    เต็ม
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 mt-1">
                <Clock
                  size={11}
                  className={isSelected ? 'text-white/90' : 'text-studio-red'}
                />
                <span
                  className={`text-[11px] font-mono leading-tight ${
                    isSelected ? 'text-white/90 font-medium' : 'text-[#D4CDC3]'
                  }`}
                >
                  {slot.timeRange}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
