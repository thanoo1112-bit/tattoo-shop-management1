'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import { uploadStudioImage } from '@/lib/utils/storageUploader';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';
import {
  Sparkles,
  Plus,
  Search,
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
  Tag,
  DollarSign,
  X,
  Lock,
  Check,
} from 'lucide-react';

export interface ArtistFlashDesign {
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
}

export default function ArtistFlashManagement() {
  const { supabase, staffArtistId, staffArtistRecord } = useApp();
  const searchParams = useSearchParams();

  const [designs, setDesigns] = useState<ArtistFlashDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStyle, setFilterStyle] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'AVAILABLE' | 'RESERVED' | 'SOLD'>('ALL');

  // Modal / Form States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<ArtistFlashDesign | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStyle, setFormStyle] = useState('Fine Line');
  const [formSizeLabel, setFormSizeLabel] = useState('');
  const [formPrice, setFormPrice] = useState<number | ''>('');
  const [formDepositAmount, setFormDepositAmount] = useState<number | ''>('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formStatus, setFormStatus] = useState<'AVAILABLE' | 'HELD' | 'RESERVED' | 'SOLD'>('AVAILABLE');
  const [formIsVisible, setFormIsVisible] = useState(true);
  const [formIsRepeatable, setFormIsRepeatable] = useState(false);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState<ArtistFlashDesign | null>(null);
  const [isDeletingFlash, setIsDeletingFlash] = useState(false);

  // Image Upload State
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Artist specialties derived from staffArtistRecord
  const artistSpecialties = useMemo(() => {
    if (!staffArtistRecord || !Array.isArray(staffArtistRecord.specialties)) {
      return ['Fine Line', 'Black & Grey', 'Realism', 'Minimalist', 'Traditional', 'Japanese / Irezumi', 'Color Tattoo', 'Cover Up'];
    }
    const specs = staffArtistRecord.specialties.map((s: string) => s.trim()).filter(Boolean);
    return specs.length > 0 ? specs : ['Fine Line', 'Black & Grey', 'Realism', 'Minimalist', 'Traditional', 'Japanese / Irezumi', 'Color Tattoo', 'Cover Up'];
  }, [staffArtistRecord]);

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
      console.error('[ArtistFlash] Image upload failed:', err);
      setImageUploadError(err?.message || 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 1. Fetch Flash Designs for Logged-in Artist
  const fetchDesigns = useCallback(async () => {
    if (!staffArtistId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('flash_designs')
        .select('*')
        .eq('artist_id', staffArtistId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const formatted: ArtistFlashDesign[] = (data || []).map((d: any) => ({
        id: d.id,
        artist_id: d.artist_id,
        title: d.title,
        description: d.description,
        style: d.style || 'Fine Line',
        size_label: d.size_label || null,
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
      }));

      setDesigns(formatted);
    } catch (err: any) {
      console.error('[ArtistFlash] Fetch error:', err);
      setError('ไม่สามารถโหลดข้อมูลลาย Flash ได้: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setLoading(false);
    }
  }, [supabase, staffArtistId]);

  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  // Handle URL action parameter (e.g. ?action=add)
  useEffect(() => {
    if (searchParams.get('action') === 'add' && !loading) {
      handleOpenCreateModal();
    }
  }, [searchParams, loading]);

  // Notice Toast Auto Clear
  useEffect(() => {
    if (actionNotice) {
      const timer = setTimeout(() => setActionNotice(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionNotice]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingDesign(null);
    setFormTitle('');
    setFormDescription('');
    setFormStyle(artistSpecialties[0] || 'Fine Line');
    setFormSizeLabel('');
    setFormPrice('');
    setFormDepositAmount('');
    setFormImageUrl('');
    setFormStatus('AVAILABLE');
    setFormIsVisible(true);
    setFormIsRepeatable(false);
    setFormSortOrder((designs.length + 1) * 10);
    setFormError('');
    setImageUploadError('');
    setIsUploadingImage(false);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (design: ArtistFlashDesign) => {
    setEditingDesign(design);
    setFormTitle(design.title);
    setFormDescription(design.description || '');
    setFormStyle(design.style || artistSpecialties[0] || 'Fine Line');
    setFormSizeLabel(design.size_label || '');
    setFormPrice(design.price);
    setFormDepositAmount(design.deposit_amount);
    setFormImageUrl(design.image_url);
    setFormStatus(design.status);
    setFormIsVisible(design.is_visible);
    setFormIsRepeatable(Boolean(design.is_repeatable));
    setFormSortOrder(design.sort_order || 0);
    setFormError('');
    setImageUploadError('');
    setIsUploadingImage(false);
    setIsFormModalOpen(true);
  };

  // Submit Form (Create or Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!staffArtistId) {
      setFormError('ไม่พบข้อมูลช่างสักประจำระบบ กรุณาล็อกอินใหม่');
      return;
    }
    if (isUploadingImage) {
      setFormError('กรุณารอให้อัปโหลดรูปภาพเสร็จสิ้นก่อนบันทึก');
      return;
    }
    if (!formTitle.trim()) {
      setFormError('กรุณาระบุชื่อลาย Flash');
      return;
    }
    if (!formImageUrl.trim()) {
      setFormError('กรุณาอัปโหลดรูปภาพลาย Flash');
      return;
    }

    setFormSubmitting(true);
    try {
      const numericPrice = formPrice !== '' ? Number(formPrice) : 0;
      const numericDeposit = formDepositAmount !== '' ? Number(formDepositAmount) : 0;

      if (editingDesign) {
        // UPDATE (Strictly for staffArtistId)
        const { error: updateErr } = await supabase
          .from('flash_designs')
          .update({
            title: formTitle.trim(),
            description: formDescription.trim() || null,
            style: formStyle,
            size_label: formSizeLabel.trim() || null,
            price: numericPrice,
            deposit_amount: numericDeposit,
            image_url: formImageUrl.trim(),
            status: formStatus,
            is_visible: formIsVisible,
            is_repeatable: formIsRepeatable,
            sort_order: Number(formSortOrder) || 0,
          })
          .eq('id', editingDesign.id)
          .eq('artist_id', staffArtistId);

        if (updateErr) throw updateErr;

        setActionNotice({ text: `แก้ไขลาย Flash "${formTitle}" เรียบร้อยแล้ว`, type: 'success' });
      } else {
        // INSERT
        const { error: insertErr } = await supabase
          .from('flash_designs')
          .insert({
            artist_id: staffArtistId,
            title: formTitle.trim(),
            description: formDescription.trim() || null,
            style: formStyle,
            size_label: formSizeLabel.trim() || null,
            price: numericPrice,
            deposit_amount: numericDeposit,
            image_url: formImageUrl.trim(),
            status: formStatus,
            is_visible: formIsVisible,
            is_repeatable: formIsRepeatable,
            sort_order: Number(formSortOrder) || 0,
          });

        if (insertErr) throw insertErr;

        setActionNotice({ text: `เพิ่มลาย Flash ใหม่ "${formTitle}" สำเร็จแล้ว`, type: 'success' });
      }

      setIsFormModalOpen(false);
      fetchDesigns();
    } catch (err: any) {
      console.error('[ArtistFlash] Save error:', err);
      setFormError('เกิดข้อผิดพลาดในการบันทึก: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle Quick Status (AVAILABLE -> SOLD / RESERVED -> AVAILABLE)
  const handleQuickStatusToggle = async (design: ArtistFlashDesign, newStatus: 'AVAILABLE' | 'RESERVED' | 'SOLD') => {
    if (!staffArtistId) return;
    try {
      const { error: toggleErr } = await supabase
        .from('flash_designs')
        .update({ status: newStatus })
        .eq('id', design.id)
        .eq('artist_id', staffArtistId);

      if (toggleErr) throw toggleErr;

      setDesigns((prev) =>
        prev.map((d) => (d.id === design.id ? { ...d, status: newStatus } : d))
      );

      const statusLabels: Record<string, string> = {
        AVAILABLE: 'พร้อมจำหน่าย',
        RESERVED: 'จองแล้ว',
        SOLD: 'ปิดการขาย (SOLD OUT)',
      };

      setActionNotice({
        text: `อัปเดตสถานะ "${design.title}" เป็น [${statusLabels[newStatus]}] แล้ว`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('[ArtistFlash] Quick status error:', err);
      setActionNotice({ text: 'ไม่สามารถเปลี่ยนสถานะได้: ' + err?.message, type: 'error' });
    }
  };

  // Toggle Visibility Quick
  const handleToggleVisibility = async (design: ArtistFlashDesign) => {
    if (!staffArtistId) return;
    const nextVis = !design.is_visible;
    try {
      const { error: toggleErr } = await supabase
        .from('flash_designs')
        .update({ is_visible: nextVis })
        .eq('id', design.id)
        .eq('artist_id', staffArtistId);

      if (toggleErr) throw toggleErr;

      setDesigns((prev) =>
        prev.map((d) => (d.id === design.id ? { ...d, is_visible: nextVis } : d))
      );

      setActionNotice({
        text: nextVis ? `เปิดแสดงลาย Flash "${design.title}" บนหน้าร้านแล้ว` : `ซ่อนลาย Flash "${design.title}" เรียบร้อยแล้ว`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('[ArtistFlash] Toggle visibility error:', err);
      setActionNotice({ text: 'ไม่สามารถเปลี่ยนการแสดงผลได้: ' + err?.message, type: 'error' });
    }
  };

  // Delete Flash Design
  const handleDeleteFlash = async () => {
    if (!deleteTarget || !staffArtistId) return;
    setIsDeletingFlash(true);
    try {
      const { error: delErr } = await supabase
        .from('flash_designs')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('artist_id', staffArtistId);

      if (delErr) throw delErr;

      setActionNotice({ text: `ลบลาย Flash "${deleteTarget.title}" เรียบร้อยแล้ว`, type: 'success' });
      setDeleteTarget(null);
      fetchDesigns();
    } catch (err: any) {
      console.error('[ArtistFlash] Delete error:', err);
      setActionNotice({ text: 'ไม่สามารถลบลาย Flash ได้: ' + err?.message, type: 'error' });
    } finally {
      setIsDeletingFlash(false);
    }
  };

  // Dynamic filter styles
  const availableStyles = useMemo(() => {
    const set = new Set<string>(artistSpecialties);
    designs.forEach((d) => {
      if (d.style) set.add(d.style);
    });
    return Array.from(set).sort();
  }, [artistSpecialties, designs]);

  // Filtered designs
  const filteredDesigns = useMemo(() => {
    return designs.filter((d) => {
      // Style
      if (filterStyle !== 'ALL' && d.style !== filterStyle) return false;
      // Status
      if (filterStatus !== 'ALL' && d.status !== filterStatus) return false;
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = d.title.toLowerCase().includes(q);
        const matchDesc = d.description?.toLowerCase().includes(q) || false;
        const matchStyle = d.style.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchStyle) return false;
      }
      return true;
    });
  }, [designs, filterStyle, filterStatus, searchQuery]);

  return (
    <div className="space-y-6 font-prompt">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-studio-card border border-studio-border p-5 rounded-xl shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-studio-red uppercase tracking-wider font-semibold">
              ARTIST FLASH DESIGNS
            </span>
            <span className="text-studio-muted text-xs">•</span>
            <span className="text-xs text-studio-secondary font-mono">
              ช่างประจำลาย Flash: {staffArtistRecord?.name || 'ช่างสัก'} {staffArtistRecord?.nickname ? `(${staffArtistRecord.nickname})` : ''}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary flex items-center gap-2">
            <Sparkles className="text-studio-red" size={24} />
            <span>จัดการลาย Flash ของฉัน</span>
          </h1>
          <p className="text-xs text-studio-secondary max-w-2xl">
            คุณสามารถเพิ่ม แก้ไข ปิดการขาย (SOLD) หรือปรับเปลี่ยนลายสัก Flash ของตนเองเพื่อเปิดจองบนหน้าเว็บไซต์
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchDesigns()}
            disabled={loading}
            className="p-2.5 bg-studio-sec border border-studio-border hover:border-studio-red/50 text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-studio-red' : ''} />
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-studio-red hover:bg-studio-red/90 text-white font-medium text-xs rounded-lg transition-colors flex items-center space-x-2 shadow-lg cursor-pointer"
          >
            <Plus size={16} />
            <span>สร้างลาย Flash ใหม่</span>
          </button>
        </div>
      </div>

      {/* Action Notice Toast */}
      {actionNotice && (
        <div
          className={`p-4 rounded-xl flex items-center space-x-3 shadow-lg animate-fadeIn border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-300'
              : 'bg-red-950/80 border-red-800/80 text-red-300'
          }`}
        >
          {actionNotice.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-red-400 shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-medium">{actionNotice.text}</span>
        </div>
      )}

      {/* Global Error */}
      {error && (
        <div className="bg-red-950/80 border border-red-800/80 text-red-300 p-4 rounded-xl flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center space-x-3">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="text-xs sm:text-sm">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white p-1 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-studio-card border border-studio-border p-4 rounded-xl space-y-3 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search */}
          <div className="md:col-span-6 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-studio-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อลาย Flash คำอธิบาย หรือสไตล์..."
              className="w-full bg-studio-main border border-studio-border focus:border-studio-red/60 text-studio-primary placeholder-studio-muted pl-9 pr-4 py-2 rounded-lg text-xs focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-studio-muted hover:text-studio-primary"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Style */}
          <div className="md:col-span-3">
            <select
              value={filterStyle}
              onChange={(e) => setFilterStyle(e.target.value)}
              className="w-full bg-studio-main border border-studio-border focus:border-studio-red/60 text-studio-primary px-3 py-2 rounded-lg text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">ทุกสไตล์ ({designs.length})</option>
              {availableStyles.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status */}
          <div className="md:col-span-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full bg-studio-main border border-studio-border focus:border-studio-red/60 text-studio-primary px-3 py-2 rounded-lg text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">ทุกสถานะลาย Flash</option>
              <option value="AVAILABLE">พร้อมขาย (AVAILABLE)</option>
              <option value="RESERVED">จองแล้ว (RESERVED)</option>
              <option value="SOLD">ขายแล้ว/ปิดขาย (SOLD)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-studio-secondary pt-2 border-t border-studio-border/60">
          <div>
            แสดง <strong className="text-studio-primary font-bold">{filteredDesigns.length}</strong> จากทั้งหมด {designs.length} รายการ
          </div>
          {(filterStyle !== 'ALL' || filterStatus !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setFilterStyle('ALL');
                setFilterStatus('ALL');
                setSearchQuery('');
              }}
              className="text-studio-red hover:underline text-[11px]"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="py-20 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse space-y-3">
          <Loader2 size={24} className="animate-spin text-studio-red mx-auto" />
          <p className="text-xs">กำลังโหลดลาย Flash...</p>
        </div>
      ) : filteredDesigns.length === 0 ? (
        <div className="py-16 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
            <Sparkles size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-studio-primary">ไม่พบรายการลาย Flash</p>
            <p className="text-xs text-studio-muted">
              {designs.length === 0
                ? 'คุณยังไม่มีลาย Flash ในระบบ กดปุ่ม "สร้างลาย Flash ใหม่" เพื่อเริ่มต้น'
                : 'ไม่พบรายการที่ตรงกับเงื่อนไขตัวกรอง'}
            </p>
          </div>
          {designs.length === 0 && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-studio-red text-white text-xs font-medium rounded-lg hover:bg-studio-red/90 transition-colors inline-flex items-center space-x-1.5"
            >
              <Plus size={14} />
              <span>สร้างลาย Flash แรก</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {filteredDesigns.map((design) => {
            const isSold = design.status === 'SOLD';
            const isReserved = design.status === 'RESERVED';

            return (
              <div
                key={design.id}
                className={`group bg-studio-card border rounded-xl overflow-hidden transition-all duration-200 shadow-md flex flex-col justify-between ${
                  design.is_visible
                    ? 'border-studio-border hover:border-studio-red/60'
                    : 'border-studio-border/40 opacity-75 bg-studio-card/60'
                }`}
              >
                {/* Image Container */}
                <div className="relative aspect-square w-full bg-black/40 overflow-hidden">
                  <img
                    src={getThumbnailUrl(design.image_url)}
                    onError={(e) => handleThumbnailError(e, design.image_url)}
                    alt={design.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    decoding="async"
                  />

                  {/* Status Overlay Badge */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    {isSold ? (
                      <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-red-950/90 text-red-400 border border-red-800/80 backdrop-blur-md">
                        SOLD OUT
                      </span>
                    ) : isReserved ? (
                      <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-950/90 text-amber-400 border border-amber-800/80 backdrop-blur-md">
                        RESERVED
                      </span>
                    ) : (
                      <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-400 border border-emerald-800/80 backdrop-blur-md">
                        AVAILABLE
                      </span>
                    )}

                    {!design.is_visible && (
                      <span className="text-[9px] sm:text-[10px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full bg-zinc-900/90 text-zinc-400 border border-zinc-700/60 backdrop-blur-md">
                        ซ่อน
                      </span>
                    )}
                  </div>

                  {/* Style Badge */}
                  <div className="absolute top-2 right-2">
                    <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 rounded bg-black/70 text-studio-secondary border border-studio-border/60 backdrop-blur-md">
                      {design.style}
                    </span>
                  </div>
                </div>

                {/* Info Container */}
                <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2.5">
                  <div className="space-y-0.5">
                    <h3 className="text-xs sm:text-sm font-semibold text-studio-primary group-hover:text-studio-red transition-colors line-clamp-1">
                      {design.title}
                    </h3>
                    {design.description && (
                      <p className="text-xs text-studio-secondary line-clamp-2 leading-relaxed">
                        {design.description}
                      </p>
                    )}
                  </div>

                  {/* Quick Action / Close Sale buttons */}
                  <div className="pt-2 border-t border-studio-border/60 flex items-center justify-between gap-2">
                    {/* Status quick toggle */}
                    {isSold ? (
                      <button
                        onClick={() => handleQuickStatusToggle(design, 'AVAILABLE')}
                        className="px-2.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-400 text-[11px] font-medium rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                        title="เปิดขายใหม่"
                      >
                        <RefreshCw size={12} />
                        <span>เปิดขายใหม่</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleQuickStatusToggle(design, 'SOLD')}
                        className="px-2.5 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-400 text-[11px] font-medium rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                        title="ปิดการขาย (SOLD)"
                      >
                        <Lock size={12} />
                        <span>ปิดขาย (SOLD)</span>
                      </button>
                    )}

                    <div className="flex items-center space-x-1.5">
                      {/* Visibility Toggle */}
                      <button
                        onClick={() => handleToggleVisibility(design)}
                        className="p-1.5 bg-studio-sec hover:bg-studio-border border border-studio-border text-studio-secondary hover:text-studio-primary rounded-lg transition-colors"
                        title={design.is_visible ? 'ซ่อนจากหน้าเว็บ' : 'แสดงบนหน้าเว็บ'}
                      >
                        {design.is_visible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEditModal(design)}
                        className="px-2.5 py-1.5 bg-studio-sec hover:bg-studio-border border border-studio-border text-xs text-studio-primary font-medium rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
                      >
                        <Edit3 size={13} />
                        <span>แก้ไข</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => setDeleteTarget(design)}
                        className="p-1.5 bg-studio-sec hover:bg-red-950/60 text-studio-muted hover:text-red-400 border border-studio-border hover:border-red-800/60 rounded-lg transition-colors cursor-pointer"
                        title="ลบลาย Flash"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isFormModalOpen &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#171512] border border-[#2D2820] rounded-xl w-full max-w-xl overflow-hidden shadow-2xl space-y-0 font-prompt">
              {/* Modal Header */}
              <div className="px-5 py-4 border-b border-[#2D2820] flex items-center justify-between bg-[#171512]">
                <h3 className="text-sm sm:text-base font-bold text-[#ECE4D3] flex items-center gap-2">
                  <Sparkles size={18} className="text-[#9C2F2F]" />
                  <span>{editingDesign ? 'แก้ไขแบบลายสัก FLASH' : 'เพิ่มแบบลายสัก FLASH ใหม่'}</span>
                </h3>
                <button
                  onClick={() => setIsFormModalOpen(false)}
                  className="text-[#7A7162] hover:text-[#ECE4D3] p-1 rounded transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSubmitForm} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
                {formError && (
                  <div className="p-3 bg-red-950/80 border border-red-800/80 text-red-300 text-xs rounded-lg flex items-center space-x-2">
                    <AlertCircle size={15} className="text-red-400 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Section 1: Image Upload Box */}
                <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-4 space-y-3">
                  {/* Card Header with Icon */}
                  <div className="flex items-center gap-2 border-b border-[#2D2820] pb-2.5">
                    <Camera size={15} className="text-[#9C2F2F]" />
                    <span className="text-xs font-bold text-[#ECE4D3]">รูปภาพลาย Flash</span>
                    <span className="text-red-400">*</span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileSelect}
                    className="hidden"
                  />

                  <div className="flex flex-row items-start gap-4 text-left">
                    {/* Thumbnail / Dropzone Box */}
                    <div
                      onClick={() => {
                        if (!isUploadingImage) fileInputRef.current?.click();
                      }}
                      className="w-28 h-28 sm:w-32 sm:h-32 bg-[#0E0D0C] border border-[#2D2820] hover:border-[#9C2F2F]/60 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0 overflow-hidden relative group"
                    >
                      {isUploadingImage ? (
                        <Loader2 size={22} className="animate-spin text-[#9C2F2F]" />
                      ) : formImageUrl ? (
                        <img src={formImageUrl} alt="Preview" className="w-full h-full object-contain p-1" />
                      ) : (
                        <div className="text-center p-2 text-[#7A7162] group-hover:text-[#ECE4D3] transition-colors">
                          <Upload size={20} className="mx-auto mb-1" />
                          <span className="text-[11px] font-medium block">+ เลือกรูปภาพ</span>
                        </div>
                      )}
                    </div>

                    {/* Controls & Subtitle */}
                    <div className="flex-1 space-y-2 text-left min-w-0 pt-1">
                      <div>
                        <h4 className="text-xs font-bold text-[#ECE4D3]">
                          {formImageUrl ? 'เลือกไฟล์รูปภาพแล้ว' : 'ยังไม่ได้เลือกไฟล์รูปภาพ'}
                        </h4>
                        <p className="text-[11px] text-[#7A7162] mt-0.5">
                          รองรับ JPG, PNG, WEBP สูงสุด 5MB
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-start gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isUploadingImage}
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 bg-[#25201A] hover:bg-[#322A22] border border-[#2D2820] text-xs text-[#ECE4D3] rounded transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                        >
                          <Camera size={13} className="text-[#9C2F2F]" />
                          <span>{formImageUrl ? 'เลือกรูปใหม่' : 'เลือกรูปใหม่'}</span>
                        </button>

                        {formImageUrl && (
                          <button
                            type="button"
                            onClick={() => setFormImageUrl('')}
                            className="px-2.5 py-1.5 bg-[#0E0D0C] hover:bg-red-950/40 border border-[#2D2820] text-xs text-red-400 rounded transition-colors flex items-center gap-1 font-medium cursor-pointer"
                          >
                            <Trash2 size={12} />
                            <span>ลบรูป</span>
                          </button>
                        )}
                      </div>

                      {imageUploadError && (
                        <p className="text-[11px] text-red-400 font-medium">{imageUploadError}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 2: ข้อมูลผลงาน */}
                <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-4 space-y-3.5">
                  <div className="border-b border-[#2D2820] pb-1.5">
                    <h4 className="text-xs font-bold text-[#A89F91] uppercase tracking-wider">ข้อมูลผลงาน</h4>
                  </div>

                  {/* ชื่อลายสัก (Title) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      ชื่อลายสัก (Title) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="เช่น Geometric Compass & Arrow"
                      className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                    />
                  </div>

                  {/* สไตล์ (Style) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      สไตล์ (Style) <span className="text-red-400">*</span>
                    </label>
                    <select
                      required
                      value={formStyle}
                      onChange={(e) => setFormStyle(e.target.value)}
                      className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
                    >
                      {artistSpecialties.map((st: string) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* ประเภทลาย Flash */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      ประเภทลาย Flash <span className="text-red-400">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <label
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                          !formIsRepeatable
                            ? 'bg-[#1C1814] border-[#9C2F2F] text-[#ECE4D3]'
                            : 'bg-[#0E0D0C] border-[#2D2820] text-[#7A7162] hover:border-[#3E372C]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="artistFlashRepeatable"
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
                          name="artistFlashRepeatable"
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

                {/* Section 3: รายละเอียด */}
                <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-4 space-y-3">
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

                  <div className="pt-2 border-t border-[#2D2820]">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsVisible}
                        onChange={(e) => setFormIsVisible(e.target.checked)}
                        className="w-4 h-4 rounded bg-[#0E0D0C] border-[#3E372C] text-[#9C2F2F] focus:ring-0 focus:outline-none cursor-pointer"
                      />
                      <span className="text-xs text-[#ECE4D3] font-medium">แสดงผลงานบนเว็บไซต์</span>
                    </label>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="border-t border-[#2D2820] pt-4 flex justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    disabled={formSubmitting || isUploadingImage}
                    className="bg-transparent border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] px-4 py-2 rounded-[4px] text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    ยกเลิก
                  </button>

                  <button
                    type="submit"
                    disabled={formSubmitting || isUploadingImage}
                    className="bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] px-5 py-2 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-[#9C2F2F]/20 cursor-pointer"
                  >
                    {formSubmitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <span>{editingDesign ? 'บันทึกการแก้ไข' : 'สร้างแบบลาย FLASH'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-studio-card border border-studio-border rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl font-prompt text-center">
              <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800/60 text-red-400 mx-auto flex items-center justify-center">
                <Trash2 size={24} />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-semibold text-studio-primary">
                  ยืนยันลบลาย Flash?
                </h3>
                <p className="text-xs text-studio-secondary">
                  คุณกำลังจะลบลาย Flash <strong className="text-studio-primary font-semibold font-mono">&quot;{deleteTarget.title}&quot;</strong> ออกจากระบบ ข้อมูลนี้ไม่สามารถกู้คืนได้
                </p>
              </div>

              <div className="pt-4 flex items-center justify-center space-x-3 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeletingFlash}
                  className="px-4 py-2 bg-studio-sec border border-studio-border text-xs text-studio-secondary hover:text-studio-primary rounded-lg transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={handleDeleteFlash}
                  disabled={isDeletingFlash}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeletingFlash && <Loader2 size={14} className="animate-spin" />}
                  <span>ยืนยันลบลาย Flash</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
