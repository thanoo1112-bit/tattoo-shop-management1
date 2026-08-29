'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User, Calendar, FolderHeart, LogOut, Home } from 'lucide-react'

export default function CustomerHeader({ customerName }: { customerName: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    // Clear session storage / client state as required by Phase 18
    if (typeof window !== 'undefined') {
      window.sessionStorage.clear()
      window.localStorage.clear()
    }
    router.push('/customer/login')
  }

  return (
    <header className="h-[64px] md:h-[72px] flex items-center border-b border-[#262626] bg-[#0A0A0A] px-4 sm:px-5 md:px-8 lg:px-10 sticky top-0 z-50">
      <div className="max-w-[1280px] mx-auto w-full flex items-center justify-between">
        
        {/* LEFT: BRAND */}
        <Link href="/shop/157-tattoo" className="flex items-center gap-2 md:gap-2.5 group">
          <div className="relative w-6 h-6 md:w-7 md:h-7">
            <Image 
              src="/logo.png" 
              alt="157 TATTOO Logo" 
              fill
              className="object-contain grayscale"
            />
          </div>
          <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5] group-hover:text-white transition-colors">
            157 TATTOO
          </span>
        </Link>

        {/* MID: NAVIGATION */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-[#A3A3A3]">
          <Link href="/shop/157-tattoo" className="hover:text-[#F5F5F5] flex items-center gap-1.5 transition-colors">
            <Home size={16} /> หน้าแรก
          </Link>
          <Link href="/customer/bookings" className="hover:text-[#F5F5F5] flex items-center gap-1.5 transition-colors">
            <Calendar size={16} /> การจองของฉัน
          </Link>
          <Link href="/customer/profile" className="hover:text-[#F5F5F5] flex items-center gap-1.5 transition-colors">
            <User size={16} /> โปรไฟล์
          </Link>
        </nav>
        
        {/* RIGHT: USER INFO & LOGOUT */}
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#737373] hidden sm:inline">สวัสดี, {customerName}</span>
          
          <Link href="/customer/profile" className="md:hidden text-[#A3A3A3] hover:text-[#F5F5F5]" title="โปรไฟล์">
            <User size={18} />
          </Link>
          <Link href="/customer/bookings" className="md:hidden text-[#A3A3A3] hover:text-[#F5F5F5]" title="การจอง">
            <Calendar size={18} />
          </Link>

          <button 
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#171717] hover:bg-[#262626] border border-[#262626] hover:border-[#404040] text-xs text-[#F5F5F5] rounded-lg transition-all"
            title="ออกจากระบบ"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>

      </div>
    </header>
  )
}
