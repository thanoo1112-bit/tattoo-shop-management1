'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, X, Inbox, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Notification = {
  id: string
  type: string
  title: string
  message: string
  booking_request_id: string | null
  payment_id: string | null
  is_read: boolean
  created_at: string
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'เมื่อกี้'
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} วันที่แล้ว`
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case 'NEW_CUSTOM_BOOKING': return '📋'
    case 'NEW_FLASH_BOOKING': return '⚡'
    case 'PAYMENT_PROOF_UPLOADED': return '💳'
    case 'PAYMENT_PROOF_RESUBMITTED': return '🔄'
    default: return '🔔'
  }
}

function getNotificationLink(n: Notification, role: 'owner' | 'artist'): string {
  const base = role === 'owner' ? '/owner' : '/artist'
  if (n.booking_request_id) return `${base}/booking-requests`
  return `${base}/dashboard`
}

type Props = {
  role: 'owner' | 'artist'
  className?: string
}

export function NotificationBell({ role, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, message, booking_request_id, payment_id, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data ?? [])
    setLoading(false)
  }, [supabase])

  // Initial fetch + polling every 30s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    )
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unreadIds.length === 0) return
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  async function handleNotificationClick(n: Notification) {
    await markRead(n.id)
    setOpen(false)
    router.push(getNotificationLink(n, role))
  }

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev)
          if (!open) fetchNotifications()
        }}
        className="inline-flex items-center justify-center p-2 rounded-md text-[#9CA3AB] hover:text-[#F3F3F3] hover:bg-[#171717] relative focus:outline-none transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[16px] h-4 px-0.5 text-[10px] font-bold bg-[#8E232B] text-white rounded-full ring-2 ring-[#0A0A0A] leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-32px)] max-w-sm bg-[#121212] border border-[#262626] rounded-xl shadow-2xl z-[100] flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#262626] flex-shrink-0">
            <h3 className="text-sm font-semibold text-[#F3F3F3]">การแจ้งเตือน</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-[10px] text-[#9CA3AB] hover:text-[#F3F3F3] flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="w-3 h-3" />
                  อ่านทั้งหมด
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#9CA3AB] hover:text-[#F3F3F3] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-[#9CA3AB] text-sm">
                กำลังโหลด...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-[#9CA3AB]">
                <Inbox className="w-10 h-10 opacity-40" />
                <p className="text-sm">ยังไม่มีการแจ้งเตือน</p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`w-full text-left px-4 py-3 border-b border-[#1e1e1e] flex gap-3 transition-colors ${
                        n.is_read
                          ? 'hover:bg-[#171717]'
                          : 'bg-[#1a1a2e] hover:bg-[#1f1f38]'
                      }`}
                    >
                      <span className="text-xl flex-shrink-0 mt-0.5">
                        {getNotificationIcon(n.type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${n.is_read ? 'text-[#9CA3AB]' : 'text-[#F3F3F3]'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-[#747C85] mt-0.5 line-clamp-2 whitespace-normal">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-[#525A63] mt-1">
                          {formatRelativeTime(n.created_at)}
                        </p>
                      </div>
                      {!n.is_read && (
                        <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-[#8E232B]" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
