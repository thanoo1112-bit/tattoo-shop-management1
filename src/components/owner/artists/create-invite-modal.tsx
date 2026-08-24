'use client'

import { useState, useTransition } from 'react'
import { createArtistInvite } from '@/app/(dashboard)/owner/artists/actions'
import { Plus, X, Copy, Check, Loader2 } from 'lucide-react'

export function CreateInviteModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = () => {
    setError(null)
    setInviteUrl(null)
    setCopied(false)

    startTransition(async () => {
      const result = await createArtistInvite()
      if (!result.success) {
        setError(result.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }

      if (result.data && result.data.length > 0) {
        const token = result.data[0].token
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
        setInviteUrl(`${baseUrl}/invite/${token}`)
      }
    })
  }

  const handleCopy = () => {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setIsOpen(false)
    setTimeout(() => {
      setInviteUrl(null)
      setError(null)
      setCopied(false)
    }, 300) // Reset after animation
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex w-full sm:w-auto items-center justify-center px-4 py-2 sm:py-2 text-sm font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] rounded-md transition-all shadow-[0_4px_15px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] focus:outline-none focus:ring-2 focus:ring-[#FFFFFF]/50"
      >
        <Plus className="w-4 h-4 mr-2" />
        เชิญช่างสัก
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#171717] border border-[#262626] rounded-xl shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-[#262626]">
              <h3 className="text-lg font-medium text-[#FFFFFF]">สร้างลิงก์เชิญสำหรับช่างสัก</h3>
              <button
                onClick={handleClose}
                className="text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {!inviteUrl ? (
                <div className="space-y-6">
                  <p className="text-sm text-[#A3A3A3] leading-relaxed">
                    ลิงก์นี้ใช้สำหรับสมัครบัญชีช่างและเข้าร่วมร้าน
                    <br />
                    <span className="text-[#FFFFFF]">ลิงก์เชิญมีอายุ 7 วัน</span>
                  </p>
                  
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handleCreate}
                    disabled={isPending}
                    className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] rounded-md transition-all shadow-[0_4px_15px_rgba(255,255,255,0.15)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        กำลังสร้างลิงก์...
                      </>
                    ) : (
                      'สร้างลิงก์เชิญ'
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col items-center justify-center text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-2">
                      <Check className="w-6 h-6 text-green-500" />
                    </div>
                    <h4 className="text-base font-medium text-[#FFFFFF]">สร้างลิงก์เชิญสำเร็จ</h4>
                    <p className="text-xs text-[#A3A3A3]">คัดลอกลิงก์ด้านล่างและส่งให้ช่างสักของคุณ</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-[#262626] border border-[#333] rounded-md px-3 py-2.5 overflow-hidden">
                      <p className="text-sm text-[#F3F3F3] truncate select-all">{inviteUrl}</p>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center justify-center px-3 py-2.5 bg-[#262626] hover:bg-[#333] border border-[#333] text-[#FFFFFF] rounded-md transition-colors focus:outline-none"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full px-4 py-2 text-sm font-medium text-[#A3A3A3] hover:text-[#FFFFFF] bg-transparent hover:bg-[#262626] rounded-md transition-colors focus:outline-none"
                  >
                    ปิดหน้าต่าง
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
