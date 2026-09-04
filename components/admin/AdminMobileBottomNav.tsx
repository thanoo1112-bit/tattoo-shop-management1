'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../AppContext';
import { LayoutDashboard, Calendar, FileText, UserCheck, CreditCard, Sparkles, Image as ImageIcon } from 'lucide-react';

export default function AdminMobileBottomNav() {
  const pathname = usePathname();
  const { bookingPayments, estimateRequests } = useApp();

  const pendingCount =
    bookingPayments.filter((p) => p.paymentType === 'DEPOSIT' && p.status === 'SUBMITTED').length +
    estimateRequests.filter((e) => e.status === 'PENDING').length;

  const navItems = [
    {
      name: 'ภาพรวม',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
    },
    {
      name: 'คำขอ',
      href: '/admin/requests',
      icon: FileText,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    {
      name: 'ลาย Flash',
      href: '/admin/flash',
      icon: Sparkles,
    },
    {
      name: 'ผลงาน',
      href: '/admin/portfolio',
      icon: ImageIcon,
    },
    {
      name: 'การเงิน',
      href: '/admin/payments',
      icon: CreditCard,
    },
    {
      name: 'ปฏิทิน',
      href: '/admin/calendar',
      icon: Calendar,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#171512]/95 backdrop-blur-md border-t border-[#4A443A] h-[64px] px-3 font-prompt flex items-center justify-around">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));
        const Icon = item.icon;

        return (
          <Link
            key={item.name}
            href={item.href}
            className={`relative flex flex-col items-center justify-center py-1 px-3 transition-colors ${
              isActive ? 'text-[#ECE4D3]' : 'text-[#7A7265] hover:text-[#A89F91]'
            }`}
          >
            <div className="relative">
              <Icon
                size={20}
                className={isActive ? 'text-[#9C2F2F]' : 'text-[#7A7265]'}
              />
              {item.badge && (
                <span className="absolute -top-1 -right-2 bg-[#9C2F2F] text-[#ECE4D3] text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-[#171512]">
                  {item.badge}
                </span>
              )}
            </div>
            <span
              className={`text-[10px] mt-1 font-medium tracking-wide ${
                isActive ? 'text-[#ECE4D3] font-semibold' : 'text-[#7A7265]'
              }`}
            >
              {item.name}
            </span>
            {isActive && (
              <span className="absolute bottom-0 w-8 h-[2px] bg-[#9C2F2F] rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
