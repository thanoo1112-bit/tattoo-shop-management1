'use client'

import { useState, useEffect } from 'react'
import {
  Calendar, Clock, User, Users, Search, ChevronDown,
  CheckCircle2, XCircle, AlertCircle, Play, CalendarDays, ExternalLink
} from 'lucide-react'
import { formatThaiDate, formatThaiTime, formatThaiDateTimeDot } from '@/lib/dateUtils'

// ── Types ──────────────────────────────────────────────────────────────────

interface Payment {
  id: string
  amount: string
  status: string
  payment_type: string
}

interface BookingRequest {
  id: string
  payments: Payment[]
}

interface TattooProject {
  id: string
  name: string
  status: string
  agreed_price: string | null
  tattoo_style: string | null
  payments: Payment[]
  booking_requests: BookingRequest[]
}

interface Customer {
  id: string
  full_name: string
  phone_normalized: string | null
}

interface Artist {
  id: string
  full_name: string | null
  email: string | null
}

interface AppointmentRow {
  id: string
  session_number: number
  status: string
  start_at: string
  end_at: string
  notes: string | null
  actual_started_at: string | null
  actual_ended_at: string | null
  created_at: string
  artist_id: string
  artist: Artist | null
  customer: Customer | null
  project: TattooProject | null
}

interface Props {
  appointments: AppointmentRow[]
}

// ── Constants & Helpers ───────────────────────────────────────────────────

const APPT_STATUS_MAP: Record<string, { label: string; colorClass: string }> = {
  scheduled:   { label: 'นัดหมาย',      colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  in_progress: { label: 'กำลังทำ',      colorClass: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  completed:   { label: 'เสร็จสิ้น',    colorClass: 'text-green-500 bg-green-500/10 border-green-500/20' },
  cancelled:   { label: 'ยกเลิก',      colorClass: 'text-red-500 bg-red-500/10 border-red-500/20' },
  no_show:     { label: 'ไม่มาตามนัด',   colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
}

const PROJECT_STATUS_MAP: Record<string, string> = {
  proposed: 'รอดำเนินการ',
  active: 'กำลังดำเนินการ',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก'
}

function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${fmt(startIso)} – ${fmt(endIso)}`
}

function isTodayBkk(dateIso: string): boolean {
  const d = new Date(dateIso)
  const bkkMs = d.getTime() + 7 * 60 * 60 * 1000
  const bkkDate = new Date(bkkMs)

  const now = new Date()
  const bkkNowMs = now.getTime() + 7 * 60 * 60 * 1000
  const bkkNow = new Date(bkkNowMs)

  return bkkDate.getUTCFullYear() === bkkNow.getUTCFullYear() &&
         bkkDate.getUTCMonth() === bkkNow.getUTCMonth() &&
         bkkDate.getUTCDate() === bkkNow.getUTCDate()
}

export function OwnerAppointmentsClient({ appointments }: Props) {
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterArtist, setFilterArtist] = useState<string>('all')
  const [filterDate, setFilterDate] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedApptId, setExpandedApptId] = useState<string | null>(null)

  // Extract unique active artists from appointments
  const artistsList = Array.from(
    new Map(
      appointments
        .filter(a => a.artist)
        .map(a => [a.artist!.id, a.artist!.full_name || a.artist!.email || 'ช่างสัก'])
    ).entries()
  ).map(([id, name]) => ({ id, name }))

  // ── Filters & Search ─────────────────────────────────────

  const filteredAppointments = appointments.filter(a => {
    // 1. Status Filter
    if (filterStatus !== 'all' && a.status !== filterStatus) return false

    // 2. Artist Filter
    if (filterArtist !== 'all' && a.artist_id !== filterArtist) return false

    // 3. Date Filter
    if (filterDate === 'today' && !isTodayBkk(a.start_at)) return false
    if (filterDate === 'upcoming') {
      const isPast = new Date(a.start_at).getTime() < new Date().getTime()
      if (isPast) return false
    }
    if (filterDate === 'past') {
      const isFuture = new Date(a.start_at).getTime() >= new Date().getTime()
      if (isFuture) return false
    }

    // 4. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const customerMatch = a.customer?.full_name.toLowerCase().includes(q) || false
      const phoneMatch = a.customer?.phone_normalized?.includes(q) || false
      const artistMatch = a.artist?.full_name?.toLowerCase().includes(q) || a.artist?.email?.toLowerCase().includes(q) || false
      if (!customerMatch && !phoneMatch && !artistMatch) return false
    }

    return true
  })

  // Collapse if filtered out
  useEffect(() => {
    if (expandedApptId && !filteredAppointments.some(a => a.id === expandedApptId)) {
      setExpandedApptId(null)
    }
  }, [filteredAppointments, expandedApptId])

  // ── Summary Cards Calculations ───────────────────────────

  const todayCount = appointments.filter(a => isTodayBkk(a.start_at) && a.status !== 'cancelled' && a.status !== 'no_show').length
  const inProgressCount = appointments.filter(a => a.status === 'in_progress').length
  const upcomingCount = appointments.filter(a => {
    const isFuture = new Date(a.start_at).getTime() >= new Date().getTime()
    return isFuture && a.status === 'scheduled'
  }).length
  const completedCount = appointments.filter(a => a.status === 'completed').length

  return (
    <div className="space-y-8 w-full max-w-7xl mx-auto">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">คิววันนี้</p>
          <p className="text-2xl font-bold text-[#F5F5F5]">{todayCount}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">กำลังทำ</p>
          <p className="text-2xl font-bold text-yellow-500">{inProgressCount}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">นัดหมายถัดไป</p>
          <p className="text-2xl font-bold text-blue-400">{upcomingCount}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">เสร็จสิ้นแล้ว</p>
          <p className="text-2xl font-bold text-green-500">{completedCount}</p>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
            <input
              type="text"
              placeholder="ค้นหาชื่อลูกค้า, ช่าง, หรือเบอร์โทร..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#171717] border border-[#262626] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#F5F5F5] placeholder-[#525252] focus:outline-none focus:border-[#737373]"
            />
          </div>

          {/* Artist Filter */}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#737373]" />
            <select
              value={filterArtist}
              onChange={e => setFilterArtist(e.target.value)}
              className="bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373]"
            >
              <option value="all">ช่างสักทั้งหมด</option>
              {artistsList.map(art => (
                <option key={art.id} value={art.id}>{art.name}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#737373]" />
            <select
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373]"
            >
              <option value="all">ทุกช่วงเวลา</option>
              <option value="today">วันนี้</option>
              <option value="upcoming">นัดหมายถัดไป</option>
              <option value="past">ที่ผ่านมา</option>
            </select>
          </div>
        </div>

        {/* Status Dropdown */}
        <div className="flex items-center gap-2">
          <FilterIcon className="w-4 h-4 text-[#737373]" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373]"
          >
            <option value="all">สถานะทั้งหมด</option>
            <option value="scheduled">นัดหมาย</option>
            <option value="in_progress">กำลังทำ</option>
            <option value="completed">เสร็จสิ้น</option>
            <option value="cancelled">ยกเลิก</option>
            <option value="no_show">ไม่มาตามนัด</option>
          </select>
        </div>
      </div>

      {/* Queue List Cards */}
      {filteredAppointments.length === 0 ? (
        <div className="border border-[#262626] rounded-xl bg-[#171717] p-12 text-center text-[#737373]">
          <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">ยังไม่มีคิวงาน</p>
          <p className="text-xs mt-1 text-[#525252]">เมื่อมีการนัดหมาย คิวงานจะปรากฏที่นี่</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAppointments.map(appt => {
            const isExpanded = expandedApptId === appt.id
            const statusInfo = APPT_STATUS_MAP[appt.status] ?? { label: appt.status, colorClass: 'text-gray-400 bg-gray-500/10' }
            const project = appt.project

            // Project financial calculations
            let financialSummary = null
            if (project) {
              const payments = project.payments || []
              const brPayments = project.booking_requests?.flatMap(br => br.payments || []) || []
              const allPayments = [...payments, ...brPayments]
              const totalPaid = allPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0)
              const agreedPrice = project.agreed_price !== null ? Number(project.agreed_price) : null
              const remaining = agreedPrice !== null ? Math.max(0, agreedPrice - totalPaid) : null
              financialSummary = { agreedPrice, totalPaid, remaining }
            }

            return (
              <div
                key={appt.id}
                className={`bg-[#121212] border border-[#262626] hover:border-[#404040] rounded-xl transition-all duration-200 flex flex-col p-5 gap-4 ${
                  isExpanded ? 'border-[#F5F5F5]/30' : ''
                }`}
              >
                {/* Header click triggers expand/collapse */}
                <div
                  onClick={() => setExpandedApptId(prev => prev === appt.id ? null : appt.id)}
                  className="cursor-pointer space-y-3 w-full"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#F5F5F5]">
                          {appt.customer?.full_name || 'ไม่ระบุชื่อลูกค้า'}
                        </span>
                        <span className="text-[10px] text-[#737373]">•</span>
                        <span className="text-xs text-[#A3A3A3]">
                          ช่าง: {appt.artist?.full_name || appt.artist?.email || 'ไม่ระบุ'}
                        </span>
                      </div>
                      <p className="text-xs text-[#737373] font-medium">
                        {formatThaiDate(appt.start_at)} ({formatTimeRange(appt.start_at, appt.end_at)} น.)
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${statusInfo.colorClass}`}>
                        {statusInfo.label}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-[#737373] transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>

                  <div className="border-t border-[#262626]/60 pt-3 flex items-center justify-between text-xs text-[#737373]">
                    <div>
                      {project ? `${project.name || 'งานสัก'} • ${project.tattoo_style || 'ไม่ระบุสไตล์'}` : 'ไม่ระบุรายละเอียดโปรเจกต์'}
                    </div>
                    <div>
                      Session {appt.session_number}
                    </div>
                  </div>
                </div>

                {/* Inline Expansion Area */}
                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden flex flex-col gap-4">
                    <div className="border-t border-[#262626]/60 pt-4 mt-1 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* Left: Contact Info */}
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-semibold text-[#737373] tracking-wider">ข้อมูลนัดหมาย</p>
                        <div className="space-y-1 bg-[#171717] border border-[#262626] rounded-xl p-3.5 space-y-2 text-[#A3A3A3]">
                          <p>ลูกค้า: <span className="text-[#F5F5F5] font-medium">{appt.customer?.full_name}</span></p>
                          {appt.customer?.phone_normalized && <p>เบอร์ติดต่อ: <span className="text-[#F5F5F5] font-medium">{appt.customer.phone_normalized}</span></p>}
                          <p>โปรเจกต์: <span className="text-[#F5F5F5] font-medium">{project?.name || '—'}</span></p>
                          <p>สถานะโปรเจกต์: <span className="text-[#F5F5F5] font-medium">{project ? PROJECT_STATUS_MAP[project.status] : '—'}</span></p>
                          {appt.notes && <p>โน้ตนัดหมาย: <span className="text-[#F5F5F5]">{appt.notes}</span></p>}
                        </div>
                      </div>

                      {/* Right: Actual Times / Schedule details */}
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-semibold text-[#737373] tracking-wider">บันทึกเวลาจริง</p>
                        <div className="space-y-1 bg-[#171717] border border-[#262626] rounded-xl p-3.5 space-y-2 text-[#A3A3A3]">
                          <p>เวลาเริ่มจริง: <span className="text-[#F5F5F5] font-medium">{appt.actual_started_at ? formatThaiDateTimeDot(appt.actual_started_at) : '—'}</span></p>
                          <p>เวลาจบจริง: <span className="text-[#F5F5F5] font-medium">{appt.actual_ended_at ? formatThaiDateTimeDot(appt.actual_ended_at) : '—'}</span></p>
                        </div>
                      </div>
                    </div>

                    {/* Financial details panel */}
                    {financialSummary && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-semibold text-[#737373] tracking-wider">การชำระเงินโปรเจกต์</p>
                        <div className="border border-[#262626] rounded-lg p-3.5 bg-[#171717]/30 space-y-1.5 text-xs">
                          <div className="flex justify-between items-center text-[#737373]">
                            <span>ราคางานสัก</span>
                            <span className="text-[#F5F5F5] font-medium">
                              {financialSummary.agreedPrice !== null ? `฿${financialSummary.agreedPrice.toLocaleString()}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[#737373]">
                            <span>ชำระแล้ว</span>
                            <span className="text-emerald-400 font-medium">฿{financialSummary.totalPaid.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-[#262626]/60 pt-1.5">
                            <span className="text-[#A3A3A3]">ยอดคงเหลือ</span>
                            <span className={`font-semibold ${(financialSummary.remaining ?? 0) > 0 ? 'text-yellow-500' : 'text-[#F5F5F5]'}`}>
                              {financialSummary.remaining !== null ? `฿${financialSummary.remaining.toLocaleString()}` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quick navigation link to owner calendar */}
                    <div className="flex justify-end pt-1">
                      <a
                        href="/owner/calendar"
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        ดูคิวนี้บนปฏิทินร้าน
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}
