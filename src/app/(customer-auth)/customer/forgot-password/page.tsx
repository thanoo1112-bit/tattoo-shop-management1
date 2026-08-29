'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const shopSlug = searchParams.get('shop') || '157-tattoo'

  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!email.trim()) {
      setError('กรุณากรอกอีเมลของคุณ')
      return
    }

    startTransition(async () => {
      try {
        const origin = window.location.origin
        const redirectTo = `${origin}/customer/reset-password`
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo
        })

        if (resetErr) {
          if (resetErr.message.includes('valid email')) {
            setError('รูปแบบอีเมลไม่ถูกต้อง')
            return
          }
          console.error('Reset password error:', resetErr)
        }
        
        setSuccess(true)
      } catch (err) {
        console.error('Unexpected reset password error:', err)
        setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F3F3F3] flex items-center justify-center p-4 overflow-hidden z-0">
      <div className="relative z-20 max-w-md w-full bg-[#171717]/95 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-[#262626] border-t-[#FFFFFF] border-t-[3px]">
        <div className="flex justify-center mb-8">
          <BrandLogo />
        </div>
        
        <div className="mb-6 border-b border-[#262626] pb-4 flex items-center gap-3">
          <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
          <div>
            <h2 className="text-xl font-semibold text-[#F3F3F3] tracking-wide">ลืมรหัสผ่าน</h2>
            <p className="text-xs text-[#9CA3AB] mt-1">กรอกอีเมลที่ใช้สมัครสมาชิก เพื่อรับลิงก์สำหรับตั้งรหัสผ่านใหม่</p>
          </div>
        </div>

        {error && (
          <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="space-y-6">
            <div className="bg-[rgba(255,255,255,0.05)] border border-[#262626] text-[#E5E5E5] p-4 rounded-md text-sm leading-relaxed text-center">
              หากอีเมลนี้มีบัญชีอยู่ในระบบ<br />
              เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว<br />
              กรุณาตรวจสอบกล่องจดหมายของคุณ
            </div>
            <div className="text-center">
              <Link 
                href={`/customer/login?shop=${shopSlug}`}
                className="text-xs text-[#C8CDD3] hover:text-[#FFFFFF] transition-colors font-medium underline underline-offset-4"
              >
                กลับเข้าสู่ระบบ
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="email">อีเมล</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-semibold py-3 rounded-md transition-all mt-6 shadow-[0_4px_15px_rgba(255,255,255,0.15)] disabled:opacity-50"
            >
              {isPending ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์ตั้งรหัสผ่านใหม่'}
            </button>

            <div className="mt-6 text-center text-sm">
              <Link 
                href={`/customer/login?shop=${shopSlug}`}
                className="text-xs text-[#C8CDD3] hover:text-[#FFFFFF] transition-colors font-medium"
              >
                กลับเข้าสู่ระบบ
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#F3F3F3]">Loading...</div>}>
      <ForgotPasswordForm />
    </Suspense>
  )
}
