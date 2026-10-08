'use client';

import React, { useState, useMemo } from 'react';
import { Search, Filter, FileText, ChevronRight, User, Calendar, Image as ImageIcon, CreditCard, TriangleAlert, Trash2, Sparkles } from 'lucide-react';
import { EstimateRequestItem, EstimateStatus, formatDateTimeBangkok, formatDateBangkok, formatTimeBangkok } from './types';
import { formatTattooSize } from '@/lib/utils/formatters';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { parseNoteWithPreferredTime, extractHHMM } from '@/lib/noteUtils';

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

  const getCategory = (e: EstimateRequestItem) => {
    const opKey = e.operational_status?.key || e.status;
    const hasPendingSlip = Boolean(
      e.has_pending_payment_submission ||
      e.pending_submission?.status === 'PENDING' ||
      opKey === 'WAITING_SLIP_VERIFICATION'
    );

    if (hasPendingSlip || opKey === 'WAITING_SLIP_VERIFICATION') {
      return 'PENDING_SLIP';
    }
    if (opKey === 'EXPIRED' || opKey === 'CANCELLED' || e.status === 'EXPIRED' || e.status === 'CANCELLED') {
      return 'CANCELLED_EXPIRED';
    }
    if (opKey === 'REJECTED' || e.status === 'REJECTED') {
      return 'REJECTED';
    }
    if (
      opKey === 'WAITING_DEPOSIT' ||
      e.status === 'QUOTED' ||
      e.status === 'ACCEPTED' ||
      e.status === 'APPROVED'
    ) {
      return 'WAITING_DEPOSIT';
    }
    return 'NEW';
  };

  const statusCounts = useMemo(() => {
    let newCount = 0;
    let waitingDeposit = 0;
    let pendingSlip = 0;
    let rejected = 0;
    let cancelledExpired = 0;

    estimates.forEach((e) => {
      const cat = getCategory(e);
      if (cat === 'NEW') newCount++;
      else if (cat === 'WAITING_DEPOSIT') waitingDeposit++;
      else if (cat === 'PENDING_SLIP') pendingSlip++;
      else if (cat === 'REJECTED') rejected++;
      else if (cat === 'CANCELLED_EXPIRED') cancelledExpired++;
    });

    return {
      all: estimates.length,
      new: newCount,
      waitingDeposit,
      pendingSlip,
      rejected,
      cancelledExpired,
    };
  }, [estimates]);

  const filterPills: Array<{ id: string; label: string }> = [
    { id: 'ALL', label: `ทั้งหมด (${statusCounts.all})` },
    { id: 'NEW', label: `คำขอใหม่ (${statusCounts.new})` },
    { id: 'WAITING_DEPOSIT', label: `รอมัดจำ (${statusCounts.waitingDeposit})` },
    { id: 'PENDING_SLIP', label: `สลิปรอตรวจ (${statusCounts.pendingSlip})` },
    { id: 'REJECTED', label: `ปฏิเสธ (${statusCounts.rejected})` },
    { id: 'CANCELLED_EXPIRED', label: `ยกเลิก / หมดอายุ (${statusCounts.cancelledExpired})` },
  ];

  const filteredEstimates = useMemo(() => {
    return estimates.filter((e) => {
      const cat = getCategory(e);

      if (statusFilter !== 'ALL') {
        if ((statusFilter === 'NEW' || statusFilter === 'PENDING') && cat !== 'NEW') return false;
        if (statusFilter === 'WAITING_DEPOSIT' && cat !== 'WAITING_DEPOSIT') return false;
        if (statusFilter === 'REJECTED' && cat !== 'REJECTED') return false;
        if ((statusFilter === 'CANCELLED_EXPIRED' || statusFilter === 'CANCELLED') && cat !== 'CANCELLED_EXPIRED') return false;
        if (statusFilter === 'TERMINATED' && cat !== 'REJECTED' && cat !== 'CANCELLED_EXPIRED') return false;
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
    const isInactive = est.operational_status?.key === 'CANCELLED' || est.status === 'CANCELLED' || est.status === 'EXPIRED' || est.status === 'REJECTED';
    if (hasAlert) {
      return (
        <span
          title="มีข้อมูลสุขภาพ กรุณาตรวจสอบรายละเอียดก่อนให้บริการ"
          className={
            isInactive
              ? "bg-zinc-900/90 text-zinc-400 border border-zinc-700/80 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 cursor-help"
              : "bg-[#2A1212] text-[#E8B4B4] border border-[#9C2F2F] px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-help"
          }
        >
          <TriangleAlert size={11} className={isInactive ? "text-zinc-500 shrink-0" : "text-[#E8B4B4] shrink-0"} />
          <span>มีข้อมูล</span>
        </span>
      );
    }
    return (
      <span className={isInactive ? "bg-zinc-900/60 text-zinc-500 border border-zinc-800/80 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center" : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center"}>
        ปกติ
      </span>
    );
  };

  const renderRequestTypeBadge = (est: EstimateRequestItem) => {
    const isInactive = est.operational_status?.key === 'CANCELLED' || est.status === 'CANCELLED' || est.status === 'EXPIRED' || est.status === 'REJECTED';
    if (est.request_type === 'FLASH') {
      return (
        <span className={isInactive ? "bg-zinc-900/90 text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 shadow-xs" : "bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 shadow-sm"}>
          <Sparkles size={11} className={isInactive ? "text-zinc-500" : "text-amber-400"} />
          <span>Flash</span>
        </span>
      );
    }
    if (est.request_type === 'DIRECT_BOOKING') {
      return (
        <span className={isInactive ? "bg-zinc-900/90 text-zinc-400 border border-zinc-800 px-2 py-0.5 rounded text-[10px] font-semibold" : "bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold"}>
          สร้างโดยแอดมิน
        </span>
      );
    }
    return null;
  };

  const renderStatusBadge = (est: EstimateRequestItem) => {
    if (est.request_type === 'DIRECT_BOOKING') {
      return (
        <span className="bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2 py-0.5 rounded text-[10px] font-semibold">
          สร้างโดยแอดมิน
        </span>
      );
    }

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
          <span className="bg-zinc-900/90 text-zinc-400 border border-zinc-700/80 px-2 py-0.5 rounded text-[10px] font-semibold">
            หมดเวลาชำระมัดจำ
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="bg-zinc-900/90 text-zinc-400 border border-zinc-700/80 px-2 py-0.5 rounded text-[10px] font-semibold">
            ยกเลิก
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
                  <th className="py-3 px-3">รหัส / ลูกค้า</th>
                  <th className="py-3 px-3">งานที่ต้องการสักและขนาด</th>
                  <th className="py-3 px-3">ช่างสัก / สไตล์</th>
                  <th className="py-3 px-3">วันและเวลานัดหมาย</th>
                  <th className="py-3 px-3 text-center">แจ้งเตือนสุขภาพ</th>
                  <th className="py-3 px-3">ยื่นคำขอเมื่อ</th>
                  <th className="py-3 px-3">สถานะ</th>
                  <th className="py-3 px-3 text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A443A]/50">
                {filteredEstimates.map((est) => {
                  const isSelected = selectedEstimate?.id === est.id;
                  const isInactive = est.operational_status?.key === 'CANCELLED' || est.status === 'CANCELLED' || est.status === 'EXPIRED' || est.status === 'REJECTED';
                  const typeBadge = renderRequestTypeBadge(est);
                  return (
                    <tr
                      key={est.id}
                      onClick={() => onSelectEstimate(est)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#1F1D1A]'
                          : isInactive
                          ? 'bg-zinc-950/40 text-zinc-400 opacity-80 hover:bg-zinc-900/50'
                          : 'hover:bg-[#0E0D0C]/70'
                      }`}
                    >
                      {/* 1. รหัส / ลูกค้า */}
                      <td className="py-3 px-3">
                        {typeBadge && (
                          <div className="flex items-center gap-1.5 mb-1">
                            {typeBadge}
                          </div>
                        )}
                        <div className={`font-semibold ${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'}`}>
                          {est.customer_name}
                        </div>
                        <div className="text-[10px] text-[#7A7265] font-mono">
                          ID: {est.id ? (est.id.length > 8 ? est.id.slice(0, 8).toUpperCase() : est.id.toUpperCase()) : '-'}
                        </div>
                      </td>

                      {/* 2. งานที่ต้องการสักและขนาด */}
                      <td className="py-3 px-3 max-w-[220px]">
                        <div className="flex items-center gap-2.5">
                          {est.reference_images && est.reference_images.length > 0 ? (
                            <div className="w-9 h-9 rounded-lg overflow-hidden border border-[#4A443A] shrink-0 bg-[#0E0D0C]">
                              <CustomerReferenceImage
                                src={est.reference_images[0]}
                                alt="ภาพตัวอย่าง"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-lg border border-[#4A443A] shrink-0 bg-[#0E0D0C] flex items-center justify-center text-[#7A7265]">
                              {est.request_type === 'FLASH' ? (
                                <Sparkles size={16} className="text-amber-400/80" />
                              ) : (
                                <ImageIcon size={16} />
                              )}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className={`block font-medium truncate ${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'}`}>
                              {est.artwork_title || (est.request_type === 'FLASH' ? 'งานสัก Flash' : 'งานสัก Custom')}
                            </span>
                            <span className={`text-[10px] ${isInactive ? 'text-zinc-500' : 'text-[#7A7265]'} block truncate`}>
                              {est.placement || 'ไม่ระบุ'}
                              {formatTattooSize(est.width_cm, est.height_cm) !== 'ไม่ระบุ' ? ` • ${formatTattooSize(est.width_cm, est.height_cm)}` : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 3. ช่างสัก / สไตล์ */}
                      <td className="py-3 px-3">
                        <span className={`${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'} block font-medium`}>
                          {est.artist_name}
                        </span>
                        <span className={`text-[10px] ${isInactive ? 'text-zinc-500' : 'text-[#7A7265]'} block`}>
                          {est.style || est.style_preference || 'ไม่ระบุ'}
                        </span>
                      </td>

                      {/* 4. วันและเวลานัดหมาย */}
                      <td className="py-3 px-3">
                        {(() => {
                          const rawTime = est.preferred_time || (est as any).preferredTime;
                          let timeStr = '';
                          if (rawTime) {
                            const hhmm = extractHHMM(rawTime) || rawTime;
                            timeStr = hhmm.endsWith('น.') || hhmm.endsWith('น') ? hhmm : `${hhmm} น.`;
                          } else {
                            const { extractedTime } = parseNoteWithPreferredTime(est.description);
                            if (extractedTime) timeStr = extractedTime;
                          }

                          if (!est.preferred_date) {
                            return <span className={isInactive ? 'text-zinc-400' : 'text-[#ECE4D3]'}>ไม่ระบุ</span>;
                          }

                          return (
                            <>
                              <span className={`${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'} block font-medium`}>
                                {formatDateBangkok(est.preferred_date)}
                              </span>
                              {timeStr && (
                                <span className={`text-[10px] ${isInactive ? 'text-zinc-500' : 'text-[#7A7265]'} block`}>
                                  {timeStr}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </td>

                      {/* 5. แจ้งเตือนสุขภาพ */}
                      <td className="py-3 px-3 text-center">
                        {renderHealthAlertBadge(est)}
                      </td>

                      {/* 6. ยื่นคำขอเมื่อ */}
                      <td className="py-3 px-3">
                        <span className={`${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'} block font-medium`}>
                          {formatDateBangkok(est.created_at)}
                        </span>
                        <span className={`text-[10px] ${isInactive ? 'text-zinc-500' : 'text-[#7A7265]'} block`}>
                          {(() => {
                            const t = formatTimeBangkok(est.created_at);
                            return t.endsWith('น.') || t.endsWith('น') ? t : `${t} น.`;
                          })()}
                        </span>
                      </td>

                      {/* 7. สถานะ */}
                      <td className="py-3 px-3">
                        {renderStatusBadge(est)}
                      </td>

                      {/* 8. การจัดการ */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEstimate(est);
                            }}
                            className={
                              isInactive
                                ? "px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium rounded border border-zinc-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                : "px-2.5 py-1 bg-[#0E0D0C] hover:bg-[#1F1D1A] text-[#ECE4D3] text-xs font-medium rounded border border-[#4A443A] hover:border-[#7A7265] transition-colors inline-flex items-center gap-1 cursor-pointer"
                            }
                          >
                            <span>{isInactive ? 'ดูรายละเอียด' : 'จัดการคำขอจอง'}</span>
                            <ChevronRight size={13} />
                          </button>
                          {est.status === 'REJECTED' && !est.linked_booking && est.request_type !== 'DIRECT_BOOKING' && onDeleteRequest && (
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
            {filteredEstimates.map((est) => {
              const isInactive = est.operational_status?.key === 'CANCELLED' || est.status === 'CANCELLED' || est.status === 'EXPIRED' || est.status === 'REJECTED';
              return (
                <div
                  key={est.id}
                  onClick={() => onSelectEstimate(est)}
                  className={
                    isInactive
                      ? "bg-zinc-950/40 border border-zinc-800/70 rounded-xl p-3.5 space-y-2.5 shadow opacity-85 cursor-pointer"
                      : "bg-[#0E0D0C] border border-[#4A443A] rounded-xl p-3.5 space-y-2.5 shadow cursor-pointer active:scale-[0.99] transition-all"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderRequestTypeBadge(est)}
                      <span className={`text-xs font-semibold ${isInactive ? 'text-zinc-300' : 'text-[#ECE4D3]'} flex items-center gap-1.5 truncate`}>
                        <User size={13} className={isInactive ? 'text-zinc-500 shrink-0' : 'text-[#9C2F2F] shrink-0'} />
                        {est.customer_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {renderHealthAlertBadge(est)}
                      {renderStatusBadge(est)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className={isInactive ? "bg-zinc-900/70 p-2 rounded border border-zinc-800/60" : "bg-[#171512] p-2 rounded border border-[#4A443A]/40"}>
                      <span className="text-[9px] text-[#7A7265] block">ช่างที่ระบุ</span>
                      <span className={isInactive ? "text-zinc-300 truncate block" : "text-[#ECE4D3] truncate block"}>{est.artist_name}</span>
                    </div>
                    <div className={isInactive ? "bg-zinc-900/70 p-2 rounded border border-zinc-800/60" : "bg-[#171512] p-2 rounded border border-[#4A443A]/40"}>
                      <span className="text-[9px] text-[#7A7265] block">ตำแหน่ง</span>
                      <span className={isInactive ? "text-zinc-300 truncate block" : "text-[#ECE4D3] truncate block"}>{est.placement}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end text-[11px] text-[#A89F91] pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEstimate(est);
                        }}
                        className={isInactive ? "text-xs font-medium text-zinc-400 hover:text-zinc-300 flex items-center gap-0.5" : "text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"}
                      >
                        <span>{isInactive ? 'ดูรายละเอียด' : 'จัดการคำขอจอง'}</span>
                        <ChevronRight size={13} />
                      </button>
                      {est.status === 'REJECTED' && !est.linked_booking && est.request_type !== 'DIRECT_BOOKING' && onDeleteRequest && (
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
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
