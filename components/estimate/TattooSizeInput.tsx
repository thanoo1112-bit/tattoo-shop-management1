'use client';

import React from 'react';
import { Ruler } from 'lucide-react';

interface TattooSizeInputProps {
  width: number;
  height: number;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number) => void;
}

const ROW1_PRESETS = [
  { label: 'มินิมอล (5×5)', w: 5, h: 5 },
  { label: 'การ์ด (8×10)', w: 8, h: 10 },
  { label: 'ฝ่ามือ (10×15)', w: 10, h: 15 },
  { label: 'ครึ่งแขน (15×25)', w: 15, h: 25 },
];

const ROW2_PRESETS = [
  { label: 'เต็มแขน (20×45)', w: 20, h: 45 },
  { label: 'ครึ่งหลัง (30×40)', w: 30, h: 40 },
  { label: 'เต็มหลัง (40×60)', w: 40, h: 60 },
];

export default function TattooSizeInput({
  width,
  height,
  onWidthChange,
  onHeightChange,
}: TattooSizeInputProps) {
  return (
    <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] flex flex-col space-y-3 font-prompt">
      <div className="flex items-center space-x-1.5 mb-0.5">
        <Ruler size={14} className="text-studio-red" />
        <span className="text-[11px] uppercase tracking-wider text-studio-muted font-semibold">
          ขนาดของรอยสักโดยประมาณ (Width × Height)
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Width */}
        <div>
          <label className="text-[11px] text-studio-secondary block mb-1 font-medium">ความกว้าง (ซม.)</label>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={100}
            value={width || ''}
            onChange={(e) => onWidthChange(Number(e.target.value))}
            placeholder="เช่น 10"
            className="w-full min-h-[46px] bg-studio-card border border-studio-border focus:border-studio-red text-sm text-studio-primary px-3.5 py-2.5 outline-none rounded-[4px] transition-colors"
            required
          />
        </div>

        {/* Height */}
        <div>
          <label className="text-[11px] text-studio-secondary block mb-1 font-medium">ความสูง (ซม.)</label>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            max={100}
            value={height || ''}
            onChange={(e) => onHeightChange(Number(e.target.value))}
            placeholder="เช่น 10"
            className="w-full min-h-[46px] bg-studio-card border border-studio-border focus:border-studio-red text-sm text-studio-primary px-3.5 py-2.5 outline-none rounded-[4px] transition-colors"
            required
          />
        </div>
      </div>

      {/* Preset Quick Chips */}
      <div className="pt-2 border-t border-studio-border/60">
        <span className="text-[10px] text-studio-muted block mb-1.5 font-medium">ขนาดยอดนิยม:</span>
        <div className="flex flex-col space-y-1.5">
          {/* Row 1: 4 presets (Mobile: 2 + 2, Desktop: 4) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {ROW1_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onWidthChange(preset.w);
                  onHeightChange(preset.h);
                }}
                className={`text-[10px] bg-studio-card border hover:border-studio-red/60 px-2 sm:px-2.5 py-1.5 rounded-[3px] transition-colors text-center leading-tight select-none whitespace-nowrap ${
                  width === preset.w && height === preset.h
                    ? 'border-studio-red text-studio-primary font-semibold'
                    : 'border-studio-border text-studio-secondary hover:text-studio-primary font-medium'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Row 2: 3 presets (Mobile: 3, Desktop: 3 -> Total Mobile Pattern 2 + 2 + 3) */}
          <div className="grid grid-cols-3 gap-1.5">
            {ROW2_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onWidthChange(preset.w);
                  onHeightChange(preset.h);
                }}
                className={`text-[9px] xs:text-[10px] bg-studio-card border hover:border-studio-red/60 px-1 sm:px-2.5 py-1.5 rounded-[3px] transition-colors text-center leading-tight select-none whitespace-nowrap ${
                  width === preset.w && height === preset.h
                    ? 'border-studio-red text-studio-primary font-semibold'
                    : 'border-studio-border text-studio-secondary hover:text-studio-primary font-medium'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
