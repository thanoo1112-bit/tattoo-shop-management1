import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Inbox, Calendar, ArrowRight, User, CalendarDays, ClipboardCheck, Wallet } from 'lucide-react'
import { DashboardStatCard } from '@/components/owner/dashboard-stat-card'
import { EmptyState } from '@/components/owner/empty-state'

export default async function ArtistDashboard() {
  const { user, membership } = await requireArtist()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const artistName = profile?.full_name || user.email || 'Artist'

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-12 animate-in fade-in duration-500">
      
      {/* Hero Section */}
      <div className="relative bg-[#171717] border border-[#262626] rounded-xl p-8 overflow-hidden shadow-lg">
        <div className="relative z-10">
          <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#262626] border border-[#262626] mb-4">
            <span className="text-[10px] uppercase tracking-wider text-[#9CA3AB]">Artist Portal</span>
          </div>
          <h1 className="text-3xl font-light text-[#F3F3F3] mb-2 tracking-wide">
            สวัสดี, <span className="font-medium">{artistName}</span>
          </h1>
          <p className="text-sm text-[#9CA3AB]">
            ภาพรวมงานและคิวของคุณในวันนี้
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <DashboardStatCard 
          title="คำขอจองใหม่" 
          value="0" 
          subtitle="รอการตรวจสอบ" 
          icon={<Inbox className="h-5 w-5" />} 
          type="requests"
        />
        <DashboardStatCard 
          title="คิวเดือนนี้" 
          value="0" 
          subtitle="นัดหมายของคุณ" 
          icon={<CalendarDays className="h-5 w-5" />} 
          type="appointments"
        />
        <DashboardStatCard 
          title="งานที่กำลังดำเนินการ" 
          value="0" 
          subtitle="งานที่ยังไม่เสร็จสิ้น" 
          icon={<ClipboardCheck className="h-5 w-5" />} 
          type="artists"
        />
        <DashboardStatCard 
          title="รายได้เดือนนี้" 
          value="฿0" 
          subtitle="รายได้จากงานของคุณ" 
          icon={<Wallet className="h-5 w-5" />} 
          type="revenue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Appointments & Requests */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Next Appointment */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
                <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">คิวถัดไป</h2>
              </div>
              <Link href="/artist/appointments" className="text-xs text-[#9CA3AB] hover:text-[#FFFFFF] flex items-center gap-1 transition-colors">
                ดูทั้งหมด <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <EmptyState 
              icon={CalendarDays}
              title="ยังไม่มีคิวที่กำลังจะมาถึง"
              description="เมื่อมีนัดหมาย คิวถัดไปของคุณจะแสดงที่นี่"
              actionLabel="ดูนัดหมาย"
              actionHref="/artist/appointments"
            />
          </section>

          {/* Recent Booking Requests */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
                <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">คำขอจองล่าสุด</h2>
              </div>
              <Link href="/artist/booking-requests" className="text-xs text-[#9CA3AB] hover:text-[#FFFFFF] flex items-center gap-1 transition-colors">
                ดูคำขอทั้งหมด <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            
            <div className="md:border border-[#262626] rounded-xl bg-[#171717] shadow-md">
              <EmptyState 
                icon={Inbox}
                title="ยังไม่มีคำขอจองใหม่"
                description="คำขอจากลูกค้าจะปรากฏที่นี่"
              />
            </div>
          </section>

        </div>

        {/* Right Column: Status & Quick Actions */}
        <div className="space-y-8">
          
          {/* Daily Capacity Preview */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
              <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">สถานะคิวของฉัน</h2>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 shadow-sm">
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-[#262626]">
                  <span className="text-[#9CA3AB] text-sm">วันนี้</span>
                  <span className="text-[#747C85] text-sm font-medium">—</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9CA3AB] text-sm">พรุ่งนี้</span>
                  <span className="text-[#747C85] text-sm font-medium">—</span>
                </div>
              </div>
              <Link 
                href="/artist/calendar"
                className="mt-5 block w-full py-2.5 text-center text-xs font-medium text-[#9CA3AB] border border-[#262626] rounded-md hover:bg-[#262626] hover:text-[#F3F3F3] transition-colors"
              >
                จัดการปฏิทินงาน
              </Link>
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
              <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">การจัดการด่วน</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/artist/booking-requests" className="flex flex-col items-center justify-center p-5 bg-[#171717] border border-[#262626] rounded-xl hover:bg-[#262626] hover:border-[#FFFFFF]/45 transition-all duration-200 group shadow-sm">
                <Inbox className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-medium text-[#C8CDD3] group-hover:text-[#F3F3F3]">ดูคำขอจอง</span>
              </Link>
              <Link href="/artist/calendar" className="flex flex-col items-center justify-center p-5 bg-[#171717] border border-[#262626] rounded-xl hover:bg-[#262626] hover:border-[#FFFFFF]/45 transition-all duration-200 group shadow-sm">
                <CalendarDays className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-medium text-[#C8CDD3] group-hover:text-[#F3F3F3]">ดูปฏิทิน</span>
              </Link>
              <Link href="/artist/profile" className="flex flex-col items-center justify-center p-5 bg-[#171717] border border-[#262626] rounded-xl hover:bg-[#262626] hover:border-[#FFFFFF]/45 transition-all duration-200 group shadow-sm col-span-2">
                <User className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-medium text-[#C8CDD3] group-hover:text-[#F3F3F3]">แก้ไขโปรไฟล์</span>
              </Link>
            </div>
          </section>
          
          {/* Profile Completeness Placeholder */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-medium text-[#F3F3F3] mb-1">โปรไฟล์ยังไม่สมบูรณ์</h3>
            <p className="text-xs text-[#9CA3AB] mb-4">
              เพิ่มข้อมูลและสไตล์งานที่รับ เพื่อให้ลูกค้าสามารถเลือกคุณได้อย่างมั่นใจ
            </p>
            <div className="w-full bg-[#000000] rounded-full h-1.5 mb-4">
              <div className="bg-[#747C85] h-1.5 rounded-full" style={{ width: '40%' }}></div>
            </div>
            <Link 
              href="/artist/onboarding" 
              className="text-xs font-medium text-[#F3F3F3] underline hover:text-[#FFFFFF]"
            >
              ตั้งค่าโปรไฟล์
            </Link>
          </div>

        </div>
      </div>
      
    </div>
  )
}
