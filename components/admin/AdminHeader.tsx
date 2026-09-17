'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../AppContext';
import {
  ShieldCheck,
  LogOut,
  Bell,
  User,
  Calendar,
  FileText,
  LayoutDashboard,
  Users,
  CreditCard,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';

export default function AdminHeader() {
  const pathname = usePathname();
  const { staffRole, logoutStaff, bookingPayments, estimateRequests } = useApp();

  const pendingDepositsCount =
    bookingPayments.filter((d) => d.paymentType === 'DEPOSIT' && d.status === 'SUBMITTED').length +
    estimateRequests.filter((e) => e.status === 'PENDING' && e.request_type !== 'DIRECT_BOOKING').length;

  const navItems = [
    { name: 'ภาพรวม', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'คำขอ', href: '/admin/requests', icon: FileText },
    { name: 'ปฏิทิน', href: '/admin/calendar', icon: Calendar },
    { name: 'ลูกค้า', href: '/admin/customers', icon: Users },
    { name: 'ช่างสัก', href: '/admin/artists', icon: User },
    { name: 'ผลงาน', href: '/admin/portfolio', icon: ImageIcon },
    { name: 'ลาย Flash', href: '/admin/flash', icon: Sparkles },
    { name: 'การเงิน', href: '/admin/payments', icon: CreditCard },
  ];

  const isActive = (item: (typeof navItems)[0]) => {
    if (item.href === '/admin/dashboard') {
      return pathname === '/admin/dashboard' || pathname === '/admin';
    }
    if (item.name === 'การเงิน') {
      return pathname.startsWith('/admin/payments') || pathname.startsWith('/admin/revenue');
    }
    return pathname.startsWith(item.href);
  };

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. DESKTOP FIXED LEFT SIDEBAR (>=768px) */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex fixed top-0 left-0 bottom-0 w-60 h-screen z-40 bg-[#0E0D0C] border-r border-[#4A443A]/60 flex-col justify-between font-prompt select-none">
        {/* Top: Brand Header & Notification */}
        <div className="p-5 border-b border-[#4A443A]/60 flex items-center justify-between shrink-0">
          <Link href="/admin/dashboard" className="flex items-center space-x-2">
            <span className="text-xl font-heading tracking-[0.1em] text-[#ECE4D3]">157</span>
            <span className="text-xl font-heading tracking-[0.1em] text-[#9C2F2F]">TATTOO</span>
          </Link>
          <Link
            href="/admin/requests"
            className="relative text-[#A89F91] hover:text-[#9C2F2F] p-1.5 transition-colors"
            title="การแจ้งเตือน"
          >
            <Bell size={18} className={pendingDepositsCount > 0 ? 'text-[#9C2F2F]' : 'text-[#A89F91]'} />
            {pendingDepositsCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 bg-[#9C2F2F] text-[#ECE4D3] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#0E0D0C] animate-pulse">
                {pendingDepositsCount}
              </span>
            )}
          </Link>
        </div>

        {/* Middle: Navigation Items */}
        <nav className="py-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 text-xs xl:text-sm transition-colors ${
                  active
                    ? 'border-l-4 border-[#9C2F2F] text-[#ECE4D3] bg-[#171512] font-semibold'
                    : 'border-l-4 border-transparent text-[#A89F91] hover:text-[#ECE4D3] hover:bg-[#171512]/60 font-medium'
                }`}
              >
                <Icon size={18} className={active ? 'text-[#9C2F2F]' : 'text-[#7A7265]'} />
                <span>{item.name}</span>
                {item.name === 'คำขอ' && pendingDepositsCount > 0 && (
                  <span className="ml-auto bg-[#9C2F2F] text-[#ECE4D3] text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {pendingDepositsCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Admin Profile & Logout */}
        <div className="border-t border-[#4A443A]/60 p-4 space-y-3 shrink-0 bg-[#0E0D0C]">
          {/* Admin Profile Info */}
          <div className="flex items-center space-x-2.5 py-1 px-2">
            <div className="w-8 h-8 rounded-full bg-[#9C2F2F]/15 border border-[#9C2F2F]/30 flex items-center justify-center text-[#9C2F2F] shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#ECE4D3] truncate">
                {staffRole === 'ADMIN' ? 'เจ้าของร้าน (Admin)' : 'ช่างสักประจำร้าน'}
              </p>
              <p className="text-[10px] text-[#7A7265]">ผู้ดูแลระบบ</p>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={logoutStaff}
            className="w-full flex items-center space-x-2.5 text-xs text-[#7A7265] hover:text-[#9C2F2F] py-2 px-2 rounded hover:bg-[#9C2F2F]/10 transition-colors font-medium text-left"
            title="ออกจากระบบ"
          >
            <LogOut size={16} />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MOBILE TOP HEADER BAR (<768px) */}
      {/* ========================================================================= */}
      <header className="md:hidden sticky top-0 z-40 bg-[#171512]/95 backdrop-blur-md border-b border-[#4A443A] h-14 px-4 flex items-center justify-between font-prompt">
        <Link href="/admin/dashboard" className="flex items-center space-x-2">
          <span className="text-lg font-heading tracking-[0.1em] text-[#ECE4D3]">157</span>
          <span className="text-lg font-heading tracking-[0.1em] text-[#9C2F2F]">TATTOO</span>
          <span className="text-[9px] bg-[#9C2F2F]/15 text-[#9C2F2F] border border-[#9C2F2F]/30 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">
            {staffRole || 'ADMIN'}
          </span>
        </Link>

        <div className="flex items-center space-x-3">
          <Link
            href="/admin/requests"
            className="relative text-[#A89F91] hover:text-[#9C2F2F] p-1.5"
            title="การแจ้งเตือน"
          >
            <Bell size={18} />
            {pendingDepositsCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-[#9C2F2F] rounded-full ring-2 ring-[#171512] animate-pulse" />
            )}
          </Link>

          <div className="flex items-center space-x-2 border-l border-[#4A443A] pl-3">
            <button
              onClick={logoutStaff}
              className="text-[#A89F91] hover:text-[#9C2F2F] p-1.5 flex items-center space-x-1"
              title="ออกจากระบบ"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
