'use client'

import { useState, useTransition } from 'react'
import { registerArtist } from './actions'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'

export default function ArtistRegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccessMessage(null)

    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }

    startTransition(async () => {
      const result = await registerArtist(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success && result?.message) {
        setSuccessMessage(result.message)
      }
    })
  }

  return (
    <div className="min-h-screen relative bg-[#0A0A0A] text-[#F3F3F3] flex items-center justify-center p-4 py-12 overflow-hidden z-0">
      <div className="relative z-20 max-w-md w-full bg-[#171717]/95 backdrop-blur-sm p-10 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-[#262626] border-t-[#FFFFFF] border-t-[3px]">
        <div className="flex justify-center mb-8">
          <BrandLogo />
        </div>

        <div className="mb-6 border-b border-[#262626] pb-4 flex items-center gap-3">
          <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
          <div>
            <h2 className="text-xl font-medium text-[#F3F3F3] tracking-wide">สมัครเป็นช่าง</h2>
            <p className="text-xs text-[#9CA3AB] mt-1">สำหรับช่างสักร้าน 157 TATTOO</p>
          </div>
        </div>

        {error && (
          <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="bg-[rgba(34,197,94,0.08)] border border-[#14532D] text-[#86EFAC] p-3 rounded-md mb-6 text-sm">
            {successMessage}
          </div>
        )}

        {!successMessage && (
          <form action={handleSubmit} className="space-y-5 relative z-20">
            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="fullName">ชื่อที่ใช้แสดง *</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
                placeholder="เช่น ช่างกาย"
              />
            </div>

            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="email">อีเมล *</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
                placeholder="artist@example.com"
              />
            </div>

            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="phone">เบอร์โทรศัพท์ *</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
                placeholder="เช่น 0812345678"
              />
            </div>

            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="password">รหัสผ่าน *</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
              />
            </div>

            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="confirmPassword">ยืนยันรหัสผ่าน *</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-medium py-3 rounded-md transition-all mt-8 shadow-[0_4px_15px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] focus:ring-2 focus:ring-[#FFFFFF]/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'กำลังสมัครบัญชี...' : 'สมัครบัญชีช่าง'}
            </button>
          </form>
        )}

        <div className="mt-8 text-center text-sm text-[#747C85] relative z-20">
          มีบัญชีอยู่แล้ว? <Link href="/login" className="text-[#C8CDD3] hover:text-[#F3F3F3] transition-colors">กลับไปเข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  )
}
