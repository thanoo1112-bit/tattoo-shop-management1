'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../AppContext';
import { ShieldCheck, LogOut, Bell, User, Calendar, FileText, LayoutDashboard, Users, DollarSign, CreditCard, Sparkles, Image as ImageIcon } from 'lucide-react';

export default function AdminHeader() {
  const pathname = usePathname();
  const { staffRole, logoutStaff, bookings, bookingPayments } = useApp();

  const pendingDepositsCount = bookingPayments.filter(d => d.paymentType === 'DEPOSIT' && d.status === 'SUBMITTED').length;

  const navItems = [
    { name: 'ภาพรวม', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'ปฏิทิน', href: '/admin/calendar', icon: Calendar },
    { name: 'คำขอ', href: '/admin/requests', icon: FileText },
    { name: 'ลาย Flash', href: '/admin/flash', icon: Sparkles },
    { name: 'ผลงาน', href: '/admin/portfolio', icon: ImageIcon },
    { name: 'การเงิน', href: '/admin/payments', icon: CreditCard },
    { name: 'ลูกค้า', href: '/admin/customers', icon: Users },
    { name: 'ช่างสัก', href: '/admin/artists', icon: User },
    { name: 'รายได้', href: '/admin/revenue', icon: DollarSign },
  ];

  return (
    <header className="sticky top-0 z-50 bg-studio-main/95 backdrop-blur-md border-b border-studio-border h-[68px] px-6 md:px-8 xl:px-12 font-prompt">
      <div className="max-w-[1600px] mx-auto h-full flex items-center justify-between">
        
        {/* Left: Brand Wordmark + Role Badge */}
        <div className="flex items-center space-x-3">
          <Link href="/admin/dashboard" className="text-xl xl:text-3xl font-heading tracking-[0.1em] text-studio-primary hover:text-studio-red transition-colors flex items-center gap-1.5">
            <span>157</span>
            <span className="text-studio-red">TATTOO</span>
          </Link>
          <span className="text-[10px] bg-studio-red/15 text-studio-red border border-studio-red/30 px-2 py-0.5 rounded font-bold uppercase tracking-widest">
            {staffRole || 'STAFF'}
          </span>
        </div>

        {/* Center: Top Navigation Menu */}
        <nav className="hidden md:flex space-x-6 xl:space-x-8 h-full">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`text-xs xl:text-sm tracking-wide font-medium flex items-center space-x-1.5 relative transition-colors duration-200 ${
                  isActive
                    ? 'text-studio-primary font-semibold'
                    : 'text-studio-secondary hover:text-studio-primary'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-studio-red' : 'text-studio-muted'} />
                <span>{item.name}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-studio-red animate-fadeIn" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Notifications & Profile */}
        <div className="flex items-center space-x-5 xl:space-x-7">
          {/* Notification Trigger */}
          <Link
            href="/admin/requests"
            className="relative text-studio-secondary hover:text-studio-red transition-colors p-1.5"
            title="การแจ้งเตือน"
          >
            <Bell size={17} />
            {pendingDepositsCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-studio-red rounded-full ring-2 ring-studio-main animate-pulse" />
            )}
          </Link>

          {/* Admin Profile & Logout */}
          <div className="flex items-center space-x-3 border-l border-studio-border pl-5">
            <div className="flex items-center space-x-2 text-xs xl:text-sm text-studio-primary font-medium">
              <div className="w-7 h-7 rounded-full bg-studio-red/15 border border-studio-red/30 flex items-center justify-center text-studio-red">
                <ShieldCheck size={14} />
              </div>
              <span>{staffRole === 'ADMIN' ? 'เจ้าของร้าน (Admin)' : 'ช่างสักประจำร้าน'}</span>
            </div>
            
            <button
              onClick={logoutStaff}
              className="text-xs text-studio-muted hover:text-studio-red transition-colors flex items-center space-x-1 pl-2"
              title="ออกจากระบบ"
            >
              <LogOut size={14} />
              <span className="hidden xl:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>

      </div>
    </header>
  );
}
