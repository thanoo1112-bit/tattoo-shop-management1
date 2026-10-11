'use client';

import React, { useMemo } from 'react';
import { UserCheck, Users } from 'lucide-react';
import { ArtistRevenueItem, formatCurrency } from './types';

interface RevenueByArtistProps {
  artistsRevenue: ArtistRevenueItem[];
  totalRevenue: number;
}

export default function RevenueByArtist({
  artistsRevenue,
  totalRevenue,
}: RevenueByArtistProps) {
  const hasArtists = artistsRevenue.length > 0;

  // 1. Sort artists descending by revenue (highest revenue first)
  const sortedArtists = useMemo(() => {
    return [...artistsRevenue].sort((a, b) => b.revenue - a.revenue);
  }, [artistsRevenue]);

  // 2. Extract unique non-zero revenue values (descending) to determine rank tiers
  const uniqueRevenues = useMemo(() => {
    return Array.from(
      new Set(sortedArtists.map((a) => a.revenue).filter((r) => r > 0))
    ).sort((a, b) => b - a);
  }, [sortedArtists]);

  // 3. Rank color palette in gold/amber/bronze theme tones
  const getRankStyle = (revenue: number) => {
    if (revenue <= 0 || uniqueRevenues.length === 0) {
      return {
        dotColor: '#7A7265',
        barColor: '#4A443A',
        textColor: 'text-[#7A7265]',
      };
    }
    const tierIndex = uniqueRevenues.indexOf(revenue);
    const palette = [
      { dotColor: '#F59E0B', barColor: '#F59E0B', textColor: 'text-amber-300 font-bold' }, // Rank 1: Bright Gold
      { dotColor: '#D97706', barColor: '#D97706', textColor: 'text-amber-400 font-bold' }, // Rank 2: Warm Gold
      { dotColor: '#B45309', barColor: '#B45309', textColor: 'text-amber-500 font-semibold' }, // Rank 3: Bronze Gold
      { dotColor: '#92400E', barColor: '#92400E', textColor: 'text-amber-600 font-semibold' }, // Rank 4: Deep Gold-Brown
      { dotColor: '#78350F', barColor: '#78350F', textColor: 'text-amber-700 font-medium' }, // Rank 5+: Dark Bronze
    ];

    return palette[Math.min(tierIndex, palette.length - 1)];
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-3.5 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Header */}
      <div className="border-b border-[#4A443A]/60 pb-3 space-y-2.5">
        {/* Top: Icon + Title + Description */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#ECE4D3] shrink-0">
            <UserCheck size={15} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3] leading-tight">
              รายได้ตามช่าง
            </h3>
            <p className="text-[10px] sm:text-[11px] text-[#A89F91] leading-tight mt-0.5">
              ยอดเงินรับจริงของช่างสักแต่ละคน
            </p>
          </div>
        </div>

        {/* Full-width Row: Label Left, Total Amount Right */}
        <div className="flex items-center justify-between pt-1 border-t border-[#4A443A]/40">
          <span className="text-xs text-[#A89F91] font-medium">
            รายได้รวมทุกช่าง
          </span>
          <span className="text-sm sm:text-base font-heading font-bold text-amber-400">
            {formatCurrency(totalRevenue)}
          </span>
        </div>
      </div>

      {/* Content List */}
      {!hasArtists ? (
        <div className="py-8 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          <Users size={22} className="text-[#7A7265] mx-auto mb-1.5 opacity-60" />
          <p className="text-xs font-medium text-[#ECE4D3]">ไม่พบข้อมูลช่างสัก</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedArtists.map((art) => {
            const isZero = art.revenue <= 0;
            const style = getRankStyle(art.revenue);
            const sharePercentage = totalRevenue > 0 ? Math.round((art.revenue / totalRevenue) * 100) : 0;

            return (
              <div
                key={art.artist_id}
                className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-lg p-3 hover:border-[#7A7265] transition-colors space-y-2"
              >
                {/* Header Row: Rank Dot + Name/Nickname + Revenue Amount */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: style.dotColor }}
                    />
                    <span className="font-semibold text-sm text-[#ECE4D3] truncate">
                      {art.name}
                    </span>
                    {art.nickname && (
                      <span className="text-[10px] text-[#A89F91] font-normal bg-[#171512] px-1.5 py-0.5 rounded border border-[#4A443A]/50 shrink-0">
                        {art.nickname}
                      </span>
                    )}
                  </div>

                  {/* THB Amount & Share % */}
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className={`font-heading text-sm ${style.textColor}`}>
                      {formatCurrency(art.revenue)}
                    </span>
                    {totalRevenue > 0 && (
                      <span className="text-[10px] text-[#A89F91] font-mono">
                        ({sharePercentage}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bar Reflecting Revenue Proportion */}
                <div className="w-full h-1.5 bg-[#171512] border border-[#4A443A]/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: isZero ? '0%' : `${Math.max(2, sharePercentage)}%`,
                      backgroundColor: style.barColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
