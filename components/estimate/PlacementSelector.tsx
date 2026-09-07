'use client';

import React, { useState, useEffect, useRef } from 'react';

interface PlacementSelectorProps {
  value: string;
  onChange: (placement: string) => void;
}

const STANDARD_OPTIONS = [
  'แขน (Arm)',
  'ท่อนแขน (Forearm)',
  'ต้นแขน (Upper Arm)',
  'หน้าอก (Chest)',
  'หลัง (Back)',
  'ต้นขา (Thigh)',
  'น่อง (Calf)',
];

export default function PlacementSelector({ value, onChange }: PlacementSelectorProps) {
  const isStandard = STANDARD_OPTIONS.includes(value);
  const [isOtherSelected, setIsOtherSelected] = useState(!isStandard && value !== '');
  const [customText, setCustomText] = useState(!isStandard ? value : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (STANDARD_OPTIONS.includes(value)) {
      setIsOtherSelected(false);
    } else if (value && value.trim() !== '') {
      setIsOtherSelected(true);
      setCustomText(value);
    }
  }, [value]);

  const handleSelectStandard = (option: string) => {
    setIsOtherSelected(false);
    onChange(option);
  };

  const handleActivateOther = (text?: string) => {
    setIsOtherSelected(true);
    const activeText = text !== undefined ? text : customText;
    onChange(activeText.trim());
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleCustomTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setCustomText(newText);
    setIsOtherSelected(true);
    onChange(newText.trim());
  };

  return (
    <div className="bg-studio-main border border-studio-border p-3 sm:p-4 rounded-[6px] flex flex-col space-y-2.5 font-prompt w-full">
      <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-studio-muted font-semibold block">
        ตำแหน่งที่จะสัก (Tattoo Placement)
      </span>

      <div className="grid grid-cols-2 gap-2">
        {STANDARD_OPTIONS.map((option) => {
          const isSelected = !isOtherSelected && value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleSelectStandard(option)}
              className={`min-h-[42px] px-2.5 py-2 text-xs text-left transition-all duration-200 rounded-[4px] border flex items-center justify-between min-w-0 active:scale-[0.98] ${
                isSelected
                  ? 'bg-studio-sec border-studio-red text-studio-paper font-semibold shadow-inner'
                  : 'bg-studio-card border-studio-border text-studio-secondary hover:border-studio-red/60 hover:text-studio-primary'
              }`}
            >
              <span className="truncate pr-1 text-[11px] sm:text-xs">{option}</span>
              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-studio-red shrink-0" />}
            </button>
          );
        })}

        {/* Inline "อื่น ๆ (Others): [______]" Card */}
        <div
          onClick={() => handleActivateOther()}
          className={`min-h-[42px] px-2 sm:px-2.5 py-1.5 text-xs text-left transition-all duration-200 rounded-[4px] border flex items-center gap-1 sm:gap-1.5 min-w-0 cursor-pointer active:scale-[0.99] ${
            isOtherSelected
              ? 'bg-studio-sec border-studio-red text-studio-paper font-semibold shadow-inner'
              : 'bg-studio-card border-studio-border text-studio-secondary hover:border-studio-red/60 hover:text-studio-primary'
          }`}
        >
          <span className="shrink-0 text-[10.5px] sm:text-xs whitespace-nowrap font-medium">อื่น ๆ (Others):</span>
          <input
            ref={inputRef}
            type="text"
            value={customText}
            onClick={(e) => {
              e.stopPropagation();
              handleActivateOther();
            }}
            onFocus={() => handleActivateOther()}
            onChange={handleCustomTextChange}
            placeholder=""
            className="min-w-0 flex-1 bg-studio-main border border-studio-border focus:border-studio-red text-[11px] sm:text-xs text-studio-primary px-1.5 py-1 outline-none rounded-[3px] placeholder:text-studio-muted font-normal transition-colors"
          />
          {isOtherSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-studio-red shrink-0" />
          )}
        </div>
      </div>
    </div>
  );
}
