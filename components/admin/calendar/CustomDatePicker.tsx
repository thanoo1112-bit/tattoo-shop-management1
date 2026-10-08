'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { THAI_MONTHS_FULL, getTodayBangkokStr } from './calendarUtils';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const THAI_DAYS_HEADER = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

/**
 * Format YYYY-MM-DD to dd/MM/yyyy for display
 */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return 'เลือกวันที่';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export default function CustomDatePicker({
  value,
  onChange,
  disabled = false,
  className = '',
  id = 'custom-date-picker',
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse YYYY-MM-DD to viewYear & viewMonth
  const todayStr = getTodayBangkokStr();
  const initialDateStr = value || todayStr;
  
  const parseDateStr = (str: string) => {
    const parts = str.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      if (!isNaN(year) && !isNaN(month)) {
        return { year, month };
      }
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  };

  const { year: initYear, month: initMonth } = parseDateStr(initialDateStr);
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);

  // Sync view month/year when value changes
  useEffect(() => {
    if (value) {
      const { year, month } = parseDateStr(value);
      setViewYear(year);
      setViewMonth(month);
    }
  }, [value]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  // Calculate calendar grid days for ONLY the current month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  
  // Day of the week for day 1 (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const firstDayObj = new Date(viewYear, viewMonth, 1);
  const jsDay = firstDayObj.getDay();
  // Convert to Monday-first index: 0 = Mon, 1 = Tue, ..., 6 = Sun
  const leadingOffset = jsDay === 0 ? 6 : jsDay - 1;

  // Total cells in 7-column grid
  const totalCellsSoFar = leadingOffset + daysInMonth;
  const remainder = totalCellsSoFar % 7;
  const trailingOffset = remainder === 0 ? 0 : 7 - remainder;

  const handleSelectDay = (dayNum: number) => {
    const mStr = String(viewMonth + 1).padStart(2, '0');
    const dStr = String(dayNum).padStart(2, '0');
    const selectedDate = `${viewYear}-${mStr}-${dStr}`;
    onChange(selectedDate);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input Display Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-[#0E0D0C] border border-[#4A443A] hover:border-amber-400 focus:border-amber-400 rounded-lg px-3 py-2 text-xs text-[#ECE4D3] flex items-center justify-between transition-colors cursor-pointer ${
          isOpen ? 'border-amber-400 ring-1 ring-amber-400/30' : ''
        } ${className}`}
      >
        <span className="font-mono text-xs">{formatDisplayDate(value)}</span>
        <CalendarIcon size={14} className="text-amber-400 shrink-0" />
      </button>

      {/* Calendar Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-[#171512] border border-[#4A443A] rounded-xl p-3 shadow-2xl w-64 text-xs animate-fadeIn font-prompt">
          {/* Header: Month & Year Controls */}
          <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-[#4A443A]/60">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#26231F] rounded transition-colors"
              title="เดือนก่อนหน้า"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-semibold text-[#ECE4D3] text-xs">
              {THAI_MONTHS_FULL[viewMonth]} {viewYear + 543} ({viewYear})
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#26231F] rounded transition-colors"
              title="เดือนถัดไป"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {THAI_DAYS_HEADER.map((dayName, idx) => (
              <span
                key={dayName}
                className={`text-[10px] font-semibold py-0.5 ${
                  idx >= 5 ? 'text-amber-400/80' : 'text-[#A89F91]'
                }`}
              >
                {dayName}
              </span>
            ))}
          </div>

          {/* Calendar Grid (Days of Current Month ONLY) */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* 1. Leading Empty Cells (Hidden/No outside month dates) */}
            {Array.from({ length: leadingOffset }).map((_, idx) => (
              <div key={`leading-${idx}`} className="h-7 w-7" />
            ))}

            {/* 2. Days of Current Month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const mStr = String(viewMonth + 1).padStart(2, '0');
              const dStr = String(dayNum).padStart(2, '0');
              const currentCellDate = `${viewYear}-${mStr}-${dStr}`;

              const isSelected = currentCellDate === value;
              const isToday = currentCellDate === todayStr;

              return (
                <button
                  key={`day-${dayNum}`}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={`h-7 w-7 rounded-md text-xs font-medium transition-all flex items-center justify-center cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-stone-950 font-bold shadow-md shadow-amber-500/30'
                      : isToday
                      ? 'bg-[#26231F] text-amber-400 border border-amber-500/50 font-semibold'
                      : 'text-[#ECE4D3] hover:bg-[#26231F] hover:text-white'
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}

            {/* 3. Trailing Empty Cells (Hidden/No outside month dates) */}
            {Array.from({ length: trailingOffset }).map((_, idx) => (
              <div key={`trailing-${idx}`} className="h-7 w-7" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
