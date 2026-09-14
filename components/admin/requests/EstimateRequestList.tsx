'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, FileText, ChevronRight, User, Calendar, Image as ImageIcon, CreditCard, TriangleAlert, Trash2 } from 'lucide-react';
import { EstimateRequestItem, EstimateStatus, formatDateTimeBangkok } from './types';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

interface EstimateRequestListProps {
  estimates: EstimateRequestItem[];
  selectedEstimate: EstimateRequestItem | null;
  onSelectEstimate: (estimate: EstimateRequestItem) => void;
  onCheckSlip?: (bookingId: string) => void;
  onDeleteRequest?: (estimate: EstimateRequestItem) => void;
  initialFilter?: string;
}

export default function EstimateRequestList({
  estimates,
  selectedEstimate,
  onSelectEstimate,
  onCheckSlip,
  onDeleteRequest,
  initialFilter,
}: EstimateRequestListProps) {
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    if (initialFilter) {
      setStatusFilter(initialFilter);
    }
  }, [initialFilter]);

  const filterPills: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: 'ทั้งหมด' },
    { id: 'PENDING', label: 'รอตรวจสอบ' },
    { id: 'WAITING_DEPOSIT', label: 'รอมัดจำ' },
    { id: 'WAITING_SLIP', label: 'สลิปรอตรวจ' },
    { id: 'REJECTED', label: 'ปฏิเสธ' },
  ];

  const filteredEstimates = useMemo(() => {
    return estimates.filter((e) => {
      const opKey = e.operational_status?.key || e.status;
      const hasPendingSlip = Boolean(
        e.has_pending_payment_submission ||
        e.pending_submission?.status === 'PENDING' ||
        opKey === 'WAITING_SLIP_VERIFICATION'
      );

      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PENDING' && opKey !== 'PENDING') return false;
        if (statusFilter === 'QUOTED' && opKey !== 'WAITING_DEPOSIT') return false;
        if (statusFilter === 'WAITING_DEPOSIT' && opKey !== 'WAITING_DEPOSIT') return false;
        if (statusFilter === 'WAITING_SLIP' && opKey !== 'WAITING_SLIP_VERIFICATION') return false;
        if (statusFilter === 'REJECTED' && opKey !== 'REJECTED') return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesCustomer = e.customer_name?.toLowerCase().includes(query);
        const matchesArtist = e.artist_name?.toLowerCase().includes(query);
        const matchesPlacement = e.placement?.toLowerCase().includes(query);
        const matchesDesc = e.description?.toLowerCase().includes(query);
        const matchesStatusLabel = e.operational_status?.label?.toLowerCase().includes(query);
        if (!matchesCustomer && !matchesArtist && !matchesPlacement && !matchesDesc && !matchesStatusLabel) return false;
      }
      return true;
    });
  }, [estimates, statusFilter, searchQuery]);

  const renderHealthAlertBadge = (est: EstimateRequestItem) => {
    const hasAlert = Boolean(est.has_medical_condition || est.has_allergy);
    if (hasAlert) {
      return (
        <span
          title="มีข้อมูลสุขภาพ กรุณาตรวจสอบรายละเอียดก่อนให้บริการ"
          className="bg-[#2A1212] text-[#E8B4B4] border border-[#9C2F2F] px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-help"
        >
          <TriangleAlert size={11} className="text-[#E8B4B4] shrink-0" />
          <span>มีข้อมูล</span>
        </span>
      );
    }
    return (
      <span className="bg-[#171512] text-[#9C9486] border border-[#4A443A] px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center">
        ปกติ
      </span>
    );
  };

  const renderStatusBadge = (est: EstimateRequestItem) => {
    if (
      (est.operational_status?.key === 'WAITING_SLIP_VERIFICATION' || est.has_pending_payment_submission) &&
      est.linked_booking?.id &&
      onCheckSlip
    ) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCheckSlip(est.linked_booking!.id);
          }}
          title="กดเพื่อตรวจสลิป"
          className="bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center animate-pulse transition-colors cursor-pointer shadow-sm"
        >
          <span>สลิปรอตรวจ</span>
        </button>
      );
    }

    if (est.operational_status) {
      return (
        <span className={`${est.operational_status.badgeClass} px-2 py-0.5 rounded text-[10px] font-semibold`}>
          {est.operational_status.label}
        </span>
      );
    }

    switch (est.status) {
      case 'PENDING':
        return (
          <span className="bg-blue-950/60 text-blue-400 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            รอตรวจสอบ
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ยืนยันแล้ว
          </span>
        );
      case 'REJECTED':
        return (
          <span className="bg-red-950/60 text-red-400 border border-red-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            ปฏิเสธ
          </span>
        );
      case 'QUOTED':
        return (
          <span className="bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
            เสนอราคาแล้ว
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
            เมื่อมีลูกค้าส่งคำขอจองคิวสัก รายการจะแสดงที่นี่เพื่อให้ผู้ดูแลระบบตรวจสอบและลงคิวงานได้
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
                  <th className="py-3 px-3">วันที่สะดวก</th>
                  <th className="py-3 px-3">สถานะ</th>
                  <th className="py-3 px-3 text-center">แจ้งเตือนด้านสุขภาพ</th>
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
                        isSelected
                          ? 'bg-[#1F1D1A]'
                          : 'hover:bg-[#0E0D0C]/70'
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
                      <td className="py-3 px-3">
                        <span className="text-[#ECE4D3]">{est.placement}</span>
                        {est.width_cm && est.height_cm && (
                          <span className="text-[10px] text-[#7A7265] block">
                            {est.width_cm} × {est.height_cm} ซม.
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-[#A89F91]">
                        {est.preferred_date || 'ไม่ระบุ'}
                      </td>
                      <td className="py-3 px-3">
                        {renderStatusBadge(est)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {renderHealthAlertBadge(est)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEstimate(est);
                            }}
                            className="px-2.5 py-1 bg-[#0E0D0C] hover:bg-[#1F1D1A] text-[#ECE4D3] text-xs font-medium rounded border border-[#4A443A] hover:border-[#7A7265] transition-colors inline-flex items-center gap-1"
                          >
                            <span>{est.status === 'REJECTED' ? 'ดูรายละเอียด' : 'จัดการคำขอจอง'}</span>
                            <ChevronRight size={13} />
                          </button>
                          {est.status === 'REJECTED' && onDeleteRequest && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteRequest(est);
                              }}
                              title="ลบคำขอที่ปฏิเสธแล้วถาวร"
                              className="px-2.5 py-1 bg-[#2A1212] hover:bg-[#3D1A1A] text-[#E8B4B4] text-xs font-semibold rounded border border-[#9C2F2F] hover:border-[#B53838] transition-all inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={12} />
                              <span>ลบรายการ</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-3">
            {filteredEstimates.map((est) => (
              <div
                key={est.id}
                onClick={() => onSelectEstimate(est)}
                className="bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-3.5 space-y-2.5 shadow cursor-pointer active:scale-[0.99] transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                    <User size={13} className="text-[#9C2F2F]" />
                    {est.customer_name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {renderHealthAlertBadge(est)}
                    {renderStatusBadge(est)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="bg-[#171512] p-2 rounded border border-[#4A443A]/40">
                    <span className="text-[9px] text-[#7A7265] block">ช่างที่ระบุ</span>
                    <span className="text-[#ECE4D3] truncate block">{est.artist_name}</span>
                  </div>
                  <div className="bg-[#171512] p-2 rounded border border-[#4A443A]/40">
                    <span className="text-[9px] text-[#7A7265] block">ตำแหน่ง</span>
                    <span className="text-[#ECE4D3] truncate block">{est.placement}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#A89F91] pt-1">
                  <span>วันที่สะดวก: {est.preferred_date || 'ไม่ระบุ'}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEstimate(est);
                      }}
                      className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                    >
                      <span>{est.status === 'REJECTED' ? 'ดูรายละเอียด' : 'จัดการคำขอจอง'}</span>
                      <ChevronRight size={13} />
                    </button>
                    {est.status === 'REJECTED' && onDeleteRequest && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRequest(est);
                        }}
                        className="px-2 py-0.5 bg-[#2A1212] hover:bg-[#3D1A1A] text-[#E8B4B4] text-[11px] font-semibold rounded border border-[#9C2F2F] flex items-center gap-1 transition-all"
                      >
                        <Trash2 size={11} />
                        <span>ลบรายการ</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
