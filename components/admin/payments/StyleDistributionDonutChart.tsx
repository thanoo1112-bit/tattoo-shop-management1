'use client';

import React from 'react';
import { Palette, PieChart } from 'lucide-react';

export interface StyleCountDetail {
  styleName: string;
  count: number;
  percentage: number; // 0..100
  color: string;
}

interface StyleDistributionDonutChartProps {
  data: StyleCountDetail[];
  totalBookings: number;
}

const STYLE_COLOR_MAP: Record<string, string> = {
  'Blackwork': '#3B82F6', // Blue
  'Darkwork': '#EC4899', // Pink / Rose
  'Minimal': '#06B6D4', // Cyan
  'Japanese': '#EF4444', // Red
  'Realism': '#F97316', // Orange
  'Traditional': '#EAB308', // Yellow
  'Neo Traditional': '#8B5CF6', // Purple
  'Watercolor': '#10B981', // Emerald
  'Dotwork': '#6366F1', // Indigo
  'Geometric': '#14B8A6', // Teal
  'ไม่ระบุสไตล์': '#71717A', // Gray
};

const PALETTE = [
  '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6',
  '#06B6D4', '#EF4444', '#6366F1', '#14B8A6', '#F97316',
  '#A855F7', '#34D399', '#F43F5E', '#38BDF8', '#FACC15',
];

export function getStyleColor(styleName: string): string {
  const cleanName = String(styleName || '').trim();
  if (STYLE_COLOR_MAP[cleanName]) {
    return STYLE_COLOR_MAP[cleanName];
  }
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

export default function StyleDistributionDonutChart({
  data,
  totalBookings,
}: StyleDistributionDonutChartProps) {
  // SVG Donut Math
  const radius = 40;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius; // ~251.327

  let accumulatedPercent = 0;

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Header */}
      <div className="flex flex-col justify-between gap-1 border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#ECE4D3]">
            <Palette size={15} />
          </div>
          <div>
            <h3 className="text-sm font-heading font-medium text-[#ECE4D3]">
              สัดส่วนงานตามสไตล์
            </h3>
            <p className="text-[11px] text-[#7A7265] mt-0.5">
              คำนวณเฉพาะงานที่ยืนยันคิวแล้ว (CONFIRMED, IN_PROGRESS, COMPLETED) ตามวันที่ยืนยันคิว
            </p>
          </div>
        </div>
      </div>

      {/* Chart & Legend Content */}
      {totalBookings === 0 || data.length === 0 ? (
        /* Empty State */
        <div className="py-10 text-center space-y-2">
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-[#4A443A]/60 mx-auto flex items-center justify-center text-[#7A7265]">
            <PieChart size={24} />
          </div>
          <p className="text-xs text-[#7A7265]">ไม่พบข้อมูลสไตล์งานในช่วงเวลาหรือช่างที่เลือก</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 pt-1">
          {/* Donut SVG Circle */}
          <div className="relative w-40 h-40 shrink-0 flex items-center justify-center my-1">
            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
              {/* Background Track Circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="transparent"
                stroke="#0E0D0C"
                strokeWidth={strokeWidth}
              />

              {/* Slices */}
              {data.map((item, idx) => {
                const slicePercent = item.percentage / 100;
                const strokeDasharray = `${slicePercent * circumference} ${circumference * (1 - slicePercent)}`;
                const strokeDashoffset = - (accumulatedPercent * circumference);
                accumulatedPercent += slicePercent;

                return (
                  <circle
                    key={item.styleName + idx}
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="transparent"
                    stroke={item.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500 ease-out"
                  />
                );
              })}
            </svg>

            {/* Center Label (Total Bookings) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-2xl font-bold font-mono text-[#ECE4D3] leading-none">
                {totalBookings}
              </span>
              <span className="text-[10px] text-[#7A7265] mt-1 font-sans font-medium">
                งานทั้งหมด
              </span>
            </div>
          </div>

          {/* Style Breakdown List (Primary: Full Style Name, Secondary: Count · Percentage) */}
          <div className="w-full space-y-2 max-h-64 overflow-y-auto pr-0.5">
            {data.map((item) => (
              <div
                key={item.styleName}
                className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#0E0D0C] border border-[#4A443A]/50 hover:border-[#4A443A] transition-colors"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: item.color }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-[#ECE4D3] leading-snug break-words">
                      {item.styleName}
                    </span>
                    <span className="text-[11px] font-mono text-[#A89F91] shrink-0 font-medium">
                      {item.count} งาน · {item.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
