'use client';

import React from 'react';
import { Ruler } from 'lucide-react';

interface TattooSizeInputProps {
  width: number;
  height: number;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number) => void;
}

export interface PopularTattooSize {
  id: string;
  sizeLabel: string;
  description: string;
  width: number;
  height: number;
}

export const POPULAR_TATTOO_SIZES: PopularTattooSize[] = [
  {
    id: 'preset-3x3',
    sizeLabel: '3 × 3 ซม.',
    description: 'เหรียญ 10 บาท',
    width: 3,
    height: 3,
  },
  {
    id: 'preset-5x5',
    sizeLabel: '5 × 5 ซม.',
    description: 'ฝากระป๋อง',
    width: 5,
    height: 5,
  },
  {
    id: 'preset-8x8',
    sizeLabel: '8 × 8 ซม.',
    description: 'นามบัตร',
    width: 8,
    height: 8,
  },
  {
    id: 'preset-10x10',
    sizeLabel: '10 × 10 ซม.',
    description: 'เต็มฝ่ามือ',
    width: 10,
    height: 10,
  },
  {
    id: 'preset-15x20',
    sizeLabel: '15 × 20 ซม.',
    description: 'กระดาษ A4',
    width: 15,
    height: 20,
  },
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
        <span className="text-[10px] text-studio-muted block mb-2 font-medium">ขนาดยอดนิยม:</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {POPULAR_TATTOO_SIZES.map((preset) => {
            const isActive = width === preset.width && height === preset.height;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onWidthChange(preset.width);
                  onHeightChange(preset.height);
                }}
                className={`flex flex-col items-center justify-center p-2 rounded-[4px] border transition-all text-center select-none active:scale-[0.98] ${
                  isActive
                    ? 'bg-studio-red/10 border-studio-red text-studio-primary ring-1 ring-studio-red/40'
                    : 'bg-studio-card border-studio-border text-studio-secondary hover:text-studio-primary hover:border-studio-red/50'
                }`}
              >
                <span className="text-[11px] font-bold tracking-wide">
                  {preset.sizeLabel}
                </span>
                <span className="text-[9px] text-studio-muted mt-0.5 font-medium truncate max-w-full">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
