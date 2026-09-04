'use client';

import React from 'react';

interface BookingStepperProps {
  currentStep: number; // 1, 2, 3, 4
}

export default function BookingStepper({ currentStep }: BookingStepperProps) {
  const steps = [
    { number: 1, shortLabel: 'งาน', label: 'ช่าง / ผลงาน' },
    { number: 2, shortLabel: 'วัน', label: 'เลือกวันที่' },
    { number: 3, shortLabel: 'เวลา', label: 'เลือกเวลา' },
    { number: 4, shortLabel: 'สรุป', label: 'สรุปรายการ' },
  ];

  return (
    <div className="w-full bg-studio-card border border-studio-border p-3 sm:p-4 rounded-[6px] mb-6 font-prompt">
      <div className="flex items-center justify-between relative max-w-md mx-auto px-2 sm:px-4">
        {/* Horizontal Line under steps */}
        <div className="absolute top-[15px] sm:top-[16px] left-6 right-6 h-[1px] bg-studio-border z-0"></div>

        {steps.map((step) => {
          const isCompleted = step.number < currentStep;
          const isActive = step.number === currentStep;

          return (
            <div key={step.number} className="relative z-10 flex flex-col items-center">
              {/* Circle */}
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-xs font-semibold border transition-colors duration-200 ${
                  isCompleted
                    ? 'bg-studio-red border-studio-red text-studio-paper'
                    : isActive
                    ? 'bg-studio-main border-studio-red text-studio-red ring-2 ring-studio-red/30 font-bold'
                    : 'bg-studio-main border-studio-border text-studio-muted'
                }`}
              >
                {step.number}
              </div>
              {/* Label */}
              <span
                className={`text-[10px] sm:text-xs mt-1 font-medium tracking-wide transition-colors duration-200 ${
                  isActive ? 'text-studio-paper font-semibold' : 'text-studio-secondary'
                }`}
              >
                <span className="inline sm:hidden">{step.shortLabel}</span>
                <span className="hidden sm:inline">{step.label}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
