'use client'

import { Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { ownerNavigation } from '@/lib/navigation/owner-nav'

export function OwnerTopbar() {
  const pathname = usePathname()
  
  const currentNav = ownerNavigation.find(nav => nav.href === pathname)
  const title = currentNav?.name || '157 TATTOO'
  const description = currentNav ? `จัดการและดูข้อมูล${currentNav.name}` : 'ระบบจัดการร้าน'

  return (
    <header className="hidden md:flex h-20 bg-[#0A0A0A] border-b border-[#262626] items-center justify-between px-8 sticky top-0 z-50">
      <div className="flex flex-col">
        <h2 className="text-lg font-medium text-[#F3F3F3]">{title}</h2>
        <p className="text-xs text-[#9CA3AB] hidden lg:block">{description}</p>
      </div>
      
      <div className="flex items-center space-x-6">
        <button 
          type="button" 
          className="text-[#9CA3AB] hover:text-[#F3F3F3] transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
