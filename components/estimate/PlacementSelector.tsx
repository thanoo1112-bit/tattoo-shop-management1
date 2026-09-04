'use client';

import React from 'react';

interface PlacementSelectorProps {
  value: string;
  onChange: (placement: string) => void;
}

export default function PlacementSelector({ value, onChange }: PlacementSelectorProps) {
  const options = [
    'แขน (Arm)',
    'ท่อนแขน (Forearm)',
    'ต้นแขน (Upper Arm)',
    'หน้าอก (Chest)',
    'หลัง (Back)',
    'ต้นขา (Thigh)',
    'น่อง (Calf)',
    'อื่น ๆ (Others)',
  ];

  return (
    <div className="bg-studio-main border border-studio-border p-3 sm:p-4 rounded-[6px] flex flex-col space-y-2.5 font-prompt w-full">
      <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-studio-muted font-semibold block">
        ตำแหน่งที่จะสัก (Tattoo Placement)
      </span>

      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const isSelected = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
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
      </div>
    </div>
  );
}
