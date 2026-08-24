'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInviteAction } from '@/app/invite/[token]/actions'
import { translateInviteError } from '@/lib/errors/invite-errors'
import { Loader2 } from 'lucide-react'

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleAccept = () => {
    setError(null)
    startTransition(async () => {
      const result = await acceptInviteAction(token)
      if (!result.success) {
        setError(translateInviteError(result.error))
        return
      }
      router.push(result.redirectUrl || '/artist/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 w-full">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm text-left">
          {error}
        </div>
      )}
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="w-full flex items-center justify-center px-4 py-3 text-sm font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] rounded-md transition-all shadow-[0_4px_15px_rgba(255,255,255,0.15)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            กำลังเข้าร่วม...
          </>
        ) : (
          'ยอมรับคำเชิญและเข้าร่วม'
        )}
      </button>
    </div>
  )
}
