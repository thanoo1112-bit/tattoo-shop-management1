'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { optimizeBookingReferenceImage } from '@/lib/imageOptimization'
import { UploadCloud, Image as ImageIcon, XCircle, AlertCircle, Clock, CheckCircle2 } from 'lucide-react'
import { formatThaiDate, formatThaiDateTime, formatThaiTime } from '@/lib/dateUtils'

interface PaymentDetails {
  shop_name: string
  artist_display_name: string
  booking_status: string
  payment_status: string
  deposit_amount: number
  currency: string
  confirmed_start_at: string
  confirmed_end_at: string
  payment_deadline: string | null
  can_upload_proof: boolean
  payment_qr_path: string | null
  
  // Optional fields that may not be returned by current RPC
  tattoo_price?: number
  customer_name?: string
  customer_phone?: string
  style?: string
  color?: string
  work_type?: string
  placement?: string
  width_cm?: number
  height_cm?: number
  flash_code?: string
  flash_image_path?: string
  reference_images?: string[]
}

export function PaymentPageClient({ token }: { token: string }) {
  const [details, setDetails] = useState<PaymentDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Countdown state
  const [timeLeft, setTimeLeft] = useState<string>('')
  const [isExpired, setIsExpired] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [flashImageUrl, setFlashImageUrl] = useState<string | null>(null)

  const supabase = createClient()

  const fetchDetails = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_public_payment_details', {
        p_public_token: token,
      })

      if (rpcError) throw rpcError
      if (!data) throw new Error('Invalid token')

      const typedData = data as PaymentDetails
      setDetails(typedData)
      
      if (typedData.payment_qr_path) {
        const { data: publicUrlData } = supabase.storage
          .from('shop-payment-qr')
          .getPublicUrl(typedData.payment_qr_path)
        // Cache-bust so CDN doesn't serve stale QR image after owner updates it
        const sep = publicUrlData.publicUrl.includes('?') ? '&' : '?'
        setQrUrl(`${publicUrlData.publicUrl}${sep}v=${Date.now()}`)
      } else {
        setQrUrl(null)
      }

      if (typedData.flash_image_path) {
        const { data: publicUrlData } = supabase.storage
          .from('flash-images')
          .getPublicUrl(typedData.flash_image_path)
        setFlashImageUrl(publicUrlData.publicUrl)
      } else {
        setFlashImageUrl(null)
      }
    } catch (err: any) {
      console.log('Error fetching payment details:', err)
      setError('ไม่พบข้อมูล หรือเซสชันนี้ไม่ถูกต้อง')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Countdown effect
  useEffect(() => {
    if (!details?.payment_deadline || !details.can_upload_proof) return

    const deadline = new Date(details.payment_deadline).getTime()

    const updateTimer = () => {
      const now = new Date().getTime()
      const diff = deadline - now

      if (diff <= 0) {
        setIsExpired(true)
        setTimeLeft('หมดเวลาแล้ว')
        fetchDetails()
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      setTimeLeft(`เหลือเวลา ${hours} ชม. ${minutes} นาที`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.payment_deadline, details?.can_upload_proof])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      if (!selectedFile.type.startsWith('image/')) {
        setSubmitError('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
        return
      }
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
      setSubmitError(null)
    }
  }

  const clearFile = () => {
    setFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!file) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const optimizedFile = await optimizeBookingReferenceImage(file)

      const { data: sessionData, error: sessionError } = await supabase.rpc(
        'create_public_payment_upload_session',
        { p_public_token: token }
      )

      if (sessionError) {
        throw new Error(sessionError.message || 'ไม่สามารถสร้างเซสชันการอัปโหลดได้')
      }

      const { storage_path } = sessionData as any

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(storage_path, optimizedFile, { upsert: false })

      if (uploadError) {
        throw new Error('ไม่สามารถอัปโหลดสลิปได้ กรุณาลองใหม่อีกครั้ง')
      }

      const { error: finalizeError } = await supabase.rpc('submit_public_payment_slip', {
        p_public_token: token,
        p_storage_path: storage_path,
      })

      if (finalizeError) {
        throw new Error(finalizeError.message || 'ไม่สามารถส่งหลักฐานได้')
      }

      await fetchDetails()
    } catch (err: any) {
      console.log('Submit error:', err)
      const msg = err.message || 'ไม่สามารถส่งหลักฐานการชำระเงินได้ กรุณาลองใหม่อีกครั้ง'
      
      if (msg.includes('expired') || msg.includes('หมดอายุ')) {
        setSubmitError('เวลาสำหรับชำระเงินหมดลงแล้ว หรือเซสชันหมดอายุ')
      } else {
        setSubmitError(msg)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20 text-[#9EA4AA]">
        กำลังโหลดข้อมูล...
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="bg-[#121212] border border-[#262626] rounded-xl p-8 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-[#737373] mx-auto" />
        <h2 className="text-lg font-medium text-[#F5F5F5]">เกิดข้อผิดพลาด</h2>
        <p className="text-[#A3A3A3]">{error}</p>
      </div>
    )
  }

  const isExpiredState =
    details.booking_status === 'expired' ||
    (!details.can_upload_proof && details.payment_status === 'pending') ||
    isExpired

  const isFailedTerminal =
    (details.payment_status === 'failed' && details.booking_status !== 'pending_payment') ||
    details.booking_status === 'rejected' ||
    details.booking_status === 'cancelled'

  const isPaid =
    details.payment_status === 'paid' || details.booking_status === 'approved'

  const isVerificationPending = details.payment_status === 'verification_pending'

  // Header status display
  let statusText = 'รอชำระมัดจำ'
  let statusColor = 'text-amber-500 bg-amber-500/10 border-amber-500/20'

  if (isPaid) {
    statusText = 'ชำระเงินยืนยันแล้ว'
    statusColor = 'text-green-500 bg-green-500/10 border-green-500/20'
  } else if (isVerificationPending) {
    statusText = 'รอตรวจสอบการชำระเงิน'
    statusColor = 'text-blue-500 bg-blue-500/10 border-blue-500/20'
  } else if (details.payment_status === 'failed' && details.booking_status === 'pending_payment') {
    statusText = 'หลักฐานการชำระเงินไม่ถูกต้อง'
    statusColor = 'text-red-500 bg-red-500/10 border-red-500/20'
  } else if (isExpiredState) {
    statusText = 'หมดเวลาชำระเงิน'
    statusColor = 'text-red-500 bg-red-500/10 border-red-500/20'
  } else if (isFailedTerminal) {
    statusText = 'ชำระเงินไม่สำเร็จ/ยกเลิก'
    statusColor = 'text-red-500 bg-red-500/10 border-red-500/20'
  }

  return (
    <div className="w-full space-y-6">
      
      {/* STATUS HEADER CARD */}
      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-[#737373] font-semibold">สถานะการจอง</h2>
          <div className="text-lg font-bold text-white mt-0.5">{details.shop_name}</div>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${statusColor}`}>
          {statusText}
        </span>
      </div>

      {/* MAIN 2-COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Booking Details (lg:col-span-5) */}
        <div className="lg:col-span-5 bg-[#121212] border border-[#262626] rounded-2xl p-6 space-y-6 shadow-xl">
          <h3 className="text-base font-semibold text-white border-b border-[#262626] pb-2.5 uppercase tracking-wide">
            รายละเอียดการจอง
          </h3>

          {/* Flash Image */}
          {flashImageUrl && (
            <div className="relative aspect-square w-full bg-[#0A0A0A] flex items-center justify-center p-3 rounded-xl border border-[#262626]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={flashImageUrl}
                alt={details.flash_code || "Flash Design"}
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
          )}

          {/* Booking Info List */}
          <div className="space-y-4 text-sm text-[#A3A3A3]">
            {details.flash_code && (
              <div className="flex justify-between border-b border-[#1C1C1C] pb-2">
                <span>รหัสแบบ</span>
                <span className="text-white font-medium">{details.flash_code}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-[#1C1C1C] pb-2">
              <span>ช่างสัก</span>
              <span className="text-white font-medium">{details.artist_display_name}</span>
            </div>
            {details.style && (
              <div className="flex justify-between border-b border-[#1C1C1C] pb-2">
                <span>สไตล์</span>
                <span className="text-white font-medium">{details.style}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-[#1C1C1C] pb-2">
              <span>ขนาด</span>
              <span className="text-white font-medium">
                {details.width_cm && details.height_cm 
                  ? `${details.width_cm} × ${details.height_cm} ซม.` 
                  : 'ขนาดตามแบบเดิม'}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#1C1C1C] pb-2">
              <span>ตำแหน่งที่สัก</span>
              <span className="text-white font-medium">{details.placement || '-'}</span>
            </div>
            <div className="flex justify-between border-b border-[#1C1C1C] pb-2">
              <span>วันที่จองคิว</span>
              <span className="text-white font-medium">
                {formatThaiDate(details.confirmed_start_at, { longMonth: true })}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#1C1C1C] pb-2">
              <span>เวลา</span>
              <span className="text-white font-medium">
                {formatThaiTime(details.confirmed_start_at)} น.
              </span>
            </div>
            
            <div className="pt-2 space-y-2">
              <div className="flex justify-between text-sm">
                <span>ราคางานสักทั้งหมด</span>
                <span className="text-white font-semibold">
                  {details.tattoo_price ? `฿${details.tattoo_price.toLocaleString()}` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>ยอดเงินมัดจำ</span>
                <span className="text-amber-500 font-bold">
                  ฿{details.deposit_amount.toLocaleString()}
                </span>
              </div>
            </div>

            <hr className="border-[#262626]" />

            <div className="space-y-3 pt-2">
              <div className="flex justify-between">
                <span>ผู้จอง</span>
                <span className="text-white font-medium">{details.customer_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>เบอร์โทรศัพท์</span>
                <span className="text-white font-medium">{details.customer_phone || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Payment section (lg:col-span-7) */}
        <div className="lg:col-span-7 bg-[#121212] border border-[#262626] rounded-2xl p-6 space-y-6 shadow-xl text-center">
          <h3 className="text-base font-semibold text-white border-b border-[#262626] pb-2.5 uppercase tracking-wide text-left">
            ชำระเงินมัดจำ
          </h3>

          {/* Amount Box */}
          <div className="bg-[#171717] border border-[#262626] rounded-xl py-5 px-6 space-y-1">
            <span className="text-xs text-[#737373] uppercase tracking-wider block">ยอดที่ต้องชำระ</span>
            <span className="text-3xl font-extrabold text-amber-500 block">
              ฿{details.deposit_amount.toLocaleString()}
            </span>
            {details.payment_deadline && !isPaid && !isVerificationPending && (
              <span className="text-xs text-red-400 block pt-1 animate-pulse">
                {timeLeft}
              </span>
            )}
          </div>

          {/* DYNAMIC PAYMENT VIEW BASED ON STATE */}
          {isPaid ? (
            <div className="py-8 space-y-4">
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto text-green-500">
                <CheckCircle2 size={36} />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-white">ชำระเงินมัดจำเรียบร้อยแล้ว</h4>
                <p className="text-xs text-[#A3A3A3] max-w-sm mx-auto">
                  ระบบได้รับการยืนยันการชำระเงินมัดจำเรียบร้อยแล้ว คิวของคุณได้รับการยืนยันการสักแล้ว!
                </p>
              </div>
              <div className="pt-4">
                <a
                  href="/track"
                  className="inline-block py-3 px-8 bg-white hover:bg-neutral-200 text-black font-semibold rounded-xl text-sm transition-all"
                >
                  ดูสถานะการจอง
                </a>
              </div>
            </div>
          ) : isVerificationPending ? (
            <div className="py-8 space-y-4">
              <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-blue-500 animate-pulse">
                <Clock size={36} />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-white">ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว</h4>
                <p className="text-xs text-[#A3A3A3] max-w-sm mx-auto">
                  ร้านกำลังดำเนินการตรวจสอบสลิปการโอนเงินมัดจำของคุณ กรุณาร้านตรวจสอบ
                </p>
              </div>
              <div className="pt-4">
                <a
                  href="/track"
                  className="inline-block py-3 px-8 bg-white hover:bg-neutral-200 text-black font-semibold rounded-xl text-sm transition-all animate-in fade-in duration-200"
                >
                  ดูสถานะการจอง
                </a>
              </div>
            </div>
          ) : isExpiredState ? (
            <div className="py-8 space-y-4">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
                <Clock size={36} />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-white">หมดเวลาชำระเงิน</h4>
                <p className="text-xs text-[#A3A3A3] max-w-sm mx-auto">
                  ระยะเวลาชำระมัดจำ 24 ชั่วโมงของคำขอนี้หมดอายุแล้ว กรุณาติดต่อช่างสักหรือสาขาเพื่อจัดนัดหมายใหม่
                </p>
              </div>
            </div>
          ) : isFailedTerminal ? (
            <div className="py-8 space-y-4">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500">
                <XCircle size={36} />
              </div>
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-white">การจองถูกปฏิเสธหรือยกเลิก</h4>
                <p className="text-xs text-[#A3A3A3] max-w-sm mx-auto">
                  คำขอจองคิวนี้ไม่สามารถทำรายการชำระเงินได้แล้วเนื่องจากถูกปฏิเสธหรือยกเลิก
                </p>
              </div>
            </div>
          ) : (
            /* ACTIVE QR CODE + SLIP UPLOAD VIEW */
            <div className="space-y-6">
              {details.payment_status === 'failed' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-left">
                  <h4 className="text-sm font-bold text-red-400 mb-1 flex items-center gap-1.5">
                    <AlertCircle size={16} />
                    หลักฐานการชำระเงินไม่ถูกต้อง
                  </h4>
                  <p className="text-xs text-[#A3A3A3] leading-relaxed">
                    กรุณาตรวจสอบข้อมูลการโอนและส่งหลักฐานการชำระเงินใหม่
                  </p>
                </div>
              )}
              
              {/* QR Code */}
              <div className="flex flex-col items-center justify-center space-y-3">
                {qrUrl ? (
                  <>
                    <div className="rounded-2xl border border-[#262626] bg-white p-3 overflow-hidden shadow-xl max-w-[260px] w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrUrl}
                        alt={`${details.shop_name} Payment QR Code`}
                        className="w-full h-auto object-contain aspect-square"
                      />
                    </div>
                    <p className="text-xs text-[#A3A3A3] max-w-xs leading-relaxed">
                      กรุณาสแกน QR Code เพื่อชำระเงินมัดจำตามยอดที่ระบุ
                    </p>
                  </>
                ) : (
                  <div className="w-full py-8 space-y-2 border border-[#262626] rounded-xl bg-[#171717]">
                    <AlertCircle className="w-8 h-8 text-[#737373] mx-auto" />
                    <p className="text-[#F5F5F5] font-semibold text-sm">ยังไม่ได้ตั้งค่า QR Code รับเงิน</p>
                    <p className="text-xs text-[#737373]">กรุณาติดต่อสาขาโดยตรงเพื่อชำระเงิน</p>
                  </div>
                )}
              </div>

              <hr className="border-[#262626]" />

              {/* Upload area */}
              <div className="space-y-4 text-left">
                <h4 className="text-xs uppercase tracking-widest text-[#737373] font-semibold">
                  แนบหลักฐานการชำระเงิน
                </h4>

                <input
                  type="file"
                  accept="image/jpeg, image/png, image/webp"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  disabled={isSubmitting || !qrUrl}
                />

                {!file ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || !qrUrl}
                    className="w-full border border-dashed border-[#262626] rounded-xl p-8 flex flex-col items-center justify-center text-[#A3A3A3] hover:text-[#F5F5F5] hover:border-[#404040] hover:bg-[#171717] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <UploadCloud className="w-6 h-6 mb-2 text-amber-500" />
                    <span className="font-semibold text-sm">คลิกเพื่ออัปโหลดสลิป</span>
                    <span className="text-[10px] text-[#737373] mt-1">ไฟล์ JPG, PNG หรือ WebP เท่านั้น</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="relative rounded-xl border border-[#262626] bg-[#171717] p-3 flex items-center gap-4">
                      <div className="w-12 h-12 rounded overflow-hidden bg-[#121212] flex-shrink-0 flex items-center justify-center">
                        {previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt="Slip preview" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-[#737373]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{file.name}</p>
                        <p className="text-xs text-[#737373]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <div className="flex items-center gap-3 pr-1 text-xs font-semibold">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isSubmitting || !qrUrl}
                          className="text-amber-500 hover:underline disabled:opacity-50"
                        >
                          เปลี่ยน
                        </button>
                        <button
                          onClick={clearFile}
                          disabled={isSubmitting || !qrUrl}
                          className="text-[#737373] hover:text-white disabled:opacity-50"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>

                    {submitError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs flex gap-2 items-start">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{submitError}</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !qrUrl || !file}
                  className="w-full py-3 h-[48px] bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 disabled:bg-[#1C1C1C] disabled:text-[#404040] disabled:cursor-not-allowed transition-all shadow-[0_4px_15px_rgba(255,255,255,0.05)] cursor-pointer flex items-center justify-center"
                >
                  {isSubmitting ? 'กำลังดำเนินการ...' : 'ส่งหลักฐานการชำระเงิน'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
