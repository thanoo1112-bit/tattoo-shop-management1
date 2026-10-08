'use client';

import React, { useState, useEffect } from 'react';
import { Check, Pencil } from 'lucide-react';

interface PlacementSelectorProps {
  value: string;
  onChange: (placement: string) => void;
}

export const PLACEMENT_OPTIONS = [
  'แขนซ้าย',
  'แขนขวา',
  'ข้อมือ',
  'มือ / นิ้ว',
  'หัวไหล่',
  'หน้าอก',
  'หน้าท้อง',
  'หลัง',
  'คอ',
  'เอว / สีข้าง',
  'ต้นขาซ้าย',
  'ต้นขาขวา',
  'น่องซ้าย',
  'น่องขวา',
  'ข้อเท้า / เท้า',
  'อื่น ๆ',
];

export default function PlacementSelector({ value, onChange }: PlacementSelectorProps) {
  // Parse incoming value string into selected single option & custom other text
  const parseValue = (raw: string) => {
    if (!raw || !raw.trim()) {
      return { selected: '', otherText: '' };
    }

    const trimmed = raw.trim();
    const standardSet = new Set(PLACEMENT_OPTIONS.filter((o) => o !== 'อื่น ๆ'));

    if (standardSet.has(trimmed)) {
      return { selected: trimmed, otherText: '' };
    } else if (trimmed.startsWith('อื่น ๆ:') || trimmed.startsWith('อื่น ๆ (')) {
      const text = trimmed.replace(/^อื่น ๆ:\s*/, '').replace(/^อื่น ๆ\s*\((.*)\)$/, '$1').trim();
      return { selected: 'อื่น ๆ', otherText: text };
    } else if (trimmed === 'อื่น ๆ') {
      return { selected: 'อื่น ๆ', otherText: '' };
    } else {
      const firstPart = trimmed.split(',')[0].trim();
      if (standardSet.has(firstPart)) {
        return { selected: firstPart, otherText: '' };
      }
      return { selected: 'อื่น ๆ', otherText: trimmed };
    }
  };

  const [selectedPlacement, setSelectedPlacement] = useState<string>(() => parseValue(value).selected);
  const [otherText, setOtherText] = useState<string>(() => parseValue(value).otherText);

  // Sync state if external value changes (e.g. form reset or draft load)
  useEffect(() => {
    const { selected, otherText: parsedOther } = parseValue(value);
    setSelectedPlacement(selected);
    setOtherText(parsedOther);
  }, [value]);

  // Helper to emit changes back to parent
  const emitChange = (option: string, text: string) => {
    if (!option) {
      onChange('');
    } else if (option === 'อื่น ๆ') {
      if (text.trim()) {
        onChange(`อื่น ๆ: ${text.trim()}`);
      } else {
        onChange('อื่น ๆ');
      }
    } else {
      onChange(option);
    }
  };

  const handleSelect = (option: string) => {
    let nextSelected: string;
    if (selectedPlacement === option) {
      nextSelected = '';
    } else {
      nextSelected = option;
    }
    setSelectedPlacement(nextSelected);
    emitChange(nextSelected, otherText);
  };

  const handleOtherTextChange = (text: string) => {
    setOtherText(text);
    emitChange(selectedPlacement, text);
  };

  const isOtherSelected = selectedPlacement === 'อื่น ๆ';

  return (
    <div className="w-full space-y-3 font-prompt">
      {/* Responsive Checkbox Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5">
        {PLACEMENT_OPTIONS.map((option) => {
          const isSelected = selectedPlacement === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`min-h-[44px] px-3 py-2.5 rounded-[4px] border text-left flex items-center space-x-2.5 transition-all duration-200 select-none ${
                isSelected
                  ? 'bg-studio-red/10 border-studio-red text-studio-primary shadow-sm font-semibold'
                  : 'bg-studio-main border-studio-border/70 text-studio-secondary hover:border-studio-red/50 hover:text-studio-primary'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-[3px] flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-studio-red border border-studio-red text-white'
                    : 'border border-studio-border bg-studio-card'
                }`}
              >
                {isSelected && <Check size={12} strokeWidth={3} />}
              </div>
              <span className="text-xs leading-tight">{option}</span>
            </button>
          );
        })}
      </div>

      {/* Conditional Custom Description Input when "อื่น ๆ" is selected */}
      {isOtherSelected && (
        <div className="relative w-full animate-fadeIn">
          <Pencil size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-studio-muted pointer-events-none" />
          <input
            type="text"
            value={otherText}
            onChange={(e) => handleOtherTextChange(e.target.value)}
            placeholder="ระบุตำแหน่งอื่น ๆ เพิ่มเติม เช่น ท่อนแขนด้านใน, หลังใบหู, ข้อศอก..."
            className="w-full min-h-[44px] bg-studio-main border border-studio-border focus:border-studio-red text-xs sm:text-sm text-studio-primary pl-10 pr-4 py-2.5 outline-none rounded-[4px] transition-colors placeholder:text-studio-muted font-prompt"
          />
        </div>
      )}

      {/* Helper text */}
      <div className="space-y-0.5 pt-0.5">
        <p className="text-[11px] text-studio-secondary font-light leading-relaxed">
          เลือกตำแหน่งที่ต้องการสัก
        </p>
        <p className="text-[10.5px] text-[#7A7265] font-light leading-relaxed">
          * ร้านไม่รับสักบริเวณใบหน้าและจุดลับ
        </p>
      </div>
    </div>
  );
}
