'use client'

import { useState, useCallback } from 'react'
import { Plus, X, Pencil, Trash2, Zap, Loader2, Image as ImageIcon, ToggleLeft, ToggleRight, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { optimizeImage } from '@/lib/images/optimize-image'

interface FlashItem {
  id: string;
  shop_id: string;
  flash_code: string;
  artist_id: string;
  style_id: string | null;
  image_path: string;
  size: string;
  price: number;
  status: 'open' | 'closed' | 'held' | 'reserved' | 'sold';
  booking_request_id: string | null;
  created_at: string;
  artist_name: string;
  style_name: string;
}

interface FlashVariant {
  id?: string;
  size_name: string;
  min_size_cm: string;
  max_size_cm: string;
  price: string;
  is_enabled: boolean;
  sort_order?: number;
}

interface Artist {
  id: string
  name: string
}

interface Props {
  shopId: string
  initialItems: FlashItem[]
  artists: Artist[]
}

const DEFAULT_VARIANTS: FlashVariant[] = [
  { size_name: 'เล็กมาก', min_size_cm: '3', max_size_cm: '5', price: '', is_enabled: true },
  { size_name: 'เล็ก', min_size_cm: '6', max_size_cm: '8', price: '', is_enabled: true },
  { size_name: 'กลาง', min_size_cm: '9', max_size_cm: '12', price: '', is_enabled: true },
  { size_name: 'ใหญ่', min_size_cm: '13', max_size_cm: '17', price: '', is_enabled: true },
  { size_name: 'ใหญ่พิเศษ', min_size_cm: '18', max_size_cm: '', price: '', is_enabled: true },
]

const statusLabel = (status: string) => {
  switch (status) {
    case 'open': return { label: 'เปิดรับจอง', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
    case 'closed': return { label: 'ปิดรับจอง', cls: 'bg-[#262626] text-[#737373] border border-[#333]' }
    case 'held': return { label: 'กำลังถือครอง', cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' }
    case 'reserved': return { label: 'ถูกจองแล้ว', cls: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' }
    case 'sold': return { label: 'ขายแล้ว', cls: 'bg-[#262626] text-[#6B7280] border border-[#444] line-through' }
    default: return { label: status, cls: 'bg-[#262626] text-[#737373] border border-[#333]' }
  }
}

const EMPTY_FORM = {
  artistId: '',
  styleName: '',
  status: 'open' as 'open' | 'closed',
}

function formatVariantSize(v: { size_name: string; min_size_cm?: number | string | null; max_size_cm?: number | string | null }) {
  const min = v.min_size_cm !== null && v.min_size_cm !== undefined && v.min_size_cm !== '' ? Number(v.min_size_cm) : null;
  const max = v.max_size_cm !== null && v.max_size_cm !== undefined && v.max_size_cm !== '' ? Number(v.max_size_cm) : null;
  if (min !== null) {
    if (max !== null) return `${v.size_name} (${min}–${max} ซม.)`;
    return `${v.size_name} (${min} ซม. ขึ้นไป)`;
  }
  return v.size_name;
}

export default function OwnerFlashManager({ shopId, initialItems, artists }: Props) {
  const supabase = createClient()
  const [items, setItems] = useState<FlashItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<FlashItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<FlashItem | null>(null)

  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [variants, setVariants] = useState<FlashVariant[]>([])
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from('flash-images').getPublicUrl(path)
    return data.publicUrl
  }

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setVariants([])
    setImageFile(null)
    setImagePreview(null)
    setError(null)
  }

  const openCreate = () => {
    resetForm()
    setVariants(DEFAULT_VARIANTS.map((v, i) => ({ ...v, sort_order: i })))
    setIsCreateOpen(true)
  }

  const openEdit = async (item: FlashItem) => {
    setEditingItem(item)
    setForm({
      artistId: item.artist_id,
      styleName: item.style_name,
      status: item.status === 'open' ? 'open' : 'closed',
    })
    setImageFile(null)
    setImagePreview(null)
    setError(null)
    setVariants([])
    setVariantsLoading(true)
    try {
      const { data } = await supabase
        .from('flash_design_variants')
        .select('*')
        .eq('flash_design_id', item.id)
        .order('sort_order', { ascending: true })
      if (data && data.length > 0) {
        setVariants(data.map(v => ({
          id: v.id,
          size_name: v.size_name,
          min_size_cm: v.min_size_cm !== null && v.min_size_cm !== undefined ? String(v.min_size_cm) : '',
          max_size_cm: v.max_size_cm !== null && v.max_size_cm !== undefined ? String(v.max_size_cm) : '',
          price: String(v.price),
          is_enabled: v.is_enabled,
          sort_order: v.sort_order,
        })))
      } else {
        // Legacy: No variants yet — show 1 row with parent size/price
        setVariants([{
          size_name: item.size,
          min_size_cm: '',
          max_size_cm: '',
          price: String(item.price),
          is_enabled: true,
        }])
      }
    } catch {
      setVariants([{
        size_name: item.size,
        min_size_cm: '',
        max_size_cm: '',
        price: String(item.price),
        is_enabled: true,
      }])
    } finally {
      setVariantsLoading(false)
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  const addVariant = () => {
    setVariants(prev => [...prev, {
      size_name: '',
      min_size_cm: '',
      max_size_cm: '',
      price: '',
      is_enabled: true,
      sort_order: prev.length,
    }])
  }

  const removeVariant = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index))
  }

  const updateVariant = (index: number, field: keyof FlashVariant, value: string | boolean) => {
    setVariants(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v))
  }

  const validate = () => {
    if (!form.artistId) return 'กรุณาเลือกช่างสัก'
    const trimmedStyle = (form.styleName || '').trim()
    if (!trimmedStyle) return 'กรุณาระบุสไตล์งาน'
    if (trimmedStyle.length > 100) return 'สไตล์งานต้องมีความยาวไม่เกิน 100 ตัวอักษร'
    if (variants.length === 0) return 'กรุณาเพิ่มขนาดอย่างน้อย 1 ขนาด'
    const enabledCount = variants.filter(v => v.is_enabled).length
    if (enabledCount === 0) return 'ต้องเปิดใช้งานขนาดอย่างน้อย 1 ขนาด'
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]
      if (!v.size_name.trim()) return `กรุณาระบุชื่อขนาดที่ ${i + 1}`
      const priceNum = parseFloat(v.price)
      if (isNaN(priceNum) || priceNum < 0) return `กรุณาระบุราคาของขนาดที่ ${i + 1} (ต้องไม่ต่ำกว่า 0)`
      if (priceNum === 0 && v.is_enabled) return `กรุณาระบุราคาของขนาดที่ ${i + 1}`
    }
    return null
  }

  const buildVariantsPayload = () => variants.map((v, i) => ({
    id: v.id || null,
    size_name: v.size_name.trim(),
    min_size_cm: v.min_size_cm !== '' ? Number(v.min_size_cm) : null,
    max_size_cm: v.max_size_cm !== '' ? Number(v.max_size_cm) : null,
    price: parseFloat(v.price),
    is_enabled: v.is_enabled,
    sort_order: i,
  }))

  const handleCreate = async () => {
    const err = validate()
    if (err) { setError(err); return }
    if (!imageFile) { setError('กรุณาอัปโหลดรูป Flash'); return }

    setLoading(true)
    setError(null)
    try {
      const optimized = await optimizeImage(imageFile, { preset: 'portfolio' })
      const ext = '.webp'
      const filePath = `${shopId}/${crypto.randomUUID()}${ext}`
      const { error: upErr } = await supabase.storage
        .from('flash-images')
        .upload(filePath, optimized, { upsert: false, contentType: 'image/webp' })
      if (upErr) throw new Error('อัปโหลดรูปไม่สำเร็จ')

      const variantsPayload = buildVariantsPayload()

      const { data: newFlashId, error: rpcErr } = await supabase.rpc('upsert_flash_design_with_variants', {
        p_flash_id: null,
        p_shop_id: shopId,
        p_artist_id: form.artistId,
        p_style_name: form.styleName.trim(),
        p_image_path: filePath,
        p_status: form.status,
        p_variants: variantsPayload as unknown as string,
      })

      if (rpcErr || !newFlashId) throw new Error(rpcErr?.message || 'บันทึกข้อมูลไม่สำเร็จ')

      // Fetch the newly created flash to display
      const { data: inserted } = await supabase
        .from('flash_designs')
        .select(`*, profiles(full_name)`)
        .eq('id', newFlashId)
        .single()

      if (inserted) {
        const newItem: FlashItem = {
          ...inserted,
          artist_name: (inserted as any).profiles?.full_name || 'ช่างนิรนาม',
          style_name: inserted.style_name,
        }
        setItems(prev => [newItem, ...prev])
      }
      setSuccess('เพิ่ม Flash เรียบร้อยแล้ว')
      setIsCreateOpen(false)
      resetForm()
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!editingItem) return
    const err = validate()
    if (err) { setError(err); return }

    setLoading(true)
    setError(null)
    try {
      let imagePath = editingItem.image_path

      if (imageFile) {
        const optimized = await optimizeImage(imageFile, { preset: 'portfolio' })
        const filePath = `${shopId}/${crypto.randomUUID()}.webp`
        const { error: upErr } = await supabase.storage
          .from('flash-images')
          .upload(filePath, optimized, { upsert: false, contentType: 'image/webp' })
        if (upErr) throw new Error('อัปโหลดรูปไม่สำเร็จ')
        imagePath = filePath
      }

      const variantsPayload = buildVariantsPayload()

      const { error: rpcErr } = await supabase.rpc('upsert_flash_design_with_variants', {
        p_flash_id: editingItem.id,
        p_shop_id: shopId,
        p_artist_id: form.artistId,
        p_style_name: form.styleName.trim(),
        p_image_path: imagePath,
        p_status: form.status,
        p_variants: variantsPayload as unknown as string,
      })

      if (rpcErr) throw new Error(rpcErr?.message || 'อัปเดตข้อมูลไม่สำเร็จ')

      // Refetch updated flash
      const { data: updated } = await supabase
        .from('flash_designs')
        .select(`*, profiles(full_name)`)
        .eq('id', editingItem.id)
        .single()

      if (updated) {
        const updatedItem: FlashItem = {
          ...updated,
          artist_name: (updated as any).profiles?.full_name || 'ช่างนิรนาม',
          style_name: updated.style_name,
        }
        setItems(prev => prev.map(i => i.id === editingItem.id ? updatedItem : i))
      }
      setSuccess('อัปเดต Flash เรียบร้อยแล้ว')
      setEditingItem(null)
      resetForm()
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (item: FlashItem) => {
    if (item.status === 'reserved') return
    if (item.status === 'held') return
    if (item.status === 'sold') return
    const newStatus = item.status === 'open' ? 'closed' : 'open'
    const { error: updErr } = await supabase
      .from('flash_designs')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (updErr) { setError('อัปเดตสถานะไม่สำเร็จ'); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: newStatus } : i))
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    if (deletingItem.booking_request_id) {
      setError('ไม่สามารถลบได้ เนื่องจาก Flash นี้มีคำขอจองที่เกี่ยวข้อง')
      return
    }
    if (deletingItem.status === 'held') {
      setError('ไม่สามารถลบ Flash ที่กำลังถูกจองได้')
      return
    }
    if (deletingItem.status === 'reserved') {
      setError('ไม่สามารถลบ Flash ที่ถูกจองแล้วได้')
      return
    }
    if (deletingItem.status === 'sold') {
      setError('ไม่สามารถลบ Flash ที่ขายแล้วได้')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { error: delErr } = await supabase
        .from('flash_designs')
        .delete()
        .eq('id', deletingItem.id)
      if (delErr) throw new Error(delErr.message || 'ลบข้อมูลไม่สำเร็จ')
      setItems(prev => prev.filter(i => i.id !== deletingItem.id))
      setSuccess('ลบ Flash เรียบร้อยแล้ว')
      setDeletingItem(null)
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  const renderVariantsEditor = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs sm:text-sm font-medium text-[#A3A3A3]">ขนาดและราคา *</label>
          <p className="text-[10px] text-[#555] mt-0.5">* ขนาดวัดจากด้านที่ยาวที่สุดของลาย</p>
        </div>
        <button
          type="button"
          onClick={addVariant}
          className="text-[10px] sm:text-xs text-[#A3A3A3] hover:text-[#F5F5F5] border border-[#333] hover:border-[#555] px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shrink-0"
        >
          <Plus className="w-3 h-3" /> เพิ่มขนาด
        </button>
      </div>

      {variantsLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 text-[#555] animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-[#262626] overflow-hidden">
          {/* Table Header */}
          <div className="grid bg-[#0A0A0A] border-b border-[#1F1F1F] px-2 py-1.5"
            style={{ gridTemplateColumns: '1fr 64px 64px 80px 44px 24px' }}>
            <span className="text-[9px] text-[#555] font-medium uppercase tracking-wide">ชื่อขนาด</span>
            <span className="text-[9px] text-[#555] font-medium uppercase tracking-wide text-center">ต่ำสุด</span>
            <span className="text-[9px] text-[#555] font-medium uppercase tracking-wide text-center">สูงสุด</span>
            <span className="text-[9px] text-[#555] font-medium uppercase tracking-wide text-center">ราคา (฿)</span>
            <span className="text-[9px] text-[#555] font-medium uppercase tracking-wide text-center">สถานะ</span>
            <span />
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-[#1A1A1A]">
            {variants.map((v, i) => (
              <div
                key={i}
                className={`grid items-center gap-1.5 px-2 py-1.5 transition-colors ${
                  v.is_enabled ? 'bg-[#0D0D0D] hover:bg-[#111]' : 'bg-[#080808] opacity-50'
                }`}
                style={{ gridTemplateColumns: '1fr 64px 64px 80px 44px 24px' }}
              >
                {/* Name */}
                <input
                  type="text"
                  value={v.size_name}
                  onChange={e => updateVariant(i, 'size_name', e.target.value)}
                  placeholder="เช่น กลาง"
                  className="w-full h-7 px-2 text-xs rounded-md bg-[#141414] border border-[#2A2A2A] text-[#F5F5F5] placeholder:text-[#444] focus:outline-none focus:border-[#555] transition-colors"
                />
                {/* Min */}
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={v.min_size_cm}
                  onChange={e => updateVariant(i, 'min_size_cm', e.target.value)}
                  placeholder="—"
                  className="w-full h-7 px-1.5 text-xs text-center rounded-md bg-[#141414] border border-[#2A2A2A] text-[#F5F5F5] placeholder:text-[#444] focus:outline-none focus:border-[#555] transition-colors"
                />
                {/* Max */}
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={v.max_size_cm}
                  onChange={e => updateVariant(i, 'max_size_cm', e.target.value)}
                  placeholder="ขึ้นไป"
                  className="w-full h-7 px-1.5 text-xs text-center rounded-md bg-[#141414] border border-[#2A2A2A] text-[#F5F5F5] placeholder:text-[#444] focus:outline-none focus:border-[#555] transition-colors"
                />
                {/* Price */}
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={v.price}
                  onChange={e => updateVariant(i, 'price', e.target.value)}
                  placeholder="2500"
                  className="w-full h-7 px-1.5 text-xs text-center rounded-md bg-[#141414] border border-[#2A2A2A] text-[#F5F5F5] placeholder:text-[#444] focus:outline-none focus:border-[#555] transition-colors"
                />
                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => updateVariant(i, 'is_enabled', !v.is_enabled)}
                  className={`h-7 w-full rounded-md text-[9px] font-semibold border transition-colors ${
                    v.is_enabled
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                      : 'bg-[#1A1A1A] text-[#555] border-[#333] hover:border-[#555]'
                  }`}
                >
                  {v.is_enabled ? 'เปิด' : 'ปิด'}
                </button>
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeVariant(i)}
                  disabled={variants.length <= 1}
                  className="flex items-center justify-center h-7 w-6 text-[#444] hover:text-red-400 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                  title="ลบ"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {variants.length === 0 && (
            <div className="py-6 text-center text-[11px] text-[#555]">
              ยังไม่มีขนาด — กด &quot;+ เพิ่มขนาด&quot; เพื่อเริ่มต้น
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderFormFields = (isEdit = false) => (
    <div className="space-y-4 sm:space-y-5">
      {/* Image */}
      <div>
        <label className="block text-xs sm:text-sm font-medium text-[#A3A3A3] mb-1.5 sm:mb-2">รูป Flash *</label>
        <div className="flex gap-3 items-center">
          {(imagePreview || (isEdit && editingItem?.image_path)) && (
            <div className="relative w-20 h-24 sm:w-28 sm:h-28 flex-shrink-0 rounded-xl overflow-hidden border border-[#262626] bg-[#121212]">
              <img
                src={imagePreview || getImageUrl(editingItem!.image_path)}
                alt="preview"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex-1">
            <label className="cursor-pointer flex flex-col items-center justify-center gap-1 sm:gap-2 border-2 border-dashed border-[#333] rounded-xl p-2.5 sm:p-4 hover:border-[#555] transition-colors bg-[#0A0A0A] h-24 sm:h-28 text-center w-full">
              <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6 text-[#555]" />
              <span className="text-[10px] sm:text-xs text-[#555] line-clamp-2">
                {imageFile ? imageFile.name : (isEdit ? 'เลือกรูปใหม่' : 'อัปโหลดรูป Flash')}
              </span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleImageChange} />
            </label>
          </div>
        </div>
      </div>

      {/* Flash Code (display only on edit) */}
      {isEdit && editingItem && (
        <div>
          <label className="block text-xs sm:text-sm font-medium text-[#A3A3A3] mb-1.5 sm:mb-2">รหัสงาน</label>
          <div className="h-11 sm:h-12 flex items-center px-3 sm:px-4 rounded-xl bg-[#0A0A0A] border border-[#1F1F1F] text-[#F5F5F5] font-mono text-xs sm:text-sm tracking-widest">
            {editingItem.flash_code}
          </div>
          <p className="text-[10px] sm:text-xs text-[#555] mt-1">รหัสงานถูกสร้างโดยระบบ และไม่สามารถเปลี่ยนแปลงได้</p>
        </div>
      )}

      {/* Artist */}
      <div>
        <label className="block text-xs sm:text-sm font-medium text-[#A3A3A3] mb-1.5 sm:mb-2">ช่างสัก *</label>
        <select
          value={form.artistId}
          onChange={e => setForm(f => ({ ...f, artistId: e.target.value }))}
          className="w-full h-11 sm:h-12 px-3 sm:px-4 rounded-xl bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] text-xs sm:text-sm focus:outline-none focus:border-[#555] appearance-none"
        >
          <option value="">เลือกช่างสัก</option>
          {artists.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Style */}
      <div>
        <label className="block text-xs sm:text-sm font-medium text-[#A3A3A3] mb-1.5 sm:mb-2">สไตล์งาน *</label>
        <input
          type="text"
          value={form.styleName}
          onChange={e => setForm(f => ({ ...f, styleName: e.target.value }))}
          placeholder="เช่น Japanese, Fine Line, Dark Art"
          className="w-full h-11 sm:h-12 px-3 sm:px-4 rounded-xl bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] text-xs sm:text-sm focus:outline-none focus:border-[#555]"
        />
      </div>

      {/* Variants */}
      {renderVariantsEditor()}

      {/* Status */}
      <div>
        <label className="block text-xs sm:text-sm font-medium text-[#A3A3A3] mb-1.5 sm:mb-2">สถานะ</label>
        <div className="flex gap-2">
          {(['open', 'closed'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setForm(f => ({ ...f, status: s }))}
              className={`flex-1 h-11 sm:h-12 rounded-xl text-xs sm:text-sm font-medium border transition-all ${
                form.status === s
                  ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5]'
                  : 'bg-[#0A0A0A] text-[#A3A3A3] border-[#262626] hover:border-[#555]'
              }`}
            >
              {s === 'open' ? 'เปิดรับจอง' : 'ปิดรับจอง'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Zap className="w-5 h-5 text-[#F5F5F5]" />
            <h1 className="text-xl md:text-2xl font-bold text-[#F5F5F5] tracking-tight">Flash</h1>
          </div>
          <p className="text-sm text-[#737373]">จัดการแบบพร้อมสักของร้าน</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F5F5F5] text-[#0A0A0A] text-sm font-semibold hover:bg-white transition-colors active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">เพิ่ม Flash</span>
          <span className="sm:hidden">เพิ่ม</span>
        </button>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">{success}</div>
      )}
      {error && !isCreateOpen && !editingItem && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* Flash Grid */}
      {items.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[#262626] rounded-2xl">
          <Zap className="w-10 h-10 text-[#333] mx-auto mb-4" />
          <p className="text-[#555] text-sm">ยังไม่มี Flash</p>
          <p className="text-[#444] text-xs mt-1">กด &quot;+ เพิ่ม Flash&quot; เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:flex md:flex-wrap justify-start gap-2 md:gap-6">
          {items.map(item => {
            const st = statusLabel(item.status)
            const isLocked = item.status === 'reserved' || item.status === 'sold'
            return (
              <div key={item.id} className="bg-[#121212] border border-[#1F1F1F] rounded-xl sm:rounded-2xl overflow-hidden flex flex-col w-full md:w-[360px] md:max-w-[360px] group hover:border-[#404040] transition-colors">
                {/* Image */}
                <div className="relative aspect-[4/5] max-h-[220px] sm:max-h-[300px] md:max-h-[360px] bg-[#0A0A0A] w-full overflow-hidden">
                  <img
                    src={getImageUrl(item.image_path)}
                    alt={item.flash_code}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-[#000]/70 backdrop-blur-sm text-[#F5F5F5] font-mono text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg font-semibold tracking-widest">
                      {item.flash_code}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-2.5 sm:p-4 md:p-[18px] flex-1 flex flex-col gap-2.5 sm:gap-3">
                  <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs text-[#737373] truncate">{item.artist_name}</p>
                      <p className="text-[10px] sm:text-xs text-[#555] truncate">{item.style_name}</p>
                    </div>
                    <span className={`text-[8px] sm:text-[10px] font-semibold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg flex-shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-semibold text-[#A3A3A3] border border-[#262626] px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg">
                      {item.size}
                    </span>
                    <span className="text-xs sm:text-base font-bold text-[#F5F5F5]">
                      ฿{Number(item.price).toLocaleString()}
                    </span>
                  </div>

                  {/* Actions */}
                  {isLocked ? (
                    <div className="pt-0.5 sm:pt-1 text-center text-[9px] sm:text-xs text-[#555] bg-[#0A0A0A] rounded-lg sm:rounded-xl py-2 sm:py-2.5 border border-[#1F1F1F]">
                      {item.status === 'sold' ? 'ขายแล้ว — ไม่สามารถแก้ไขได้' : 'ถูกจองแล้ว — ไม่สามารถแก้ไขได้'}
                    </div>
                  ) : (
                    <div className="flex gap-1.5 sm:gap-2 pt-0.5 sm:pt-1">
                      <button
                        onClick={() => handleToggleStatus(item)}
                        disabled={item.status === 'held'}
                        title={item.status === 'open' ? 'ปิดรับจอง' : 'เปิดรับจอง'}
                        className="flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-medium border border-[#262626] text-[#A3A3A3] hover:border-[#555] hover:text-[#F5F5F5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {item.status === 'open'
                          ? <><ToggleRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />เปิดอยู่</>
                          : <><ToggleLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />ปิดอยู่</>
                        }
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs border border-[#262626] text-[#A3A3A3] hover:border-[#555] hover:text-[#F5F5F5] transition-colors"
                        title="แก้ไข"
                      >
                        <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                      <button
                        onClick={() => { setError(null); setSuccess(null); setDeletingItem(item); }}
                        title="ลบ"
                        className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs border border-[#262626] text-[#737373] hover:border-red-500/40 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 pt-8 sm:p-4">
          <div className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm" onClick={() => { setIsCreateOpen(false); resetForm() }} />
          <div className="relative z-10 w-[calc(100%-24px)] sm:w-full sm:max-w-lg bg-[#121212] border border-[#1F1F1F] rounded-2xl flex flex-col max-h-[82dvh] sm:max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:px-6 sm:py-5 border-b border-[#1F1F1F] sticky top-0 bg-[#121212] z-20 rounded-t-2xl">
              <h2 className="text-base font-semibold text-[#F5F5F5]">เพิ่ม Flash ใหม่</h2>
              <button onClick={() => { setIsCreateOpen(false); resetForm() }} className="p-1.5 rounded-lg text-[#737373] hover:text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 sm:px-6 sm:py-5 flex-1">
              {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
              {renderFormFields()}
            </div>
            <div className="flex gap-3 p-4 sm:px-6 sm:py-4 border-t border-[#1F1F1F] sticky bottom-0 bg-[#121212] z-20 rounded-b-2xl">
              <button onClick={() => { setIsCreateOpen(false); resetForm() }} className="flex-1 py-2.5 sm:py-3 rounded-xl text-sm font-medium border border-[#262626] text-[#737373] hover:text-[#F5F5F5] hover:border-[#555] transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleCreate} disabled={loading} className="flex-1 py-2.5 sm:py-3 rounded-xl text-sm font-semibold bg-[#F5F5F5] text-[#0A0A0A] hover:bg-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 pt-8 sm:p-4">
          <div className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm" onClick={() => { setEditingItem(null); resetForm() }} />
          <div className="relative z-10 w-[calc(100%-24px)] sm:w-full sm:max-w-lg bg-[#121212] border border-[#1F1F1F] rounded-2xl flex flex-col max-h-[82dvh] sm:max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:px-6 sm:py-5 border-b border-[#1F1F1F] sticky top-0 bg-[#121212] z-20 rounded-t-2xl">
              <h2 className="text-base font-semibold text-[#F5F5F5]">แก้ไข {editingItem.flash_code}</h2>
              <button onClick={() => { setEditingItem(null); resetForm() }} className="p-1.5 rounded-lg text-[#737373] hover:text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 sm:px-6 sm:py-5 flex-1">
              {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
              {renderFormFields(true)}
            </div>
            <div className="flex gap-3 p-4 sm:px-6 sm:py-4 border-t border-[#1F1F1F] sticky bottom-0 bg-[#121212] z-20 rounded-b-2xl">
              <button onClick={() => { setEditingItem(null); resetForm() }} className="flex-1 py-2.5 sm:py-3 rounded-xl text-sm font-medium border border-[#262626] text-[#737373] hover:text-[#F5F5F5] hover:border-[#555] transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleEdit} disabled={loading} className="flex-1 py-2.5 sm:py-3 rounded-xl text-sm font-semibold bg-[#F5F5F5] text-[#0A0A0A] hover:bg-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm" onClick={() => setDeletingItem(null)} />
          <div className="relative z-10 w-full max-w-sm bg-[#121212] border border-[#1F1F1F] rounded-2xl p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-[#F5F5F5] mb-2">ยืนยันการลบ</h3>
            <p className="text-sm text-[#737373] mb-6">
              ต้องการลบ <span className="font-mono text-[#F5F5F5] font-semibold">{deletingItem.flash_code}</span> ใช่หรือไม่? การดำเนินการนี้ไม่สามารถยกเลิกได้
            </p>
            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-left">
                {error}
              </div>
            )}
            {(deletingItem.booking_request_id || deletingItem.status === 'held' || deletingItem.status === 'reserved' || deletingItem.status === 'sold') && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-left font-medium">
                {deletingItem.status === 'held'
                  ? 'ไม่สามารถลบ Flash ที่กำลังถูกจองได้'
                  : deletingItem.status === 'reserved'
                    ? 'ไม่สามารถลบ Flash ที่ถูกจองแล้วได้'
                    : deletingItem.status === 'sold'
                      ? 'ไม่สามารถลบ Flash ที่ขายแล้วได้'
                      : 'ไม่สามารถลบได้ เนื่องจาก Flash นี้มีคำขอจองที่เกี่ยวข้อง'}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeletingItem(null)} className="flex-1 py-3 rounded-xl text-sm border border-[#262626] text-[#737373] hover:text-[#F5F5F5] hover:border-[#555] transition-colors">
                ยกเลิก
              </button>
              {(!deletingItem.booking_request_id && deletingItem.status !== 'held' && deletingItem.status !== 'reserved' && deletingItem.status !== 'sold') && (
                <button onClick={handleDelete} disabled={loading} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-red-500/80 text-white hover:bg-red-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  ลบ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
