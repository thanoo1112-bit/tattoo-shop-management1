'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock, X, Check } from 'lucide-react';

interface TimePickerPopoverProps {
  value: string; // "HH:MM" e.g. "13:30" or ""
  onChange: (time: string) => void;
  label?: string;
  disabled?: boolean;
}

const ALLOWED_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const ALL_MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export default function TimePickerPopover({
  value,
  onChange,
  label = 'เวลาที่สะดวก',
  disabled = false,
}: TimePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse hour and minute from value "HH:MM"
  const parseTime = (timeStr: string) => {
    if (!timeStr || !timeStr.includes(':')) {
      return { hour: 10, minute: '00' };
    }
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const validH = ALLOWED_HOURS.includes(h) ? h : 10;
    const mInt = parseInt(mStr, 10);
    const validMInt = isNaN(mInt) || mInt < 0 || mInt > 59 ? 0 : mInt;
    // Special rule for hour 23: max minute is 00
    const finalM = validH === 23 ? '00' : validMInt.toString().padStart(2, '0');
    return { hour: validH, minute: finalM };
  };

  const { hour: selectedHour, minute: selectedMinute } = parseTime(value);

  // Close popover on click outside
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

  // Close popover on ESC key
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

  const handleSelectHour = (h: number) => {
    let newM = selectedMinute;
    if (h === 23 && newM !== '00') {
      newM = '00';
    }
    const timeStr = `${h.toString().padStart(2, '0')}:${newM}`;
    onChange(timeStr);
  };

  const handleSelectMinute = (m: string) => {
    if (selectedHour === 23 && m !== '00') return;
    const timeStr = `${selectedHour.toString().padStart(2, '0')}:${m}`;
    onChange(timeStr);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  // Formatted display text for trigger button
  const displayFormatted = value && value.trim() ? `${value.trim()} น.` : '--:--';

  return (
    <div ref={containerRef} className="relative w-full font-prompt">
      {/* Label */}
      {label && (
        <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center gap-1">
          <Clock size={12} className="text-studio-red shrink-0" />
          <span className="truncate">{label}</span>
        </label>
      )}

      {/* Trigger Button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => !disabled && (e.key === 'Enter' || e.key === ' ') && setIsOpen(!isOpen)}
        className={`
          w-full min-h-[44px] bg-[#0E0D0C] border rounded-[4px] px-3 py-2
          flex items-center justify-between cursor-pointer select-none transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed border-[#332E27]' : 'hover:border-[#9C2F2F] focus:outline-none'}
          ${isOpen ? 'border-[#9C2F2F] ring-1 ring-[#9C2F2F]' : 'border-[#4A443A]'}
        `}
      >
        <span className={`text-xs font-mono font-medium ${value ? 'text-[#ECE4D3]' : 'text-[#A89F91]'}`}>
          {displayFormatted}
        </span>

        <div className="flex items-center gap-1.5">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="w-5 h-5 rounded-full hover:bg-[#9C2F2F]/30 text-[#A89F91] hover:text-[#ECE4D3] flex items-center justify-center transition-colors"
              title="ล้างเวลา"
            >
              <X size={12} />
            </button>
          )}
          <Clock size={14} className="text-[#A89F91] shrink-0" />
        </div>
      </div>

      {/* Popover Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute right-0 top-full mt-1 z-50 w-[270px] bg-[#171512] border border-[#4A443A] rounded-[6px] p-3 shadow-2xl font-prompt animate-fadeIn">
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-2 border-b border-[#332E27] mb-2">
            <span className="text-[11px] text-[#A89F91] font-medium">
              เลือกเวลาระหว่าง 10:00–23:00 น.
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-[#A89F91] hover:text-[#ECE4D3] p-1 rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Time Selector Grid (2 Columns: Hour | Minute) */}
          <div className="grid grid-cols-2 gap-2">
            {/* Column 1: Hour (10 - 23) */}
            <div>
              <span className="text-[10px] uppercase font-bold text-[#A89F91] block mb-1 text-center">
                ชั่วโมง
              </span>
              <div className="h-44 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                {ALLOWED_HOURS.map((h) => {
                  const isSelected = selectedHour === h && Boolean(value);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleSelectHour(h)}
                      className={`
                        w-full py-1.5 px-2 rounded text-xs font-mono text-center transition-colors flex items-center justify-between
                        ${isSelected
                          ? 'bg-[#9C2F2F] text-white font-bold'
                          : 'bg-[#0E0D0C] text-[#ECE4D3] hover:bg-[#26221D] border border-[#332E27]'
                        }
                      `}
                    >
                      <span className="w-full text-center">{h.toString().padStart(2, '0')}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Minute (00 - 59) */}
            <div>
              <span className="text-[10px] uppercase font-bold text-[#A89F91] block mb-1 text-center">
                นาที
              </span>
              <div className="h-44 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                {ALL_MINUTES.map((m) => {
                  const isDisabledMinute = selectedHour === 23 && m !== '00';
                  const isSelected = selectedMinute === m && Boolean(value);

                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={isDisabledMinute}
                      onClick={() => handleSelectMinute(m)}
                      className={`
                        w-full py-1.5 px-2 rounded text-xs font-mono text-center transition-colors flex items-center justify-between
                        ${isDisabledMinute
                          ? 'opacity-25 bg-[#0E0D0C] text-[#555] cursor-not-allowed border border-transparent'
                          : isSelected
                          ? 'bg-[#9C2F2F] text-white font-bold'
                          : 'bg-[#0E0D0C] text-[#ECE4D3] hover:bg-[#26221D] border border-[#332E27]'
                        }
                      `}
                    >
                      <span className="w-full text-center">{m}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Minute Shortcuts */}
          {selectedHour !== 23 && (
            <div className="pt-2.5 mt-2 border-t border-[#332E27] flex items-center justify-between gap-1">
              <span className="text-[10px] text-[#A89F91]">นาทีพบบ่อย:</span>
              <div className="flex gap-1">
                {['00', '15', '30', '45'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSelectMinute(m)}
                    className={`
                      px-2 py-0.5 rounded text-[10px] font-mono transition-colors border
                      ${selectedMinute === m && Boolean(value)
                        ? 'bg-[#9C2F2F] text-white border-[#9C2F2F]'
                        : 'bg-[#0E0D0C] text-[#ECE4D3] border-[#332E27] hover:border-[#9C2F2F]'
                      }
                    `}
                  >
                    :{m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="pt-2 mt-2 border-t border-[#332E27] flex items-center justify-between">
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] text-[#A89F91] hover:text-[#ECE4D3] underline transition-colors"
            >
              ไม่ระบุเวลา
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="bg-[#9C2F2F] hover:bg-[#b53737] text-white text-[11px] font-medium px-3 py-1 rounded transition-colors flex items-center gap-1"
            >
              <Check size={12} />
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
