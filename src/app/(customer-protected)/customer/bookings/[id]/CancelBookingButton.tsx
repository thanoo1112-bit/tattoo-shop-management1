'use client'

import { useState, useTransition } from 'react'
import { cancelBooking } from './actions'

export default function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCancel() {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกคำขอจองคิวสักนี้? การยกเลิกไม่สามารถย้อนกลับได้')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await cancelBooking(bookingId)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <button
        onClick={handleCancel}
        disabled={isPending}
        className="px-4 py-2 border border-red-900/40 hover:border-red-700 text-red-500 hover:bg-red-950/20 text-xs font-semibold rounded-xl transition-all"
      >
        {isPending ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอจองคิว'}
      </button>
      {error && <span className="text-red-400 text-[10px]">{error}</span>}
    </div>
  )
}
