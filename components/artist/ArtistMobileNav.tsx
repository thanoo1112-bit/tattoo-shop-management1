'use client';

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Calendar, Users, DollarSign, Sparkles, Image as ImageIcon, Inbox } from 'lucide-react';

export default function ArtistMobileNav() {
  const pathname = usePathname();
  const activeTabRef = useRef<HTMLAnchorElement | null>(null);

  const navItems = [
    { href: '/artist/dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
    { href: '/artist/requests', label: 'คำขอ', icon: Inbox },
    { href: '/artist/calendar', label: 'คิวงานและปฏิทิน', icon: Calendar },
    { href: '/artist/portfolio', label: 'ผลงาน', icon: ImageIcon },
    { href: '/artist/flash', label: 'ลาย Flash', icon: Sparkles },
    { href: '/artist/customers', label: 'ลูกค้า', icon: Users },
    { href: '/artist/revenue', label: 'รายได้', icon: DollarSign },
  ];

  // Auto-scroll the active tab into view when navigating on narrow mobile devices
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [pathname]);

  return (
    <nav
      aria-label="Artist Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 font-prompt pointer-events-none select-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Bottom Bar Background Surface (Starts 12px below top to allow active icon to elevate above the bar line) */}
      <div className="absolute inset-x-0 bottom-0 top-[12px] bg-[#171512]/95 backdrop-blur-md border-t border-[#4A443A] shadow-2xl pointer-events-auto" />

      {/* Nav Items Scroll Track */}
      <div className="relative z-10 flex items-end justify-between px-2 pt-0 pb-1.5 overflow-x-auto scrollbar-none pointer-events-auto">
        <div className="flex items-end justify-around w-full min-w-max mx-auto space-x-1 px-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === '/artist/calendar' && pathname === '/artist/queue');
            const Icon = item.icon;

            if (isActive) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={activeTabRef}
                  className="flex flex-col items-center justify-end py-1 px-2 text-center shrink-0 min-w-[54px] relative"
                >
                  {/* Elevated Circle Icon (Elevated 12px above the bar line) */}
                  <div
                    className="w-[46px] h-[46px] rounded-full bg-[#9C2F2F] text-[#ECE4D3] flex items-center justify-center border-2 border-[#171512] shadow-[0_4px_14px_rgba(156,47,47,0.45)] transition-transform duration-200"
                  >
                    <Icon size={21} className="stroke-[2.2px]" />
                  </div>
                  {/* Active Label */}
                  <span className="text-[10px] font-bold text-[#D64545] whitespace-nowrap mt-1 tracking-tight leading-none">
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-end py-1 px-2 rounded-lg text-center transition-all shrink-0 active:scale-95 group min-w-[54px]"
              >
                {/* Standard Inactive Icon */}
                <div className="w-[32px] h-[32px] flex items-center justify-center">
                  <Icon size={18} className="text-[#7A7265] group-hover:text-[#ECE4D3] transition-colors stroke-[1.8px]" />
                </div>
                {/* Inactive Label */}
                <span className="text-[10px] font-medium text-[#7A7265] group-hover:text-[#ECE4D3] whitespace-nowrap mt-1 tracking-tight leading-none transition-colors">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
