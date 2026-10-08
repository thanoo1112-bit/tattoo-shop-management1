'use client';

import React from 'react';
import { UserCheck, Users } from 'lucide-react';
import { ArtistRevenueItem, formatCurrency } from './types';

interface RevenueByArtistProps {
  artistsRevenue: ArtistRevenueItem[];
  totalRevenue: number;
}

const ARTIST_COLOR_PALETTE = [
  '#10B981', // Emerald (ช่างบาส)
  '#06B6D4', // Cyan (ช่างบีม)
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#6366F1', // Indigo
];

function getArtistColor(artistId: string, name?: string): string {
  const cleanName = (name || '').toLowerCase();
  if (cleanName.includes('บาส') || cleanName.includes('bas')) {
    return '#10B981'; // Emerald Green
  }
  if (cleanName.includes('บีม') || cleanName.includes('beam')) {
    return '#06B6D4'; // Cyan Blue
  }

  let hash = 0;
  const str = artistId || name || '';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ARTIST_COLOR_PALETTE.length;
  return ARTIST_COLOR_PALETTE[index];
}

export default function RevenueByArtist({
  artistsRevenue,
  totalRevenue,
}: RevenueByArtistProps) {
  const hasArtists = artistsRevenue.length > 0;

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-3.5 sm:p-4 shadow-lg space-y-3 font-prompt">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-[#4A443A]/60 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#ECE4D3] shrink-0">
            <UserCheck size={14} />
          </div>
          <div>
            <h3 className="text-sm font-heading font-semibold text-[#ECE4D3] leading-tight">
              รายได้ตามช่าง
            </h3>
            <p className="text-[10px] sm:text-[11px] text-[#A89F91] leading-tight">
              ยอดเงินรับจริงของช่างสักแต่ละคน (RECORDED เท่านั้น)
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right shrink-0">
          <span className="text-[10px] text-[#7A7265] block leading-none">ยอดรวมตามช่างทั้งหมด</span>
          <span className="text-sm sm:text-base font-heading font-bold text-emerald-400">
            {formatCurrency(totalRevenue)}
          </span>
        </div>
      </div>

      {/* Content List */}
      {!hasArtists ? (
        <div className="py-6 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          <Users size={20} className="text-[#7A7265] mx-auto mb-1 opacity-60" />
          <p className="text-xs font-medium text-[#ECE4D3]">ไม่พบข้อมูลช่างสัก</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {artistsRevenue.map((art) => {
            const isZero = art.revenue <= 0;
            const artistColor = getArtistColor(art.artist_id, art.name);

            return (
              <div
                key={art.artist_id}
                className="flex items-center justify-between bg-[#0E0D0C] border border-[#4A443A]/60 rounded-lg px-3 py-2 text-xs sm:text-sm hover:border-[#7A7265] transition-colors"
              >
                {/* Left: Colored Dot + Name + Optional Nickname */}
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: artistColor }}
                  />
                  <span className="font-semibold text-[#ECE4D3] truncate">
                    {art.name}
                  </span>
                  {art.nickname && (
                    <span className="text-[10px] text-[#A89F91] font-normal bg-[#171512] px-1.5 py-0.5 rounded border border-[#4A443A]/50 shrink-0">
                      {art.nickname}
                    </span>
                  )}
                </div>

                {/* Right: THB Amount */}
                <div className="text-right shrink-0">
                  <span className={`font-heading font-bold ${isZero ? 'text-[#7A7265]' : 'text-emerald-400'}`}>
                    {formatCurrency(art.revenue)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
