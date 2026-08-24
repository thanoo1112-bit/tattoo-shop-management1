'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ownerNavigation } from '@/lib/navigation/owner-nav'
import { LogOut, User } from 'lucide-react'
import { logout } from '@/app/(auth)/login/actions'
import { useTransition } from 'react'
import { BrandLogo } from '@/components/brand-logo'

type OwnerSidebarProps = {
  ownerName: string
}

export function OwnerSidebar({ ownerName }: OwnerSidebarProps) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-[#121212] border-r border-[#262626] z-20">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-20 flex-shrink-0 px-6 border-b border-[#262626]">
          <BrandLogo />
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {ownerNavigation.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                href={item.href}
                target={item.href.startsWith('/shop') ? '_blank' : undefined}
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
        </nav>
      </div>
      
      <div className="flex-shrink-0 border-t border-[#262626] p-4 bg-[#121212]">
        <div className="flex items-center w-full mb-4 px-2">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#171717] border border-[#262626]">
            <User className="h-5 w-5 text-[#B9C0C8]" />
          </div>
          <div className="ml-3 truncate">
            <p className="text-sm font-medium text-[#F3F3F3] truncate">{ownerName}</p>
            <p className="text-xs text-[#747C85]">ผู้ดูแลระบบ</p>
          </div>
        </div>
        
        <form action={() => startTransition(() => { logout() })}>
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center px-3 py-2 text-sm font-medium text-[#9CA3AB] rounded-md hover:bg-[#262626] hover:text-[#F3F3F3] transition-colors"
          >
            <LogOut className="flex-shrink-0 mr-3 h-5 w-5 text-[#747C85]" />
            ออกจากระบบ
          </button>
        </form>
      </div>
    </div>
  )
}
