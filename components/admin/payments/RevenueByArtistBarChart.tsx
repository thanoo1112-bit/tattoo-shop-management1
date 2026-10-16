'use client';

import React, { useMemo } from 'react';
import { UserCheck, Users } from 'lucide-react';

export interface ArtistRevenueItemDetail {
  artist_id: string;
  name: string;
  nickname: string | null;
  amount?: number;
  percentage?: number;
  job_count?: number;
}

interface RevenueByArtistBarChartProps {
  artistsData: ArtistRevenueItemDetail[];
  totalRevenue?: number;
  totalJobs?: number;
}

export default function RevenueByArtistBarChart({
  artistsData,
  totalJobs: propsTotalJobs,
}: RevenueByArtistBarChartProps) {
  const hasArtists = artistsData.length > 0;

  // 1. Sort artists descending by job count
  const sortedArtists = useMemo(() => {
    return [...artistsData].sort((a, b) => (b.job_count ?? 0) - (a.job_count ?? 0));
  }, [artistsData]);

  const totalJobs = useMemo(() => {
    if (propsTotalJobs !== undefined) return propsTotalJobs;
    return sortedArtists.reduce((sum, a) => sum + (a.job_count ?? 0), 0);
  }, [propsTotalJobs, sortedArtists]);

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
              งานตามช่าง
            </h3>
            <p className="text-[10px] sm:text-[11px] text-[#A89F91] leading-tight mt-0.5">
              จำนวนงานของช่างสักแต่ละคน
            </p>
          </div>
        </div>

        {/* Full-width Row: Label Left, Total Count Right */}
        <div className="flex items-center justify-between pt-1 border-t border-[#4A443A]/40">
          <span className="text-xs text-[#A89F91] font-medium">
            งานรวมทุกช่าง
          </span>
          <span className="text-sm sm:text-base font-heading font-bold text-amber-400">
            {totalJobs} งาน
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
        <div className="space-y-2.5">
          {sortedArtists.map((art) => {
            const count = art.job_count ?? 0;
            const hasJobs = count > 0;

            return (
              <div
                key={art.artist_id}
                className="bg-[#0E0D0C] border border-[#4A443A]/70 rounded-lg p-3 hover:border-[#7A7265] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: hasJobs ? '#F59E0B' : '#7A7265' }}
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

                  <div className="text-right shrink-0">
                    <span className={`font-heading text-sm ${hasJobs ? 'text-amber-400 font-bold' : 'text-[#7A7265]'}`}>
                      {count} งาน
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
