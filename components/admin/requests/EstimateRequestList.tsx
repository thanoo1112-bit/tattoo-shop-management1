'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, FileText, ChevronRight, User, Calendar, Image as ImageIcon } from 'lucide-react';
import { EstimateRequestItem, EstimateStatus, formatDateTimeBangkok, formatCurrency } from './types';

interface EstimateRequestListProps {
  estimates: EstimateRequestItem[];
  selectedEstimate: EstimateRequestItem | null;
  onSelectEstimate: (estimate: EstimateRequestItem) => void;
}

export default function EstimateRequestList({
  estimates,
  selectedEstimate,
  onSelectEstimate,
}: EstimateRequestListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filterPills: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: 'ทั้งหมด' },
    { id: 'PENDING', label: 'รอประเมิน' },
    { id: 'QUOTED', label: 'เสนอราคาแล้ว' },
    { id: 'ACCEPTED', label: 'ลูกค้ายอมรับ' },
    { id: 'REJECTED', label: 'ปฏิเสธ' },
  ];

  const filteredEstimates = useMemo(() => {
    return estimates.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesCustomer = e.customer_name?.toLowerCase().includes(query);
        const matchesArtist = e.artist_name?.toLowerCase().includes(query);
        const matchesPlacement = e.placement?.toLowerCase().includes(query);
        const matchesDesc = e.description?.toLowerCase().includes(query);
        if (!matchesCustomer && !matchesArtist && !matchesPlacement && !matchesDesc) return false;
      }
      return true;
    });
  }, [estimates, statusFilter, searchQuery]);

  const getStatusBadge = (status: EstimateStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            รอประเมิน
          </span>
        );
      case 'QUOTED':
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            เสนอราคาแล้ว
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ลูกค้ายอมรับ
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ปฏิเสธ
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="bg-[#1F1D1A] text-[#7A7265] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-semibold">
            หมดอายุ
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-[#171512] border border-[#4A443A] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 font-prompt">
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {filterPills.map((pill) => {
            const isSelected = statusFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors border shrink-0 ${
                  isSelected
                    ? 'bg-[#ECE4D3] text-[#0E0D0C] border-[#ECE4D3] shadow'
                    : 'bg-[#0E0D0C] text-[#A89F91] border-[#4A443A] hover:text-[#ECE4D3] hover:border-[#7A7265]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า, ช่าง, ตำแหน่ง..."
            className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#ECE4D3] placeholder-[#7A7265] focus:outline-none focus:border-[#ECE4D3]"
          />
        </div>
      </div>

      {/* Content List */}
      {filteredEstimates.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-[#4A443A]/60 rounded-lg bg-[#0E0D0C]/40 space-y-2">
          <FileText size={28} className="text-[#7A7265] mx-auto opacity-60" />
          <h4 className="text-xs sm:text-sm font-semibold text-[#ECE4D3]">ยังไม่มีคำขอจากลูกค้า</h4>
          <p className="text-[11px] text-[#7A7265] max-w-sm mx-auto">
            เมื่อมีลูกค้าส่งคำขอประเมินราคา รายการจะแสดงที่นี่เพื่อให้ผู้ดูแลระบบสามารถส่งใบเสนอราคาได้
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs text-[#ECE4D3]">
              <thead className="bg-[#0E0D0C] text-[#7A7265] uppercase text-[10px] tracking-wider border-b border-[#4A443A]">
                <tr>
                  <th className="py-3 px-3">ยื่นเมื่อ</th>
                  <th className="py-3 px-3">ลูกค้า</th>
                  <th className="py-3 px-3">ช่างสัก</th>
                  <th className="py-3 px-3">ตำแหน่ง / ขนาด</th>
                  <th className="py-3 px-3">สถานะ</th>
                  <th className="py-3 px-3 text-right">ราคาที่เสนอ</th>
                  <th className="py-3 px-3 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {filteredEstimates.map((est) => {
                  const isSelected = selectedEstimate?.id === est.id;
                  return (
                    <tr
                      key={est.id}
                      onClick={() => onSelectEstimate(est)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#1F1D1A]' : 'hover:bg-[#1F1D1A]/50'
                      }`}
                    >
                      <td className="py-3 px-3 text-[#A89F91]">
                        {formatDateTimeBangkok(est.created_at)}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#ECE4D3]">
                        {est.customer_name}
                      </td>
                      <td className="py-3 px-3 text-[#A89F91]">
                        {est.artist_name}
                      </td>
                      <td className="py-3 px-3 text-[#ECE4D3]">
                        <span className="font-medium">{est.placement}</span>
                        {est.width_cm && est.height_cm && (
                          <span className="text-[10px] text-[#7A7265] ml-1.5">
                            ({est.width_cm}x{est.height_cm} ซม.)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">{getStatusBadge(est.status)}</td>
                      <td className="py-3 px-3 text-right font-semibold text-emerald-400">
                        {est.quoted_price ? formatCurrency(est.quoted_price) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center text-[#7A7265]">
                        <ChevronRight size={14} className="inline-block" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-2.5">
            {filteredEstimates.map((est) => {
              const isSelected = selectedEstimate?.id === est.id;
              return (
                <div
                  key={est.id}
                  onClick={() => onSelectEstimate(est)}
                  className={`border rounded-lg p-3.5 space-y-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#1F1D1A] border-[#ECE4D3]'
                      : 'bg-[#0E0D0C] border-[#4A443A]/70 hover:border-[#7A7265]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-sm text-[#ECE4D3]">{est.customer_name}</span>
                      <p className="text-[11px] text-[#7A7265] mt-0.5">
                        ช่างสัก: <span className="text-[#A89F91]">{est.artist_name}</span>
                      </p>
                    </div>
                    {getStatusBadge(est.status)}
                  </div>

                  <div className="text-xs text-[#A89F91] pt-1 border-t border-[#4A443A]/40 flex items-center justify-between">
                    <span>
                      {est.placement}{' '}
                      {est.width_cm && est.height_cm ? `(${est.width_cm}x${est.height_cm} ซม.)` : ''}
                    </span>
                    {est.quoted_price ? (
                      <span className="font-semibold text-emerald-400">{formatCurrency(est.quoted_price)}</span>
                    ) : (
                      <span className="text-[10px] text-blue-400 font-medium">รอประเมินราคา</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
