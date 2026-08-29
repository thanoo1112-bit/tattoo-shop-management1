'use client'

import { useState, useTransition } from 'react'
import { updateProfile } from './actions'
import { Customer } from '@/lib/auth/customer'

export default function ProfileForm({ initialCustomer }: { initialCustomer: Customer }) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const result = await updateProfile(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-[rgba(239,68,68,0.08)] border border-[#7F1D1D] text-[#FCA5A5] p-3 rounded-md text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-[rgba(16,185,129,0.08)] border border-[#065F46] text-[#A7F3D0] p-3 rounded-md text-sm">
          อัปเดตข้อมูลสำเร็จเรียบร้อยแล้ว
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="fullName">ชื่อ - นามสกุล</label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          defaultValue={initialCustomer.full_name}
          required
          className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="email">อีเมล (ไม่สามารถแก้ไขได้)</label>
        <input
          id="email"
          name="email"
          type="email"
          disabled
          value={initialCustomer.email || ''}
          className="w-full bg-[#1C1C1C] border border-[#262626] rounded-md p-3 text-sm text-[#737373] cursor-not-allowed focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#9CA3AB] mb-1.5" htmlFor="phone">เบอร์โทรศัพท์</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initialCustomer.phone_normalized}
          required
          placeholder="08X-XXX-XXXX"
          className="w-full bg-[#262626] border border-[#262626] rounded-md p-3 text-sm text-[#F3F3F3] focus:outline-none focus:border-[#FFFFFF] focus:ring-1 focus:ring-[#FFFFFF] transition-all"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] text-black font-semibold py-3 rounded-md transition-all mt-8 shadow-[0_4px_15px_rgba(255,255,255,0.15)] disabled:opacity-50"
      >
        {isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
      </button>
    </form>
  )
}
