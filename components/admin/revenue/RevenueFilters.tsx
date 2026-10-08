'use client';

import React from 'react';
import { Calendar, User, Filter, RotateCcw } from 'lucide-react';
import { DateFilterPreset } from './types';

interface RevenueFiltersProps {
  datePreset: DateFilterPreset;
  onDatePresetChange: (preset: DateFilterPreset) => void;
  customStartDate: string;
  onCustomStartDateChange: (date: string) => void;
  customEndDate: string;
  onCustomEndDateChange: (date: string) => void;
  selectedArtistId?: string;
  onArtistChange?: (artistId: string) => void;
  artists?: Array<{ id: string; name: string; nickname: string | null }>;
  onResetFilters: () => void;
}

export default function RevenueFilters({
  datePreset,
  onDatePresetChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  selectedArtistId,
  onArtistChange,
  artists,
  onResetFilters,
}: RevenueFiltersProps) {
  const datePresets: Array<{ id: DateFilterPreset; label: string }> = [
    { id: 'this_month', label: 'เดือนนี้' },
    { id: 'last_month', label: 'เดือนก่อน' },
    { id: 'custom', label: 'กำหนดเอง' },
  ];

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3 font-prompt">
      {/* Top Filter Controls: Presets and Reset */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Date Presets Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <span className="text-xs font-medium text-[#A89F91] flex items-center gap-1.5 mr-1 shrink-0">
            <Calendar size={14} className="text-[#ECE4D3]" />
            <span>ช่วงเวลา:</span>
          </span>
          {datePresets.map((p) => {
            const isSelected = datePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onDatePresetChange(p.id)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium shrink-0 border ${
                  isSelected
                    ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3] shadow'
                    : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3] hover:border-[#7A7265]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Right side: Reset Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onResetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#ECE4D3] bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-md transition-colors cursor-pointer"
            title="รีเซ็ตตัวกรองเป็นเดือนนี้"
          >
            <RotateCcw size={13} className="text-[#ECE4D3]" />
            <span>รีเซ็ตตัวกรอง</span>
          </button>
        </div>
      </div>

      {/* Custom Date Range Selector (Only visible if 'custom' is selected) */}
      {datePreset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-[#4A443A]/50 text-xs text-[#A89F91] animate-fadeIn">
          <div className="flex items-center gap-1.5">
            <span>ตั้งแต่วันที่:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => onCustomStartDateChange(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded px-2.5 py-1.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#ECE4D3] cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span>ถึงวันที่:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => onCustomEndDateChange(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded px-2.5 py-1.5 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#ECE4D3] cursor-pointer [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
