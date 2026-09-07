'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Calendar, Users, DollarSign } from 'lucide-react';

export default function ArtistMobileNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/artist/dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
    { href: '/artist/calendar', label: 'ปฏิทิน', icon: Calendar },
    { href: '/artist/customers', label: 'ลูกค้า', icon: Users },
    { href: '/artist/revenue', label: 'รายได้', icon: DollarSign },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-studio-card/95 backdrop-blur-md border-t border-studio-border px-6 py-2 flex items-center justify-around font-prompt safe-area-pb">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center py-1 px-4 rounded-lg text-[11px] font-medium transition-colors ${
              isActive
                ? 'text-studio-red'
                : 'text-studio-secondary hover:text-studio-primary'
            }`}
          >
            <Icon size={18} className={isActive ? 'text-studio-red mb-0.5' : 'text-studio-muted mb-0.5'} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
