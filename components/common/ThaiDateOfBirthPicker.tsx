'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

export interface ThaiDateOfBirthPickerProps {
  value?: string; // ISO date string YYYY-MM-DD or empty ''
  onChange: (isoDateStr: string) => void;
  hasError?: boolean;
  disabled?: boolean;
  theme?: 'studio' | 'dark'; // 'studio' for LoginPage/Modal, 'dark' for complete-profile
}

export const THAI_MONTHS = [
  { value: 1, label: 'มกราคม' },
  { value: 2, label: 'กุมภาพันธ์' },
  { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' },
  { value: 5, label: 'พฤษภาคม' },
  { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' },
  { value: 8, label: 'สิงหาคม' },
  { value: 9, label: 'กันยายน' },
  { value: 10, label: 'ตุลาคม' },
  { value: 11, label: 'พฤศจิกายน' },
  { value: 12, label: 'ธันวาคม' },
];

/**
 * Checks if a given Gregorian (AD) year is a leap year.
 */
export function isLeapYear(adYear: number): boolean {
  if (isNaN(adYear)) return false;
  return (adYear % 4 === 0 && adYear % 100 !== 0) || adYear % 400 === 0;
}

/**
 * Gets the maximum number of days for a given month (1-12) and Gregorian (AD) year.
 */
export function getMaxDaysInMonth(month: number, adYear: number): number {
  if (!month || month < 1 || month > 12) return 31;
  if ([1, 3, 5, 7, 8, 10, 12].includes(month)) return 31;
  if ([4, 6, 9, 11].includes(month)) return 30;
  if (month === 2) {
    return isLeapYear(adYear) ? 29 : 28;
  }
  return 31;
}

export default function ThaiDateOfBirthPicker({
  value = '',
  onChange,
  hasError = false,
  disabled = false,
  theme = 'studio',
}: ThaiDateOfBirthPickerProps) {
  // Current year in AD and BE (Thailand)
  const currentAdYear = useMemo(() => new Date().getFullYear(), []);
  const currentBeYear = useMemo(() => currentAdYear + 543, [currentAdYear]);

  // Generate Year Options in BE (พ.ศ.) from current BE year down to 120 years ago
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    const minBeYear = currentBeYear - 120;
    for (let y = currentBeYear; y >= minBeYear; y--) {
      years.push(y);
    }
    return years;
  }, [currentBeYear]);

  // Helper to parse YYYY-MM-DD
  const parseIsoValue = (isoStr?: string) => {
    if (!isoStr || typeof isoStr !== 'string') return { day: '', month: '', yearBE: '' };
    const parts = isoStr.trim().split('-');
    if (parts.length === 3) {
      const adY = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!isNaN(adY) && !isNaN(m) && !isNaN(d)) {
        return {
          day: String(d),
          month: String(m),
          yearBE: String(adY + 543),
        };
      }
    }
    return { day: '', month: '', yearBE: '' };
  };

  const initialParsed = useMemo(() => parseIsoValue(value), [value]);

  const [selectedDay, setSelectedDay] = useState<string>(initialParsed.day);
  const [selectedMonth, setSelectedMonth] = useState<string>(initialParsed.month);
  const [selectedYearBE, setSelectedYearBE] = useState<string>(initialParsed.yearBE);

  // Track last synced value prop to avoid overwriting local user selections during partial entry
  const lastSyncedValueRef = useRef<string>(value);

  useEffect(() => {
    // Only update internal state if value prop changed from outside (e.g. loaded from DB or parent cleared form)
    if (value !== lastSyncedValueRef.current) {
      lastSyncedValueRef.current = value;
      const parsed = parseIsoValue(value);
      setSelectedDay(parsed.day);
      setSelectedMonth(parsed.month);
      setSelectedYearBE(parsed.yearBE);
    }
  }, [value]);

  // Calculate max days available based on selected month and year
  const maxDays = useMemo(() => {
    const m = parseInt(selectedMonth, 10);
    const beY = parseInt(selectedYearBE, 10);
    const adY = !isNaN(beY) ? beY - 543 : currentAdYear;
    return getMaxDaysInMonth(m, adY);
  }, [selectedMonth, selectedYearBE, currentAdYear]);

  // Generate Day Options 1..maxDays
  const dayOptions = useMemo(() => {
    const days: number[] = [];
    for (let d = 1; d <= maxDays; d++) {
      days.push(d);
    }
    return days;
  }, [maxDays]);

  // Trigger onChange whenever day, month, or yearBE changes
  const updateDateState = (newDay: string, newMonth: string, newYearBE: string) => {
    setSelectedDay(newDay);
    setSelectedMonth(newMonth);
    setSelectedYearBE(newYearBE);

    if (!newDay || !newMonth || !newYearBE) {
      lastSyncedValueRef.current = '';
      onChange('');
      return;
    }

    const d = parseInt(newDay, 10);
    const m = parseInt(newMonth, 10);
    const beY = parseInt(newYearBE, 10);

    if (isNaN(d) || isNaN(m) || isNaN(beY)) {
      lastSyncedValueRef.current = '';
      onChange('');
      return;
    }

    const adY = beY - 543;
    const currentMax = getMaxDaysInMonth(m, adY);
    const validDay = Math.min(d, currentMax);

    const isoStr = `${adY}-${String(m).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
    lastSyncedValueRef.current = isoStr;
    onChange(isoStr);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateDateState(e.target.value, selectedMonth, selectedYearBE);
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    if (!newMonth) {
      updateDateState(selectedDay, '', selectedYearBE);
      return;
    }

    const m = parseInt(newMonth, 10);
    const beY = parseInt(selectedYearBE, 10);
    const adY = !isNaN(beY) ? beY - 543 : currentAdYear;
    const newMaxDays = getMaxDaysInMonth(m, adY);

    let newDay = selectedDay;
    if (selectedDay && parseInt(selectedDay, 10) > newMaxDays) {
      newDay = String(newMaxDays);
    }

    updateDateState(newDay, newMonth, selectedYearBE);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYearBE = e.target.value;
    if (!newYearBE) {
      updateDateState(selectedDay, selectedMonth, '');
      return;
    }

    const beY = parseInt(newYearBE, 10);
    const m = parseInt(selectedMonth, 10);
    const adY = !isNaN(beY) ? beY - 543 : currentAdYear;
    const newMaxDays = getMaxDaysInMonth(m, adY);

    let newDay = selectedDay;
    if (selectedDay && parseInt(selectedDay, 10) > newMaxDays) {
      newDay = String(newMaxDays);
    }

    // Notice: selectedMonth is strictly PRESERVED!
    updateDateState(newDay, selectedMonth, newYearBE);
  };

  // Styling based on theme
  const selectBaseClass = theme === 'dark'
    ? `h-11 bg-[#0E0D0C] text-[#ECE4D3] border ${
        hasError ? 'border-[#9C2F2F]' : 'border-[#4A443A]'
      } hover:border-[#7A7265] focus:border-[#9C2F2F] rounded-[6px] text-xs outline-none transition-colors px-2 cursor-pointer`
    : `min-h-[50px] bg-studio-main text-studio-primary border ${
        hasError ? 'border-studio-red' : 'border-studio-border'
      } focus:border-studio-red rounded-[4px] text-xs sm:text-sm outline-none transition-colors px-2.5 cursor-pointer`;

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* 1. Day Dropdown */}
      <select
        value={selectedDay}
        onChange={handleDayChange}
        disabled={disabled}
        className={selectBaseClass}
        aria-label="วันเกิด"
      >
        <option value="">วัน</option>
        {dayOptions.map((d) => (
          <option key={d} value={String(d)}>
            {d}
          </option>
        ))}
      </select>

      {/* 2. Month Dropdown */}
      <select
        value={selectedMonth}
        onChange={handleMonthChange}
        disabled={disabled}
        className={selectBaseClass}
        aria-label="เดือนเกิด"
      >
        <option value="">เดือน</option>
        {THAI_MONTHS.map((m) => (
          <option key={m.value} value={String(m.value)}>
            {m.label}
          </option>
        ))}
      </select>

      {/* 3. Year BE Dropdown */}
      <select
        value={selectedYearBE}
        onChange={handleYearChange}
        disabled={disabled}
        className={selectBaseClass}
        aria-label="ปีเกิด พ.ศ."
      >
        <option value="">ปี (พ.ศ.)</option>
        {yearOptions.map((y) => (
          <option key={y} value={String(y)}>
            พ.ศ. {y}
          </option>
        ))}
      </select>
    </div>
  );
}
