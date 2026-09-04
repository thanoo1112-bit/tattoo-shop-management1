'use client';

import React from 'react';
import { Calendar, Clock, User, ShieldAlert, DollarSign, Send } from 'lucide-react';

interface BookingSummaryProps {
  artworkImage?: string;
  artworkTitle?: string;
  artistName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  price: number;
  deposit: number;
  onSubmit: () => void;
  isLoading?: boolean;
}

export default function BookingSummary({
  artworkImage,
  artworkTitle = 'ออกแบบใหม่เฉพาะบุคคล (Custom Design)',
  artistName,
  date,
  startTime,
  endTime,
  duration,
  price,
  deposit,
  onSubmit,
  isLoading = false,
}: BookingSummaryProps) {
  const formatThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const day = parseInt(parts[2], 10);
    const month = months[parseInt(parts[1], 10) - 1];
    const year = parseInt(parts[0], 10) + 543;
    return `${day} ${month} ${year}`;
  };

  return (
    <div className="bg-paper text-studio-sec border border-studio-border p-5 sm:p-6 rounded-[6px] w-full flex flex-col space-y-4 shadow-md font-prompt">
      <div className="flex justify-between items-center border-b border-studio-border/50 pb-2.5">
        <span className="text-xs uppercase tracking-wider text-studio-sec font-heading font-normal">
          BOOKING SHEET • สรุปรายละเอียดรายการจอง
        </span>
        <span className="text-[10px] bg-studio-sec text-studio-paper px-2.5 py-0.5 rounded font-medium">
          SUMMARY
        </span>
      </div>

      {/* Visual Header */}
      <div className="flex space-x-3.5 items-center bg-paper-dark/30 p-3 rounded border border-studio-border/30">
        {artworkImage ? (
          <img src={artworkImage} alt={artworkTitle} className="w-16 h-16 object-cover bg-studio-main border border-studio-border rounded-[4px] shrink-0" />
        ) : (
          <div className="w-16 h-16 bg-studio-sec border border-studio-border rounded-[4px] flex items-center justify-center text-studio-red shrink-0">
            <User size={24} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-heading font-normal tracking-wide text-studio-sec line-clamp-1">{artworkTitle}</h4>
          <span className="text-xs text-studio-muted">ช่างสัก: <strong className="text-studio-sec">{artistName}</strong></span>
        </div>
      </div>

      {/* Booking Specs */}
      <div className="space-y-2.5 border-t border-b border-studio-border/50 py-3.5 text-xs text-studio-sec">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2 text-studio-muted">
            <Calendar size={14} className="text-studio-red" />
            <span>วันที่นัดหมาย</span>
          </div>
          <span className="font-semibold">{formatThaiDate(date) || 'ยังไม่ได้เลือก'}</span>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2 text-studio-muted">
            <Clock size={14} className="text-studio-red" />
            <span>เวลาปฏิบัติงาน</span>
          </div>
          <span className="font-semibold">
            {startTime && endTime ? `${startTime} — ${endTime} (${duration} ชม.)` : 'ยังไม่ได้เลือก'}
          </span>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-studio-border/30">
          <span className="text-studio-muted">ราคาค่าบริการสัก</span>
          <span className="font-bold text-studio-sec">฿{price.toLocaleString()}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-studio-red font-medium">ค่ามัดจำสำหรับจอง (Deposit)</span>
          <span className="font-bold text-studio-red text-base">฿{deposit.toLocaleString()}</span>
        </div>
      </div>

      {/* Business Rules Warnings */}
      <div className="bg-paper-dark/40 border border-studio-border/40 p-3 rounded-[4px] flex items-start space-x-2.5 text-[11px] text-studio-sec leading-relaxed">
        <ShieldAlert size={16} className="text-studio-red shrink-0 mt-0.5" />
        <div>
          <span>การส่งคำขอจองไม่ได้เป็นการการันตีคิวทันที ร้านจะตรวจสอบและยืนยันคำขอ จากนั้นท่านสามารถชำระมัดจำผ่านหน้า Portal ได้</span>
        </div>
      </div>

      {/* Sticky Bottom Action */}
      <button
        onClick={onSubmit}
        disabled={isLoading || !date || !startTime}
        className="min-h-[48px] sm:min-h-[50px] w-full bg-studio-red hover:bg-tattoo-red-dark active:scale-[0.98] text-studio-paper text-xs uppercase tracking-wider py-3.5 px-4 font-semibold transition-all rounded-[4px] shadow-md flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed border border-studio-red"
      >
        <Send size={15} />
        <span>{isLoading ? 'กำลังส่งคำขอจองคิว...' : 'ยืนยันและส่งคำขอจองคิว'}</span>
      </button>
    </div>
  );
}
