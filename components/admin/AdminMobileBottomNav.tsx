'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../AppContext';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  CreditCard,
  X,
  Plus,
  Calendar,
  Zap,
  Images,
  User,
} from 'lucide-react';

export default function AdminMobileBottomNav() {
  const pathname = usePathname();
  const { bookingPayments, estimateRequests } = useApp();
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Calculate pending badge count for requests
  const pendingCount =
    bookingPayments.filter((p) => p.paymentType === 'DEPOSIT' && p.status === 'SUBMITTED').length +
    estimateRequests.filter((e) => e.status === 'PENDING' && e.request_type !== 'DIRECT_BOOKING').length;

  // Body scroll lock and ESC key listener for FAB Menu Panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsFabOpen(false);
      }
    }

    if (isFabOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isFabOpen]);

  // Main 4 Floating Dock Items (No "เพิ่มเติม" button in Dock)
  const mainNavItems = [
    {
      name: 'ภาพรวม',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
      isActive: pathname === '/admin/dashboard' || pathname === '/admin',
    },
    {
      name: 'คำขอ',
      href: '/admin/requests',
      icon: ClipboardList,
      badge: pendingCount > 0 ? pendingCount : null,
      isActive: pathname === '/admin/requests' || pathname.startsWith('/admin/requests/'),
    },
    {
      name: 'ปฏิทิน',
      href: '/admin/calendar',
      icon: CalendarDays,
      isActive: pathname === '/admin/calendar' || pathname.startsWith('/admin/calendar/'),
    },
    {
      name: 'การเงิน',
      href: '/admin/payments',
      icon: CreditCard,
      isActive: pathname === '/admin/payments' || pathname.startsWith('/admin/payments/'),
    },
  ];

  // Quick Action Items for Concept 6 Dock
  const quickActions = [
    {
      name: 'จัดการคิว',
      href: '/admin/calendar',
      icon: Calendar,
    },
    {
      name: 'เพิ่ม Flash',
      href: '/admin/flash',
      icon: Zap,
    },
    {
      name: 'เพิ่มผลงาน',
      href: '/admin/portfolio',
      icon: Images,
    },
    {
      name: 'จัดการช่าง',
      href: '/admin/artists',
      icon: User,
    },
  ];

  return (
    <>
      {/* FAB BACKDROP / SCRIM (Subtle bg-black/20 backdrop) */}
      {isFabOpen && (
        <div
          onClick={() => setIsFabOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity animate-fadeIn"
        />
      )}

      {/* QUICK ACTIONS DOCK (CONCEPT 6: 4 EQUAL HORIZONTAL CARDS IN 1 ROW FLOATING ABOVE BOTTOM NAV) */}
      {isFabOpen && (
        <div
          role="menu"
          aria-label="เมนูด่วน"
          className="md:hidden fixed left-3 right-3 sm:left-4 sm:right-4 z-50 bg-[#171512] border border-[#4A443A] rounded-2xl p-2.5 shadow-2xl font-prompt animate-slideUp"
          style={{ bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.name}
                  href={action.href}
                  role="menuitem"
                  onClick={() => setIsFabOpen(false)}
                  className="flex-1 min-h-[64px] sm:min-h-[68px] bg-[#221F1A] border border-[#3E372C]/70 hover:border-[#9C2F2F]/60 rounded-xl p-1.5 flex flex-col items-center justify-center space-y-1.5 text-center transition-all cursor-pointer hover:bg-[#2A241E] active:scale-95 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#9C2F2F]/15 border border-[#9C2F2F]/30 flex items-center justify-center text-[#9C2F2F] group-hover:bg-[#9C2F2F] group-hover:text-white transition-colors shrink-0">
                    <Icon size={17} />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-[#ECE4D3] leading-none tracking-tight truncate w-full px-0.5">
                    {action.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* FLOATING CAPSULE NAVIGATION DOCK (4 Items) */}
      <nav
        className="md:hidden fixed left-3 right-[88px] sm:left-4 sm:right-[96px] z-40 bg-[#171512]/95 backdrop-blur-md border border-[#4A443A] rounded-full h-[64px] px-2 font-prompt flex items-center justify-around shadow-2xl"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        {mainNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => {
                setIsFabOpen(false);
              }}
              className={`relative flex flex-col items-center justify-center py-1 px-2 transition-colors cursor-pointer ${
                item.isActive ? 'text-[#ECE4D3]' : 'text-[#7A7265] hover:text-[#A89F91]'
              }`}
            >
              <div className="relative">
                <Icon
                  size={20}
                  className={item.isActive ? 'text-[#9C2F2F]' : 'text-[#7A7265]'}
                />
                {item.badge && (
                  <span className="absolute -top-1 -right-2 bg-[#9C2F2F] text-[#ECE4D3] text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-[#171512]">
                    {item.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-0.5 font-medium tracking-wide ${
                  item.isActive ? 'text-[#ECE4D3] font-semibold' : 'text-[#7A7265]'
                }`}
              >
                {item.name}
              </span>
              {item.isActive && (
                <span className="absolute bottom-1 w-5 h-[2px] bg-[#9C2F2F] rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* SEPARATE CIRCULAR FLOATING ACTION BUTTON (FAB: 64x64px) ON SAME BASELINE */}
      <button
        type="button"
        aria-label={isFabOpen ? 'ปิดเมนูด่วน' : 'เปิดเมนูด่วน'}
        onClick={() => {
          setIsFabOpen((prev) => !prev);
        }}
        className="md:hidden fixed right-3 sm:right-4 z-40 w-16 h-16 rounded-full bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] shadow-2xl flex items-center justify-center border border-[#ECE4D3]/20 transition-all duration-200 cursor-pointer active:scale-95"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className={`transition-transform duration-200 ${isFabOpen ? 'rotate-90' : 'rotate-0'}`}>
          {isFabOpen ? <X size={24} /> : <Plus size={24} />}
        </div>
      </button>
    </>
  );
}
