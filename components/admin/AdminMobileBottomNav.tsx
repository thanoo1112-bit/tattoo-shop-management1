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
  Zap,
  Images,
  User,
  Users,
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


  // Quick Action Items for Concept 6 Dock
  const quickActions = [
    {
      name: 'ลูกค้า',
      href: '/admin/customers',
      icon: Users,
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
          style={{ bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))' }}
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

      {/* FLOATING NAVIGATION BAR (5 COLUMNS WITH CENTERED FAB SLOT) */}
      <nav
        className="md:hidden fixed left-3 right-3 sm:left-4 sm:right-4 z-40 bg-[#171512]/95 backdrop-blur-md border border-[#4A443A] rounded-2xl h-[64px] px-1 font-prompt shadow-2xl"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="grid grid-cols-5 h-full items-center text-center">
          {/* Col 1: ภาพรวม */}
          <Link
            href="/admin/dashboard"
            onClick={() => setIsFabOpen(false)}
            className={`relative flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              pathname === '/admin/dashboard' || pathname === '/admin' ? 'text-[#ECE4D3]' : 'text-[#7A7265] hover:text-[#A89F91]'
            }`}
          >
            <LayoutDashboard
              size={19}
              className={pathname === '/admin/dashboard' || pathname === '/admin' ? 'text-[#9C2F2F]' : 'text-[#7A7265]'}
            />
            <span className={`text-[10px] mt-0.5 font-medium tracking-tight ${
              pathname === '/admin/dashboard' || pathname === '/admin' ? 'text-[#ECE4D3] font-semibold' : 'text-[#7A7265]'
            }`}>
              ภาพรวม
            </span>
            {(pathname === '/admin/dashboard' || pathname === '/admin') && (
              <span className="absolute bottom-1 w-4 h-[2px] bg-[#9C2F2F] rounded-full" />
            )}
          </Link>

          {/* Col 2: คำขอ */}
          <Link
            href="/admin/requests"
            onClick={() => setIsFabOpen(false)}
            className={`relative flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              pathname.startsWith('/admin/requests') ? 'text-[#ECE4D3]' : 'text-[#7A7265] hover:text-[#A89F91]'
            }`}
          >
            <div className="relative">
              <ClipboardList
                size={19}
                className={pathname.startsWith('/admin/requests') ? 'text-[#9C2F2F]' : 'text-[#7A7265]'}
              />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-[#9C2F2F] text-[#ECE4D3] text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-[#171512]">
                  {pendingCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] mt-0.5 font-medium tracking-tight ${
              pathname.startsWith('/admin/requests') ? 'text-[#ECE4D3] font-semibold' : 'text-[#7A7265]'
            }`}>
              คำขอ
            </span>
            {pathname.startsWith('/admin/requests') && (
              <span className="absolute bottom-1 w-4 h-[2px] bg-[#9C2F2F] rounded-full" />
            )}
          </Link>

          {/* Col 3: Center FAB Slot (Space reserved for centered FAB button) */}
          <div className="h-full flex items-center justify-center" />

          {/* Col 4: ปฏิทิน */}
          <Link
            href="/admin/calendar"
            onClick={() => setIsFabOpen(false)}
            className={`relative flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              pathname.startsWith('/admin/calendar') ? 'text-[#ECE4D3]' : 'text-[#7A7265] hover:text-[#A89F91]'
            }`}
          >
            <CalendarDays
              size={19}
              className={pathname.startsWith('/admin/calendar') ? 'text-[#9C2F2F]' : 'text-[#7A7265]'}
            />
            <span className={`text-[10px] mt-0.5 font-medium tracking-tight ${
              pathname.startsWith('/admin/calendar') ? 'text-[#ECE4D3] font-semibold' : 'text-[#7A7265]'
            }`}>
              ปฏิทิน
            </span>
            {pathname.startsWith('/admin/calendar') && (
              <span className="absolute bottom-1 w-4 h-[2px] bg-[#9C2F2F] rounded-full" />
            )}
          </Link>

          {/* Col 5: การเงิน */}
          <Link
            href="/admin/payments"
            onClick={() => setIsFabOpen(false)}
            className={`relative flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
              pathname.startsWith('/admin/payments') ? 'text-[#ECE4D3]' : 'text-[#7A7265] hover:text-[#A89F91]'
            }`}
          >
            <CreditCard
              size={19}
              className={pathname.startsWith('/admin/payments') ? 'text-[#9C2F2F]' : 'text-[#7A7265]'}
            />
            <span className={`text-[10px] mt-0.5 font-medium tracking-tight ${
              pathname.startsWith('/admin/payments') ? 'text-[#ECE4D3] font-semibold' : 'text-[#7A7265]'
            }`}>
              การเงิน
            </span>
            {pathname.startsWith('/admin/payments') && (
              <span className="absolute bottom-1 w-4 h-[2px] bg-[#9C2F2F] rounded-full" />
            )}
          </Link>
        </div>
      </nav>

      {/* CENTERED FLOATING ACTION BUTTON (FAB: ELEVATED AT CENTER SLOT 3) */}
      <button
        type="button"
        aria-label={isFabOpen ? 'ปิดเมนูด่วน' : 'เปิดเมนูด่วน'}
        onClick={() => {
          setIsFabOpen((prev) => !prev);
        }}
        className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 w-14 h-14 rounded-full bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] shadow-2xl flex items-center justify-center border-2 border-[#171512] transition-all duration-200 cursor-pointer active:scale-95"
        style={{ bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className={`transition-transform duration-200 ${isFabOpen ? 'rotate-90' : 'rotate-0'}`}>
          {isFabOpen ? <X size={24} /> : <Plus size={24} />}
        </div>
      </button>
    </>
  );
}
