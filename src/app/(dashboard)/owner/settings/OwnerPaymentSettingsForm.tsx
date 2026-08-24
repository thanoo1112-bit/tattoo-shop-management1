'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, CheckCircle2, UploadCloud, Trash2, QrCode } from 'lucide-react'
import { optimizeBookingReferenceImage } from '@/lib/imageOptimization'

export function OwnerPaymentSettingsForm({ shopId }: { shopId: string }) {
  const [paymentQrPath, setPaymentQrPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Preserved payment settings — loaded once, re-sent during QR update to prevent NULL overwrite
  const [savedBankName, setSavedBankName] = useState<string | null>(null)
  const [savedAccountName, setSavedAccountName] = useState<string | null>(null)
  const [savedAccountNumber, setSavedAccountNumber] = useState<string | null>(null)
  const [savedPromptpayId, setSavedPromptpayId] = useState<string | null>(null)
  const [savedPaymentInstructions, setSavedPaymentInstructions] = useState<string | null>(null)

  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null)
  const [isUploadingQr, setIsUploadingQr] = useState(false)
  const [qrUploadError, setQrUploadError] = useState<string | null>(null)
  const [qrUploadSuccess, setQrUploadSuccess] = useState(false)
  const qrInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()

  /** Append ?v=<epoch> cache-buster to a public Storage URL for display only. DB path is never affected. */
  function bustCache(url: string): string {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}v=${Date.now()}`
  }

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.rpc('get_shop_payment_settings', {
          p_shop_id: shopId
        })
        
        if (error) throw error
        
        if (data && Array.isArray(data) && data.length > 0) {
          const row = data[0]

          // Store all payment fields so QR update can pass them back untouched
          setSavedBankName(row.bank_name ?? null)
          setSavedAccountName(row.account_name ?? null)
          setSavedAccountNumber(row.account_number ?? null)
          setSavedPromptpayId(row.promptpay_id ?? null)
          setSavedPaymentInstructions(row.payment_instructions ?? null)

          const qrPath = row.payment_qr_path ?? null
          setPaymentQrPath(qrPath)
          
          if (qrPath) {
            const { data: publicUrlData } = supabase.storage
              .from('shop-payment-qr')
              .getPublicUrl(qrPath)
            // Cache-bust so browser/CDN doesn't serve stale image after an upsert to the same path
            setQrPreviewUrl(bustCache(publicUrlData.publicUrl))
          }
        }
      } catch (err) {
        console.log('Error loading payment settings:', err)
      } finally {
        setIsLoading(false)
      }
    }
    
    loadSettings()
  }, [shopId, supabase])

  const handleQrSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    
    const file = e.target.files[0]
    if (!file.type.startsWith('image/')) {
      setQrUploadError('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
      return
    }
    
    setQrPreviewUrl(URL.createObjectURL(file))
    setQrUploadError(null)
    setQrUploadSuccess(false)
    
    await uploadQr(file)
  }

  const uploadQr = async (fileToUpload: File) => {
    setIsUploadingQr(true)
    setQrUploadError(null)
    
    try {
      const optimizedFile = await optimizeBookingReferenceImage(fileToUpload)
      const path = `${shopId}/payment-qr.webp`
      
      const { error: uploadError } = await supabase.storage
        .from('shop-payment-qr')
        .upload(path, optimizedFile, { upsert: true, contentType: 'image/webp' })
        
      if (uploadError) throw uploadError

      // Send ALL current payment setting values so other fields are never overwritten with NULL
      const { error: rpcError } = await supabase.rpc('update_shop_payment_settings', {
        p_shop_id: shopId,
        p_bank_name: savedBankName,
        p_account_name: savedAccountName,
        p_account_number: savedAccountNumber,
        p_promptpay_id: savedPromptpayId,
        p_payment_instructions: savedPaymentInstructions,
        p_payment_qr_path: path
      })
      
      if (rpcError) throw rpcError
      
      setPaymentQrPath(path)
      
      const { data: publicUrlData } = supabase.storage
        .from('shop-payment-qr')
        .getPublicUrl(path)
      
      // Cache-bust after upsert so the new image is displayed immediately
      setQrPreviewUrl(bustCache(publicUrlData.publicUrl))
      setQrUploadSuccess(true)
      setTimeout(() => setQrUploadSuccess(false), 3000)
      
    } catch (err: any) {
      console.log('QR Upload error:', err)
      setQrUploadError(err.message || 'ไม่สามารถอัปโหลด QR ได้')
    } finally {
      setIsUploadingQr(false)
      if (qrInputRef.current) qrInputRef.current.value = ''
    }
  }

  const handleDeleteQr = async () => {
    if (!paymentQrPath) return

    try {
      const { error: deleteError } = await supabase.storage
        .from('shop-payment-qr')
        .remove([paymentQrPath])

      if (deleteError) throw deleteError

      const { error: rpcError } = await supabase.rpc('update_shop_payment_settings', {
        p_shop_id: shopId,
        p_payment_qr_path: null
      })

      if (rpcError) throw rpcError

      setPaymentQrPath(null)
      setQrPreviewUrl(null)
      setQrUploadSuccess(false)
    } catch (err: any) {
      console.log('QR Delete error:', err)
      setQrUploadError(err.message || 'ไม่สามารถลบ QR ได้')
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 text-center text-[#9EA4AA]">
        กำลังโหลด...
      </div>
    )
  }

  // Hidden file input (shared)
  const fileInput = (
    <input 
      type="file" 
      accept="image/jpeg, image/png, image/webp" 
      className="hidden" 
      ref={qrInputRef} 
      onChange={handleQrSelect} 
    />
  )

  // --- QR EXISTS ---
  if (paymentQrPath && qrPreviewUrl) {
    return (
      <div className="p-6">
        {fileInput}

        {/* Desktop: 2-col / Mobile: stacked */}
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
          
          {/* Column A — QR Preview */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="rounded-lg border border-[#2A2A2A] overflow-hidden w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrPreviewUrl} alt="Shop QR" className="block max-w-[220px] max-h-[300px] md:max-w-[260px] md:max-h-[300px] w-auto h-auto" />
            </div>
            <p className="text-xs text-[#737373] mt-3">QR รับเงินของร้าน</p>
          </div>

          {/* Column B — Info + Actions */}
          <div className="flex flex-col gap-5 flex-1 w-full md:w-auto items-center md:items-start text-center md:text-left">
            <div>
              <h3 className="text-base font-medium text-[#F5F5F5] mb-1">ใช้ QR นี้สำหรับรับเงินมัดจำจากลูกค้า</h3>
              <p className="text-sm text-[#9EA4AA]">ลูกค้าจะเห็น QR นี้ในหน้าชำระเงินและใช้สำหรับโอนมัดจำ</p>
            </div>

            <div className="flex items-center gap-2 bg-[#0B0B0B] px-4 py-2.5 rounded-md border border-[#2A2A2A] w-full md:w-auto">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span className="text-sm text-[#F5F5F5]">สถานะ: พร้อมรับชำระเงิน</span>
            </div>

            {qrUploadSuccess && (
              <p className="text-emerald-500 text-sm">บันทึก QR รับเงินแล้ว</p>
            )}

            {qrUploadError && (
              <p className="text-red-500 text-sm">{qrUploadError}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <button
                onClick={() => qrInputRef.current?.click()}
                disabled={isUploadingQr}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1A1A1A] border border-[#2A2A2A] text-[#F5F5F5] text-sm font-medium rounded-md hover:bg-[#262626] disabled:opacity-50 transition-colors w-full sm:w-auto"
              >
                <UploadCloud className="w-4 h-4" />
                {isUploadingQr ? 'กำลังอัปโหลด...' : 'เปลี่ยน QR'}
              </button>
              <button
                onClick={handleDeleteQr}
                disabled={isUploadingQr}
                className="flex items-center justify-center gap-2 px-5 py-2.5 border border-[#2A2A2A] text-[#9EA4AA] text-sm rounded-md hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 disabled:opacity-50 transition-colors w-full sm:w-auto"
              >
                <Trash2 className="w-4 h-4" />
                ลบ QR
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- QR EMPTY STATE ---
  return (
    <div className="p-6">
      {fileInput}

      <div className="flex flex-col items-center text-center py-6 space-y-6">
        <div className="w-[200px] h-[200px] bg-[#0B0B0B] border-2 border-dashed border-[#2A2A2A] rounded-xl flex flex-col items-center justify-center gap-3 text-[#525252]">
          <QrCode className="w-12 h-12" />
          <span className="text-sm">ยังไม่ได้เพิ่ม QR รับเงิน</span>
        </div>

        <div className="space-y-1 max-w-xs">
          <p className="text-sm text-[#F5F5F5] font-medium">ตั้งค่า QR สำหรับรับเงินมัดจำ</p>
          <p className="text-sm text-[#9EA4AA]">ลูกค้าจะเห็น QR นี้ในหน้าชำระเงินและใช้สำหรับโอนมัดจำ</p>
        </div>

        <div className="flex items-center gap-2 bg-[#0B0B0B] px-4 py-2.5 rounded-md border border-[#2A2A2A]">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="text-sm text-[#F5F5F5]">สถานะ: ยังไม่ได้ตั้งค่า QR รับเงิน</span>
        </div>

        {qrUploadError && (
          <p className="text-red-500 text-sm">{qrUploadError}</p>
        )}

        <button
          onClick={() => qrInputRef.current?.click()}
          disabled={isUploadingQr}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-[#F5F5F5] text-[#0A0A0A] text-sm font-medium rounded-md hover:bg-[#E5E5E5] disabled:opacity-50 transition-colors"
        >
          <UploadCloud className="w-4 h-4" />
          {isUploadingQr ? 'กำลังอัปโหลด...' : 'เพิ่ม QR รับเงิน'}
        </button>
      </div>
    </div>
  )
}
