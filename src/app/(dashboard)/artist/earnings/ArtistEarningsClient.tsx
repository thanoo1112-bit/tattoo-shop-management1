'use client'

import { useState } from 'react'
import {
  DollarSign, TrendingUp, Receipt, CheckSquare,
  Calendar, Search, Filter, ArrowUpRight
} from 'lucide-react'
import { formatThaiDate, formatThaiTime } from '@/lib/dateUtils'

// ── Types ──────────────────────────────────────────────────────────────────

interface FlatPayment {
  id: string
  amount: number
  payment_type: string
  paid_at: string
  projectName: string
  customerName: string
  projectId: string
  agreedPrice: number | null
}

interface Props {
  flatPayments: FlatPayment[]
  totalProjectsCount: number
  fullyPaidProjectsCount: number
}

// ── Constants & Helpers ───────────────────────────────────────────────────

const PAYMENT_TYPE_MAP: Record<string, string> = {
  deposit: 'มัดจำ',
  balance: 'ยอดคงเหลือ',
  full_payment: 'ชำระเต็มจำนวน'
}

const monthsThai = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

function getBangkokYearMonth(isoStr: string): string {
  const d = new Date(isoStr)
  const bkkMs = d.getTime() + 7 * 60 * 60 * 1000
  const bkkDate = new Date(bkkMs)
  const yyyy = bkkDate.getUTCFullYear()
  const mm = String(bkkDate.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function formatMonthName(yrMo: string): string {
  const [yr, mo] = yrMo.split('-').map(Number)
  const thaiYear = yr + 543
  return `${monthsThai[mo - 1]} ${thaiYear}`
}

export function ArtistEarningsClient({ flatPayments, totalProjectsCount, fullyPaidProjectsCount }: Props) {
  const [period, setPeriod] = useState<'all' | 'this_month' | 'prev_month' | string>('all')

  // Bangkok today details
  const bangkokTodayParts = (() => {
    const now = new Date()
    const bkkMs = now.getTime() + 7 * 60 * 60 * 1000
    const d = new Date(bkkMs)
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1 // 1-indexed
    }
  })()

  const thisMonthStr = `${bangkokTodayParts.year}-${String(bangkokTodayParts.month).padStart(2, '0')}`

  const prevMonthStr = (() => {
    let y = bangkokTodayParts.year
    let m = bangkokTodayParts.month - 1
    if (m === 0) {
      m = 12
      y -= 1
    }
    return `${y}-${String(m).padStart(2, '0')}`
  })()

  // Generate dynamic months list from payments
  const monthsList = Array.from(
    new Set(flatPayments.map(p => getBangkokYearMonth(p.paid_at)))
  ).sort((a, b) => b.localeCompare(a))

  // ── Filter Payments ──────────────────────────────────────

  const filteredPayments = flatPayments.filter(p => {
    if (period === 'all') return true
    const pYrMo = getBangkokYearMonth(p.paid_at)
    if (period === 'this_month') return pYrMo === thisMonthStr
    if (period === 'prev_month') return pYrMo === prevMonthStr
    return pYrMo === period
  })

  // ── Metrics Calculation ──────────────────────────────────

  const totalRevenue = filteredPayments.reduce((sum, p) => sum + p.amount, 0)
  const depositRevenue = filteredPayments.filter(p => p.payment_type === 'deposit').reduce((sum, p) => sum + p.amount, 0)
  const balanceRevenue = filteredPayments.filter(p => p.payment_type === 'balance' || p.payment_type === 'full_payment').reduce((sum, p) => sum + p.amount, 0)
  const transactionCount = filteredPayments.length

  const distinctProjectsInPeriod = Array.from(new Set(filteredPayments.map(p => p.projectId)))
  const projectCount = distinctProjectsInPeriod.length
  const averagePerProject = projectCount > 0 ? Math.round(totalRevenue / projectCount) : 0

  return (
    <div className="space-y-6">
      {/* Filters and Date Dropdown */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-[#737373]">
            <span className="text-xs font-medium">รายได้ในช่วงที่เลือก</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-[#F5F5F5]">฿{totalRevenue.toLocaleString()}</p>
        </div>

        {/* Average per Project */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-[#737373]">
            <span className="text-xs font-medium">เฉลี่ยต่อโปรเจกต์</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-[#F5F5F5]">฿{averagePerProject.toLocaleString()}</p>
        </div>

        {/* Transaction Count */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-[#737373]">
            <span className="text-xs font-medium">รายการรับเงิน</span>
            <Receipt className="w-4 h-4 text-yellow-500" />
          </div>
          <p className="text-2xl font-bold text-[#F5F5F5]">{transactionCount} ครั้ง</p>
        </div>

        {/* Fully Paid Projects */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-2">
          <div className="flex justify-between items-center text-[#737373]">
            <span className="text-xs font-medium">งานที่ชำระครบแล้วทั้งหมด</span>
            <CheckSquare className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-[#F5F5F5]">{fullyPaidProjectsCount} งาน</p>
        </div>
      </div>

      {/* Breakdown and Projects statistics */}
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
              <span>ยอดรวมช่วงที่เลือก</span>
              <span>฿{totalRevenue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Transaction History List */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 space-y-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-[#F5F5F5] border-b border-[#262626] pb-2">ประวัติการชำระเงิน</h3>

          {filteredPayments.length === 0 ? (
            <div className="p-8 text-center text-[#737373] text-xs">
              ยังไม่มีรายการชำระเงินในช่วงเวลานี้
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {filteredPayments.map(p => (
                <div key={p.id} className="bg-[#121212] border border-[#262626]/60 rounded-xl p-4 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#F5F5F5]">{p.customerName}</span>
                      <span className="text-[10px] text-[#737373]">•</span>
                      <span className="text-[#737373] truncate">{p.projectName}</span>
                    </div>
                    <div className="text-[10px] text-[#737373] flex items-center gap-3">
                      <span>{formatThaiDate(p.paid_at)} {formatThaiTime(p.paid_at)}</span>
                      <span>ประเภท: {PAYMENT_TYPE_MAP[p.payment_type] || p.payment_type}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-400 text-sm">+฿{p.amount.toLocaleString()}</p>
                    <span className="text-[9px] px-1.5 py-0.2 rounded border border-green-500/20 bg-green-500/10 text-green-400">
                      ชำระแล้ว
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
