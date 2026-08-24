'use client'

import { useState } from 'react'
import { updateShopDetails } from './actions'

interface Props {
  shopId: string
  initialName: string
  initialPhone: string
  initialAddress: string
  slug: string
}

export function OwnerShopSettingsForm({ shopId, initialName, initialPhone, initialAddress, slug }: Props) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [address, setAddress] = useState(initialAddress)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('กรุณากรอกชื่อร้าน')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)

    const formData = new FormData()
    formData.append('name', name.trim())
    formData.append('phone', phone.trim())
    formData.append('address', address.trim())

    const result = await updateShopDetails(formData)
    setLoading(false)

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess('บันทึกข้อมูลร้านแล้ว')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-500">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-md text-xs text-green-500">
          {success}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">ชื่อร้าน</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={loading}
          className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-md px-4 py-2.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373] disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">เบอร์โทรศัพท์</label>
        <input
          type="text"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          disabled={loading}
          className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-md px-4 py-2.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373] disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">ที่อยู่</label>
        <textarea
          rows={3}
          value={address}
          onChange={e => setAddress(e.target.value)}
          disabled={loading}
          className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-md px-4 py-2.5 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#737373] disabled:opacity-50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">Public Slug</label>
        <div className="text-[#A3A3A3] bg-[#141414] border border-[#2A2A2A] px-4 py-2.5 rounded-md flex items-center gap-2 text-xs">
          <span className="text-[#737373]">157tattoo.com/book/</span>
          <span>{slug}</span>
        </div>
        <p className="text-[10px] text-[#737373] mt-2">
          * Slug ใช้สำหรับระบุลิงก์การจองของร้าน ไม่สามารถแก้ไขได้
        </p>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black text-xs font-semibold rounded-md transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'กำลังบันทึก...' : 'บันทึกข้อมูลร้าน'}
        </button>
      </div>
    </form>
  )
}
