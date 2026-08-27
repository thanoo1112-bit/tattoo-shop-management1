'use client'

import { Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'

const ROUTE_NAMES: Record<string, { title: string, subtitle: string }> = {
  '/artist/dashboard': { title: 'ภาพรวม', subtitle: 'ข้อมูลและงานสำคัญของคุณ' },
  '/artist/calendar': { title: 'ปฏิทินงาน', subtitle: 'ตารางเวลาและวันว่างของคุณ' },
  '/artist/appointments': { title: 'งานสักของฉัน', subtitle: 'นัดหมายและประวัติงานสัก' },
  '/artist/customers': { title: 'ลูกค้าของฉัน', subtitle: 'ข้อมูลประวัติของลูกค้า' },
  '/artist/earnings': { title: 'รายได้ของฉัน', subtitle: 'สรุปรายได้จากงานของคุณ' },
  '/artist/profile': { title: 'โปรไฟล์ของฉัน', subtitle: 'จัดการข้อมูลที่ลูกค้าจะเห็น' },
  '/artist/onboarding': { title: 'ตั้งค่าโปรไฟล์', subtitle: 'กรอกข้อมูลเบื้องต้น' }
}

export function ArtistTopbar() {
  const pathname = usePathname()
  const routeInfo = ROUTE_NAMES[pathname] || { title: 'Artist Portal', subtitle: '' }

  return (
    <header className="hidden md:flex h-20 bg-[#0A0A0A] border-b border-[#262626] items-center justify-between px-8 sticky top-0 z-50 w-full">
      <div className="flex flex-col">
        <h2 className="text-lg font-medium text-[#F3F3F3]">{routeInfo.title}</h2>
        {routeInfo.subtitle && (
          <p className="text-xs text-[#9CA3AB] hidden lg:block">{routeInfo.subtitle}</p>
        )}
      </div>

      <div className="flex items-center space-x-6">
        <button 
          type="button"
          className="text-[#9CA3AB] hover:text-[#F3F3F3] transition-colors relative"
        >
          <Bell className="w-5 h-5" />
          {/* Mock notification badge */}
          <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-[#8E232B] ring-2 ring-[#121212]" />
        </button>
      </div>
    </header>
  )
}
