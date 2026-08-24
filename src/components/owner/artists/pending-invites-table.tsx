'use client'

import { useState, useTransition } from 'react'
import { revokeArtistInvite } from '@/app/(dashboard)/owner/artists/actions'
import { Copy, Check, Trash2, Clock, Loader2 } from 'lucide-react'
import { formatThaiDate } from '@/lib/dateUtils'

type PendingInvite = {
  id: string
  token: string
  role: string
  status: string
  created_at: string
  expires_at: string
}

export function PendingInvitesTable({ invites }: { invites: PendingInvite[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleCopy = (id: string, token: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    navigator.clipboard.writeText(`${baseUrl}/invite/${token}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRevoke = (id: string, token: string) => {
    if (!window.confirm('ต้องการยกเลิกลิงก์เชิญนี้หรือไม่?\nหลังยกเลิก ลิงก์นี้จะไม่สามารถใช้สมัครได้อีก')) {
      return
    }

    setRevokingId(id)
    startTransition(async () => {
      await revokeArtistInvite(token)
      setRevokingId(null)
    })
  }

  if (!invites || invites.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-medium text-[#FFFFFF]">คำเชิญที่รอดำเนินการ</h2>
        <span className="px-2 py-0.5 rounded-full bg-[#262626] text-[#A3A3A3] text-xs">
          {invites.length}
        </span>
      </div>

      <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#121212] border-b border-[#262626] text-xs uppercase tracking-wider text-[#A3A3A3]">
                <th className="px-6 py-4 font-medium">ตำแหน่ง</th>
                <th className="px-6 py-4 font-medium">สร้างเมื่อ</th>
                <th className="px-6 py-4 font-medium">หมดอายุ</th>
                <th className="px-6 py-4 font-medium">สถานะ</th>
                <th className="px-6 py-4 font-medium text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]">
              {invites.map((invite) => {
                const createdDate = formatThaiDate(new Date(invite.created_at))
                const expiresDate = formatThaiDate(new Date(invite.expires_at))
                const isExpired = new Date(invite.expires_at) < new Date()

                const statusColor = isExpired ? 'text-red-400 bg-red-400/10' : 'text-yellow-400 bg-yellow-400/10'
                const statusText = isExpired ? 'หมดอายุ' : 'รอการตอบรับ'
                const isRevoking = revokingId === invite.id || (isPending && revokingId === invite.id)

                return (
                  <tr key={invite.id} className="hover:bg-[#262626]/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#FFFFFF] capitalize">{invite.role === 'artist' ? 'ช่างสัก' : invite.role}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#A3A3A3]">
                      {createdDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#A3A3A3] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {expiresDate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                        {statusText}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleCopy(invite.id, invite.token)}
                          className="p-2 text-[#A3A3A3] hover:text-[#FFFFFF] bg-[#262626] hover:bg-[#333] rounded-md transition-colors focus:outline-none"
                          title="คัดลอกลิงก์"
                        >
                          {copiedId === invite.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleRevoke(invite.id, invite.token)}
                          disabled={isRevoking || isExpired}
                          className="p-2 text-[#A3A3A3] hover:text-red-400 bg-[#262626] hover:bg-[#333] rounded-md transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          title="ยกเลิกคำเชิญ"
                        >
                          {isRevoking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
