'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandLogo } from '@/components/brand-logo'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { 
  Search, Calendar, User, Clock, CreditCard, ArrowLeft, 
  CheckCircle, AlertCircle, ExternalLink, Scissors, ChevronRight, Phone
} from 'lucide-react'

interface BookingData {
  booking_id: string
  submitted_full_name: string
  submitted_email: string
  submitted_phone: string
  tracking_code: string
  requested_start_at: string
  status: string
  project_name: string
  tattoo_style: string
  color_mode: string
  body_placement: string
  width_cm: number
  height_cm: number
  artist_name: string
  deposit_amount: number | null
  deposit_status: string | null
  public_token: string
  flash_design_id: string | null
  flash_code: string | null
  flash_style: string | null
  agreed_price: number | null
  shop_slug: string
  flash_booking_mode?: string | null
}

function TrackingForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialPhone = searchParams.get('phone') || ''

  const [phone, setPhone] = useState(initialPhone)
  const [bookings, setBookings] = useState<BookingData[]>([])
  const [selectedBooking, setSelectedBooking] = useState<BookingData | null>(null)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const activeShopSlug = selectedBooking?.shop_slug || bookings[0]?.shop_slug || searchParams.get('shop') || searchParams.get('slug') || '157-tattoo'

  const supabase = createClient()

  useEffect(() => {
    if (initialPhone) {
      handleSearch(initialPhone)
    }
  }, [initialPhone])

  const handleSearch = (phoneNum: string) => {
    const trimmed = phoneNum.trim()
    if (!trimmed) return

    setError(null)
    setSearched(false)
    setBookings([])
    setSelectedBooking(null)

    // Update query param in browser history without full reload
    const params = new URLSearchParams(window.location.search)
    params.set('phone', trimmed)
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)

    startTransition(async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('get_public_bookings_by_phone', {
          p_phone: trimmed
        })

        if (rpcErr) {
          console.error('RPC Error:', rpcErr)
          setError('เกิดข้อผิดพลาดในการดึงข้อมูลการจอง กรุณาลองใหม่อีกครั้ง')
          return
        }

        const results = (data || []) as BookingData[]
        setBookings(results)
        setSearched(true)

        if (results.length === 1) {
          setSelectedBooking(results[0])
        }
      } catch (err) {
        console.error('Unexpected tracking search error:', err)
        setError('เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง')
      }
    })
  }

  const mapStatus = (status: string) => {
    switch (status) {
      case 'pending_review':
        if (selectedBooking?.flash_design_id && selectedBooking?.flash_booking_mode === 'price_review_required') {
          return { text: 'รอช่างตรวจสอบและแจ้งราคา', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' }
        }
        return { text: 'รอการตรวจสอบจากร้าน', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' }
      case 'pending_payment':
        return { text: 'รอชำระเงินมัดจำ', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' }
      case 'changes_requested':
        return { text: 'ร้านขอให้แก้ไขข้อมูล', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' }
      case 'approved':
        return { text: 'ยืนยันการจองเรียบร้อยแล้ว', color: 'text-green-400 bg-green-500/10 border-green-500/20' }
      case 'rejected':
        return { text: 'คำขอปฏิเสธ', color: 'text-red-400 bg-red-500/10 border-red-500/20' }
      case 'cancelled':
        return { text: 'ยกเลิกแล้ว', color: 'text-neutral-400 bg-neutral-400/10 border-neutral-400/20' }
      case 'expired':
        return { text: 'คำขอหมดอายุ', color: 'text-neutral-400 bg-neutral-400/10 border-neutral-400/20' }
      default:
        return { text: status, color: 'text-neutral-300 bg-neutral-300/10 border-neutral-300/20' }
    }
  }

  const mapPaymentStatus = (status: string | null) => {
    switch (status) {
      case 'pending':
        return { text: 'ยังไม่ชำระเงิน', color: 'text-neutral-400' }
      case 'verification_pending':
        return { text: 'รอตรวจสอบการชำระเงิน', color: 'text-amber-400' }
      case 'paid':
        return { text: 'ชำระเงินมัดจำสำเร็จ', color: 'text-green-400 font-semibold' }
      case 'failed':
        return { text: 'การชำระเงินล้มเหลว', color: 'text-red-400' }
      default:
        return { text: 'ยังไม่ได้ชำระมัดจำ', color: 'text-neutral-400' }
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' น.'
    } catch {
      return dateStr
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F3F3F3] pb-16">
      {/* Header Bar */}
      <header className="h-16 border-b border-[#262626] bg-[#0A0A0A]/85 backdrop-blur-sm px-4 md:px-8 flex items-center justify-between sticky top-0 z-50">
        <a href={`/shop/${activeShopSlug}`} className="flex items-center gap-2 hover:opacity-85 transition-opacity">
          <BrandLogo />
        </a>
        <a 
          href={`/shop/${activeShopSlug}`}
          className="text-xs text-[#9CA3AB] hover:text-[#FFFFFF] transition-colors font-medium border border-[#262626] rounded-md px-3 py-1.5 bg-[#171717]"
        >
          กลับหน้าร้าน
        </a>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-8 md:pt-12">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#F3F3F3] tracking-tight">ติดตามสถานะการจอง</h1>
          <p className="text-xs text-[#9CA3AB] mt-2">กรอกเบอร์โทรศัพท์ที่คุณใช้ในขั้นตอนการส่งคำขอจองคิวสัก</p>
        </div>

        {/* Search Field */}
        <form 
          onSubmit={(e) => {
            e.preventDefault()
            handleSearch(phone)
          }}
          className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6 mb-8 flex flex-col sm:flex-row gap-3 shadow-md"
        >
          <div className="relative flex-1">
            <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#737373]" />
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="กรอกเบอร์โทรศัพท์ (เช่น 0812345678)"
              className="w-full bg-[#262626] border border-[#262626] rounded-md pl-10 pr-4 py-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black font-semibold text-sm px-6 py-3 rounded-md transition-all flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(255,255,255,0.1)] disabled:opacity-50"
          >
            {isPending ? (
              <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search size={16} />
            )}
            ตรวจสอบสถานะ
          </button>
        </form>

        {/* Error Notification */}
        {error && (
          <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-4 rounded-xl text-sm mb-6 flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Searched & Empty Result */}
        {searched && bookings.length === 0 && !isPending && (
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-8 text-center text-[#A3A3A3] shadow-md">
            <AlertCircle size={36} className="mx-auto mb-3 text-amber-500/70" />
            <p className="text-sm">ไม่พบรายการจองสำหรับเบอร์โทรศัพท์นี้</p>
            <p className="text-xs text-[#737373] mt-1.5">หากคุณเพิ่งจองคิว หรือระบุข้อมูลไม่ถูกต้อง กรุณาติดต่อทางร้านโดยตรง</p>
          </div>
        )}

        {/* Bookings List (Multiple) */}
        {searched && bookings.length > 1 && !selectedBooking && (
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-[#A3A3A3] uppercase tracking-wider mb-2">
              รายการจองทั้งหมดที่เกี่ยวข้อง ({bookings.length} รายการ)
            </h2>
            <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden divide-y divide-[#262626]">
              {bookings.map((b) => {
                const statusMeta = mapStatus(b.status)
                return (
                  <button
                    key={b.booking_id}
                    onClick={() => setSelectedBooking(b)}
                    className="w-full text-left p-4 hover:bg-[#202020] transition-colors flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-[#737373] flex items-center gap-1.5">
                        <Calendar size={12} />
                        {formatDate(b.requested_start_at)}
                      </div>
                      <div className="text-sm font-bold text-[#F3F3F3]">
                        ช่าง: {b.artist_name || 'ไม่ระบุช่าง'} ({b.project_name || 'งานสัก'})
                      </div>
                      <div className="text-[11px] text-[#A3A3A3]">
                        รหัสอ้างอิง: {b.tracking_code}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full border ${statusMeta.color} font-medium`}>
                        {statusMeta.text}
                      </span>
                      <ChevronRight size={16} className="text-[#737373]" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Selected Booking Detail Display */}
        {selectedBooking && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Back Button if multiple bookings found */}
            {bookings.length > 1 && (
              <button
                onClick={() => setSelectedBooking(null)}
                className="flex items-center gap-1.5 text-xs text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors font-medium cursor-pointer"
              >
                <ArrowLeft size={14} />
                กลับไปเลือกรายการจอง
              </button>
            )}

            <div className="bg-[#171717] border border-[#262626] rounded-xl shadow-md overflow-hidden">
              {/* Header Box */}
              <div className="bg-[#202020] px-6 py-5 border-b border-[#262626] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-[#A3A3A3] font-semibold tracking-wider uppercase mb-1">สถานะการจองล่าสุด</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-3 py-1.5 rounded-full border ${mapStatus(selectedBooking.status).color} font-bold`}>
                      {mapStatus(selectedBooking.status).text}
                    </span>
                  </div>
                </div>
                
                <div className="text-left md:text-right">
                  <div className="text-[11px] text-[#737373] uppercase tracking-wider font-semibold">รหัสอ้างอิงการติดตาม</div>
                  <div className="text-sm font-bold text-[#FFFFFF] font-mono tracking-wide">{selectedBooking.tracking_code}</div>
                </div>
              </div>

              {/* Booking & Tattoo Details */}
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Left Column: Schedule & Artist */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-[#A3A3A3] uppercase tracking-wider pb-1.5 border-b border-[#262626]/60">
                      ตารางเวลาและช่างสัก
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Calendar size={16} className="text-[#A3A3A3] shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[11px] text-[#737373]">วันที่และเวลาจอง</div>
                          <div className="text-sm font-semibold">{formatDate(selectedBooking.requested_start_at)}</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <User size={16} className="text-[#A3A3A3] shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[11px] text-[#737373]">ช่างสักผู้ให้บริการ</div>
                          <div className="text-sm font-semibold">{selectedBooking.artist_name || 'ไม่ระบุช่าง'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Tattoo details */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-[#A3A3A3] uppercase tracking-wider pb-1.5 border-b border-[#262626]/60">
                      รายละเอียดงานสัก
                    </h3>
                    <div className="space-y-3">
                      {selectedBooking.flash_design_id ? (
                        <>
                          <div className="flex items-start gap-3">
                            <Scissors size={16} className="text-[#A3A3A3] shrink-0 mt-0.5" />
                            <div>
                              <div className="text-[11px] text-[#737373]">งาน Flash</div>
                              <div className="text-sm font-semibold">{selectedBooking.flash_code}</div>
                            </div>
                          </div>

                          {selectedBooking.flash_style && (
                            <div className="flex items-start gap-3">
                              <div className="w-4 shrink-0" />
                              <div>
                                <div className="text-[11px] text-[#737373]">สไตล์</div>
                                <div className="text-sm font-semibold">{selectedBooking.flash_style}</div>
                              </div>
                            </div>
                          )}

                          <div className="flex items-start gap-3">
                            <div className="w-4 shrink-0" />
                            <div>
                              <div className="text-[11px] text-[#737373]">ตำแหน่ง</div>
                              <div className="text-sm font-semibold">{selectedBooking.body_placement || '-'}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-start gap-3">
                          <Scissors size={16} className="text-[#A3A3A3] shrink-0 mt-0.5" />
                          <div>
                            <div className="text-[11px] text-[#737373]">ข้อมูลงาน / ลายสัก</div>
                            <div className="text-sm font-semibold">
                              {selectedBooking.project_name} 
                              {selectedBooking.tattoo_style && ` (${selectedBooking.tattoo_style})`}
                            </div>
                            <div className="text-[11px] text-[#A3A3A3] mt-0.5">
                              โทนสี: {selectedBooking.color_mode === 'color' ? 'สี' : 'ขาวดำ'} | ตำแหน่ง: {selectedBooking.body_placement}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <Clock size={16} className="text-[#A3A3A3] shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[11px] text-[#737373]">ขนาด</div>
                          <div className="text-sm font-semibold">
                            {selectedBooking.width_cm && selectedBooking.height_cm 
                              ? `กว้าง ${selectedBooking.width_cm} ซม. × ยาว ${selectedBooking.height_cm} ซม.`
                              : 'อิงตามขนาดดีไซน์'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Deposit & Payment Section */}
                <div className="mt-8 pt-6 border-t border-[#262626] space-y-4">
                  <h3 className="text-xs font-bold text-[#A3A3A3] uppercase tracking-wider pb-1.5 border-b border-[#262626]/60">
                    ข้อมูลมัดจำและการชำระเงิน
                  </h3>

                  <div className="bg-[#202020] rounded-xl p-4 space-y-3.5">
                    {selectedBooking.flash_design_id && (
                      <div className="flex items-center gap-3">
                        <Scissors size={18} className="text-[#A3A3A3] shrink-0" />
                        <div>
                          <div className="text-xs text-[#737373]">ราคางานสัก</div>
                          <div className="text-base font-bold text-[#FFFFFF]">
                            {selectedBooking.agreed_price !== null 
                              ? `฿${selectedBooking.agreed_price.toLocaleString('th-TH')}`
                              : 'รอช่างประเมินราคา'}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${selectedBooking.flash_design_id ? 'border-t border-[#262626] pt-3.5' : ''}`}>
                      <div className="flex items-center gap-3">
                        <CreditCard size={18} className="text-[#A3A3A3] shrink-0" />
                        <div>
                          <div className="text-xs text-[#737373]">ยอดมัดจำ</div>
                          <div className="text-base font-bold text-[#FFFFFF]">
                            {selectedBooking.deposit_amount !== null
                              ? `฿${selectedBooking.deposit_amount.toLocaleString('th-TH')}`
                              : (selectedBooking.flash_design_id ? '฿500' : 'รอแจ้งราคา')}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:items-end">
                        <div className="text-xs text-[#737373]">สถานะการชำระเงิน</div>
                        <span className={`text-sm ${
                          selectedBooking.flash_booking_mode === 'price_review_required' && selectedBooking.agreed_price === null
                            ? 'text-amber-500'
                            : mapPaymentStatus(selectedBooking.deposit_status).color
                        }`}>
                          {selectedBooking.flash_booking_mode === 'price_review_required' && selectedBooking.agreed_price === null
                            ? 'รอแจ้งราคากลางก่อนชำระเงิน'
                            : mapPaymentStatus(selectedBooking.deposit_status).text}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment call-to-action button if pending_payment */}
                  {selectedBooking.status === 'pending_payment' && selectedBooking.agreed_price !== null && (
                    <div className="pt-2">
                      <a
                        href={`/payment/${selectedBooking.public_token}`}
                        className="w-full py-3 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black font-semibold text-sm rounded-md transition-all flex items-center justify-center gap-2 shadow-[0_4px_15px_rgba(255,255,255,0.15)]"
                      >
                        แนบหลักฐานการชำระเงินมัดจำ
                        <ExternalLink size={14} />
                      </a>
                      <p className="text-[11px] text-[#A3A3A3] text-center mt-2 leading-relaxed">
                        *กรุณาโอนเงินมัดจำและส่งหลักฐานเพื่อจองคิวให้สมบูรณ์
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#F3F3F3]">Loading...</div>}>
      <TrackingForm />
    </Suspense>
  )
}
