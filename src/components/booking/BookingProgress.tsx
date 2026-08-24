import React from 'react';
import { Check } from 'lucide-react';

export default function BookingProgress({ currentStep }: { currentStep: number }) {
  const steps = [
    { num: 1, label: 'เลือกช่างสัก' },
    { num: 2, label: 'ลาย & ตำแหน่ง' },
    { num: 3, label: 'วัน & เวลา' },
    { num: 4, label: 'ข้อมูลติดต่อ & สรุปคำขอ' },
  ];

  return (
    <div className="w-full pb-8 md:pb-12 max-w-[1024px] mx-auto">
      <div className="flex items-center w-full justify-between relative">
        {/* Connector Background */}
        <div className="absolute top-[14px] md:top-[16px] left-0 w-full h-[1px] bg-[#262626] z-0" />

        {steps.map((step) => {
          const isActive = step.num === currentStep;
          const isPast = step.num < currentStep;
          
          return (
            <div key={step.num} className="flex flex-col items-center relative z-10 bg-[#0A0A0A] px-2 md:px-4">
              <div 
                className={`w-[28px] h-[28px] md:w-[32px] md:h-[32px] rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isActive 
                    ? 'bg-[#FFFFFF] text-black border-2 border-[#FFFFFF]' 
                    : isPast 
                      ? 'bg-[#0A0A0A] text-[#F5F5F5] border-2 border-[#FFFFFF]' 
                      : 'bg-[#171717] text-[#737373] border-2 border-[#262626]'
                }`}
              >
                {isPast ? <Check size={14} strokeWidth={3} /> : step.num}
              </div>
              <span className={`mt-2 text-[10px] md:text-xs font-semibold uppercase tracking-wider text-center ${
                isActive ? 'text-[#F5F5F5]' : isPast ? 'text-[#A3A3A3]' : 'text-[#737373]'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
