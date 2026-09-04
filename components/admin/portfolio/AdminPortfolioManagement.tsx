'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '@/components/AppContext';
import { uploadStudioImage } from '@/lib/utils/storageUploader';
import {
  Sparkles,
  Plus,
  Search,
  SlidersHorizontal,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  User,
  Clock,
  Maximize2,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Image as ImageIcon,
  Upload,
  Camera,
  Loader2,
} from 'lucide-react';

export interface AdminPortfolioArtwork {
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
  artists?: {
    id: string;
    name: string;
    nickname: string | null;
    avatar_url: string | null;
    is_active?: boolean;
  } | null;
}

export interface ActiveArtist {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

const STYLE_OPTIONS = [
  'Fine Line',
  'Blackwork',
  'Traditional',
  'Japanese',
  'Minimal',
  'Realism',
  'Custom',
];

export default function AdminPortfolioManagement() {
  const { supabase } = useApp();

  const [artworks, setArtworks] = useState<AdminPortfolioArtwork[]>([]);
  const [artists, setArtists] = useState<ActiveArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStyle, setFilterStyle] = useState('ALL');
  const [filterVisibility, setFilterVisibility] = useState<'ALL' | 'VISIBLE' | 'HIDDEN'>('ALL');
  const [filterArtist, setFilterArtist] = useState('ALL');

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingArtwork, setEditingArtwork] = useState<AdminPortfolioArtwork | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Image Upload State
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      console.error('[AdminPortfolio] Image upload failed:', err);
      setImageUploadError(err?.message || 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Form Fields
  const [formData, setFormData] = useState({
    artist_id: '',
    title: '',
    description: '',
    style: 'Fine Line',
    size_label: '',
    duration_hours: '',
    duration_minutes: '',
    image_url: '',
    is_visible: true,
    sort_order: 0,
  });

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<AdminPortfolioArtwork | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 1. Fetch Artworks and Active Artists
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch Artworks
      const { data: artworkData, error: artworkErr } = await supabase
        .from('portfolio_artworks')
        .select(`
          id,
          artist_id,
          title,
          description,
          style,
          size_label,
          estimated_duration_minutes,
          image_url,
          is_visible,
          sort_order,
          created_at,
          updated_at,
          artists (
            id,
            name,
            nickname,
            avatar_url,
            is_active
          )
        `)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (artworkErr) throw artworkErr;

      const mappedArtworks: AdminPortfolioArtwork[] = (artworkData || []).map((item: any) => ({
        id: item.id,
        artist_id: item.artist_id,
        title: item.title,
        description: item.description || null,
        style: item.style || 'Fine Line',
        size_label: item.size_label || null,
        estimated_duration_minutes: item.estimated_duration_minutes || null,
        image_url: item.image_url,
        is_visible: item.is_visible,
        sort_order: item.sort_order ?? 0,
        created_at: item.created_at,
        updated_at: item.updated_at,
        artists: Array.isArray(item.artists) ? item.artists[0] : item.artists,
      }));

      setArtworks(mappedArtworks);

      // Fetch Active Artists for dropdown
      const { data: artistData, error: artistErr } = await supabase
        .from('artists')
        .select('id, name, nickname, avatar_url, is_active')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (artistErr) throw artistErr;
      setArtists(artistData || []);
    } catch (err: any) {
      console.error('[AdminPortfolio] Fetch error:', err?.message || err);
      setError('ไม่สามารถโหลดข้อมูลผลงานได้: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

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

  // 2. Open Create Modal
  const handleOpenCreateModal = () => {
    const defaultArtistId = artists.find((a) => a.is_active)?.id || artists[0]?.id || '';
    setEditingArtwork(null);
    setFormData({
      artist_id: defaultArtistId,
      title: '',
      description: '',
      style: 'Fine Line',
      size_label: '',
      duration_hours: '',
      duration_minutes: '',
      image_url: '',
      is_visible: true,
      sort_order: (artworks.length + 1) * 10,
    });
    setFormError(null);
    setImageUploadError(null);
    setIsUploadingImage(false);
    setShowManualUrlInput(false);
    setIsModalOpen(true);
  };

  // 3. Open Edit Modal
  const handleOpenEditModal = (artwork: AdminPortfolioArtwork) => {
    setEditingArtwork(artwork);
    const totalMinutes = artwork.estimated_duration_minutes || 0;
    const hours = totalMinutes > 0 ? Math.floor(totalMinutes / 60) : '';
    const mins = totalMinutes > 0 && totalMinutes % 60 > 0 ? (totalMinutes % 60).toString() : '';

    setFormData({
      artist_id: artwork.artist_id,
      title: artwork.title,
      description: artwork.description || '',
      style: artwork.style || 'Fine Line',
      size_label: artwork.size_label || '',
      duration_hours: hours ? hours.toString() : '',
      duration_minutes: mins,
      image_url: artwork.image_url,
      is_visible: artwork.is_visible,
      sort_order: artwork.sort_order ?? 0,
    });
    setFormError(null);
    setImageUploadError(null);
    setIsUploadingImage(false);
    setShowManualUrlInput(false);
    setIsModalOpen(true);
  };

  // 4. Save Artwork (Create / Edit)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    if (isUploadingImage) {
      setFormError('กรุณารอให้อัปโหลดรูปภาพเสร็จสิ้นก่อนบันทึก');
      return;
    }
    if (!formData.artist_id) {
      setFormError('กรุณาเลือกช่างสักประจำผลงาน');
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

    // Calculate total duration in minutes
    let calculatedDurationMinutes: number | null = null;
    const h = parseInt(formData.duration_hours, 10);
    const m = parseInt(formData.duration_minutes, 10);
    if (!isNaN(h) || !isNaN(m)) {
      const total = (isNaN(h) ? 0 : h * 60) + (isNaN(m) ? 0 : m);
      if (total > 0) calculatedDurationMinutes = total;
    }

    setSubmitting(true);
    try {
      if (editingArtwork) {
        // UPDATE Existing Artwork
        const { error: updateErr } = await supabase
          .from('portfolio_artworks')
          .update({
            artist_id: formData.artist_id,
            title: formData.title.trim(),
            description: formData.description.trim() || null,
            style: formData.style,
            size_label: formData.size_label.trim() || null,
            estimated_duration_minutes: calculatedDurationMinutes,
            image_url: formData.image_url.trim(),
            is_visible: formData.is_visible,
            sort_order: Number(formData.sort_order) || 0,
          })
          .eq('id', editingArtwork.id);

        if (updateErr) throw updateErr;

        setActionSuccess(`แก้ไขผลงาน "${formData.title}" เรียบร้อยแล้ว`);
      } else {
        // INSERT New Artwork
        const { error: insertErr } = await supabase
          .from('portfolio_artworks')
          .insert({
            artist_id: formData.artist_id,
            title: formData.title.trim(),
            description: formData.description.trim() || null,
            style: formData.style,
            size_label: formData.size_label.trim() || null,
            estimated_duration_minutes: calculatedDurationMinutes,
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
      console.error('[AdminPortfolio] Save error:', err?.message || err);
      setFormError('เกิดข้อผิดพลาดในการบันทึก: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Toggle Visibility
  const handleToggleVisibility = async (artwork: AdminPortfolioArtwork) => {
    const nextVisibility = !artwork.is_visible;
    try {
      const { error: toggleErr } = await supabase
        .from('portfolio_artworks')
        .update({ is_visible: nextVisibility })
        .eq('id', artwork.id);

      if (toggleErr) throw toggleErr;

      setArtworks((prev) =>
        prev.map((item) => (item.id === artwork.id ? { ...item, is_visible: nextVisibility } : item))
      );

      setActionSuccess(
        nextVisibility
          ? `เปิดการแสดงผลงาน "${artwork.title}" บนหน้าเว็บไซต์แล้ว`
          : `ซ่อนผลงาน "${artwork.title}" จากหน้าเว็บไซต์แล้ว`
      );
    } catch (err: any) {
      console.error('[AdminPortfolio] Toggle visibility error:', err?.message || err);
      setError('ไม่สามารถเปลี่ยนสถานะการแสดงผลได้: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    }
  };

  // 6. Delete Artwork
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: deleteErr } = await supabase
        .from('portfolio_artworks')
        .delete()
        .eq('id', deleteTarget.id);

      if (deleteErr) throw deleteErr;

      setActionSuccess(`ลบผลงาน "${deleteTarget.title}" เรียบร้อยแล้ว`);
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      console.error('[AdminPortfolio] Delete error:', err?.message || err);
      setError('ไม่สามารถลบผลงานได้: ' + (err?.message || 'ข้อผิดพลาดระบบ'));
    } finally {
      setDeleting(false);
    }
  };

  // 7. Filtered List
  const filteredArtworks = useMemo(() => {
    return artworks.filter((item) => {
      // Style
      if (filterStyle !== 'ALL' && item.style.toLowerCase() !== filterStyle.toLowerCase()) {
        return false;
      }
      // Visibility
      if (filterVisibility === 'VISIBLE' && !item.is_visible) return false;
      if (filterVisibility === 'HIDDEN' && item.is_visible) return false;
      // Artist
      if (filterArtist !== 'ALL' && item.artist_id !== filterArtist) return false;
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.title?.toLowerCase().includes(q);
        const descMatch = item.description?.toLowerCase().includes(q);
        const styleMatch = item.style?.toLowerCase().includes(q);
        const artistMatch = item.artists?.name?.toLowerCase().includes(q);
        const nicknameMatch = item.artists?.nickname?.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !styleMatch && !artistMatch && !nicknameMatch) {
          return false;
        }
      }
      return true;
    });
  }, [artworks, filterStyle, filterVisibility, filterArtist, searchQuery]);

  return (
    <div className="space-y-6 font-prompt">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#171512] border border-[#2D2820] p-5 sm:p-6 rounded-[8px]">
        <div>
          <div className="inline-flex items-center space-x-1.5 bg-[#25201A] border border-[#3E372C] px-2.5 py-0.5 rounded text-[#C5A880] text-[10px] uppercase font-bold tracking-widest mb-1.5">
            <Sparkles size={12} className="text-[#9C2F2F]" />
            <span>PORTFOLIO SHOWCASE CMS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-wider text-[#ECE4D3]">
            จัดการผลงานสัก (PORTFOLIO)
          </h1>
          <p className="text-xs text-[#A89F91] mt-1">
            เพิ่ม แก้ไข และจัดลำดับผลงานสักคัสตอมจริงที่เสร็จสมบูรณ์ เพื่อแสดงในหน้า Gallery ของสตูดิโอ
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-[#25201A] border border-[#3E372C] hover:border-[#C5A880] text-[#ECE4D3] rounded-[4px] transition-colors shrink-0"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="flex-1 sm:flex-initial bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] px-4 py-2.5 rounded-[4px] text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-lg shadow-[#9C2F2F]/20"
          >
            <Plus size={15} />
            <span>+ เพิ่มผลงานสักใหม่</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {actionSuccess && (
        <div className="bg-[#1C261D] border border-green-700/50 p-3.5 rounded-[6px] flex items-center justify-between text-xs text-green-300 animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-green-400 hover:text-green-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-[#2D1B1B] border border-red-700/50 p-4 rounded-[6px] flex items-center justify-between text-xs text-red-300 animate-fadeIn">
          <div className="flex items-center space-x-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-[#171512] border border-[#2D2820] p-4 rounded-[6px] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2.5 flex-1 items-stretch sm:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7162]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อผลงาน, สไตล์, ช่าง..."
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
            {STYLE_OPTIONS.map((style) => (
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
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name} {artist.nickname ? `(${artist.nickname})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Results Counter */}
        <div className="text-xs text-[#A89F91] shrink-0 self-center">
          ผลงาน <strong className="text-[#ECE4D3]">{filteredArtworks.length}</strong> / {artworks.length} รายการ
        </div>
      </div>

      {/* Artworks List Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
            <div key={idx} className="bg-[#171512] border border-[#2D2820] rounded-[6px] overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-[#25201A]" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-[#2D2820] rounded w-3/4" />
                <div className="h-2 bg-[#2D2820] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredArtworks.length === 0 ? (
        <div className="bg-[#171512] border border-[#2D2820] p-12 rounded-[6px] text-center space-y-3">
          <ImageIcon size={36} className="text-[#7A7162] mx-auto" />
          <h3 className="text-base font-bold text-[#ECE4D3]">ยังไม่มีผลงานใน Portfolio</h3>
          <p className="text-xs text-[#A89F91] max-w-md mx-auto">
            กดปุ่ม &quot;+ เพิ่มผลงานสักใหม่&quot; เพื่อสร้างรายการผลงานสักจริงและจัดแสดงใน Portfolio Gallery
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-1.5 bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] px-4 py-2 rounded text-xs font-bold uppercase tracking-wider mt-2"
          >
            <Plus size={14} />
            + เพิ่มผลงานแรก
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredArtworks.map((item) => {
            const artistName = item.artists?.name || 'ไม่ระบุช่าง';
            const durationHours = item.estimated_duration_minutes
              ? Math.floor(item.estimated_duration_minutes / 60)
              : null;
            const durationMins = item.estimated_duration_minutes
              ? item.estimated_duration_minutes % 60
              : null;

            return (
              <div
                key={item.id}
                className={`bg-[#171512] border rounded-[6px] overflow-hidden flex flex-col justify-between transition-all ${
                  item.is_visible
                    ? 'border-[#2D2820] hover:border-[#3E372C]'
                    : 'border-[#2D2820]/40 opacity-70 bg-[#13110F]'
                }`}
              >
                <div>
                  {/* Image & Status Tag */}
                  <div className="aspect-[4/3] bg-[#0E0D0C] relative overflow-hidden group">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Style Badge */}
                    <div className="absolute top-2 left-2 bg-[#171512]/90 backdrop-blur-sm border border-[#2D2820] text-[#ECE4D3] text-[9px] font-bold px-2 py-0.5 rounded">
                      {item.style}
                    </div>

                    {/* Visibility Indicator */}
                    <div className="absolute top-2 right-2">
                      {item.is_visible ? (
                        <span className="bg-green-950/90 border border-green-700/50 text-green-300 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                          <Eye size={10} /> แสดง
                        </span>
                      ) : (
                        <span className="bg-[#2D2820]/90 border border-[#4A443A] text-[#A89F91] text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                          <EyeOff size={10} /> ซ่อน
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 space-y-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-[#ECE4D3] truncate" title={item.title}>
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-[#A89F91] mt-0.5">
                        <User size={12} className="text-[#C5A880]" />
                        <span className="truncate">{artistName}</span>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-[#A89F91] line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-2 border-t border-[#2D2820] pt-2.5 text-[11px] text-[#A89F91]">
                      <div className="flex items-center gap-1 truncate">
                        <Maximize2 size={11} className="text-[#7A7162]" />
                        <span>{item.size_label || 'ไม่ระบุขนาด'}</span>
                      </div>
                      <div className="flex items-center gap-1 truncate">
                        <Clock size={11} className="text-[#7A7162]" />
                        <span>
                          {item.estimated_duration_minutes
                            ? `${durationHours ? `${durationHours}ชม.` : ''} ${durationMins ? `${durationMins}น.` : ''}`
                            : 'ไม่ระบุเวลา'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-3 bg-[#13110F] border-t border-[#2D2820] flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleVisibility(item)}
                      className={`p-1.5 rounded text-xs transition-colors ${
                        item.is_visible
                          ? 'bg-[#25201A] text-[#ECE4D3] hover:bg-[#2D2820]'
                          : 'bg-[#2D2820] text-[#A89F91] hover:text-[#ECE4D3]'
                      }`}
                      title={item.is_visible ? 'คลิกเพื่อซ่อนผลงาน' : 'คลิกเพื่อแสดงผลงาน'}
                    >
                      {item.is_visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <a
                      href={`/portfolio?select=${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-[#25201A] hover:bg-[#2D2820] text-[#A89F91] hover:text-[#ECE4D3] rounded transition-colors"
                      title="เปิดดูในหน้าร้าน"
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="px-2.5 py-1.5 bg-[#25201A] hover:bg-[#2D2820] text-[#ECE4D3] rounded text-xs font-medium flex items-center gap-1 transition-colors"
                    >
                      <Edit2 size={12} />
                      <span>แก้ไข</span>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="p-1.5 bg-[#2D1B1B] hover:bg-red-900/60 text-red-300 rounded transition-colors"
                      title="ลบผลงาน"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-[#171512] border border-[#2D2820] rounded-[8px] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#2D2820] flex items-center justify-between">
              <h2 className="text-base font-bold text-[#ECE4D3] flex items-center gap-2">
                <Sparkles size={16} className="text-[#9C2F2F]" />
                <span>{editingArtwork ? 'แก้ไขผลงานสัก' : 'เพิ่มผลงานสักใหม่'}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#7A7162] hover:text-[#ECE4D3] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitForm} className="p-5 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="bg-[#2D1B1B] border border-red-700/50 p-3 rounded text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Artist Select */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">
                  ช่างสักประจำผลงาน <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.artist_id}
                  onChange={(e) => setFormData({ ...formData, artist_id: e.target.value })}
                  required
                  className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
                >
                  <option value="">-- เลือกช่างสัก --</option>
                  {artists.map((artist) => (
                    <option key={artist.id} value={artist.id}>
                      {artist.name} {artist.nickname ? `(${artist.nickname})` : ''}{' '}
                      {!artist.is_active ? '[ไม่พร้อมรับงาน]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">
                  ชื่อผลงาน <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="เช่น Dark Skull & Serpent Sleeve"
                  required
                  className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                />
              </div>

              {/* Style & Size Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#ECE4D3] block">
                    สไตล์ผลงาน <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.style}
                    onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                    required
                    className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer"
                  >
                    {STYLE_OPTIONS.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#ECE4D3] block">ขนาดชิ้นงาน</label>
                  <input
                    type="text"
                    value={formData.size_label}
                    onChange={(e) => setFormData({ ...formData, size_label: e.target.value })}
                    placeholder="เช่น 15x10 ซม. หรือ เต็มแผ่นหลัง"
                    className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                  />
                </div>
              </div>

              {/* Duration: Hours + Minutes */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">เวลาสักโดยประมาณ</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-1.5 bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.duration_hours}
                      onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                      placeholder="0"
                      className="w-full bg-transparent text-xs text-[#ECE4D3] focus:outline-none"
                    />
                    <span className="text-xs text-[#7A7162]">ชั่วโมง</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-1.5">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="5"
                      value={formData.duration_minutes}
                      onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                      placeholder="0"
                      className="w-full bg-transparent text-xs text-[#ECE4D3] focus:outline-none"
                    />
                    <span className="text-xs text-[#7A7162]">นาที</span>
                  </div>
                </div>
              </div>

              {/* Portfolio Image Upload (Primary File Input + Dropzone + Optional URL fallback) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#ECE4D3] block">
                  รูปภาพผลงานสัก (Portfolio Artwork) <span className="text-red-400">*</span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageFileSelect}
                  disabled={isUploadingImage || submitting}
                  className="hidden"
                />

                {isUploadingImage ? (
                  <div className="border border-dashed border-[#3E372C] bg-[#0E0D0C] p-6 rounded-[6px] flex flex-col items-center justify-center space-y-2 text-center animate-pulse">
                    <Loader2 size={24} className="animate-spin text-[#9C2F2F]" />
                    <span className="text-xs text-[#ECE4D3] font-medium">กำลังอัปโหลดรูปภาพไปยัง Storage...</span>
                    <span className="text-[10px] text-[#7A7162]">ระบบกำลังบีบอัดและส่งขึ้น studio-assets/portfolio</span>
                  </div>
                ) : formData.image_url ? (
                  <div className="bg-[#0E0D0C] border border-[#3E372C] p-3 rounded-[6px] space-y-2">
                    <div className="relative aspect-[4/3] max-h-48 rounded overflow-hidden border border-[#2D2820] bg-[#0E0D0C]">
                      <img
                        src={formData.image_url}
                        alt="Artwork Preview"
                        className="w-full h-full object-cover"
                        onError={(e: any) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <CheckCircle2 size={12} /> พร้อมใช้งาน
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isUploadingImage || submitting}
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 bg-[#171512] hover:bg-[#25201A] border border-[#3E372C] text-[11px] text-[#ECE4D3] rounded transition-colors flex items-center gap-1"
                        >
                          <Camera size={12} className="text-[#9C2F2F]" />
                          <span>เปลี่ยนรูป</span>
                        </button>
                        <button
                          type="button"
                          disabled={isUploadingImage || submitting}
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, image_url: '' }));
                            setImageUploadError(null);
                          }}
                          className="px-2.5 py-1 bg-[#171512] hover:bg-red-950/40 border border-[#3E372C] hover:border-red-900/60 text-[11px] text-red-400 rounded transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={12} />
                          <span>ลบรูป</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      if (!isUploadingImage && !submitting) {
                        fileInputRef.current?.click();
                      }
                    }}
                    className="border border-dashed border-[#3E372C] hover:border-[#9C2F2F]/60 bg-[#0E0D0C] hover:bg-[#141210] p-6 rounded-[6px] text-center cursor-pointer transition-colors flex flex-col items-center justify-center space-y-2 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#171512] border border-[#3E372C] group-hover:border-[#9C2F2F]/60 flex items-center justify-center text-[#7A7162] group-hover:text-[#ECE4D3] transition-colors">
                      <Upload size={18} />
                    </div>
                    <div>
                      <span className="text-xs text-[#ECE4D3] font-medium block">
                        + คลิกเพื่อเลือกรูปภาพจากเครื่อง
                      </span>
                      <span className="text-[10px] text-[#7A7162] block mt-0.5">
                        รองรับ JPG, PNG, WEBP สูงสุด 5 MB (บีบอัดอัตโนมัติ)
                      </span>
                    </div>
                  </div>
                )}

                {imageUploadError && (
                  <p className="text-xs text-red-400 flex items-center gap-1 mt-1">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{imageUploadError}</span>
                  </p>
                )}

                {/* Optional Fallback URL input */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowManualUrlInput(!showManualUrlInput)}
                    className="text-[10px] text-[#7A7162] hover:text-[#ECE4D3] hover:underline transition-colors"
                  >
                    {showManualUrlInput ? '▼ ซ่อนการกรอก URL รูปภายนอก' : '▶ หรือใช้ URL รูปภาพภายนอก (HTTPS)'}
                  </button>

                  {showManualUrlInput && (
                    <input
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, image_url: e.target.value }));
                        setImageUploadError(null);
                      }}
                      placeholder="https://images.unsplash.com/..."
                      className="mt-1.5 w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F] font-mono"
                    />
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#ECE4D3] block">รายละเอียดผลงาน</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="อธิบายเทคนิค ลวดลาย หรือแนวคิดของผลงานสักนี้..."
                  className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F] resize-none"
                />
              </div>

              {/* Sort Order & Visibility */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#2D2820]">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#ECE4D3] block">ลำดับการแสดงผล (Sort Order)</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                  />
                  <span className="text-[10px] text-[#7A7162]">ค่าน้อยกว่าจะแสดงผลก่อน</span>
                </div>

                <div className="space-y-1 flex flex-col justify-end">
                  <label className="inline-flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={formData.is_visible}
                      onChange={(e) => setFormData({ ...formData, is_visible: e.target.checked })}
                      className="w-4 h-4 rounded bg-[#0E0D0C] border-[#3E372C] text-[#9C2F2F] focus:ring-0 focus:outline-none cursor-pointer"
                    />
                    <span className="text-xs text-[#ECE4D3] font-medium">แสดงผลงานบนเว็บไซต์</span>
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-[#2D2820] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting || isUploadingImage}
                  className="px-4 py-2 bg-[#25201A] hover:bg-[#2D2820] text-[#ECE4D3] rounded text-xs transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting || isUploadingImage || !formData.image_url}
                  className="px-5 py-2 bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isUploadingImage ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>กำลังอัปโหลดรูป...</span>
                    </>
                  ) : submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : editingArtwork ? (
                    'บันทึกการแก้ไข'
                  ) : (
                    'สร้างผลงาน'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-[#171512] border border-[#2D2820] rounded-[8px] p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-red-400">
              <AlertCircle size={24} className="shrink-0" />
              <h3 className="text-base font-bold text-[#ECE4D3]">ยืนยันการลบผลงาน</h3>
            </div>

            <p className="text-xs text-[#A89F91] leading-relaxed">
              คุณต้องการลบผลงาน <strong className="text-[#ECE4D3]">&quot;{deleteTarget.title}&quot;</strong> ออกจากระบบใช่หรือไม่?
              การลบผลงานนี้จะไม่กระทบข้อมูลช่างหรือประวัติการจองคิว
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 bg-[#25201A] hover:bg-[#2D2820] text-[#ECE4D3] rounded text-xs transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-800 hover:bg-red-700 text-[#ECE4D3] rounded text-xs font-bold transition-colors disabled:opacity-50"
              >
                {deleting ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
