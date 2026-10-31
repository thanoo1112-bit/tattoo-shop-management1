'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import { uploadStudioImage, deleteStudioAssets } from '@/lib/utils/storageUploader';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';
import {
  Sparkles,
  Plus,
  Search,
  SlidersHorizontal,
  Edit2,
  Trash2,
  User,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Upload,
  Camera,
  Loader2,
} from 'lucide-react';

export interface ArtistPortfolioArtwork {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  style: string;
  size_label: string | null;
  estimated_duration_minutes: number | null;
  image_url: string;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export default function ArtistPortfolioManagement() {
  const { supabase, staffArtistId, staffArtistRecord } = useApp();
  const searchParams = useSearchParams();

  const [artworks, setArtworks] = useState<ArtistPortfolioArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStyle, setFilterStyle] = useState('ALL');

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [editingArtwork, setEditingArtwork] = useState<ArtistPortfolioArtwork | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form Fields
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    style: '',
    image_url: '',
    is_visible: true,
    sort_order: 0,
  });

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<ArtistPortfolioArtwork | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Artist specialties derived from staffArtistRecord
  const artistSpecialties = useMemo(() => {
    if (!staffArtistRecord || !Array.isArray(staffArtistRecord.specialties)) {
      return ['Fine Line', 'Black & Grey', 'Realism', 'Minimalist', 'Traditional', 'Japanese / Irezumi', 'Color Tattoo', 'Cover Up'];
    }
    const specs = staffArtistRecord.specialties.map((s: string) => s.trim()).filter(Boolean);
    return specs.length > 0 ? specs : ['Fine Line', 'Black & Grey', 'Realism', 'Minimalist', 'Traditional', 'Japanese / Irezumi', 'Color Tattoo', 'Cover Up'];
  }, [staffArtistRecord]);

  // Dynamic filter style options across artworks
  const availableFilterStyles = useMemo(() => {
    const set = new Set<string>(artistSpecialties);
    artworks.forEach((art) => {
      if (art.style) set.add(art.style.trim());
    });
    return Array.from(set).sort();
  }, [artistSpecialties, artworks]);

  // File Upload Handler for Portfolio Artworks (studio-assets/portfolio)
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setImageUploadError(null);
    setFormError(null);

    try {
      const result = await uploadStudioImage(file, 'portfolio');
      setFormData((prev) => ({ ...prev, image_url: result.publicUrl }));
    } catch (err: any) {
      console.error('[ArtistPortfolio] Image upload failed:', err);
      setImageUploadError(err?.message || 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 1. Fetch Artworks for this Artist
  const fetchData = useCallback(async () => {
    if (!staffArtistId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: artworkData, error: artworkErr } = await supabase
        .from('portfolio_artworks')
        .select('*')
        .eq('artist_id', staffArtistId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (artworkErr) throw artworkErr;

      const mappedArtworks: ArtistPortfolioArtwork[] = (artworkData || []).map((item: any) => ({
        id: item.id,
        artist_id: item.artist_id,
        title: item.title,
        description: item.description || null,
        style: item.style || '',
        size_label: item.size_label || null,
        estimated_duration_minutes: item.estimated_duration_minutes || null,
        image_url: item.image_url,
        is_visible: item.is_visible,
        sort_order: item.sort_order ?? 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));

      setArtworks(mappedArtworks);
    } catch (err: any) {
      console.error('[ArtistPortfolio] Fetch error:', err?.message || err);
      setError('ไม่สามารถโหลดข้อมูลผลงานได้: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setLoading(false);
    }
  }, [supabase, staffArtistId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Flash toast auto clear
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  useEffect(() => {
    if (actionWarning) {
      const timer = setTimeout(() => setActionWarning(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [actionWarning]);

  // Handle URL action parameter (e.g. ?action=add)
  useEffect(() => {
    if (searchParams.get('action') === 'add' && !loading) {
      handleOpenCreateModal();
    }
  }, [searchParams, loading]);

  // 2. Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingArtwork(null);
    setFormData({
      title: '',
      description: '',
      style: artistSpecialties[0] || 'Fine Line',
      image_url: '',
      is_visible: true,
      sort_order: (artworks.length + 1) * 10,
    });
    setFormError(null);
    setImageUploadError(null);
    setIsUploadingImage(false);
    setIsModalOpen(true);
  };

  // 3. Open Edit Modal
  const handleOpenEditModal = (artwork: ArtistPortfolioArtwork) => {
    setEditingArtwork(artwork);
    setFormData({
      title: artwork.title,
      description: artwork.description || '',
      style: artwork.style || artistSpecialties[0] || '',
      image_url: artwork.image_url,
      is_visible: artwork.is_visible,
      sort_order: artwork.sort_order ?? 0,
    });
    setFormError(null);
    setImageUploadError(null);
    setIsUploadingImage(false);
    setIsModalOpen(true);
  };

  // 4. Save Artwork (Create / Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!staffArtistId) {
      setFormError('ไม่พบข้อมูลช่างสักประจำระบบ กรุณาล็อกอินใหม่');
      return;
    }
    if (isUploadingImage) {
      setFormError('กรุณารอให้อัปโหลดรูปภาพเสร็จสิ้นก่อนบันทึก');
      return;
    }
    if (!formData.style) {
      setFormError('กรุณาเลือกสไตล์ผลงาน');
      return;
    }
    if (!formData.title.trim()) {
      setFormError('กรุณาระบุชื่อผลงาน');
      return;
    }
    if (!formData.image_url.trim()) {
      setFormError('กรุณาเลือกรูปภาพผลงาน');
      return;
    }

    setSubmitting(true);
    try {
      if (editingArtwork) {
        // UPDATE Existing Artwork (Strictly matching artist_id)
        const { error: updateErr } = await supabase
          .from('portfolio_artworks')
          .update({
            title: formData.title.trim(),
            description: formData.description.trim() || null,
            style: formData.style,
            image_url: formData.image_url.trim(),
            is_visible: formData.is_visible,
            sort_order: Number(formData.sort_order) || 0,
          })
          .eq('id', editingArtwork.id)
          .eq('artist_id', staffArtistId);

        if (updateErr) throw updateErr;

        setActionSuccess(`แก้ไขผลงาน "${formData.title}" เรียบร้อยแล้ว`);
      } else {
        // INSERT New Artwork
        const { error: insertErr } = await supabase
          .from('portfolio_artworks')
          .insert({
            artist_id: staffArtistId,
            title: formData.title.trim(),
            description: formData.description.trim() || null,
            style: formData.style,
            image_url: formData.image_url.trim(),
            is_visible: formData.is_visible,
            sort_order: Number(formData.sort_order) || 0,
          });

        if (insertErr) throw insertErr;

        setActionSuccess(`เพิ่มผลงานใหม่ "${formData.title}" สำเร็จแล้ว`);
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('[ArtistPortfolio] Save error:', err?.message || err);
      setFormError('เกิดข้อผิดพลาดในการบันทึก: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Toggle Visibility
  const handleToggleVisibility = async (artwork: ArtistPortfolioArtwork) => {
    if (!staffArtistId) return;
    const nextVisibility = !artwork.is_visible;
    try {
      const { error: toggleErr } = await supabase
        .from('portfolio_artworks')
        .update({ is_visible: nextVisibility })
        .eq('id', artwork.id)
        .eq('artist_id', staffArtistId);

      if (toggleErr) throw toggleErr;

      setArtworks((prev) =>
        prev.map((item) => (item.id === artwork.id ? { ...item, is_visible: nextVisibility } : item))
      );

      setActionSuccess(
        nextVisibility
          ? `เปิดการแสดงผลงาน "${artwork.title}" บนหน้าร้านแล้ว`
          : `ซ่อนผลงาน "${artwork.title}" เรียบร้อยแล้ว`
      );
    } catch (err: any) {
      console.error('[ArtistPortfolio] Toggle visibility error:', err?.message || err);
      setError('ไม่สามารถเปลี่ยนสถานะการแสดงผลได้: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    }
  };

  // 6. Delete Artwork
  const handleDeleteArtwork = async () => {
    if (!deleteTarget || !staffArtistId) return;
    setDeleting(true);
    try {
      const targetId = deleteTarget.id;
      const targetTitle = deleteTarget.title;
      const targetImageUrl = deleteTarget.image_url;
      const targetArtistId = deleteTarget.artist_id;

      // 1. Ownership validation
      if (targetArtistId !== staffArtistId) {
        setError('คุณไม่มีสิทธิ์ลบผลงานของช่างท่านอื่น');
        setDeleteTarget(null);
        return;
      }

      // 2. Shared File Protection: check if image_url is referenced by other records
      let isShared = false;
      if (targetImageUrl) {
        // A. Other portfolio artworks
        const { count: portfolioCount } = await supabase
          .from('portfolio_artworks')
          .select('id', { count: 'exact', head: true })
          .eq('image_url', targetImageUrl)
          .neq('id', targetId);

        // B. Flash designs image_url
        const { count: flashCount1 } = await supabase
          .from('flash_designs')
          .select('id', { count: 'exact', head: true })
          .eq('image_url', targetImageUrl);

        // C. Flash designs image_url_2
        const { count: flashCount2 } = await supabase
          .from('flash_designs')
          .select('id', { count: 'exact', head: true })
          .eq('image_url_2', targetImageUrl);

        if (
          (portfolioCount && portfolioCount > 0) ||
          (flashCount1 && flashCount1 > 0) ||
          (flashCount2 && flashCount2 > 0)
        ) {
          isShared = true;
          console.info(`[ArtistPortfolio] Image is shared with other record(s). Skipping storage file deletion.`);
        }
      }

      // 3. Database Delete MUST happen FIRST
      const { error: delErr } = await supabase
        .from('portfolio_artworks')
        .delete()
        .eq('id', targetId)
        .eq('artist_id', staffArtistId);

      if (delErr) throw delErr;

      // 4. Storage Cleanup AFTER DB delete succeeds (if not shared)
      let storageWarning = false;
      if (targetImageUrl && !isShared) {
        const { error: storageErr } = await deleteStudioAssets([targetImageUrl], supabase);
        if (storageErr) {
          console.warn('[ArtistPortfolio] Storage cleanup failed after DB delete:', storageErr);
          storageWarning = true;
        }
      }

      // 5. User Feedback
      if (storageWarning) {
        setActionWarning(`ลบข้อมูลผลงาน "${targetTitle}" เรียบร้อยแล้ว แต่ไม่สามารถลบไฟล์รูปภาพบางส่วนจาก Storage ได้`);
      } else if (isShared) {
        setActionSuccess(`ลบผลงาน "${targetTitle}" เรียบร้อยแล้ว (เก็บไฟล์รูปภาพไว้เนื่องจากมีรายการอื่นใช้อยู่)`);
      } else {
        setActionSuccess(`ลบผลงาน "${targetTitle}" และไฟล์รูปภาพเรียบร้อยแล้ว`);
      }

      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      console.error('[ArtistPortfolio] Delete error:', err?.message || err);
      setError('ไม่สามารถลบผลงานได้: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setDeleting(false);
    }
  };

  // Filtered artworks
  const filteredArtworks = useMemo(() => {
    return artworks.filter((item) => {
      // Style Filter
      if (filterStyle !== 'ALL' && item.style !== filterStyle) return false;

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q) || false;
        const matchStyle = item.style.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchStyle) return false;
      }

      return true;
    });
  }, [artworks, filterStyle, searchQuery]);

  return (
    <div className="space-y-6 font-prompt">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-studio-card border border-studio-border p-5 rounded-xl shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-studio-red-bright uppercase tracking-wider font-semibold">
              ARTIST PORTFOLIO
            </span>
            <span className="text-studio-muted text-xs">•</span>
            <span className="text-xs text-[#ECE4D3] font-mono">
              ช่างประจำผลงาน: {staffArtistRecord?.name || 'ช่างสัก'} {staffArtistRecord?.nickname ? `(${staffArtistRecord.nickname})` : ''}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary flex items-center gap-2">
            <ImageIcon className="text-studio-red-bright" size={24} />
            <span>จัดการผลงานของฉัน</span>
          </h1>
          <p className="text-xs text-[#ECE4D3] max-w-2xl">
            คุณสามารถเพิ่ม แก้ไข ซ่อน หรือลบรูปผลงานสักของตนเองเพื่อแสดงบนหน้าพอร์ตโฟลิโอของร้าน
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2.5 bg-studio-sec border border-studio-border hover:border-studio-red/50 text-[#ECE4D3] hover:text-white rounded-lg transition-colors cursor-pointer"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-studio-red-bright' : ''} />
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 bg-studio-red hover:bg-studio-red/90 text-white font-medium text-xs rounded-lg transition-colors flex items-center space-x-2 shadow-lg cursor-pointer"
          >
            <Plus size={16} />
            <span>เพิ่มผลงานใหม่</span>
          </button>
        </div>
      </div>

      {/* Action Success Toast Banner */}
      {actionSuccess && (
        <div className="bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 p-4 rounded-xl flex items-center space-x-3 shadow-lg animate-fadeIn">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-medium">{actionSuccess}</span>
        </div>
      )}

      {/* Action Warning Toast Banner */}
      {actionWarning && (
        <div className="bg-amber-950/80 border border-amber-800/80 text-amber-300 p-4 rounded-xl flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center space-x-3">
            <AlertCircle size={18} className="text-amber-400 shrink-0" />
            <span className="text-xs sm:text-sm font-medium">{actionWarning}</span>
          </div>
          <button onClick={() => setActionWarning(null)} className="text-amber-400 hover:text-white p-1 rounded">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div className="bg-red-950/80 border border-red-800/80 text-red-300 p-4 rounded-xl flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center space-x-3">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="text-xs sm:text-sm">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-white p-1 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-studio-card border border-studio-border p-4 rounded-xl space-y-3 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="md:col-span-8 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ECE4D3]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อผลงาน คำอธิบาย หรือสไตล์..."
              className="w-full bg-studio-main border border-studio-border focus:border-studio-red/60 text-studio-primary placeholder-[#B8B0A3] pl-9 pr-4 py-2 rounded-lg text-xs focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B8B0A3] hover:text-studio-primary"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Style */}
          <div className="md:col-span-4">
            <select
              value={filterStyle}
              onChange={(e) => setFilterStyle(e.target.value)}
              className="w-full bg-studio-main border border-studio-border focus:border-studio-red/60 text-studio-primary px-3 py-2 rounded-lg text-xs focus:outline-none transition-colors cursor-pointer"
            >
              <option value="ALL">ทุกสไตล์ผลงาน ({artworks.length})</option>
              {availableFilterStyles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center justify-between text-xs text-[#ECE4D3] pt-2 border-t border-studio-border/60">
          <div>
            แสดง <strong className="text-studio-primary font-bold">{filteredArtworks.length}</strong> จากทั้งหมด {artworks.length} รายการ
          </div>
          {(filterStyle !== 'ALL' || searchQuery) && (
            <button
              onClick={() => {
                setFilterStyle('ALL');
                setSearchQuery('');
              }}
              className="text-studio-red-bright hover:underline text-[11px]"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* Artwork Grid List */}
      {loading ? (
        <div className="py-20 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse space-y-3">
          <Loader2 size={24} className="animate-spin text-studio-red-bright mx-auto" />
          <p className="text-xs">กำลังโหลดผลงาน...</p>
        </div>
      ) : filteredArtworks.length === 0 ? (
        <div className="py-16 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
            <ImageIcon size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-studio-primary">ไม่พบรายการผลงาน</p>
            <p className="text-xs text-[#ECE4D3]">
              {artworks.length === 0
                ? 'คุณยังไม่มีรายการผลงานในระบบ กดปุ่ม "เพิ่มผลงานใหม่" เพื่อเริ่มต้น'
                : 'ไม่พบผลงานที่ตรงกับเงื่อนไขการค้นหา/ตัวกรอง'}
            </p>
          </div>
          {artworks.length === 0 && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-studio-red text-white text-xs font-medium rounded-lg hover:bg-studio-red/90 transition-colors inline-flex items-center space-x-1.5"
            >
              <Plus size={14} />
              <span>เพิ่มผลงานชิ้นแรก</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
          {filteredArtworks.map((artwork) => {
            const artistName = staffArtistRecord?.name || 'ช่างประจำร้าน';

            return (
              <div
                key={artwork.id}
                className={`bg-[#171512] border rounded-[6px] overflow-hidden flex flex-col justify-between transition-all duration-300 group shadow-md hover:shadow-lg hover:shadow-[#C12D2D]/5 min-w-0 ${
                  artwork.is_visible
                    ? 'border-[#2D2820] hover:border-[#C12D2D]/60'
                    : 'border-[#2D2820]/40 opacity-70 bg-[#13110F]'
                }`}
              >
                {/* Image Area */}
                <div className="aspect-[4/5] bg-[#0E0D0C] relative overflow-hidden group">
                  <img
                    src={getThumbnailUrl(artwork.image_url)}
                    onError={(e) => handleThumbnailError(e, artwork.image_url)}
                    alt={artwork.title}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    decoding="async"
                  />
                </div>

                {/* Info Area Below Image */}
                <div className="p-2 sm:p-3 bg-[#171512] flex flex-col justify-between flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                  <div className="space-y-0.5 sm:space-y-1 min-w-0">
                    <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-[#C12D2D] font-bold block truncate">
                      {artwork.style}
                    </span>
                    <h3
                      className="text-xs sm:text-sm font-bold text-[#ECE4D3] truncate group-hover:text-[#C12D2D] transition-colors"
                      title={artwork.title}
                    >
                      {artwork.title}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-[#ECE4D3] truncate">
                      ช่าง: <span className="text-[#ECE4D3] font-medium">{artistName}</span>
                    </p>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="pt-2 sm:pt-2.5 mt-auto border-t border-[#2D2820] flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(artwork)}
                      className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-[#25201A] hover:bg-[#2D2820] border border-[#3E372C] hover:border-[#C12D2D]/60 text-[#ECE4D3] rounded-[4px] text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      title="แก้ไขผลงานสัก"
                    >
                      <Edit2 size={11} className="shrink-0" />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(artwork)}
                      className="p-1 sm:p-1.5 bg-[#25201A] hover:bg-[#C12D2D]/20 border border-[#3E372C] hover:border-[#C12D2D] text-[#ECE4D3] hover:text-[#C12D2D] rounded-[4px] transition-colors cursor-pointer shrink-0"
                      title="ลบผลงาน"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen &&
        isMounted &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-studio-card border border-studio-border rounded-xl w-full max-w-lg overflow-hidden shadow-2xl space-y-0 font-prompt">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-studio-border flex items-center justify-between bg-studio-sec/50">
                <h3 className="text-base font-semibold text-studio-primary flex items-center gap-2">
                  <ImageIcon size={18} className="text-studio-red-bright" />
                  <span>{editingArtwork ? 'แก้ไขผลงาน' : 'เพิ่มผลงานใหม่'}</span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-studio-muted hover:text-studio-primary p-1 rounded transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSubmitForm} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                {formError && (
                  <div className="p-3 bg-red-950/80 border border-red-800/80 text-red-300 text-xs rounded-lg flex items-center space-x-2">
                    <AlertCircle size={15} className="text-red-400 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Artwork Title */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#ECE4D3] font-medium block">
                    ชื่อผลงาน <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="เช่น Dragon Back Piece, Minimal Rose ฯลฯ"
                    className="w-full bg-studio-main border border-studio-border focus:border-studio-red/60 text-studio-primary px-3.5 py-2 rounded-lg text-xs focus:outline-none"
                  />
                </div>

                {/* Style */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#ECE4D3] font-medium block">
                    สไตล์ผลงาน <span className="text-red-400">*</span>
                  </label>
                  <select
                    required
                    value={formData.style}
                    onChange={(e) => setFormData((prev) => ({ ...prev, style: e.target.value }))}
                    className="w-full bg-studio-main border border-studio-border focus:border-studio-red/60 text-studio-primary px-3.5 py-2 rounded-lg text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="" disabled>-- เลือกสไตล์ --</option>
                    {artistSpecialties.map((style: string) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Image Upload / URL Input */}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#ECE4D3] font-medium block">
                    รูปภาพผลงาน <span className="text-red-400">*</span>
                  </label>

                  {/* Upload Box */}
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileSelect}
                      className="hidden"
                    />

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingImage}
                        className="flex-1 py-2.5 px-4 bg-studio-sec border border-dashed border-studio-border hover:border-studio-red/60 text-studio-primary text-xs rounded-lg transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                      >
                        {isUploadingImage ? (
                          <>
                            <Loader2 size={16} className="animate-spin text-studio-red-bright" />
                            <span>กำลังอัปโหลดรูปภาพ...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={16} className="text-studio-red-bright" />
                            <span>{formData.image_url ? 'เปลี่ยนรูปภาพ (อัปโหลดใหม่)' : 'เลือกไฟล์รูปภาพเพื่ออัปโหลด'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {imageUploadError && (
                      <p className="text-[11px] text-red-400 font-medium">{imageUploadError}</p>
                    )}

                    {/* Image Preview */}
                    {formData.image_url && (
                      <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-studio-border bg-black/60 mt-2">
                        <img
                          src={formData.image_url}
                          alt="Preview"
                          className="w-full h-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, image_url: '' }))}
                          className="absolute top-2 right-2 p-1 bg-black/80 text-white rounded-full hover:bg-red-900 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>



                {/* Submit Buttons */}
                <div className="pt-4 flex items-center justify-end space-x-2 border-t border-studio-border">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-studio-sec border border-studio-border text-xs text-[#ECE4D3] hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || isUploadingImage}
                    className="px-5 py-2 bg-studio-red hover:bg-studio-red/90 text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    <span>{editingArtwork ? 'บันทึกการแก้ไข' : 'ยืนยันเพิ่มผลงาน'}</span>
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
                  ยืนยันลบผลงาน?
                </h3>
                <p className="text-xs text-[#ECE4D3]">
                  คุณกำลังจะลบผลงาน <strong className="text-studio-primary font-semibold font-mono">&quot;{deleteTarget.title}&quot;</strong> ออกจากระบบ ข้อมูลนี้จะไม่สามารถกู้คืนได้
                </p>
              </div>

              <div className="pt-4 flex items-center justify-center space-x-3 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-4 py-2 bg-studio-sec border border-studio-border text-xs text-[#ECE4D3] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={handleDeleteArtwork}
                  disabled={deleting}
                  className="px-5 py-2 bg-[#C12D2D] hover:bg-[#A82525] text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {deleting && <Loader2 size={14} className="animate-spin" />}
                  <span>ยืนยันลบผลงาน</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
