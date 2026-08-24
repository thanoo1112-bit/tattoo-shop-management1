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
  style?: string
  color?: string
  work_type?: string
  placement?: string
  width_cm?: number
  height_cm?: number
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
    details.payment_status === 'failed' ||
    details.booking_status === 'rejected' ||
    details.booking_status === 'cancelled'

  const isPaid =
    details.payment_status === 'paid' || details.booking_status === 'approved'

  const isVerificationPending = details.payment_status === 'verification_pending'

  const isPendingPayable = details.booking_status === 'pending_payment' && details.payment_status === 'pending' && details.can_upload_proof && !isExpiredState

  const renderTerminalState = (title: string, message: string, icon: React.ReactNode) => (
    <div className="bg-[#121212] border border-[#262626] rounded-xl p-8 text-center space-y-4">
      <div className="flex justify-center">{icon}</div>
      <h2 className="text-lg font-medium text-[#F5F5F5]">{title}</h2>
      <p className="text-[#A3A3A3]">{message}</p>
    </div>
  )

  if (isFailedTerminal) {
    return renderTerminalState(
      'การชำระเงินไม่ผ่าน หรือคำขอนี้ถูกยกเลิกแล้ว',
      'คำขอนี้ไม่สามารถชำระเงินได้แล้ว กรุณาติดต่อช่างสักเพื่อตรวจสอบ',
      <XCircle className="w-12 h-12 text-[#737373]" />
    )
  }

  if (isExpiredState) {
    return renderTerminalState(
      'หมดเวลาชำระเงิน',
      'เวลาสำหรับยืนยันคิวนี้หมดลงแล้ว กรุณาติดต่อร้านหรือช่างเพื่อจัดคิวใหม่',
      <Clock className="w-12 h-12 text-[#737373]" />
    )
  }

  if (isPaid) {
    return renderTerminalState(
      'ชำระเงินมัดจำแล้ว',
      'คิวได้รับการยืนยันแล้ว',
      <CheckCircle2 className="w-12 h-12 text-[#737373]" />
    )
  }

  if (isVerificationPending) {
    return renderTerminalState(
      'ส่งหลักฐานแล้ว',
      'ร้านกำลังตรวจสอบการชำระเงินของคุณ',
      <Clock className="w-12 h-12 text-[#737373]" />
    )
  }

  if (!isPendingPayable) {
    return renderTerminalState(
      'สถานะไม่พร้อมชำระเงิน',
      'รายการนี้ยังไม่พร้อมหรือถูกดำเนินการไปแล้ว',
      <AlertCircle className="w-12 h-12 text-[#737373]" />
    )
  }

  const workFormat = [details.style, details.color, details.work_type].filter(Boolean).join(' • ')

  return (
    <div className="max-w-[720px] mx-auto w-full px-4 sm:px-0 py-6">
      <div className="bg-[#121212] border border-[#262626] rounded-xl overflow-hidden w-full">
        <div className="px-5 sm:px-6 py-5 border-b border-[#262626]">
          <h1 className="text-xl font-medium text-[#F5F5F5]">รอชำระเงินมัดจำ</h1>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Intro Message */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4">
            <p className="text-[#F5F5F5] text-sm sm:text-base leading-relaxed">
              ช่างสักรับคำขอของคุณแล้ว กรุณาชำระเงินมัดจำเพื่อล็อกคิวและยืนยันนัดหมาย
            </p>
            {details.payment_deadline && (
              <p className="text-[#737373] text-sm mt-3">
                กำหนดชำระ: {formatThaiDate(details.payment_deadline)} เวลา {formatThaiTime(details.payment_deadline)} น.
              </p>
            )}
          </div>

          <hr className="border-[#262626]" />

          {/* Payment Summary */}
          <div className="space-y-4">
            {details.tattoo_price !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#A3A3A3]">ราคางานสัก</span>
                <span className="text-base text-[#F5F5F5]">฿{details.tattoo_price.toLocaleString()}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#A3A3A3]">ยอดชำระมัดจำ</span>
              <span className="text-lg font-semibold text-[#F5F5F5]">฿{details.deposit_amount.toLocaleString()}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-[#A3A3A3]">สถานะ</span>
              <span className="text-sm text-[#F5F5F5] border border-[#262626] bg-[#171717] px-2.5 py-1 rounded-md">
                รอการชำระเงิน
              </span>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="pt-2 pb-2">
            {qrUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-xl border border-[#262626] overflow-hidden w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={qrUrl} 
                    alt={`${details.shop_name} Payment QR Code`} 
                    className="block w-auto h-auto max-w-[280px] max-h-[320px] sm:max-w-[300px] sm:max-h-[340px]"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-2 border border-[#262626] rounded-lg bg-[#171717]">
                <AlertCircle className="w-8 h-8 text-[#737373] mx-auto" />
                <p className="text-[#F5F5F5] font-medium text-sm">ร้านยังไม่ได้ตั้งค่า QR รับเงิน</p>
                <p className="text-xs text-[#A3A3A3]">กรุณาติดต่อร้านก่อนชำระเงิน</p>
              </div>
            )}
          </div>

          {/* Upload Section */}
          <div className="space-y-4">
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
                className="w-full border border-dashed border-[#262626] rounded-lg p-6 flex flex-col items-center justify-center text-[#A3A3A3] hover:text-[#F5F5F5] hover:border-[#404040] hover:bg-[#171717] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadCloud className="w-6 h-6 mb-2" />
                <span className="font-medium text-sm">แนบสลิปการชำระเงิน</span>
              </button>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-lg border border-[#262626] bg-[#171717] p-2 flex items-center gap-4">
                  <div className="w-12 h-12 rounded overflow-hidden bg-[#121212] flex-shrink-0 flex items-center justify-center">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="Slip preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-[#737373]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F5F5F5] truncate">{file.name}</p>
                    <p className="text-xs text-[#737373]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <div className="flex flex-col gap-1 pr-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSubmitting || !qrUrl}
                      className="text-xs text-[#A3A3A3] hover:text-[#F5F5F5] disabled:opacity-50"
                    >
                      เปลี่ยน
                    </button>
                    <button
                      onClick={clearFile}
                      disabled={isSubmitting || !qrUrl}
                      className="text-xs text-[#A3A3A3] hover:text-[#F5F5F5] disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </div>
                </div>

                {submitError && (
                  <div className="p-3 bg-[#171717] border border-[#262626] rounded-lg text-[#F5F5F5] text-sm flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#737373]" />
                    <span>{submitError}</span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !qrUrl || !file}
              className="w-full py-3 h-[48px] bg-[#F5F5F5] text-[#0A0A0A] font-medium rounded-md hover:bg-[#E5E5E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'กำลังดำเนินการ...' : 'ชำระเงินมัดจำ'}
            </button>
          </div>

          <hr className="border-[#262626]" />

          {/* Booking Details Section */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-[#F5F5F5]">รายละเอียดคำขอจอง</h3>
            
            <div className="space-y-3">
              {details.customer_name && (
                <div>
                  <p className="text-xs text-[#A3A3A3] mb-1">ผู้จอง</p>
                  <p className="text-sm text-[#F5F5F5]">{details.customer_name}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-[#A3A3A3] mb-1">ช่างสัก</p>
                <p className="text-sm text-[#F5F5F5]">{details.artist_display_name}</p>
              </div>

              {workFormat && (
                <div>
                  <p className="text-xs text-[#A3A3A3] mb-1">รูปแบบงาน</p>
                  <p className="text-sm text-[#F5F5F5]">{workFormat}</p>
                </div>
              )}

              {details.placement && (
                <div>
                  <p className="text-xs text-[#A3A3A3] mb-1">ตำแหน่ง</p>
                  <p className="text-sm text-[#F5F5F5]">{details.placement}</p>
                </div>
              )}

              {(details.width_cm !== undefined || details.height_cm !== undefined) && (
                <div className="grid grid-cols-2 gap-4">
                  {details.width_cm !== undefined && (
                    <div>
                      <p className="text-xs text-[#A3A3A3] mb-1">ความกว้าง</p>
                      <p className="text-sm text-[#F5F5F5]">{details.width_cm} ซม.</p>
                    </div>
                  )}
                  {details.height_cm !== undefined && (
                    <div>
                      <p className="text-xs text-[#A3A3A3] mb-1">ความยาว</p>
                      <p className="text-sm text-[#F5F5F5]">{details.height_cm} ซม.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[#A3A3A3] mb-1">วันที่สะดวก</p>
                  <p className="text-sm text-[#F5F5F5]">{formatThaiDate(details.confirmed_start_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#A3A3A3] mb-1">เวลาที่สะดวก</p>
                  <p className="text-sm text-[#F5F5F5]">{formatThaiTime(details.confirmed_start_at)} น.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
