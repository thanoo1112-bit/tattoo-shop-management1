'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import { LayoutDashboard, Calendar, Users, DollarSign, LogOut, User as UserIcon } from 'lucide-react';

export default function ArtistHeader() {
  const pathname = usePathname();
  const { staffArtistRecord, profile, logoutStaff } = useApp();

  const artistName = staffArtistRecord?.name || profile?.display_name || 'ช่างประจำร้าน';
  const artistNickname = staffArtistRecord?.nickname ? `(${staffArtistRecord.nickname})` : '';

  const navItems = [
    { href: '/artist/dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
    { href: '/artist/calendar', label: 'ปฏิทินของฉัน', icon: Calendar },
    { href: '/artist/customers', label: 'ลูกค้าของฉัน', icon: Users },
    { href: '/artist/revenue', label: 'รายได้', icon: DollarSign },
  ];

  return (
    <header className="border-b border-studio-border bg-studio-card/90 backdrop-blur-md sticky top-0 z-40 font-prompt">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Badge */}
        <div className="flex items-center space-x-4">
          <Link href="/artist/dashboard" className="flex items-center space-x-2.5">
            <span className="font-heading text-lg sm:text-xl tracking-[0.1em] text-studio-primary font-bold">
              157 <span className="text-studio-red">TATTOO</span>
            </span>
            <span className="text-[10px] bg-studio-red/15 text-studio-red border border-studio-red/30 px-2 py-0.5 rounded font-bold uppercase tracking-widest hidden sm:inline-block">
              ARTIST PORTAL
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 ml-4 border-l border-studio-border/60 pl-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-studio-sec text-studio-primary border border-studio-border text-studio-red font-semibold'
                      : 'text-studio-secondary hover:text-studio-primary hover:bg-studio-sec/50'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-studio-red' : 'text-studio-muted'} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Artist Profile Info & Logout */}
        <div className="flex items-center space-x-3">
          {profile?.role === 'admin' && (
            <Link
              href="/admin/dashboard"
              className="hidden sm:inline-flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-primary bg-studio-sec/80 border border-studio-border hover:border-studio-red/50 px-3 py-1.5 rounded-md transition-colors"
              title="สลับไปยังหน้าผู้ดูแลร้าน"
            >
              <span>หน้าร้าน (Admin)</span>
            </Link>
          )}

          <div className="hidden sm:flex items-center space-x-2.5 px-3 py-1 bg-studio-sec/80 border border-studio-border rounded-full text-xs">
            <div className="w-5 h-5 rounded-full bg-studio-red/20 border border-studio-red/40 flex items-center justify-center text-studio-red">
              <UserIcon size={12} />
            </div>
            <span className="text-studio-primary font-medium truncate max-w-[160px]">
              {artistName} <span className="text-studio-secondary font-normal text-[11px]">{artistNickname}</span>
            </span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
              profile?.role === 'admin'
                ? 'text-amber-400 bg-amber-950/60 border-amber-800/40'
                : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40'
            }`}>
              {profile?.role === 'admin' ? 'OWNER / ARTIST' : 'ARTIST'}
            </span>
          </div>

          <button
            onClick={() => logoutStaff()}
            className="flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-red transition-colors px-3 py-1.5 rounded-md border border-studio-border bg-studio-sec hover:border-studio-red/50 cursor-pointer"
            title="ออกจากระบบ"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </div>
    </header>
  );
}
