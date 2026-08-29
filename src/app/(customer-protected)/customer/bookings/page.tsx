import { getCurrentCustomer } from '@/lib/auth/customer'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Calendar, User, Info, DollarSign } from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending_review: { label: 'รอการตรวจสอบ', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  pending_payment: { label: 'รอมัดจำ', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  verification_pending: { label: 'รอตรวจสอบเงินมัดจำ', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  approved: { label: 'ยืนยันคิวแล้ว', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  rejected: { label: 'ปฏิเสธ', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
  cancelled: { label: 'ยกเลิกแล้ว', color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
  scheduled: { label: 'ลงปฏิทินแล้ว', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' },
  in_progress: { label: 'กำลังสัก', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
  completed: { label: 'เสร็จสิ้น', color: 'bg-teal-500/10 text-teal-500 border-teal-500/20' },
}

export default async function CustomerBookingsPage() {
  const customer = await getCurrentCustomer()
  if (!customer) {
    return <div className="text-center py-12 text-[#A3A3A3]">กรุณาเข้าสู่ระบบ</div>
  }

  const supabase = await createClient()

  // Query all bookings for this customer
  const { data: bookings, error } = await supabase
    .from('booking_requests')
    .select(`
      id,
      public_token,
      status,
      requested_start_at,
      submitted_full_name,
      tracking_code,
      profiles:artist_id (full_name),
      project:project_id (
        id,
        name,
        agreed_price,
        tattoo_style,
        body_placement
      )
    `)
    .eq('customer_id', customer.id)
    .order('requested_start_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch bookings:', error)
  }

  return (
    <div className="max-w-4xl mx-auto py-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#F5F5F5]">การจองของฉัน</h1>
          <p className="text-xs text-[#737373] mt-1">ประวัติและสถานะคำขอจองคิวสักของคุณ</p>
        </div>
        <Link 
          href="/shop/157-tattoo" 
          className="px-4 py-2 bg-[#F5F5F5] hover:bg-white text-black font-semibold text-xs rounded-xl shadow-lg transition-all text-center"
        >
          จองคิวใหม่
        </Link>
      </div>

      {!bookings || bookings.length === 0 ? (
        <div className="bg-[#121212] border border-[#262626] rounded-2xl p-12 text-center text-[#737373]">
          ไม่พบประวัติการจองคิว
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const artistName = (booking.profiles as any)?.full_name || 'ไม่ระบุช่าง'
            const statusConfig = STATUS_MAP[booking.status] || { label: booking.status, color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' }
            const dateStr = booking.requested_start_at 
              ? new Date(booking.requested_start_at).toLocaleDateString('th-TH', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) + ' น.'
              : 'ไม่ระบุวัน'

            const agreedPrice = (booking.project as any)?.agreed_price

            return (
              <div 
                key={booking.id}
                className="bg-[#121212] border border-[#262626] rounded-2xl p-5 hover:border-[#404040] transition-all flex flex-col md:flex-row justify-between gap-4 md:items-center"
              >
                <div className="space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs text-[#A3A3A3] font-semibold tracking-wider">
                      CODE: {booking.tracking_code || '—'}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 border rounded-full ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-[#737373]">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-[#A3A3A3] shrink-0" />
                      <span className="truncate">{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-[#A3A3A3] shrink-0" />
                      <span className="truncate">ช่าง: {artistName}</span>
                    </div>
                    <div className="flex items-center gap-2 col-span-1 sm:col-span-2">
                      <Info size={14} className="text-[#A3A3A3] shrink-0" />
                      <span className="truncate">
                        {(booking.project as any)?.tattoo_style || 'ไม่ระบุลาย/สไตล์'} 
                        {((booking.project as any)?.body_placement) && ` • ตำแหน่ง: ${(booking.project as any).body_placement}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-row md:flex-col justify-between items-end gap-3 shrink-0 pt-3 md:pt-0 border-t border-[#262626] md:border-0">
                  {agreedPrice !== undefined && agreedPrice !== null && (
                    <div className="text-right">
                      <span className="text-[10px] text-[#737373] block">ราคางานสัก</span>
                      <span className="text-sm font-bold text-[#F5F5F5]">฿{Number(agreedPrice).toLocaleString()}</span>
                    </div>
                  )}
                  <Link 
                    href={`/customer/bookings/${booking.id}`}
                    className="px-3.5 py-2 bg-[#171717] hover:bg-[#262626] border border-[#262626] hover:border-[#404040] text-xs font-semibold text-[#F5F5F5] rounded-xl transition-all text-center shrink-0"
                  >
                    ดูรายละเอียด
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
