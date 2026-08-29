'use client'

import { useState, useTransition } from 'react'
import { registerCustomer } from './actions'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function RegisterForm() {
  const searchParams = useSearchParams()
  const shopSlug = searchParams.get('shop') || '157-tattoo'
  const returnTo = searchParams.get('returnTo') || ''

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string

    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }

    startTransition(async () => {
      const result = await registerCustomer(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F3F3F3] flex items-center justify-center p-4 py-12 overflow-hidden z-0">
      <div className="relative z-20 max-w-md w-full bg-[#171717]/95 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-[#262626] border-t-[#FFFFFF] border-t-[3px]">
        <div className="flex justify-center mb-8">
          <BrandLogo />
        </div>
        
        <div className="mb-6 border-b border-[#262626] pb-4 flex items-center gap-3">
          <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
          <div>
            <h2 className="text-xl font-semibold text-[#F3F3F3] tracking-wide">สมัครสมาชิก</h2>
            <p className="text-xs text-[#9CA3AB] mt-1">สมัครเพื่อเข้าจองคิวและดูผลงาน</p>
          </div>
        </div>

        {error && (
          <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="shopSlug" value={shopSlug} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div>
            <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="fullName">ชื่อ - นามสกุล</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="phone">เบอร์โทรศัพท์</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="08X-XXX-XXXX"
              className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="email">อีเมล</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="password">รหัสผ่าน</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="confirmPassword">ยืนยันรหัสผ่าน</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-semibold py-3 rounded-md transition-all mt-6 shadow-[0_4px_15px_rgba(255,255,255,0.15)] disabled:opacity-50"
          >
            {isPending ? 'กำลังลงทะเบียน...' : 'สมัครสมาชิก'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#747C85]">
          มีบัญชีอยู่แล้ว?{' '}
          <Link 
            href={`/customer/login?shop=${shopSlug}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`} 
            className="text-[#C8CDD3] hover:text-[#F3F3F3] transition-colors font-medium"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#F3F3F3]">Loading...</div>}>
      <RegisterForm />
    </Suspense>
  )
}
