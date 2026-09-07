'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Calendar, X } from 'lucide-react';
import BookingCalendar, { BusyRange } from './BookingCalendar';
import { formatDateBangkok } from '../admin/calendar/calendarUtils';

interface DatePickerPopoverProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  artistId?: string;
  artistWorkingDays?: string[];
  busyRanges?: BusyRange[];
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function DatePickerPopover({
  value,
  onChange,
  artistId,
  artistWorkingDays,
  busyRanges = [],
  placeholder = 'เลือกวันที่สะดวก (วว/ดด/ปปปป)',
  label,
  required = false,
  disabled = false,
}: DatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Format date for display in the field
  const formattedDisplayDate = React.useMemo(() => {
    if (!value) return '';
    try {
      const parts = value.split('-');
      if (parts.length === 3) {
        const [y, m, d] = parts;
        return `${d}/${m}/${y}`; // 09/09/2026 format
      }
    } catch (_) {}
    return value;
  }, [value]);

  return (
    <div ref={containerRef} className="relative w-full font-prompt">
      {label && (
        <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center gap-1.5">
          <Calendar size={13} className="text-studio-red" />
          <span>{label}</span>
          {required && <span className="text-studio-red">*</span>}
        </label>
      )}

      {/* Compact Date Input Field Trigger */}
      <div className="relative w-full">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          disabled={disabled}
          className={`w-full min-h-[44px] bg-[#171512] border text-xs px-3.5 py-2.5 rounded-[4px] flex items-center justify-between transition-colors text-left cursor-pointer ${
            isOpen
              ? 'border-studio-red ring-1 ring-studio-red/40'
              : 'border-[#4A443A] hover:border-amber-500/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className={value ? 'text-[#ECE4D3] font-mono font-semibold' : 'text-[#7A7265]'}>
            {value ? formattedDisplayDate : placeholder}
          </span>

          <div className="flex items-center space-x-2 text-[#A89F91] shrink-0">
            {value && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                  setIsOpen(false);
                }}
                className="p-1 hover:text-studio-red rounded cursor-pointer text-xs"
                title="ล้างวันที่เลือก"
              >
                <X size={13} />
              </span>
            )}
            <Calendar size={15} className="text-studio-red" />
          </div>
        </button>

        {/* Compact Calendar Popover Dropdown */}
        {isOpen && (
          <div className="absolute z-50 bottom-full mb-1.5 left-0 w-[280px] max-w-[calc(100vw-2rem)] animate-fadeIn shadow-2xl">
            <BookingCalendar
              selectedDate={value}
              onDateSelect={(dateStr) => {
                onChange(dateStr);
                setIsOpen(false);
              }}
              artistId={artistId}
              artistWorkingDays={artistWorkingDays}
              busyRanges={busyRanges}
            />
          </div>
        )}
      </div>
    </div>
  );
}
