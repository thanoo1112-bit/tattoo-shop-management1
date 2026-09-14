'use client';

import React from 'react';
import { Calculator, CalendarCheck, ArrowRight, Clock } from 'lucide-react';

interface BookingTypeSelectionProps {
  onSelectEstimate: () => void;
}

export default function BookingTypeSelection({ onSelectEstimate }: BookingTypeSelectionProps) {
  return (
    <div className="space-y-8 animate-fadeIn font-prompt">
      {/* Header Section */}
      <div className="text-center space-y-2 max-w-xl mx-auto">
        <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">157 TATTOO STUDIO</span>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-wider text-studio-primary">
          เลือกวิธีการจอง
        </h1>
        <p className="text-xs sm:text-sm text-studio-secondary font-light">
          เลือกวิธีที่เหมาะกับงานสักของคุณ
        </p>
      </div>

      {/* 2-Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto pt-2">
        
        {/* CARD 1 — ขอประเมินราคา (Ready / Enabled) */}
        <div className="bg-studio-card border border-studio-border hover:border-studio-red/60 transition-all rounded-[8px] p-6 sm:p-8 flex flex-col justify-between shadow-xl group">
          <div className="space-y-5">
            {/* Header / Icon */}
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-[6px] bg-studio-sec border border-studio-border flex items-center justify-center text-studio-red group-hover:scale-105 transition-transform">
                <Calculator size={24} />
              </div>
              <span className="text-[10px] uppercase tracking-widest bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 px-2.5 py-1 rounded font-medium">
                พร้อมใช้งาน
              </span>
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-bold text-studio-primary group-hover:text-studio-red transition-colors">
                ขอประเมินราคา
              </h2>
              <p className="text-xs sm:text-sm text-studio-secondary font-light leading-relaxed">
                สำหรับงานที่ยังไม่ได้ตกลงราคา ให้ช่างตรวจรายละเอียดและประเมินราคาก่อน
              </p>
            </div>

            {/* Short Flow Steps */}
            <div className="pt-2 border-t border-studio-border/60 space-y-2">
              <span className="text-[11px] text-studio-secondary font-medium block">ขั้นตอนงาน:</span>
              <div className="flex items-center space-x-1.5 text-[11px] text-studio-secondary flex-wrap gap-y-1">
                <span className="bg-studio-sec border border-studio-border px-2 py-0.5 rounded text-studio-primary">ส่งรายละเอียด</span>
                <span>→</span>
                <span className="bg-studio-sec border border-studio-border px-2 py-0.5 rounded text-studio-primary">ช่างประเมินราคา</span>
                <span>→</span>
                <span className="bg-studio-sec border border-studio-border px-2 py-0.5 rounded text-studio-primary">มัดจำ</span>
                <span>→</span>
                <span className="bg-studio-sec border border-studio-border px-2 py-0.5 rounded text-studio-primary">ยืนยันคิว</span>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="pt-6">
            <button
              onClick={onSelectEstimate}
              className="w-full min-h-[50px] bg-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-[0.99] text-xs sm:text-sm uppercase tracking-wider font-semibold transition-all rounded-[4px] shadow-md flex items-center justify-center space-x-2 border border-studio-red cursor-pointer"
            >
              <span>ขอประเมินราคา</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* CARD 2 — จองคิวพร้อมมัดจำ (Disabled / Coming Soon) */}
        <div className="bg-studio-card/60 border border-studio-border/60 rounded-[8px] p-6 sm:p-8 flex flex-col justify-between shadow-lg opacity-85 relative overflow-hidden">
          <div className="space-y-5">
            {/* Header / Icon / Badge */}
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-[6px] bg-studio-sec/50 border border-studio-border/50 flex items-center justify-center text-studio-secondary">
                <CalendarCheck size={24} />
              </div>
              <span className="text-[10px] uppercase tracking-widest bg-studio-sec border border-studio-border text-amber-400/90 px-2.5 py-1 rounded font-medium flex items-center space-x-1">
                <Clock size={12} className="shrink-0" />
                <span>เร็ว ๆ นี้</span>
              </span>
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-bold text-studio-primary/80">
                จองคิวพร้อมมัดจำ
              </h2>
              <p className="text-xs sm:text-sm text-studio-secondary/80 font-light leading-relaxed">
                สำหรับลูกค้าที่ตกลงรายละเอียดกับช่างแล้ว และพร้อมชำระมัดจำ
              </p>
            </div>

            {/* Short Flow Steps */}
            <div className="pt-2 border-t border-studio-border/40 space-y-2">
              <span className="text-[11px] text-studio-secondary/70 font-medium block">ขั้นตอนงาน:</span>
              <div className="flex items-center space-x-1.5 text-[11px] text-studio-secondary/70 flex-wrap gap-y-1">
                <span className="bg-studio-sec/40 border border-studio-border/40 px-2 py-0.5 rounded">เลือกวันและรายละเอียด</span>
                <span>→</span>
                <span className="bg-studio-sec/40 border border-studio-border/40 px-2 py-0.5 rounded">ส่งมัดจำ</span>
                <span>→</span>
                <span className="bg-studio-sec/40 border border-studio-border/40 px-2 py-0.5 rounded">ตรวจสอบ</span>
                <span>→</span>
                <span className="bg-studio-sec/40 border border-studio-border/40 px-2 py-0.5 rounded">ยืนยันคิว</span>
              </div>
            </div>
          </div>

          {/* CTA Disabled Button */}
          <div className="pt-6">
            <button
              disabled
              className="w-full min-h-[50px] bg-studio-sec/50 text-studio-secondary/60 border border-studio-border/40 text-xs sm:text-sm uppercase tracking-wider font-semibold cursor-not-allowed rounded-[4px] flex items-center justify-center space-x-2"
            >
              <Clock size={15} />
              <span>เร็ว ๆ นี้</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
