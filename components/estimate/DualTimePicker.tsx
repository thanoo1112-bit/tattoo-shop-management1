'use client';

import React, { useState, useEffect } from 'react';

interface DualTimePickerProps {
  value: string; // Formatted "HH:mm" or ""
  onChange: (timeStr: string) => void;
  disabled?: boolean;
  isTimeDisabled?: (timeStr: string) => boolean;
}

export const HOUR_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const h = (10 + i).toString().padStart(2, '0');
  return { value: h, label: h };
});

export const MINUTE_OPTIONS = [
  { value: '00', label: '00' },
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '30', label: '30' },
  { value: '40', label: '40' },
  { value: '50', label: '50' },
];

export default function DualTimePicker({
  value,
  onChange,
  disabled = false,
  isTimeDisabled,
}: DualTimePickerProps) {
  const parseValue = (val: string) => {
    if (!val || !val.includes(':')) return { hour: '10', minute: '00' };
    const [h, m] = val.split(':');
    return { hour: h || '10', minute: m || '00' };
  };

  const [hour, setHour] = useState<string>(() => parseValue(value).hour);
  const [minute, setMinute] = useState<string>(() => parseValue(value).minute);

  useEffect(() => {
    const { hour: h, minute: m } = parseValue(value);
    setHour(h);
    setMinute(m);
  }, [value]);

  const checkTimeDisabled = (hStr: string, mStr: string) => {
    if (!isTimeDisabled) return false;
    return isTimeDisabled(`${hStr}:${mStr}`);
  };

  const handleHourChange = (newHour: string) => {
    setHour(newHour);
    if (!newHour) {
      onChange('');
      return;
    }

    let targetMin = minute || '00';
    if (checkTimeDisabled(newHour, targetMin)) {
      const firstValid = MINUTE_OPTIONS.find((mOpt) => !checkTimeDisabled(newHour, mOpt.value));
      if (firstValid) {
        targetMin = firstValid.value;
        setMinute(targetMin);
      }
    }
    onChange(`${newHour}:${targetMin}`);
  };

  const handleMinuteChange = (newMinute: string) => {
    setMinute(newMinute);
    if (hour && newMinute) {
      onChange(`${hour}:${newMinute}`);
    } else {
      onChange('');
    }
  };

  return (
    <div className="w-full font-prompt">
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Hour Select Dropdown */}
        <div className="flex-1 relative">
          <select
            value={hour}
            disabled={disabled}
            onChange={(e) => handleHourChange(e.target.value)}
            className="w-full min-h-[44px] bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] pl-3 pr-7 py-2 outline-none rounded-[4px] cursor-pointer font-prompt appearance-none [color-scheme:dark] disabled:opacity-50 transition-colors"
          >
            <option value="" className="bg-[#171512] text-[#A89F91]">
              ชั่วโมง
            </option>
            {HOUR_OPTIONS.map((opt) => {
              const isFullyDisabled = isTimeDisabled
                ? MINUTE_OPTIONS.every((mOpt) => isTimeDisabled(`${opt.value}:${mOpt.value}`))
                : false;
              return (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={isFullyDisabled}
                  className={isFullyDisabled ? 'bg-[#171512] text-[#666666] opacity-40' : 'bg-[#171512] text-[#ECE4D3]'}
                >
                  {opt.label}{isFullyDisabled ? ' (ไม่ว่าง)' : ''}
                </option>
              );
            })}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#A89F91]">
            ▼
          </div>
        </div>

        {/* Colon Separator */}
        <span className="text-[#ECE4D3] font-bold text-sm shrink-0 px-0.5">:</span>

        {/* Minute Select Dropdown */}
        <div className="flex-1 relative">
          <select
            value={minute}
            disabled={disabled}
            onChange={(e) => handleMinuteChange(e.target.value)}
            className="w-full min-h-[44px] bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs text-[#ECE4D3] pl-3 pr-7 py-2 outline-none rounded-[4px] cursor-pointer font-prompt appearance-none [color-scheme:dark] disabled:opacity-50 transition-colors"
          >
            <option value="" className="bg-[#171512] text-[#A89F91]">
              นาที
            </option>
            {MINUTE_OPTIONS.map((opt) => {
              const isDisabled = hour ? checkTimeDisabled(hour, opt.value) : false;
              return (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={isDisabled}
                  className={isDisabled ? 'bg-[#171512] text-[#666666] opacity-40' : 'bg-[#171512] text-[#ECE4D3]'}
                >
                  {opt.label}{isDisabled ? ' (ไม่ว่าง)' : ''}
                </option>
              );
            })}
          </select>
          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#A89F91]">
            ▼
          </div>
        </div>
      </div>
    </div>
  );
}
