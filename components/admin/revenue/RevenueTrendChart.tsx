'use client';

import React, { useState } from 'react';
import { BarChart3, TrendingUp, Calendar } from 'lucide-react';
import { DailyRevenueItem, formatCurrency } from './types';

interface RevenueTrendChartProps {
  data: DailyRevenueItem[];
  totalPeriodRevenue: number;
}

export default function RevenueTrendChart({
  data,
  totalPeriodRevenue,
}: RevenueTrendChartProps) {
  const [hoveredDay, setHoveredDay] = useState<DailyRevenueItem | null>(null);

  // Find max value for bar scaling
  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  const hasData = data.some((d) => d.amount > 0);

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
            <BarChart3 size={15} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
              แนวโน้มรายได้
            </h3>
            <p className="text-[11px] text-[#A89F91]">
              รายได้เงินจริงตามวันที่ชำระ (RECORDED เท่านั้น)
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <span className="text-[10px] text-[#7A7265] block">ยอดรวมช่วงเวลาที่เลือก</span>
          <span className="text-base sm:text-lg font-heading font-bold text-emerald-400">
            {formatCurrency(totalPeriodRevenue)}
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      {!hasData ? (
        <div className="h-44 sm:h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          <Calendar size={28} className="text-[#7A7265] mb-2 opacity-60" />
          <p className="text-xs font-medium text-[#ECE4D3]">ยังไม่มีรายได้ในช่วงเวลานี้</p>
          <p className="text-[11px] text-[#7A7265] mt-0.5">
            เมื่อมีการบันทึกรับเงินจริง กราฟแท่งรายวันจะแสดงที่นี่
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Hover Tooltip display */}
          <div className="h-6 flex items-center justify-between text-xs">
            {hoveredDay ? (
              <div className="flex items-center gap-2 text-xs animate-fadeIn">
                <span className="text-[#A89F91]">{hoveredDay.date}:</span>
                <span className="font-semibold text-emerald-400">
                  {formatCurrency(hoveredDay.amount)}
                </span>
                <span className="text-[10px] text-[#7A7265]">
                  ({hoveredDay.count} รายการ)
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-[#7A7265]">
                เลื่อนเมาส์หรือแตะที่แท่งเพื่อดูรายละเอียดยอดเงินรายวัน
              </span>
            )}
          </div>

          {/* Bars Container */}
          <div className="h-40 sm:h-48 flex items-end gap-1.5 sm:gap-2 pt-4 pb-2 px-2 bg-[#0E0D0C] border border-[#4A443A]/60 rounded-lg overflow-x-auto">
            {data.map((item, idx) => {
              const heightPercent = Math.max(4, Math.round((item.amount / maxAmount) * 100));
              const isHovered = hoveredDay?.date === item.date;

              return (
                <div
                  key={item.date || idx}
                  className="flex-1 min-w-[24px] sm:min-w-[32px] max-w-[50px] h-full flex flex-col items-center justify-end group cursor-pointer"
                  onMouseEnter={() => setHoveredDay(item)}
                  onMouseLeave={() => setHoveredDay(null)}
                  onClick={() => setHoveredDay(item)}
                >
                  {/* Bar */}
                  <div className="w-full flex flex-col items-center justify-end h-full">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t transition-all duration-200 ${
                        item.amount > 0
                          ? isHovered
                            ? 'bg-emerald-300 shadow-md shadow-emerald-900/40'
                            : 'bg-emerald-500/80 hover:bg-emerald-400'
                          : 'bg-[#1F1D1A] border-t border-[#4A443A]/40'
                      }`}
                    />
                  </div>

                  {/* Date label */}
                  <span className="text-[9px] text-[#7A7265] mt-1.5 truncate max-w-full block text-center">
                    {item.displayDate}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
