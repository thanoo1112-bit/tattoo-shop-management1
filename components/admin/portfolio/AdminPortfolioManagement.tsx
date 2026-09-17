'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  Image as ImageIcon,
  Upload,
  Camera,
  Loader2,
  Link as LinkIcon,
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
  specialties?: string[] | null;
}

const getArtistSpecialties = (artist?: ActiveArtist | null): string[] => {
  if (!artist || !Array.isArray(artist.specialties)) return [];
  return artist.specialties.map((s: string) => s.trim()).filter(Boolean);
};

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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const [editingArtwork, setEditingArtwork] = useState<AdminPortfolioArtwork | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
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
    style: '',
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

  // Selected Artist for Modal Form & Specialties
  const selectedArtistForForm = useMemo(() => {
    if (!formData.artist_id) return null;
    return artists.find((a) => a.id === formData.artist_id) || null;
  }, [formData.artist_id, artists]);

  const selectedArtistSpecialties = useMemo(() => {
    return getArtistSpecialties(selectedArtistForForm);
  }, [selectedArtistForForm]);

  // Handle Artist Change in Modal Form
  const handleArtistChange = (newArtistId: string) => {
    const newArtist = artists.find((a) => a.id === newArtistId);
    const newSpecs = getArtistSpecialties(newArtist);

    let updatedStyle = formData.style;
    if (!formData.style || !newSpecs.includes(formData.style)) {
      updatedStyle = '';
    }

    setFormData((prev) => ({
      ...prev,
      artist_id: newArtistId,
      style: updatedStyle,
    }));
  };

  // Dynamic filter style options across artists & artworks
  const availableFilterStyles = useMemo(() => {
    const set = new Set<string>();
    artists.forEach((artist) => {
      getArtistSpecialties(artist).forEach((s) => set.add(s));
    });
    artworks.forEach((art) => {
      if (art.style) set.add(art.style.trim());
    });
    return Array.from(set).sort();
  }, [artists, artworks]);

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
        style: item.style || '',
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
        .select('id, name, nickname, avatar_url, is_active, specialties')
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
    const defaultArtist = artists.find((a) => a.id === defaultArtistId);
    const defaultSpecs = getArtistSpecialties(defaultArtist);

    setEditingArtwork(null);
    setFormData({
      artist_id: defaultArtistId,
      title: '',
      description: '',
      style: defaultSpecs.length > 0 ? defaultSpecs[0] : '',
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

    const currentArtist = artists.find((a) => a.id === artwork.artist_id);
    const currentSpecs = getArtistSpecialties(currentArtist);
    const initialStyle = artwork.style && currentSpecs.includes(artwork.style) ? artwork.style : '';

    setFormData({
      artist_id: artwork.artist_id,
      title: artwork.title,
      description: artwork.description || '',
      style: initialStyle,
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

    // Calculate total duration in minutes with Data Preservation for existing artworks
    let calculatedDurationMinutes: number | null = null;

    if (editingArtwork) {
      const origTotal = editingArtwork.estimated_duration_minutes ?? null;
      const origHours = origTotal && origTotal > 0 ? Math.floor(origTotal / 60) : null;
      const origHoursStr = origHours !== null ? origHours.toString() : '';

      // Check if user modified the duration_hours input field
      if (formData.duration_hours === origHoursStr) {
        // User did NOT edit duration field -> preserve exact original estimated_duration_minutes (e.g. 90 mins)
        calculatedDurationMinutes = origTotal;
      } else {
        // User explicitly modified duration_hours field -> calculate new total minutes from hours
        const h = parseInt(formData.duration_hours, 10);
        if (!isNaN(h) && h > 0) {
          calculatedDurationMinutes = h * 60;
        } else {
          calculatedDurationMinutes = null;
        }
      }
    } else {
      // New Artwork -> calculate total minutes from duration_hours * 60
      const h = parseInt(formData.duration_hours, 10);
      if (!isNaN(h) && h > 0) {
        calculatedDurationMinutes = h * 60;
      }
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
            <span>เพิ่มผลงานสักใหม่</span>
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
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
            <div key={idx} className="bg-[#171512] border border-[#2D2820] rounded-[6px] overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-[#25201A]" />
              <div className="p-3 sm:p-4 space-y-2">
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
            <span>เพิ่มผลงานแรก</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
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
                  <div className="p-2.5 sm:p-4 space-y-1.5 sm:space-y-2.5 min-w-0">
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-[#ECE4D3] truncate" title={item.title}>
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-1 text-[11px] sm:text-xs text-[#A89F91] mt-0.5 min-w-0">
                        <User size={12} className="text-[#C5A880] shrink-0" />
                        <span className="truncate">{artistName}</span>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-[10px] sm:text-[11px] text-[#A89F91] line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 border-t border-[#2D2820] pt-2 sm:pt-2.5 text-[10px] sm:text-[11px] text-[#A89F91]">
                      <div className="flex items-center gap-1 min-w-0">
                        <Maximize2 size={11} className="text-[#7A7162] shrink-0" />
                        <span className="truncate">{item.size_label || 'ไม่ระบุขนาด'}</span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <Clock size={11} className="text-[#7A7162] shrink-0" />
                        <span className="truncate">
                          {item.estimated_duration_minutes
                            ? `${durationHours ? `${durationHours}ชม.` : ''} ${durationMins ? `${durationMins}น.` : ''}`
                            : 'ไม่ระบุเวลา'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-2 sm:p-3 bg-[#13110F] border-t border-[#2D2820] flex items-center justify-between gap-1 sm:gap-1.5 min-w-0">
                  <div className="flex items-center gap-1 shrink-0">
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
                  </div>

                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    <button
                      onClick={() => handleOpenEditModal(item)}
                      className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-[#25201A] hover:bg-[#2D2820] text-[#ECE4D3] rounded text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors"
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
      {isModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-lg md:max-w-[900px] bg-[#171512] border border-[#2D2820] rounded-[8px] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#2D2820] flex items-center justify-between shrink-0 bg-[#171512]">
              <h2 className="text-base font-bold text-[#ECE4D3] flex items-center gap-2">
                <Sparkles size={16} className="text-[#9C2F2F]" />
                <span>{editingArtwork ? 'แก้ไขผลงานสัก' : 'เพิ่มผลงานสักใหม่'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[#7A7162] hover:text-[#ECE4D3] transition-colors p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleSubmitForm} className="p-4 md:p-6 overflow-y-auto space-y-4 flex-1">
              {formError && (
                <div className="bg-[#2D1B1B] border border-red-700/50 p-3 rounded text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageFileSelect}
                disabled={isUploadingImage || submitting}
                className="hidden"
              />

              {/* ========================================================================= */}
              {/* MOBILE LAYOUT (< md): CONCEPT 2 ASSET STRIP                              */}
              {/* ========================================================================= */}
              <div className="block md:hidden space-y-4">
                {/* Asset Strip Card */}
                <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-[#9C2F2F]" />
                      <span>รูปผลงานหลัก</span>
                      <span className="text-red-400">*</span>
                    </span>
                    {formData.image_url && (
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded">
                        <CheckCircle2 size={11} /> พร้อมใช้งาน
                      </span>
                    )}
                  </div>

                  <div className="flex flex-row items-center gap-3">
                    {/* Left: Preview Square Frame (120-140px, object-contain) */}
                    <div className="w-[120px] h-[120px] sm:w-[140px] sm:h-[140px] shrink-0 bg-[#0E0D0C] border border-[#2D2820] rounded-lg p-1.5 flex items-center justify-center relative overflow-hidden">
                      {isUploadingImage ? (
                        <div className="flex flex-col items-center justify-center space-y-1 text-center">
                          <Loader2 size={24} className="animate-spin text-[#9C2F2F]" />
                          <span className="text-[10px] text-[#ECE4D3]">กำลังอัปโหลด...</span>
                        </div>
                      ) : formData.image_url ? (
                        <img
                          src={formData.image_url}
                          alt="Artwork Preview"
                          className="max-w-full max-h-full w-auto h-auto object-contain rounded block"
                          onError={(e: any) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-[#7A7162] hover:text-[#ECE4D3] transition-colors group"
                        >
                          <Upload size={22} className="group-hover:text-[#9C2F2F] transition-colors mb-1" />
                          <span className="text-[11px] font-medium leading-tight text-[#ECE4D3]">เลือกรูปผลงาน</span>
                          <span className="text-[9px] text-[#7A7162] mt-0.5">JPG, PNG, WEBP</span>
                        </button>
                      )}
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex flex-col flex-1 justify-center space-y-2 min-w-0">
                      <button
                        type="button"
                        disabled={isUploadingImage || submitting}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-9 bg-[#25201A] hover:bg-[#322A22] border border-[#2D2820] text-xs text-[#ECE4D3] rounded font-medium flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] disabled:opacity-50"
                      >
                        <Camera size={14} className="text-[#9C2F2F] shrink-0" />
                        <span>{formData.image_url ? 'เลือกรูปใหม่' : 'เลือกรูปภาพ'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isUploadingImage || submitting}
                        onClick={() => setShowManualUrlInput(!showManualUrlInput)}
                        className="w-full h-9 bg-[#0E0D0C] hover:bg-[#1a1714] border border-[#2D2820] text-xs text-[#ECE4D3] rounded font-medium flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] disabled:opacity-50"
                      >
                        <LinkIcon size={13} className="text-[#7A7162] shrink-0" />
                        <span>{showManualUrlInput ? 'ซ่อนช่อง URL' : 'วาง URL รูปภาพ'}</span>
                      </button>

                      {formData.image_url && (
                        <button
                          type="button"
                          disabled={isUploadingImage || submitting}
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, image_url: '' }));
                            setImageUploadError(null);
                          }}
                          className="w-full h-8 bg-[#0E0D0C] hover:bg-red-950/40 border border-[#2D2820] hover:border-red-900/60 text-xs text-red-400 rounded font-medium flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] disabled:opacity-50"
                        >
                          <Trash2 size={13} className="shrink-0" />
                          <span>ลบรูป</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Fallback URL Input */}
                  {showManualUrlInput && (
                    <div className="bg-[#0E0D0C] border border-[#2D2820] rounded-lg p-2.5 space-y-1 animate-fadeIn">
                      <label className="text-xs font-semibold text-[#ECE4D3] block flex items-center gap-1.5">
                        <LinkIcon size={12} className="text-[#9C2F2F]" />
                        <span>URL รูปภาพตรง (Direct Image URL)</span>
                      </label>
                      <input
                        type="url"
                        value={formData.image_url}
                        onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                        placeholder="https://example.com/artwork.jpg"
                        className="w-full bg-[#171512] border border-[#3E372C] rounded px-3 py-1.5 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>
                  )}

                  {imageUploadError && (
                    <p className="text-xs text-red-400 flex items-center gap-1 pt-1">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>{imageUploadError}</span>
                    </p>
                  )}
                </div>

                {/* Section: ข้อมูลผลงาน */}
                <div className="space-y-3">
                  <div className="border-b border-[#2D2820] pb-1">
                    <h3 className="text-xs font-bold text-[#ECE4D3] uppercase tracking-wider flex items-center gap-1.5">
                      <User size={13} className="text-[#9C2F2F]" />
                      <span>ข้อมูลผลงาน</span>
                    </h3>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      ช่างสักประจำผลงาน <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.artist_id}
                      onChange={(e) => handleArtistChange(e.target.value)}
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

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      สไตล์ผลงาน <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.style}
                      onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                      required
                      disabled={!formData.artist_id || selectedArtistSpecialties.length === 0}
                      className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {!formData.artist_id ? (
                        <option value="">กรุณาเลือกช่างก่อน</option>
                      ) : selectedArtistSpecialties.length === 0 ? (
                        <option value="">ช่างคนนี้ยังไม่ได้ตั้งค่าสไตล์ความถนัด</option>
                      ) : (
                        <>
                          <option value="">-- เลือกสไตล์ผลงาน --</option>
                          {selectedArtistSpecialties.map((style) => (
                            <option key={style} value={style}>
                              {style}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Section: ขนาดและเวลา */}
                <div className="space-y-3">
                  <div className="border-b border-[#2D2820] pb-1">
                    <h3 className="text-xs font-bold text-[#ECE4D3] uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={13} className="text-[#9C2F2F]" />
                      <span>ขนาดและเวลา</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">ขนาดชิ้นงาน</label>
                      <input
                        type="text"
                        value={formData.size_label}
                        onChange={(e) => setFormData({ ...formData, size_label: e.target.value })}
                        placeholder="เช่น 15x10 ซม."
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-2.5 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">เวลาสัก</label>
                      <div className="flex items-center gap-1.5 bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-2.5 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.duration_hours}
                          onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                          placeholder="0"
                          className="w-full bg-transparent text-xs text-[#ECE4D3] focus:outline-none"
                        />
                        <span className="text-xs text-[#7A7162] shrink-0">ชั่วโมง</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: รายละเอียด */}
                <div className="space-y-3">
                  <div className="border-b border-[#2D2820] pb-1">
                    <h3 className="text-xs font-bold text-[#ECE4D3] uppercase tracking-wider block">
                      รายละเอียดผลงาน
                    </h3>
                  </div>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="อธิบายเทคนิค ลวดลาย หรือแนวคิดของผลงานสักนี้..."
                    className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F] resize-none"
                  />
                </div>

                {/* Section: การแสดงผล */}
                <div className="space-y-3">
                  <div className="border-b border-[#2D2820] pb-1">
                    <h3 className="text-xs font-bold text-[#ECE4D3] uppercase tracking-wider block">
                      การแสดงผล
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">ลำดับการแสดงผล (Sort Order)</label>
                      <input
                        type="number"
                        value={formData.sort_order}
                        onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value, 10) || 0 })}
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>

                    <div className="pb-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
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
                </div>
              </div>

              {/* ========================================================================= */}
              {/* DESKTOP LAYOUT (>= md): CONCEPT 1 IMAGE LEFT + FORM RIGHT                 */}
              {/* ========================================================================= */}
              <div className="hidden md:grid md:grid-cols-12 md:gap-6 md:items-start">
                {/* LEFT COLUMN: Tight Portrait Image Stage (col-span-6) */}
                <div className="col-span-6 space-y-3 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#ECE4D3]">
                      รูปผลงานหลัก <span className="text-red-400">*</span>
                    </label>
                    {formData.image_url && (
                      <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded">
                        <CheckCircle2 size={11} /> พร้อมใช้งาน
                      </span>
                    )}
                  </div>

                  {/* Tight Portrait Frame */}
                  <div className="w-full min-h-[380px] max-h-[460px] bg-[#0E0D0C] border border-[#2D2820] rounded-lg p-2 flex items-center justify-center relative overflow-hidden">
                    {isUploadingImage ? (
                      <div className="flex flex-col items-center justify-center space-y-2 text-center animate-pulse p-6">
                        <Loader2 size={28} className="animate-spin text-[#9C2F2F]" />
                        <span className="text-xs text-[#ECE4D3] font-medium">กำลังอัปโหลดรูปภาพไปยัง Storage...</span>
                      </div>
                    ) : formData.image_url ? (
                      <div className="inline-flex w-fit max-w-full mx-auto p-1 bg-[#0E0D0C] rounded">
                        <img
                          src={formData.image_url}
                          alt="Artwork Preview"
                          className="max-w-full max-h-[440px] w-auto h-auto object-contain rounded block"
                          onError={(e: any) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          if (!isUploadingImage && !submitting) {
                            fileInputRef.current?.click();
                          }
                        }}
                        className="w-full h-full min-h-[360px] border border-dashed border-[#2D2820] hover:border-[#9C2F2F]/60 bg-[#0E0D0C] hover:bg-[#141210] rounded-lg text-center cursor-pointer transition-colors flex flex-col items-center justify-center p-6 space-y-2 group"
                      >
                        <div className="w-12 h-12 rounded-full bg-[#171512] border border-[#2D2820] group-hover:border-[#9C2F2F]/60 flex items-center justify-center text-[#7A7162] group-hover:text-[#ECE4D3] transition-colors">
                          <Upload size={20} />
                        </div>
                        <div>
                          <span className="text-xs text-[#ECE4D3] font-medium block">
                            + คลิกเพื่อเลือกรูปภาพผลงานหลัก
                          </span>
                          <span className="text-[10px] text-[#7A7162] block mt-0.5">
                            รองรับ JPG, PNG, WEBP สูงสุด 5 MB
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Buttons below Image Stage */}
                  <div className="flex items-center justify-center gap-2 w-full pt-1">
                    <button
                      type="button"
                      disabled={isUploadingImage || submitting}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-[#25201A] hover:bg-[#322A22] border border-[#2D2820] text-xs text-[#ECE4D3] rounded transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <Camera size={13} className="text-[#9C2F2F]" />
                      <span>{formData.image_url ? 'เปลี่ยนรูปภาพ' : 'เลือกรูปภาพ'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUploadingImage || submitting}
                      onClick={() => setShowManualUrlInput(!showManualUrlInput)}
                      className="px-3 py-1.5 bg-[#25201A] hover:bg-[#322A22] border border-[#2D2820] text-xs text-[#A89F91] hover:text-[#ECE4D3] rounded transition-colors font-medium flex items-center gap-1"
                    >
                      <LinkIcon size={12} />
                      <span>วาง URL รูปภาพ</span>
                    </button>

                    {formData.image_url && (
                      <button
                        type="button"
                        disabled={isUploadingImage || submitting}
                        onClick={() => {
                          setFormData((prev) => ({ ...prev, image_url: '' }));
                          setImageUploadError(null);
                        }}
                        className="px-3 py-1.5 bg-[#0E0D0C] hover:bg-red-950/40 border border-[#2D2820] hover:border-red-900/60 text-xs text-red-400 rounded transition-colors flex items-center gap-1.5 font-medium"
                      >
                        <Trash2 size={13} />
                        <span>ลบรูป</span>
                      </button>
                    )}
                  </div>

                  {/* Fallback Manual URL Input on Desktop */}
                  {showManualUrlInput && (
                    <div className="w-full bg-[#0E0D0C] border border-[#2D2820] rounded-lg p-3 space-y-1 animate-fadeIn">
                      <label className="text-[10px] text-[#A89F91] block">วาง URL รูปภาพภายนอก (HTTPS):</label>
                      <input
                        type="url"
                        value={formData.image_url}
                        onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full bg-[#171512] border border-[#3E372C] rounded px-3 py-1.5 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F] font-mono"
                      />
                    </div>
                  )}

                  {imageUploadError && (
                    <p className="text-xs text-red-400 flex items-center gap-1 mt-1 justify-center">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>{imageUploadError}</span>
                    </p>
                  )}
                </div>

                {/* RIGHT COLUMN: Form Rail (col-span-6) */}
                <div className="col-span-6 space-y-3.5">
                  {/* ช่างสักประจำผลงาน */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      ช่างสักประจำผลงาน <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.artist_id}
                      onChange={(e) => handleArtistChange(e.target.value)}
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

                  {/* ชื่อผลงาน */}
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

                  {/* สไตล์ผลงาน */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      สไตล์ผลงาน <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={formData.style}
                      onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                      required
                      disabled={!formData.artist_id || selectedArtistSpecialties.length === 0}
                      className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#9C2F2F] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {!formData.artist_id ? (
                        <option value="">กรุณาเลือกช่างก่อน</option>
                      ) : selectedArtistSpecialties.length === 0 ? (
                        <option value="">ช่างคนนี้ยังไม่ได้ตั้งค่าสไตล์ความถนัด</option>
                      ) : (
                        <>
                          <option value="">-- เลือกสไตล์ผลงาน --</option>
                          {selectedArtistSpecialties.map((style) => (
                            <option key={style} value={style}>
                              {style}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>

                  {/* ขนาดชิ้นงาน + เวลาสัก */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">ขนาดชิ้นงาน</label>
                      <input
                        type="text"
                        value={formData.size_label}
                        onChange={(e) => setFormData({ ...formData, size_label: e.target.value })}
                        placeholder="เช่น 15x10 ซม."
                        className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-2.5 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#9C2F2F]"
                      />
                    </div>

                    <div className="space-y-1 min-w-0">
                      <label className="text-xs font-semibold text-[#ECE4D3] block">เวลาสัก</label>
                      <div className="flex items-center gap-1.5 bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-2.5 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={formData.duration_hours}
                          onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                          placeholder="0"
                          className="w-full bg-transparent text-xs text-[#ECE4D3] focus:outline-none"
                        />
                        <span className="text-xs text-[#7A7162] shrink-0">ชั่วโมง</span>
                      </div>
                    </div>
                  </div>

                  {/* รายละเอียดผลงาน */}
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

                  {/* ลำดับการแสดงผล + แสดงผลงานบนเว็บไซต์ */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
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
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-[#2D2820] flex items-center justify-end gap-2.5">
                <button
                  type="submit"
                  disabled={submitting || isUploadingImage || !formData.image_url}
                  className="px-5 py-2.5 bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[38px]"
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
        </div>,
        document.body
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && isMounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-fadeIn">
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
        </div>,
        document.body
      )}
    </div>
  );
}
