'use client';

import React from 'react';
import { CalendarSessionEvent } from './types';
import {
  formatDateBangkok,
  formatTimeBangkok,
  calculateDurationText,
  getEventStatusConfig,
  getBookingStatusConfig,
  getEventSpecs,
} from './calendarUtils';
import {
  X,
  Phone,
  Calendar,
  Clock,
  ExternalLink,
  Palette,
  Maximize2,
  MapPin,
} from 'lucide-react';

interface CalendarSessionDetailDrawerProps {
  event: CalendarSessionEvent | null;
  onClose: () => void;
}

export default function CalendarSessionDetailDrawer({
  event,
  onClose,
}: CalendarSessionDetailDrawerProps) {
  if (!event) return null;

  const sessionStatusCfg = getEventStatusConfig(event);
  const durationText = calculateDurationText(event.start_at, event.end_at);

  const specs = getEventSpecs(event);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Content */}
      <div className="relative w-full max-w-md bg-[#12100E] border-l border-[#4A443A]/60 h-full overflow-y-auto shadow-2xl z-10 flex flex-col justify-between">
        {/* Top Header */}
        <div>
          <div className="p-4 sm:p-5 border-b border-[#4A443A]/40 flex items-center justify-between bg-[#171512]">
            <div>
              <span className="text-[10px] text-[#A89F91] uppercase tracking-wider block">
                รายละเอียดรอบนัดหมาย
              </span>
              <h3 className="text-base font-bold text-[#ECE4D3] flex items-center gap-2">
                <span>รอบสัก #{event.session_number}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${sessionStatusCfg.badgeBg} ${sessionStatusCfg.badgeText} border-white/10`}
                >
                  {sessionStatusCfg.label}
                </span>
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#0E0D0C] rounded-lg border border-[#4A443A]/40 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-5 space-y-4">
            {/* 1. Schedule Box */}
            <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-xs text-[#ECE4D3] font-semibold">
                <Calendar size={14} className="text-[#9C2F2F]" />
                <span>{formatDateBangkok(event.start_at, true)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#A89F91] pt-1 border-t border-[#4A443A]/30">
                <div className="flex items-center gap-1.5 font-medium text-[#ECE4D3]">
                  <Clock size={13} className="text-[#9C2F2F]" />
                  <span>เวลานัด {formatTimeBangkok(event.start_at)}</span>
                </div>
                <span className="text-[11px] font-medium text-[#A89F91] bg-[#0E0D0C] px-2 py-0.5 rounded border border-[#4A443A]/40">
                  กันคิวประมาณ {durationText}
                </span>
              </div>
            </div>

            {/* Tattoo Specs Box */}
            <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                  <Palette size={12} className="text-[#9C2F2F]" /> สไตล์งาน
                </span>
                <span className="font-bold text-[#ECE4D3] text-[11px]">{specs.style}</span>
              </div>

              <div className="flex justify-between items-center pt-1.5 border-t border-[#4A443A]/30">
                <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                  <Maximize2 size={12} className="text-[#9C2F2F]" /> ขนาดรอยสัก
                </span>
                <span className="font-bold text-[#ECE4D3] text-[11px]">{specs.size}</span>
              </div>

              <div className="flex justify-between items-center pt-1.5 border-t border-[#4A443A]/30">
                <span className="text-[#A89F91] flex items-center gap-1.5 text-[11px]">
                  <MapPin size={12} className="text-[#9C2F2F]" /> ตำแหน่งที่สัก
                </span>
                <span className="font-bold text-[#ECE4D3] text-[11px]">{specs.placement}</span>
              </div>
            </div>

            {/* 2. Customer & Artist Info */}
            <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3.5 space-y-3">
              {/* Customer */}
              <div>
                <span className="text-[10px] text-[#7A7265] uppercase tracking-wider block mb-1">
                  ข้อมูลลูกค้า
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#ECE4D3]">
                    {event.customer?.display_name || 'ลูกค้า'}
                  </span>
                  {event.customer?.phone && (
                    <a
                      href={`tel:${event.customer.phone}`}
                      className="text-xs text-[#A89F91] hover:text-[#ECE4D3] flex items-center gap-1 bg-[#0E0D0C] px-2 py-1 rounded border border-[#4A443A]/40 transition-colors"
                    >
                      <Phone size={11} className="text-emerald-400" />
                      <span>{event.customer.phone}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Artist */}
              <div className="pt-2 border-t border-[#4A443A]/30">
                <span className="text-[10px] text-[#7A7265] uppercase tracking-wider block mb-1">
                  ช่างสักประจำงาน
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-[10px] font-bold text-[#ECE4D3]">
                    {event.artist?.nickname?.[0] || event.artist?.name?.[0] || 'A'}
                  </div>
                  <span className="text-xs text-[#ECE4D3] font-medium">
                    {event.artist?.name}{' '}
                    {event.artist?.nickname ? `(${event.artist.nickname})` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Parent Booking Status */}
            {event.booking && (() => {
              const bCfg = getBookingStatusConfig(event.booking.status);
              return (
                <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3.5 space-y-1.5">
                  <span className="text-[10px] text-[#7A7265] uppercase tracking-wider block">
                    สถานะคิวงาน
                  </span>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${bCfg.bg} ${bCfg.text} ${bCfg.border}`}>
                      {bCfg.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#A89F91] pt-0.5 font-light">
                    คิวนี้ถูกบันทึกลงปฏิทินร้านแล้ว
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 sm:p-5 border-t border-[#4A443A]/40 bg-[#171512] space-y-2">
          {/* Action 1: Go to Booking Management */}
          <a
            href={`/admin/requests?tab=bookings${event?.booking_id ? `&booking_id=${event.booking_id}` : ''}`}
            className="w-full py-2.5 bg-[#9C2F2F] hover:bg-[#852525] text-xs font-bold text-white rounded-xl transition-all shadow-md shadow-[#9C2F2F]/20 flex items-center justify-center gap-1.5"
          >
            <ExternalLink size={14} />
            <span>ดูรายละเอียดและจัดการคิวงาน</span>
          </a>
        </div>
      </div>
    </div>
  );
}
