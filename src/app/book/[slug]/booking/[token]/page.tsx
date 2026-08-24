import { createClient } from '@/lib/supabase/server'
import { formatThaiDate, formatThaiTime, formatThaiDateTime } from '@/lib/dateUtils'
import { AlertCircle, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { InlinePaymentPanel } from '@/components/payment/InlinePaymentPanel'
import CopyTrackingCode from '@/components/booking/CopyTrackingCode'

interface Props {
  params: Promise<{
    slug: string
    token: string
  }>
}

export const revalidate = 0

export default async function BookingStatusPage({ params }: Props) {
  const { slug, token } = await params
  const supabase = await createClient()

  // Query status via RPC
  const { data: statusData, error } = await supabase.rpc('get_public_booking_status', {
    p_shop_slug: slug,
    p_public_token: token
  })

  // Query tracking code via RPC
  const { data: trackingCode } = await supabase.rpc('get_public_booking_tracking_code', {
    p_shop_slug: slug,
    p_public_token: token
  })

  if (error || !statusData || statusData.length === 0) {
    return (
      <div className="max-w-[720px] mx-auto w-full pt-16 px-4">
        <div className="bg-[#121212] border border-[#262626] rounded-xl p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[#737373] mx-auto" />
          <h2 className="text-lg font-medium text-[#F5F5F5]">ไม่พบคำขอจอง</h2>
          <p className="text-sm text-[#737373]">
            ข้อมูลไม่ถูกต้อง หรือคำขอนี้ไม่ได้อยู่ในระบบ
          </p>
        </div>
      </div>
    )
  }

  const booking = statusData[0]

  // Status mapping
  const statusLabels: Record<string, string> = {
    pending_review: 'รอตรวจสอบคำขอ',
    pending_payment: 'รอชำระเงินมัดจำ',
    approved: 'ยืนยันคิวแล้ว',
    rejected: 'คำขอถูกปฏิเสธ',
    expired: 'คำขอหมดอายุ',
    cancelled: 'คำขอถูกยกเลิก'
  }
  let displayStatus = statusLabels[booking.booking_status] || booking.booking_status
  if (booking.booking_status === 'pending_payment' && booking.payment_status === 'verification_pending') {
    displayStatus = 'รอตรวจสอบการชำระเงิน'
  }

  // Payment status mapping
  const paymentLabels: Record<string, string> = {
    pending: 'รอการชำระเงิน',
    verification_pending: 'ส่งหลักฐานแล้ว รอตรวจสอบ',
    paid: 'ชำระแล้ว',
    failed: 'การชำระเงินไม่สำเร็จ',
    cancelled: 'การชำระเงินถูกยกเลิก',
    none: 'ไม่มีข้อมูลมัดจำ'
  }
  const displayPaymentStatus = paymentLabels[booking.payment_status] || booking.payment_status

  return (
    <div className="max-w-[720px] mx-auto w-full pt-4 md:pt-8 pb-16 px-4 space-y-6">
      {/* Header and Back Link */}
      <div className="flex items-center justify-between">
        <Link 
          href={`/book/${slug}`}
          className="text-xs text-[#A3A3A3] hover:text-[#F5F5F5] flex items-center gap-1"
        >
          กลับสู่หน้าหลักของร้าน
        </Link>
        <a
          href=""
          className="text-xs text-[#A3A3A3] hover:text-[#F5F5F5] flex items-center gap-1 bg-[#1A1A1A] border border-[#262626] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw size={12} />
          รีเฟรชสถานะ
        </a>
      </div>

      {/* Main Status Card */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl overflow-hidden w-full">
        {/* Status indicator bar */}
        <div className="px-5 sm:px-6 py-5 border-b border-[#262626] space-y-3">
          <p className="text-xs text-[#737373] uppercase tracking-wider font-semibold">สถานะคำขอจอง</p>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-[#F5F5F5]">
              {displayStatus}
            </h2>
            {booking.booking_status === 'approved' && <CheckCircle2 className="text-emerald-500 w-6 h-6" />}
            {booking.booking_status === 'pending_review' && <Clock className="text-[#A3A3A3] w-6 h-6 animate-pulse" />}
            {booking.booking_status === 'pending_payment' && (
              booking.payment_status === 'verification_pending' ? (
                <Clock className="text-blue-500 w-6 h-6 animate-pulse" />
              ) : (
                <Clock className="text-[#A3A3A3] w-6 h-6" />
              )
            )}
            {booking.booking_status === 'rejected' && <XCircle className="text-red-500 w-6 h-6" />}
            {booking.booking_status === 'expired' && <XCircle className="text-[#737373] w-6 h-6" />}
          </div>
        </div>

        {/* Dynamic status contents */}
        <div className="p-5 sm:p-6 space-y-6">
          {trackingCode && (
            <CopyTrackingCode trackingCode={trackingCode} />
          )}
          {booking.booking_status === 'pending_review' && (
            <div className="p-4 bg-[#171717] border border-[#262626] rounded-lg">
              <p className="text-[#F5F5F5] text-sm sm:text-base leading-relaxed">
                ช่างได้รับคำขอของคุณแล้ว กรุณารอการตรวจสอบและยืนยันคิว
              </p>
            </div>
          )}

          {booking.booking_status === 'rejected' && (
            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-lg space-y-2">
              <p className="text-sm text-red-500/80 font-medium">คำขอจองไม่ได้รับการอนุมัติ</p>
              {booking.rejection_reason && (
                <p className="text-xs text-[#A3A3A3] leading-relaxed">
                  เหตุผล: {booking.rejection_reason}
                </p>
              )}
            </div>
          )}

          {booking.booking_status === 'expired' && (
            <div className="p-4 bg-[#171717] border border-[#262626] rounded-lg">
              <p className="text-[#A3A3A3] text-sm sm:text-base leading-relaxed">
                คำขอนี้หมดอายุแล้ว หากยังต้องการจอง กรุณาส่งคำขอใหม่
              </p>
            </div>
          )}

          {booking.booking_status === 'pending_payment' && (
            <div className="space-y-6">
              {booking.payment_status === 'verification_pending' ? (
                <div className="p-4 bg-[#171717] border border-[#262626] rounded-lg">
                  <p className="text-[#F5F5F5] text-sm sm:text-base leading-relaxed">
                    ได้รับหลักฐานการชำระเงินของคุณแล้ว ทางร้านกำลังตรวจสอบการชำระเงิน
                  </p>
                </div>
              ) : (
                <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
                  <p className="text-[#F5F5F5] text-sm sm:text-base leading-relaxed">
                    ช่างสักรับคำขอของคุณแล้ว กรุณาชำระเงินมัดจำเพื่อล็อกคิวและยืนยันนัดหมาย
                  </p>
                  {booking.payment_deadline && (
                    <p className="text-[#737373] text-sm mt-3">
                      กำหนดชำระ: {formatThaiDate(booking.payment_deadline)} เวลา {formatThaiTime(booking.payment_deadline)} น.
                    </p>
                  )}
                </div>
              )}

              {/* Payment Details */}
              <div className="flex flex-col divide-y divide-[#262626]">
                {booking.agreed_price !== null && booking.agreed_price !== undefined && (
                  <div className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-[#A3A3A3] flex-shrink-0">ราคางานสัก</span>
                    <span className="text-base text-[#F5F5F5] font-medium text-right">฿{Number(booking.agreed_price).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">ยอดชำระมัดจำ</span>
                  <span className="text-lg font-semibold text-[#F5F5F5] text-right">฿{booking.deposit_amount ? Number(booking.deposit_amount).toLocaleString() : '0'}</span>
                </div>
                <div className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">สถานะ</span>
                  <span className="text-sm text-[#F5F5F5] border border-[#262626] bg-[#171717] px-2.5 py-1 rounded-md text-right">
                    {displayPaymentStatus}
                  </span>
                </div>
              </div>

              {booking.payment_status === 'pending' && (
                <div className="pt-4">
                  <hr className="border-[#262626] mb-6" />
                  <InlinePaymentPanel token={token} />
                </div>
              )}
            </div>
          )}

          {booking.booking_status === 'approved' && (
            <div className="space-y-6">
              <div className="p-4 bg-[#171717] border border-[#262626] rounded-lg">
                <p className="text-sm sm:text-base text-[#F5F5F5] leading-relaxed">
                  ยืนยันคิวของคุณเรียบร้อยแล้ว! เจอกันที่ร้านในวันและเวลาดังกล่าว
                </p>
              </div>

              <div className="flex flex-col divide-y divide-[#262626]">
                <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">ช่างสัก</span>
                  <span className="text-sm text-[#F5F5F5] font-medium text-right break-words">{booking.artist_name}</span>
                </div>
                <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">วันนัดหมาย</span>
                  <span className="text-sm text-[#F5F5F5] font-medium text-right">{formatThaiDate(booking.confirmed_start_at)}</span>
                </div>
                <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">เวลานัดหมาย</span>
                  <span className="text-sm text-[#F5F5F5] font-medium text-right">
                    {formatThaiTime(booking.confirmed_start_at)} - {formatThaiTime(booking.confirmed_end_at)} น.
                  </span>
                </div>
                {booking.agreed_price !== null && booking.agreed_price !== undefined && (
                  <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-[#A3A3A3] flex-shrink-0">ราคางานสัก</span>
                    <span className="text-sm text-[#F5F5F5] font-medium text-right">฿{Number(booking.agreed_price).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Details Section */}
          <div className="border-t border-[#262626] pt-6 space-y-4">
            <h3 className="text-base font-semibold text-[#F5F5F5]">รายละเอียดคำขอจอง</h3>
            
            <div className="flex flex-col divide-y divide-[#262626]">
              {booking.submitted_full_name && (
                <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">ผู้จอง</span>
                  <span className="text-sm text-[#F5F5F5] font-medium text-right break-words">{booking.submitted_full_name}</span>
                </div>
              )}
              
              <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                <span className="text-sm text-[#A3A3A3] flex-shrink-0">ช่างสัก</span>
                <span className="text-sm text-[#F5F5F5] font-medium text-right break-words">{booking.artist_name}</span>
              </div>
              
              {booking.tattoo_style && (
                <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">รูปแบบงาน</span>
                  <span className="text-sm text-[#F5F5F5] font-medium text-right break-words">{booking.tattoo_style}</span>
                </div>
              )}
              
              {booking.body_placement && (
                <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3] flex-shrink-0">ตำแหน่ง</span>
                  <span className="text-sm text-[#F5F5F5] font-medium text-right break-words">{booking.body_placement}</span>
                </div>
              )}
              
              <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                <span className="text-sm text-[#A3A3A3] flex-shrink-0">วันที่สะดวก</span>
                <span className="text-sm text-[#F5F5F5] font-medium text-right">{formatThaiDate(booking.requested_start_at)}</span>
              </div>
              
              <div className="flex justify-between items-start gap-4 py-3.5 first:pt-0 last:pb-0">
                <span className="text-sm text-[#A3A3A3] flex-shrink-0">เวลาที่สะดวก</span>
                <span className="text-sm text-[#F5F5F5] font-medium text-right">{formatThaiTime(booking.requested_start_at)} น.</span>
              </div>

              {booking.description && (
                <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm text-[#A3A3A3]">รายละเอียดเพิ่มเติม</span>
                  <p className="text-sm text-[#F5F5F5] bg-[#171717] p-3 rounded-lg border border-[#262626] whitespace-pre-wrap leading-relaxed">
                    {booking.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
