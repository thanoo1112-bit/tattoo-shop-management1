'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import { uploadStudioImage } from '@/lib/utils/storageUploader';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';
import {
  Sparkles,
  Plus,
  Search,
  X,
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
  Upload,
  Camera,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export interface AdminFlashDesign {
  id: string;
  artist_id: string;
  title: string;
  description?: string | null;
  style: string;
  size_label?: string | null;
  price: number;
  deposit_amount: number;
  estimated_duration_minutes?: number | null;
  image_url: string;
  image_url_2?: string | null;
  status: 'AVAILABLE' | 'HELD' | 'RESERVED' | 'SOLD';
  is_visible: boolean;
  is_repeatable?: boolean;
  sort_order: number;
  created_at: string;
  artist?: {
    id: string;
    name: string;
    nickname?: string | null;
    is_active?: boolean;
    is_visible?: boolean;
  } | null;
}

export default function AdminFlashManagement() {
  const { artists: appArtists } = useApp();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Designs State
  const [designs, setDesigns] = useState<AdminFlashDesign[]>([]);
  const [designsLoading, setDesignsLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStyle, setFilterStyle] = useState('ALL');
  const [filterVisibility, setFilterVisibility] = useState<'ALL' | 'VISIBLE' | 'HIDDEN'>('ALL');
  const [filterArtist, setFilterArtist] = useState('ALL');

  // Active Artists List
  const [activeArtists, setActiveArtists] = useState<Array<{ id: string; name: string; nickname?: string | null; specialties?: string[] | null }>>([]);

  const fetchActiveArtists = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('artists')
        .select('id, name, nickname, is_active, specialties')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (data) {
        setActiveArtists(data);
      }
    } catch (err) {
      console.error('Error fetching active artists:', err);
    }
  }, []);

  useEffect(() => {
    fetchActiveArtists();
  }, [fetchActiveArtists]);

  // Dynamic filter style options across artists & designs
  const availableFilterStyles = useMemo(() => {
    const defaultStyles = ['Blackwork', 'Chicano', 'Darkwork', 'Minimal', 'Portrait'];
    const set = new Set<string>(defaultStyles);
    activeArtists.forEach((artist) => {
      if (Array.isArray(artist.specialties)) {
        artist.specialties.forEach((s) => set.add(s.trim()));
      }
    });
    designs.forEach((d) => {
      if (d.style) set.add(d.style.trim());
    });
    return Array.from(set).filter(Boolean).sort();
  }, [activeArtists, designs]);

  // Combined AND Filtered List
  const filteredDesigns = useMemo(() => {
    return designs.filter((item) => {
      // Style Filter
      if (filterStyle !== 'ALL' && item.style.toLowerCase() !== filterStyle.toLowerCase()) {
        return false;
      }
      // Visibility Filter
      if (filterVisibility === 'VISIBLE' && !item.is_visible) return false;
      if (filterVisibility === 'HIDDEN' && item.is_visible) return false;

      // Artist Filter
      if (filterArtist !== 'ALL' && item.artist_id !== filterArtist) return false;

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = item.title?.toLowerCase().includes(q);
        const descMatch = item.description?.toLowerCase().includes(q);
        const styleMatch = item.style?.toLowerCase().includes(q);
        const artistMatch = item.artist?.name?.toLowerCase().includes(q);
        const nicknameMatch = item.artist?.nickname?.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !styleMatch && !artistMatch && !nicknameMatch) {
          return false;
        }
      }
      return true;
    });
  }, [designs, filterStyle, filterVisibility, filterArtist, searchQuery]);

  // Modal / Form States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<AdminFlashDesign | null>(null);

  // Form Fields
  const [formArtistId, setFormArtistId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStyle, setFormStyle] = useState('Fine Line');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formIsVisible, setFormIsVisible] = useState(true);
  const [formIsRepeatable, setFormIsRepeatable] = useState(false);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState<AdminFlashDesign | null>(null);
  const [isDeletingFlash, setIsDeletingFlash] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');

  // Image Upload State
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // File Upload Handler for Flash Image (studio-assets/flash)
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setImageUploadError('');
    setFormError('');

    try {
      const result = await uploadStudioImage(file, 'flash');
      setFormImageUrl(result.publicUrl);
    } catch (err: any) {
      console.error('[AdminFlash] Image upload failed:', err);
      setImageUploadError(err?.message || 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Fetch Designs
  const fetchDesigns = useCallback(async () => {
    setDesignsLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('flash_designs')
        .select(`
          id,
          artist_id,
          title,
          description,
          style,
          size_label,
          price,
          deposit_amount,
          estimated_duration_minutes,
          image_url,
          image_url_2,
          status,
          is_visible,
          is_repeatable,
          sort_order,
          created_at,
          artists (
            id,
            name,
            nickname,
            is_active,
            is_visible
          )
        `)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted: AdminFlashDesign[] = (data || []).map((d: any) => ({
        id: d.id,
        artist_id: d.artist_id,
        title: d.title,
        description: d.description,
        style: d.style || 'Fine Line',
        size_label: d.size_label,
        price: Number(d.price) || 0,
        deposit_amount: Number(d.deposit_amount) || 0,
        estimated_duration_minutes: d.estimated_duration_minutes ? Number(d.estimated_duration_minutes) : null,
        image_url: d.image_url,
        image_url_2: d.image_url_2 || null,
        status: d.status,
        is_visible: d.is_visible,
        is_repeatable: Boolean(d.is_repeatable),
        sort_order: d.sort_order || 0,
        created_at: d.created_at,
        artist: d.artists ? {
          id: d.artists.id,
          name: d.artists.name,
          nickname: d.artists.nickname,
          is_active: d.artists.is_active,
          is_visible: d.artists.is_visible,
        } : null,
      }));

      setDesigns(formatted);
    } catch (err: any) {
      console.error('Error fetching admin flash designs:', err);
    } finally {
      setDesignsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingDesign(null);
    setFormArtistId(activeArtists[0]?.id || appArtists[0]?.id || '');
    setFormTitle('');
    setFormDescription('');
    setFormStyle('Fine Line');
    setFormImageUrl('');
    setFormIsVisible(true);
    setFormIsRepeatable(false);
    setFormSortOrder(designs.length + 1);
    setFormError('');
    setImageUploadError('');
    setIsUploadingImage(false);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (d: AdminFlashDesign) => {
    setEditingDesign(d);
    setFormArtistId(d.artist_id);
    setFormTitle(d.title);
    setFormDescription(d.description || '');
    setFormStyle(d.style);
    setFormImageUrl(d.image_url || '');
    setFormIsVisible(d.is_visible);
    setFormIsRepeatable(Boolean(d.is_repeatable));
    setFormSortOrder(d.sort_order);
    setFormError('');
    setImageUploadError('');
    setIsUploadingImage(false);
    setIsFormModalOpen(true);
  };

  // Submit Design Form (Insert or Update)
  const handleSaveDesign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (isUploadingImage) {
      setFormError('กรุณารอให้อัปโหลดรูปภาพเสร็จสิ้นก่อนบันทึก');
      return;
    }
    if (!formArtistId) {
      setFormError('กรุณาเลือกช่างสักประจำลาย');
      return;
    }
    if (!formTitle.trim()) {
      setFormError('กรุณาระบุชื่อลายสัก Flash');
      return;
    }
    if (!formImageUrl.trim()) {
      setFormError('กรุณาเลือกรูปภาพลายสัก Flash');
      return;
    }

    setFormSubmitting(true);
    try {
      const supabase = createClient();
      const payload: Record<string, any> = {
        artist_id: formArtistId,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        style: formStyle,
        image_url: formImageUrl.trim(),
        image_url_2: null,
        is_visible: formIsVisible,
        is_repeatable: formIsRepeatable,
        sort_order: Number(formSortOrder) || 0,
      };

      if (editingDesign) {
        const { error } = await supabase
          .from('flash_designs')
          .update(payload)
          .eq('id', editingDesign.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('flash_designs')
          .insert({
            ...payload,
            status: 'AVAILABLE',
          });
        if (error) throw error;
      }

      setIsFormModalOpen(false);
      fetchDesigns();
      setActionNotice({ text: 'บันทึกข้อมูลแบบลายสัก Flash เรียบร้อยแล้ว', type: 'success' });
    } catch (err: any) {
      console.error('Save flash design error:', err);
      setFormError(err.message || 'ไม่สามารถบันทึกข้อมูลลาย Flash ได้');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle Visibility
  const handleToggleVisibility = async (d: AdminFlashDesign) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('flash_designs')
        .update({ is_visible: !d.is_visible })
        .eq('id', d.id);
      if (error) throw error;
      fetchDesigns();
    } catch (err: any) {
      console.error('Toggle visibility error:', err);
    }
  };

  // Open Delete Confirmation Modal
  const handleRequestDelete = (design: AdminFlashDesign) => {
    setDeleteTarget(design);
    setDeleteErrorMessage('');
    setIsDeletingFlash(false);
  };

  // Close Delete Confirmation Modal
  const handleCloseDeleteModal = () => {
    if (isDeletingFlash) return;
    setDeleteTarget(null);
    setDeleteErrorMessage('');
  };

  // Confirm Delete Action
  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeletingFlash) return;

    // Check client status first
    const status = deleteTarget.status?.toUpperCase();
    if (status === 'HELD') {
      setDeleteErrorMessage('ไม่สามารถลบได้ เนื่องจากลายนี้กำลังถูกพักสิทธิ์');
      return;
    }
    if (status === 'RESERVED') {
      setDeleteErrorMessage('ไม่สามารถลบได้ เนื่องจากลายนี้มีการจองอยู่');
      return;
    }
    if (status === 'SOLD') {
      setDeleteErrorMessage('ไม่สามารถลบลายที่ขายแล้วได้ เนื่องจากต้องเก็บประวัติการขาย');
      return;
    }
    if (status !== 'AVAILABLE') {
      setDeleteErrorMessage(`ไม่สามารถลบลาย Flash ในสถานะ ${status} ได้`);
      return;
    }

    setIsDeletingFlash(true);
    setDeleteErrorMessage('');

    try {
      const res = await fetch('/api/admin/flash/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flashId: deleteTarget.id }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'ไม่สามารถลบลาย Flash ได้ กรุณาลองใหม่');
      }

      // Success
      setActionNotice({ text: 'ลบลาย Flash เรียบร้อยแล้ว', type: 'success' });
      const deletedId = deleteTarget.id;
      setDeleteTarget(null);
      setDesigns((prev) => prev.filter((d) => d.id !== deletedId));
      fetchDesigns();
    } catch (err: any) {
      console.error('[AdminFlash] Delete failed:', err);
      setDeleteErrorMessage(err.message || 'ไม่สามารถลบลาย Flash ได้ กรุณาลองใหม่');
      setActionNotice({ text: err.message || 'ไม่สามารถลบลาย Flash ได้ กรุณาลองใหม่', type: 'error' });
    } finally {
      setIsDeletingFlash(false);
    }
  };

  // Stats
  const availableCount = designs.filter((d) => d.status === 'AVAILABLE').length;
  const heldCount = designs.filter((d) => d.status === 'HELD').length;
  const reservedCount = designs.filter((d) => d.status === 'RESERVED').length;
  const soldCount = designs.filter((d) => d.status === 'SOLD').length;

  return (
    <div className="space-y-6 font-prompt animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-studio-border pb-4">
        <div>
          <div className="inline-flex items-center space-x-2 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-paper text-[10px] uppercase font-heading tracking-widest mb-1">
            <Sparkles size={12} className="text-studio-red" />
            <span>Flash Catalog Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-studio-primary">
            157 TATTOO FLASH CATALOG
          </h1>
          <p className="text-xs text-studio-secondary mt-1 font-light">
            จัดการแบบลายสักพร้อมจอง (Fixed Price) ควบคุมสถานะคลังลายสัก และข้อมูลแบบลาย Flash
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchDesigns();
            }}
            className="p-2 bg-studio-card border border-studio-border hover:border-studio-red text-studio-secondary hover:text-studio-primary rounded-[4px] text-xs transition-colors"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handleOpenCreate}
            className="bg-studio-red text-studio-primary hover:bg-studio-red/80 px-3.5 py-2 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md shadow-studio-red/10"
          >
            <Plus size={14} />
            <span>เพิ่มลาย Flash ใหม่</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[#171512] border border-[#2D2820] p-4 rounded-[6px] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-md">
        <div className="flex flex-col sm:flex-row gap-2.5 flex-1 items-stretch sm:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7162]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อลาย Flash, คำอธิบาย, สไตล์, ช่าง..."
              className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] pl-9 pr-8 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7162] hover:text-[#ECE4D3]"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Style Filter */}
          <select
            value={filterStyle}
            onChange={(e) => setFilterStyle(e.target.value)}
            className="bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
          >
            <option value="ALL">สไตล์ทั้งหมด</option>
            {availableFilterStyles.map((style) => (
              <option key={style} value={style}>
                {style}
              </option>
            ))}
          </select>

          {/* Visibility Filter */}
          <select
            value={filterVisibility}
            onChange={(e: any) => setFilterVisibility(e.target.value)}
            className="bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
          >
            <option value="ALL">สถานะทั้งหมด</option>
            <option value="VISIBLE">แสดงบนเว็บ (Visible)</option>
            <option value="HIDDEN">ซ่อนจากเว็บ (Hidden)</option>
          </select>

          {/* Artist Filter */}
          <select
            value={filterArtist}
            onChange={(e) => setFilterArtist(e.target.value)}
            className="bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
          >
            <option value="ALL">ช่างทุกคน</option>
            {activeArtists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.nickname ? `ช่าง${artist.nickname}` : artist.name}
              </option>
            ))}
          </select>
        </div>

        {/* Results Counter */}
        <div className="flex items-center justify-between md:justify-end gap-3 text-xs text-[#A89F91] shrink-0 self-center">
          <div>
            ผลงาน <strong className="text-[#ECE4D3] font-bold">{filteredDesigns.length}</strong> / {designs.length} รายการ
          </div>
          {(filterStyle !== 'ALL' || filterVisibility !== 'ALL' || filterArtist !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setFilterStyle('ALL');
                setFilterVisibility('ALL');
                setFilterArtist('ALL');
                setSearchQuery('');
              }}
              className="text-[#9C2F2F] hover:underline text-[11px]"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {actionNotice && (
        <div
          className={`p-3 rounded-[4px] text-xs flex items-center gap-2 border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-red-950/40 border-red-800 text-red-300'
          }`}
        >
          {actionNotice.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{actionNotice.text}</span>
        </div>
      )}

      {/* DESIGNS CATALOG CRUD GRID */}
      <div className="space-y-4">
        {designsLoading ? (
          <div className="py-16 text-center text-xs text-studio-secondary animate-pulse">
            กำลังโหลดแบบลายสัก Flash...
          </div>
        ) : filteredDesigns.length === 0 ? (
          <div className="bg-studio-card border border-studio-border p-12 rounded-[6px] text-center space-y-3">
            <Sparkles size={32} className="text-studio-muted mx-auto" />
            <h4 className="text-sm font-bold text-studio-primary">
              {designs.length === 0 ? 'ยังไม่มีแบบลายสัก Flash ในระบบ' : 'ไม่พบรายการลาย Flash ที่ตรงกับตัวกรอง'}
            </h4>
            <p className="text-xs text-studio-secondary">
              {designs.length === 0
                ? 'กดปุ่ม "+ เพิ่มลาย Flash ใหม่" เพื่อสร้างแบบลายสักพร้อมจอง'
                : 'ลองเปลี่ยนหรือล้างเงื่อนไขการค้นหาและตัวกรอง'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
            {filteredDesigns.map((d) => {
              const isArtistInactive = Boolean(
                d.artist && (d.artist.is_active === false || d.artist.is_visible === false)
              );

              return (
                <div
                  key={d.id}
                  className={`bg-studio-card border rounded-[6px] overflow-hidden flex flex-col justify-between transition-all min-w-0 ${
                    isArtistInactive
                      ? 'border-studio-border/40 opacity-75 bg-[#13110F] filter grayscale-[40%]'
                      : d.is_visible
                      ? 'border-studio-border hover:border-studio-border/80'
                      : 'border-studio-border/40 opacity-70'
                  }`}
                >
                  <div className="aspect-[4/3] bg-studio-main overflow-hidden relative">
                    <img
                      src={getThumbnailUrl(d.image_url)}
                      onError={(e) => handleThumbnailError(e, d.image_url)}
                      alt={d.title}
                      className={`w-full h-full object-cover ${isArtistInactive ? 'grayscale contrast-90 brightness-90' : ''}`}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 flex gap-1 max-w-[65%] min-w-0">
                      <span className="bg-studio-main/90 border border-studio-border text-studio-red text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                        #{d.sort_order}
                      </span>
                      <span className="bg-studio-main/90 border border-studio-border text-studio-secondary text-[9px] px-1.5 py-0.5 rounded truncate">
                        {d.style}
                      </span>
                    </div>

                    <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 flex flex-col items-end gap-1">
                      {isArtistInactive && (
                        <span className="bg-[#2D2820]/95 border border-[#4A443A] text-[#A89F91] text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow">
                          <EyeOff size={10} /> ซ่อนตามสถานะช่าง
                        </span>
                      )}

                      {d.status === 'AVAILABLE' && (
                        <span className="bg-emerald-950/80 border border-emerald-600/50 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded">
                          ● AVAILABLE
                        </span>
                      )}
                      {d.status === 'HELD' && (
                        <span className="bg-amber-950/80 border border-amber-600/50 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                          ● HELD
                        </span>
                      )}
                      {d.status === 'RESERVED' && (
                        <span className="bg-indigo-950/80 border border-indigo-600/50 text-indigo-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                          ● RESERVED
                        </span>
                      )}
                      {d.status === 'SOLD' && (
                        <span className="bg-[#171512] border border-[#4A443A] text-[#7A7265] text-[9px] font-bold px-1.5 py-0.5 rounded">
                          ✕ SOLD
                        </span>
                      )}

                      {d.is_repeatable ? (
                        <span className="bg-cyan-950/80 border border-cyan-600/50 text-cyan-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                          สักซ้ำได้
                        </span>
                      ) : (
                        <span className="bg-amber-950/80 border border-amber-600/50 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded">
                          ลายเดียว
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2 flex-1 flex flex-col justify-between text-xs min-w-0">
                    <div className="space-y-1 min-w-0">
                      <div className="flex justify-between items-start gap-1 min-w-0">
                        <h4 className="font-bold text-studio-primary truncate text-xs sm:text-sm flex-1 min-w-0" title={d.title}>
                          {d.title}
                        </h4>
                      </div>
                      <div className="text-[10px] sm:text-[11px] text-studio-secondary flex flex-wrap items-center justify-between gap-0.5 sm:gap-1 min-w-0">
                        <span className="truncate">
                          ช่าง: {d.artist?.name || 'ช่างประจำร้าน'}
                          {isArtistInactive && <span className="text-red-400/90 ml-1 font-medium">· ปิดใช้งาน</span>}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-studio-border/50 flex justify-between items-center gap-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(d)}
                        className={`text-[10px] sm:text-[11px] flex items-center gap-1 font-medium px-1.5 sm:px-2 py-1 rounded border transition-colors shrink-0 ${
                          d.is_visible
                            ? 'bg-studio-main border-studio-border text-studio-primary hover:border-studio-red/40'
                            : 'bg-red-950/20 border-red-900/40 text-red-400'
                        }`}
                      >
                        {d.is_visible ? <Eye size={12} className="text-emerald-400 shrink-0" /> : <EyeOff size={12} className="shrink-0" />}
                        <span>{d.is_visible ? 'แสดงบนเว็บ' : 'ซ่อนจากเว็บ'}</span>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(d)}
                          className="p-1.5 text-studio-secondary hover:text-studio-primary hover:bg-studio-sec rounded border border-transparent hover:border-studio-border transition-colors"
                          title="แก้ไขแบบลายสัก"
                        >
                          <Edit3 size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRequestDelete(d)}
                          className="p-1.5 text-red-400/80 hover:text-red-400 hover:bg-red-950/30 rounded border border-transparent hover:border-red-900/40 transition-colors"
                          title="ลบลายสัก Flash"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Design Create / Edit Modal */}
      {isFormModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/95 backdrop-blur-md animate-fadeIn">
          <div className="w-full sm:w-[calc(100%-2rem)] sm:max-w-[580px] lg:max-w-[1040px] h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col bg-[#171512] border-0 sm:border sm:border-[#2D2820] rounded-none sm:rounded-[8px] shadow-2xl relative text-[#ECE4D3] text-xs overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-[#2D2820] p-4 shrink-0 bg-[#171512] z-10">
              <h3 className="text-base font-bold text-[#ECE4D3] flex items-center gap-2">
                <Sparkles size={16} className="text-[#9C2F2F]" />
                <span>{editingDesign ? 'แก้ไขแบบลายสัก Flash' : 'เพิ่มแบบลายสัก Flash ใหม่'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="text-[#7A7162] hover:text-[#ECE4D3] transition-colors p-1"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="bg-[#2D1B1B] border border-red-700/50 p-3 rounded text-xs text-red-300 mx-4 mt-3 shrink-0 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Modal Form Container */}
            <form onSubmit={handleSaveDesign} className="flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 custom-scrollbar space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageFileSelect}
                  disabled={isUploadingImage || formSubmitting}
                  className="hidden"
                />

                {/* MOBILE LAYOUT */}
                <div className="block lg:hidden space-y-4">
                  <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-3 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#2D2820] pb-2">
                      <span className="text-xs font-bold text-[#ECE4D3] flex items-center gap-1.5">
                        <Camera size={14} className="text-[#9C2F2F]" />
                        <span>รูปภาพลาย Flash</span>
                        <span className="text-red-400">*</span>
                      </span>
                      {formImageUrl && (
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded shrink-0">
                          <CheckCircle2 size={11} /> พร้อมใช้งาน
                        </span>
                      )}
                    </div>

                    <div className="flex flex-row gap-3 items-center">
                      <div
                        onClick={() => {
                          if (!formImageUrl && !isUploadingImage && !formSubmitting) {
                            fileInputRef.current?.click();
                          }
                        }}
                        className="w-[120px] h-[120px] sm:w-[140px] sm:h-[140px] bg-[#0E0D0C] border border-[#2D2820] rounded-lg shrink-0 flex items-center justify-center overflow-hidden relative cursor-pointer group"
                      >
                        {isUploadingImage ? (
                          <div className="flex flex-col items-center justify-center p-2 text-center">
                            <Loader2 size={22} className="animate-spin text-[#9C2F2F] mb-1" />
                            <span className="text-[10px] text-[#ECE4D3] font-medium">กำลังอัปโหลด...</span>
                          </div>
                        ) : formImageUrl ? (
                          <img
                            src={formImageUrl}
                            alt="Flash Preview"
                            className="w-full h-full object-contain p-1 rounded block"
                            onError={(e: any) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-2 text-center space-y-1">
                            <Upload size={22} className="text-[#7A7162] group-hover:text-[#ECE4D3] transition-colors" />
                            <span className="text-xs text-[#ECE4D3] font-medium block">+ เลือกรูปภาพ</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="text-[11px] text-[#7A7162] space-y-0.5">
                          <p className="text-[#ECE4D3] font-medium truncate">
                            {formImageUrl ? 'อัปโหลดรูปภาพพร้อมใช้งานแล้ว' : 'ยังไม่ได้เลือกไฟล์รูปภาพ'}
                          </p>
                          <p className="text-[10px]">รองรับ JPG, PNG, WEBP สูงสุด 5MB</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isUploadingImage || formSubmitting}
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-[#25201A] hover:bg-[#322A22] border border-[#2D2820] text-xs text-[#ECE4D3] rounded transition-colors flex items-center gap-1.5 font-medium"
                          >
                            <Camera size={13} className="text-[#9C2F2F]" />
                            <span>{formImageUrl ? 'เปลี่ยนรูป' : 'เลือกรูปใหม่'}</span>
                          </button>

                          {formImageUrl && (
                            <button
                              type="button"
                              disabled={isUploadingImage || formSubmitting}
                              onClick={() => {
                                setFormImageUrl('');
                                setImageUploadError('');
                              }}
                              className="px-2.5 py-1.5 bg-[#0E0D0C] hover:bg-red-950/40 border border-[#2D2820] hover:border-red-900/60 text-xs text-red-400 rounded transition-colors flex items-center gap-1 font-medium"
                            >
                              <Trash2 size={12} />
                              <span>ลบรูป</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {imageUploadError && (
                      <p className="text-xs text-red-400 flex items-center gap-1 pt-1 justify-center">
                        <AlertCircle size={13} className="shrink-0" />
                        <span>{imageUploadError}</span>
                      </p>
                    )}
                  </div>

                  <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-3 sm:p-4 space-y-3">
                    <div className="border-b border-[#2D2820] pb-1.5">
                      <h4 className="text-xs font-bold text-[#A89F91] uppercase tracking-wider">ข้อมูลผลงาน</h4>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        ชื่อลายสัก (Title) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="เช่น Geometric Compass & Arrow"
                        required
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        ช่างสักเจ้าของลาย <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={formArtistId}
                        onChange={(e) => setFormArtistId(e.target.value)}
                        required
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
                      >
                        <option value="">-- เลือกช่างสัก --</option>
                        {(activeArtists.length > 0 ? activeArtists : appArtists).map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.name} {a.nickname ? `(${a.nickname})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        สไตล์ (Style) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formStyle}
                        onChange={(e) => setFormStyle(e.target.value)}
                        placeholder="Fine Line, Blackwork..."
                        required
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        ประเภทลาย Flash <span className="text-red-400">*</span>
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label
                          className={`flex items-start gap-2.5 p-2.5 rounded border cursor-pointer transition-all ${
                            !formIsRepeatable
                              ? 'bg-[#1C1814] border-[#9C2F2F] text-[#ECE4D3]'
                              : 'bg-[#0E0D0C] border-[#2D2820] text-[#7A7162] hover:border-[#3E372C]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="flashRepeatableMobile"
                            checked={!formIsRepeatable}
                            onChange={() => setFormIsRepeatable(false)}
                            className="mt-0.5 w-3.5 h-3.5 text-[#9C2F2F] focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <span className="text-xs font-bold block text-[#ECE4D3]">ลายเดียว</span>
                            <span className="text-[10px] text-[#A89F91] leading-tight block mt-0.5">
                              สักได้เพียง 1 คน เมื่อมีผู้จอง/อนุมัติแล้วจะปิดรับการจอง
                            </span>
                          </div>
                        </label>

                        <label
                          className={`flex items-start gap-2.5 p-2.5 rounded border cursor-pointer transition-all ${
                            formIsRepeatable
                              ? 'bg-[#1C1814] border-cyan-600/70 text-[#ECE4D3]'
                              : 'bg-[#0E0D0C] border-[#2D2820] text-[#7A7162] hover:border-[#3E372C]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="flashRepeatableMobile"
                            checked={formIsRepeatable}
                            onChange={() => setFormIsRepeatable(true)}
                            className="mt-0.5 w-3.5 h-3.5 text-cyan-500 focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <span className="text-xs font-bold block text-[#ECE4D3]">สักซ้ำได้</span>
                            <span className="text-[10px] text-[#A89F91] leading-tight block mt-0.5">
                              ลูกค้าหลายคนจองลายนี้ได้ ลายยังคงสถานะว่างตลอด
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-3 sm:p-4 space-y-3">
                    <div className="border-b border-[#2D2820] pb-1.5">
                      <h4 className="text-xs font-bold text-[#A89F91] uppercase tracking-wider">รายละเอียด</h4>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">คำอธิบายรายละเอียด</label>
                      <textarea
                        rows={3}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="อธิบายแนวคิด เส้นสาย หรือรายละเอียดเพิ่มเติมของแบบลายนี้..."
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F] resize-none"
                      />
                    </div>
                  </div>

                  <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-3 sm:p-4 space-y-3">
                    <div className="border-b border-[#2D2820] pb-1.5">
                      <h4 className="text-xs font-bold text-[#A89F91] uppercase tracking-wider">การแสดงผล</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1 flex flex-col justify-end">
                        <label className="inline-flex items-center gap-2 cursor-pointer pb-2">
                          <input
                            type="checkbox"
                            checked={formIsVisible}
                            onChange={(e) => setFormIsVisible(e.target.checked)}
                            className="w-4 h-4 rounded bg-[#0E0D0C] border-[#3E372C] text-[#9C2F2F] focus:ring-0 focus:outline-none cursor-pointer"
                          />
                          <span className="text-xs text-[#ECE4D3] font-medium">แสดงผลงานบนเว็บไซต์</span>
                        </label>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[#ECE4D3] block">ลำดับการแสดงผล (Sort Order)</label>
                        <input
                          type="number"
                          value={formSortOrder}
                          onChange={(e) => setFormSortOrder(Number(e.target.value))}
                          className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* DESKTOP LAYOUT */}
                <div className="hidden lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
                  <div className="col-span-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#ECE4D3] flex items-center gap-1.5">
                        <Camera size={14} className="text-[#9C2F2F]" />
                        <span>รูปภาพลาย Flash</span>
                        <span className="text-red-400">*</span>
                      </span>
                      {formImageUrl && (
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded">
                          <CheckCircle2 size={11} /> พร้อมใช้งาน
                        </span>
                      )}
                    </div>

                    <div className="w-full min-h-[360px] max-h-[460px] bg-[#0E0D0C] border border-[#2D2820] rounded-lg p-2 flex items-center justify-center relative overflow-hidden">
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center justify-center space-y-2 text-center animate-pulse p-6">
                          <Loader2 size={28} className="animate-spin text-[#9C2F2F]" />
                          <span className="text-xs text-[#ECE4D3] font-medium">กำลังอัปโหลดรูปภาพไปยัง Storage...</span>
                        </div>
                      ) : formImageUrl ? (
                        <div className="inline-flex w-fit max-w-full mx-auto p-1 bg-[#0E0D0C] rounded">
                          <img
                            src={formImageUrl}
                            alt="Flash Preview"
                            className="max-w-full max-h-[440px] w-auto h-auto object-contain rounded block"
                            onError={(e: any) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            if (!isUploadingImage && !formSubmitting) {
                              fileInputRef.current?.click();
                            }
                          }}
                          className="w-full h-full min-h-[340px] border border-dashed border-[#2D2820] hover:border-[#9C2F2F]/60 bg-[#0E0D0C] hover:bg-[#141210] rounded-lg text-center cursor-pointer transition-colors flex flex-col items-center justify-center p-6 space-y-2 group"
                        >
                          <div className="w-12 h-12 rounded-full bg-[#171512] border border-[#2D2820] group-hover:border-[#9C2F2F]/60 flex items-center justify-center text-[#7A7162] group-hover:text-[#ECE4D3] transition-colors">
                            <Upload size={20} />
                          </div>
                          <div>
                            <span className="text-xs text-[#ECE4D3] font-medium block">
                              + คลิกเพื่อเลือกรูปภาพลาย Flash
                            </span>
                            <span className="text-[10px] text-[#7A7162] block mt-0.5">
                              รองรับ JPG, PNG, WEBP สูงสุด 5 MB
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-center gap-2 w-full pt-1">
                      <button
                        type="button"
                        disabled={isUploadingImage || formSubmitting}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#25201A] hover:bg-[#322A22] border border-[#2D2820] text-xs text-[#ECE4D3] rounded transition-colors flex items-center gap-1.5 font-medium"
                      >
                        <Camera size={13} className="text-[#9C2F2F]" />
                        <span>{formImageUrl ? 'เปลี่ยนรูป' : 'เลือกรูปใหม่'}</span>
                      </button>

                      {formImageUrl && (
                        <button
                          type="button"
                          disabled={isUploadingImage || formSubmitting}
                          onClick={() => {
                            setFormImageUrl('');
                            setImageUploadError('');
                          }}
                          className="px-2.5 py-1.5 bg-[#0E0D0C] hover:bg-red-950/40 border border-[#2D2820] hover:border-red-900/60 text-xs text-red-400 rounded transition-colors flex items-center gap-1 font-medium"
                        >
                          <Trash2 size={12} />
                          <span>ลบรูป</span>
                        </button>
                      )}
                    </div>

                    {imageUploadError && (
                      <p className="text-xs text-red-400 flex items-center gap-1 mt-1 justify-center">
                        <AlertCircle size={13} className="shrink-0" />
                        <span>{imageUploadError}</span>
                      </p>
                    )}
                  </div>

                  <div className="col-span-7 space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        ช่างสักเจ้าของลาย <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={formArtistId}
                        onChange={(e) => setFormArtistId(e.target.value)}
                        required
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
                      >
                        <option value="">-- เลือกช่างสัก --</option>
                        {(activeArtists.length > 0 ? activeArtists : appArtists).map((a: any) => (
                          <option key={a.id} value={a.id}>
                            {a.name} {a.nickname ? `(${a.nickname})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        ชื่อลายสัก (Title) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="เช่น Geometric Compass & Arrow"
                        required
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        สไตล์ (Style) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formStyle}
                        onChange={(e) => setFormStyle(e.target.value)}
                        placeholder="Fine Line, Blackwork..."
                        required
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">
                        ประเภทลาย Flash <span className="text-red-400">*</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label
                          className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                            !formIsRepeatable
                              ? 'bg-[#1C1814] border-[#9C2F2F] text-[#ECE4D3]'
                              : 'bg-[#0E0D0C] border-[#2D2820] text-[#7A7162] hover:border-[#3E372C]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="flashRepeatableDesktop"
                            checked={!formIsRepeatable}
                            onChange={() => setFormIsRepeatable(false)}
                            className="mt-0.5 w-3.5 h-3.5 text-[#9C2F2F] focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <span className="text-xs font-bold block text-[#ECE4D3]">ลายเดียว</span>
                            <span className="text-[10px] text-[#A89F91] leading-tight block mt-0.5">
                              สักได้เพียง 1 คน เมื่อมีผู้จอง/อนุมัติแล้วจะปิดรับการจอง
                            </span>
                          </div>
                        </label>

                        <label
                          className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                            formIsRepeatable
                              ? 'bg-[#1C1814] border-cyan-600/70 text-[#ECE4D3]'
                              : 'bg-[#0E0D0C] border-[#2D2820] text-[#7A7162] hover:border-[#3E372C]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="flashRepeatableDesktop"
                            checked={formIsRepeatable}
                            onChange={() => setFormIsRepeatable(true)}
                            className="mt-0.5 w-3.5 h-3.5 text-cyan-500 focus:ring-0 cursor-pointer"
                          />
                          <div>
                            <span className="text-xs font-bold block text-[#ECE4D3]">สักซ้ำได้</span>
                            <span className="text-[10px] text-[#A89F91] leading-tight block mt-0.5">
                              ลูกค้าหลายคนจองลายนี้ได้ ลายยังคงสถานะว่างตลอด
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">คำอธิบายรายละเอียด</label>
                      <textarea
                        rows={3}
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="อธิบายแนวคิด เส้นสาย หรือรายละเอียดเพิ่มเติมของแบบลายนี้..."
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F] resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1 flex flex-col justify-end">
                        <label className="inline-flex items-center gap-2 cursor-pointer pb-2">
                          <input
                            type="checkbox"
                            checked={formIsVisible}
                            onChange={(e) => setFormIsVisible(e.target.checked)}
                            className="w-4 h-4 rounded bg-[#0E0D0C] border-[#3E372C] text-[#9C2F2F] focus:ring-0 focus:outline-none cursor-pointer"
                          />
                          <span className="text-xs text-[#ECE4D3] font-medium">แสดงผลงานบนเว็บไซต์</span>
                        </label>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-[#ECE4D3] block">ลำดับการแสดงผล (Sort Order)</label>
                        <input
                          type="number"
                          value={formSortOrder}
                          onChange={(e) => setFormSortOrder(Number(e.target.value))}
                          className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="border-t border-[#2D2820] p-4 flex justify-end gap-2 shrink-0 bg-[#171512] z-10">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={formSubmitting || isUploadingImage}
                  className="bg-transparent border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] px-4 py-2 rounded-[4px] text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || isUploadingImage}
                  className="bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] px-5 py-2 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-[#9C2F2F]/20"
                >
                  {formSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>{editingDesign ? 'บันทึกการแก้ไข' : 'สร้างแบบลาย Flash'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#171512] border border-red-900/60 rounded-xl p-5 max-w-md w-full space-y-4 shadow-2xl text-xs text-[#ECE4D3]">
            <div className="flex items-center gap-2 text-red-400 border-b border-[#2D2820] pb-3">
              <AlertTriangle size={18} className="shrink-0" />
              <h3 className="font-bold text-sm">ยืนยันการลบลาย Flash</h3>
            </div>

            <p className="text-[#A89F91] leading-relaxed">
              คุณต้องการลบลาย Flash <strong className="text-[#ECE4D3]">&quot;{deleteTarget.title}&quot;</strong> ใช่หรือไม่?
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>

            {deleteErrorMessage && (
              <div className="p-3 bg-red-950/40 border border-red-800/80 rounded text-red-300 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{deleteErrorMessage}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#2D2820]">
              <button
                type="button"
                disabled={isDeletingFlash}
                onClick={handleCloseDeleteModal}
                className="px-4 py-2 bg-transparent border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isDeletingFlash}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-bold transition-all flex items-center gap-1.5"
              >
                {isDeletingFlash ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>ยืนยันลบ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
