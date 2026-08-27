'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'
import { LayoutDashboard, CalendarDays, PenTool, Users, DollarSign, User, LogOut, Shield } from 'lucide-react'
import { logout } from '@/app/(auth)/login/actions'

const MENU_ITEMS = [
  { name: 'ภาพรวม', href: '/artist/dashboard', icon: LayoutDashboard },
  { name: 'ปฏิทินงาน', href: '/artist/calendar', icon: CalendarDays },
  { name: 'งานสักของฉัน', href: '/artist/appointments', icon: PenTool },
  { name: 'ลูกค้าของฉัน', href: '/artist/customers', icon: Users },
  { name: 'รายได้ของฉัน', href: '/artist/earnings', icon: DollarSign },
  { name: 'โปรไฟล์ของฉัน', href: '/artist/profile', icon: User },
]

import Image from 'next/image'

export function ArtistSidebar({ artistName, avatarUrl, isOwner }: { artistName: string, avatarUrl?: string | null, isOwner?: boolean }) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 bg-[#121212] border-r border-[#262626] z-20">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-20 flex-shrink-0 px-6 border-b border-[#262626]">
          <Link href="/artist/dashboard" className="flex items-center">
            <BrandLogo />
          </Link>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
          <style>{`
            .no-scrollbar::-webkit-scrollbar {
              display: none !important;
            }
            .no-scrollbar {
              -ms-overflow-style: none !important;
              scrollbar-width: none !important;
            }
          `}</style>
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`
                  group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-200
                  ${isActive 
                    ? 'bg-[#FFFFFF]/10 text-[#FFFFFF]' 
                    : 'text-[#9CA3AB] hover:bg-[#262626] hover:text-[#F3F3F3]'
                  }
                `}
              >
                {isActive && (
                  <div className="absolute left-0 w-1 h-6 bg-[#FFFFFF] rounded-r-full" />
                )}
                <Icon
                  className={`
                    flex-shrink-0 mr-3 h-5 w-5 transition-colors
                    ${isActive ? 'text-[#FFFFFF]' : 'text-[#747C85] group-hover:text-[#B9C0C8]'}
                  `}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </Link>
            )
          })}
          
          {isOwner && (
            <div className="pt-4 border-t border-[#262626] mt-4">
              <Link
                href="/owner/dashboard"
                className="group flex items-center px-3 py-2.5 text-sm font-medium rounded-md text-[#9CA3AB] hover:bg-[#262626] hover:text-[#F3F3F3] transition-all duration-200"
              >
                <Shield className="flex-shrink-0 mr-3 h-5 w-5 text-[#747C85] group-hover:text-[#B9C0C8] transition-colors" />
                <span className="truncate">กลับมุมมองเจ้าของร้าน</span>
              </Link>
            </div>
          )}
        </nav>
      </div>

      <div className="flex-shrink-0 border-t border-[#262626] p-4 bg-[#121212]">
        <div className="flex items-center w-full mb-4 px-2">
          {avatarUrl ? (
            <div className="relative w-9 h-9 rounded-full overflow-hidden border border-[#262626] flex-shrink-0">
              <Image src={avatarUrl} alt={artistName} fill className="object-cover" />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#171717] border border-[#262626] flex-shrink-0">
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
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-[#9CA3AB] rounded-md hover:bg-[#262626] hover:text-[#F3F3F3] transition-colors"
          >
            <LogOut className="flex-shrink-0 mr-3 h-5 w-5 text-[#747C85]" />
            ออกจากระบบ
          </button>
        </form>
      </div>
    </aside>
  )
}
