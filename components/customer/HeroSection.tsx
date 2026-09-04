'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles, ShieldCheck } from 'lucide-react';

export default function HeroSection() {
  return (
    <section className="relative min-h-[440px] sm:min-h-[500px] lg:min-h-[72vh] xl:min-h-[78vh] flex items-center border-b border-studio-border bg-studio-main px-4 sm:px-6 md:px-12 xl:px-16 overflow-hidden">
      
      {/* Background Studio/Artwork for Mobile */}
      <div className="absolute inset-0 lg:hidden pointer-events-none">
        <img
          src="https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1200&auto=format&fit=crop&q=80"
          alt="157 Tattoo Atmosphere"
          className="w-full h-full object-cover object-center opacity-25 filter grayscale contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-studio-main via-studio-main/85 to-studio-main/95" />
      </div>

      <div className="max-w-[1560px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-center py-8 sm:py-12 lg:py-16 relative z-10">
        
        {/* Left Side (Mobile Full Width / Desktop 45%) */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-6">
          <div className="inline-flex items-center space-x-2 bg-studio-sec border border-studio-border px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-[4px]">
            <span className="w-2 h-2 rounded-full bg-studio-red animate-pulse" />
            <span className="text-[11px] sm:text-xs uppercase tracking-[0.2em] text-studio-paper font-heading">
              Traditional Craft & Dark Ink Studio
            </span>
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <span className="text-xs uppercase tracking-[0.25em] text-studio-muted font-heading block">
              157 TATTOO STUDIO BANGKOK
            </span>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-heading font-normal tracking-[0.04em] text-studio-primary leading-[1.1] sm:leading-[1.05]">
              เปลี่ยนไอเดีย<br />
              <span className="text-studio-red">ให้กลายเป็นงานบนผิว</span>
            </h1>
            <p className="font-caveat text-xl sm:text-2xl text-studio-secondary pt-1 font-normal tracking-wide">
              {"\"Fine craftsmanship, timeless ink on aged flash paper\""}
            </p>
          </div>

          <p className="text-xs sm:text-sm xl:text-base text-studio-secondary font-prompt font-light leading-relaxed max-w-lg">
            จิตวิญญาณแห่งศิลปะการสักชั้นสูง รังสรรค์งานศิลป์ระดับพรีเมียมเฉพาะบุคคล 
            สัมผัสมาตรฐานความสะอาดและปลอดเชื้อระดับสากล ในบรรยากาศ Ink & Aged Paper
          </p>

          {/* CTA Buttons: Full width stack on mobile, horizontal on sm+ */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-1 sm:pt-2 font-prompt">
            <Link
              href="/flash"
              className="w-full sm:w-auto min-h-[48px] sm:min-h-[50px] bg-studio-red text-studio-paper text-xs sm:text-sm uppercase tracking-wider py-3.5 px-6 font-semibold hover:bg-tattoo-red-dark active:scale-[0.98] transition-all rounded-[4px] border border-studio-red flex items-center justify-center space-x-2 text-center"
            >
              <span>เริ่มจองคิวสัก</span>
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/portfolio"
              className="w-full sm:w-auto min-h-[48px] sm:min-h-[50px] bg-transparent text-studio-primary text-xs sm:text-sm uppercase tracking-wider py-3.5 px-6 border border-studio-border hover:bg-studio-sec active:scale-[0.98] transition-all font-medium rounded-[4px] text-center flex items-center justify-center"
            >
              <span>ดูผลงาน (Gallery)</span>
            </Link>
          </div>

          {/* Feature Badges */}
          <div className="pt-4 sm:pt-6 border-t border-studio-border/60 flex items-center space-x-4 sm:space-x-6 text-[11px] sm:text-xs text-studio-secondary font-prompt">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck size={15} className="text-studio-red shrink-0" />
              <span>อุปกรณ์ปลอดเชื้อ 100%</span>
            </div>
            <span className="h-3 w-[1px] bg-studio-border" />
            <span>ช่างประจำร้าน 4 สไตล์</span>
          </div>
        </div>

        {/* Right Side (Desktop 55% Showcase) */}
        <div className="hidden lg:block lg:col-span-7 relative h-[420px] sm:h-[500px] lg:h-[560px] xl:h-[620px] rounded-[8px] overflow-hidden border border-studio-border shadow-2xl group bg-studio-sec">
          <img
            src="https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=1600&auto=format&fit=crop&q=80"
            alt="157 Tattoo Studio Masterpiece"
            className="w-full h-full object-cover object-center transform group-hover:scale-103 transition-transform duration-700 filter grayscale contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-studio-main/90 via-transparent to-transparent opacity-80" />
          
          <div className="absolute bottom-6 left-6 right-6 p-4 bg-studio-sec/90 backdrop-blur-md border border-studio-border rounded-[6px] flex justify-between items-center">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-studio-red font-heading font-normal block">
                Resident Artist Flash Sheet
              </span>
              <h3 className="text-sm xl:text-base font-bold text-studio-primary">
                Dark Serpent & Skull — Blackwork Series
              </h3>
            </div>
            <Link
              href="/portfolio?select=port-1"
              className="text-xs text-studio-primary hover:text-studio-red hover:underline font-semibold flex items-center space-x-1"
            >
              <span>ดูรายละเอียด</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
