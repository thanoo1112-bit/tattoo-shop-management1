'use client'

import { useState } from 'react'
import {
  DollarSign, TrendingUp, Receipt, Users,
  Calendar, Search, ChevronDown, CheckCircle2,
  XCircle, AlertCircle, FileText, ArrowUpRight
} from 'lucide-react'
import { formatThaiDate, formatThaiTime } from '@/lib/dateUtils'
import { useSearchParams } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────

interface FlatPayment {
  id: string
  amount: number
  status: string
  payment_type: string
  paid_at: string | null
  created_at: string
  verified_at: string | null
  projectName: string
  customerName: string
  projectId: string
  agreedPrice: number | null
  artistId: string
  artistName: string
  phoneNormalized: string | null
  projectPaidTotal: number
  projectOutstanding: number
}

interface ProjectSummary {
  id: string
  name: string
  status: string
  agreedPrice: number | null
  artistId: string
  createdAt: string
  paidAmount: number
  outstanding: number
}

interface Props {
  flatPayments: FlatPayment[]
  projectsSummary: ProjectSummary[]
}

// ── Constants & Helpers ───────────────────────────────────────────────────

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

const monthsThai = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

function getBangkokYearMonth(isoStr: string): string {
  const d = new Date(isoStr)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit'
  }).format(d)
}

function formatMonthName(yrMo: string): string {
  const [yr, mo] = yrMo.split('-').map(Number)
  const thaiYear = yr + 543
  return `${monthsThai[mo - 1]} ${thaiYear}`
}

export function OwnerFinanceClient({ flatPayments, projectsSummary }: Props) {
  const searchParams = useSearchParams();
  const artistParam = searchParams?.get('artistId') || 'all';

  const [period, setPeriod] = useState<'all' | 'this_month' | 'prev_month' | string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterArtist, setFilterArtist] = useState<string>(artistParam)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null)

  // Bangkok today details
  const thisMonthStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date())

  const prevMonthStr = (() => {
    const now = new Date()
    const bkkParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }).formatToParts(now)
    
    const yearPart = bkkParts.find(p => p.type === 'year')?.value
    const monthPart = bkkParts.find(p => p.type === 'month')?.value
    
    if (yearPart && monthPart) {
      let y = parseInt(yearPart)
      let m = parseInt(monthPart) - 1
      if (m === 0) {
        m = 12
        y -= 1
      }
      return `${y}-${String(m).padStart(2, '0')}`
    }
    return ''
  })()

  // Generate dynamic months list from payments
  const monthsList = Array.from(
    new Set(flatPayments.filter(p => p.paid_at).map(p => getBangkokYearMonth(p.paid_at!)))
  ).sort((a, b) => b.localeCompare(a))

  // Extract unique active artists list
  const artistsList = Array.from(
    new Map(flatPayments.map(p => [p.artistId, p.artistName])).entries()
  ).map(([id, name]) => ({ id, name }))

  // ── Filters & Search ─────────────────────────────────────

  // Period filter function
  const matchPeriod = (dateIso: string | null) => {
    if (period === 'all') return true
    if (!dateIso) return false
    const pYrMo = getBangkokYearMonth(dateIso)
    if (period === 'this_month') return pYrMo === thisMonthStr
    if (period === 'prev_month') return pYrMo === prevMonthStr
    return pYrMo === period
  }

  // Filter payments for METRICS and BREAKDOWN (always paid payments only)
  const paidPaymentsInPeriod = flatPayments.filter(p => {
    return p.status === 'paid' && matchPeriod(p.paid_at)
  })

  // Filter payments for TRANSACTION HISTORY (based on period, status, type, artist, and search)
  const filteredTransactions = flatPayments.filter(p => {
    // 1. Period filter
    const refDate = p.paid_at || p.created_at
    if (!matchPeriod(refDate)) return false

    // 2. Status filter
    if (filterStatus !== 'all' && p.status !== filterStatus) return false

    // 3. Type filter
    if (filterType !== 'all') {
      if (filterType === 'deposit' && p.payment_type !== 'deposit') return false
      if (filterType === 'balance' && p.payment_type !== 'balance' && p.payment_type !== 'full_payment') return false
    }

    // 4. Artist filter
    if (filterArtist !== 'all' && p.artistId !== filterArtist) return false

    // 5. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const customerMatch = p.customerName.toLowerCase().includes(q)
      const phoneMatch = p.phoneNormalized && p.phoneNormalized.includes(q)
      const artistMatch = p.artistName.toLowerCase().includes(q)
      if (!customerMatch && !phoneMatch && !artistMatch) return false
    }

    return true
  })

  // Sort transaction history descending by paid_at / created_at fallback
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    const timeA = new Date(a.paid_at || a.created_at).getTime()
    const timeB = new Date(b.paid_at || b.created_at).getTime()
    return timeB - timeA
  })

  // ── Metrics Calculations ─────────────────────────────────

  const totalRevenue = paidPaymentsInPeriod.reduce((sum, p) => sum + p.amount, 0)
  const depositRevenue = paidPaymentsInPeriod.filter(p => p.payment_type === 'deposit').reduce((sum, p) => sum + p.amount, 0)
  const balanceRevenue = paidPaymentsInPeriod.filter(p => p.payment_type === 'balance' || p.payment_type === 'full_payment').reduce((sum, p) => sum + p.amount, 0)
  
  // Total transactions in period
  const totalPaidTransactionsCount = paidPaymentsInPeriod.length

  // Distinct projects count
  const distinctProjectsInPeriod = Array.from(new Set(paidPaymentsInPeriod.map(p => p.projectId)))
  const totalProjectsCount = distinctProjectsInPeriod.length
  
  // Average per project
  const averagePerProject = totalProjectsCount > 0 ? Math.round(totalRevenue / totalProjectsCount) : 0

  // Filter projectsSummary for outstanding balance based on selected artist filter only (period filter ignored)
  const filteredProjectsSummary = projectsSummary.filter(proj => {
    // 1. Artist filter
    if (filterArtist !== 'all' && proj.artistId !== filterArtist) return false

    return true
  })

  const totalOutstanding = filteredProjectsSummary.reduce((sum, proj) => sum + proj.outstanding, 0)

  // ── Artist Revenue Summary Calculations ─────────────────

  const artistSummaryData = artistsList.map(art => {
    const artPayments = paidPaymentsInPeriod.filter(p => p.artistId === art.id)
    const revenue = artPayments.reduce((sum, p) => sum + p.amount, 0)
    const deposit = artPayments.filter(p => p.payment_type === 'deposit').reduce((sum, p) => sum + p.amount, 0)
    const balance = artPayments.filter(p => p.payment_type === 'balance' || p.payment_type === 'full_payment').reduce((sum, p) => sum + p.amount, 0)
    const count = artPayments.length
    const projectsCount = Array.from(new Set(artPayments.map(p => p.projectId))).length

    return {
      name: art.name,
      revenue,
      deposit,
      balance,
      count,
      projectsCount
    }
  }).sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-8 w-full max-w-7xl mx-auto">
      {/* Date Period Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          {(['all', 'this_month', 'prev_month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors border rounded-lg ${
                period === p
                  ? 'bg-[#F5F5F5] text-black border-[#F5F5F5]'
                  : 'border-[#262626] text-[#737373] hover:text-[#A3A3A3] hover:bg-[#1F1F1F]'
              }`}
            >
              {p === 'all' && 'ทั้งหมด'}
              {p === 'this_month' && 'เดือนนี้'}
              {p === 'prev_month' && 'เดือนก่อนหน้า'}
            </button>
          ))}
        </div>

        {/* Dynamic Month Selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#737373]" />
          <select
            value={['all', 'this_month', 'prev_month'].includes(period) ? '' : period}
            onChange={e => {
              if (e.target.value) setPeriod(e.target.value)
            }}
            className="bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373]"
          >
            <option value="" disabled>เลือกเดือนอื่น...</option>
            {monthsList.map(m => (
              <option key={m} value={m}>{formatMonthName(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-1 sm:col-span-1 col-span-2">
          <p className="text-xs text-[#737373] font-medium uppercase">รายได้ทั้งหมด</p>
          <p className="text-2xl font-bold text-emerald-400">฿{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">ยอดค้างชำระ</p>
          <p className="text-2xl font-bold text-yellow-500">฿{totalOutstanding.toLocaleString()}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">เฉลี่ยต่อโปรเจกต์</p>
          <p className="text-2xl font-bold text-[#F5F5F5]">฿{averagePerProject.toLocaleString()}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">รายการรับเงิน</p>
          <p className="text-2xl font-bold text-[#F5F5F5]">{totalPaidTransactionsCount} ครั้ง</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-1">
          <p className="text-xs text-[#737373] font-medium uppercase">งานที่มีรายรับ</p>
          <p className="text-2xl font-bold text-[#F5F5F5]">{totalProjectsCount} งาน</p>
        </div>
      </div>

      {/* Breakdown and Artist Revenue Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Breakdown Card */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4 lg:col-span-1">
          <h3 className="text-sm font-semibold text-[#F5F5F5] border-b border-[#262626] pb-2">สัดส่วนรายได้</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-[#A3A3A3]">เงินมัดจำ</span>
              <span className="text-[#F5F5F5] font-semibold">฿{depositRevenue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#A3A3A3]">เงินยอดคงเหลือ / เต็มจำนวน</span>
              <span className="text-[#F5F5F5] font-semibold">฿{balanceRevenue.toLocaleString()}</span>
            </div>
            <div className="border-t border-[#262626] pt-3 flex justify-between items-center font-bold text-[#F5F5F5]">
              <span>รวมรายได้จริง</span>
              <span>฿{totalRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Artist Summary */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-[#F5F5F5] border-b border-[#262626] pb-2">รายได้แยกตามช่างสัก</h3>
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
            {artistSummaryData.length === 0 ? (
              <p className="text-xs text-[#737373] text-center py-6">ยังไม่มีข้อมูลรายได้ของช่างสัก</p>
            ) : artistSummaryData.map((art, idx) => (
              <div key={idx} className="bg-[#121212] border border-[#262626]/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-[#F5F5F5] text-sm">{art.name}</p>
                  <p className="text-[#737373] text-[10px]">
                    จำนวนชำระ {art.count} ครั้ง • ทำงานสัก {art.projectsCount} งาน
                  </p>
                </div>
                <div className="flex gap-x-6 gap-y-2 flex-wrap sm:text-right">
                  <div>
                    <span className="text-[#737373] block text-[9px] uppercase">มัดจำ</span>
                    <span className="text-[#A3A3A3]">฿{art.deposit.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[#737373] block text-[9px] uppercase">ยอดคงเหลือ</span>
                    <span className="text-[#A3A3A3]">฿{art.balance.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[#737373] block text-[9px] uppercase">รายได้รวม</span>
                    <span className="text-emerald-400 font-bold text-sm">฿{art.revenue.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transaction History Filter and List */}
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-6">
        <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-4 border-b border-[#262626] pb-4">
          <h3 className="text-sm font-semibold text-[#F5F5F5]">ประวัติการทำรายการ</h3>
          
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
              <input
                type="text"
                placeholder="ค้นหาชื่อลูกค้า, ช่าง..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#121212] border border-[#262626] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#F5F5F5] placeholder-[#525252] focus:outline-none focus:border-[#737373]"
              />
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-[#121212] border border-[#262626] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:outline-none"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="paid">ชำระแล้ว</option>
              <option value="pending">รอชำระ</option>
              <option value="verification_pending">รอตรวจสอบ</option>
              <option value="failed">ไม่สำเร็จ</option>
              <option value="cancelled">ยกเลิก</option>
            </select>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-[#121212] border border-[#262626] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:outline-none"
            >
              <option value="all">ทุกประเภท</option>
              <option value="deposit">มัดจำ</option>
              <option value="balance">ยอดคงเหลือ</option>
            </select>

            {/* Artist Filter */}
            <select
              value={filterArtist}
              onChange={e => setFilterArtist(e.target.value)}
              className="bg-[#121212] border border-[#262626] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:outline-none"
            >
              <option value="all">ช่างสักทั้งหมด</option>
              {artistsList.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {sortedTransactions.length === 0 ? (
          <p className="text-xs text-[#737373] text-center py-8">ไม่พบรายการชำระเงินตามเงื่อนไขที่เลือก</p>
        ) : (
          <div className="space-y-3">
            {sortedTransactions.map(p => {
              const isExpanded = expandedPaymentId === p.id
              const payStatus = PAYMENT_STATUS_MAP[p.status] ?? { label: p.status, colorClass: 'text-gray-400 border-gray-500/20' }

              return (
                <div
                  key={p.id}
                  className={`bg-[#121212] border border-[#262626]/60 rounded-xl p-4 transition-all duration-200 flex flex-col gap-3 hover:border-[#404040]/70 ${
                    isExpanded ? 'border-[#F5F5F5]/30' : ''
                  }`}
                >
                  <div
                    onClick={() => setExpandedPaymentId(prev => prev === p.id ? null : p.id)}
                    className="cursor-pointer flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#F5F5F5]">{p.customerName}</span>
                        <span className="text-[10px] text-[#737373]">•</span>
                        <span className="text-[#A3A3A3]">ช่าง: {p.artistName}</span>
                      </div>
                      <div className="text-[10px] text-[#737373] flex items-center gap-2">
                        <span>{formatThaiDate(p.paid_at || p.created_at)} • {formatThaiTime(p.paid_at || p.created_at)}</span>
                        <span>•</span>
                        <span>{PAYMENT_TYPE_MAP[p.payment_type] || p.payment_type}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div>
                        <p className={`font-bold text-sm ${p.status === 'paid' ? 'text-emerald-400' : 'text-[#F5F5F5]'}`}>
                          ฿{p.amount.toLocaleString()}
                        </p>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded border ${payStatus.colorClass}`}>
                          {payStatus.label}
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-[#737373] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>

                  {/* Inline Expanded Detail Area */}
                  <div
                    className={`grid transition-all duration-200 ease-in-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden flex flex-col gap-3 text-[11px] text-[#A3A3A3] pt-3 border-t border-[#262626]/40 mt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#171717] border border-[#262626] rounded-xl p-3.5">
                        <div className="space-y-1.5">
                          <p>รหัสการชำระเงิน: <span className="text-[#F5F5F5] font-mono">{p.id}</span></p>
                          <p>โปรเจกต์: <span className="text-[#F5F5F5]">{p.projectName}</span></p>
                          <p>ราคางานสักที่ตกลง: <span className="text-[#F5F5F5]">{p.agreedPrice !== null ? `฿${p.agreedPrice.toLocaleString()}` : '—'}</span></p>
                          <p>ยอดชำระสะสมของงาน: <span className="text-emerald-400">฿{p.projectPaidTotal.toLocaleString()}</span></p>
                          <p>ยอดค้างชำระของงาน: <span className="text-yellow-500 font-semibold">฿{p.projectOutstanding.toLocaleString()}</span></p>
                        </div>
                        <div className="space-y-1.5">
                          <p>สร้างเมื่อ: <span className="text-[#F5F5F5]">{formatThaiDate(p.created_at)} {formatThaiTime(p.created_at)}</span></p>
                          {p.paid_at && <p>ชำระสำเร็จเมื่อ: <span className="text-[#F5F5F5]">{formatThaiDate(p.paid_at)} {formatThaiTime(p.paid_at)}</span></p>}
                          {p.verified_at && <p>ตรวจสอบหลักฐานเมื่อ: <span className="text-[#F5F5F5]">{formatThaiDate(p.verified_at)} {formatThaiTime(p.verified_at)}</span></p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
