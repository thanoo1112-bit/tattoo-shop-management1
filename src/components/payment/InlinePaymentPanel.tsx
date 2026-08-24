
"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { optimizeBookingReferenceImage } from "@/lib/imageOptimization"
import { UploadCloud, Image as ImageIcon, AlertCircle } from "lucide-react"
import { useRouter } from "next/navigation"

interface PaymentDetails {
  payment_qr_path: string | null
  can_upload_proof: boolean
  payment_status: string
}

export function InlinePaymentPanel({ token, onUploadSuccess }: { token: string, onUploadSuccess?: () => void }) {
  const [details, setDetails] = useState<PaymentDetails | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()
  const router = useRouter()

  const fetchDetails = async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc("get_public_payment_details", {
        p_public_token: token,
      })

      if (rpcError) throw rpcError
      if (!data) throw new Error("Invalid token")

      const typedData = data as PaymentDetails
      setDetails(typedData)

      if (typedData.payment_qr_path) {
        const { data: publicUrlData } = supabase.storage
          .from("shop-payment-qr")
          .getPublicUrl(typedData.payment_qr_path)
        const sep = publicUrlData.publicUrl.includes('?') ? '&' : '?'
        setQrUrl(`${publicUrlData.publicUrl}${sep}v=${Date.now()}`)
      } else {
        setQrUrl(null)
      }
    } catch (err: any) {
      console.log("Error fetching payment details:", err)
      setError("ไม่สามารถโหลดรายละเอียดการชำระเงิน")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      if (!selectedFile.type.startsWith("image/")) {
        setSubmitError("กรุณาเลือกไฟล์รูปภาพเท่านั้น")
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
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async () => {
    if (!file) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const optimizedFile = await optimizeBookingReferenceImage(file)

      const { data: sessionData, error: sessionError } = await supabase.rpc(
        "create_public_payment_upload_session",
        { p_public_token: token }
      )

      if (sessionError) {
        throw new Error(sessionError.message || "ไม่สามารถสร้างเซสชันสำหรับอัปโหลด")
      }

      const { storage_path } = sessionData as any

      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(storage_path, optimizedFile, { upsert: false })

      if (uploadError) {
        throw new Error("ไม่สามารถอัปโหลดสลิป กรุณาลองอีกครั้ง")
      }

      const { error: finalizeError } = await supabase.rpc("submit_public_payment_slip", {
        p_public_token: token,
        p_storage_path: storage_path,
      })

      if (finalizeError) {
        throw new Error(finalizeError.message || "ไม่สามารถบันทึกหลักฐาน")
      }

      if (onUploadSuccess) {
        onUploadSuccess()
      }
      router.refresh()
    } catch (err: any) {
      console.log("Submit error:", err)
      const msg = err.message || "ไม่สามารถส่งหลักฐานการชำระเงิน กรุณาลองอีกครั้ง"
      if (msg.includes("expired") || msg.includes("หมดอายุ")) {
        setSubmitError("เซสชันหมดอายุแล้ว กรุณาลองใหม่อีกครั้ง")
      } else {
        setSubmitError(msg)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6 text-[#737373] text-sm">
        กำลังโหลดวิธีชำระเงิน...
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-lg text-sm text-red-500/80">
        {error || "ไม่สามารถโหลดรายละเอียดการชำระเงิน"}
      </div>
    )
  }

  if (!details.can_upload_proof || details.payment_status !== "pending") {
    return null
  }

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h3 className="text-base font-semibold text-[#F5F5F5] mb-4">วิธีชำระเงิน</h3>
        {qrUrl ? (
          <div className="flex justify-center">
            <div className="rounded-xl border border-[#262626] overflow-hidden w-fit bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt="Payment QR Code"
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

      <div className="space-y-4">
        <h3 className="text-base font-semibold text-[#F5F5F5]">อัปโหลดหลักฐานการชำระเงิน</h3>

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
            <span className="font-medium text-sm">แตะเพื่อเลือกรูปสลิป</span>
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
          {isSubmitting ? "กำลังส่งหลักฐาน..." : "ยืนยันการชำระเงิน"}
        </button>
      </div>
    </div>
  )
}