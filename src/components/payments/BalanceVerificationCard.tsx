'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertCircle, FileText, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

interface BalancePayment {
  payment_id: string
  amount: number
  status: string
  public_token: string
}

interface Props {
  projectId: string
  /** bookingRequestId is used to also find deposit payments linked to booking_requests */
  bookingRequestId?: string
}

export function BalanceVerificationCard({ projectId, bookingRequestId }: Props) {
  const [balance, setBalance] = useState<BalancePayment | null>(null)
  const [agreedPrice, setAgreedPrice] = useState<number>(0)
  const [paidTotal, setPaidTotal] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showConfirmPaid, setShowConfirmPaid] = useState(false)
  const [showConfirmRetry, setShowConfirmRetry] = useState(false)

  const supabase = createClient()

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Load balance from RPC
      const { data: balanceData, error: balanceError } = await supabase.rpc('get_staff_project_balance_payment', {
        p_project_id: projectId
      })
      if (balanceError) throw balanceError

      setBalance(balanceData ? (balanceData as BalancePayment) : null)

      // Load agreed price
      const { data: projectData, error: projectError } = await supabase
        .from('tattoo_projects')
        .select('agreed_price')
        .eq('id', projectId)
        .single()

      if (projectError) throw projectError
      setAgreedPrice(projectData.agreed_price || 0)

      // Load paid total: all paid payments for this project
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, status, project_id, booking_request_id')
        .eq('status', 'paid')

      if (paymentsError) throw paymentsError

      const relevantPayments = paymentsData.filter(
        p =>
          p.project_id === projectId ||
          (bookingRequestId && p.booking_request_id === bookingRequestId)
      )
      const total = relevantPayments.reduce((acc, p) => acc + Number(p.amount), 0)
      setPaidTotal(total)

    } catch (err) {
      console.error(err)
      setError('ไม่สามารถโหลดข้อมูลยอดคงเหลือได้')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, bookingRequestId])

  const handleVerify = async (result: 'paid' | 'retry') => {
    if (!balance) return
    try {
      setIsSubmitting(true)
      setError(null)

      const { error: verifyError } = await supabase.rpc('verify_balance_payment', {
        p_payment_id: balance.payment_id,
        p_result: result
      })

      if (verifyError) throw verifyError

      setShowConfirmPaid(false)
      setShowConfirmRetry(false)
      await loadData()
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถอัปเดตการชำระเงินได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleViewProof = async () => {
    if (!balance) return
    try {
      setIsSubmitting(true)

      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .select('proof_storage_path')
        .eq('id', balance.payment_id)
        .single()

      if (paymentError || !paymentData?.proof_storage_path) {
        throw new Error('ไม่พบไฟล์หลักฐาน')
      }

      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(paymentData.proof_storage_path, 300)

      if (error || !data) throw error
      setLightboxUrl(data.signedUrl)
    } catch (err) {
      console.error(err)
      setError('ไม่สามารถเปิดหลักฐานการชำระเงินได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 flex justify-center items-center h-40">
        <Loader2 className="w-6 h-6 text-[#A3A3A3] animate-spin" />
      </div>
    )
  }

  if (!balance) return null

  const statusMap: Record<string, { label: string; colorClass: string }> = {
    pending: { label: 'รอชำระเงิน', colorClass: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
    verification_pending: { label: 'รอตรวจสอบการชำระเงิน', colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    paid: { label: 'ชำระครบแล้ว', colorClass: 'text-green-500 bg-green-500/10 border-green-500/20' },
    failed: { label: 'การชำระเงินไม่สำเร็จ', colorClass: 'text-red-500 bg-red-500/10 border-red-500/20' },
    cancelled: { label: 'ยกเลิก', colorClass: 'text-red-500 bg-red-500/10 border-red-500/20' },
    refunded: { label: 'คืนเงินแล้ว', colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' },
  }

  const currentStatus = statusMap[balance.status] ?? { label: balance.status, colorClass: 'text-gray-400 bg-gray-500/10 border-gray-500/20' }
  const remaining = Math.max(agreedPrice - paidTotal, 0)

  return (
    <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-medium text-[#F5F5F5] mb-4">ยอดชำระของงาน</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Financial Info */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-[#121212] p-4 rounded-lg border border-[#262626]">
            <p className="text-xs text-[#A3A3A3] mb-1">ราคางานสัก</p>
            <p className="text-lg font-semibold text-[#F5F5F5]">฿{agreedPrice.toLocaleString()}</p>
          </div>
          <div className="bg-[#121212] p-4 rounded-lg border border-[#262626]">
            <p className="text-xs text-[#A3A3A3] mb-1">ชำระแล้ว</p>
            <p className="text-lg font-semibold text-green-500">฿{paidTotal.toLocaleString()}</p>
          </div>
          <div className="bg-[#121212] p-4 rounded-lg border border-[#262626]">
            <p className="text-xs text-[#A3A3A3] mb-1">ยอดคงเหลือ</p>
            <p className="text-lg font-semibold text-[#F5F5F5]">฿{remaining.toLocaleString()}</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between pt-2 border-t border-[#262626]">
          <span className="text-sm text-[#A3A3A3]">สถานะ</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${currentStatus.colorClass}`}>
            {currentStatus.label}
          </span>
        </div>

        {/* Actions — only when verification_pending */}
        {balance.status === 'verification_pending' && (
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              onClick={handleViewProof}
              disabled={isSubmitting}
              className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              ดูสลิป
            </button>
            <button
              onClick={() => setShowConfirmRetry(true)}
              disabled={isSubmitting}
              className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg border border-red-900/50 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <XCircle className="w-4 h-4" />
              การชำระเงินไม่ถูกต้อง
            </button>
            <button
              onClick={() => setShowConfirmPaid(true)}
              disabled={isSubmitting}
              className="flex-1 inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg bg-[#F5F5F5] text-black hover:bg-white transition-colors disabled:opacity-50 text-sm font-medium"
            >
              <CheckCircle2 className="w-4 h-4" />
              ยืนยันได้รับเงิน
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl h-full flex flex-col justify-center items-center">
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 transition-colors z-10"
            >
              <XCircle className="w-8 h-8" />
            </button>
            <img src={lightboxUrl} alt="Payment Proof" className="w-full h-full object-contain" />
          </div>
        </div>
      )}

      {/* Confirm Paid Dialog */}
      {showConfirmPaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#171717] border border-[#262626] rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#F5F5F5] mb-2">ยืนยันการชำระเงิน</h3>
            <p className="text-[#A3A3A3] text-sm mb-6">
              ยืนยันว่าได้รับยอดคงเหลือ ฿{balance.amount.toLocaleString()} แล้ว
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmPaid(false)}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleVerify('paid')}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg bg-[#F5F5F5] text-black hover:bg-white transition-colors disabled:opacity-50 font-medium"
              >
                {isSubmitting ? 'กำลังยืนยัน...' : 'ยืนยันได้รับเงิน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Retry Dialog */}
      {showConfirmRetry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#171717] border border-[#262626] rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#F5F5F5] mb-2">ให้ลูกค้าแนบหลักฐานใหม่</h3>
            <p className="text-[#A3A3A3] text-sm mb-6">
              หลักฐานเดิมจะถูกยกเลิก และลูกค้าสามารถแนบหลักฐานใหม่จากลิงก์เดิมได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmRetry(false)}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleVerify('retry')}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 rounded-lg border border-red-900/50 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-50 font-medium"
              >
                {isSubmitting ? 'กำลังดำเนินการ...' : 'ให้แนบใหม่'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
