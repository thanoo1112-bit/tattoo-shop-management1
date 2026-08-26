'use client'

import { useState } from 'react'
import { Plus, X, Pencil, Trash2, Zap, Loader2, Image as ImageIcon, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react'
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
  status: 'open' | 'closed' | 'held' | 'reserved';
  booking_request_id: string | null;
  created_at: string;
  artist_name: string;
  style_name: string;
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

const statusLabel = (status: string) => {
  switch (status) {
    case 'open': return { label: 'เปิดรับจอง', cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' }
    case 'closed': return { label: 'ปิดรับจอง', cls: 'bg-[#262626] text-[#737373] border border-[#333]' }
    case 'held': return { label: 'กำลังถือครอง', cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' }
    case 'reserved': return { label: 'ถูกจองแล้ว', cls: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' }
    default: return { label: status, cls: 'bg-[#262626] text-[#737373] border border-[#333]' }
  }
}

const EMPTY_FORM = {
  artistId: '',
  styleName: '',
  size: '',
  price: '',
  status: 'open' as 'open' | 'closed',
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
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from('flash-images').getPublicUrl(path)
    return data.publicUrl
  }

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setImageFile(null)
    setImagePreview(null)
    setError(null)
  }

  const openCreate = () => {
    resetForm()
    setIsCreateOpen(true)
  }

  const openEdit = (item: FlashItem) => {
    setEditingItem(item)
    setForm({
      artistId: item.artist_id,
      styleName: item.style_name,
      size: item.size,
      price: item.price.toString(),
      status: item.status === 'open' ? 'open' : 'closed',
    })
    setImageFile(null)
    setImagePreview(null)
    setError(null)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  const validate = () => {
    if (!form.artistId) return 'กรุณาเลือกช่างสัก'
    const trimmedStyle = (form.styleName || '').trim()
    if (!trimmedStyle) return 'กรุณาระบุสไตล์งาน'
    if (trimmedStyle.length > 100) return 'สไตล์งานต้องมีความยาวไม่เกิน 100 ตัวอักษร'
    const trimmedSize = (form.size || '').trim()
    if (!trimmedSize) return 'กรุณาระบุขนาดงาน'
    if (trimmedSize.length > 50) return 'ขนาดงานต้องมีความยาวไม่เกิน 50 ตัวอักษร'
    const priceNum = parseFloat(form.price)
    if (isNaN(priceNum) || priceNum <= 0) return 'กรุณาระบุราคามากกว่า 0'
    return null
  }

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

      const { data: inserted, error: insErr } = await supabase
        .from('flash_designs')
        .insert({
          shop_id: shopId,
          artist_id: form.artistId,
          style_name: form.styleName.trim(),
          image_path: filePath,
          size: form.size,
          price: parseFloat(form.price),
          status: form.status,
        })
        .select(`*, profiles(full_name)`)
        .single()

      if (insErr || !inserted) throw new Error('บันทึกข้อมูลไม่สำเร็จ')

      const newItem: FlashItem = {
        ...inserted,
        artist_name: (inserted as any).profiles?.full_name || 'ช่างนิรนาม',
        style_name: inserted.style_name,
      }
      setItems(prev => [newItem, ...prev])
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

      const { data: updated, error: updErr } = await supabase
        .from('flash_designs')
        .update({
          artist_id: form.artistId,
          style_name: form.styleName.trim(),
          image_path: imagePath,
          size: form.size,
          price: parseFloat(form.price),
          status: form.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingItem.id)
        .select(`*, profiles(full_name)`)
        .single()

      if (updErr || !updated) throw new Error('อัปเดตข้อมูลไม่สำเร็จ')

      const updatedItem: FlashItem = {
        ...updated,
        artist_name: (updated as any).profiles?.full_name || 'ช่างนิรนาม',
        style_name: updated.style_name,
      }
      setItems(prev => prev.map(i => i.id === editingItem.id ? updatedItem : i))
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
      setError('ไม่สามารถลบ Flash ที่มีคำขอจองได้')
      setDeletingItem(null)
      return
    }
    setLoading(true)
    try {
      const { error: delErr } = await supabase
        .from('flash_designs')
        .delete()
        .eq('id', deletingItem.id)
      if (delErr) throw new Error('ลบข้อมูลไม่สำเร็จ')
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

  const FormFields = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-5">
      {/* Image */}
      <div>
        <label className="block text-sm font-medium text-[#A3A3A3] mb-2">รูป Flash *</label>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {(imagePreview || (isEdit && editingItem?.image_path)) && (
            <div className="relative w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden border border-[#262626] bg-[#121212]">
              <img
                src={imagePreview || getImageUrl(editingItem!.image_path)}
                alt="preview"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="flex-1">
            <label className="cursor-pointer flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#333] rounded-xl p-4 hover:border-[#555] transition-colors bg-[#0A0A0A] min-h-[80px]">
              <ImageIcon className="h-6 w-6 text-[#555]" />
              <span className="text-xs text-[#555]">
                {imageFile ? imageFile.name : (isEdit ? 'เลือกรูปใหม่ (ถ้าต้องการเปลี่ยน)' : 'อัปโหลดรูป Flash')}
              </span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleImageChange} />
            </label>
          </div>
        </div>
      </div>

      {/* Flash Code (display only on edit) */}
      {isEdit && editingItem && (
        <div>
          <label className="block text-sm font-medium text-[#A3A3A3] mb-2">รหัสงาน</label>
          <div className="px-4 py-3 rounded-xl bg-[#0A0A0A] border border-[#1F1F1F] text-[#F5F5F5] font-mono text-sm tracking-widest">
            {editingItem.flash_code}
          </div>
          <p className="text-xs text-[#555] mt-1">รหัสงานถูกสร้างโดยระบบ และไม่สามารถเปลี่ยนแปลงได้</p>
        </div>
      )}

      {/* Artist */}
      <div>
        <label className="block text-sm font-medium text-[#A3A3A3] mb-2">ช่างสัก *</label>
        <select
          value={form.artistId}
          onChange={e => setForm(f => ({ ...f, artistId: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#555] appearance-none"
        >
          <option value="">เลือกช่างสัก</option>
          {artists.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Style */}
      <div>
        <label className="block text-sm font-medium text-[#A3A3A3] mb-2">สไตล์งาน *</label>
        <input
          type="text"
          value={form.styleName}
          onChange={e => setForm(f => ({ ...f, styleName: e.target.value }))}
          placeholder="เช่น Japanese, Fine Line, Dark Art"
          className="w-full px-4 py-3 rounded-xl bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#555]"
        />
      </div>

      {/* Size */}
      <div>
        <label className="block text-sm font-medium text-[#A3A3A3] mb-2">ขนาดงาน *</label>
        <input
          type="text"
          value={form.size}
          onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
          placeholder="เช่น 8 × 12 ซม."
          className="w-full px-4 py-3 rounded-xl bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#555]"
        />
      </div>

      {/* Price */}
      <div>
        <label className="block text-sm font-medium text-[#A3A3A3] mb-2">ราคา *</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A3A3A3] text-sm">฿</span>
          <input
            type="number"
            min="1"
            step="100"
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            placeholder="เช่น 2500"
            className="w-full pl-8 pr-4 py-3 rounded-xl bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] text-sm focus:outline-none focus:border-[#555]"
          />
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium text-[#A3A3A3] mb-2">สถานะ</label>
        <div className="flex gap-2">
          {(['open', 'closed'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setForm(f => ({ ...f, status: s }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
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
          <p className="text-[#444] text-xs mt-1">กด "+ เพิ่ม Flash" เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const st = statusLabel(item.status)
            const isLocked = item.status === 'reserved'
            return (
              <div key={item.id} className="bg-[#121212] border border-[#1F1F1F] rounded-2xl overflow-hidden flex flex-col">
                {/* Image */}
                <div className="relative aspect-square bg-[#0A0A0A]">
                  <img
                    src={getImageUrl(item.image_path)}
                    alt={item.flash_code}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="bg-[#000]/70 backdrop-blur-sm text-[#F5F5F5] font-mono text-xs px-2 py-1 rounded-lg font-semibold tracking-widest">
                      {item.flash_code}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-[#737373] truncate">{item.artist_name}</p>
                      <p className="text-xs text-[#555] truncate">{item.style_name}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex-shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#A3A3A3] border border-[#262626] px-2.5 py-1 rounded-lg">
                      ขนาด {item.size}
                    </span>
                    <span className="text-base font-bold text-[#F5F5F5]">
                      ฿{Number(item.price).toLocaleString()}
                    </span>
                  </div>

                  {/* Actions */}
                  {isLocked ? (
                    <div className="pt-1 text-center text-xs text-[#555] bg-[#0A0A0A] rounded-xl py-2.5 border border-[#1F1F1F]">
                      ถูกจองแล้ว — ไม่สามารถแก้ไขได้
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleToggleStatus(item)}
                        disabled={item.status === 'held'}
                        title={item.status === 'open' ? 'ปิดรับจอง' : 'เปิดรับจอง'}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border border-[#262626] text-[#A3A3A3] hover:border-[#555] hover:text-[#F5F5F5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {item.status === 'open'
                          ? <><ToggleRight className="w-3.5 h-3.5 text-emerald-400" />เปิดอยู่</>
                          : <><ToggleLeft className="w-3.5 h-3.5" />ปิดอยู่</>
                        }
                      </button>
                      <button
                        onClick={() => openEdit(item)}
                        className="px-3 py-2 rounded-xl text-xs border border-[#262626] text-[#A3A3A3] hover:border-[#555] hover:text-[#F5F5F5] transition-colors"
                        title="แก้ไข"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingItem(item)}
                        disabled={!!item.booking_request_id}
                        title={item.booking_request_id ? 'ไม่สามารถลบได้ เนื่องจากมีคำขอจอง' : 'ลบ'}
                        className="px-3 py-2 rounded-xl text-xs border border-[#262626] text-[#737373] hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm" onClick={() => { setIsCreateOpen(false); resetForm() }} />
          <div className="relative z-10 w-full sm:max-w-lg bg-[#121212] border border-[#1F1F1F] rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#1F1F1F]">
              <h2 className="text-base font-semibold text-[#F5F5F5]">เพิ่ม Flash ใหม่</h2>
              <button onClick={() => { setIsCreateOpen(false); resetForm() }} className="p-1.5 rounded-lg text-[#737373] hover:text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1">
              {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
              <FormFields />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-[#1F1F1F]">
              <button onClick={() => { setIsCreateOpen(false); resetForm() }} className="flex-1 py-3 rounded-xl text-sm font-medium border border-[#262626] text-[#737373] hover:text-[#F5F5F5] hover:border-[#555] transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleCreate} disabled={loading} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[#F5F5F5] text-[#0A0A0A] hover:bg-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm" onClick={() => { setEditingItem(null); resetForm() }} />
          <div className="relative z-10 w-full sm:max-w-lg bg-[#121212] border border-[#1F1F1F] rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#1F1F1F]">
              <h2 className="text-base font-semibold text-[#F5F5F5]">แก้ไข {editingItem.flash_code}</h2>
              <button onClick={() => { setEditingItem(null); resetForm() }} className="p-1.5 rounded-lg text-[#737373] hover:text-[#F5F5F5] hover:bg-[#1F1F1F] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 flex-1">
              {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
              <FormFields isEdit />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-[#1F1F1F]">
              <button onClick={() => { setEditingItem(null); resetForm() }} className="flex-1 py-3 rounded-xl text-sm font-medium border border-[#262626] text-[#737373] hover:text-[#F5F5F5] hover:border-[#555] transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleEdit} disabled={loading} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[#F5F5F5] text-[#0A0A0A] hover:bg-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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
            {deletingItem.booking_request_id && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                ไม่สามารถลบได้ เนื่องจาก Flash นี้มีคำขอจองที่เกี่ยวข้อง
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeletingItem(null)} className="flex-1 py-3 rounded-xl text-sm border border-[#262626] text-[#737373] hover:text-[#F5F5F5] hover:border-[#555] transition-colors">
                ยกเลิก
              </button>
              {!deletingItem.booking_request_id && (
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
