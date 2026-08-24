import { requireOwner, getShopDetails } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { DashboardStatCard } from '@/components/owner/dashboard-stat-card'
import { EmptyState } from '@/components/owner/empty-state'
import { ArtistTeamList } from '@/components/owner/dashboard/ArtistTeamList'
import { PublicStorefrontLink } from '@/components/owner/dashboard/PublicStorefrontLink'
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
    .eq('role', 'artist')
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

  const { data: appointments } = await supabase
    .from('appointments')
    .select(`
      id,
      artist_id,
      start_at,
      end_at,
      status,
      artist:profiles!appointments_artist_id_fkey(full_name, email),
      customer:customers!appointments_shop_id_customer_id_fkey(full_name),
      project:tattoo_projects!appointments_shop_id_project_id_fkey(name, tattoo_style, body_placement)
    `)
    .eq('shop_id', membership.shop_id)
    .gte('start_at', startOfDay.toISOString())
    .lte('start_at', endOfDay.toISOString())
    .order('start_at', { ascending: true })

  const todayAppointments = (appointments || []) as any[]

  // Calculate distinct active artists today
  const activeTodayAppts = todayAppointments.filter((a: any) => a.status !== 'cancelled' && a.status !== 'no_show')
  const distinctArtistIdsToday = Array.from(new Set(
    activeTodayAppts
      .filter((a: any) => a.artist_id)
      .map((a: any) => a.artist_id)
  ))
  const activeArtistsCountToday = distinctArtistIdsToday.length

  // Query real payments today
  const { data: paymentsToday } = await supabase
    .from('payments')
    .select('amount')
    .eq('shop_id', membership.shop_id)
    .eq('status', 'paid')
    .gte('paid_at', startOfDay.toISOString())
    .lte('paid_at', endOfDay.toISOString())

  const todayRevenueSum = (paymentsToday || []).reduce((sum, p) => sum + Number(p.amount), 0)

  const { data: recentBookingRequests } = await supabase
    .from('booking_requests')
    .select(`
      id,
      requested_start_at,
      status,
      submitted_full_name,
      artist:profiles!booking_requests_artist_id_fkey(full_name, email),
      project:tattoo_projects!booking_requests_shop_id_project_id_fkey(tattoo_style)
    `)
    .eq('shop_id', membership.shop_id)
    .order('created_at', { ascending: false })
    .limit(5)

  const latestBookingRequests = (recentBookingRequests || []) as any[]

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  }
  
  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  }

  const appointmentStatusMap: Record<string, string> = {
    scheduled: 'ยืนยันแล้ว',
    in_progress: 'กำลังสัก',
    completed: 'เสร็จสิ้น',
    cancelled: 'ยกเลิก',
    no_show: 'ไม่มาตามนัด'
  }

  const bookingStatusMap: Record<string, string> = {
    pending_review: 'รอตรวจสอบ',
    pending_payment: 'รอชำระมัดจำ',
    verification_pending: 'รอตรวจสอบหลักฐาน',
    changes_requested: 'ขอแก้ไข',
    approved: 'อนุมัติแล้ว',
    rejected: 'ปฏิเสธ',
    cancelled: 'ยกเลิก',
    expired: 'หมดอายุ'
  }

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-12">
      {/* Hero Section */}
      <div className="relative bg-[#171717] border border-[#262626] rounded-xl p-8 overflow-hidden shadow-lg">
        
        <div className="relative z-10">
          <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#262626] border border-[#262626] mb-4">
            <span className="text-[10px] uppercase tracking-wider text-[#9CA3AB]">Tattoo Studio Management</span>
          </div>
          <h1 className="text-3xl font-light text-[#F3F3F3] mb-2 tracking-wide">
            สวัสดี, <span className="font-medium">{ownerName}</span>
          </h1>
          <p className="text-sm text-[#9CA3AB]">
            ภาพรวมการดำเนินงานของ {shop?.name || '157 TATTOO'} ในวันนี้
          </p>
        </div>
      </div>

      {/* Public Storefront Link Section */}
      <PublicStorefrontLink shopSlug={shop?.slug || '157-tattoo'} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        <DashboardStatCard 
          title="คิววันนี้" 
          value={activeTodayAppts.length.toString()} 
          subtitle={activeTodayAppts.length > 0 ? `${activeTodayAppts.length} คิวงาน` : "ยังไม่มีข้อมูลคิว"} 
          icon={<CalendarDays className="h-5 w-5" />} 
          type="appointments"
        />
        <DashboardStatCard 
          title="คำขอจองใหม่" 
          value={latestBookingRequests.filter((r: any) => r.status === 'pending_review' || r.status === 'pending_payment').length.toString()} 
          subtitle="คำขอรอการตรวจสอบ" 
          icon={<Inbox className="h-5 w-5" />} 
          type="requests"
        />
        <DashboardStatCard 
          title="ช่างที่มีงานวันนี้" 
          value={activeArtistsCountToday.toString()} 
          subtitle={activeArtistsCountToday > 0 ? `${activeArtistsCountToday} คนที่มีคิววันนี้` : "ยังไม่มีช่างที่มีคิววันนี้"} 
          icon={<Users className="h-5 w-5" />} 
          type="artists"
        />
        <DashboardStatCard 
          title="รายได้วันนี้" 
          value={`฿${todayRevenueSum.toLocaleString()}`} 
          subtitle={todayRevenueSum > 0 ? "มียอดชำระเงินเข้ามาในวันนี้" : "ยังไม่มีรายได้ในวันนี้"} 
          icon={<Wallet className="h-5 w-5" />} 
          type="revenue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
                <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">ตารางงานวันนี้</h2>
              </div>
              <Link href="/owner/calendar" className="text-xs text-[#9CA3AB] hover:text-[#FFFFFF] flex items-center gap-1 transition-colors">
                ดูปฏิทิน <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {todayAppointments.length > 0 ? (
              <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-md divide-y divide-[#262626]">
                {todayAppointments.map((apt: any) => (
                  <div key={apt.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-[#1E1E1E] transition-colors">
                    <div className="w-20 flex-shrink-0 text-[#F3F3F3] font-medium">
                      {formatTime(apt.start_at)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#F3F3F3]">
                        {apt.customer?.full_name || 'ไม่ทราบชื่อลูกค้า'}
                      </p>
                      <p className="text-xs text-[#9CA3AB] mt-1">
                        ช่าง: {apt.artist?.full_name || apt.artist?.email || 'ไม่ระบุ'}
                        {apt.project && (
                          <>
                            <span className="mx-2">•</span>
                            {apt.project.tattoo_style || 'ไม่ระบุสไตล์'}
                            {apt.project.body_placement && ` • ${apt.project.body_placement}`}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-[#262626] text-[#C8CDD3] border border-[#333333]">
                        {appointmentStatusMap[apt.status] || apt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState 
                icon={CalendarDays}
                title="ยังไม่มีคิวงานในวันนี้"
                description="เมื่อมีการยืนยันคิว ตารางงานจะแสดงที่นี่"
                actionLabel="ดูปฏิทิน"
                actionHref="/owner/calendar"
              />
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
                <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">คำขอจองล่าสุด</h2>
              </div>
              <Link href="/owner/booking-requests" className="text-xs text-[#9CA3AB] hover:text-[#FFFFFF] flex items-center gap-1 transition-colors">
                ดูคำขอทั้งหมด <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {latestBookingRequests.length > 0 ? (
              <>
                <div className="hidden md:grid grid-cols-4 gap-4 px-6 py-3.5 text-xs font-medium text-[#9CA3AB] uppercase tracking-wider bg-[#262626] border border-[#262626] rounded-t-xl">
                  <div>ลูกค้า</div>
                  <div>ช่างสัก</div>
                  <div>วันที่ต้องการ</div>
                  <div>สถานะ</div>
                </div>
                <div className="md:border-x md:border-b border-[#262626] rounded-b-xl bg-[#171717] shadow-md divide-y divide-[#262626]">
                  {latestBookingRequests.map((req: any) => (
                    <div key={req.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 md:px-6 hover:bg-[#1E1E1E] transition-colors items-center">
                      <div>
                        <span className="md:hidden text-xs text-[#9CA3AB] uppercase mb-1 block">ลูกค้า</span>
                        <p className="text-sm font-medium text-[#F3F3F3]">
                          {req.submitted_full_name || 'ไม่ทราบชื่อลูกค้า'}
                        </p>
                        {req.project?.tattoo_style && (
                          <p className="text-xs text-[#9CA3AB] mt-0.5 md:hidden lg:block truncate">
                            {req.project.tattoo_style}
                          </p>
                        )}
                      </div>
                      <div>
                        <span className="md:hidden text-xs text-[#9CA3AB] uppercase mb-1 block">ช่างสัก</span>
                        <p className="text-sm text-[#C8CDD3]">
                          {req.artist?.full_name || req.artist?.email || 'ไม่ระบุ'}
                        </p>
                      </div>
                      <div>
                        <span className="md:hidden text-xs text-[#9CA3AB] uppercase mb-1 block">วันที่ต้องการ</span>
                        <p className="text-sm text-[#C8CDD3]">
                          {formatDate(req.requested_start_at)}
                        </p>
                      </div>
                      <div>
                        <span className="md:hidden text-xs text-[#9CA3AB] uppercase mb-1 block">สถานะ</span>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-[#262626] text-[#C8CDD3] border border-[#333333]">
                          {bookingStatusMap[req.status] || req.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="border border-[#262626] rounded-xl bg-[#171717] shadow-md">
                <EmptyState 
                  icon={Inbox}
                  title="ยังไม่มีคำขอจอง"
                  description="คำขอจากลูกค้าจะปรากฏที่นี่"
                />
              </div>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <ArtistTeamList artists={activeArtists} shopId={membership.shop_id} />

          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
              <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">ทางลัด</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/owner/calendar" className="flex flex-col items-center justify-center p-5 bg-[#171717] border border-[#262626] rounded-xl hover:bg-[#262626] hover:border-[#FFFFFF]/45 transition-all duration-200 group shadow-sm">
                <CalendarDays className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-medium text-[#C8CDD3] group-hover:text-[#F3F3F3]">ดูปฏิทิน</span>
              </Link>
              <Link href="/owner/booking-requests" className="flex flex-col items-center justify-center p-5 bg-[#171717] border border-[#262626] rounded-xl hover:bg-[#262626] hover:border-[#FFFFFF]/45 transition-all duration-200 group shadow-sm">
                <Inbox className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-medium text-[#C8CDD3] group-hover:text-[#F3F3F3]">ดูคำขอจอง</span>
              </Link>
              <Link href="/owner/artists" className="flex flex-col items-center justify-center p-5 bg-[#171717] border border-[#262626] rounded-xl hover:bg-[#262626] hover:border-[#FFFFFF]/45 transition-all duration-200 group shadow-sm">
                <Users className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-medium text-[#C8CDD3] group-hover:text-[#F3F3F3]">จัดการช่างสัก</span>
              </Link>
              <Link href="/owner/reports" className="flex flex-col items-center justify-center p-5 bg-[#171717] border border-[#262626] rounded-xl hover:bg-[#262626] hover:border-[#FFFFFF]/45 transition-all duration-200 group shadow-sm">
                <BarChart3 className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#FFFFFF] mb-2.5 transition-colors" />
                <span className="text-xs font-medium text-[#C8CDD3] group-hover:text-[#F3F3F3]">ดูรายงาน</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
