'use client';

import React from 'react';

interface PlacementSelectorProps {
  value: string;
  onChange: (placement: string) => void;
}

export default function PlacementSelector({ value, onChange }: PlacementSelectorProps) {
  return (
    <div className="w-full space-y-1.5 font-prompt">
      <label className="text-[11px] uppercase tracking-wider text-studio-secondary block font-medium">
        ตำแหน่งบนร่างกาย
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="เช่น ท่อนแขนด้านในข้างขวา, หัวไหล่ซ้าย, หน้าแข้งขวา"
        className="w-full min-h-[46px] bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] text-xs sm:text-sm text-[#ECE4D3] px-3.5 py-2.5 outline-none rounded-[4px] transition-colors placeholder:text-[#7A7265]"
      />
      <div className="space-y-0.5 pt-0.5">
        <p className="text-[11px] text-[#A89F91] leading-relaxed">
          กรุณาระบุตำแหน่งและด้านของร่างกายให้ชัดเจน เช่น ซ้าย/ขวา ด้านใน/ด้านนอก
        </p>
        <p className="text-[10.5px] text-[#7A7265] font-light leading-relaxed">
          * ร้านไม่รับสักบริเวณใบหน้าและจุดลับ
        </p>
      </div>
    </div>
  );
}
