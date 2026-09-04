'use client';

import React from 'react';
import { CalendarSessionEvent } from './types';
import {
  formatDateBangkok,
  formatTimeBangkok,
  calculateDurationText,
  getSessionStatusConfig,
  getBookingStatusConfig,
} from './calendarUtils';
import {
  X,
  User,
  Phone,
  Calendar,
  Clock,
  ExternalLink,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  FileText,
  BadgeDollarSign,
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

  const sessionStatusCfg = getSessionStatusConfig(event.status);
  const bookingStatusCfg = event.booking
    ? getBookingStatusConfig(event.booking.status)
    : null;
  const durationText = calculateDurationText(event.start_at, event.end_at);

  const formatCurrency = (val: number | undefined | null) =>
    Number(val ?? 0).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

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
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="text-[#7A7265]" />
                  <span>
                    {formatTimeBangkok(event.start_at)} - {formatTimeBangkok(event.end_at)}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-[#ECE4D3] bg-[#0E0D0C] px-2 py-0.5 rounded border border-[#4A443A]/40">
                  ระยะเวลา {durationText}
                </span>
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
            {event.booking && bookingStatusCfg && (
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3.5 space-y-1.5">
                <span className="text-[10px] text-[#7A7265] uppercase tracking-wider block">
                  สถานะคิวงานหลัก (Booking)
                </span>
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold border ${bookingStatusCfg.bg} ${bookingStatusCfg.text} ${bookingStatusCfg.border}`}
                  >
                    {bookingStatusCfg.label}
                  </span>
                  {event.booking.status === 'WAITING_DEPOSIT' && (
                    <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                      <AlertCircle size={12} />
                      <span>รอลูกค้าชำระมัดจำ</span>
                    </span>
                  )}
                </div>
                {event.booking.customer_note && (
                  <p className="text-[11px] text-[#A89F91] pt-1 italic font-light">
                    &ldquo;{event.booking.customer_note}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* 4. Session Note */}
            {event.note && (
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] text-[#7A7265] uppercase tracking-wider flex items-center gap-1">
                  <FileText size={11} />
                  <span>บันทึกสำหรับรอบนี้</span>
                </span>
                <p className="text-xs text-[#ECE4D3] font-light">{event.note}</p>
              </div>
            )}

            {/* 5. Financial Summary */}
            {event.financial && (
              <div className="bg-[#171512] border border-[#4A443A]/40 rounded-xl p-3.5 space-y-2.5">
                <span className="text-[10px] text-[#7A7265] uppercase tracking-wider flex items-center gap-1">
                  <BadgeDollarSign size={12} />
                  <span>สรุปการเงินของคิวงาน</span>
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#0E0D0C] p-2 rounded-lg border border-[#4A443A]/30">
                    <span className="text-[10px] text-[#7A7265] block">ราคาประเมิน</span>
                    <span className="font-bold text-[#ECE4D3]">
                      ฿{formatCurrency(event.financial.quoted_price)}
                    </span>
                  </div>
                  <div className="bg-[#0E0D0C] p-2 rounded-lg border border-[#4A443A]/30">
                    <span className="text-[10px] text-[#7A7265] block">มัดจำที่ต้องชำระ</span>
                    <span className="font-bold text-[#ECE4D3]">
                      ฿{formatCurrency(event.financial.deposit_required)}
                    </span>
                  </div>
                  <div className="bg-[#0E0D0C] p-2 rounded-lg border border-[#4A443A]/30">
                    <span className="text-[10px] text-[#7A7265] block">ชำระแล้วทั้งหมด</span>
                    <span className="font-bold text-emerald-400">
                      ฿{formatCurrency(event.financial.paid_total)}
                    </span>
                  </div>
                  <div className="bg-[#0E0D0C] p-2 rounded-lg border border-[#4A443A]/30">
                    <span className="text-[10px] text-[#7A7265] block">ยอดคงเหลือ</span>
                    <span
                      className={`font-bold ${
                        event.financial.remaining_balance > 0
                          ? 'text-amber-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      ฿{formatCurrency(event.financial.remaining_balance)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-4 sm:p-5 border-t border-[#4A443A]/40 bg-[#171512] space-y-2">
          {/* Action 1: Go to Booking Management */}
          <a
            href="/admin/requests"
            className="w-full py-2.5 bg-[#9C2F2F] hover:bg-[#852525] text-xs font-bold text-white rounded-xl transition-all shadow-md shadow-[#9C2F2F]/20 flex items-center justify-center gap-1.5"
          >
            <ExternalLink size={14} />
            <span>ดูรายละเอียดและจัดการคิวงาน</span>
          </a>

          {/* Action 2: Go to Payment Recording if balance unpaid */}
          {event.financial && event.financial.remaining_balance > 0 && (
            <a
              href="/admin/payments"
              className="w-full py-2 bg-[#0E0D0C] hover:bg-[#1A1815] text-xs font-semibold text-[#A89F91] hover:text-[#ECE4D3] border border-[#4A443A] rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              <CreditCard size={14} />
              <span>บันทึกการรับเงิน</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
