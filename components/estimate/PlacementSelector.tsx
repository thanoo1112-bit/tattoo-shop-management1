'use client';

import React, { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';

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
      {/* Flexible Tag-Style Buttons matching Style Selector */}
      <div className="flex flex-wrap gap-2">
        {PLACEMENT_OPTIONS.map((option) => {
          const isSelected = selectedPlacement === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`px-3 py-1.5 rounded-[4px] text-xs transition-all border select-none cursor-pointer ${
                isSelected
                  ? 'bg-studio-red border-studio-red text-white font-semibold shadow-md'
                  : 'bg-studio-main border-studio-border text-[#F2EEE8] hover:border-studio-border/80'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Conditional Custom Description Input when "อื่น ๆ" is selected */}
      {isOtherSelected && (
        <div className="relative w-full animate-fadeIn">
          <Pencil size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B8B0A3] pointer-events-none" />
          <input
            type="text"
            value={otherText}
            onChange={(e) => handleOtherTextChange(e.target.value)}
            placeholder="ระบุตำแหน่งอื่น ๆ เพิ่มเติม เช่น ท่อนแขนด้านใน, หลังใบหู, ข้อศอก..."
            className="w-full min-h-[44px] bg-studio-main border border-studio-border focus:border-studio-red text-xs sm:text-sm text-studio-primary pl-10 pr-4 py-2.5 outline-none rounded-[4px] transition-colors placeholder:text-[#B8B0A3] font-prompt"
          />
        </div>
      )}

      {/* Helper text */}
      <div className="pt-0.5">
        <p className="text-[10.5px] text-amber-400 font-medium leading-relaxed">
          * ร้านไม่รับสักบริเวณขอบตาและจุดลับ
        </p>
      </div>
    </div>
  );
}
