'use client'

import { useState } from 'react'
import {
  Calendar, TrendingUp, BarChart3, Users, DollarSign,
  ClipboardList, CheckCircle2, AlertCircle, Sparkles, UserPlus
} from 'lucide-react'
import { formatThaiDate, formatThaiTime } from '@/lib/dateUtils'

// ── Types ──────────────────────────────────────────────────────────────────

interface FlatPayment {
  id: string
  amount: number
  status: string
  payment_type: string
  paid_at: string | null
  created_at: string
  verified_at: string | null
  projectId: string
  artistId: string
  artistName: string
  customerName: string
}

interface ProjectData {
  id: string
  name: string
  status: string
  agreed_price: string | null
  created_at: string
  completed_at: string | null
  artist_id: string
  artistName: string
  customerName: string
}

interface AppointmentData {
  id: string
  status: string
  start_at: string
  end_at: string
  artist_id: string
  actual_started_at: string | null
  actual_ended_at: string | null
}

interface CustomerData {
  id: string
  created_at: string
}

interface Props {
  flatPayments: FlatPayment[]
  projects: ProjectData[]
  appointments: AppointmentData[]
  customers: CustomerData[]
}

// ── Constants & Helpers ───────────────────────────────────────────────────

const monthsThaiFull = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const monthsThaiShort = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
]

function getBangkokYearMonth(isoStr: string): string {
  const d = new Date(isoStr)
  const bkkMs = d.getTime() + 7 * 60 * 60 * 1000
  const bkkDate = new Date(bkkMs)
  const yyyy = bkkDate.getUTCFullYear()
  const mm = String(bkkDate.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function getBangkokYear(isoStr: string): number {
  const d = new Date(isoStr)
  const bkkMs = d.getTime() + 7 * 60 * 60 * 1000
  return new Date(bkkMs).getUTCFullYear()
}

function formatMonthYearThai(yrMo: string): string {
  const [yr, mo] = yrMo.split('-').map(Number)
  const thaiYear = yr + 543
  return `${monthsThaiShort[mo - 1]} ${thaiYear}`
}

export function OwnerReportsClient({ flatPayments, projects, appointments, customers }: Props) {
  const [period, setPeriod] = useState<'this_month' | 'prev_month' | 'this_year' | 'all' | string>('this_month')

  // Bangkok today details
  const bkkNow = (() => {
    const now = new Date()
    const bkkMs = now.getTime() + 7 * 60 * 60 * 1000
    return new Date(bkkMs)
  })()

  const currentYear = bkkNow.getUTCFullYear()
  const currentMonth = bkkNow.getUTCMonth() + 1
  const thisMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

  const prevMonthStr = (() => {
    let y = currentYear
    let m = currentMonth - 1
    if (m === 0) {
      m = 12
      y -= 1
    }
    return `${y}-${String(m).padStart(2, '0')}`
  })()

  // Generate dynamic months list from payments
  const monthsList = Array.from(
    new Set(flatPayments.filter(p => p.paid_at).map(p => getBangkokYearMonth(p.paid_at!)))
  ).sort((a, b) => b.localeCompare(a))

  // Unique artists list
  const artistsList = Array.from(
    new Map(projects.map(p => [p.artist_id, p.artistName])).entries()
  ).map(([id, name]) => ({ id, name }))

  // ── Date Filtering Helper ─────────────────────────────────

  const matchPeriod = (dateIso: string | null) => {
    if (!dateIso) return false
    if (period === 'all') return true
    
    const itemYrMo = getBangkokYearMonth(dateIso)
    const itemYr = getBangkokYear(dateIso)

    if (period === 'this_month') return itemYrMo === thisMonthStr
    if (period === 'prev_month') return itemYrMo === prevMonthStr
    if (period === 'this_year') return itemYr === currentYear
    return itemYrMo === period
  }

  // ── MoM Month-over-Month Revenue Growth ────────────────────

  const thisMonthPaidRevenue = flatPayments
    .filter(p => p.status === 'paid' && getBangkokYearMonth(p.paid_at || p.created_at) === thisMonthStr)
    .reduce((sum, p) => sum + p.amount, 0)

  const prevMonthPaidRevenue = flatPayments
    .filter(p => p.status === 'paid' && getBangkokYearMonth(p.paid_at || p.created_at) === prevMonthStr)
    .reduce((sum, p) => sum + p.amount, 0)

  const momGrowthElement = (() => {
    if (prevMonthPaidRevenue === 0) {
      return <span className="text-xs text-[#737373]">ไม่มีข้อมูลเปรียบเทียบ</span>
    }
    const pct = ((thisMonthPaidRevenue - prevMonthPaidRevenue) / prevMonthPaidRevenue) * 100
    const color = pct >= 0 ? 'text-emerald-400' : 'text-red-400'
    const sign = pct >= 0 ? '+' : ''
    return <span className={`text-xs font-semibold ${color}`}>{sign}{pct.toFixed(1)}% เทียบกับเดือนก่อนหน้า</span>
  })()

  // ── Summary Metrics calculations based on timeframe filter ──

  const paidPaymentsInPeriod = flatPayments.filter(p => p.status === 'paid' && matchPeriod(p.paid_at))
  
  // 1. Total Paid Revenue
  const totalRevenue = paidPaymentsInPeriod.reduce((sum, p) => sum + p.amount, 0)

  // 2. Completed Projects Count
  const completedProjectsInPeriod = projects.filter(p => p.status === 'completed' && matchPeriod(p.completed_at)).length

  // 3. New Projects Count
  const newProjectsInPeriod = projects.filter(p => matchPeriod(p.created_at)).length

  // 4. Appointments Count
  const appointmentsInPeriod = appointments.filter(a => matchPeriod(a.start_at)).length

  // 5. New Customers Count
  const newCustomersInPeriod = customers.filter(c => matchPeriod(c.created_at)).length

  // 6. Average Project Revenue value
  const distinctProjectsInPeriod = Array.from(new Set(paidPaymentsInPeriod.map(p => p.projectId)))
  const projectsCount = distinctProjectsInPeriod.length
  const averageProjectRevenue = projectsCount > 0 ? Math.round(totalRevenue / projectsCount) : 0

  // ── Payment Type Breakdown ───────────────────────────────

  const depositRevenue = paidPaymentsInPeriod
    .filter(p => p.payment_type === 'deposit')
    .reduce((sum, p) => sum + p.amount, 0)

  const balanceRevenue = paidPaymentsInPeriod
    .filter(p => p.payment_type === 'balance' || p.payment_type === 'full_payment')
    .reduce((sum, p) => sum + p.amount, 0)

  // ── Project & Appointment Status Breakdown ─────────────────

  const filteredProjects = projects.filter(p => matchPeriod(p.created_at))
  const projectProposedCount = filteredProjects.filter(p => p.status === 'proposed').length
  const projectActiveCount = filteredProjects.filter(p => p.status === 'active').length
  const projectCompletedCount = filteredProjects.filter(p => p.status === 'completed').length
  const projectCancelledCount = filteredProjects.filter(p => p.status === 'cancelled').length

  const filteredAppointments = appointments.filter(a => matchPeriod(a.start_at))
  const apptScheduledCount = filteredAppointments.filter(a => a.status === 'scheduled').length
  const apptInProgressCount = filteredAppointments.filter(a => a.status === 'in_progress').length
  const apptCompletedCount = filteredAppointments.filter(a => a.status === 'completed').length
  const apptCancelledCount = filteredAppointments.filter(a => a.status === 'cancelled').length
  const apptNoShowCount = filteredAppointments.filter(a => a.status === 'no_show').length

  // ── Revenue Trend calculations (Last 6 Months) ─────────────

  const trendMonths = (() => {
    const list: string[] = []
    for (let i = 5; i >= 0; i--) {
      let y = currentYear
      let m = currentMonth - i
      if (m <= 0) {
        m += 12
        y -= 1
      }
      list.push(`${y}-${String(m).padStart(2, '0')}`)
    }
    return list
  })()

  const trendData = trendMonths.map(yrMo => {
    const monthPaidPayments = flatPayments.filter(p => p.status === 'paid' && getBangkokYearMonth(p.paid_at || p.created_at) === yrMo)
    const revenue = monthPaidPayments.reduce((sum, p) => sum + p.amount, 0)
    return {
      monthStr: yrMo,
      label: formatMonthYearThai(yrMo),
      revenue
    }
  })

  const maxTrendRevenue = Math.max(...trendData.map(t => t.revenue), 1000)

  // ── Artist Operational Summary ───────────────────────────

  const artistSummaryData = artistsList.map(art => {
    const artPayments = paidPaymentsInPeriod.filter(p => p.artistId === art.id)
    const revenue = artPayments.reduce((sum, p) => sum + p.amount, 0)
    const completedCount = projects.filter(p => p.artist_id === art.id && p.status === 'completed' && matchPeriod(p.completed_at)).length
    const activeCount = projects.filter(p => p.artist_id === art.id && p.status === 'active' && matchPeriod(p.created_at)).length
    const apptsCount = appointments.filter(a => a.artist_id === art.id && matchPeriod(a.start_at)).length
    
    const distinctProjIds = Array.from(new Set(artPayments.map(p => p.projectId)))
    const average = distinctProjIds.length > 0 ? Math.round(revenue / distinctProjIds.length) : 0

    return {
      name: art.name,
      revenue,
      completedCount,
      activeCount,
      apptsCount,
      average
    }
  }).sort((a, b) => b.revenue - a.revenue)

  // ── Recent Completed Projects (Global 5 items) ─────────────

  const recentCompletedProjects = [...projects]
    .filter(p => p.status === 'completed' && p.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-8 w-full max-w-7xl mx-auto">
      {/* Filters row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2.5">
          {(['this_month', 'prev_month', 'this_year', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                period === p
                  ? 'bg-[#F5F5F5] text-black border-[#F5F5F5]'
                  : 'border-[#262626] text-[#737373] hover:text-[#A3A3A3] hover:bg-[#1F1F1F]'
              }`}
            >
              {p === 'this_month' && 'เดือนนี้'}
              {p === 'prev_month' && 'เดือนก่อนหน้า'}
              {p === 'this_year' && 'ปีนี้'}
              {p === 'all' && 'ทั้งหมด'}
            </button>
          ))}
        </div>

        {/* Dynamic Month Selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#737373]" />
          <select
            value={['this_month', 'prev_month', 'this_year', 'all'].includes(period) ? '' : period}
            onChange={e => {
              if (e.target.value) setPeriod(e.target.value)
            }}
            className="bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#737373]"
          >
            <option value="" disabled>เลือกเดือนอื่น...</option>
            {monthsList.map(m => (
              <option key={m} value={m}>{formatMonthYearThai(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* MoM Banner */}
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-[#A3A3A3]">
            รายได้เดือนนี้สะสมจริง <span className="text-[#F5F5F5] font-semibold">฿{thisMonthPaidRevenue.toLocaleString()}</span>
          </p>
        </div>
        {momGrowthElement}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-[10px] text-[#737373] font-medium uppercase">รายได้ทั้งหมด</p>
          <p className="text-lg font-bold text-emerald-400">฿{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-[10px] text-[#737373] font-medium uppercase">งานที่เสร็จ</p>
          <p className="text-lg font-bold text-[#F5F5F5]">{completedProjectsInPeriod} งาน</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-[10px] text-[#737373] font-medium uppercase">งานเข้าใหม่</p>
          <p className="text-lg font-bold text-[#F5F5F5]">{newProjectsInPeriod} งาน</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-[10px] text-[#737373] font-medium uppercase">จำนวนคิวรวม</p>
          <p className="text-lg font-bold text-[#F5F5F5]">{appointmentsInPeriod} คิว</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-[10px] text-[#737373] font-medium uppercase">ลูกค้าใหม่</p>
          <p className="text-lg font-bold text-blue-400">{newCustomersInPeriod} ราย</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-[10px] text-[#737373] font-medium uppercase">รายได้เฉลี่ยต่องาน</p>
          <p className="text-lg font-bold text-[#F5F5F5]">฿{averageProjectRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Middle: Revenue Trend & Payment Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Bar Chart */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-[#262626] pb-2">
            <BarChart3 className="w-4 h-4 text-[#A3A3A3]" />
            <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider">แนวโน้มรายได้ 6 เดือนย้อนหลัง</h3>
          </div>
          
          <div className="h-48 flex items-end gap-3 pt-6 px-2">
            {trendData.map((t, idx) => {
              const heightPct = Math.max(10, Math.round((t.revenue / maxTrendRevenue) * 100))
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  <div className="text-[9px] text-[#737373] opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                    ฿{t.revenue.toLocaleString()}
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full bg-emerald-500/20 border border-emerald-500/35 hover:bg-emerald-500/40 rounded-t transition-all duration-200"
                  />
                  <div className="text-[10px] text-[#A3A3A3] text-center font-medium truncate w-full pt-1">
                    {t.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Breakdown Card */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4 lg:col-span-1">
          <div className="flex items-center gap-2 border-b border-[#262626] pb-2">
            <DollarSign className="w-4 h-4 text-[#A3A3A3]" />
            <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider">สัดส่วนรายได้</h3>
          </div>
          <div className="space-y-4 text-xs pt-4">
            <div className="space-y-1">
              <div className="flex justify-between text-[#A3A3A3]">
                <span>เงินมัดจำ</span>
                <span className="font-semibold text-[#F5F5F5]">฿{depositRevenue.toLocaleString()}</span>
              </div>
              <div className="w-full bg-[#121212] rounded-full h-1.5 overflow-hidden">
                <div
                  style={{ width: `${totalRevenue > 0 ? (depositRevenue / totalRevenue) * 100 : 0}%` }}
                  className="bg-blue-400 h-full"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[#A3A3A3]">
                <span>ยอดคงเหลือ / จ่ายเต็ม</span>
                <span className="font-semibold text-[#F5F5F5]">฿{balanceRevenue.toLocaleString()}</span>
              </div>
              <div className="w-full bg-[#121212] rounded-full h-1.5 overflow-hidden">
                <div
                  style={{ width: `${totalRevenue > 0 ? (balanceRevenue / totalRevenue) * 100 : 0}%` }}
                  className="bg-emerald-400 h-full"
                />
              </div>
            </div>

            <div className="border-t border-[#262626] pt-3 flex justify-between font-bold text-[#F5F5F5] text-sm">
              <span>รวมรายรับสำเร็จ</span>
              <span>฿{totalRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Status Breakdown */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider border-b border-[#262626] pb-2">
            สถานะโปรเจกต์งานสักเข้าใหม่ ({filteredProjects.length} งาน)
          </h3>
          <div className="grid grid-cols-2 gap-4 text-xs pt-2">
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-3">
              <p className="text-[#737373]">รอดำเนินการ</p>
              <p className="text-lg font-bold text-yellow-500 mt-1">{projectProposedCount}</p>
            </div>
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-3">
              <p className="text-[#737373]">กำลังดำเนินการ</p>
              <p className="text-lg font-bold text-blue-400 mt-1">{projectActiveCount}</p>
            </div>
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-3">
              <p className="text-[#737373]">เสร็จสิ้น</p>
              <p className="text-lg font-bold text-green-500 mt-1">{projectCompletedCount}</p>
            </div>
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-3">
              <p className="text-[#737373]">ยกเลิก</p>
              <p className="text-lg font-bold text-[#737373] mt-1">{projectCancelledCount}</p>
            </div>
          </div>
        </div>

        {/* Appointment Status Breakdown */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider border-b border-[#262626] pb-2">
            สรุปสถานะคิวงาน ({filteredAppointments.length} คิว)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2">
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-2.5">
              <p className="text-[#737373] truncate">นัดหมาย</p>
              <p className="text-base font-bold text-blue-400 mt-1">{apptScheduledCount}</p>
            </div>
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-2.5">
              <p className="text-[#737373] truncate">กำลังทำ</p>
              <p className="text-base font-bold text-yellow-500 mt-1">{apptInProgressCount}</p>
            </div>
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-2.5">
              <p className="text-[#737373] truncate">เสร็จสิ้น</p>
              <p className="text-base font-bold text-green-500 mt-1">{apptCompletedCount}</p>
            </div>
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-2.5">
              <p className="text-[#737373] truncate">ยกเลิก</p>
              <p className="text-base font-bold text-[#737373] mt-1">{apptCancelledCount}</p>
            </div>
            <div className="bg-[#121212] border border-[#262626]/60 rounded-lg p-2.5">
              <p className="text-[#737373] truncate">ไม่มาตามนัด</p>
              <p className="text-base font-bold text-red-400 mt-1">{apptNoShowCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Artist Report summary */}
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider border-b border-[#262626] pb-2">
          ผลงานสะสมแยกตามช่างสัก
        </h3>
        
        <div className="space-y-3">
          {artistSummaryData.length === 0 ? (
            <p className="text-xs text-[#737373] text-center py-6">ไม่มีข้อมูลสำหรับช่วงเวลาที่เลือก</p>
          ) : artistSummaryData.map((art, idx) => (
            <div key={idx} className="bg-[#121212] border border-[#262626]/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="space-y-1">
                <p className="font-semibold text-sm text-[#F5F5F5]">{art.name}</p>
                <p className="text-[#737373] text-[10px]">
                  งานเสร็จในระบบ: {art.completedCount} งาน • งานกำลังทำ: {art.activeCount} งาน • คิวทั้งหมด: {art.apptsCount} คิว
                </p>
              </div>

              <div className="flex gap-x-6 gap-y-2 flex-wrap sm:text-right">
                <div>
                  <span className="text-[#737373] block text-[9px] uppercase">เฉลี่ยต่องาน</span>
                  <span className="text-[#A3A3A3]">฿{art.average.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[#737373] block text-[9px] uppercase">รายรับสะสม</span>
                  <span className="text-emerald-400 font-bold text-sm">฿{art.revenue.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Completed Projects */}
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-[#F5F5F5] uppercase tracking-wider border-b border-[#262626] pb-2">
          งานสักที่เสร็จสมบูรณ์ล่าสุด
        </h3>
        
        <div className="divide-y divide-[#262626]/50">
          {recentCompletedProjects.length === 0 ? (
            <p className="text-xs text-[#737373] text-center py-6">ยังไม่มีโปรเจกต์งานสักที่เสร็จสิ้น</p>
          ) : recentCompletedProjects.map((p, idx) => (
            <div key={idx} className="py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs">
              <div className="space-y-1">
                <p className="font-semibold text-[#F5F5F5]">{p.name || 'งานสักไม่มีชื่อ'}</p>
                <div className="text-[10px] text-[#A3A3A3] flex flex-wrap gap-x-3">
                  <span>ลูกค้า: {p.customerName}</span>
                  <span>•</span>
                  <span>ช่าง: {p.artistName}</span>
                </div>
              </div>
              
              <div className="sm:text-right flex items-center sm:flex-col gap-2 sm:gap-1 justify-between shrink-0">
                <span className="text-emerald-400 font-medium font-semibold text-sm">
                  {p.agreed_price !== null ? `฿${Number(p.agreed_price).toLocaleString()}` : '—'}
                </span>
                {p.completed_at && (
                  <span className="text-[9px] text-[#737373] bg-[#1C1C1C] border border-[#262626] px-1.5 py-0.5 rounded">
                    เสร็จเมื่อ {formatThaiDate(p.completed_at)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
