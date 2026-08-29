import { getCurrentCustomer } from '@/lib/auth/customer'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, User, Info, DollarSign, AlertCircle, FileText, CheckCircle2, XCircle } from 'lucide-react'
import CancelBookingButton from './CancelBookingButton'
import SlipUploadSection from './SlipUploadSection'

const STATUS_MAP: Record<string, { label: string; color: string; description: string }> = {
  pending_review: { 
    label: 'รอการตรวจสอบ', 
    color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    description: 'ช่างสักกำลังตรวจสอบคำขอจองคิวของคุณ ระบบจะอัปเดตสถานะเร็วๆ นี้'
  },
  pending_payment: { 
    label: 'รอมัดจำ', 
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    description: 'คำขอของคุณผ่านการพิจารณาแล้ว กรุณาชำระเงินมัดจำเพื่อยืนยันคิว'
  },
  verification_pending: { 
    label: 'รอตรวจสอบเงินมัดจำ', 
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    description: 'ระบบกำลังตรวจสอบหลักฐานสลิปการโอนเงินของคุณ'
  },
  approved: { 
    label: 'ยืนยันคิวแล้ว', 
    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    description: 'คิวของคุณยืนยันแล้ว เจอกันตามวันและเวลาที่นัดหมาย!'
  },
  rejected: { 
    label: 'ปฏิเสธ', 
    color: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    description: 'ขออภัย ช่างสักไม่สามารถรับนัดคิวนี้ได้'
  },
  cancelled: { 
    label: 'ยกเลิกแล้ว', 
    color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
    description: 'รายการนี้ถูกยกเลิกแล้ว'
  },
  scheduled: { 
    label: 'ลงปฏิทินแล้ว', 
    color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
    description: 'คิวสักถูกบันทึกเข้าระบบปฏิทินของสตูดิโอเรียบร้อยแล้ว'
  },
  in_progress: { 
    label: 'กำลังสัก', 
    color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    description: 'ช่างกำลังรังสรรค์ผลงานสักของคุณ'
  },
  completed: { 
    label: 'เสร็จสิ้น', 
    color: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
    description: 'บริการสักของคุณเสร็จสิ้นเรียบร้อยแล้ว'
  },
}

type PageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params
  const customer = await getCurrentCustomer()

  if (!customer) {
    return notFound()
  }

  const supabase = await createClient()

  // Query specific booking request
  const { data: booking, error } = await supabase
    .from('booking_requests')
    .select(`
      id,
      public_token,
      status,
      requested_start_at,
      submitted_full_name,
      submitted_phone,
      submitted_email,
      health_note,
      is_first_tattoo,
      tracking_code,
      customer_id,
      profiles:artist_id (full_name),
      project:project_id (
        id,
        name,
        agreed_price,
        tattoo_style,
        body_placement,
        width_cm,
        height_cm,
        size_note
      ),
      payments (
        id,
        status,
        amount,
        payment_type,
        proof_storage_path
      )
    `)
    .eq('id', id)
    .single()

  if (error || !booking) {
    return notFound()
  }

  // Security Ownership Check
  if (booking.customer_id !== customer.id) {
    return notFound() // Return 404 to hide existence
  }

  const artistName = (booking.profiles as any)?.full_name || 'ไม่ระบุช่าง'
  const statusConfig = STATUS_MAP[booking.status] || { label: booking.status, color: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', description: '' }
  const dateStr = booking.requested_start_at 
    ? new Date(booking.requested_start_at).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' น.'
    : 'ไม่ระบุวัน'

  const project = booking.project as any
  const depositPayment = (booking.payments as any[])?.find(p => p.payment_type === 'deposit')
  const depositAmount = depositPayment?.amount

  return (
    <div className="max-w-2xl mx-auto py-4">
      {/* Back button */}
      <div className="mb-6">
        <Link href="/customer/bookings" className="inline-flex items-center gap-2 text-xs text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors">
          <ArrowLeft size={14} /> กลับไปรายการจอง
        </Link>
      </div>

      <div className="space-y-6">
        {/* Header Block */}
        <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 flex flex-col sm:flex-row justify-between gap-4 sm:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-[#A3A3A3] font-semibold tracking-wider">
                CODE: {booking.tracking_code || '—'}
              </span>
              <span className={`text-[10px] font-semibold px-2.5 py-0.5 border rounded-full ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            </div>
            <p className="text-xs text-[#A3A3A3] mt-2.5 leading-relaxed">{statusConfig.description}</p>
          </div>

          {/* Cancel button if pending */}
          {(booking.status === 'pending_review' || booking.status === 'pending_payment') && (
            <CancelBookingButton bookingId={booking.id} />
          )}
        </div>

        {/* Booking Details Card */}
        <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-lg font-medium text-[#F5F5F5] border-b border-[#262626] pb-4 flex items-center gap-2">
            <FileText size={18} className="text-[#A3A3A3]" /> รายละเอียดคำขอจองคิว
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div>
              <span className="text-xs text-[#737373] block mb-1">วันและเวลานัดหมาย</span>
              <span className="font-medium text-[#F5F5F5]">{dateStr}</span>
            </div>
            <div>
              <span className="text-xs text-[#737373] block mb-1">ช่างสัก</span>
              <span className="font-medium text-[#F5F5F5]">{artistName}</span>
            </div>
            <div>
              <span className="text-xs text-[#737373] block mb-1">รูปแบบงาน / สไตล์</span>
              <span className="font-medium text-[#F5F5F5]">{project?.tattoo_style || 'ไม่ระบุ'}</span>
            </div>
            <div>
              <span className="text-xs text-[#737373] block mb-1">ตำแหน่งที่สัก</span>
              <span className="font-medium text-[#F5F5F5]">{project?.body_placement || 'ไม่ระบุ'}</span>
            </div>
            {project?.width_cm && project?.height_cm && (
              <div>
                <span className="text-xs text-[#737373] block mb-1">ขนาดงาน</span>
                <span className="font-medium text-[#F5F5F5]">{project.width_cm} × {project.height_cm} ซม.</span>
              </div>
            )}
            {project?.size_note && (
              <div className="col-span-1 sm:col-span-2">
                <span className="text-xs text-[#737373] block mb-1">บันทึกขนาด</span>
                <span className="font-medium text-[#F5F5F5]">{project.size_note}</span>
              </div>
            )}
            {booking.health_note && (
              <div className="col-span-1 sm:col-span-2">
                <span className="text-xs text-[#737373] block mb-1">ข้อมูลสุขภาพ/โรคประจำตัว</span>
                <span className="font-medium text-amber-500">{booking.health_note}</span>
              </div>
            )}
          </div>
        </div>

        {/* Pricing & Deposit Section */}
        {project?.agreed_price !== undefined && project?.agreed_price !== null && (
          <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 sm:p-8 space-y-4">
            <h3 className="text-sm font-medium text-[#A3A3A3] uppercase tracking-wider">สรุปค่าบริการ</h3>
            <div className="space-y-2 border-b border-[#262626] pb-4">
              <div className="flex justify-between text-sm">
                <span className="text-[#737373]">ราคางานสัก</span>
                <span className="text-[#F5F5F5] font-semibold">฿{Number(project.agreed_price).toLocaleString()}</span>
              </div>
              {depositAmount !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#737373]">เงินมัดจำที่ต้องชำระ</span>
                  <span className="text-amber-500 font-bold">฿{Number(depositAmount).toLocaleString()}</span>
                </div>
              )}
            </div>

            {depositPayment && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#737373]">สถานะเงินมัดจำ</span>
                <span className={`font-semibold ${
                  depositPayment.status === 'paid' ? 'text-emerald-500' :
                  depositPayment.status === 'verification_pending' ? 'text-blue-500' :
                  'text-amber-500'
                }`}>
                  {depositPayment.status === 'paid' ? 'ชำระเงินเรียบร้อยแล้ว' :
                   depositPayment.status === 'verification_pending' ? 'ส่งหลักฐานแล้ว รอตรวจสอบ' :
                   'รอชำระเงิน'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Slip Upload Form Section (Authenticated) */}
        {booking.status === 'pending_payment' && depositPayment && depositPayment.status === 'pending' && (
          <SlipUploadSection 
            publicToken={booking.public_token} 
            depositAmount={depositAmount || 0} 
            bookingId={booking.id}
          />
        )}
      </div>
    </div>
  )
}
