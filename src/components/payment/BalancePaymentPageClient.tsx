'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { optimizeBookingReferenceImage } from '@/lib/imageOptimization'
import { UploadCloud, Image as ImageIcon, XCircle, AlertCircle, CheckCircle2, Clock } from 'lucide-react'

interface BalancePaymentDetails {
  payment_type: string
  amount: number
  payment_status: string
  shop_display_name?: string
  payment_qr_path: string | null
  can_upload_proof: boolean
}

export function BalancePaymentPageClient({ token }: { token: string }) {
  const [details, setDetails] = useState<BalancePaymentDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  useEffect(() => {
    async function loadDetails() {
      try {
        const { data, error } = await supabase.rpc('get_public_balance_payment_details', {
          p_token: token
        })

        if (error) {
          console.error(error)
          setError('ไม่พบรายการชำระเงิน หรือลิงก์ไม่ถูกต้อง')
          setIsLoading(false)
          return
        }

        if (!data) {
          setError('ไม่พบรายการชำระเงิน')
          setIsLoading(false)
          return
        }

        const pd = data as unknown as BalancePaymentDetails
        setDetails(pd)

        if (pd.payment_qr_path) {
          const { data: qrData } = supabase.storage.from('public-assets').getPublicUrl(pd.payment_qr_path)
          setQrUrl(qrData.publicUrl)
        }
      } catch (err) {
        console.error(err)
        setError('ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง')
      } finally {
        setIsLoading(false)
      }
    }

    loadDetails()
  }, [token, supabase])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('รองรับเฉพาะไฟล์รูปภาพ (JPEG, PNG, WebP) เท่านั้น')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 10MB')
      return
    }

    try {
      setError(null)
      setIsOptimizing(true)

      const optimizedFile = await optimizeBookingReferenceImage(file)
      
      setSelectedFile(optimizedFile)
      
      const objectUrl = URL.createObjectURL(optimizedFile)
      setPreviewUrl(objectUrl)
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถจัดการรูปภาพได้ กรุณาลองรูปอื่น')
    } finally {
      setIsOptimizing(false)
    }
  }

  const removeFile = () => {
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl(null)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    if (!selectedFile || !details) return

    try {
      setIsSubmitting(true)
      setError(null)

      // Step 1: Get Upload Session
      const { data: sessionData, error: sessionError } = await supabase.rpc('create_public_balance_upload_session', {
        p_token: token
      })

      if (sessionError) throw sessionError
      if (!sessionData || typeof sessionData !== 'object' || !('storage_path' in sessionData)) {
        throw new Error('Invalid session response')
      }

      const storagePath = (sessionData as { storage_path: string }).storage_path

      // Step 2: Upload slip to private bucket
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(storagePath, selectedFile, {
          upsert: false
        })

      if (uploadError) throw uploadError

      // Step 3: Submit slip
      const { error: submitError } = await supabase.rpc('submit_public_balance_payment_slip', {
        p_token: token,
        p_storage_path: storagePath
      })

      if (submitError) throw submitError

      // Refetch details
      const { data: newData, error: newError } = await supabase.rpc('get_public_balance_payment_details', {
        p_token: token
      })
      if (!newError && newData) {
        setDetails(newData as unknown as BalancePaymentDetails)
      }
      
      removeFile()
      
    } catch (err) {
      console.error(err)
      setError('อัปโหลดล้มเหลว กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#A3A3A3]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#A3A3A3] mb-4"></div>
        <p>กำลังโหลดข้อมูล...</p>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="bg-[#121212] border border-red-900/50 rounded-xl p-8 text-center max-w-sm mx-auto">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-medium text-[#F5F5F5] mb-2">
          {error || 'ไม่พบรายการชำระเงิน'}
        </h2>
      </div>
    )
  }

  return (
    <div className="bg-[#121212] border border-[#262626] rounded-2xl overflow-hidden shadow-2xl">
      <div className="p-6 sm:p-8">
        
        {/* Header */}
        <div className="text-center mb-8 border-b border-[#262626] pb-6">
          <h1 className="text-2xl font-bold text-[#F5F5F5]">ชำระยอดคงเหลือ</h1>
          {details.shop_display_name && (
            <p className="text-[#A3A3A3] mt-2">{details.shop_display_name}</p>
          )}
        </div>

        {/* Amount */}
        <div className="text-center mb-8">
          <p className="text-sm text-[#A3A3A3] mb-1">ยอดคงเหลือที่ต้องชำระ</p>
          <p className="text-4xl font-bold text-[#F5F5F5]">
            ฿{details.amount.toLocaleString()}
          </p>
          <p className="text-xs text-[#737373] mt-2">ยอดคงเหลืองานสัก</p>
        </div>

        {/* State rendering */}
        {details.payment_status === 'paid' && (
          <div className="bg-[#171717] rounded-xl p-6 text-center border border-green-900/30">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-[#F5F5F5]">ชำระเงินเรียบร้อยแล้ว</h2>
          </div>
        )}

        {details.payment_status === 'verification_pending' && (
          <div className="bg-[#171717] rounded-xl p-6 text-center border border-[#262626]">
            <Clock className="w-16 h-16 text-[#A3A3A3] mx-auto mb-4" />
            <h2 className="text-xl font-medium text-[#F5F5F5] mb-2">รอตรวจสอบการชำระเงิน</h2>
            <p className="text-[#A3A3A3]">ร้านได้รับหลักฐานแล้ว<br />กรุณารอการตรวจสอบ</p>
          </div>
        )}

        {(details.payment_status === 'cancelled' || details.payment_status === 'refunded' || details.payment_status === 'failed') && (
          <div className="bg-[#171717] rounded-xl p-6 text-center border border-red-900/30">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-[#F5F5F5]">
              {details.payment_status === 'cancelled' && 'รายการชำระเงินนี้ถูกยกเลิก'}
              {details.payment_status === 'refunded' && 'รายการนี้ได้รับการคืนเงินแล้ว'}
              {details.payment_status === 'failed' && 'รายการชำระเงินไม่สามารถดำเนินการได้'}
            </h2>
          </div>
        )}

        {/* Pending & Upload Form */}
        {details.payment_status === 'pending' && (
          <div className="space-y-8">
            {details.payment_qr_path && qrUrl && (
              <div className="text-center">
                <div className="bg-white p-4 rounded-xl inline-block mb-3 border border-[#262626]">
                  {/* object-contain respects image ratio */}
                  <img 
                    src={qrUrl} 
                    alt="Payment QR Code" 
                    className="w-full max-w-[280px] sm:max-w-[300px] max-h-[320px] sm:max-h-[340px] object-contain"
                  />
                </div>
                <p className="text-[#F5F5F5] font-medium">สแกน QR Code เพื่อชำระเงิน</p>
                <p className="text-sm text-[#A3A3A3] mt-1">เมื่อชำระเงินแล้ว กรุณาแนบสลิปด้านล่าง</p>
              </div>
            )}

            {details.can_upload_proof && (
              <div className="bg-[#171717] p-6 rounded-xl border border-[#262626]">
                <h3 className="text-lg font-medium text-[#F5F5F5] mb-4">แนบหลักฐานการชำระเงิน</h3>
                
                {previewUrl ? (
                  <div className="space-y-4">
                    <div className="relative rounded-lg overflow-hidden bg-black/50 border border-[#262626] flex items-center justify-center p-2">
                      <img 
                        src={previewUrl} 
                        alt="Preview" 
                        className="max-h-[400px] w-auto object-contain"
                      />
                      <button
                        onClick={removeFile}
                        disabled={isSubmitting}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                      >
                        <XCircle className="w-6 h-6" />
                      </button>
                    </div>
                    
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting || isOptimizing}
                      className="w-full bg-[#F5F5F5] text-black font-semibold py-3.5 px-4 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'กำลังส่งหลักฐาน...' : 'ส่งหลักฐานการชำระเงิน'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      id="slip-upload"
                      disabled={isOptimizing || isSubmitting}
                    />
                    <label
                      htmlFor="slip-upload"
                      className="flex flex-col items-center justify-center w-full min-h-[160px] border-2 border-dashed border-[#404040] hover:border-[#737373] rounded-lg cursor-pointer transition-colors bg-black/20"
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-[#A3A3A3]">
                        {isOptimizing ? (
                          <>
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#A3A3A3] mb-3"></div>
                            <p className="text-sm">กำลังจัดการรูปภาพ...</p>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-10 h-10 mb-3 text-[#737373]" />
                            <p className="mb-2 text-sm font-medium text-[#F5F5F5]">คลิกเพื่อเลือกไฟล์รูปภาพ</p>
                            <p className="text-xs">JPEG, PNG, WebP (สูงสุด 10MB)</p>
                          </>
                        )}
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
