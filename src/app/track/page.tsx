'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Clock } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function TrackStatusPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value
    // If user inputs a full UUID (36 chars), let them paste/type it without format interference
    if (rawVal.length > 15) {
      setToken(rawVal.trim())
      if (error) setError(null)
      return
    }

    // Otherwise, auto-format to XXXX-XXXX-XX
    const clean = rawVal.replace(/[^a-zA-Z2-9]/g, '').toUpperCase().slice(0, 10)
    let formatted = ''
    if (clean.length > 0) {
      formatted += clean.slice(0, 4)
    }
    if (clean.length > 4) {
      formatted += '-' + clean.slice(4, 8)
    }
    if (clean.length > 8) {
      formatted += '-' + clean.slice(8, 10)
    }
    setToken(formatted)
    if (error) setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError(null)

    const trimmedToken = token.trim()
    
    // 1. Support legacy UUID format (36 chars)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRegex.test(trimmedToken)) {
      router.push(`/book/157-tattoo/booking/${trimmedToken}`)
      return
    }

    // 2. Validate short code format (10 chars, format: XXXX-XXXX-XX)
    const shortCodeRegex = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/
    if (!shortCodeRegex.test(trimmedToken)) {
      setError('กรุณาตรวจสอบรหัสติดตามสถานะอีกครั้ง')
      return
    }

    try {
      setLoading(true)
      const supabase = createClient()
      const { data: publicToken, error: rpcError } = await supabase.rpc(
        'resolve_public_booking_tracking_code',
        {
          p_shop_slug: '157-tattoo',
          p_tracking_code: trimmedToken
        }
      )

      if (rpcError || !publicToken) {
        setError('ไม่พบคำขอจองจากรหัสนี้ กรุณาตรวจสอบรหัสอีกครั้ง')
        return
      }

      // Success: route to the status page using the resolved public token
      router.push(`/book/157-tattoo/booking/${publicToken}`)
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการตรวจสอบรหัส กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] font-sans flex flex-col justify-between selection:bg-[#F5F5F5] selection:text-black">
      
      {/* Header */}
      <header className="h-14 border-b border-[#262626] bg-[#0A0A0A] px-4 md:px-8 flex items-center justify-between sticky top-0 z-50">
        <Link href="/design-lab/customer-home-v2" className="flex items-center gap-2 group">
          <img src="/logo.png" alt="157 TATTOO Logo" className="h-6 w-6 object-contain grayscale" />
          <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5] group-hover:text-white transition-colors">
            157 TATTOO
          </span>
        </Link>
        <Link 
          href="/design-lab/customer-home-v2" 
          className="text-xs font-semibold text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          กลับหน้าหลัก
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-[460px] bg-[#121212] border border-[#262626] rounded-2xl p-6 md:p-8 space-y-6 shadow-xl">
          
          {/* Card Header */}
          <div className="text-center space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#737373] block">
              BOOKING STATUS
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-[#F5F5F5] tracking-wide">
              ติดตามสถานะการจอง
            </h1>
            <p className="text-xs md:text-sm text-[#A3A3A3] leading-relaxed max-w-sm mx-auto">
              กรอกรหัสติดตามที่ได้รับหลังจากส่งคำขอจอง เพื่อตรวจสอบสถานะล่าสุดของคุณ
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label 
                htmlFor="tracking-code" 
                className="block text-xs font-semibold text-[#A3A3A3] uppercase tracking-wider"
              >
                รหัสติดตามสถานะ
              </label>
              <input
                id="tracking-code"
                type="text"
                required
                value={token}
                onChange={handleInputChange}
                placeholder="A7K9-M2X4-Q8"
                disabled={loading}
                className={`w-full bg-[#171717] border ${
                  error ? 'border-red-500/40 focus:border-red-500/80 focus:ring-red-500/10' : 'border-[#262626] focus:border-[#737373] focus:ring-white/5'
                } rounded-lg p-3 text-sm text-[#F5F5F5] focus:outline-none focus:ring-2 transition-all font-mono placeholder:font-sans placeholder:text-[#525252] disabled:opacity-50`}
                aria-describedby={error ? "error-msg" : undefined}
              />
              {error && (
                <p 
                  id="error-msg" 
                  className="text-xs text-red-500 font-medium pt-1"
                >
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black transition-colors rounded-lg text-xs font-bold shadow-md cursor-pointer hover:shadow-lg focus:ring-2 focus:ring-[#FFFFFF]/20 focus:outline-none disabled:bg-[#262626] disabled:text-[#737373] disabled:cursor-not-allowed"
            >
              {loading ? 'กำลังตรวจสอบ...' : 'ตรวจสอบสถานะ'}
            </button>
          </form>

          {/* Secondary Action */}
          <div className="text-center pt-2">
            <Link 
              href="/design-lab/customer-home-v2" 
              className="text-xs font-semibold text-[#737373] hover:text-[#A3A3A3] transition-colors"
            >
              กลับหน้าหลัก
            </Link>
          </div>

         </div>
      </main>

      {/* Footer Muted Spacer */}
      <footer className="py-4 border-t border-[#262626]/20 text-center">
        <span className="text-[10px] text-[#737373] tracking-wider uppercase">
          © 2026 157 TATTOO STUDIO. ALL RIGHTS RESERVED.
        </span>
      </footer>

    </div>
  )
}
