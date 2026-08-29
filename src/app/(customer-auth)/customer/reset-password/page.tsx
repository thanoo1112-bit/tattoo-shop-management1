'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const shopSlug = searchParams.get('shop') || '157-tattoo'

  const [loading, setLoading] = useState(true)
  const [isSessionReady, setIsSessionReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const supabase = createClient()

  useEffect(() => {
    async function handleAuthInit() {
      try {
        setLoading(true)
        setError(null)
        const code = searchParams.get('code')
        
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeErr) {
            console.error('Code exchange error:', exchangeErr)
            setError('ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว')
          } else {
            setIsSessionReady(true)
          }
        } else {
          // Give client SDK a tiny moment to parse hash fragment if any
          await new Promise((resolve) => setTimeout(resolve, 300))
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            setIsSessionReady(true)
          } else {
            setError('ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว')
          }
        }
      } catch (err) {
        console.error('Init auth error:', err)
        setError('ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว')
      } finally {
        setLoading(false)
      }
    }
    handleAuthInit()
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!password) {
      setError('กรุณากรอกรหัสผ่านใหม่')
      return
    }

    if (password.length < 6) {
      setError('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร')
      return
    }

    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }

    startTransition(async () => {
      try {
        const { error: updateErr } = await supabase.auth.updateUser({
          password: password
        })

        if (updateErr) {
          setError(updateErr.message || 'ไม่สามารถอัปเดตรหัสผ่านได้')
          return
        }

        // Successfully updated password! Sign out to ensure clean state and require login.
        await supabase.auth.signOut()
        setSuccess(true)
      } catch (err) {
        console.error('Reset password update error:', err)
        setError('เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่')
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F3F3F3] flex items-center justify-center p-4 overflow-hidden z-0">
      <div className="relative z-20 max-w-md w-full bg-[#171717]/95 backdrop-blur-sm p-8 sm:p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-[#262626] border-t-[#FFFFFF] border-t-[3px]">
        <div className="flex justify-center mb-8">
          <BrandLogo />
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <div className="text-sm text-[#9CA3AB]">กำลังยืนยันความปลอดภัย...</div>
          </div>
        ) : error ? (
          <div className="space-y-6 text-center">
            <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-4 rounded-md text-sm leading-relaxed">
              {error}
            </div>
            <div className="pt-2">
              <Link 
                href={`/customer/forgot-password?shop=${shopSlug}`}
                className="inline-block w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black font-semibold py-3 rounded-md transition-all text-sm"
              >
                ส่งลิงก์ใหม่
              </Link>
            </div>
            <div>
              <Link 
                href={`/customer/login?shop=${shopSlug}`}
                className="text-xs text-[#C8CDD3] hover:text-[#FFFFFF] transition-colors"
              >
                กลับเข้าสู่ระบบ
              </Link>
            </div>
          </div>
        ) : success ? (
          <div className="space-y-6 text-center">
            <div className="flex justify-center text-green-400">
              <CheckCircle size={48} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#F3F3F3]">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</h3>
              <p className="text-xs text-[#9CA3AB] mt-1.5">คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที</p>
            </div>
            <div className="pt-2">
              <Link 
                href={`/customer/login?shop=${shopSlug}`}
                className="inline-block w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black font-semibold py-3 rounded-md transition-all text-sm"
              >
                เข้าสู่ระบบ
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6 border-b border-[#262626] pb-4 flex items-center gap-3">
              <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
              <div>
                <h2 className="text-xl font-semibold text-[#F3F3F3] tracking-wide">ตั้งรหัสผ่านใหม่</h2>
                <p className="text-xs text-[#9CA3AB] mt-1">กำหนดรหัสผ่านใหม่ที่ปลอดภัยสำหรับบัญชีของคุณ</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="password">รหัสผ่านใหม่</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 pr-10 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
                  />
                  {password.length > 0 && (
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

              <div>
                <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="confirmPassword">ยืนยันรหัสผ่านใหม่</label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 pr-10 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
                  />
                  {confirmPassword.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#FFFFFF] hover:opacity-80 transition-opacity focus:outline-none"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-semibold py-3 rounded-md transition-all mt-6 shadow-[0_4px_15px_rgba(255,255,255,0.15)] disabled:opacity-50"
              >
                {isPending ? 'กำลังบันทึกรหัสผ่านใหม่...' : 'ตั้งรหัสผ่านใหม่'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center text-[#F3F3F3]">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
