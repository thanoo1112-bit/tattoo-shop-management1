'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'
import { LayoutDashboard, Inbox, CalendarDays, PenTool, Users, DollarSign, User, LogOut, Menu, X, Shield } from 'lucide-react'
import { logout } from '@/app/(auth)/login/actions'
import { NotificationBell } from '@/components/shared/NotificationBell'

const MENU_ITEMS = [
  { name: 'ภาพรวม', href: '/artist/dashboard', icon: LayoutDashboard },
  { name: 'คำขอจอง', href: '/artist/booking-requests', icon: Inbox },
  { name: 'ปฏิทินงาน', href: '/artist/calendar', icon: CalendarDays },
  { name: 'งานสักของฉัน', href: '/artist/appointments', icon: PenTool },
  { name: 'ลูกค้าของฉัน', href: '/artist/customers', icon: Users },
  { name: 'รายได้ของฉัน', href: '/artist/earnings', icon: DollarSign },
  { name: 'โปรไฟล์ของฉัน', href: '/artist/profile', icon: User },
]

import Image from 'next/image'

export function ArtistMobileNav({ artistName, avatarUrl, isOwner }: { artistName: string, avatarUrl?: string | null, isOwner?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <div className="md:hidden flex items-center justify-between h-16 px-4 bg-[#0A0A0A] border-b border-[#262626] sticky top-0 z-50">
        <button
          type="button"
          className="inline-flex items-center justify-center p-2 rounded-md text-[#9CA3AB] hover:text-[#F3F3F3] hover:bg-[#171717] focus:outline-none"
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="absolute left-1/2 -translate-x-1/2">
          <BrandLogo showText={false} className="scale-90" />
        </div>
        <NotificationBell role="artist" />
      </div>

      {isOpen && (
        <div 
          className="fixed inset-0 z-30 bg-[#000000]/80 backdrop-blur-sm md:hidden transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-[#121212] border-r border-[#262626] transform transition-transform duration-300 ease-in-out md:hidden flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-20 px-4 border-b border-[#262626]">
          <BrandLogo />
          <button
            type="button"
            className="p-2 rounded-md text-[#9CA3AB] hover:text-[#F3F3F3] hover:bg-[#171717] focus:outline-none"
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`
                  flex items-center px-4 py-3 text-base font-medium rounded-md transition-colors
                  ${isActive 
                    ? 'bg-[#FFFFFF]/10 text-[#FFFFFF]' 
                    : 'text-[#9CA3AB] hover:bg-[#262626] hover:text-[#F3F3F3]'
                  }
                `}
              >
                {isActive && (
                  <div className="absolute left-0 w-1 h-8 bg-[#FFFFFF] rounded-r-full" />
                )}
                <Icon
                  className={`mr-4 h-6 w-6 ${isActive ? 'text-[#FFFFFF]' : 'text-[#747C85]'}`}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            )
          })}
          
          {isOwner && (
            <div className="pt-4 border-t border-[#262626] mt-4">
              <Link
                href="/owner/dashboard"
                onClick={() => setIsOpen(false)}
                className="flex items-center px-4 py-3 text-base font-medium rounded-md text-[#9CA3AB] hover:bg-[#262626] hover:text-[#F3F3F3] transition-colors"
              >
                <Shield className="mr-4 h-6 w-6 text-[#747C85]" />
                กลับมุมมองเจ้าของร้าน
              </Link>
            </div>
          )}
        </nav>

        <div className="flex-shrink-0 border-t border-[#262626] p-4 bg-[#121212]">
          <div className="flex items-center w-full mb-4 px-2">
            {avatarUrl ? (
              <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-[#262626] flex-shrink-0">
                <Image src={avatarUrl} alt={artistName} fill className="object-cover" />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#171717] border border-[#262626] flex-shrink-0">
                <User className="h-5 w-5 text-[#B9C0C8]" />
              </div>
            )}
            <div className="ml-3 min-w-0 flex-1 text-left">
              <p className="text-sm font-medium text-[#F3F3F3] truncate">{artistName}</p>
              <p className="text-xs text-[#747C85] truncate">ช่างสัก</p>
            </div>
          </div>
          
          <form action={() => logout()}>
            <button
              type="submit"
              className="w-full flex items-center px-4 py-3 text-base font-medium text-[#9CA3AB] rounded-md hover:bg-[#262626] hover:text-[#F3F3F3] transition-colors"
            >
              <LogOut className="mr-4 h-6 w-6 text-[#747C85]" />
              ออกจากระบบ
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
