'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2, PlusCircle, XCircle, Loader2, AlertCircle,
  CalendarDays, Clock, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  formatThaiDate,
  formatThaiDateTime,
  gregorianToThaiNumeric
} from '@/lib/dateUtils'
import { ThaiBuddhistDatePicker } from '@/components/ui/ThaiBuddhistDatePicker'

// ── Types ──────────────────────────────────────────────────────────────────

interface AppointmentRow {
  id: string
  session_number: number
  status: string
  start_at: string
  end_at: string
  actual_started_at: string | null
  actual_ended_at: string | null
}

interface ProjectState {
  status: string
  completed_at: string | null
  agreed_price: number | null
}

// ── Constants ─────────────────────────────────────────────────────────────

const PROJECT_STATUS_MAP: Record<string, { label: string; colorClass: string }> = {
  proposed:  { label: 'รอดำเนินการ',        colorClass: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  active:    { label: 'กำลังดำเนินงาน',     colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  completed: { label: 'ปิดโปรเจกต์แล้ว',   colorClass: 'text-green-500 bg-green-500/10 border-green-500/20' },
  cancelled: { label: 'ยกเลิกโปรเจกต์',    colorClass: 'text-red-500 bg-red-500/10 border-red-500/20' },
}

const APPT_STATUS_MAP: Record<string, { label: string; colorClass: string }> = {
  scheduled:   { label: 'ยืนยันแล้ว',       colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  in_progress: { label: 'กำลังดำเนินงาน',  colorClass: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  completed:   { label: 'เสร็จสิ้น',        colorClass: 'text-green-500 bg-green-500/10 border-green-500/20' },
  cancelled:   { label: 'ยกเลิก',           colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
  no_show:     { label: 'ไม่มาตามนัด',      colorClass: 'text-red-400 bg-red-500/10 border-red-500/20' },
}

// Start times: 30-min increments 10:00–23:30 (shop open range)
const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = []
  for (let h = 10; h <= 23; h++) {
    opts.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 23) opts.push(`${String(h).padStart(2, '0')}:30`)
  }
  opts.push('23:30')
  return opts
})()

// Overnight end times: full next-day range 00:00–23:30 (+1 วัน)
// No business rule defines a maximum session end time.
// STORE_CLOSING_HOURS = 23:30 in BookingCalendarFlow is a *customer start-time* rule only.
const OVERNIGHT_END_TIMES: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = []
  for (let h = 0; h <= 23; h++) {
    opts.push({ value: `${String(h).padStart(2, '0')}:00`, label: `${String(h).padStart(2, '0')}:00 (+1 วัน)` })
    if (h < 23) opts.push({ value: `${String(h).padStart(2, '0')}:30`, label: `${String(h).padStart(2, '0')}:30 (+1 วัน)` })
  }
  opts.push({ value: '23:30', label: '23:30 (+1 วัน)' })
  return opts
})()

// ── Helpers ────────────────────────────────────────────────────────────────

function formatActualDuration(startStr: string | null, endStr: string | null): string {
  if (!startStr || !endStr) return ''
  const diffMs = new Date(endStr).getTime() - new Date(startStr).getTime()
  if (diffMs <= 0) return '0 นาที'
  const diffMins = Math.round(diffMs / (1000 * 60))
  const hrs = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  if (hrs === 0) return `${mins} นาที`
  if (mins === 0) return `${hrs} ชม.`
  return `${hrs} ชม. ${mins} นาที`
}

function formatThaiTimeOnly(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`
}

function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${fmt(startIso)} – ${fmt(endIso)} น.`
}

function getBangkokDateParts(isoStr: string) {
  const d = new Date(isoStr)
  const bkkMs = d.getTime() + 7 * 60 * 60 * 1000
  const bkkDate = new Date(bkkMs)
  const yyyy = bkkDate.getUTCFullYear()
  const mm = String(bkkDate.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(bkkDate.getUTCDate()).padStart(2, '0')
  const hh = String(bkkDate.getUTCHours()).padStart(2, '0')
  const min = String(bkkDate.getUTCMinutes()).padStart(2, '0')
  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    timeStr: `${hh}:${min}`
  }
}

/** Map a server error message to a safe Thai message */
function mapErrorMessage(raw: string): string {
  if (raw.includes('ยังมีเซสชันที่ยังไม่เสร็จสิ้น') || raw.includes('scheduled') || raw.includes('in_progress')) {
    return 'ยังมี Session ที่ยังไม่เสร็จสิ้น กรุณาดำเนินงาน Session ทั้งหมดให้เสร็จก่อน'
  }
  if (raw.includes('ยอดคงเหลือ') || raw.includes('remaining')) {
    return 'ยังมียอดคงเหลือที่ต้องชำระก่อนปิดโปรเจกต์'
  }
  if (raw.includes('pending') || raw.includes('verification_pending') || raw.includes('refund_pending') || raw.includes('ยังไม่ได้รับการแก้ไข')) {
    return 'ยังมีรายการชำระเงินที่ต้องดำเนินการก่อนปิดโปรเจกต์'
  }
  if (raw.includes('เซสชันที่เสร็จสมบูรณ์')) {
    return 'ต้องมีเซสชันที่เสร็จสมบูรณ์อย่างน้อย 1 ครั้งก่อนปิดโปรเจกต์'
  }
  if (raw.includes('ราคางานสัก') || raw.includes('agreed_price')) {
    return 'กรุณากำหนดราคางานสักก่อนปิดโปรเจกต์'
  }
  if (raw.includes('Appointment conflict')) {
    return 'เวลาที่เลือกขัดแย้งกับ Session อื่น กรุณาเลือกเวลาอื่น'
  }
  if (raw.includes('Slot conflict')) {
    return 'เวลาที่เลือกขัดแย้งกับ Slot ที่จองไว้ กรุณาเลือกเวลาอื่น'
  }
  return 'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลอีกครั้ง'
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  projectId: string
  bookingRequestId: string
}

export function ProjectLifecycleCard({ projectId, bookingRequestId }: Props) {
  const supabase = createClient()

  // ── Project state ────────────────────────────────────────
  const [project, setProject]           = useState<ProjectState | null>(null)
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [totalPaid, setTotalPaid]       = useState<number>(0)
  const [isLoading, setIsLoading]       = useState(true)
  const [error, setError]               = useState<string | null>(null)

  // ── Session history expand ────────────────────────────────
  const [showHistory, setShowHistory]   = useState(false)

  // ── Session start/complete confirmation ───────────────────
  const [confirmStartAppt, setConfirmStartAppt] = useState<AppointmentRow | null>(null)
  const [confirmCompleteAppt, setConfirmCompleteAppt] = useState<AppointmentRow | null>(null)
  const [confirmCancelAppt, setConfirmCancelAppt] = useState<AppointmentRow | null>(null)
  const [isMutatingSession, setIsMutatingSession] = useState(false)

  // ── Add Session modal ─────────────────────────────────────
  const [showAddSession, setShowAddSession]     = useState(false)
  const [sessionDate, setSessionDate]           = useState('')
  const [sessionStartTime, setSessionStartTime] = useState('10:00')
  const [sessionEndTime, setSessionEndTime]     = useState('0|12:00')
  const [sessionNotes, setSessionNotes]         = useState('')
  const [isAddingSession, setIsAddingSession]   = useState(false)
  const [addSessionError, setAddSessionError]   = useState<string | null>(null)
  const [addSessionSuccess, setAddSessionSuccess] = useState(false)

  // ── Edit Session modal ────────────────────────────────────
  const [editAppt, setEditAppt]                 = useState<AppointmentRow | null>(null)
  const [editDate, setEditDate]                 = useState('')
  const [editStartTime, setEditStartTime]       = useState('10:00')
  const [editEndTime, setEditEndTime]           = useState('0|12:00')
  const [isEditingSession, setIsEditingSession] = useState(false)
  const [editSessionError, setEditSessionError] = useState<string | null>(null)
  const [editSessionSuccess, setEditSessionSuccess] = useState(false)

  // Validate and auto-update/clear end time if start time changes
  useEffect(() => {
    const [offsetStr, timePart] = sessionEndTime.split('|')
    const offset = Number(offsetStr)
    
    if (offset === 0 && timePart <= sessionStartTime) {
      const nextSameDay = TIME_OPTIONS.find(t => t > sessionStartTime)
      if (nextSameDay) {
        setSessionEndTime(`0|${nextSameDay}`)
      } else {
        setSessionEndTime('1|00:00')
      }
    }
  }, [sessionStartTime])

  // Validate and auto-update/clear end time if edit start time changes
  useEffect(() => {
    if (!editStartTime) return
    const [offsetStr, timePart] = editEndTime.split('|')
    const offset = Number(offsetStr)
    
    if (offset === 0 && timePart <= editStartTime) {
      const nextSameDay = TIME_OPTIONS.find(t => t > editStartTime)
      if (nextSameDay) {
        setEditEndTime(`0|${nextSameDay}`)
      } else {
        setEditEndTime('1|00:00')
      }
    }
  }, [editStartTime])

  // ── Balance payment state ─────────────────────────────────
  const [pendingBalancePayment, setPendingBalancePayment] = useState<{ id: string; amount: number; status: string } | null>(null)
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceSuccess, setBalanceSuccess] = useState(false)

  // ── Close project dialog ──────────────────────────────────
  const [showCloseDialog, setShowCloseDialog]   = useState(false)
  const [isClosing, setIsClosing]               = useState(false)
  const [closeError, setCloseError]             = useState<string | null>(null)

  // ── Load data ─────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const { data: proj, error: projErr } = await supabase
        .from('tattoo_projects')
        .select('status, completed_at, agreed_price')
        .eq('id', projectId)
        .single()
      if (projErr) throw projErr
      setProject(proj)

      const { data: appts, error: apptErr } = await supabase
        .from('appointments')
        .select('id, session_number, status, start_at, end_at, actual_started_at, actual_ended_at')
        .eq('project_id', projectId)
        .order('session_number', { ascending: true })
      if (apptErr) throw apptErr
      setAppointments(appts ?? [])

      // Fetch direct payments
      const { data: directPayments, error: dpErr } = await supabase
        .from('payments')
        .select('id, amount, status, payment_type')
        .eq('project_id', projectId)
      if (dpErr) throw dpErr

      // Fetch booking request payments
      const { data: bookingReqs, error: brErr } = await supabase
        .from('booking_requests')
        .select('id')
        .eq('project_id', projectId)
      if (brErr) throw brErr

      let bookingPayments: any[] = []
      if (bookingReqs && bookingReqs.length > 0) {
        const brIds = bookingReqs.map(br => br.id)
        const { data: bpData, error: bpErr } = await supabase
          .from('payments')
          .select('id, amount, status, payment_type')
          .in('booking_request_id', brIds)
        if (bpErr) throw bpErr
        bookingPayments = bpData ?? []
      }

      const allPayments = [...(directPayments ?? []), ...bookingPayments]
      const totalPaidVal = allPayments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + Number(p.amount), 0)

      setTotalPaid(totalPaidVal)

      const pendingBal = allPayments.find(p => p.payment_type === 'balance' && (p.status === 'pending' || p.status === 'verification_pending'))
      setPendingBalancePayment(pendingBal ? { id: pendingBal.id, amount: Number(pendingBal.amount), status: pendingBal.status } : null)
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถโหลดข้อมูลโปรเจกต์ได้')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Add Session submit ────────────────────────────────────

  const handleAddSession = async () => {
    if (!sessionDate || !sessionStartTime || !sessionEndTime) {
      setAddSessionError('กรุณากรอกวันที่และเวลาให้ครบถ้วน')
      return
    }
    const startIso  = `${sessionDate}T${sessionStartTime}:00+07:00`
    
    // Parse selected sessionEndTime (dayOffset|HH:mm)
    const [endDayOffsetStr, endTimePart] = sessionEndTime.split('|')
    const endDayOffset = Number(endDayOffsetStr)
    const endDateStr = getEndDate(endDayOffset)
    const endIso    = `${endDateStr}T${endTimePart}:00+07:00`
    
    if (new Date(endIso) <= new Date(startIso)) {
      setAddSessionError('เวลาสิ้นสุดต้องหลังจากเวลาเริ่มต้น')
      return
    }

    try {
      setIsAddingSession(true)
      setAddSessionError(null)

      const { error: rpcErr } = await supabase.rpc('create_project_session', {
        p_project_id: projectId,
        p_start_at:   startIso,
        p_end_at:     endIso,
        p_notes:      sessionNotes.trim() || null,
      })
      if (rpcErr) throw rpcErr

      setAddSessionSuccess(true)
      // Reset form
      setSessionDate('')
      setSessionStartTime('10:00')
      setSessionEndTime('0|12:00')
      setSessionNotes('')
      await loadData()

      // Auto-dismiss success feedback after 2s then close modal
      setTimeout(() => {
        setAddSessionSuccess(false)
        setShowAddSession(false)
      }, 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setAddSessionError(mapErrorMessage(msg))
    } finally {
      setIsAddingSession(false)
    }
  }

  // ── Close project ─────────────────────────────────────────

  const handleCloseProject = async () => {
    try {
      setIsClosing(true)
      setCloseError(null)

      const { error: rpcErr } = await supabase.rpc('complete_project', {
        p_project_id: projectId,
      })
      if (rpcErr) throw rpcErr

      setShowCloseDialog(false)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setCloseError(mapErrorMessage(msg))
      await loadData()
    } finally {
      setIsClosing(false)
    }
  }

  // ── Edit / Reschedule Session ──────────────────────────────

  const handleOpenEditSession = (appt: AppointmentRow) => {
    setEditAppt(appt)
    setEditSessionError(null)
    setEditSessionSuccess(false)
    
    // Parse existing start_at & end_at
    const startParts = getBangkokDateParts(appt.start_at)
    const endParts = getBangkokDateParts(appt.end_at)
    
    // Determine dayOffset
    const dayOffset = startParts.dateStr === endParts.dateStr ? 0 : 1
    
    setEditDate(startParts.dateStr)
    setEditStartTime(startParts.timeStr)
    setEditEndTime(`${dayOffset}|${endParts.timeStr}`)
  }

  const getEditEndDate = (dayOffset: number): string => {
    if (dayOffset === 0 || !editDate) return editDate
    const [yyyy, mm, dd] = editDate.split('-').map(Number)
    const nextDay = new Date(Date.UTC(yyyy, mm - 1, dd + 1))
    return `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`
  }

  const handleRescheduleSession = async () => {
    if (!editAppt) return
    if (!editDate || !editStartTime || !editEndTime) {
      setEditSessionError('กรุณากรอกวันที่และเวลาให้ครบถ้วน')
      return
    }

    const startIso = `${editDate}T${editStartTime}:00+07:00`
    
    // Parse selected editEndTime (dayOffset|HH:mm)
    const [endDayOffsetStr, endTimePart] = editEndTime.split('|')
    const endDayOffset = Number(endDayOffsetStr)
    const endDateStr = getEditEndDate(endDayOffset)
    const endIso = `${endDateStr}T${endTimePart}:00+07:00`
    
    if (new Date(endIso) <= new Date(startIso)) {
      setEditSessionError('เวลาสิ้นสุดต้องหลังจากเวลาเริ่มต้น')
      return
    }

    try {
      setIsEditingSession(true)
      setEditSessionError(null)

      const { error: rpcErr } = await supabase.rpc('reschedule_appointment_session', {
        p_appointment_id: editAppt.id,
        p_start_at: startIso,
        p_end_at: endIso
      })
      if (rpcErr) throw rpcErr

      setEditSessionSuccess(true)
      await loadData()

      setTimeout(() => {
        setEditSessionSuccess(false)
        setEditAppt(null)
      }, 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Only scheduled sessions can be rescheduled')) {
        setEditSessionError('แก้ไขได้เฉพาะ Session ที่ยังไม่เริ่ม')
      } else if (msg.includes('Appointment conflict')) {
        setEditSessionError('ช่วงเวลานี้มีนัดหมายอื่นแล้ว')
      } else if (msg.includes('Slot conflict')) {
        setEditSessionError('ช่วงเวลานี้อยู่นอกเวลาที่ช่างเปิดรับงาน หรือมีเวลาชนกัน')
      } else if (msg.toLowerCase().includes('unauthorized')) {
        setEditSessionError('คุณไม่มีสิทธิ์แก้ไข Session นี้')
      } else {
        setEditSessionError('ไม่สามารถแก้ไข Session ได้ กรุณาลองใหม่')
      }
    } finally {
      setIsEditingSession(false)
    }
  }

  // ── Balance payment handlers ──────────────────────────────

  const handleCreateBalancePayment = async () => {
    try {
      setIsMutatingSession(true)
      setBalanceError(null)

      const { error: rpcErr } = await supabase.rpc('create_project_balance_payment', {
        p_project_id: projectId
      })
      if (rpcErr) throw rpcErr

      setBalanceSuccess(true)
      await loadData()

      setTimeout(() => {
        setBalanceSuccess(false)
        setShowBalanceModal(false)
      }, 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('ไม่มียอดคงเหลือที่ต้องชำระ')) {
        setBalanceError('โปรเจกต์นี้ชำระครบแล้ว')
      } else if (msg.includes('มีรายการรอชำระยอดคงเหลืออยู่แล้ว')) {
        setBalanceError('มีรายการรอชำระยอดคงเหลืออยู่แล้ว')
      } else if (msg.toLowerCase().includes('unauthorized')) {
        setBalanceError('คุณไม่มีสิทธิ์ทำรายการนี้')
      } else if (msg.includes('Cannot settle balance for a cancelled project')) {
        setBalanceError('โปรเจกต์นี้ไม่สามารถรับชำระได้')
      } else {
        setBalanceError('ไม่สามารถบันทึกการชำระเงินได้')
      }
    } finally {
      setIsMutatingSession(false)
    }
  }

  const handleVerifyBalancePayment = async () => {
    if (!pendingBalancePayment) return
    try {
      setIsMutatingSession(true)

      const { error: rpcErr } = await supabase.rpc('verify_balance_payment', {
        p_payment_id: pendingBalancePayment.id,
        p_result: 'paid'
      })
      if (rpcErr) throw rpcErr

      await loadData()
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถยืนยันยอดชำระเงินได้')
    } finally {
      setIsMutatingSession(false)
    }
  }

  // ── Loading / Error shell ─────────────────────────────────

  if (isLoading) {
    return (
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 flex justify-center items-center h-32">
        <Loader2 className="w-5 h-5 text-[#A3A3A3] animate-spin" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-6">
        <div className="flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error ?? 'ไม่พบข้อมูลโปรเจกต์'}</p>
        </div>
      </div>
    )
  }

  const statusInfo = PROJECT_STATUS_MAP[project.status] ?? { label: project.status, colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' }
  const isActive   = project.status === 'active'
  const isDone     = project.status === 'completed'

  const completedCount    = appointments.filter(a => a.status === 'completed').length
  const scheduledCount    = appointments.filter(a => a.status === 'scheduled').length
  const inProgressCount   = appointments.filter(a => a.status === 'in_progress').length

  // Soft pre-check hints (informational only — backend is authoritative)
  const hasUnfinishedSessions = scheduledCount > 0 || inProgressCount > 0
  const hasNoCompletedSession = completedCount === 0

  // ── Bangkok today date string (YYYY-MM-DD in Asia/Bangkok) ───────────────
  const bangkokTodayStr = (() => {
    const now = new Date()
    // UTC+7: offset = 7 * 60 * 60 * 1000
    const bangkokMs = now.getTime() + 7 * 60 * 60 * 1000
    const d = new Date(bangkokMs)
    const yy = d.getUTCFullYear()
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(d.getUTCDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  })()

  // Current Bangkok HH:MM (for filtering today's past times)
  const bangkokNowHHMM = (() => {
    const now = new Date()
    const bangkokMs = now.getTime() + 7 * 60 * 60 * 1000
    const d = new Date(bangkokMs)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  })()

  const isToday = sessionDate === bangkokTodayStr

  // Available start times: filter past slots when date is today
  const availableStartTimes = isToday
    ? TIME_OPTIONS.filter(t => t > bangkokNowHHMM)
    : TIME_OPTIONS

  // Available end times:
  //   - same-day slots that are strictly after the start time (dayOffset = 0)
  //   - PLUS overnight next-day slots (dayOffset = 1)
  const sameDayEndTimes = TIME_OPTIONS
    .filter(t => t > sessionStartTime)
    .map(t => ({ value: `0|${t}`, label: t, overnight: false }))
  const overnightEndTimes = OVERNIGHT_END_TIMES.map(o => ({ value: `1|${o.value}`, label: o.label, overnight: true }))
  const availableEndTimes = [...sameDayEndTimes, ...overnightEndTimes]

  // Determine whether the currently selected end time is an overnight slot
  const selectedEndIsOvernight = sessionEndTime.startsWith('1|')

  // Build end date: +1 calendar day if overnight
  // IMPORTANT: "2026-08-22T00:00:00+07:00" = "2026-08-21T17:00:00Z" (Bangkok midnight = prior UTC day)
  // Do NOT use getUTCDate() on a Bangkok-midnight Date — it gives the wrong UTC day.
  // Instead parse the Bangkok date string directly as integers and use Date.UTC for correct rollover.
  const getEndDate = (dayOffset: number): string => {
    if (dayOffset === 0 || !sessionDate) return sessionDate
    const [yyyy, mm, dd] = sessionDate.split('-').map(Number)
    const nextDay = new Date(Date.UTC(yyyy, mm - 1, dd + 1))
    return `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`
  }

  const isEditToday = editDate === bangkokTodayStr

  // Available edit start times: filter past slots when date is today
  const availableEditStartTimes = isEditToday
    ? TIME_OPTIONS.filter(t => t > bangkokNowHHMM)
    : TIME_OPTIONS

  // Available edit end times:
  //   - same-day slots that are strictly after the edit start time (dayOffset = 0)
  //   - PLUS overnight next-day slots (dayOffset = 1)
  const sameDayEditEndTimes = TIME_OPTIONS
    .filter(t => t > editStartTime)
    .map(t => ({ value: `0|${t}`, label: t, overnight: false }))
  const overnightEditEndTimes = OVERNIGHT_END_TIMES.map(o => ({ value: `1|${o.value}`, label: o.label, overnight: true }))
  const availableEditEndTimes = [...sameDayEditEndTimes, ...overnightEditEndTimes]

  return (
    <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-[#F5F5F5]">สถานะโปรเจกต์</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusInfo.colorClass}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* ── Completed stamp ── */}
      {isDone && project.completed_at && (
        <div className="flex items-start gap-2.5 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <p>ปิดโปรเจกต์เมื่อ {formatThaiDateTime(project.completed_at)}</p>
        </div>
      )}

      {/* ── Session History ── */}
      {appointments.length > 0 && (
        <div className="border border-[#262626] rounded-lg overflow-hidden">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors"
          >
            <span className="font-medium">ประวัติ Session ({appointments.length})</span>
            {showHistory
              ? <ChevronUp className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />}
          </button>

          {showHistory && (
            <div className="divide-y divide-[#262626] border-t border-[#262626]">
              {appointments.map(appt => {
                const apptInfo = APPT_STATUS_MAP[appt.status] ?? { label: appt.status, colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' }
                return (
                  <div key={appt.id} className="px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#F5F5F5]">Session {appt.session_number}</p>
                        <div className="flex flex-col gap-1 mt-1 text-xs text-[#A3A3A3]">
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                            <span>วันนัด: {formatThaiDate(appt.start_at)}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                            <span>เวลานัด: {formatTimeRange(appt.start_at, appt.end_at)}</span>
                          </span>

                          {/* Actual times for in_progress / completed */}
                          {appt.status === 'in_progress' && appt.actual_started_at && (
                            <span className="text-yellow-500/95 font-medium mt-0.5">
                              เริ่มจริง: {formatThaiTimeOnly(appt.actual_started_at)}
                            </span>
                          )}

                          {appt.status === 'completed' && appt.actual_started_at && appt.actual_ended_at && (
                            <div className="mt-1 space-y-0.5 border-t border-[#262626]/40 pt-1 text-[11px] text-[#737373]">
                              <p>เวลาทำจริง: {formatThaiTimeOnly(appt.actual_started_at).replace(' น.', '')} – {formatThaiTimeOnly(appt.actual_ended_at)}</p>
                              <p>ระยะเวลาทำจริง: <span className="text-[#A3A3A3] font-medium">{formatActualDuration(appt.actual_started_at, appt.actual_ended_at)}</span></p>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium border ${apptInfo.colorClass}`}>
                        {apptInfo.label}
                      </span>
                    </div>

                    {/* Actions block based on status */}
                    {!isDone && (
                      <div className="flex justify-end gap-2 pt-1">
                        {appt.status === 'scheduled' && (
                          <>
                            <button
                              onClick={() => setConfirmStartAppt(appt)}
                              disabled={isMutatingSession || isEditingSession}
                              className="px-3.5 py-1.5 text-xs font-semibold bg-[#F5F5F5] text-black hover:bg-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              เริ่ม Session
                            </button>
                            <button
                              onClick={() => handleOpenEditSession(appt)}
                              disabled={isMutatingSession || isEditingSession}
                              className="px-3.5 py-1.5 text-xs font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              แก้ Session
                            </button>
                            <button
                              onClick={() => setConfirmCancelAppt(appt)}
                              disabled={isMutatingSession || isEditingSession}
                              className="px-3.5 py-1.5 text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            >
                              ยกเลิก Session
                            </button>
                          </>
                        )}
                        {appt.status === 'in_progress' && (
                          <button
                            onClick={() => setConfirmCompleteAppt(appt)}
                            disabled={isMutatingSession || isEditingSession}
                            className="px-3.5 py-1.5 text-xs font-semibold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            จบ Session
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── การชำระเงิน ── */}
      <div className="border border-[#262626] rounded-lg p-4 space-y-3 bg-[#121212]">
        <div className="flex justify-between items-center pb-2 border-b border-[#262626]/60">
          <span className="text-sm font-semibold text-[#F5F5F5]">การชำระเงิน</span>
          {project.agreed_price !== null && totalPaid >= Number(project.agreed_price) && (
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
              ชำระครบแล้ว
            </span>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#A3A3A3]">ราคางานสัก</span>
            <span className="text-[#F5F5F5] font-medium">
              {project.agreed_price !== null ? `฿${Number(project.agreed_price).toLocaleString()}` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#A3A3A3]">ชำระแล้ว</span>
            <span className="text-emerald-400 font-medium">
              ฿{totalPaid.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-[#262626]/40">
            <span className="text-[#A3A3A3]">ยอดคงเหลือ</span>
            <span className={`font-bold ${project.agreed_price !== null && (Number(project.agreed_price) - totalPaid) > 0 ? 'text-yellow-500' : 'text-[#F5F5F5]'}`}>
              ฿{project.agreed_price !== null ? Math.max(0, Number(project.agreed_price) - totalPaid).toLocaleString() : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Active Project Actions ── */}
      {isActive && (
        <div className="space-y-3 pt-1">
          {/* Soft hints */}
          {hasUnfinishedSessions && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>มี Session ที่ยังไม่เสร็จสิ้น ({scheduledCount > 0 ? `${scheduledCount} ยืนยันแล้ว` : ''}{inProgressCount > 0 ? ` ${inProgressCount} กำลังดำเนินงาน` : ''})</p>
            </div>
          )}

          {pendingBalancePayment && (
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between items-center text-[#F5F5F5]">
                <span>มีรายการรอชำระยอดคงเหลือ</span>
                <span className="font-semibold text-blue-400">฿{pendingBalancePayment.amount.toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleVerifyBalancePayment}
                  disabled={isMutatingSession || isEditingSession}
                  className="flex-1 py-2 font-semibold bg-blue-600 text-white hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 text-xs cursor-pointer text-center"
                >
                  {isMutatingSession ? 'กำลังยืนยัน...' : 'ยืนยันได้รับเงิน'}
                </button>
              </div>
            </div>
          )}

          {!pendingBalancePayment && (project.agreed_price !== null ? Math.max(0, Number(project.agreed_price) - totalPaid) : 0) > 0 && (
            <button
              onClick={() => { setShowBalanceModal(true); setBalanceError(null) }}
              disabled={isMutatingSession || isEditingSession}
              className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm font-medium disabled:opacity-50"
            >
              รับชำระยอดคงเหลือ
            </button>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            {/* เพิ่ม Session */}
            <button
              onClick={() => { setShowAddSession(true); setAddSessionError(null); setAddSessionSuccess(false) }}
              className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F5F5F5] text-black hover:bg-white transition-colors text-sm font-medium"
            >
              <PlusCircle className="w-4 h-4" />
              เพิ่ม Session
            </button>

            {/* ปิดโปรเจกต์ */}
            <button
              onClick={() => { setShowCloseDialog(true); setCloseError(null) }}
              className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors text-sm font-medium"
            >
              <XCircle className="w-4 h-4" />
              ปิดโปรเจกต์
            </button>
          </div>
        </div>
      )}

      {/* ── Completed project: no actions ── */}
      {isDone && (
        <p className="text-xs text-[#737373] pt-1">
          โปรเจกต์นี้ปิดงานแล้ว — ประวัติทั้งหมดยังคงอยู่
        </p>
      )}

      {/* ══════════════════════════════════════════════════════════
          ADD SESSION MODAL
      ══════════════════════════════════════════════════════════ */}
      {showAddSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-md p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F5F5F5]">เพิ่ม Session</h3>
              <button
                onClick={() => setShowAddSession(false)}
                disabled={isAddingSession}
                className="p-1.5 text-[#737373] hover:text-[#F5F5F5] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {addSessionError && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{addSessionError}</p>
              </div>
            )}

            {addSessionSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <p>เพิ่ม Session เรียบร้อยแล้ว</p>
              </div>
            )}

            {!addSessionSuccess && (
              <div className="space-y-4">
                {/* Date */}
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">วันที่</label>
                  <ThaiBuddhistDatePicker
                    value={sessionDate}
                    onChange={setSessionDate}
                    minDate={bangkokTodayStr}
                    disabled={isAddingSession}
                  />
                </div>

                {/* Times */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">เวลาเริ่ม</label>
                    <select
                      value={sessionStartTime}
                      onChange={e => setSessionStartTime(e.target.value)}
                      disabled={isAddingSession}
                      className="w-full bg-[#121212] border border-[#404040] rounded-lg px-3 py-2.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373] disabled:opacity-50"
                    >
                      {availableStartTimes.length === 0 ? (
                        <option value="">ไม่มีเวลาที่ว่าง</option>
                      ) : availableStartTimes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">เวลาสิ้นสุด</label>
                    <select
                      value={sessionEndTime}
                      onChange={e => setSessionEndTime(e.target.value)}
                      disabled={isAddingSession}
                      className="w-full bg-[#121212] border border-[#404040] rounded-lg px-3 py-2.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373] disabled:opacity-50"
                    >
                      {availableEndTimes.map(opt => (
                        <option key={`${opt.overnight ? 'ov' : 'sd'}-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Overnight notice */}
                {selectedEndIsOvernight && sessionDate && (
                  <p className="text-xs text-yellow-500/80 -mt-1">
                    ⚠️ เวลาสิ้นสุดจะเป็นวันถัดไป ({gregorianToThaiNumeric(getEndDate(1))})
                  </p>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">หมายเหตุ (ไม่บังคับ)</label>
                  <textarea
                    rows={2}
                    value={sessionNotes}
                    onChange={e => setSessionNotes(e.target.value)}
                    disabled={isAddingSession}
                    placeholder="เช่น งานต่อจากเซสชันที่แล้ว..."
                    className="w-full bg-[#121212] border border-[#404040] rounded-lg px-3 py-2.5 text-sm text-[#F5F5F5] placeholder-[#525252] focus:outline-none focus:border-[#737373] resize-none disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setShowAddSession(false)}
                    disabled={isAddingSession}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors text-sm disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleAddSession}
                    disabled={isAddingSession}
                    className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F5F5F5] text-black hover:bg-white transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isAddingSession
                      ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังเพิ่ม Session...</>
                      : 'ยืนยัน'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          CLOSE PROJECT DIALOG
      ══════════════════════════════════════════════════════════ */}
      {showCloseDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-sm p-6 shadow-xl space-y-5">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5] mb-1.5">ปิดโปรเจกต์</h3>
              <p className="text-sm text-[#A3A3A3] leading-relaxed">
                ยืนยันว่าการดำเนินงานของโปรเจกต์นี้เสร็จสิ้นแล้ว
              </p>
              <p className="text-xs text-[#737373] mt-2 leading-relaxed">
                ระบบจะตรวจสอบว่า Session ทั้งหมดเสร็จสิ้นและการชำระเงินครบถ้วนก่อนปิดโปรเจกต์
              </p>
            </div>

            {/* Soft hints */}
            {(hasUnfinishedSessions || hasNoCompletedSession) && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <p>
                  {hasUnfinishedSessions && 'ยังมี Session ที่ยังไม่เสร็จสิ้น '}
                  {hasNoCompletedSession && 'ยังไม่มี Session ที่เสร็จสมบูรณ์'}
                </p>
              </div>
            )}

            {closeError && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{closeError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseDialog(false)}
                disabled={isClosing}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors text-sm disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCloseProject}
                disabled={isClosing}
                className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F5F5F5] text-black hover:bg-white transition-colors text-sm font-medium disabled:opacity-50"
              >
                {isClosing
                  ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังปิด...</>
                  : 'ยืนยันปิดโปรเจกต์'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          SESSION START CONFIRMATION
      ══════════════════════════════════════════════════════════ */}
      {confirmStartAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
          <div className="bg-[#171717] border border-[#262626] rounded-xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h4 className="text-base font-semibold text-[#F5F5F5]">เริ่ม Session นี้ตอนนี้?</h4>
            <div className="space-y-1.5 text-sm text-[#A3A3A3]">
              <p>Session: {confirmStartAppt.session_number}</p>
              <p>เวลานัด: {formatThaiDate(confirmStartAppt.start_at)} ({formatTimeRange(confirmStartAppt.start_at, confirmStartAppt.end_at)})</p>
              <p className="text-yellow-500/90 text-xs mt-2">เมื่อยืนยัน ระบบจะบันทึกเวลาเริ่มงานจริง</p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setConfirmStartAppt(null)}
                disabled={isMutatingSession}
                className="px-4 py-2 text-xs font-medium text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#262626] rounded-lg transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  try {
                    setIsMutatingSession(true)
                    const { error: rpcErr } = await supabase.rpc('start_appointment_session', {
                      p_appointment_id: confirmStartAppt.id
                    })
                    if (rpcErr) throw rpcErr
                    setConfirmStartAppt(null)
                    await loadData()
                  } catch (err: any) {
                    alert(err.message || 'ไม่สามารถเริ่ม Session ได้')
                  } finally {
                    setIsMutatingSession(false)
                  }
                }}
                disabled={isMutatingSession}
                className="px-4 py-2 text-xs font-medium bg-[#F5F5F5] text-black hover:bg-white rounded-lg transition-colors cursor-pointer"
              >
                {isMutatingSession ? 'กำลังบันทึก...' : 'เริ่ม Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          SESSION COMPLETE CONFIRMATION
      ══════════════════════════════════════════════════════════ */}
      {confirmCompleteAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
          <div className="bg-[#171717] border border-[#262626] rounded-xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h4 className="text-base font-semibold text-[#F5F5F5]">ต้องการจบ Session นี้?</h4>
            <div className="space-y-1.5 text-sm text-[#A3A3A3]">
              <p>Session: {confirmCompleteAppt.session_number}</p>
              {confirmCompleteAppt.actual_started_at && (
                <p>เริ่มจริงเมื่อ: {formatThaiTimeOnly(confirmCompleteAppt.actual_started_at)}</p>
              )}
              <p className="text-yellow-500/90 text-xs mt-2">เมื่อยืนยัน ระบบจะบันทึกเวลาจบงานจริง</p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setConfirmCompleteAppt(null)}
                disabled={isMutatingSession}
                className="px-4 py-2 text-xs font-medium text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#262626] rounded-lg transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  try {
                    setIsMutatingSession(true)
                    const { error: rpcErr } = await supabase.rpc('complete_appointment_session', {
                      p_appointment_id: confirmCompleteAppt.id
                    })
                    if (rpcErr) throw rpcErr
                    setConfirmCompleteAppt(null)
                    await loadData()
                  } catch (err: any) {
                    alert(err.message || 'ไม่สามารถจบ Session ได้')
                  } finally {
                    setIsMutatingSession(false)
                  }
                }}
                disabled={isMutatingSession}
                className="px-4 py-2 text-xs font-medium bg-[#F5F5F5] text-black hover:bg-white rounded-lg transition-colors cursor-pointer"
              >
                {isMutatingSession ? 'กำลังบันทึก...' : 'จบ Session'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════
          EDIT SESSION MODAL
      ══════════════════════════════════════════════════════════ */}
      {editAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-md p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F5F5F5]">แก้ Session {editAppt.session_number}</h3>
              <button
                onClick={() => setEditAppt(null)}
                disabled={isEditingSession}
                className="p-1.5 text-[#737373] hover:text-[#F5F5F5] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {editSessionError && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{editSessionError}</p>
              </div>
            )}

            {editSessionSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <p>แก้ไข Session แล้ว</p>
              </div>
            )}

            {!editSessionSuccess && (
              <div className="space-y-4">
                {/* Date */}
                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">วันที่</label>
                  <ThaiBuddhistDatePicker
                    value={editDate}
                    onChange={setEditDate}
                    minDate={bangkokTodayStr}
                    disabled={isEditingSession}
                  />
                </div>

                {/* Times */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">เวลาเริ่ม</label>
                    <select
                      value={editStartTime}
                      onChange={e => setEditStartTime(e.target.value)}
                      disabled={isEditingSession}
                      className="w-full bg-[#121212] border border-[#404040] rounded-lg px-3 py-2.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373] disabled:opacity-50"
                    >
                      {availableEditStartTimes.length === 0 ? (
                        <option value="">ไม่มีเวลาที่ว่าง</option>
                      ) : availableEditStartTimes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">เวลาสิ้นสุด</label>
                    <select
                      value={editEndTime}
                      onChange={e => setEditEndTime(e.target.value)}
                      disabled={isEditingSession}
                      className="w-full bg-[#121212] border border-[#404040] rounded-lg px-3 py-2.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373] disabled:opacity-50"
                    >
                      {availableEditEndTimes.map(opt => (
                        <option key={`edit-${opt.overnight ? 'ov' : 'sd'}-${opt.value}`} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Overnight notice */}
                {editEndTime.startsWith('1|') && editDate && (
                  <p className="text-xs text-yellow-500/80 -mt-1">
                    ⚠️ เวลาสิ้นสุดจะเป็นวันถัดไป ({gregorianToThaiNumeric(getEditEndDate(1))})
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setEditAppt(null)}
                    disabled={isEditingSession}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors text-sm disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleRescheduleSession}
                    disabled={isEditingSession}
                    className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F5F5F5] text-black hover:bg-white transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isEditingSession
                      ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังแก้ไข...</>
                      : 'ยืนยัน'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════
          BALANCE PAYMENT MODAL
      ══════════════════════════════════════════════════════════ */}
      {showBalanceModal && project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-sm p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#F5F5F5]">รับชำระยอดคงเหลือ</h3>
              <button
                onClick={() => setShowBalanceModal(false)}
                disabled={isMutatingSession}
                className="p-1.5 text-[#737373] hover:text-[#F5F5F5] transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {balanceError && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{balanceError}</p>
              </div>
            )}

            {balanceSuccess && (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <p>บันทึกการชำระเงินเรียบร้อยแล้ว</p>
              </div>
            )}

            {!balanceSuccess && (
              <div className="space-y-4">
                <div className="space-y-2 text-sm text-[#A3A3A3]">
                  <div className="flex justify-between">
                    <span>ราคางานสัก</span>
                    <span className="text-[#F5F5F5]">฿{project.agreed_price !== null ? Number(project.agreed_price).toLocaleString() : '0'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ชำระแล้ว</span>
                    <span className="text-emerald-400">฿{totalPaid.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-[#262626] pt-2 font-medium">
                    <span className="text-[#F5F5F5]">ยอดคงเหลือ</span>
                    <span className="text-yellow-500">฿{(project.agreed_price !== null ? Math.max(0, Number(project.agreed_price) - totalPaid) : 0).toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#A3A3A3] mb-1.5 font-medium">จำนวนเงินที่รับ</label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={`฿${(project.agreed_price !== null ? Math.max(0, Number(project.agreed_price) - totalPaid) : 0).toLocaleString()}`}
                    className="w-full bg-[#121212] border border-[#404040]/70 rounded-lg px-3 py-2.5 text-sm text-[#A3A3A3] cursor-not-allowed select-none"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setShowBalanceModal(false)}
                    disabled={isMutatingSession}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors text-sm disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleCreateBalancePayment}
                    disabled={isMutatingSession}
                    className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isMutatingSession
                      ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</>
                      : 'ยืนยัน'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ══════════════════════════════════════════════════════════
          SESSION CANCEL CONFIRMATION
      ══════════════════════════════════════════════════════════ */}
      {confirmCancelAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-200">
          <div className="bg-[#171717] border border-[#262626] rounded-xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h4 className="text-base font-semibold text-[#F5F5F5]">ยกเลิก Session นี้?</h4>
            <div className="space-y-1.5 text-sm text-[#A3A3A3]">
              <p>Session: {confirmCancelAppt.session_number}</p>
              <p>เวลานัด: {formatThaiDate(confirmCancelAppt.start_at)} ({formatTimeRange(confirmCancelAppt.start_at, confirmCancelAppt.end_at)})</p>
              <p className="text-xs text-[#737373] mt-2 leading-relaxed">
                Session นี้จะถูกยกเลิกและนำออกจากตารางนัดหมาย การดำเนินการนี้ไม่ใช่การปิดโปรเจกต์
              </p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setConfirmCancelAppt(null)}
                disabled={isMutatingSession}
                className="px-4 py-2 text-xs font-medium text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#262626] rounded-lg transition-colors cursor-pointer"
              >
                กลับ
              </button>
              <button
                onClick={async () => {
                  try {
                    setIsMutatingSession(true)
                    const { error: rpcErr } = await supabase.rpc('cancel_appointment', {
                      p_appointment_id: confirmCancelAppt.id
                    })
                    if (rpcErr) throw rpcErr
                    setConfirmCancelAppt(null)
                    alert('ยกเลิก Session แล้ว')
                    await loadData()
                  } catch (err: any) {
                    alert(err.message || 'ไม่สามารถยกเลิก Session ได้')
                  } finally {
                    setIsMutatingSession(false)
                  }
                }}
                disabled={isMutatingSession}
                className="px-4 py-2 text-xs font-medium bg-red-600 text-white hover:bg-red-500 rounded-lg transition-colors cursor-pointer"
              >
                {isMutatingSession ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
