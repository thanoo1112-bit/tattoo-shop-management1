'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ownerNavigation } from '@/lib/navigation/owner-nav'
import { Menu, X, LogOut, User, Bell, PenTool } from 'lucide-react'
import { logout } from '@/app/(auth)/login/actions'
import { BrandLogo } from '@/components/brand-logo'

type OwnerMobileNavProps = {
  ownerName: string
}

export function OwnerMobileNav({ ownerName }: OwnerMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

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
        <button 
          className="inline-flex items-center justify-center p-2 rounded-md text-[#9CA3AB] hover:text-[#F3F3F3] hover:bg-[#171717] relative focus:outline-none"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2.5 w-2 h-2 bg-[#8E232B] rounded-full ring-2 ring-[#121212]"></span>
        </button>
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
          {ownerNavigation.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                target={item.href.startsWith('/shop') ? '_blank' : undefined}
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
          
          <div className="pt-4 border-t border-[#262626] mt-4">
            <Link
              href="/artist/dashboard"
              onClick={() => setIsOpen(false)}
              className="flex items-center px-4 py-3 text-base font-medium rounded-md text-[#9CA3AB] hover:bg-[#262626] hover:text-[#F3F3F3] transition-colors"
            >
              <PenTool className="mr-4 h-6 w-6 text-[#747C85]" />
              สลับไปมุมมองช่างสัก
            </Link>
          </div>
        </nav>

        <div className="flex-shrink-0 border-t border-[#262626] p-4 bg-[#121212]">
          <div className="flex items-center w-full mb-4 px-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#171717] border border-[#262626]">
              <User className="h-5 w-5 text-[#B9C0C8]" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-[#F3F3F3]">{ownerName}</p>
              <p className="text-xs text-[#747C85]">ผู้ดูแลระบบ</p>
            </div>
          </div>
          
          <form action={() => startTransition(() => { logout() })}>
            <button
              type="submit"
              disabled={isPending}
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
