'use client'

import React, { useState, useEffect } from 'react'
import { ExternalLink, Copy, Check, Lock } from 'lucide-react'

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
    // 1. Try NEXT_PUBLIC_APP_URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl && !appUrl.includes('supabase.co')) {
      return `${appUrl.replace(/\/$/, '')}/shop/${shopSlug}`
    }
    // 2. Fallback to browser origin
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/shop/${shopSlug}`
    }
    // 3. Fallback during server render
    return `https://tattoo-157.vercel.app/shop/${shopSlug}`
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
    <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[#2A2A2A] bg-[#181818]">
        <h2 className="text-lg font-medium text-[#F5F5F5]">หน้าร้านสาธารณะ</h2>
        <p className="text-sm text-[#9EA4AA] mt-1">ข้อมูลลิงก์สำหรับให้ลูกค้าเข้าชมหน้าร้านสาธารณะ</p>
      </div>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <div className="w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-md pl-3 pr-10 py-2.5 text-xs font-mono text-[#C8CDD3] truncate select-all">
              {mounted ? getPublicLink() : 'กำลังโหลด...'}
            </div>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <Lock className="h-3.5 w-3.5 text-[#7A7A7A]" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/shop/${shopSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#2A2A2A] hover:bg-[#333333] border border-[#2A2A2A] text-[#F3F3F3] hover:text-[#FFFFFF] rounded-md text-xs font-medium transition-colors"
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
    </div>
  )
}
