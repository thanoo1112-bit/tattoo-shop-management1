'use client';

import React from 'react';
import { Check, Clock } from 'lucide-react';

interface TattooSizeInputProps {
  width: number;
  height: number;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number) => void;
}

export interface TattooSizeOption {
  id: string;
  name: string;
  dimensions: string;
  priceDisplay: string;
  durationDisplay: string;
  referenceDisplay: string;
  width: number;
  height: number;
}

export const TATTOO_SIZE_OPTIONS: TattooSizeOption[] = [
  {
    id: 'size-s',
    name: 'Size S',
    dimensions: '5 × 5 ซม.',
    priceDisplay: '500.-',
    durationDisplay: '30–60 นาที',
    referenceDisplay: 'เหรียญสิบ / ฝากระป๋อง',
    width: 5,
    height: 5,
  },
  {
    id: 'size-m',
    name: 'Size M',
    dimensions: '5 × 10 ซม.',
    priceDisplay: '1,000.-',
    durationDisplay: '1–2 ชั่วโมง',
    referenceDisplay: 'แนวยาว / บัตรประชาชน',
    width: 5,
    height: 10,
  },
  {
    id: 'size-l',
    name: 'Size L',
    dimensions: '10 × 15 ซม.',
    priceDisplay: '2,500 - 3,000.-',
    durationDisplay: '2–4 ชั่วโมง',
    referenceDisplay: 'หน้าจอมือถือ / 1 ฝ่ามือ',
    width: 10,
    height: 15,
  },
  {
    id: 'size-xl',
    name: 'Size XL',
    dimensions: '15 × 25 ซม.',
    priceDisplay: '4,000.-',
    durationDisplay: '4–6 ชั่วโมง',
    referenceDisplay: 'ต้นแขนเต็ม / น่อง / หลังส่วนเล็ก',
    width: 15,
    height: 25,
  },
  {
    id: 'size-xxl',
    name: 'Size XXL',
    dimensions: 'ใหญ่กว่า A4',
    priceDisplay: '6,000.-',
    durationDisplay: '6 ชั่วโมงขึ้นไป / อาจแบ่งหลายรอบ',
    referenceDisplay: 'เต็มแขน / เต็มหลัง',
    width: 21,
    height: 30,
  },
];

export default function TattooSizeInput({
  width,
  height,
  onWidthChange,
  onHeightChange,
}: TattooSizeInputProps) {
  return (
    <div className="w-full space-y-2.5 font-prompt">
      {/* 5 Size Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {TATTOO_SIZE_OPTIONS.map((opt) => {
          const isSelected = width === opt.width && height === opt.height;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onWidthChange(opt.width);
                onHeightChange(opt.height);
              }}
              className={`p-3.5 rounded-[6px] border text-left flex flex-col justify-between space-y-2 transition-all duration-200 select-none relative ${
                isSelected
                  ? 'bg-studio-red/10 border-studio-red text-studio-primary ring-1 ring-studio-red/50 shadow-md font-medium'
                  : 'bg-studio-main border-studio-border/70 text-studio-secondary hover:border-studio-red/50 hover:text-studio-primary'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className={`text-xs font-bold ${isSelected ? 'text-studio-red' : 'text-studio-primary'}`}>
                  {opt.name}
                </span>
                <div
                  className={`w-4 h-4 rounded-[3px] flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-studio-red border border-studio-red text-white'
                      : 'border border-studio-border bg-studio-card'
                  }`}
                >
                  {isSelected && <Check size={12} strokeWidth={3} />}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-studio-primary font-medium">
                  {opt.dimensions}
                </div>
                <div className="text-xs text-studio-red font-semibold">
                  {opt.priceDisplay}
                </div>
                <div className="text-[10.5px] text-studio-secondary font-normal flex items-center space-x-1">
                  <Clock size={14} className="text-studio-red shrink-0" aria-label="ระยะเวลาโดยประมาณ" />
                  <span>{opt.durationDisplay}</span>
                </div>
                <div className="text-[10px] text-studio-muted font-light leading-tight">
                  {opt.referenceDisplay}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Note below size cards */}
      <p className="text-[10.5px] text-[#7A7265] font-light leading-relaxed pt-0.5">
        * ราคาและระยะเวลาเป็นค่าประเมินเบื้องต้น อาจมีการปรับเปลี่ยนตามรายละเอียดของแบบและตำแหน่งที่เลือก
      </p>
    </div>
  );
}
