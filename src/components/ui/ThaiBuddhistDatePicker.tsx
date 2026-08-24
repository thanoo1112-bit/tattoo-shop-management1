'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatThaiNumericDate } from '@/lib/dateUtils'

interface ThaiBuddhistDatePickerProps {
  value: string // Gregorian YYYY-MM-DD
  onChange: (value: string) => void
  minDate?: string // Gregorian YYYY-MM-DD
  disabled?: boolean
  className?: string
  placeholder?: string
  inputClassName?: string
  showIcon?: boolean
  dayMeta?: Record<string, { hasBooking?: boolean; closed?: boolean }>
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
]

const DAYS_OF_WEEK = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

// Helper to check if date string A is before date string B
function isBefore(dateA: string, dateB: string): boolean {
  return dateA < dateB
}

export function ThaiBuddhistDatePicker({
  value,
  onChange,
  minDate = '',
  disabled = false,
  className = '',
  placeholder = 'วัน/เดือน/พ.ศ.',
  inputClassName = '',
  showIcon = true,
  dayMeta
}: ThaiBuddhistDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  
  // Display date state for calendar view (initially based on value or today)
  const [displayedDate, setDisplayedDate] = useState(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      return new Date(y, m - 1, 1)
    }
    return new Date()
  })

  // Adjust displayed month when value prop changes (official React render-phase update pattern)
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (value) {
      const [y, m] = value.split('-').map(Number)
      setDisplayedDate(new Date(y, m - 1, 1))
    }
  }

  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Track mount status for React Portal
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true)
    }, 0)
    return () => {
      clearTimeout(timer)
      setMounted(false)
    }
  }, [])

  // Recalculate positioning
  const updatePosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    
    // Custom calendar dimensions
    const popoverHeight = 310
    const popoverWidth = 288

    let top = rect.bottom + window.scrollY
    let left = rect.left + window.scrollX

    // If there is not enough viewport space below, flip above
    if (rect.bottom + popoverHeight > viewportHeight && rect.top - popoverHeight > 0) {
      top = rect.top - popoverHeight + window.scrollY
    }

    // Keep within horizontal bounds (especially on mobile)
    if (left + popoverWidth > viewportWidth) {
      left = Math.max(8, viewportWidth - popoverWidth - 8)
    }

    setPopoverStyle({
      position: 'absolute',
      top: `${top}px`,
      left: `${left}px`,
      width: `${popoverWidth}px`,
      zIndex: 9999
    })
  }

  // Handle positioning update when opened
  useEffect(() => {
    if (isOpen) {
      updatePosition()
    }
  }, [isOpen])

  // Click outside detection (checks trigger button AND portal content)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (
        triggerRef.current && 
        !triggerRef.current.contains(target) &&
        (!popoverRef.current || !popoverRef.current.contains(target))
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close calendar popover on escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Close calendar popover cleanly if modal or page scrolls / resizes
  useEffect(() => {
    if (!isOpen) return
    const handleScrollOrResize = () => {
      setIsOpen(false)
    }
    
    // Capture scroll on any parent container to handle modal scrolling
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isOpen])

  // Calendar math
  const year = displayedDate.getFullYear()
  const month = displayedDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(year, month, 1).getDay()

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDisplayedDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDisplayedDate(new Date(year, month + 1, 1))
  }

  const selectDay = (day: number) => {
    const yStr = String(year).padStart(4, '0')
    const mStr = String(month + 1).padStart(2, '0')
    const dStr = String(day).padStart(2, '0')
    const selectedGregDate = `${yStr}-${mStr}-${dStr}`
    
    onChange(selectedGregDate)
    setIsOpen(false)
  }

  const todayStr = (() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })()

  // Format value for input box
  const displayValue = value ? formatThaiNumericDate(value) : ''

  return (
    <div className={`relative ${className}`}>
      {/* Input Field Button Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={inputClassName || "w-full flex items-center justify-between bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#F5F5F5]/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left min-h-[38px] relative"}
      >
        <span>{displayValue || <span className="text-[#525252]">{placeholder}</span>}</span>
        {showIcon && <CalendarDays className="h-5 w-5 text-[#A3A3A3]" />}
      </button>

      {/* Floating Popover Calendar Grid Rendered via Body Portal */}
      {isOpen && mounted && createPortal(
        <div
          ref={popoverRef}
          style={popoverStyle}
          className="bg-[#171717] border border-[#262626] rounded-xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Header Month / Year Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-[#262626] text-[#F5F5F5] transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-[#F5F5F5]">
              {THAI_MONTHS[month]} {year + 543}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-[#262626] text-[#F5F5F5] transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Days of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1 text-[11px] font-medium text-[#737373]">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="h-6 flex items-center justify-center">
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {/* Blank spaces before start of month */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`blank-${i}`} className="h-8" />
            ))}

            {/* Actual days of month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const yStr = String(year).padStart(4, '0')
              const mStr = String(month + 1).padStart(2, '0')
              const dStr = String(day).padStart(2, '0')
              const currentGregDate = `${yStr}-${mStr}-${dStr}`

              const meta = dayMeta?.[currentGregDate]
              const isDayClosed = meta?.closed || false
              const isDayHasBooking = meta?.hasBooking || false

              const isDaySelected = value === currentGregDate
              const isDayToday = todayStr === currentGregDate
              const isDayDisabled = (minDate ? isBefore(currentGregDate, minDate) : false) || isDayClosed

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  disabled={isDayDisabled}
                  onClick={() => selectDay(day)}
                  className={`h-9 w-8 rounded-lg flex flex-col items-center justify-center font-medium transition-colors cursor-pointer select-none relative
                    ${isDaySelected 
                      ? 'bg-[#F5F5F5] text-black hover:bg-white' 
                      : isDayDisabled
                        ? 'text-[#404040] cursor-not-allowed hover:bg-transparent'
                        : isDayToday
                          ? 'border border-[#F5F5F5]/30 text-[#F5F5F5] hover:bg-[#262626]'
                          : 'text-[#F5F5F5] hover:bg-[#262626]'
                    }
                  `}
                >
                  <span className={isDayClosed ? 'line-through text-[#404040]' : ''}>{day}</span>
                  {isDayHasBooking && !isDayClosed && (
                    <span className={`absolute bottom-1 h-1 w-1 rounded-full ${isDaySelected ? 'bg-black' : 'bg-[#737373]'}`} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          {dayMeta && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#262626] text-[10px] text-[#737373] select-none">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#737373]" />
              <span>มีคิว</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
