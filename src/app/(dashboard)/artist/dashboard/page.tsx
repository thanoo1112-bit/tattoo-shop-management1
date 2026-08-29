import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Inbox, ArrowRight, User, CalendarDays, ClipboardCheck, Wallet, Clock } from 'lucide-react'
import { DashboardStatCard } from '@/components/owner/dashboard-stat-card'
import { EmptyState } from '@/components/owner/empty-state'

export default async function ArtistDashboard() {
  const { user } = await requireArtist()
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const artistName = profile?.full_name || user.email || 'Artist'

  // Bangkok timezone boundaries
  const now = new Date()
  const bkkTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const bkkYear = bkkTime.getUTCFullYear()
  const bkkMonth = bkkTime.getUTCMonth()
  const bkkDate = bkkTime.getUTCDate()
  const startOfDay = new Date(Date.UTC(bkkYear, bkkMonth, bkkDate, 0 - 7, 0, 0, 0))
  const endOfDay = new Date(Date.UTC(bkkYear, bkkMonth, bkkDate, 23 - 7, 59, 59, 999))
  const startOfTomorrow = new Date(Date.UTC(bkkYear, bkkMonth, bkkDate + 1, 0 - 7, 0, 0, 0))
  const endOfTomorrow = new Date(Date.UTC(bkkYear, bkkMonth, bkkDate + 1, 23 - 7, 59, 59, 999))
  const startOfMonth = new Date(Date.UTC(bkkYear, bkkMonth, 1, 0 - 7, 0, 0, 0))
  const endOfMonth = new Date(Date.UTC(bkkYear, bkkMonth + 1, 0, 23 - 7, 59, 59, 999))

  // 1. New booking requests for this artist
  const { data: newRequests } = await supabase
    .from('booking_requests')
    .select('id, status')
    .eq('artist_id', user.id)
    .eq('status', 'pending_review')

  const countNewRequests = (newRequests || []).length

  // 2. All appointments for this artist (used for multiple metrics)
  const { data: allAppts } = await supabase
    .from('appointments')
    .select('id, status, start_at, end_at, artist_id, customer:customers!appointments_shop_id_customer_id_fkey(full_name)')
    .eq('artist_id', user.id)

  const apptsList = (allAppts || []) as any[]

  // Today's appointments
  const todayAppts = apptsList.filter((a: any) => {
    const s = a.start_at
    return s >= startOfDay.toISOString() &&
           s <= endOfDay.toISOString() &&
           !['cancelled'].includes(a.status)
  }).sort((a: any, b: any) => a.start_at.localeCompare(b.start_at))
  const countTodayWork = todayAppts.length

  // Tomorrow's appointments
  const tomorrowAppts = apptsList.filter((a: any) => {
    const s = a.start_at
    return s >= startOfTomorrow.toISOString() &&
           s <= endOfTomorrow.toISOString() &&
           !['cancelled'].includes(a.status)
  })
  const countTomorrowWork = tomorrowAppts.length

  // Confirmed/scheduled appointments
  const countConfirmed = apptsList.filter((a: any) => a.status === 'scheduled').length

  // Upcoming appointments (future, not cancelled, sorted by start_at, limit 3)
  const upcomingAppts = apptsList
    .filter((a: any) => a.start_at >= now.toISOString() && !['cancelled', 'completed'].includes(a.status))
    .sort((a: any, b: any) => a.start_at.localeCompare(b.start_at))
    .slice(0, 3)

  // 3. Monthly revenue for this artist (same logic as /artist/earnings)
  const { data: artistProjects } = await supabase
    .from('tattoo_projects')
    .select(`
      id,
      agreed_price,
      payments(id, amount, status, payment_type, paid_at),
      booking_requests(id, payments(id, amount, status, payment_type, paid_at))
    `)
    .eq('artist_id', user.id)

  let monthRevenue = 0
  for (const p of (artistProjects || [])) {
    const directPay = p.payments || []
    const brPay: any[] = []
    if (p.booking_requests) {
      for (const br of p.booking_requests as any[]) {
        if (br.payments) brPay.push(...br.payments)
      }
    }
    const allPayments = Array.from(new Map([...directPay, ...brPay].map((pay: any) => [pay.id, pay])).values())
    for (const pay of allPayments as any[]) {
      if (pay.status === 'paid' && pay.paid_at &&
          pay.paid_at >= startOfMonth.toISOString() &&
          pay.paid_at <= endOfMonth.toISOString()) {
        monthRevenue += Number(pay.amount)
      }
    }
  }

  // 4. Recent booking requests (limit 5, all statuses)
  const { data: recentRequests } = await supabase
    .from('booking_requests')
    .select(`
      id, status, submitted_full_name, created_at, confirmed_start_at,
      project:tattoo_projects(id, tattoo_style, work_type)
    `)
    .eq('artist_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const recentReqList = (recentRequests || []) as any[]

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending_review': return { text: 'รอตรวจสอบ', cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' }
      case 'pending_payment': return { text: 'รอมัดจำ', cls: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' }
      case 'verification_pending': return { text: 'ตรวจสอบสลิป', cls: 'bg-purple-500/10 text-purple-400 border border-purple-500/20' }
      case 'approved': return { text: 'อนุมัติแล้ว', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
      case 'rejected': return { text: 'ปฏิเสธ', cls: 'bg-red-500/10 text-red-400 border border-red-500/20' }
      case 'cancelled': return { text: 'ยกเลิก', cls: 'bg-[#262626] text-[#737373] border border-[#333]' }
      default: return { text: s, cls: 'bg-[#262626] text-[#737373] border border-[#333]' }
    }
  }

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    } catch { return '' }
  }

  const formatDateShort = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })
    } catch { return '' }
  }

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
          value={String(countNewRequests)} 
          subtitle="รอการตรวจสอบ" 
          icon={<Inbox className="h-5 w-5" />} 
          type="requests"
        />
        <DashboardStatCard 
          title="งานวันนี้" 
          value={String(countTodayWork)} 
          subtitle="นัดหมายของคุณ" 
          icon={<CalendarDays className="h-5 w-5" />} 
          type="appointments"
        />
        <DashboardStatCard 
          title="คิวยืนยันแล้ว" 
          value={String(countConfirmed)} 
          subtitle="นัดหมายที่รอดำเนินการ" 
          icon={<ClipboardCheck className="h-5 w-5" />} 
          type="artists"
        />
        <DashboardStatCard 
          title="รายได้เดือนนี้" 
          value={`฿${monthRevenue.toLocaleString()}`} 
          subtitle="รายได้จากงานของคุณ" 
          icon={<Wallet className="h-5 w-5" />} 
          type="revenue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Appointments & Requests */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Next Appointments */}
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
            {upcomingAppts.length > 0 ? (
              <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-md divide-y divide-[#262626]">
                {upcomingAppts.map((appt: any) => {
                  const customerName = Array.isArray(appt.customer) ? appt.customer[0]?.full_name : appt.customer?.full_name
                  return (
                    <div key={appt.id} className="p-4 flex items-center justify-between gap-3 hover:bg-[#1E1E1E] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center flex-shrink-0">
                          <CalendarDays className="h-4 w-4 text-[#9CA3AB]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#F3F3F3] truncate">{customerName || 'ลูกค้า'}</p>
                          <p className="text-xs text-[#9CA3AB] mt-0.5">
                            {formatDateShort(appt.start_at)} • {formatTime(appt.start_at)}
                            {appt.end_at ? ` – ${formatTime(appt.end_at)}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border flex-shrink-0 ${
                        appt.status === 'in_progress' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}>
                        {appt.status === 'in_progress' ? 'กำลังทำงาน' : 'ยืนยันแล้ว'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState 
                icon={CalendarDays}
                title="ยังไม่มีคิวที่กำลังจะมาถึง"
                description="เมื่อมีนัดหมาย คิวถัดไปของคุณจะแสดงที่นี่"
                actionLabel="ดูนัดหมาย"
                actionHref="/artist/appointments"
              />
            )}
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
            
            {recentReqList.length > 0 ? (
              <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-md divide-y divide-[#262626]">
                {recentReqList.map((req: any) => {
                  const badge = statusLabel(req.status)
                  const proj = Array.isArray(req.project) ? req.project[0] : req.project
                  return (
                    <div key={req.id} className="p-4 flex items-center justify-between gap-3 hover:bg-[#1E1E1E] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center flex-shrink-0">
                          <Inbox className="h-4 w-4 text-[#9CA3AB]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#F3F3F3] truncate">{req.submitted_full_name || 'ลูกค้า'}</p>
                          <p className="text-xs text-[#9CA3AB] mt-0.5 truncate">
                            {proj?.tattoo_style || 'งานสัก'}
                            {req.confirmed_start_at ? ` • ${formatDateShort(req.confirmed_start_at)}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border flex-shrink-0 ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="md:border border-[#262626] rounded-xl bg-[#171717] shadow-md">
                <EmptyState 
                  icon={Inbox}
                  title="ยังไม่มีคำขอจองใหม่"
                  description="คำขอจากลูกค้าจะปรากฏที่นี่"
                />
              </div>
            )}
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
                  <span className={`text-sm font-medium ${countTodayWork > 0 ? 'text-[#F3F3F3]' : 'text-[#747C85]'}`}>
                    {countTodayWork > 0 ? `${countTodayWork} คิว` : 'ว่าง'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#9CA3AB] text-sm">พรุ่งนี้</span>
                  <span className={`text-sm font-medium ${countTomorrowWork > 0 ? 'text-[#F3F3F3]' : 'text-[#747C85]'}`}>
                    {countTomorrowWork > 0 ? `${countTomorrowWork} คิว` : 'ว่าง'}
                  </span>
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
          
          {/* Profile setup CTA (static, P3 for dynamic) */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-medium text-[#F3F3F3] mb-1">ตั้งค่าโปรไฟล์</h3>
            <p className="text-xs text-[#9CA3AB] mb-4">
              เพิ่มข้อมูลและสไตล์งานที่รับ เพื่อให้ลูกค้าสามารถเลือกคุณได้อย่างมั่นใจ
            </p>
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
