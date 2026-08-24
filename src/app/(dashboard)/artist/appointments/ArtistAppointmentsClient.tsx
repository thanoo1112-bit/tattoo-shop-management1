'use client'

import { useState } from 'react'
import { ProjectLifecycleCard } from '@/components/payments/ProjectLifecycleCard'
import { formatThaiDate, formatThaiTime } from '@/lib/dateUtils'
import { PenTool, UserRound, Palette, MapPin, CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import { EmptyState } from '@/components/owner/empty-state'

const COLOR_MODE_MAP: Record<string, string> = {
  black_grey: 'ขาวดำ',
  color: 'สี'
}

const WORK_TYPE_MAP: Record<string, string> = {
  new_work: 'งานใหม่',
  cover_up: 'งานแก้',
  touch_up: 'งานเติม'
}

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

interface Customer {
  id: string
  full_name: string
  phone_normalized: string | null
}

interface Payment {
  id: string
  amount: string
  status: string
  payment_type: string
}

interface BookingRequestRef {
  id: string
  payments: Payment[]
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
  customer: Customer | null
  appointments: Appointment[]
  booking_requests: BookingRequestRef[]
  payments: Payment[]
}

interface Props {
  projects: TattooProject[]
}

export function ArtistAppointmentsClient({ projects }: Props) {
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active')
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)

  // Filter projects by selected tab status
  const filteredProjects = projects.filter(p => p.status === activeTab)

  // Helper to find the nearest future appointment (scheduled or in_progress)
  const getNextAppointment = (appointments: Appointment[]) => {
    if (!appointments || appointments.length === 0) return null
    const now = new Date()
    const futureAppts = appointments
      .filter(a => (a.status === 'scheduled' || a.status === 'in_progress') && new Date(a.start_at) >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    return futureAppts[0] || null
  }

  const toggleExpand = (id: string) => {
    setExpandedProjectId(prev => (prev === id ? null : id))
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-[#262626] gap-6">
        <button
          onClick={() => {
            setActiveTab('active')
            setExpandedProjectId(null)
          }}
          className={`pb-3 text-sm font-medium transition-colors cursor-pointer relative ${
            activeTab === 'active' 
              ? 'text-[#F5F5F5] border-b-2 border-[#F5F5F5] -mb-[2px]' 
              : 'text-[#737373] hover:text-[#A3A3A3]'
          }`}
        >
          กำลังดำเนินการ
        </button>
        <button
          onClick={() => {
            setActiveTab('completed')
            setExpandedProjectId(null)
          }}
          className={`pb-3 text-sm font-medium transition-colors cursor-pointer relative ${
            activeTab === 'completed' 
              ? 'text-[#F5F5F5] border-b-2 border-[#F5F5F5] -mb-[2px]' 
              : 'text-[#737373] hover:text-[#A3A3A3]'
          }`}
        >
          เสร็จสิ้น
        </button>
      </div>

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <div className="md:border border-[#262626] rounded-xl bg-[#171717] shadow-md p-8">
          <EmptyState
            icon={PenTool}
            title={activeTab === 'active' ? 'ยังไม่มีงานสักที่กำลังดำเนินการ' : 'ยังไม่มีประวัติงานสักที่เสร็จสิ้น'}
            description="นัดหมายและประวัติงานสักจะปรากฏที่นี่"
          />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map(project => {
            const isExpanded = expandedProjectId === project.id
            const nextAppt = getNextAppointment(project.appointments)
            const bookingRequestId = project.booking_requests?.[0]?.id || ''

            const agreedPriceNum = project.agreed_price ? Number(project.agreed_price) : null
            const colorModeTh = project.color_mode ? (COLOR_MODE_MAP[project.color_mode] || project.color_mode) : ''
            const workTypeTh = project.work_type ? (WORK_TYPE_MAP[project.work_type] || project.work_type) : ''
            
            const summaryParts = [project.tattoo_style, workTypeTh, colorModeTh].filter(Boolean)
            const tattooSummary = summaryParts.join(' • ')

            return (
              <div
                key={project.id}
                className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-sm hover:border-[#333] transition-colors"
              >
                {/* Card Header (Collapsed Summary) */}
                <div
                  onClick={() => toggleExpand(project.id)}
                  className="p-5 sm:p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2.5 min-w-0 flex-1">
                    {/* Customer Info */}
                    <div className="flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-[#737373] shrink-0" />
                      <span className="text-base font-semibold text-[#F5F5F5]">
                        {project.customer?.full_name || 'ลูกค้าทั่วไป'}
                      </span>
                    </div>

                    {/* Tattoo specs */}
                    {tattooSummary && (
                      <div className="flex items-center gap-2 text-xs text-[#A3A3A3]">
                        <Palette className="w-4 h-4 shrink-0 text-[#737373]" />
                        <span>{tattooSummary}</span>
                      </div>
                    )}

                    {/* Size and Placement */}
                    {(project.body_placement || (project.width_cm && project.height_cm)) && (
                      <div className="flex items-center gap-2 text-xs text-[#A3A3A3]">
                        <MapPin className="w-4 h-4 shrink-0 text-[#737373]" />
                        <span>
                          {project.body_placement && `ตำแหน่ง: ${project.body_placement}`}
                          {project.width_cm && project.height_cm && ` (${project.width_cm}x${project.height_cm} ซม.)`}
                        </span>
                      </div>
                    )}

                    {/* Next Appointment alert */}
                    {nextAppt && (
                      <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded-lg w-fit">
                        <CalendarDays className="w-4 h-4 shrink-0" />
                        <span>
                          นัดหมายถัดไป: {formatThaiDate(nextAppt.start_at)} • {formatThaiTime(nextAppt.start_at).replace(' น.', '')}–{formatThaiTime(nextAppt.end_at)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Financial & Expand controls */}
                  <div className="flex items-center justify-between md:justify-end gap-6 border-t border-[#262626] md:border-none pt-3 md:pt-0">
                    <div className="text-left md:text-right">
                      <span className="text-xs text-[#737373] block">ราคางานสัก</span>
                      <span className="text-lg font-bold text-[#F5F5F5]">
                        {agreedPriceNum !== null ? `฿${agreedPriceNum.toLocaleString()}` : '—'}
                      </span>
                    </div>

                    <div className="text-[#A3A3A3] p-1 hover:text-[#F5F5F5] transition-colors rounded-lg hover:bg-[#262626]">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details containing original ProjectLifecycleCard */}
                {isExpanded && (
                  <div className="border-t border-[#262626] bg-[#0A0A0A] p-5 sm:p-6">
                    <div className="w-full">
                      <ProjectLifecycleCard
                        projectId={project.id}
                        bookingRequestId={bookingRequestId}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
