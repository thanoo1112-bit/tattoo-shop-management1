'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { optimizeBookingReferenceImage } from '@/lib/imageOptimization'
import { UploadCloud, Image as ImageIcon, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface SlipUploadSectionProps {
  publicToken: string
  depositAmount: number
  bookingId: string
}

export default function SlipUploadSection({ publicToken, depositAmount, bookingId }: SlipUploadSectionProps) {
  const router = useRouter()
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  useEffect(() => {
    async function loadQR() {
      try {
        const { data, error: rpcErr } = await supabase.rpc('get_public_payment_details', {
          p_public_token: publicToken
        })
        if (rpcErr) throw rpcErr
        if (data && (data as any).payment_qr_path) {
          const { data: publicUrlData } = supabase.storage
            .from('shop-payment-qr')
            .getPublicUrl((data as any).payment_qr_path)
          setQrUrl(publicUrlData.publicUrl)
        }
      } catch (err) {
        console.error('Failed to load QR:', err)
      } finally {
        setLoading(false)
      }
    }
    loadQR()
  }, [publicToken])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      if (!selectedFile.type.startsWith('image/')) {
        setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
        return
      }
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
      setError(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const selectedFile = e.dataTransfer.files[0]
      if (!selectedFile.type.startsWith('image/')) {
        setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
        return
      }
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
      setError(null)
    }
  }

  const handleSubmit = async () => {
    if (!file) return

    setIsSubmitting(true)
    setError(null)

    try {
      // 1. Optimize image
      const optimizedFile = await optimizeBookingReferenceImage(file)

      // 2. Create upload session
      const { data: sessionData, error: sessionErr } = await supabase.rpc(
        'create_public_payment_upload_session',
        { p_public_token: publicToken }
      )

      if (sessionErr || !sessionData) {
        throw new Error(sessionErr?.message || 'ไม่สามารถสร้างเซสชันการอัปโหลดได้')
      }

      const { storage_path } = sessionData as any

      // 3. Upload to storage bucket
      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(storage_path, optimizedFile, { upsert: false })

      if (uploadError) {
        throw new Error('อัปโหลดไฟล์ล้มเหลว กรุณาลองใหม่อีกครั้ง')
      }

      // 4. Finalize slip submission
      const { error: finalizeErr } = await supabase.rpc('submit_public_payment_slip', {
        p_public_token: publicToken,
        p_storage_path: storage_path
      })

      if (finalizeErr) {
        throw new Error(finalizeErr.message || 'ส่งข้อมูลหลักฐานไม่สำเร็จ')
      }

      // Reload page to reflect updated status
      router.refresh()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 sm:p-8 space-y-6">
      <div className="border-b border-[#262626] pb-4">
        <h3 className="text-lg font-medium text-[#F5F5F5]">ชำระเงินมัดจำ</h3>
        <p className="text-xs text-[#737373] mt-1">กรุณาสแกน QR Code และอัปโหลดสลิปเพื่อยืนยันคิวสัก</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6 text-zinc-500 text-xs">กำลังโหลดช่องทางชำระเงิน...</div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 items-center">
          {qrUrl ? (
            <div className="bg-white p-3 rounded-xl shrink-0 border border-[#262626] max-w-[200px]">
              <img src={qrUrl} alt="Payment QR Code" className="w-full object-contain" />
              <p className="text-[10px] text-center text-black mt-2 font-bold font-mono">157 TATTOO PAYMENT</p>
            </div>
          ) : (
            <div className="bg-[#171717] border border-[#262626] p-6 rounded-xl shrink-0 text-center text-xs text-[#737373] w-[200px]">
              ไม่มี QR Code ในระบบ<br />กรุณาโอนเงินตามบัญชีของร้าน
            </div>
          )}

          <div className="flex-1 space-y-4 w-full">
            <div className="bg-[#171717] border border-[#262626] rounded-xl p-4">
              <span className="text-xs text-[#A3A3A3] block">จำนวนเงินมัดจำที่ต้องชำระ</span>
              <span className="text-2xl font-bold text-amber-500">฿{depositAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Upload Drag & Drop Area */}
      <div 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-[#262626] hover:border-[#404040] bg-[#171717]/30 hover:bg-[#171717]/70 rounded-xl p-8 text-center cursor-pointer transition-all relative overflow-hidden"
      >
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          className="hidden"
        />

        {previewUrl ? (
          <div className="flex flex-col items-center gap-3">
            <img src={previewUrl} alt="Slip Preview" className="max-h-[220px] rounded-lg object-contain border border-[#262626]" />
            <span className="text-xs text-[#A3A3A3]">{file?.name}</span>
            <span className="text-[10px] text-zinc-500">(คลิกเพื่อเปลี่ยนรูปภาพ)</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <UploadCloud size={32} className="text-[#A3A3A3]" />
            <p className="text-sm font-semibold text-[#F5F5F5]">อัปโหลดสลิปการโอนเงิน</p>
            <p className="text-xs text-[#737373]">ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-3 rounded-md text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {file && (
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-semibold py-3 rounded-md transition-all shadow-[0_4px_15px_rgba(255,255,255,0.15)] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="animate-spin" size={16} /> กำลังส่งหลักฐาน...
            </>
          ) : (
            'ส่งหลักฐานการชำระเงิน'
          )}
        </button>
      )}
    </div>
  )
}
