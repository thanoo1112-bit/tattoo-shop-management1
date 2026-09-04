'use client';

import React from 'react';
import { UserCheck, Users, Percent } from 'lucide-react';
import { ArtistRevenueItem, formatCurrency } from './types';

interface RevenueByArtistProps {
  artistsRevenue: ArtistRevenueItem[];
  totalRevenue: number;
}

export default function RevenueByArtist({
  artistsRevenue,
  totalRevenue,
}: RevenueByArtistProps) {
  const hasData = artistsRevenue.some((a) => a.revenue > 0);

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#4A443A]/60 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[#9C2F2F]">
            <UserCheck size={15} />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-heading font-semibold text-[#ECE4D3]">
              รายได้ตามช่างสัก
            </h3>
            <p className="text-[11px] text-[#A89F91]">
              ยอดเงินจริงที่ลูกค้าชำระให้ผลงานของช่างแต่ละคน
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      {!hasData ? (
        <div className="py-8 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40">
          <Users size={24} className="text-[#7A7265] mx-auto mb-1.5 opacity-60" />
          <p className="text-xs font-medium text-[#ECE4D3]">ยังไม่มีรายได้ของช่างในช่วงนี้</p>
          <p className="text-[10px] text-[#7A7265] mt-0.5">
            เมื่อมีการรับเงินของคิวงานช่าง ยอดจะสรุปที่นี่
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {artistsRevenue.map((artist) => (
            <div
              key={artist.artist_id}
              className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-lg p-3 sm:p-3.5 space-y-2 hover:border-[#7A7265] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                    {artist.name}
                    {artist.nickname && (
                      <span className="text-[10px] text-[#A89F91] font-normal bg-[#171512] px-1.5 py-0.5 rounded border border-[#4A443A]/50">
                        {artist.nickname}
                      </span>
                    )}
                  </h4>
                  <span className="text-[10px] text-[#7A7265]">
                    {artist.booking_count} คิวงานที่มีการชำระเงิน
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs sm:text-sm font-heading font-bold text-emerald-400 block">
                    {formatCurrency(artist.revenue)}
                  </span>
                  <span className="text-[10px] text-[#A89F91] font-medium">
                    {artist.percentage}% ของรายได้รวม
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-[#171512] h-1.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, Math.max(0, artist.percentage))}%` }}
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
