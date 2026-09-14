'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  Clock, 
  Maximize2, 
  ExternalLink,
  Layers,
  Palette
} from 'lucide-react';

export type TattooServiceType =
  | 'NEW_SMALL'
  | 'NEW_MEDIUM'
  | 'NEW_LARGE'
  | 'FLASH'
  | 'COVER_UP'
  | 'CUSTOM'
  | 'CONSULTATION';

interface TattooServiceSelectorProps {
  selectedService: TattooServiceType | null;
  onSelectService: (service: TattooServiceType) => void;
  onNext: () => void;
}

export default function TattooServiceSelector({
  selectedService,
  onSelectService,
  onNext,
}: TattooServiceSelectorProps) {
  const router = useRouter();

  const handleNextClick = () => {
    if (!selectedService) return;
    if (selectedService === 'FLASH') {
      router.push('/flash');
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-8 font-prompt text-studio-primary">
      
      {/* SECTION A: งานสักลายใหม่ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-studio-red text-sm">✦</span>
          <h2 className="text-base sm:text-lg font-bold text-studio-primary tracking-wide">
            งานสักลายใหม่
          </h2>
          <span className="text-studio-red text-sm">✦</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CARD 1: ไซส์เล็ก */}
          <div
            onClick={() => onSelectService('NEW_SMALL')}
            className={`relative rounded-lg p-4 sm:p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between border ${
              selectedService === 'NEW_SMALL'
                ? 'bg-studio-sec border-studio-red ring-1 ring-studio-red/50 shadow-md'
                : 'bg-studio-card border-studio-border hover:border-studio-secondary/60'
            }`}
          >
            {selectedService === 'NEW_SMALL' && (
              <div className="absolute top-3 right-3 text-studio-red">
                <CheckCircle2 className="w-5 h-5 fill-studio-red/10" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 pr-6">
                <h3 className="font-bold text-sm sm:text-base text-studio-primary">
                  สักลายใหม่ — ไซส์เล็ก
                </h3>
              </div>
              <span className="inline-block mt-1 text-[11px] uppercase tracking-wider text-studio-secondary font-mono bg-studio-main px-2 py-0.5 rounded border border-studio-border/60">
                Minimal
              </span>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-baseline gap-1 text-studio-paper font-semibold text-base sm:text-lg">
                  <span className="text-xs font-normal text-studio-secondary">ราคา:</span> ฿500
                </div>

                <div className="bg-studio-main/60 p-2 rounded border border-studio-border/40 text-studio-secondary space-y-1">
                  <div className="flex items-center gap-1.5 text-studio-primary font-medium">
                    <Maximize2 className="w-3.5 h-3.5 text-studio-red shrink-0" />
                    <span>ไม่เกิน 5 × 5 ซม.</span>
                  </div>
                  <p className="text-[11px] text-studio-muted pl-5">ประมาณเหรียญ 10</p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-studio-border/60 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between text-studio-secondary">
                <span className="text-studio-muted">มัดจำ:</span>
                <span className="font-bold text-studio-paper">฿300</span>
              </div>
              <div className="flex items-center justify-between text-studio-secondary">
                <span className="text-studio-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-studio-muted" /> เวลาสักประมาณ:
                </span>
                <span>2–3 ชั่วโมง</span>
              </div>
            </div>
          </div>

          {/* CARD 2: ไซส์กลาง */}
          <div
            onClick={() => onSelectService('NEW_MEDIUM')}
            className={`relative rounded-lg p-4 sm:p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between border ${
              selectedService === 'NEW_MEDIUM'
                ? 'bg-studio-sec border-studio-red ring-1 ring-studio-red/50 shadow-md'
                : 'bg-studio-card border-studio-border hover:border-studio-secondary/60'
            }`}
          >
            {selectedService === 'NEW_MEDIUM' && (
              <div className="absolute top-3 right-3 text-studio-red">
                <CheckCircle2 className="w-5 h-5 fill-studio-red/10" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 pr-6">
                <h3 className="font-bold text-sm sm:text-base text-studio-primary">
                  สักลายใหม่ — ไซส์กลาง
                </h3>
              </div>
              <span className="inline-block mt-1 text-[11px] uppercase tracking-wider text-studio-secondary font-mono bg-studio-main px-2 py-0.5 rounded border border-studio-border/60">
                Medium
              </span>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-baseline gap-1 text-studio-paper font-semibold text-base sm:text-lg">
                  <span className="text-xs font-normal text-studio-secondary">ราคา:</span> ฿3,000–6,000
                </div>

                <div className="bg-studio-main/60 p-2 rounded border border-studio-border/40 text-studio-secondary space-y-1">
                  <div className="flex items-center gap-1.5 text-studio-primary font-medium">
                    <Maximize2 className="w-3.5 h-3.5 text-studio-red shrink-0" />
                    <span>ประมาณ 10–15 ซม.</span>
                  </div>
                  <p className="text-[11px] text-studio-muted pl-5">ขนาดประมาณฝ่ามือ</p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-studio-border/60 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between text-studio-secondary">
                <span className="text-studio-muted">มัดจำ:</span>
                <span className="font-bold text-studio-paper">฿500</span>
              </div>
              <div className="flex items-center justify-between text-studio-secondary">
                <span className="text-studio-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-studio-muted" /> เวลาสักประมาณ:
                </span>
                <span>3–4 ชั่วโมง</span>
              </div>
            </div>
          </div>

          {/* CARD 3: ไซส์ใหญ่ */}
          <div
            onClick={() => onSelectService('NEW_LARGE')}
            className={`relative rounded-lg p-4 sm:p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between border ${
              selectedService === 'NEW_LARGE'
                ? 'bg-studio-sec border-studio-red ring-1 ring-studio-red/50 shadow-md'
                : 'bg-studio-card border-studio-border hover:border-studio-secondary/60'
            }`}
          >
            {selectedService === 'NEW_LARGE' && (
              <div className="absolute top-3 right-3 text-studio-red">
                <CheckCircle2 className="w-5 h-5 fill-studio-red/10" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 pr-6">
                <h3 className="font-bold text-sm sm:text-base text-studio-primary">
                  สักลายใหม่ — ไซส์ใหญ่
                </h3>
              </div>
              <span className="inline-block mt-1 text-[11px] uppercase tracking-wider text-studio-secondary font-mono bg-studio-main px-2 py-0.5 rounded border border-studio-border/60">
                Large
              </span>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-baseline gap-1 text-studio-paper font-semibold text-base sm:text-lg">
                  <span className="text-xs font-normal text-studio-secondary">ราคา:</span> เริ่มต้น ฿8,000+
                </div>

                <div className="bg-studio-main/60 p-2 rounded border border-studio-border/40 text-studio-secondary space-y-1">
                  <div className="flex items-center gap-1.5 text-studio-red shrink-0">
                    <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-studio-primary font-medium">A4 ขึ้นไป</span>
                  </div>
                  <p className="text-[11px] text-studio-muted pl-5">งานขนาดใหญ่ / งานเหมาวัน</p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-studio-border/60 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between text-studio-secondary">
                <span className="text-studio-muted">มัดจำ:</span>
                <span className="font-bold text-studio-paper">฿1,000</span>
              </div>
              <div className="flex items-center justify-between text-studio-secondary">
                <span className="text-studio-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-studio-muted" /> เวลาสักประมาณ:
                </span>
                <span>6–8 ชั่วโมง</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION B: งานบริการเฉพาะทาง */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-studio-red text-sm">✦</span>
          <h2 className="text-base sm:text-lg font-bold text-studio-primary tracking-wide">
            งานบริการเฉพาะทาง
          </h2>
          <span className="text-studio-red text-sm">✦</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CARD 4: ลาย Flash ของร้าน */}
          <div
            onClick={() => onSelectService('FLASH')}
            className={`relative rounded-lg p-4 sm:p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between border ${
              selectedService === 'FLASH'
                ? 'bg-studio-sec border-studio-red ring-1 ring-studio-red/50 shadow-md'
                : 'bg-studio-card border-studio-border hover:border-studio-secondary/60'
            }`}
          >
            {selectedService === 'FLASH' && (
              <div className="absolute top-3 right-3 text-studio-red">
                <CheckCircle2 className="w-5 h-5 fill-studio-red/10" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 pr-6">
                <Sparkles className="w-4 h-4 text-studio-red shrink-0" />
                <h3 className="font-bold text-sm sm:text-base text-studio-primary">
                  ลาย Flash ของร้าน
                </h3>
              </div>
              <span className="inline-block mt-1 text-[11px] uppercase tracking-wider text-studio-secondary font-mono bg-studio-main px-2 py-0.5 rounded border border-studio-border/60">
                Flash Collection
              </span>

              <p className="mt-3 text-xs text-studio-secondary leading-relaxed">
                เลือกลายสำเร็จจากคอลเลกชัน Flash ของร้าน
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-studio-border/60 flex items-center justify-between text-xs text-studio-red font-medium">
              <span>เลือกดูคอลเลกชัน Flash</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* CARD 5: งานแก้ลาย / ทับลายเดิม */}
          <div
            onClick={() => onSelectService('COVER_UP')}
            className={`relative rounded-lg p-4 sm:p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between border ${
              selectedService === 'COVER_UP'
                ? 'bg-studio-sec border-studio-red ring-1 ring-studio-red/50 shadow-md'
                : 'bg-studio-card border-studio-border hover:border-studio-secondary/60'
            }`}
          >
            {selectedService === 'COVER_UP' && (
              <div className="absolute top-3 right-3 text-studio-red">
                <CheckCircle2 className="w-5 h-5 fill-studio-red/10" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 pr-6">
                <Layers className="w-4 h-4 text-studio-secondary shrink-0" />
                <h3 className="font-bold text-sm sm:text-base text-studio-primary">
                  งานแก้ลาย / ทับลายเดิม
                </h3>
              </div>
              <span className="inline-block mt-1 text-[11px] uppercase tracking-wider text-studio-secondary font-mono bg-studio-main px-2 py-0.5 rounded border border-studio-border/60">
                Cover-up
              </span>

              <p className="mt-3 text-xs text-studio-secondary leading-relaxed">
                สำหรับแก้ไข ต่อเติม หรือสักทับลายเดิม
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-studio-border/60 flex items-center justify-between text-xs text-studio-secondary">
              <span className="text-studio-muted">มัดจำ:</span>
              <span className="font-bold text-studio-paper">฿500</span>
            </div>
          </div>

          {/* CARD 6: งานออกแบบใหม่ตามสั่ง */}
          <div
            onClick={() => onSelectService('CUSTOM')}
            className={`relative rounded-lg p-4 sm:p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between border ${
              selectedService === 'CUSTOM'
                ? 'bg-studio-sec border-studio-red ring-1 ring-studio-red/50 shadow-md'
                : 'bg-studio-card border-studio-border hover:border-studio-secondary/60'
            }`}
          >
            {selectedService === 'CUSTOM' && (
              <div className="absolute top-3 right-3 text-studio-red">
                <CheckCircle2 className="w-5 h-5 fill-studio-red/10" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 pr-6">
                <Palette className="w-4 h-4 text-studio-secondary shrink-0" />
                <h3 className="font-bold text-sm sm:text-base text-studio-primary">
                  งานออกแบบใหม่ตามสั่ง
                </h3>
              </div>
              <span className="inline-block mt-1 text-[11px] uppercase tracking-wider text-studio-secondary font-mono bg-studio-main px-2 py-0.5 rounded border border-studio-border/60">
                Custom
              </span>

              <p className="mt-3 text-xs text-studio-secondary leading-relaxed">
                ออกแบบลายใหม่ตามแนวคิดและรายละเอียดของลูกค้า
              </p>

              <div className="mt-3 text-xs text-studio-paper font-medium">
                <span className="text-studio-muted font-normal">ราคา:</span> ตามขนาดจริง + ค่าออกแบบ
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-studio-border/60 flex items-center justify-between text-xs text-studio-secondary">
              <span className="text-studio-muted">มัดจำ:</span>
              <span className="font-bold text-studio-paper">฿500</span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION C: สำหรับผู้ที่ต้องการปรึกษา */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-studio-red text-sm">✦</span>
          <h2 className="text-base sm:text-lg font-bold text-studio-primary tracking-wide">
            สำหรับผู้ที่ต้องการปรึกษา
          </h2>
          <span className="text-studio-red text-sm">✦</span>
        </div>

        {/* CARD 7: Consultation Card with Subtle Emphasis */}
        <div
          onClick={() => onSelectService('CONSULTATION')}
          className={`relative rounded-lg p-5 sm:p-6 cursor-pointer transition-all duration-200 border ${
            selectedService === 'CONSULTATION'
              ? 'bg-studio-sec border-studio-red ring-1 ring-studio-red/60 shadow-lg shadow-studio-red/5'
              : 'bg-studio-card/90 border-studio-border/80 hover:border-studio-secondary/70'
          }`}
        >
          {selectedService === 'CONSULTATION' && (
            <div className="absolute top-4 right-4 text-studio-red">
              <CheckCircle2 className="w-5 h-5 fill-studio-red/10" />
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-lg">❓</span>
                <h3 className="font-bold text-base sm:text-lg text-studio-primary">
                  ไม่แน่ใจขนาด / ปรึกษาช่างก่อน
                </h3>
                <span className="text-[11px] uppercase tracking-wider text-studio-paper font-mono bg-studio-red/20 text-studio-paper px-2.5 py-0.5 rounded border border-studio-red/40 font-semibold">
                  Consultation
                </span>
              </div>
              <p className="text-xs sm:text-sm text-studio-secondary leading-relaxed sm:pl-7">
                เหมาะสำหรับผู้ที่ยังไม่แน่ใจเรื่องขนาด รูปแบบ หรือต้องการปรึกษาช่างก่อน
              </p>
            </div>

            <div className="sm:text-right shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-studio-border/60">
              <div className="text-xs text-studio-muted">มัดจำล็อกคิว</div>
              <div className="text-lg sm:text-xl font-bold text-studio-paper">฿500</div>
            </div>
          </div>
        </div>
      </div>

      {/* DISCLAIMER */}
      <div className="pt-2 border-t border-studio-border/40">
        <p className="text-xs text-studio-muted font-light leading-relaxed">
          * ราคาที่แสดงเป็นราคาเบื้องต้น ราคาอาจเปลี่ยนแปลงตามรายละเอียด ความยาก ตำแหน่ง และขนาดของงานจริง
        </p>
      </div>

      {/* NEXT BUTTON */}
      <div className="pt-4 flex justify-end">
        <button
          type="button"
          onClick={handleNextClick}
          disabled={!selectedService}
          className={`w-full sm:w-auto px-8 py-3.5 sm:py-3 rounded-[6px] font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-all duration-200 ${
            !selectedService
              ? 'bg-studio-sec border border-studio-border text-studio-muted cursor-not-allowed opacity-50'
              : 'bg-studio-red text-studio-paper border border-studio-red hover:bg-tattoo-red-dark cursor-pointer shadow-md shadow-studio-red/20'
          }`}
        >
          <span>
            {selectedService === 'FLASH' ? 'ไปยังคอลเลกชัน Flash' : 'ถัดไป'}
          </span>
          {selectedService === 'FLASH' ? (
            <ExternalLink className="w-4 h-4" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
