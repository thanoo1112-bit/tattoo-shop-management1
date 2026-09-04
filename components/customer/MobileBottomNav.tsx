'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Image as ImageIcon, Calendar, Sparkles, User } from 'lucide-react';
import { useApp } from '../AppContext';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { isLoggedIn } = useApp();

  // Hide mobile bottom navigation on authentication pages, admin, and artist routes
  if (
    pathname === '/login' ||
    pathname === '/staff/login' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/artist')
  ) {
    return null;
  }

  const isHomeActive = pathname === '/';
  const isPortfolioActive = pathname.startsWith('/portfolio');
  const isBookingActive = pathname.startsWith('/booking');
  const isFlashActive = pathname.startsWith('/flash');
  const isProfileActive = pathname.startsWith('/portal');

  return (
    <nav 
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-studio-main/95 backdrop-blur-lg border-t border-studio-border px-2 pt-1.5 shadow-2xl font-prompt"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 14px))' }}
    >
      <div className="grid grid-cols-5 items-end max-w-md mx-auto relative">
        
        {/* 1. หน้าแรก (Home) */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-all duration-200 relative ${
            isHomeActive 
              ? 'text-studio-red font-bold' 
              : 'text-studio-secondary hover:text-studio-primary active:scale-95'
          }`}
        >
          <Home size={20} className={isHomeActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'} />
          <span className="text-[10px] mt-1 tracking-wide leading-none">หน้าแรก</span>
          {isHomeActive && (
            <span className="absolute -top-1 w-1 h-1 rounded-full bg-studio-red" />
          )}
        </Link>

        {/* 2. ผลงาน (Portfolio) */}
        <Link
          href="/portfolio"
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-all duration-200 relative ${
            isPortfolioActive 
              ? 'text-studio-red font-bold' 
              : 'text-studio-secondary hover:text-studio-primary active:scale-95'
          }`}
        >
          <ImageIcon size={20} className={isPortfolioActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'} />
          <span className="text-[10px] mt-1 tracking-wide leading-none">ผลงาน</span>
          {isPortfolioActive && (
            <span className="absolute -top-1 w-1 h-1 rounded-full bg-studio-red" />
          )}
        </Link>

        {/* 3. CENTER PRIMARY ACTION: จองคิว (Regular Booking) */}
        <Link
          href="/booking"
          className="flex flex-col items-center justify-center -mt-5 pb-0.5 group focus:outline-none"
        >
          <div 
            className={`rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 border-[3px] border-studio-main ${
              isBookingActive
                ? 'bg-studio-red text-[#ECE4D3] ring-2 ring-studio-red ring-offset-2 ring-offset-studio-main'
                : 'bg-studio-red text-[#ECE4D3] hover:bg-[#802222] active:scale-95'
            }`}
            style={{ width: '52px', height: '52px' }}
          >
            <Calendar size={22} className="stroke-[2.2px]" />
          </div>
          <span className={`text-[10px] mt-1 font-semibold tracking-wide leading-none ${
            isBookingActive ? 'text-studio-red font-bold' : 'text-studio-secondary'
          }`}>
            จองคิว
          </span>
        </Link>

        {/* 4. Flash */}
        <Link
          href="/flash"
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-all duration-200 relative ${
            isFlashActive 
              ? 'text-studio-red font-bold' 
              : 'text-studio-secondary hover:text-studio-primary active:scale-95'
          }`}
        >
          <Sparkles size={20} className={isFlashActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'} />
          <span className="text-[10px] mt-1 tracking-wide leading-none">Flash</span>
          {isFlashActive && (
            <span className="absolute -top-1 w-1 h-1 rounded-full bg-studio-red" />
          )}
        </Link>

        {/* 5. โปรไฟล์ (Profile / Portal) */}
        <Link
          href={isLoggedIn ? '/portal' : '/login'}
          className={`flex flex-col items-center justify-center min-h-[48px] py-1 transition-all duration-200 relative ${
            isProfileActive 
              ? 'text-studio-red font-bold' 
              : 'text-studio-secondary hover:text-studio-primary active:scale-95'
          }`}
        >
          <User size={20} className={isProfileActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'} />
          <span className="text-[10px] mt-1 tracking-wide leading-none">โปรไฟล์</span>
          {isProfileActive && (
            <span className="absolute -top-1 w-1 h-1 rounded-full bg-studio-red" />
          )}
        </Link>

      </div>
    </nav>
  );
}
