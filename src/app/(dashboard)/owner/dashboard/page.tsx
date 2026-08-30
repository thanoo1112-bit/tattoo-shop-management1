import { requireOwner, getShopDetails } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { DashboardStatCard } from '@/components/owner/dashboard-stat-card'
import { EmptyState } from '@/components/owner/empty-state'
import { ArtistTeamList } from '@/components/owner/dashboard/ArtistTeamList'
import { CalendarDays, Inbox, Users, Wallet, ArrowRight, BarChart3, User } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

export default async function OwnerDashboardPage() {
  const { user, membership } = await requireOwner()
  const shop = await getShopDetails(membership.shop_id)
  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const ownerName = profile?.full_name || user.email?.split('@')[0] || 'Admin'

  const { data: artists } = await supabase
    .from('shop_members')
    .select(`
      id,
      user_id,
      role,
      status,
      joined_at,
      profiles (
        full_name,
        email,
        phone,
        avatar_url
      )
    `)
    .eq('shop_id', membership.shop_id)
    .in('role', ['artist', 'owner'])
    .eq('status', 'active')
    .order('joined_at', { ascending: false })
    .limit(5)

  const activeArtists = (artists || []) as any[]

  // Bangkok today boundaries
  const now = new Date()
  const bkkTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const bkkYear = bkkTime.getUTCFullYear()
  const bkkMonth = bkkTime.getUTCMonth()
  const bkkDate = bkkTime.getUTCDate()

  const startOfDay = new Date(Date.UTC(bkkYear, bkkMonth, bkkDate, 0 - 7, 0, 0, 0))
  const endOfDay = new Date(Date.UTC(bkkYear, bkkMonth, bkkDate, 23 - 7, 59, 59, 999))
  
  // Month boundaries for this month's overview
  const startOfMonth = new Date(Date.UTC(bkkYear, bkkMonth, 1, 0 - 7, 0, 0, 0))
  const endOfMonth = new Date(Date.UTC(bkkYear, bkkMonth + 1, 0, 23 - 7, 59, 59, 999))

  // 1. Query booking requests status counts
  const { data: brCountsData } = await supabase
    .from('booking_requests')
    .select('status, payments(id, status, payment_type)')
    .eq('shop_id', membership.shop_id)

  const brCounts = brCountsData || []
  const countNewRequests = brCounts.filter((r: any) => r.status === 'pending_review').length
  const countAwaitingDeposit = brCounts.filter((r: any) => {
    if (r.status === 'pending_payment') return true
    return r.payments?.some((p: any) => p.payment_type === 'deposit' && p.status === 'verification_pending')
  }).length

  // 2. Query today's appointments and all scheduled appointments
  const { data: allApptsData } = await supabase
    .from('appointments')
    .select('id, status, start_at, artist_id, artist:profiles!appointments_artist_id_fkey(full_name), customer:customers!appointments_shop_id_customer_id_fkey(full_name)')
    .eq('shop_id', membership.shop_id)

  const apptsList = (allApptsData || []) as any[]
  const countConfirmedAll = apptsList.filter((a: any) => a.status === 'scheduled').length

  // Today's appointments (status scheduled, in_progress, completed)
  const todayApptsList = apptsList.filter((a: any) => {
    const startIso = a.start_at
    return startIso >= startOfDay.toISOString() && 
           startIso <= endOfDay.toISOString() &&
           ['scheduled', 'in_progress', 'completed'].includes(a.status)
  }).sort((a: any, b: any) => a.start_at.localeCompare(b.start_at))
  
  const countTodayWork = todayApptsList.length

  const todayApptsCountByArtist: Record<string, number> = {}
  for (const apt of todayApptsList) {
    if (apt.artist_id) {
      todayApptsCountByArtist[apt.artist_id] = (todayApptsCountByArtist[apt.artist_id] || 0) + 1
    }
  }

  // 3. Month's completed appointments
  const completedMonthCount = apptsList.filter((a: any) => {
    const startIso = a.start_at
    return a.status === 'completed' &&
           startIso >= startOfMonth.toISOString() &&
           startIso <= endOfMonth.toISOString()
  }).length

  // 4. Monthly financial data: revenue, deposit
  const { data: monthPaymentsData } = await supabase
    .from('payments')
    .select('amount, status, payment_type, paid_at')
    .eq('shop_id', membership.shop_id)
    .eq('status', 'paid')
    .gte('paid_at', startOfMonth.toISOString())
    .lte('paid_at', endOfMonth.toISOString())

  const paidMonthPayments = monthPaymentsData || []
  const monthRevenue = paidMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0)
  const monthDeposit = paidMonthPayments.filter(p => p.payment_type === 'deposit').reduce((sum, p) => sum + Number(p.amount), 0)

  // 5. Outstanding balance
  const { data: projectsData } = await supabase
    .from('tattoo_projects')
    .select(`
      id,
      agreed_price,
      status,
      payments(id, amount, status),
      booking_requests(payments(id, amount, status))
    `)
    .eq('shop_id', membership.shop_id)
    .not('status', 'in', '("cancelled","rejected")')

  let totalOutstanding = 0
  if (projectsData) {
    for (const proj of projectsData) {
      const agreed = proj.agreed_price ? Number(proj.agreed_price) : 0
      if (agreed <= 0) continue

      const projPayments = proj.payments || []
      const brPayments: any[] = []
      if (proj.booking_requests) {
        for (const br of proj.booking_requests as any[]) {
          if (br.payments) brPayments.push(...br.payments)
        }
      }

      const uniquePaymentsMap = new Map()
      for (const p of projPayments) {
        if (p?.id) uniquePaymentsMap.set(p.id, p)
      }
      for (const p of brPayments) {
        if (p?.id) uniquePaymentsMap.set(p.id, p)
      }
      
      const allProjPayments = Array.from(uniquePaymentsMap.values())
      const totalPaidOnProject = allProjPayments
        .filter((p: any) => p.status === 'paid')
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0)

      const outstanding = agreed - totalPaidOnProject
      if (outstanding > 0) {
        totalOutstanding += outstanding
      }
    }
  }

  // 6. Query tasks (booking requests that need attention)
  const { data: bookingRequestsRaw } = await supabase
    .from('booking_requests')
    .select(`
      id,
      submitted_full_name,
      status,
      created_at,
      artist_id,
      artist:profiles!booking_requests_artist_id_fkey(full_name),
      payments(id, status, payment_type)
    `)
    .eq('shop_id', membership.shop_id)
    .in('status', ['pending_review', 'pending_payment', 'verification_pending'])
    .order('created_at', { ascending: false })
    .limit(10)

  const rawRequests = bookingRequestsRaw || []
  const tasksToManage = rawRequests.map((req: any) => {
    const artistName = req.artist?.full_name || 'ไม่ระบุ'
    const depositPay = req.payments?.find((p: any) => p.payment_type === 'deposit')
    
    let type: 'new' | 'verification' | 'payment' | 'rejected_payment' = 'new'
    let label = 'คำขอใหม่'
    let actionLabel = 'ดูรายละเอียด'
    
    if (req.status === 'pending_review') {
      type = 'new'
      label = 'คำขอใหม่'
      actionLabel = 'ดูรายละเอียด'
    } else if (depositPay?.status === 'verification_pending') {
      type = 'verification'
      label = 'ส่งหลักฐานแล้ว'
      actionLabel = 'ตรวจสอบ'
    } else if (depositPay?.status === 'failed') {
      type = 'rejected_payment'
      label = 'หลักฐานไม่ถูกต้อง'
      actionLabel = 'ดูรายละเอียด'
    } else {
      type = 'payment'
      label = 'รอชำระมัดจำ'
      actionLabel = 'ดูรายละเอียด'
    }

    return {
      id: req.id,
      customerName: req.submitted_full_name || 'ไม่ทราบชื่อ',
      artistName,
      status: req.status,
      type,
      label,
      actionLabel
    }
  }).slice(0, 5)

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Welcome Greeting */}
      <div>
        <h1 className="text-2xl font-light text-[#F5F5F5] mb-1">
          สวัสดี, <span className="font-semibold">{ownerName}</span>
        </h1>
        <p className="text-xs text-[#8A8A8A] uppercase tracking-wider font-semibold">
          STUDIO OWNER DASHBOARD • {shop?.name || '157 TATTOO'}
        </p>
      </div>

      {/* วันนี้ Counters Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-[#8A8A8A] uppercase tracking-wider">วันนี้</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="bg-[#111111] border border-[#292929] rounded-xl p-5 text-center transition-colors hover:border-[#404040]">
            <div className="text-xs text-[#8A8A8A] font-medium uppercase mb-1">คำขอใหม่</div>
            <div className="text-3xl font-semibold text-white">{countNewRequests}</div>
          </div>
          <div className="bg-[#111111] border border-[#292929] rounded-xl p-5 text-center transition-colors hover:border-[#404040]">
            <div className="text-xs text-[#8A8A8A] font-medium uppercase mb-1">รอมัดจำ</div>
            <div className="text-3xl font-semibold text-white">{countAwaitingDeposit}</div>
          </div>
          <div className="bg-[#111111] border border-[#292929] rounded-xl p-5 text-center transition-colors hover:border-[#404040]">
            <div className="text-xs text-[#8A8A8A] font-medium uppercase mb-1">คิวยืนยันแล้วทั้งหมด</div>
            <div className="text-3xl font-semibold text-white">{countConfirmedAll}</div>
          </div>
          <div className="bg-[#111111] border border-[#292929] rounded-xl p-5 text-center transition-colors hover:border-[#404040]">
            <div className="text-xs text-[#8A8A8A] font-medium uppercase mb-1">งานวันนี้</div>
            <div className="text-3xl font-semibold text-white">{countTodayWork}</div>
          </div>
        </div>
      </div>

      {/* Grid: Left layout (Tasks, Queue, Monthly) / Right layout (Team, Shortcut) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          
          {/* งานที่ต้องจัดการ */}
          <section className="bg-[#111111] border border-[#292929] rounded-xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#292929]">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">งานที่ต้องจัดการ</h2>
            </div>
            {tasksToManage.length > 0 ? (
              <div className="divide-y divide-[#292929]/50">
                {tasksToManage.map((task) => (
                  <div key={task.id} className="py-4 first:pt-3.5 last:pb-0 flex items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#F5F5F5]">{task.customerName}</span>
                        <span className="text-xs text-[#8A8A8A]">•</span>
                        <span className="text-xs text-[#A3A3A3]">ช่าง{task.artistName}</span>
                      </div>
                      <div className="text-xs">
                        {task.type === 'new' && (
                          <span className="text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                            คำขอใหม่
                          </span>
                        )}
                        {task.type === 'verification' && (
                          <span className="text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                            ส่งหลักฐานแล้ว
                          </span>
                        )}
                        {task.type === 'payment' && (
                          <span className="text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                            รอชำระมัดจำ
                          </span>
                        )}
                        {task.type === 'rejected_payment' && (
                          <span className="text-red-500 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                            หลักฐานไม่ถูกต้อง
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Link
                        href={`/owner/booking-requests`}
                        className="inline-flex items-center justify-center px-4 py-2 bg-[#1A1A1A] border border-[#292929] text-xs font-semibold text-white rounded-lg hover:bg-[#262626] transition-colors"
                      >
                        {task.actionLabel}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-[#8A8A8A]">
                ไม่มีงานที่ต้องจัดการในขณะนี้
              </div>
            )}
          </section>

          {/* คิววันนี้ */}
          <section className="bg-[#111111] border border-[#292929] rounded-xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#292929]">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">คิววันนี้</h2>
            </div>
            {todayApptsList.length > 0 ? (
              <div className="divide-y divide-[#292929]/50">
                {todayApptsList.map((apt) => (
                  <div key={apt.id} className="py-4 first:pt-3.5 last:pb-0 flex items-center gap-4">
                    <div className="text-sm font-bold text-emerald-400 w-14 shrink-0">
                      {formatTime(apt.start_at)}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-[#F5F5F5] block">
                        {apt.customer?.full_name || 'ไม่ทราบชื่อลูกค้า'}
                      </span>
                      <span className="text-xs text-[#A3A3A3]">
                        ช่าง: {apt.artist?.full_name || 'ไม่ระบุ'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-[#8A8A8A]">
                ไม่มีคิวงานในวันนี้
              </div>
            )}
          </section>

          {/* ภาพรวมเดือนนี้ */}
          <section className="bg-[#111111] border border-[#292929] rounded-xl p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#292929] mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">ภาพรวมเดือนนี้</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#151515] border border-[#292929] rounded-xl p-4.5">
                <div className="text-[10px] text-[#8A8A8A] font-semibold uppercase tracking-wider mb-1">งานเสร็จ</div>
                <div className="text-lg font-bold text-white">{completedMonthCount} งาน</div>
              </div>
              <div className="bg-[#151515] border border-[#292929] rounded-xl p-4.5">
                <div className="text-[10px] text-[#8A8A8A] font-semibold uppercase tracking-wider mb-1">รายรับ</div>
                <div className="text-lg font-bold text-emerald-400">฿{monthRevenue.toLocaleString()}</div>
              </div>
              <div className="bg-[#151515] border border-[#292929] rounded-xl p-4.5">
                <div className="text-[10px] text-[#8A8A8A] font-semibold uppercase tracking-wider mb-1">ยอดมัดจำ</div>
                <div className="text-lg font-bold text-white">฿{monthDeposit.toLocaleString()}</div>
              </div>
              <div className="bg-[#151515] border border-[#292929] rounded-xl p-4.5">
                <div className="text-[10px] text-[#8A8A8A] font-semibold uppercase tracking-wider mb-1">ยอดค้างชำระ</div>
                <div className="text-lg font-bold text-amber-500">฿{totalOutstanding.toLocaleString()}</div>
              </div>
            </div>
          </section>

        </div>

        {/* Right side widgets: Artist Team & Shortcuts */}
        <div className="space-y-8">
           <ArtistTeamList artists={activeArtists} shopId={membership.shop_id} todayApptsCountByArtist={todayApptsCountByArtist} />

          <section className="bg-[#111111] border border-[#292929] rounded-xl p-6">
            <div className="flex items-center gap-3 pb-3.5 border-b border-[#292929] mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-white">ทางลัด</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/owner/calendar" className="flex flex-col items-center justify-center p-5 bg-[#151515] border border-[#292929] rounded-xl hover:bg-[#1A1A1A] hover:border-[#FFFFFF]/30 transition-all duration-200 group shadow-sm">
                <CalendarDays className="h-6 w-6 text-[#8A8A8A] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-semibold text-[#A3A3A3] group-hover:text-[#F3F3F3]">ดูปฏิทิน</span>
              </Link>
              <Link href="/owner/booking-requests" className="flex flex-col items-center justify-center p-5 bg-[#151515] border border-[#292929] rounded-xl hover:bg-[#1A1A1A] hover:border-[#FFFFFF]/30 transition-all duration-200 group shadow-sm">
                <Inbox className="h-6 w-6 text-[#8A8A8A] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-semibold text-[#A3A3A3] group-hover:text-[#F3F3F3]">ดูคำขอจอง</span>
              </Link>
              <Link href="/owner/artists" className="flex flex-col items-center justify-center p-5 bg-[#151515] border border-[#292929] rounded-xl hover:bg-[#1A1A1A] hover:border-[#FFFFFF]/30 transition-all duration-200 group shadow-sm">
                <Users className="h-6 w-6 text-[#8A8A8A] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-semibold text-[#A3A3A3] group-hover:text-[#F3F3F3]">จัดการช่างสัก</span>
              </Link>
              <Link href="/owner/reports" className="flex flex-col items-center justify-center p-5 bg-[#151515] border border-[#292929] rounded-xl hover:bg-[#1A1A1A] hover:border-[#FFFFFF]/30 transition-all duration-200 group shadow-sm">
                <BarChart3 className="h-6 w-6 text-[#8A8A8A] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-semibold text-[#A3A3A3] group-hover:text-[#F3F3F3]">ดูรายงาน</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
