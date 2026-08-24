'use client'

import React, { useState, useEffect } from 'react'
import { ExternalLink, Copy, Check } from 'lucide-react'

type PublicStorefrontLinkProps = {
  shopSlug: string
}

export function PublicStorefrontLink({ shopSlug }: PublicStorefrontLinkProps) {
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const getPublicLink = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/shop/${shopSlug}`
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tattoo-157.vercel.app'
    return `${appUrl}/shop/${shopSlug}`
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getPublicLink())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  return (
    <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[#F3F3F3]">หน้าร้านสาธารณะ (Public Storefront)</h3>
        <span className="text-xs text-[#9CA3AB]">สำหรับให้ลูกค้าทั่วไปเข้าชม</span>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 bg-[#0A0A0A] border border-[#262626] rounded-md px-3 py-2.5 text-xs font-mono text-[#C8CDD3] truncate select-all">
          {mounted ? getPublicLink() : 'กำลังโหลด...'}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/shop/${shopSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#262626] hover:bg-[#333333] border border-[#262626] text-[#F3F3F3] hover:text-[#FFFFFF] rounded-md text-xs font-medium transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            เปิดหน้าร้าน
          </a>
          <button
            onClick={handleCopy}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black rounded-md text-xs font-medium transition-colors min-w-[95px]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                คัดลอกแล้ว
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                คัดลอกลิงก์
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
