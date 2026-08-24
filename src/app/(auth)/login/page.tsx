'use client'

import { useState, useTransition } from 'react'
import { login } from './actions'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Eye, EyeOff } from 'lucide-react'

function LoginForm() {
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo')

  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showPassword, setShowPassword] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await login(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="min-h-screen relative bg-[#0A0A0A] text-[#F3F3F3] flex items-center justify-center p-4 overflow-hidden z-0">
      <div className="relative z-20 max-w-md w-full bg-[#171717]/95 backdrop-blur-sm p-10 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-[#262626] border-t-[#FFFFFF] border-t-[3px]">
        <div className="flex justify-center mb-10">
          <BrandLogo />
        </div>
        
        {error && (
          <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}
        {searchParams.get('error') === 'no_active_shop' && (
          <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-3 rounded-md mb-6 text-sm">
            บัญชีของคุณไม่ได้เป็นสมาชิกที่ใช้งานอยู่ของร้าน กรุณาติดต่อผู้ดูแลร้าน
          </div>
        )}

        <form action={handleSubmit} className="space-y-5 relative z-20">
          {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
          <div>
            <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="email">อีเมล</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
            />
          </div>
          
          <div>
            <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="password">รหัสผ่าน</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 pr-10 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner [&::-ms-reveal]:hidden [&::-ms-clear]:hidden [&::-webkit-contacts-auto-fill-button]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
              />
              {passwordValue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#FFFFFF] hover:opacity-80 transition-opacity focus:outline-none"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-medium py-3 rounded-md transition-all mt-8 shadow-[0_4px_15px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] focus:ring-2 focus:ring-[#FFFFFF]/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
        
        <div className="mt-8 text-center text-sm text-[#747C85] relative z-20">
          ยังไม่มีบัญชีร้าน? <Link href="/register" className="text-[#C8CDD3] hover:text-[#F3F3F3] transition-colors">ลงทะเบียนที่นี่</Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#F3F3F3]">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
