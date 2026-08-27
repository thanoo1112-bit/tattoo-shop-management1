'use client'

import { useState, useEffect } from 'react'
import {
  User, Phone, Calendar, Search, Clock,
  CheckCircle2, XCircle, AlertCircle, ChevronDown, ExternalLink,
  Users
} from 'lucide-react'
import { formatThaiDate, formatThaiTime, formatThaiDateTimeDot } from '@/lib/dateUtils'

// ── Types ──────────────────────────────────────────────────────────────────

interface Appointment {
  id: string
  session_number: number
  status: string
  start_at: string
  end_at: string
  notes: string | null
  actual_started_at: string | null
  actual_ended_at: string | null
}

interface Payment {
  id: string
  amount: string
  status: string
  payment_type: string
}

interface Artist {
  id: string
  full_name: string | null
  email: string | null
}

interface FlashDesign {
  id: string
  flash_code: string
}

interface TattooProject {
  id: string
  name: string
  status: string
  agreed_price: string | null
  tattoo_style: string | null
  work_type: string | null
  color_mode: string | null
  width_cm: number | null
  height_cm: number | null
  body_placement: string | null
  completed_at: string | null
  created_at: string
  artist_id: string
  flash_design_id: string | null
  flash_designs: FlashDesign | null
  artist: Artist | null
  appointments: Appointment[]
  payments: Payment[]
}

interface BookingRequest {
  id: string
  created_at: string
  status: string
  rejection_reason: string | null
  requested_start_at: string
  flash_design_id: string | null
  flash_designs: FlashDesign | null
  artist: Artist | null
}

interface Customer {
  id: string
  full_name: string
  phone_normalized: string | null
  email: string | null
  created_at: string
  booking_requests?: BookingRequest[]
  tattoo_projects: TattooProject[]
}

interface Props {
  customers: Customer[]
}

// ── Constants & Helpers ───────────────────────────────────────────────────

const PROJECT_STATUS_MAP: Record<string, { label: string; colorClass: string }> = {
  proposed:  { label: 'รอดำเนินการ',    colorClass: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  active:    { label: 'กำลังดำเนินการ', colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  completed: { label: 'เสร็จสิ้น',      colorClass: 'text-green-500 bg-green-500/10 border-green-500/20' },
  cancelled: { label: 'ยกเลิก',        colorClass: 'text-red-500 bg-red-500/10 border-red-500/20' },
}

const APPT_STATUS_MAP: Record<string, { label: string; colorClass: string }> = {
  scheduled:   { label: 'นัดหมาย',      colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  in_progress: { label: 'กำลังทำ',      colorClass: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  completed:   { label: 'เสร็จสิ้น',    colorClass: 'text-green-500 bg-green-500/10 border-green-500/20' },
  cancelled:   { label: 'ยกเลิก',      colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
  no_show:     { label: 'ไม่มาตามนัด',   colorClass: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

const PAYMENT_TYPE_MAP: Record<string, string> = {
  deposit: 'มัดจำ',
  balance: 'ยอดคงเหลือ',
  full_payment: 'ชำระเต็มจำนวน'
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; colorClass: string }> = {
  pending:              { label: 'รอชำระ',     colorClass: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  verification_pending: { label: 'รอตรวจสอบ',   colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  paid:                 { label: 'ชำระแล้ว',    colorClass: 'text-green-500 bg-green-500/10 border-green-500/20' },
  failed:               { label: 'ล้มเหลว',    colorClass: 'text-red-500 bg-red-500/10 border-red-500/20' },
  refund_pending:       { label: 'รอคืนเงิน',   colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  refunded:             { label: 'คืนเงินแล้ว',  colorClass: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
  cancelled:            { label: 'ยกเลิก',      colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
}

function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${fmt(startIso)} – ${fmt(endIso)}`
}

function getNextAppointment(customer: Customer) {
  let nextAppt: Appointment | null = null
  const now = new Date()
  for (const proj of customer.tattoo_projects) {
    for (const appt of proj.appointments) {
      if (appt.status === 'scheduled' && new Date(appt.start_at) >= now) {
        if (!nextAppt || new Date(appt.start_at) < new Date(nextAppt.start_at)) {
          nextAppt = appt
        }
      }
    }
  }
  return nextAppt
}

export function OwnerCustomersClient({ customers }: Props) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedArtistId, setSelectedArtistId] = useState<string>('all')
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null)

  const renderProjectCard = (proj: TattooProject) => {
    const statusInfo = PROJECT_STATUS_MAP[proj.status] ?? {
      label: proj.status,
      colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20'
    }
    
    // Calculate project financials
    const projPayments = proj.payments ?? []
    const totalPaid = projPayments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount), 0)
    const agreedPrice = proj.agreed_price !== null ? Number(proj.agreed_price) : null
    const remaining = agreedPrice !== null ? Math.max(0, agreedPrice - totalPaid) : null
    const isFlash = !!proj.flash_design_id
    const flashCode = proj.flash_designs?.flash_code || ''

    return (
      <div key={proj.id} className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4">
        {/* Project Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[#F5F5F5]">{proj.name || 'งานสักไม่มีชื่อ'}</p>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                isFlash 
                  ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' 
                  : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
              }`}>
                {isFlash ? `FLASH (${flashCode})` : 'CUSTOM'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-[#A3A3A3]">
              {proj.tattoo_style && <span>สไตล์: {proj.tattoo_style}</span>}
              {proj.body_placement && <span>ตำแหน่ง: {proj.body_placement}</span>}
              {(proj.width_cm || proj.height_cm) && (
                <span>ขนาด: {proj.width_cm ?? '—'} × {proj.height_cm ?? '—'} ซม.</span>
              )}
              <span>ช่างสัก: <span className="text-[#F5F5F5] font-medium">{proj.artist?.full_name || proj.artist?.email || 'ไม่ระบุ'}</span></span>
            </div>
          </div>
          <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${statusInfo.colorClass}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* Project Meta Dates */}
        <div className="text-[10px] text-[#737373] flex flex-wrap gap-x-4 gap-y-1">
          <span>สร้างเมื่อ: {formatThaiDate(proj.created_at)}</span>
          {proj.status === 'completed' && proj.completed_at && (
            <span className="text-green-400">เสร็จสิ้นเมื่อ: {formatThaiDate(proj.completed_at)}</span>
          )}
        </div>

        {/* Financial breakdown */}
        <div className="border border-[#262626] rounded-lg p-3 bg-[#121212] space-y-1.5 text-xs">
          <div className="flex justify-between items-center text-[#737373]">
            <span>ราคางานสัก</span>
            <span className="text-[#F5F5F5] font-medium">
              {agreedPrice !== null ? `฿${agreedPrice.toLocaleString()}` : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center text-[#737373]">
            <span>ชำระแล้ว</span>
            <span className="text-emerald-400 font-medium">฿{totalPaid.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center border-t border-[#262626]/60 pt-1.5">
            <span className="text-[#A3A3A3]">ยอดคงเหลือ</span>
            <span className={`font-semibold ${remaining !== null && remaining > 0 ? 'text-yellow-500' : 'text-[#F5F5F5]'}`}>
              {remaining !== null ? `฿${remaining.toLocaleString()}` : '—'}
            </span>
          </div>
          {agreedPrice !== null && totalPaid >= agreedPrice && (
            <div className="text-emerald-400 font-semibold text-[10px] mt-1 text-right">
              ✓ ชำระครบแล้ว
            </div>
          )}
        </div>

        {/* Payments transactions */}
        {projPayments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-[#A3A3A3]">ประวัติการชำระเงิน</p>
            <div className="divide-y divide-[#262626]/40">
              {projPayments.map(pay => {
                const payStatus = PAYMENT_STATUS_MAP[pay.status] ?? { label: pay.status, colorClass: 'text-gray-400' }
                return (
                  <div key={pay.id} className="py-1.5 flex items-center justify-between text-xs">
                    <span className="text-[#A3A3A3]">{PAYMENT_TYPE_MAP[pay.payment_type] || pay.payment_type}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[#F5F5F5]">฿{Number(pay.amount).toLocaleString()}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded border ${payStatus.colorClass}`}>
                        {payStatus.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Session list */}
        {proj.appointments && proj.appointments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-[#A3A3A3]">ประวัติ Session ({proj.appointments.length})</p>
            <div className="space-y-2">
              {proj.appointments.map(appt => {
                const apptStatus = APPT_STATUS_MAP[appt.status] ?? { label: appt.status, colorClass: 'text-gray-400' }
                return (
                  <div key={appt.id} className="bg-[#121212] border border-[#262626]/60 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#F5F5F5]">Session {appt.session_number}</span>
                      <span className={`text-[10px] px-2 py-0.2 rounded-full border ${apptStatus.colorClass}`}>
                        {apptStatus.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#737373]">
                      <div>นัดหมาย: {formatThaiDate(appt.start_at)}</div>
                      <div>เวลานัด: {formatTimeRange(appt.start_at, appt.end_at)} น.</div>
                      {appt.actual_started_at && (
                        <div className="col-span-2 text-yellow-500/90">
                          เริ่มจริง: {formatThaiDate(appt.actual_started_at)} • {formatThaiTime(appt.actual_started_at)}
                        </div>
                      )}
                      {appt.actual_ended_at && (
                        <div className="col-span-2 text-green-400">
                          จบจริง: {formatThaiDate(appt.actual_ended_at)} • {formatThaiTime(appt.actual_ended_at)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Generate dynamic unique artists list from all projects
  const artistsList = Array.from(
    new Map(
      customers
        .flatMap(c => c.tattoo_projects)
        .filter(p => p.artist)
        .map(p => [p.artist!.id, p.artist!.full_name || p.artist!.email || 'ช่างสัก'])
    ).entries()
  ).map(([id, name]) => ({ id, name }))

  // ── Filters & Search ─────────────────────────────────────

  const isCustomerActive = (c: Customer) => {
    return c.tattoo_projects.some(p => p.status === 'active')
  }

  const isCustomerCompleted = (c: Customer) => {
    const hasCompleted = c.tattoo_projects.some(p => p.status === 'completed')
    const hasActive = c.tattoo_projects.some(p => p.status === 'active')
    return hasCompleted && !hasActive
  }

  const filteredCustomers = customers.filter(c => {
    // 1. Tab filter
    if (filter === 'active' && !isCustomerActive(c)) return false
    if (filter === 'completed' && !isCustomerCompleted(c)) return false

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const nameMatch = c.full_name.toLowerCase().includes(q)
      const phoneMatch = c.phone_normalized && c.phone_normalized.includes(q)
      if (!nameMatch && !phoneMatch) return false
    }

    // 3. Artist filter
    if (selectedArtistId !== 'all') {
      const hasProjectWithArtist = c.tattoo_projects.some(p => p.artist_id === selectedArtistId)
      if (!hasProjectWithArtist) return false
    }

    return true
  })

  // Collapse customer if it gets filtered out
  useEffect(() => {
    if (expandedCustomerId && !filteredCustomers.some(c => c.id === expandedCustomerId)) {
      setExpandedCustomerId(null)
    }
  }, [filteredCustomers, expandedCustomerId])

  const toggleCustomer = (id: string) => {
    setExpandedCustomerId(prev => (prev === id ? null : id))
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Search and Filters row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
            <input
              type="text"
              placeholder="ค้นหาชื่อลูกค้า หรือเบอร์โทร..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#171717] border border-[#262626] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#F5F5F5] placeholder-[#525252] focus:outline-none focus:border-[#737373] transition-colors"
            />
          </div>

          {/* Artist Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#737373] shrink-0" />
            <select
              value={selectedArtistId}
              onChange={e => setSelectedArtistId(e.target.value)}
              className="bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373]"
            >
              <option value="all">ช่างสักทั้งหมด</option>
              {artistsList.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-[#262626] lg:border-none gap-4">
          {(['all', 'active', 'completed'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px] lg:mb-0 lg:rounded-lg lg:border ${
                filter === t
                  ? 'border-[#F5F5F5] text-[#F5F5F5] lg:bg-[#F5F5F5] lg:text-black lg:border-[#F5F5F5]'
                  : 'border-transparent text-[#737373] hover:text-[#A3A3A3] lg:border-[#262626] lg:hover:bg-[#1F1F1F]'
              }`}
            >
              {t === 'all' && 'ทั้งหมด'}
              {t === 'active' && 'กำลังมีงาน'}
              {t === 'completed' && 'งานเสร็จแล้ว'}
            </button>
          ))}
        </div>
      </div>

      {/* Customer list rendering */}
      {filteredCustomers.length === 0 ? (
        <div className="border border-[#262626] rounded-xl bg-[#171717] p-12 text-center text-[#737373]">
          <User className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">ไม่พบรายชื่อลูกค้า</p>
          <p className="text-xs mt-1 text-[#525252]">ลูกค้าจะปรากฏที่นี่เมื่อมีงานสักในร้าน</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCustomers.map(c => {
            const isExpanded = expandedCustomerId === c.id
            const totalProj = c.tattoo_projects.length
            const activeProj = c.tattoo_projects.filter(p => p.status === 'active').length
            const completedProj = c.tattoo_projects.filter(p => p.status === 'completed').length
            const nextAppt = getNextAppointment(c)

            return (
              <div
                key={c.id}
                className={`bg-[#121212] border border-[#262626] hover:border-[#404040] rounded-xl transition-all duration-200 flex flex-col p-5 gap-4 ${
                  isExpanded ? 'border-[#F5F5F5]/30' : ''
                }`}
              >
                {/* Header Summary (Click to Toggle) */}
                <div
                  onClick={() => toggleCustomer(c.id)}
                  className="cursor-pointer space-y-3 w-full"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-[#F5F5F5] tracking-wide">
                        {c.full_name}
                      </h3>
                      {c.phone_normalized && (
                        <p className="text-xs text-[#A3A3A3] flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[#737373]" />
                          {c.phone_normalized}
                        </p>
                      )}
                    </div>
                    {/* Chevron Indicator */}
                    <ChevronDown
                      className={`h-5 w-5 text-[#737373] transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  <div className="border-t border-[#262626]/60 pt-3 flex items-center justify-between text-xs text-[#737373]">
                    <div>
                      <span className="font-semibold text-[#A3A3A3]">{totalProj}</span> งานสัก
                    </div>
                    <div className="flex items-center gap-3">
                      <span>กำลังทำ <span className="font-semibold text-blue-400">{activeProj}</span></span>
                      <span>เสร็จแล้ว <span className="font-semibold text-green-400">{completedProj}</span></span>
                    </div>
                  </div>

                  {nextAppt && !isExpanded && (
                    <div className="bg-[#1C1C1C] rounded-lg p-2.5 flex items-start gap-2 text-[11px] text-[#A3A3A3]">
                      <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-[#F5F5F5]">นัดถัดไป</p>
                        <p className="mt-0.5">{formatThaiDateTimeDot(nextAppt.start_at)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Smooth Expandable Content */}
                <div
                  className={`grid transition-all duration-200 ease-in-out ${
                    isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden flex flex-col gap-5">
                    {/* ข้อมูลลูกค้า + Quick Actions */}
                    <div className="border-t border-[#262626]/60 pt-4 mt-1 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#171717] border border-[#262626] rounded-xl p-4">
                        <div className="space-y-1.5">
                          <p className="text-[#737373] text-[10px] uppercase font-semibold tracking-wider">ข้อมูลการติดต่อ</p>
                          <p className="text-sm font-semibold text-[#F5F5F5]">{c.full_name}</p>
                          {c.phone_normalized && (
                            <p className="text-xs text-[#A3A3A3]">เบอร์ติดต่อ: {c.phone_normalized}</p>
                          )}
                          {c.email && (
                            <p className="text-xs text-[#A3A3A3]">อีเมล: {c.email}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2.5">
                          {c.phone_normalized && (
                            <a
                              href={`tel:${c.phone_normalized}`}
                              className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors min-w-[100px] cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              โทร
                            </a>
                          )}
                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              className="inline-flex items-center justify-center gap-1.5 px-4 h-11 bg-[#262626] hover:bg-[#333333] border border-[#404040] text-[#F3F3F3] rounded-lg text-xs font-semibold transition-colors min-w-[100px] cursor-pointer"
                            >
                              ส่งอีเมล
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Customer Summary */}
                    {(() => {
                      const totalProjVal = c.tattoo_projects.length
                      const activeProjVal = c.tattoo_projects.filter(p => p.status === 'active').length
                      const completedProjVal = c.tattoo_projects.filter(p => p.status === 'completed').length

                      // Settle/Lifetime Paid logic (finance dedup)
                      const uniquePaymentsMap = new Map<string, Payment>()
                      c.tattoo_projects.forEach(proj => {
                        (proj.payments || []).forEach(p => {
                          if (p.status === 'paid') {
                            uniquePaymentsMap.set(p.id, p)
                          }
                        })
                      })
                      const lifetimePaid = Array.from(uniquePaymentsMap.values()).reduce((sum, p) => sum + Number(p.amount), 0)

                      // Last Service Date logic
                      const attendedAppts = c.tattoo_projects.flatMap(p => p.appointments || []).filter(a => {
                        // Either we have an actual start time, OR the status is completed
                        return a.actual_started_at || a.status === 'completed'
                      })
                      const lastServiceStr = (() => {
                        if (attendedAppts.length === 0) return 'ยังไม่มีประวัติการใช้บริการ'
                        const times = attendedAppts.map(a => {
                          const dateStr = a.actual_started_at || a.start_at
                          return new Date(dateStr).getTime()
                        })
                        const latestTime = Math.max(...times)
                        return formatThaiDate(new Date(latestTime))
                      })()

                      return (
                        <div className="space-y-2">
                          <h4 className="text-[#737373] text-[10px] uppercase font-semibold tracking-wider">ข้อมูลสรุป</h4>
                          <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                            <div>
                              <p className="text-[#737373] mb-0.5">งานทั้งหมด</p>
                              <p className="text-base font-bold text-[#F5F5F5]">{totalProjVal} งาน</p>
                            </div>
                            <div>
                              <p className="text-[#737373] mb-0.5">กำลังมีงาน</p>
                              <p className="text-base font-bold text-blue-400">{activeProjVal} งาน</p>
                            </div>
                            <div>
                              <p className="text-[#737373] mb-0.5">งานเสร็จแล้ว</p>
                              <p className="text-base font-bold text-green-400">{completedProjVal} งาน</p>
                            </div>
                            <div>
                              <p className="text-[#737373] mb-0.5">ยอดชำระสะสม</p>
                              <p className="text-base font-bold text-emerald-400">฿{lifetimePaid.toLocaleString()}</p>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                              <p className="text-[#737373] mb-0.5">ใช้บริการล่าสุด</p>
                              <p className="text-xs font-semibold text-[#F5F5F5]">{lastServiceStr}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* งานที่กำลังดำเนินการ */}
                    {(() => {
                      const activeProjects = c.tattoo_projects.filter(p => p.status === 'active')
                      if (activeProjects.length === 0) return null
                      return (
                        <div className="space-y-3">
                          <h4 className="text-xs uppercase tracking-wider font-semibold text-blue-400 border-b border-[#262626] pb-2">
                            งานที่กำลังดำเนินการ ({activeProjects.length})
                          </h4>
                          <div className="space-y-4">
                            {activeProjects.map(proj => renderProjectCard(proj))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* ประวัติงานสัก */}
                    {(() => {
                      const historyProjects = c.tattoo_projects.filter(p => p.status === 'completed' || p.status === 'cancelled')
                      if (historyProjects.length === 0) return null
                      return (
                        <div className="space-y-3">
                          <h4 className="text-xs uppercase tracking-wider font-semibold text-[#737373] border-b border-[#262626] pb-2">
                            ประวัติงานสัก ({historyProjects.length})
                          </h4>
                          <div className="space-y-4">
                            {historyProjects.map(proj => renderProjectCard(proj))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* คำขอจองที่ผ่านมา */}
                    {(() => {
                      const historicalBookings = (c.booking_requests || []).filter(br => 
                        br.status === 'rejected' || br.status === 'expired' || br.status === 'cancelled'
                      )
                      if (historicalBookings.length === 0) return null
                      return (
                        <div className="space-y-3">
                          <h4 className="text-xs uppercase tracking-wider font-semibold text-[#737373] border-b border-[#262626] pb-2">
                            คำขอจองที่ผ่านมา ({historicalBookings.length})
                          </h4>
                          <div className="space-y-3">
                            {historicalBookings.map(br => {
                              const isFlashBR = !!br.flash_design_id
                              const flashCodeBR = br.flash_designs?.flash_code || ''
                              const bookingStatusLabel = br.status === 'rejected' ? 'ปฏิเสธแล้ว' : br.status === 'expired' ? 'หมดอายุ' : 'ยกเลิกแล้ว'
                              const statusColor = br.status === 'rejected' ? 'text-red-400 border-red-500/20 bg-red-500/10' : 'text-gray-400 border-gray-500/20 bg-gray-500/10'

                              return (
                                <div key={br.id} className="bg-[#171717] border border-[#262626] rounded-xl p-4 space-y-2">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                                          isFlashBR 
                                            ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' 
                                            : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
                                        }`}>
                                          {isFlashBR ? `FLASH (${flashCodeBR})` : 'CUSTOM'}
                                        </span>
                                        <span className="text-[10px] text-[#737373]">•</span>
                                        <span className="text-xs text-[#F5F5F5]">วันที่ส่ง: {formatThaiDate(br.created_at)}</span>
                                      </div>
                                      <p className="text-[11px] text-[#A3A3A3]">
                                        ช่างสัก: <span className="text-[#F5F5F5]">{br.artist?.full_name || br.artist?.email || 'ไม่ระบุ'}</span>
                                      </p>
                                      {br.requested_start_at && (
                                        <p className="text-[11px] text-[#737373]">เวลานัดที่ขอ: {formatThaiDate(br.requested_start_at)}</p>
                                      )}
                                    </div>
                                    <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-medium border ${statusColor}`}>
                                      {bookingStatusLabel}
                                    </span>
                                  </div>
                                  {br.status === 'rejected' && br.rejection_reason && (
                                    <div className="bg-[#1C1C1C] border border-[#262626] rounded p-2.5 text-[11px] text-red-400">
                                      <span className="font-semibold">เหตุผลที่ปฏิเสธ:</span> {br.rejection_reason}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
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
