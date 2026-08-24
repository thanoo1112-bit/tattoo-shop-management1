'use client'

import { useState, useTransition } from 'react'
import { registerOwner } from './actions'
import { BrandLogo } from '@/components/brand-logo'
import Link from 'next/link'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirm_password') as string

    if (password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน')
      return
    }

    startTransition(async () => {
      const result = await registerOwner(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="min-h-screen relative bg-[#0A0A0A] text-[#F3F3F3] flex items-center justify-center p-4 py-12 overflow-hidden z-0">
      <div className="relative z-20 max-w-xl w-full bg-[#171717]/95 backdrop-blur-sm p-10 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.4)] border border-[#262626] border-t-[#FFFFFF] border-t-[3px]">
        <div className="flex justify-center mb-8">
          <BrandLogo />
        </div>
        
        <div className="mb-6 border-b border-[#262626] pb-4 flex items-center gap-3">
          <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
          <div>
            <h2 className="text-xl font-medium text-[#F3F3F3] tracking-wide">สร้างบัญชีร้าน</h2>
            <p className="text-xs text-[#9CA3AB] mt-1">สำหรับเจ้าของร้านสัก</p>
          </div>
        </div>

        {error && (
          <div className="bg-[#FFFFFF]/10 border border-[#FFFFFF]/30 text-black p-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        <form action={handleSubmit} className="space-y-6 relative z-20">
          <div className="space-y-4">
            <h3 className="text-xs font-medium text-[#747C85] uppercase tracking-wider">ข้อมูลส่วนตัว</h3>
            
            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="full_name">ชื่อ - นามสกุล</label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
              />
            </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="password">รหัสผ่าน</label>
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
                <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="confirm_password">ยืนยันรหัสผ่าน</label>
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  minLength={6}
                  className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-[#262626]">
            <h3 className="text-xs font-medium text-[#747C85] uppercase tracking-wider">ข้อมูลร้าน</h3>
            
            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="shop_name">ชื่อร้าน</label>
              <input
                id="shop_name"
                name="shop_name"
                type="text"
                required
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
              />
            </div>

            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="phone">เบอร์โทรศัพท์ร้าน</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner"
              />
            </div>

            <div>
              <label className="block text-sm text-[#9CA3AB] mb-1.5" htmlFor="address">ที่อยู่ร้าน</label>
              <textarea
                id="address"
                name="address"
                required
                rows={3}
                className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all shadow-inner resize-none"
              ></textarea>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-medium py-3 rounded-md transition-all mt-8 shadow-[0_4px_15px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] focus:ring-2 focus:ring-[#FFFFFF]/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชีและเริ่มต้นใช้งาน'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-[#747C85] relative z-20">
          มีบัญชีร้านอยู่แล้ว? <Link href="/login" className="text-[#C8CDD3] hover:text-[#F3F3F3] transition-colors">เข้าสู่ระบบ</Link>
        </div>
      </div>
    </div>
  )
}
