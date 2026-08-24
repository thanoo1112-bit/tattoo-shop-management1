'use client'

import { useState } from 'react'
import { Clipboard, Check } from 'lucide-react'

export default function CopyTrackingCode({ trackingCode }: { trackingCode: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(trackingCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-[#171717] border border-[#262626] rounded-lg gap-4">
      <div className="space-y-1 text-center sm:text-left">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#737373] block">
          รหัสติดตามสถานะ
        </span>
        <span className="text-lg font-bold font-mono tracking-widest text-[#F5F5F5] block">
          {trackingCode}
        </span>
        <p className="text-xs text-[#737373]">
          เก็บรหัสนี้ไว้สำหรับตรวจสอบสถานะการจองภายหลัง
        </p>
      </div>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-4 py-2 bg-[#262626] hover:bg-[#333333] border border-[#404040]/30 text-[#F5F5F5] transition-colors rounded-md text-xs font-semibold cursor-pointer w-full sm:w-auto justify-center"
      >
        {copied ? (
          <>
            <Check size={12} className="text-emerald-500" />
            <span className="text-emerald-500">✓ คัดลอกแล้ว</span>
          </>
        ) : (
          <>
            <Clipboard size={12} />
            <span>คัดลอกรหัส</span>
          </>
        )}
      </button>
    </div>
  )
}
