'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../AppContext';
import { Calendar, User, LogOut, Search } from 'lucide-react';

export default function CustomerHeader() {
  const pathname = usePathname();
  const { isLoggedIn, customerName, logoutCustomer } = useApp();

  const navItems = [
    { name: 'หน้าแรก', href: '/' },
    { name: 'ผลงาน', href: '/portfolio' },
    { name: 'Flash', href: '/flash' },
    { name: 'ช่างสัก', href: '/artists' },
    { name: 'จองคิว', href: '/booking' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-studio-main/95 backdrop-blur-md border-b border-studio-border h-14 md:h-[68px] px-4 md:px-8 xl:px-12 transition-all">
      <div className="max-w-[1560px] mx-auto h-full flex items-center justify-between">
        
        {/* Left: Brand Wordmark in Bebas Neue */}
        <Link href="/" className="text-xl md:text-2xl xl:text-3xl font-heading tracking-[0.1em] text-studio-primary hover:text-studio-red transition-colors flex items-center gap-1.5">
          <span>157</span>
          <span className="text-studio-red">TATTOO</span>
        </Link>

        {/* Center: Desktop Navigation Menu with Red Active Underlines */}
        <nav className="hidden md:flex space-x-8 xl:space-x-10 h-full font-prompt">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`text-xs xl:text-sm tracking-wide font-medium flex items-center relative transition-colors duration-200 ${
                  isActive
                    ? 'text-studio-primary font-semibold'
                    : 'text-studio-secondary hover:text-studio-primary'
                }`}
              >
                <span>{item.name}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-studio-red animate-fadeIn" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right (Desktop): Search, Portal Link & Primary Auth */}
        <div className="hidden md:flex items-center space-x-5 xl:space-x-7 font-prompt">
          <Link
            href="/portfolio"
            className="text-studio-secondary hover:text-studio-red transition-colors p-2"
            title="ค้นหาลายสักและผลงาน"
          >
            <Search size={17} />
          </Link>

          {isLoggedIn ? (
            <>
              <Link
                href="/portal"
                className="flex items-center space-x-2 text-xs xl:text-sm font-medium text-studio-secondary hover:text-studio-primary transition-colors tracking-wide"
              >
                <Calendar size={15} className="text-studio-red" />
                <span>การจองของฉัน</span>
              </Link>
              <div className="flex items-center space-x-3 border-l border-studio-border pl-5">
                <Link
                  href="/portal?tab=profile"
                  className="text-xs xl:text-sm text-studio-primary font-medium flex items-center space-x-2 hover:text-studio-red transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-studio-red/15 border border-studio-red/30 flex items-center justify-center text-studio-red">
                    <User size={13} />
                  </div>
                  <span>{customerName}</span>
                </Link>
                <button
                  onClick={logoutCustomer}
                  className="text-xs text-studio-muted hover:text-studio-red transition-colors flex items-center space-x-1"
                  title="ออกจากระบบ"
                >
                  <LogOut size={14} />
                  <span className="hidden xl:inline">ออกจากระบบ</span>
                </button>
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="text-xs xl:text-sm uppercase tracking-wider bg-studio-red text-studio-paper hover:bg-tattoo-red-dark border border-studio-red px-5 py-2.5 transition-all duration-200 font-semibold rounded-[4px]"
            >
              เข้าสู่ระบบ
            </Link>
          )}
        </div>

        {/* Right (Mobile): Simple Search & Profile Quick Triggers */}
        <div className="flex md:hidden items-center space-x-1">
          <Link
            href="/portfolio"
            className="w-11 h-11 flex items-center justify-center text-studio-secondary hover:text-studio-red active:scale-95 transition-colors"
            title="ค้นหา"
          >
            <Search size={19} />
          </Link>
          <Link
            href={isLoggedIn ? "/portal?tab=profile" : "/login"}
            className="w-11 h-11 flex items-center justify-center text-studio-secondary hover:text-studio-red active:scale-95 transition-colors"
            title={isLoggedIn ? customerName : "เข้าสู่ระบบ"}
          >
            <div className="w-7 h-7 rounded-full bg-studio-card border border-studio-border flex items-center justify-center text-studio-red">
              <User size={14} />
            </div>
          </Link>
        </div>

      </div>
    </header>
  );
}
