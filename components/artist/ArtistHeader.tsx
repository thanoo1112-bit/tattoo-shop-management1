'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  DollarSign, 
  LogOut, 
  User as UserIcon, 
  Sparkles, 
  Image as ImageIcon,
  ChevronRight,
  Store,
  Inbox,
  Clock
} from 'lucide-react';

export default function ArtistHeader() {
  const pathname = usePathname();
  const { staffArtistRecord, profile, logoutStaff } = useApp();

  const artistName = staffArtistRecord?.name || profile?.display_name || 'ช่างประจำร้าน';
  const artistNickname = staffArtistRecord?.nickname ? `(${staffArtistRecord.nickname})` : '';

  const navGroups = [
    {
      title: 'งานของฉัน',
      items: [
        { href: '/artist/dashboard', label: 'ภาพรวม', icon: LayoutDashboard },
        { href: '/artist/requests', label: 'คำขอ', icon: Inbox },
        { href: '/artist/calendar', label: 'คิวงานและปฏิทิน', icon: Calendar },
        { href: '/artist/customers', label: 'ลูกค้าของฉัน', icon: Users },
      ],
    },
    {
      title: 'จัดการผลงาน',
      items: [
        { href: '/artist/portfolio', label: 'ผลงาน', icon: ImageIcon },
        { href: '/artist/flash', label: 'ลาย Flash', icon: Sparkles },
      ],
    },
    {
      title: 'รายงาน',
      items: [
        { href: '/artist/revenue', label: 'รายได้', icon: DollarSign },
      ],
    },
  ];

  return (
    <>
      {/* ========================================================================= */}
      {/* DESKTOP SIDEBAR (md:flex fixed inset-y-0 left-0 w-64) */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 z-40 bg-studio-card/95 border-r border-studio-border backdrop-blur-md font-prompt p-3.5 select-none">
        {/* TOP BRANDING SECTION */}
        <div className="pb-2.5 border-b border-studio-border/40 mb-2 px-1">
          <Link href="/artist/dashboard" className="flex items-center justify-between group">
            <span className="font-heading text-lg tracking-[0.1em] text-studio-primary font-bold group-hover:text-studio-red-bright transition-colors">
              157 <span className="text-studio-red">TATTOO</span>
            </span>
            <span className="text-[9px] bg-studio-red/15 text-studio-red-bright border border-studio-red/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
              ARTIST PORTAL
            </span>
          </Link>
        </div>

        {/* MIDDLE NAVIGATION MENU */}
        <nav className="flex-1 space-y-3.5 overflow-y-auto pr-1 my-1">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <span className="text-[10px] font-bold text-studio-muted uppercase tracking-wider block px-2.5 mb-1">
                {group.title}
              </span>
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href === '/artist/calendar' && pathname === '/artist/queue');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-studio-sec text-studio-red-bright border border-studio-border shadow-sm font-semibold'
                        : 'text-studio-secondary hover:text-studio-primary hover:bg-studio-sec/50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon size={16} className={isActive ? 'text-studio-red-bright' : 'text-studio-muted'} />
                      <span>{item.label}</span>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-studio-red-bright shadow-sm" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* BOTTOM USER & LOGOUT SECTION */}
        <div className="shrink-0 pt-2.5 border-t border-studio-border/40 mt-auto space-y-2">
          {/* Admin Switch Link (if Owner/Admin) */}
          {profile?.role === 'admin' && (
            <Link
              href="/admin/dashboard"
              className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-amber-300 bg-amber-950/40 hover:bg-amber-950/60 border border-amber-800/40 rounded-lg transition-colors"
              title="สลับไปยังหน้าผู้ดูแลร้าน"
            >
              <div className="flex items-center space-x-1.5">
                <Store size={13} className="text-amber-400" />
                <span className="font-medium">หน้าร้าน (Admin)</span>
              </div>
              <ChevronRight size={12} className="text-amber-500" />
            </Link>
          )}

          {/* Unified Profile & Logout Row */}
          <div className="flex items-center justify-between p-2 bg-studio-sec/80 border border-studio-border rounded-xl space-x-2">
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-full bg-studio-red/20 border border-studio-red/40 flex items-center justify-center text-studio-red-bright shrink-0">
                <UserIcon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1 truncate leading-tight">
                  <span className="text-xs text-studio-primary font-bold truncate">
                    {artistName}
                  </span>
                  {artistNickname && (
                    <span className="text-[10px] text-studio-secondary truncate">
                      {artistNickname}
                    </span>
                  )}
                </div>
                <span className={`inline-block text-[8px] font-mono px-1.5 py-0.2 rounded border mt-0.5 ${
                  profile?.role === 'admin'
                    ? 'text-amber-400 bg-amber-950/60 border-amber-800/40'
                    : 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40'
                }`}>
                  {profile?.role === 'admin' ? 'OWNER / ARTIST' : 'ARTIST'}
                </span>
              </div>
            </div>

            {/* Logout Icon Button */}
            <button
              onClick={() => logoutStaff()}
              className="p-1.5 text-studio-secondary hover:text-studio-red-bright hover:bg-studio-red/10 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-studio-red/30 shrink-0"
              title="ออกจากระบบ"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MOBILE TOP BAR (md:hidden) */}
      {/* ========================================================================= */}
      <header className="md:hidden border-b border-studio-border bg-studio-card/90 backdrop-blur-md sticky top-0 z-40 font-prompt">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link href="/artist/dashboard" className="flex items-center space-x-2">
            <span className="font-heading text-base tracking-[0.1em] text-studio-primary font-bold">
              157 <span className="text-studio-red">TATTOO</span>
            </span>
            <span className="text-[9px] bg-studio-red/15 text-studio-red-bright border border-studio-red/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
              ARTIST
            </span>
          </Link>

          <div className="flex items-center space-x-2">
            {profile?.role === 'admin' && (
              <Link
                href="/admin/dashboard"
                className="text-[11px] text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2 py-1 rounded-lg"
              >
                Admin
              </Link>
            )}

            <button
              onClick={() => logoutStaff()}
              className="p-1.5 text-studio-secondary hover:text-studio-red-bright transition-colors border border-studio-border rounded-lg bg-studio-sec"
              title="ออกจากระบบ"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
