'use client'

import { useState } from 'react'
import { Plus, X, Pencil, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, Loader2, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { optimizeImage } from '@/lib/images/optimize-image'

interface PortfolioItem {
  id: string
  shop_id: string
  artist_id: string | null
  title: string
  style_id: string | null
  image_path: string
  concept: string | null
  placement: string | null
  size_dimensions: string | null
  is_published: boolean
  sort_order: number
  artist_name: string | null
  style_name: string | null
}

interface Artist {
  id: string
  name: string
}

interface Style {
  id: string
  name: string
}

interface ArtistStyle {
  artistId: string
  styleId: string
}

interface OwnerPortfolioManagerProps {
  shopId: string
  initialItems: PortfolioItem[]
  artists: Artist[]
  styles: Style[]
  artistStyles: ArtistStyle[]
}

export default function OwnerPortfolioManager({
  shopId,
  initialItems,
  artists,
  styles,
  artistStyles
}: OwnerPortfolioManagerProps) {
  const supabase = createClient()
  const [items, setItems] = useState<PortfolioItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null)

  // Form states
  const [title, setTitle] = useState('')
  const [artistId, setArtistId] = useState('')
  const [styleId, setStyleId] = useState('')
  const [concept, setConcept] = useState('')
  const [placement, setPlacement] = useState('')
  const [sizeDimensions, setSizeDimensions] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)

  // Filter styles based on selected artist
  const filteredStyles = artistId
    ? styles.filter(s => artistStyles.some(as => as.artistId === artistId && as.styleId === s.id))
    : styles

  // Reset form helper
  const resetForm = () => {
    setTitle('')
    setArtistId('')
    setStyleId('')
    setConcept('')
    setPlacement('')
    setSizeDimensions('')
    setIsPublished(false)
    setImageFile(null)
    setError(null)
  }

  // Open Edit helper
  const openEdit = (item: PortfolioItem) => {
    setEditingItem(item)
    setTitle(item.title)
    setArtistId(item.artist_id || '')
    setStyleId(item.style_id || '')
    setConcept(item.concept || '')
    setPlacement(item.placement || '')
    setSizeDimensions(item.size_dimensions || '')
    setIsPublished(item.is_published)
    setImageFile(null)
    setError(null)
  }

  // Derived Public Image URL
  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from('portfolio-images').getPublicUrl(path)
    return data.publicUrl
  }

  // CREATE submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!imageFile) {
      setError('กรุณาเลือกรูปภาพผลงาน')
      return
    }

    try {
      setLoading(true)
      setError(null)
      setSuccess(null)

      // 1. Optimize image (prescaling, format WebP, quality 0.85)
      const optimized = await optimizeImage(imageFile, { preset: 'tattoo-reference' })

      // 2. Generate UUIDs
      const portfolioId = crypto.randomUUID()
      const imageUuid = crypto.randomUUID()
      const storagePath = `${shopId}/${artistId || 'unassigned'}/${portfolioId}/${imageUuid}.webp`

      // 3. Upload to public bucket
      const { error: uploadError } = await supabase.storage
        .from('portfolio-images')
        .upload(storagePath, optimized, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        throw new Error(`ไม่สามารถอัปโหลดรูปภาพได้: ${uploadError.message}`)
      }

      // 4. Save metadata to DB
      const nextSortOrder = items.length
      const { data: insertedData, error: dbError } = await supabase
        .from('portfolio_items')
        .insert({
          id: portfolioId,
          shop_id: shopId,
          artist_id: artistId || null,
          title: title,
          style_id: styleId || null,
          image_path: storagePath,
          concept: concept || null,
          placement: placement || null,
          size_dimensions: sizeDimensions || null,
          is_published: isPublished,
          sort_order: nextSortOrder
        })
        .select()

      if (dbError) {
        // Safe cleanup: delete uploaded object on DB failure
        await supabase.storage.from('portfolio-images').remove([storagePath])
        throw dbError
      }

      // Update local state
      const newItem: PortfolioItem = {
        id: portfolioId,
        shop_id: shopId,
        artist_id: artistId || null,
        title: title,
        style_id: styleId || null,
        image_path: storagePath,
        concept: concept || null,
        placement: placement || null,
        size_dimensions: sizeDimensions || null,
        is_published: isPublished,
        sort_order: nextSortOrder,
        artist_name: artists.find(a => a.id === artistId)?.name || null,
        style_name: styles.find(s => s.id === styleId)?.name || null
      }

      setItems([...items, newItem])
      setSuccess('เพิ่มผลงานเรียบร้อยแล้ว')
      setIsCreateOpen(false)
      resetForm()
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเพิ่มผลงาน')
    } finally {
      setLoading(false)
    }
  }

  // EDIT submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingItem) return

    try {
      setLoading(true)
      setError(null)
      setSuccess(null)

      let newStoragePath = editingItem.image_path
      let oldStoragePath = null

      // 1. Upload new image if chosen
      if (imageFile) {
        const imageUuid = crypto.randomUUID()
        newStoragePath = `${shopId}/${artistId || 'unassigned'}/${editingItem.id}/${imageUuid}.webp`
        oldStoragePath = editingItem.image_path

        const optimized = await optimizeImage(imageFile, { preset: 'tattoo-reference' })
        const { error: uploadError } = await supabase.storage
          .from('portfolio-images')
          .upload(newStoragePath, optimized, { cacheControl: '3600', upsert: false })

        if (uploadError) {
          throw new Error(`ไม่สามารถอัปโหลดรูปใหม่ได้: ${uploadError.message}`)
        }
      }

      // 2. Update DB metadata
      const { error: dbError } = await supabase
        .from('portfolio_items')
        .update({
          title: title,
          artist_id: artistId || null,
          style_id: styleId || null,
          image_path: newStoragePath,
          concept: concept || null,
          placement: placement || null,
          size_dimensions: sizeDimensions || null,
          is_published: isPublished
        })
        .eq('id', editingItem.id)

      if (dbError) {
        // Safe cleanup: delete newly uploaded image if update failed
        if (imageFile) {
          await supabase.storage.from('portfolio-images').remove([newStoragePath])
        }
        throw dbError
      }

      // 3. Delete old storage object only after successful DB update
      if (oldStoragePath) {
        await supabase.storage.from('portfolio-images').remove([oldStoragePath])
      }

      // Update local state
      setItems(items.map(item => {
        if (item.id === editingItem.id) {
          return {
            ...item,
            title,
            artist_id: artistId || null,
            style_id: styleId || null,
            image_path: newStoragePath,
            concept: concept || null,
            placement: placement || null,
            size_dimensions: sizeDimensions || null,
            is_published: isPublished,
            artist_name: artists.find(a => a.id === artistId)?.name || null,
            style_name: styles.find(s => s.id === styleId)?.name || null
          }
        }
        return item
      }))

      setSuccess('แก้ไขผลงานเรียบร้อยแล้ว')
      setEditingItem(null)
      resetForm()
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการแก้ไขผลงาน')
    } finally {
      setLoading(false)
    }
  }

  // DELETE operation
  const handleDelete = async (item: PortfolioItem) => {
    if (!confirm('ลบผลงานนี้?\nผลงานจะถูกนำออกจากเว็บไซต์และไม่สามารถกู้คืนได้จากหน้านี้')) return

    try {
      setLoading(true)
      setError(null)
      setSuccess(null)

      // 1. Delete Storage object first
      const { error: storageError } = await supabase.storage
        .from('portfolio-images')
        .remove([item.image_path])

      if (storageError) {
        throw new Error(`ไม่สามารถลบไฟล์รูปภาพได้: ${storageError.message}`)
      }

      // 2. Delete DB row
      const { error: dbError } = await supabase
        .from('portfolio_items')
        .delete()
        .eq('id', item.id)

      if (dbError) throw dbError

      // Update local state
      setItems(items.filter(i => i.id !== item.id))
      setSuccess('ลบผลงานเรียบร้อยแล้ว')
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการลบผลงาน')
    } finally {
      setLoading(false)
    }
  }

  // REORDER operation (Swapping sort_order)
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= items.length) return

    try {
      setLoading(true)
      setError(null)

      const reordered = [...items]
      const temp = reordered[index]
      reordered[index] = reordered[targetIndex]
      reordered[targetIndex] = temp

      // Update state immediately for responsive feel
      setItems(reordered)

      // Persist new sort order to DB
      const updates = reordered.map((item, idx) => {
        return supabase
          .from('portfolio_items')
          .update({ sort_order: idx })
          .eq('id', item.id)
      })

      const results = await Promise.all(updates)
      const failed = results.find(r => r.error)
      if (failed) throw failed.error

      setSuccess('จัดลำดับเรียบร้อยแล้ว')
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการจัดลำดับ')
      // Revert items on error
      setItems(initialItems)
    } finally {
      setLoading(false)
    }
  }

  // TOGGLE publish quick action
  const handleTogglePublish = async (item: PortfolioItem) => {
    try {
      setLoading(true)
      setError(null)
      const nextPublished = !item.is_published

      const { error: dbError } = await supabase
        .from('portfolio_items')
        .update({ is_published: nextPublished })
        .eq('id', item.id)

      if (dbError) throw dbError

      setItems(items.map(i => i.id === item.id ? { ...i, is_published: nextPublished } : i))
      setSuccess(nextPublished ? 'เผยแพร่ผลงานแล้ว' : 'ซ่อนผลงานแล้ว')
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะการเผยแพร่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#FFFFFF] mb-1">ผลงานพอร์ตโฟลิโอ</h1>
          <p className="text-sm text-[#A3A3A3]">จัดการผลงานรอยสักที่จะนำไปแสดงบนหน้าเว็บไซต์</p>
        </div>
        <button
          onClick={() => {
            resetForm()
            setIsCreateOpen(true)
          }}
          className="flex w-full sm:w-auto items-center justify-center px-4 py-2 text-sm font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] rounded-md transition-all shadow-md focus:outline-none"
        >
          <Plus className="w-4 h-4 mr-2" />
          เพิ่มผลงาน
        </button>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400 text-sm">
          {success}
        </div>
      )}

      {/* Portfolio Items List / Table */}
      {items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {items.map((item) => (
            <div 
              key={item.id} 
              className={`bg-[#171717] border border-[#262626] rounded-xl overflow-hidden flex flex-col group relative transition-all duration-200 ${
                !item.is_published ? 'opacity-50 hover:opacity-75' : 'opacity-100'
              }`}
            >
              {/* Image Container (aspect-square) */}
              <div className="relative aspect-square bg-[#0B0B0B] border-b border-[#262626] overflow-hidden">
                <img
                  src={getImageUrl(item.image_path)}
                  alt={item.title}
                  className="w-full h-full object-cover transition-all duration-300"
                />
                
                {/* Status overlay badge */}
                <div className="absolute top-2 right-2">
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                    item.is_published 
                      ? 'bg-emerald-500/90 text-white' 
                      : 'bg-[#404040]/90 text-[#A3A3A3] border border-[#262626]'
                  }`}>
                    {item.is_published ? 'แสดงหน้าร้าน' : 'ซ่อนอยู่'}
                  </span>
                </div>
              </div>

              {/* Card details and compact controls */}
              <div className="p-3 space-y-2 flex-1 flex flex-col justify-between bg-[#121212]/40">
                <div>
                  <h3 className="text-xs font-bold text-[#F5F5F5] truncate">{item.title}</h3>
                  <p className="text-[10px] text-[#A3A3A3] mt-0.5 truncate">
                    {item.artist_name || '-'} • {item.style_name || '-'}
                  </p>

                </div>

                {/* Compact Control Row */}
                <div className="border-t border-[#262626]/60 pt-2 flex items-center justify-between text-[10px]">
                  {/* Eye Toggle button */}
                  <button
                    onClick={() => handleTogglePublish(item)}
                    disabled={loading}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold cursor-pointer select-none transition-colors border ${
                      item.is_published
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400 hover:bg-zinc-500/20'
                    }`}
                  >
                    {item.is_published ? (
                      <>
                        <Eye size={12} />
                        เปิดตา
                      </>
                    ) : (
                      <>
                        <EyeOff size={12} />
                        ปิดตา
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEdit(item)}
                      disabled={loading}
                      className="p-1 hover:bg-[#262626] text-[#A3A3A3] hover:text-[#FFFFFF] rounded transition-colors"
                      title="แก้ไข"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={loading}
                      className="p-1 hover:bg-[#262626] text-red-500/80 hover:text-red-400 rounded transition-colors"
                      title="ลบ"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[#121212] rounded-xl border border-[#262626] p-10 text-center flex flex-col items-center justify-center min-h-[280px]">
          <div className="w-14 h-14 rounded-full bg-[#171717] border border-[#FFFFFF]/10 flex items-center justify-center mb-4">
            <ImageIcon className="h-6 w-6 text-[#9CA3AB]" />
          </div>
          <h3 className="text-base font-semibold text-[#FFFFFF] mb-1">ยังไม่มีผลงานในพอร์ตโฟลิโอ</h3>
          <p className="text-xs text-[#A3A3A3] max-w-sm mb-6">เพิ่มผลงานเพื่อแสดงบนหน้าเว็บไซต์ของร้าน</p>
          <button
            onClick={() => {
              resetForm()
              setIsCreateOpen(true)
            }}
            className="px-5 py-2.5 text-xs font-bold text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] rounded-md transition-all shadow-sm focus:outline-none"
          >
            เพิ่มผลงาน
          </button>
        </div>
      )}

      {/* CREATE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pt-12 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#171717] border border-[#262626] rounded-xl shadow-2xl relative my-8">
            <div className="flex items-center justify-between p-5 border-b border-[#262626]">
              <h3 className="text-lg font-medium text-[#FFFFFF]">เพิ่มผลงานใหม่</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                  รูปภาพผลงาน *
                </label>
                <input
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-4 py-2.5 rounded-md text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                  ชื่อผลงาน *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น มังกรทะยานฟ้า, ดอกกุหลาบคู่"
                  className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-4 py-2.5 rounded-md text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                    ช่างสัก
                  </label>
                  <select
                    value={artistId}
                    onChange={(e) => {
                      setArtistId(e.target.value)
                      setStyleId('') // Reset style on artist change
                    }}
                    className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-3 py-2.5 rounded-md text-xs focus:outline-none"
                  >
                    <option value="">-- ไม่ระบุช่าง --</option>
                    {artists.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                    แนวสไตล์
                  </label>
                  <select
                    value={styleId}
                    onChange={(e) => setStyleId(e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-3 py-2.5 rounded-md text-xs focus:outline-none"
                  >
                    <option value="">-- ไม่ระบุสไตล์ --</option>
                    {filteredStyles.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>


              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="create-publish"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 focus:ring-emerald-500"
                />
                <label htmlFor="create-publish" className="text-xs font-medium text-[#F5F5F5] select-none">
                  เผยแพร่ผลงานชิ้นนี้บนเว็บไซต์ทันที
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#262626]">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#A3A3A3] hover:text-[#FFFFFF] rounded-md transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black text-xs font-bold rounded-md transition-colors flex items-center disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  เพิ่มผลงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pt-12 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#171717] border border-[#262626] rounded-xl shadow-2xl relative my-8">
            <div className="flex items-center justify-between p-5 border-b border-[#262626]">
              <h3 className="text-lg font-medium text-[#FFFFFF]">แก้ไขผลงาน</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-[#A3A3A3] hover:text-[#FFFFFF] transition-colors focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                  รูปภาพผลงาน (เลือกรูปใหม่เพื่อเปลี่ยนรูปภาพเดิม)
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-4 py-2.5 rounded-md text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                  ชื่อผลงาน *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น มังกรทะยานฟ้า, ดอกกุหลาบคู่"
                  className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-4 py-2.5 rounded-md text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                    ช่างสัก
                  </label>
                  <select
                    value={artistId}
                    onChange={(e) => {
                      setArtistId(e.target.value)
                      setStyleId('') // Reset style on artist change
                    }}
                    className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-3 py-2.5 rounded-md text-xs focus:outline-none"
                  >
                    <option value="">-- ไม่ระบุช่าง --</option>
                    {artists.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
                    แนวสไตล์
                  </label>
                  <select
                    value={styleId}
                    onChange={(e) => setStyleId(e.target.value)}
                    className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-3 py-2.5 rounded-md text-xs focus:outline-none"
                  >
                    <option value="">-- ไม่ระบุสไตล์ --</option>
                    {filteredStyles.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>


              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="edit-publish"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 focus:ring-emerald-500"
                />
                <label htmlFor="edit-publish" className="text-xs font-medium text-[#F5F5F5] select-none">
                  เผยแพร่ผลงานชิ้นนี้บนเว็บไซต์
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-[#262626]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-xs font-medium text-[#A3A3A3] hover:text-[#FFFFFF] rounded-md transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black text-xs font-bold rounded-md transition-colors flex items-center disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
