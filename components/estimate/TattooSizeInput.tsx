'use client';

import React from 'react';
import { Ruler } from 'lucide-react';

interface TattooSizeInputProps {
  width: number;
  height: number;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number) => void;
}

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
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'มินิมอล (5×5)', w: 5, h: 5 },
            { label: 'การ์ด (8×10)', w: 8, h: 10 },
            { label: 'ฝ่ามือ (10×15)', w: 10, h: 15 },
            { label: 'ครึ่งแขน (15×25)', w: 15, h: 25 },
          ].map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onWidthChange(preset.w);
                onHeightChange(preset.h);
              }}
              className="text-[10px] bg-studio-card border border-studio-border hover:border-studio-red/60 text-studio-secondary hover:text-studio-primary px-2.5 py-1 rounded-[3px] transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
