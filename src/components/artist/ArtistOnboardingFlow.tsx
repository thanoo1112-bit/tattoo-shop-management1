'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { updateArtistOnboarding, addArtistSpecialty, removeArtistSpecialty } from '@/app/(dashboard)/artist/onboarding/actions'

type Profile = { full_name: string; phone: string; email: string }
type Specialty = { style_id: string; name: string }

export default function ArtistOnboardingFlow({ 
  initialProfile, 
  initialSpecialties, 
  catalog 
}: { 
  initialProfile: Profile
  initialSpecialties: Specialty[]
  catalog: Specialty[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isStylePending, startStyleTransition] = useTransition()
  
  const [formData, setFormData] = useState({
    displayName: initialProfile.full_name || '',
    phone: initialProfile.phone || '',
  })
  
  const [selectedStyles, setSelectedStyles] = useState<Specialty[]>(initialSpecialties)
  const [customStyle, setCustomStyle] = useState('')
  const [availableStyles, setAvailableStyles] = useState<Specialty[]>(catalog)
  
  // Sync props on router.refresh()
  useEffect(() => {
    setSelectedStyles(initialSpecialties)
    setAvailableStyles(catalog)
  }, [initialSpecialties, catalog])

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const toggleStyle = (style: Specialty) => {
    startStyleTransition(async () => {
      const exists = selectedStyles.find(s => s.style_id === style.style_id)
      if (exists) {
        const res = await removeArtistSpecialty(style.style_id)
        if (res.success) {
          setSelectedStyles(prev => prev.filter(s => s.style_id !== style.style_id))
        }
      } else {
        const res = await addArtistSpecialty(style.name)
        if (res.success) {
          router.refresh() // To fetch the new style ID from server if it was custom, or we can just refresh to get updated lists.
        }
      }
    })
  }

  const handleAddCustomStyle = (e: React.FormEvent) => {
    e.preventDefault()
    const styleToAdd = customStyle.trim()
    if (!styleToAdd) return
    
    startStyleTransition(async () => {
      const res = await addArtistSpecialty(styleToAdd)
      if (res.success) {
        setCustomStyle('')
        router.refresh()
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const newErrors: Record<string, string> = {}
    if (!formData.displayName.trim()) newErrors.displayName = 'กรุณากรอกชื่อที่ใช้แสดง'
    if (!formData.phone.trim()) newErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์'
    if (selectedStyles.length === 0) newErrors.styles = 'กรุณาเลือกอย่างน้อย 1 สไตล์งานที่รับ'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    startTransition(async () => {
      const result = await updateArtistOnboarding(formData)
      if (result.success) {
        router.push('/artist/dashboard')
        router.refresh()
      } else {
        setErrors({ general: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่' })
      }
    })
  }

  const inputClassName = "w-full bg-[#121212] border border-[#262626] text-[#F5F5F5] rounded-xl px-4 py-3 placeholder:text-[#737373] focus:outline-none focus:border-[#E5E5E5] focus:ring-0 transition-shadow"

  return (
    <div className="max-w-4xl mx-auto w-full pt-6 pb-20">
      <div className="text-center mb-10">
        <h1 className="text-sm font-medium tracking-[0.2em] text-[#A3A3A3] uppercase mb-4">157 Tattoo</h1>
        <h2 className="text-3xl font-light text-[#F5F5F5] mb-3">ตั้งค่าโปรไฟล์ช่างสัก</h2>
        <p className="text-[#737373] max-w-lg mx-auto">กรอกข้อมูลเบื้องต้นเพื่อให้ลูกค้ารู้จักคุณและเลือกงานที่คุณรับ</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-8">
        <div className="w-full lg:w-2/3 space-y-6">
          {errors.general && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{errors.general}</div>}

          <div className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626]">
            <h3 className="text-lg font-medium text-[#F5F5F5] mb-6">ข้อมูลโปรไฟล์</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#A3A3A3] mb-2">อีเมล (ไม่สามารถแก้ไขได้)</label>
                <input type="email" value={initialProfile.email} disabled className=" opacity-50 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm text-[#A3A3A3] mb-2">ชื่อที่ใช้แสดง *</label>
                <input type="text" name="displayName" placeholder="เช่น ธน" value={formData.displayName} onChange={handleInputChange} className={`${inputClassName} focus:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_8px_rgba(255,255,255,0.05)]`} />
                {errors.displayName && <p className="text-red-400 text-xs mt-1.5">{errors.displayName}</p>}
              </div>
              <div>
                <label className="block text-sm text-[#A3A3A3] mb-2">เบอร์โทรศัพท์ *</label>
                <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className={`${inputClassName} focus:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_8px_rgba(255,255,255,0.05)]`} />
                {errors.phone && <p className="text-red-400 text-xs mt-1.5">{errors.phone}</p>}
              </div>
            </div>
          </div>

          <div className="bg-[#0A0A0A] p-6 rounded-2xl border border-[#262626]">
            <div className="mb-6">
              <h3 className="text-lg font-medium text-[#F5F5F5] mb-1">สไตล์งานที่รับ</h3>
              <p className="text-[#737373] text-sm">เลือกสไตล์งานสักที่คุณรับทำ ลูกค้าจะเห็นเฉพาะสไตล์ที่คุณเลือกไว้</p>
            </div>
            <div className="flex flex-wrap gap-2.5 mb-6">
              {availableStyles.map(style => {
                const isSelected = selectedStyles.some(s => s.style_id === style.style_id)
                return (
                  <button key={style.style_id} type="button" onClick={() => toggleStyle(style)} disabled={isStylePending} className={`${isSelected ? 'bg-[#F5F5F5] text-black shadow-[0_0_10px_rgba(255,255,255,0.1)]' : 'bg-[#121212] text-[#A3A3A3] border border-[#262626] hover:border-[#737373] hover:text-[#E5E5E5]'} px-4 py-2 rounded-full text-sm font-medium transition-all min-h-[44px] disabled:opacity-50`}>
                    {style.name}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              <input type="text" placeholder="เพิ่มสไตล์อื่น" value={customStyle} onChange={e => setCustomStyle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddCustomStyle(e) }} disabled={isStylePending} className="flex-1 max-w-[200px] bg-[#121212] border border-[#262626] text-[#F5F5F5] rounded-full px-4 py-2.5 text-sm placeholder:text-[#737373] focus:outline-none focus:border-[#737373] min-h-[44px] disabled:opacity-50" />
              <button type="button" onClick={handleAddCustomStyle} disabled={isStylePending || !customStyle.trim()} className="w-11 h-11 flex items-center justify-center rounded-full border border-[#262626] text-[#A3A3A3] hover:text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors disabled:opacity-50">
                {isStylePending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus size={18} />}
              </button>
            </div>
            {errors.styles && <p className="text-red-400 text-xs mt-3">{errors.styles}</p>}
          </div>

          <div className="flex gap-4 pt-2">
            <button type="submit" disabled={isPending || isStylePending} className="w-full py-4 text-center rounded-xl bg-[#F5F5F5] text-black hover:bg-[#E5E5E5] transition-colors font-medium shadow-[0_0_15px_rgba(255,255,255,0.1)] min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2">
              {isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              {isPending ? 'กำลังบันทึก...' : 'เสร็จสิ้นการตั้งค่า'}
            </button>
          </div>
        </div>
        
        <div className="hidden lg:block w-1/3 shrink-0">
          <div className="sticky top-24 bg-[#121212] border border-[#262626] rounded-2xl p-6">
            <h3 className="text-sm font-medium text-[#A3A3A3] uppercase tracking-wider mb-6 pb-4 border-b border-[#262626]">ตัวอย่างโปรไฟล์ที่ลูกค้าจะเห็น</h3>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-[#262626] rounded-full flex items-center justify-center text-[#F5F5F5] font-medium text-xl">
                {formData.displayName ? formData.displayName.charAt(0) : '?'}
              </div>
              <div>
                <h4 className="text-[#F5F5F5] font-medium text-lg leading-tight">{formData.displayName || 'ชื่อช่าง'}</h4>
                <p className="text-[#A3A3A3] text-sm">Tattoo Artist</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-[#737373] mb-1">สไตล์งานที่รับ</p>
                <p className="text-[#E5E5E5] text-sm">
                  {selectedStyles.length > 0 ? selectedStyles.map(s => s.name).join(' • ') : <span className="text-[#737373] italic">ยังไม่ระบุสไตล์</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}