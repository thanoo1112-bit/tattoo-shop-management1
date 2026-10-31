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
  Edit3,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
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
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStyle, setFilterStyle] = useState('ALL');

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
  const [reopeningId, setReopeningId] = useState<string | null>(null);

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

  // Toggle Quick Status (AVAILABLE -> SOLD / SOLD -> AVAILABLE)
  const handleQuickStatusToggle = async (design: ArtistFlashDesign, newStatus: 'AVAILABLE' | 'RESERVED' | 'SOLD') => {
    if (!staffArtistId) return;

    if (newStatus === 'AVAILABLE') {
      try {
        setReopeningId(design.id);

        // Safety Guard 1: Check active flash_reservations for this flash design
        const { data: activeReservations, error: resErr } = await supabase
          .from('flash_reservations')
          .select('id, status')
          .eq('flash_design_id', design.id)
          .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")');

        if (resErr) {
          console.error('[ArtistFlash] Error checking active reservations:', resErr);
        }

        if (activeReservations && activeReservations.length > 0) {
          setActionNotice({
            text: 'ไม่สามารถเปิดจองได้เนื่องจากมีรายการจองที่ยังดำเนินการอยู่',
            type: 'error',
          });
          setReopeningId(null);
          return;
        }

        // Safety Guard 2: Check active bookings linked to any reservation of this flash design
        const { data: allReservations } = await supabase
          .from('flash_reservations')
          .select('id')
          .eq('flash_design_id', design.id);

        if (allReservations && allReservations.length > 0) {
          const resIds = allReservations.map((r: any) => r.id);
          const { data: activeBookings, error: bErr } = await supabase
            .from('bookings')
            .select('id, status')
            .in('flash_reservation_id', resIds)
            .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")');

          if (bErr) {
            console.error('[ArtistFlash] Error checking active bookings:', bErr);
          }

          if (activeBookings && activeBookings.length > 0) {
            setActionNotice({
              text: 'ไม่สามารถเปิดจองได้เนื่องจากมีรายการจองที่ยังดำเนินการอยู่',
              type: 'error',
            });
            setReopeningId(null);
            return;
          }
        }
      } catch (checkErr: any) {
        console.error('[ArtistFlash] Safety check error:', checkErr);
      }
    }

    try {
      setReopeningId(design.id);
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
        text: newStatus === 'AVAILABLE'
          ? `เปิดจองลาย Flash "${design.title}" อีกครั้งเรียบร้อยแล้ว`
          : `อัปเดตสถานะ "${design.title}" เป็น [${statusLabels[newStatus]}] แล้ว`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('[ArtistFlash] Quick status error:', err);
      setActionNotice({ text: 'ไม่สามารถเปลี่ยนสถานะได้: ' + err?.message, type: 'error' });
    } finally {
      setReopeningId(null);
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

    // 1. Ownership security
    if (deleteTarget.artist_id !== staffArtistId) {
      setActionNotice({ text: 'คุณไม่มีสิทธิ์ลบลาย Flash ของผู้อื่น', type: 'error' });
      setDeleteTarget(null);
      return;
    }

    // 2. Status guard
    const status = deleteTarget.status?.toUpperCase();
    if (status === 'HELD') {
      setActionNotice({ text: 'ไม่สามารถลบได้ เนื่องจากลายนี้กำลังถูกพักสิทธิ์', type: 'error' });
      setDeleteTarget(null);
      return;
    }
    if (status === 'RESERVED') {
      setActionNotice({ text: 'ไม่สามารถลบได้ เนื่องจากลายนี้มีการจองอยู่', type: 'error' });
      setDeleteTarget(null);
      return;
    }
    if (status === 'SOLD') {
      setActionNotice({ text: 'ไม่สามารถลบลายที่ขายแล้วได้ เนื่องจากต้องเก็บประวัติการขาย', type: 'error' });
      setDeleteTarget(null);
      return;
    }
    if (status !== 'AVAILABLE') {
      setActionNotice({ text: `ไม่สามารถลบลาย Flash ในสถานะ ${status} ได้`, type: 'error' });
      setDeleteTarget(null);
      return;
    }

    setIsDeletingFlash(true);

    try {
      const targetId = deleteTarget.id;
      const targetTitle = deleteTarget.title;
      const targetImageUrl1 = deleteTarget.image_url;
      const targetImageUrl2 = deleteTarget.image_url_2;

      // 3. Reservation/history guard
      const { count: reservationCount, error: resCheckError } = await supabase
        .from('flash_reservations')
        .select('*', { count: 'exact', head: true })
        .eq('flash_design_id', targetId);

      if (!resCheckError && reservationCount && reservationCount > 0) {
        setActionNotice({ text: 'ไม่สามารถลบลาย Flash ที่มีประวัติการจองในระบบได้', type: 'error' });
        setDeleteTarget(null);
        return;
      }

      // 4. Shared File Protection for image_url and image_url_2
      let canDeleteImage1 = Boolean(targetImageUrl1);
      if (targetImageUrl1) {
        const { count: countImg1 } = await supabase
          .from('flash_designs')
          .select('id', { count: 'exact', head: true })
          .eq('image_url', targetImageUrl1)
          .neq('id', targetId);

        const { count: countImg1In2 } = await supabase
          .from('flash_designs')
          .select('id', { count: 'exact', head: true })
          .eq('image_url_2', targetImageUrl1)
          .neq('id', targetId);

        const { count: portfolioCount1 } = await supabase
          .from('portfolio_artworks')
          .select('id', { count: 'exact', head: true })
          .eq('image_url', targetImageUrl1);

        if (
          (countImg1 && countImg1 > 0) ||
          (countImg1In2 && countImg1In2 > 0) ||
          (portfolioCount1 && portfolioCount1 > 0)
        ) {
          canDeleteImage1 = false;
          console.info('[ArtistFlash] image_url is shared with other record(s). Skipping file cleanup.');
        }
      }

      let canDeleteImage2 = Boolean(targetImageUrl2);
      if (targetImageUrl2) {
        const { count: countImg2 } = await supabase
          .from('flash_designs')
          .select('id', { count: 'exact', head: true })
          .eq('image_url_2', targetImageUrl2)
          .neq('id', targetId);

        const { count: countImg2In1 } = await supabase
          .from('flash_designs')
          .select('id', { count: 'exact', head: true })
          .eq('image_url', targetImageUrl2)
          .neq('id', targetId);

        const { count: portfolioCount2 } = await supabase
          .from('portfolio_artworks')
          .select('id', { count: 'exact', head: true })
          .eq('image_url', targetImageUrl2);

        if (
          (countImg2 && countImg2 > 0) ||
          (countImg2In1 && countImg2In1 > 0) ||
          (portfolioCount2 && portfolioCount2 > 0)
        ) {
          canDeleteImage2 = false;
          console.info('[ArtistFlash] image_url_2 is shared with other record(s). Skipping file cleanup.');
        }
      }

      // 5. Database Delete MUST happen FIRST
      const { error: delErr } = await supabase
        .from('flash_designs')
        .delete()
        .eq('id', targetId)
        .eq('artist_id', staffArtistId);

      if (delErr) throw delErr;

      // 6. Storage Cleanup AFTER DB delete succeeds
      const urlsToClean: string[] = [];
      if (canDeleteImage1 && targetImageUrl1) urlsToClean.push(targetImageUrl1);
      if (canDeleteImage2 && targetImageUrl2) urlsToClean.push(targetImageUrl2);

      let storageWarning = false;
      if (urlsToClean.length > 0) {
        const { error: storageErr } = await deleteStudioAssets(urlsToClean, supabase);
        if (storageErr) {
          console.warn('[ArtistFlash] Storage cleanup failed after DB delete:', storageErr);
          storageWarning = true;
        }
      }

      // 7. Feedback / UI
      const hasSharedImages = (targetImageUrl1 && !canDeleteImage1) || (targetImageUrl2 && !canDeleteImage2);

      if (storageWarning) {
        setActionNotice({
          text: `ลบข้อมูลลาย Flash "${targetTitle}" เรียบร้อยแล้ว แต่ไม่สามารถลบไฟล์รูปภาพบางส่วนจาก Storage ได้`,
          type: 'warning',
        });
      } else if (hasSharedImages) {
        setActionNotice({
          text: `ลบลาย Flash "${targetTitle}" เรียบร้อยแล้ว (เก็บไฟล์รูปภาพไว้เนื่องจากมีรายการอื่นใช้อยู่)`,
          type: 'success',
        });
      } else {
        setActionNotice({
          text: `ลบลาย Flash "${targetTitle}" และไฟล์รูปภาพเรียบร้อยแล้ว`,
          type: 'success',
        });
      }

      setDeleteTarget(null);
      setDesigns((prev) => prev.filter((d) => d.id !== targetId));
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
  }, [designs, filterStyle, searchQuery]);

  return (
    <div className="space-y-6 font-prompt">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-studio-card border border-studio-border p-5 rounded-xl shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-studio-red-bright uppercase tracking-wider font-semibold">
              ARTIST FLASH DESIGNS
            </span>
            <span className="text-studio-muted text-xs">•</span>
            <span className="text-xs text-[#ECE4D3] font-mono">
              ช่างประจำลาย Flash: {staffArtistRecord?.name || 'ช่างสัก'} {staffArtistRecord?.nickname ? `(${staffArtistRecord.nickname})` : ''}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-heading font-semibold text-studio-primary flex items-center gap-2">
            <Sparkles className="text-studio-red-bright" size={24} />
            <span>จัดการลาย Flash ของฉัน</span>
          </h1>
          <p className="text-xs text-[#ECE4D3] max-w-2xl">
            คุณสามารถเพิ่ม แก้ไข ปิดการขาย (SOLD) หรือปรับเปลี่ยนลายสัก Flash ของตนเองเพื่อเปิดจองบนหน้าเว็บไซต์
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchDesigns()}
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
              : actionNotice.type === 'warning'
              ? 'bg-amber-950/80 border-amber-800/80 text-amber-300'
              : 'bg-red-950/80 border-red-800/80 text-red-300'
          }`}
        >
          {actionNotice.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          ) : actionNotice.type === 'warning' ? (
            <AlertCircle size={18} className="text-amber-400 shrink-0" />
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
          <div className="md:col-span-8 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ECE4D3]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อลาย Flash คำอธิบาย หรือสไตล์..."
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
        </div>

        <div className="flex items-center justify-between text-xs text-[#ECE4D3] pt-2 border-t border-studio-border/60">
          <div>
            แสดง <strong className="text-studio-primary font-bold">{filteredDesigns.length}</strong> จากทั้งหมด {designs.length} รายการ
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

      {/* Grid List */}
      {loading ? (
        <div className="py-20 text-center text-studio-secondary bg-studio-card border border-studio-border rounded-xl animate-pulse space-y-3">
          <Loader2 size={24} className="animate-spin text-studio-red-bright mx-auto" />
          <p className="text-xs">กำลังโหลดลาย Flash...</p>
        </div>
      ) : filteredDesigns.length === 0 ? (
        <div className="py-16 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
            <Sparkles size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-studio-primary">ไม่พบรายการลาย Flash</p>
            <p className="text-xs text-[#ECE4D3]">
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4">
          {filteredDesigns.map((design) => {
            const artistName = staffArtistRecord?.name || 'ช่างประจำร้าน';

            return (
              <div
                key={design.id}
                className={`bg-[#171512] border rounded-[6px] overflow-hidden flex flex-col justify-between transition-all duration-300 group shadow-md hover:shadow-lg hover:shadow-[#C12D2D]/5 min-w-0 ${
                  design.is_visible
                    ? 'border-[#2D2820] hover:border-[#C12D2D]/60'
                    : 'border-[#2D2820]/40 opacity-70 bg-[#13110F]'
                }`}
              >
                {/* Image Area */}
                <div className="aspect-[4/5] bg-studio-main overflow-hidden relative group">
                  <img
                    src={getThumbnailUrl(design.image_url)}
                    onError={(e) => handleThumbnailError(e, design.image_url)}
                    alt={design.title}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                    decoding="async"
                  />

                  {/* Top-left Badge: Sort order only */}
                  <div className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2">
                    <span className="bg-[#0E0D0C]/90 backdrop-blur-sm border border-[#3E372C] text-[#C12D2D] text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded shadow">
                      #{design.sort_order}
                    </span>
                  </div>

                  {/* Top-right Badges: Status & Flash Type */}
                  <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 flex flex-col items-end gap-1">
                    {/* 1. Status Badge */}
                    {design.status === 'AVAILABLE' && (
                      <span className="bg-emerald-950/90 backdrop-blur-sm border border-emerald-600/50 text-emerald-400 text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        ● AVAILABLE
                      </span>
                    )}
                    {design.status === 'HELD' && (
                      <span className="bg-amber-950/90 backdrop-blur-sm border border-amber-600/50 text-amber-300 text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        ● HELD
                      </span>
                    )}
                    {design.status === 'RESERVED' && (
                      <span className="bg-indigo-950/90 backdrop-blur-sm border border-indigo-600/50 text-indigo-300 text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        ● RESERVED
                      </span>
                    )}
                    {design.status === 'SOLD' && (
                      <span className="bg-[#171512]/95 backdrop-blur-sm border border-[#4A443A] text-[#A89F91] text-[8px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        ✕ SOLD
                      </span>
                    )}

                    {/* 2. Flash Type Badge (directly below Status) */}
                    {design.is_repeatable ? (
                      <span className="bg-[#171512]/95 backdrop-blur-sm border border-[#6A6256] text-[#ECE4D3] text-[8px] sm:text-[9px] font-medium px-1.5 py-0.5 rounded shadow">
                        สักซ้ำได้
                      </span>
                    ) : (
                      <span className="bg-[#6F1F1F]/95 backdrop-blur-sm border border-[#C12D2D] text-[#ECE4D3] text-[8px] sm:text-[9px] font-medium px-1.5 py-0.5 rounded shadow">
                        ลายเดียว
                      </span>
                    )}
                  </div>
                </div>

                {/* Info Area Below Image */}
                <div className="p-2 sm:p-3 bg-studio-card flex flex-col justify-between flex-1 min-w-0 space-y-1.5 sm:space-y-2">
                  <div className="space-y-0.5 sm:space-y-1 min-w-0">
                    {/* 1. Flash Title */}
                    <h4
                      className="font-bold text-[#ECE4D3] truncate text-xs sm:text-sm group-hover:text-[#C12D2D] transition-colors"
                      title={design.title}
                    >
                      {design.title}
                    </h4>

                    {/* 2. Artist Name */}
                    <p className="text-[10px] sm:text-xs text-[#ECE4D3] truncate">
                      ช่าง: <span className="text-[#ECE4D3] font-medium">{artistName}</span>
                    </p>

                    {/* 3. Style */}
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-[#ECE4D3] min-w-0 pt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#C12D2D] shrink-0" />
                      <span className="truncate font-medium">{design.style}</span>
                    </div>
                  </div>

                  {/* Divider & Actions */}
                  <div className="pt-2 sm:pt-2.5 mt-auto border-t border-studio-border/50 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1 sm:gap-1.5 min-w-0">
                    <div className="shrink-0">
                      {design.status === 'SOLD' ? (
                        <button
                          type="button"
                          onClick={() => handleQuickStatusToggle(design, 'AVAILABLE')}
                          disabled={reopeningId === design.id}
                          className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-400 text-[10px] sm:text-[11px] font-medium rounded transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title="เปิดจองอีกครั้ง"
                        >
                          {reopeningId === design.id ? (
                            <Loader2 size={11} className="animate-spin shrink-0" />
                          ) : (
                            <RefreshCw size={11} className="shrink-0" />
                          )}
                          <span>เปิดจองอีกครั้ง</span>
                        </button>
                      ) : design.status === 'AVAILABLE' ? (
                        <button
                          type="button"
                          onClick={() => handleQuickStatusToggle(design, 'SOLD')}
                          className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-400 text-[10px] sm:text-[11px] font-medium rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title="ปิดรับจอง"
                        >
                          <Lock size={11} className="shrink-0" />
                          <span>ปิดรับจอง</span>
                        </button>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(design)}
                        className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-[#25201A] hover:bg-[#2D2820] border border-[#3E372C] hover:border-[#C12D2D]/60 text-[#ECE4D3] text-[10px] sm:text-[11px] font-medium rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                        title="แก้ไขแบบลายสัก"
                      >
                        <Edit3 size={11} className="shrink-0" />
                        <span>แก้ไข</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(design)}
                        className="p-1 sm:p-1.5 bg-[#25201A] hover:bg-[#C12D2D]/20 border border-[#3E372C] hover:border-[#C12D2D] text-[#ECE4D3] hover:text-[#C12D2D] rounded transition-colors cursor-pointer shrink-0"
                        title="ลบแบบลายสัก"
                      >
                        <Trash2 size={12} />
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
                  <Sparkles size={18} className="text-studio-red-bright" />
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
                    <Camera size={15} className="text-studio-red-bright" />
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
                      className="w-28 h-28 sm:w-32 sm:h-32 bg-[#0E0D0C] border border-[#2D2820] hover:border-[#C12D2D]/60 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0 overflow-hidden relative group"
                    >
                      {isUploadingImage ? (
                        <Loader2 size={22} className="animate-spin text-studio-red-bright" />
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
                          <Camera size={13} className="text-studio-red-bright" />
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
                    <h4 className="text-xs font-bold text-[#ECE4D3] uppercase tracking-wider">ข้อมูลผลงาน</h4>
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
                      className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] placeholder:text-[#7A7162] focus:outline-none focus:border-[#C12D2D]"
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
                      className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#C12D2D] cursor-pointer"
                    >
                      {artistSpecialties.map((st: string) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* ประเภทผลงาน (Flash Type) */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#ECE4D3] block">
                      ประเภทผลงาน (Flash Type)
                    </label>
                    <select
                      value={formIsRepeatable ? 'repeatable' : 'single'}
                      onChange={(e) => setFormIsRepeatable(e.target.value === 'repeatable')}
                      className="w-full bg-[#0E0D0C] border border-[#3E372C] rounded-[4px] px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-[#C12D2D] cursor-pointer"
                    >
                      <option value="single">ลายเดียว (Single-use)</option>
                      <option value="repeatable">สักซ้ำได้ (Repeatable)</option>
                    </select>
                  </div>
                </div>

                {/* Section 3: การแสดงผล */}
                <div className="bg-[#171512] border border-[#2D2820] rounded-lg p-4 space-y-3">
                  <div className="border-b border-[#2D2820] pb-1.5">
                    <h4 className="text-xs font-bold text-[#ECE4D3] uppercase tracking-wider">การแสดงผล</h4>
                  </div>

                  <div>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsVisible}
                        onChange={(e) => setFormIsVisible(e.target.checked)}
                        className="w-4 h-4 rounded bg-[#0E0D0C] border-[#3E372C] text-[#C12D2D] focus:ring-0 focus:outline-none cursor-pointer"
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
                    className="bg-transparent border border-[#4A443A] text-[#ECE4D3] hover:text-white px-4 py-2 rounded-[4px] text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    ยกเลิก
                  </button>

                  <button
                    type="submit"
                    disabled={formSubmitting || isUploadingImage}
                    className="bg-[#C12D2D] hover:bg-[#802222] text-[#ECE4D3] px-5 py-2 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-[#C12D2D]/20 cursor-pointer"
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
                <p className="text-xs text-[#ECE4D3]">
                  คุณกำลังจะลบลาย Flash <strong className="text-studio-primary font-semibold font-mono">&quot;{deleteTarget.title}&quot;</strong> ออกจากระบบ ข้อมูลนี้ไม่สามารถกู้คืนได้
                </p>
              </div>

              <div className="pt-4 flex items-center justify-center space-x-3 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeletingFlash}
                  className="px-4 py-2 bg-studio-sec border border-studio-border text-xs text-[#ECE4D3] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  onClick={handleDeleteFlash}
                  disabled={isDeletingFlash}
                  className="px-5 py-2 bg-[#C12D2D] hover:bg-[#A82525] text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
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
