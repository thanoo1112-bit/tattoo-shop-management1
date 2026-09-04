'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, RotateCw } from 'lucide-react';
import { ViewMode } from './types';

interface CalendarToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  titleLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isToday: boolean;
  onRefresh: () => void;
  isLoading: boolean;
}

export default function CalendarToolbar({
  viewMode,
  onViewModeChange,
  titleLabel,
  onPrev,
  onNext,
  onToday,
  isToday,
  onRefresh,
  isLoading,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3 sm:p-4">
      {/* Left: Navigation Controls & Title */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Today Button */}
        <button
          id="btn-calendar-today"
          type="button"
          onClick={onToday}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            isToday
              ? 'bg-[#9C2F2F]/20 text-[#9C2F2F] border-[#9C2F2F]/40'
              : 'bg-[#0E0D0C] text-[#ECE4D3] border-[#4A443A] hover:border-[#A89F91]'
          }`}
        >
          วันนี้
        </button>

        {/* Prev / Next Arrows */}
        <div className="flex items-center bg-[#0E0D0C] border border-[#4A443A] rounded-lg overflow-hidden">
          <button
            id="btn-calendar-prev"
            type="button"
            onClick={onPrev}
            aria-label="ก่อนหน้า"
            className="p-1.5 text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#1A1815] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="w-[1px] h-4 bg-[#4A443A]" />
          <button
            id="btn-calendar-next"
            type="button"
            onClick={onNext}
            aria-label="ถัดไป"
            className="p-1.5 text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#1A1815] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Current Date Range Title */}
        <div className="flex items-center gap-2 pl-1">
          <CalendarIcon size={16} className="text-[#9C2F2F] shrink-0" />
          <h2 id="calendar-title-label" className="text-sm sm:text-base font-bold text-[#ECE4D3] tracking-tight">
            {titleLabel}
          </h2>
        </div>
      </div>

      {/* Right: View Switcher (Month / Week / Day) & Refresh */}
      <div className="flex items-center gap-2 self-end md:self-auto">
        {/* View Mode Buttons */}
        <div className="inline-flex bg-[#0E0D0C] border border-[#4A443A] rounded-lg p-0.5">
          <button
            id="btn-view-month"
            type="button"
            onClick={() => onViewModeChange('MONTH')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'MONTH'
                ? 'bg-[#171512] text-[#ECE4D3] shadow-sm font-semibold border border-[#4A443A]/60'
                : 'text-[#A89F91] hover:text-[#ECE4D3]'
            }`}
          >
            เดือน
          </button>
          <button
            id="btn-view-week"
            type="button"
            onClick={() => onViewModeChange('WEEK')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'WEEK'
                ? 'bg-[#171512] text-[#ECE4D3] shadow-sm font-semibold border border-[#4A443A]/60'
                : 'text-[#A89F91] hover:text-[#ECE4D3]'
            }`}
          >
            สัปดาห์
          </button>
          <button
            id="btn-view-day"
            type="button"
            onClick={() => onViewModeChange('DAY')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'DAY'
                ? 'bg-[#171512] text-[#ECE4D3] shadow-sm font-semibold border border-[#4A443A]/60'
                : 'text-[#A89F91] hover:text-[#ECE4D3]'
            }`}
          >
            วัน / Agenda
          </button>
        </div>

        {/* Refresh Button */}
        <button
          id="btn-refresh-calendar"
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="รีเฟรช"
          className="p-2 bg-[#0E0D0C] hover:bg-[#1A1815] text-[#A89F91] hover:text-[#ECE4D3] border border-[#4A443A] rounded-lg transition-colors shrink-0"
        >
          <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
}
