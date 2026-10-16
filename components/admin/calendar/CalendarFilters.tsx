'use client';

import React from 'react';
import { Search, Filter, User } from 'lucide-react';
import { CalendarArtist, SessionStatus } from './types';

interface CalendarFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  artists: CalendarArtist[];
  selectedArtistId: string; // 'ALL' or specific artist UUID
  onArtistChange: (id: string) => void;
  selectedStatus: string; // 'ALL' or SessionStatus
  onStatusChange: (status: string) => void;
  statusCounts?: {
    all: number;
    scheduled: number;
    completed: number;
    cancelled: number;
  };
}

export default function CalendarFilters({
  searchQuery,
  onSearchChange,
  artists,
  selectedArtistId,
  onArtistChange,
  selectedStatus,
  onStatusChange,
  statusCounts,
}: CalendarFiltersProps) {
  const statusOptions: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: statusCounts ? `สถานะทั้งหมด (${statusCounts.all})` : 'สถานะทั้งหมด' },
    { value: 'SCHEDULED', label: statusCounts ? `นัดหมายแล้ว (${statusCounts.scheduled})` : 'นัดหมายแล้ว' },
    { value: 'COMPLETED', label: statusCounts ? `งานเสร็จสิ้น (${statusCounts.completed})` : 'งานเสร็จสิ้น' },
    { value: 'CANCELLED', label: statusCounts ? `ยกเลิก (${statusCounts.cancelled})` : 'ยกเลิก' },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-4">
      {/* 1. Search Bar */}
      <div className="relative flex-1 max-w-md">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8B0A3]"
        />
        <input
          id="input-calendar-search"
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ค้นหาชื่อลูกค้า หรือชื่อช่าง..."
          className="w-full bg-[#171512] border border-[#4A443A]/60 rounded-xl pl-9 pr-3 py-2 text-xs text-[#ECE4D3] placeholder-[#B8B0A3] focus:outline-none focus:border-[#9C2F2F] transition-colors"
        />
      </div>

      {/* 2. Filter Dropdowns */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Artist Filter Dropdown */}
        <div className="relative flex-1 sm:flex-initial min-w-[140px]">
          <select
            id="select-calendar-artist"
            value={selectedArtistId}
            onChange={(e) => onArtistChange(e.target.value)}
            className="w-full bg-[#171512] border border-[#4A443A]/60 rounded-xl px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] appearance-none transition-colors pr-8 cursor-pointer"
          >
            <option value="ALL">ช่างทั้งหมด ({artists.length})</option>
            {artists.map((art) => (
              <option key={art.id} value={art.id}>
                {art.name} {art.nickname ? `(${art.nickname})` : ''}
              </option>
            ))}
          </select>
          <User
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8B0A3] pointer-events-none"
          />
        </div>

        {/* Session Status Filter Dropdown */}
        <div className="relative flex-1 sm:flex-initial min-w-[130px]">
          <select
            id="select-calendar-status"
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full bg-[#171512] border border-[#4A443A]/60 rounded-xl px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] appearance-none transition-colors pr-8 cursor-pointer"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Filter
            size={13}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8B0A3] pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}
