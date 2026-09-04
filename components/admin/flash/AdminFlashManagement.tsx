'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import { uploadStudioImage } from '@/lib/utils/storageUploader';
import {
  Sparkles,
  Plus,
  Edit3,
  Trash2,
  Calendar,
  Clock,
  DollarSign,
  User,
  Check,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Ban,
  ShieldCheck,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Filter,
  ArrowUpDown,
  Layers,
  FileText,
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
  sort_order: number;
  created_at: string;
  artist?: {
    id: string;
    name: string;
    nickname?: string | null;
  } | null;
}

export interface AdminFlashReservation {
  id: string;
  flash_design_id: string;
  customer_user_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  requested_date?: string | null;
  requested_start_time?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  flash_design?: {
    id: string;
    title: string;
    style: string;
    price: number;
    deposit_amount: number;
    image_url: string;
    status: string;
    artist?: {
      id: string;
      name: string;
      nickname?: string | null;
    } | null;
  } | null;
}

export default function AdminFlashManagement() {
  const { artists } = useApp();
  const [activeTab, setActiveTab] = useState<'designs' | 'reservations'>('designs');

  // Designs State
  const [designs, setDesigns] = useState<AdminFlashDesign[]>([]);
  const [designsLoading, setDesignsLoading] = useState(true);

  // Reservations State
  const [reservations, setReservations] = useState<AdminFlashReservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [resFilter, setResFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED'>('ALL');

  // Modal / Form States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingDesign, setEditingDesign] = useState<AdminFlashDesign | null>(null);

  // Form Fields
  const [formArtistId, setFormArtistId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStyle, setFormStyle] = useState('Fine Line');
  const [formSizeLabel, setFormSizeLabel] = useState('');
  const [formPrice, setFormPrice] = useState(3000);
  const [formDeposit, setFormDeposit] = useState(1000);
  const [formDuration, setFormDuration] = useState(2);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formIsVisible, setFormIsVisible] = useState(true);
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
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Action Processing State
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
          sort_order,
          created_at,
          artists (
            id,
            name,
            nickname
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
        sort_order: d.sort_order || 0,
        created_at: d.created_at,
        artist: d.artists ? {
          id: d.artists.id,
          name: d.artists.name,
          nickname: d.artists.nickname,
        } : null,
      }));

      setDesigns(formatted);
    } catch (err: any) {
      console.error('Error fetching admin flash designs:', err);
    } finally {
      setDesignsLoading(false);
    }
  }, []);

  // Fetch Reservations
  const fetchReservations = useCallback(async () => {
    setReservationsLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('flash_reservations')
        .select(`
          id,
          flash_design_id,
          customer_user_id,
          status,
          requested_date,
          requested_start_time,
          customer_note,
          admin_note,
          approved_at,
          rejected_at,
          cancelled_at,
          completed_at,
          created_at,
          flash_designs (
            id,
            title,
            style,
            price,
            deposit_amount,
            image_url,
            status,
            artists (
              id,
              name,
              nickname
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted: AdminFlashReservation[] = (data || []).map((r: any) => ({
        id: r.id,
        flash_design_id: r.flash_design_id,
        customer_user_id: r.customer_user_id,
        status: r.status,
        requested_date: r.requested_date,
        requested_start_time: r.requested_start_time,
        customer_note: r.customer_note,
        admin_note: r.admin_note,
        approved_at: r.approved_at,
        rejected_at: r.rejected_at,
        cancelled_at: r.cancelled_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
        flash_design: r.flash_designs ? {
          id: r.flash_designs.id,
          title: r.flash_designs.title,
          style: r.flash_designs.style,
          price: Number(r.flash_designs.price) || 0,
          deposit_amount: Number(r.flash_designs.deposit_amount) || 0,
          image_url: r.flash_designs.image_url,
          status: r.flash_designs.status,
          artist: r.flash_designs.artists ? {
            id: r.flash_designs.artists.id,
            name: r.flash_designs.artists.name,
            nickname: r.flash_designs.artists.nickname,
          } : null,
        } : null,
      }));

      setReservations(formatted);
    } catch (err: any) {
      console.error('Error fetching admin flash reservations:', err);
    } finally {
      setReservationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDesigns();
    fetchReservations();
  }, [fetchDesigns, fetchReservations]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingDesign(null);
    setFormArtistId(artists[0]?.id || '');
    setFormTitle('');
    setFormDescription('');
    setFormStyle('Fine Line');
    setFormSizeLabel('8x8 ซม.');
    setFormPrice(3000);
    setFormDeposit(1000);
    setFormDuration(2);
    setFormImageUrl('');
    setFormIsVisible(true);
    setFormSortOrder(designs.length + 1);
    setFormError('');
    setImageUploadError('');
    setIsUploadingImage(false);
    setShowManualUrlInput(false);
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (d: AdminFlashDesign) => {
    setEditingDesign(d);
    setFormArtistId(d.artist_id);
    setFormTitle(d.title);
    setFormDescription(d.description || '');
    setFormStyle(d.style);
    setFormSizeLabel(d.size_label || '');
    setFormPrice(d.price);
    setFormDeposit(d.deposit_amount);
    setFormDuration(d.estimated_duration_minutes ? Math.round((d.estimated_duration_minutes / 60) * 10) / 10 : 2);
    setFormImageUrl(d.image_url || '');
    setFormIsVisible(d.is_visible);
    setFormSortOrder(d.sort_order);
    setFormError('');
    setImageUploadError('');
    setIsUploadingImage(false);
    setShowManualUrlInput(false);
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
      const payload = {
        artist_id: formArtistId,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        style: formStyle,
        size_label: formSizeLabel.trim() || null,
        price: Number(formPrice),
        deposit_amount: Number(formDeposit),
        estimated_duration_minutes: formDuration ? Math.round(Number(formDuration) * 60) : null,
        image_url: formImageUrl.trim(),
        image_url_2: null,
        is_visible: formIsVisible,
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
      // Immediately filter local state and refetch
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

  // Process Reservation Action via RPC
  const handleProcessReservation = async (
    reservationId: string,
    action: 'APPROVE' | 'REJECT' | 'CANCEL' | 'COMPLETE',
    adminNote?: string
  ) => {
    const actionLabel = {
      APPROVE: 'อนุมัติคำขอ (Design จะเปลี่ยนเป็น RESERVED)',
      REJECT: 'ปฏิเสธคำขอ (Design จะกลับเป็น AVAILABLE)',
      CANCEL: 'ยกเลิกคำขอ (Design จะกลับเป็น AVAILABLE)',
      COMPLETE: 'ยืนยันสักเสร็จสิ้น (Design จะเป็น SOLD)',
    }[action];

    if (!window.confirm(`ต้องการ ${actionLabel} ใช่หรือไม่?`)) return;

    setProcessingId(reservationId);
    setActionNotice(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('admin_process_flash_reservation', {
        p_reservation_id: reservationId,
        p_action: action,
        p_admin_note: adminNote || null,
      });

      if (error) throw error;

      setActionNotice({ text: `ดำเนินการ ${action} สำเร็จแล้ว`, type: 'success' });
      fetchReservations();
      fetchDesigns();
    } catch (err: any) {
      console.error('Process reservation error:', err);
      setActionNotice({ text: err.message || `ไม่สามารถดำเนินการ ${action} ได้`, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  // Stats
  const totalCount = designs.length;
  const availableCount = designs.filter((d) => d.status === 'AVAILABLE').length;
  const heldCount = designs.filter((d) => d.status === 'HELD').length;
  const reservedCount = designs.filter((d) => d.status === 'RESERVED').length;
  const soldCount = designs.filter((d) => d.status === 'SOLD').length;
  const pendingResCount = reservations.filter((r) => r.status === 'PENDING').length;

  const filteredReservations = reservations.filter((r) => {
    if (resFilter === 'ALL') return true;
    return r.status === resFilter;
  });

  return (
    <div className="space-y-6 font-prompt animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-studio-border pb-4">
        <div>
          <div className="inline-flex items-center space-x-2 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-paper text-[10px] uppercase font-heading tracking-widest mb-1">
            <Sparkles size={12} className="text-studio-red" />
            <span>Flash Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-studio-primary">
            157 TATTOO FLASH CATALOG & RESERVATIONS
          </h1>
          <p className="text-xs text-studio-secondary mt-1 font-light">
            จัดการแบบลายสักพร้อมจอง (Fixed Price) ควบคุมสถานะคลังลายสัก และอนุมัติคำขอจองของลูกค้า
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchDesigns();
              fetchReservations();
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

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="bg-studio-card border border-studio-border p-3 rounded-[6px]">
          <span className="text-[10px] text-studio-muted uppercase tracking-wider block">ลาย Flash ทั้งหมด</span>
          <span className="text-lg font-bold text-studio-primary mt-0.5 block">{totalCount}</span>
        </div>
        <div className="bg-studio-card border border-emerald-900/40 p-3 rounded-[6px]">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider block">ว่าง (AVAILABLE)</span>
          <span className="text-lg font-bold text-emerald-400 mt-0.5 block">{availableCount}</span>
        </div>
        <div className="bg-studio-card border border-amber-900/40 p-3 rounded-[6px]">
          <span className="text-[10px] text-amber-300 uppercase tracking-wider block">รออนุมัติ (HELD)</span>
          <span className="text-lg font-bold text-amber-300 mt-0.5 block">{heldCount}</span>
        </div>
        <div className="bg-studio-card border border-indigo-900/40 p-3 rounded-[6px]">
          <span className="text-[10px] text-indigo-300 uppercase tracking-wider block">จองแล้ว (RESERVED)</span>
          <span className="text-lg font-bold text-indigo-300 mt-0.5 block">{reservedCount}</span>
        </div>
        <div className="bg-studio-card border border-[#4A443A] p-3 rounded-[6px]">
          <span className="text-[10px] text-[#7A7265] uppercase tracking-wider block">สักแล้ว (SOLD)</span>
          <span className="text-lg font-bold text-[#A89F91] mt-0.5 block">{soldCount}</span>
        </div>
        <div className="bg-studio-card border border-studio-red/40 p-3 rounded-[6px]">
          <span className="text-[10px] text-studio-red uppercase tracking-wider block">คำขอรอตรวจ</span>
          <span className="text-lg font-bold text-studio-red mt-0.5 block">{pendingResCount}</span>
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

      {/* Main Tabs */}
      <div className="flex border-b border-studio-border space-x-6 text-xs uppercase tracking-wider font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('designs')}
          className={`pb-3 relative transition-colors ${
            activeTab === 'designs' ? 'text-studio-primary font-bold' : 'text-studio-secondary hover:text-studio-primary'
          }`}
        >
          <span>แบบลายสัก Flash ({designs.length})</span>
          {activeTab === 'designs' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-studio-red animate-fadeIn" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reservations')}
          className={`pb-3 relative transition-colors flex items-center gap-1.5 ${
            activeTab === 'reservations' ? 'text-studio-primary font-bold' : 'text-studio-secondary hover:text-studio-primary'
          }`}
        >
          <span>คำขอจองลาย ({reservations.length})</span>
          {pendingResCount > 0 && (
            <span className="bg-studio-red text-studio-primary text-[9px] px-1.5 py-0.2 rounded-full font-bold">
              {pendingResCount}
            </span>
          )}
          {activeTab === 'reservations' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-studio-red animate-fadeIn" />
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DESIGNS CATALOG CRUD */}
      {/* ========================================================================= */}
      {activeTab === 'designs' && (
        <div className="space-y-4">
          {designsLoading ? (
            <div className="py-16 text-center text-xs text-studio-secondary animate-pulse">
              กำลังโหลดแบบลายสัก Flash...
            </div>
          ) : designs.length === 0 ? (
            <div className="bg-studio-card border border-studio-border p-12 rounded-[6px] text-center space-y-3">
              <Sparkles size={32} className="text-studio-muted mx-auto" />
              <h4 className="text-sm font-bold text-studio-primary">ยังไม่มีแบบลายสัก Flash ในระบบ</h4>
              <p className="text-xs text-studio-secondary">กดปุ่ม &quot;+ เพิ่มลาย Flash ใหม่&quot; เพื่อสร้างแบบลายสักพร้อมจอง</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {designs.map((d) => (
                <div
                  key={d.id}
                  className={`bg-studio-card border rounded-[6px] overflow-hidden flex flex-col justify-between transition-all ${
                    d.is_visible ? 'border-studio-border hover:border-studio-border/80' : 'border-studio-border/40 opacity-70'
                  }`}
                >
                  <div className="aspect-[4/3] bg-studio-main overflow-hidden relative">
                    <img src={d.image_url} alt={d.title} className="w-full h-full object-cover" />
                    <div className="absolute top-2 left-2 flex gap-1">
                      <span className="bg-studio-main/90 border border-studio-border text-studio-red text-[9px] font-bold px-1.5 py-0.5 rounded">
                        #{d.sort_order}
                      </span>
                      <span className="bg-studio-main/90 border border-studio-border text-studio-secondary text-[9px] px-1.5 py-0.5 rounded">
                        {d.style}
                      </span>
                    </div>

                    <div className="absolute top-2 right-2">
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
                    </div>
                  </div>

                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-studio-primary truncate text-sm">{d.title}</h4>
                        <span className="font-bold text-studio-red shrink-0 pl-1">
                          ฿{d.price.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-[11px] text-studio-secondary flex items-center justify-between">
                        <span>ช่าง: {d.artist?.name || 'ช่างประจำร้าน'}</span>
                        <span>มัดจำ: ฿{d.deposit_amount.toLocaleString()}</span>
                      </div>
                      {d.size_label && (
                        <span className="text-[10px] text-studio-muted block">ขนาด: {d.size_label}</span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-studio-border/50 flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(d)}
                        className={`text-[11px] flex items-center gap-1 font-medium px-2 py-1 rounded border transition-colors ${
                          d.is_visible
                            ? 'bg-studio-main border-studio-border text-studio-primary hover:border-studio-red/40'
                            : 'bg-red-950/20 border-red-900/40 text-red-400'
                        }`}
                      >
                        {d.is_visible ? <Eye size={12} className="text-emerald-400" /> : <EyeOff size={12} />}
                        <span>{d.is_visible ? 'แสดงบนเว็บ' : 'ซ่อนจากเว็บ'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(d)}
                          className="p-1.5 text-studio-secondary hover:text-studio-primary hover:bg-studio-sec rounded border border-transparent hover:border-studio-border transition-colors"
                          title="แก้ไขแบบลายสัก"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRequestDelete(d)}
                          className="p-1.5 text-red-400/80 hover:text-red-400 hover:bg-red-950/30 rounded border border-transparent hover:border-red-900/40 transition-colors"
                          title="ลบลายสัก Flash"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RESERVATIONS APPROVAL / REJECTION / COMPLETION */}
      {/* ========================================================================= */}
      {activeTab === 'reservations' && (
        <div className="space-y-4">
          {/* Reservation Status Filter Pills */}
          <div className="flex flex-wrap gap-2 text-xs">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setResFilter(st)}
                className={`px-3 py-1.5 rounded-[4px] border font-medium transition-all ${
                  resFilter === st
                    ? 'bg-studio-red border-studio-red text-studio-primary'
                    : 'bg-studio-card border-studio-border text-studio-secondary hover:text-studio-primary'
                }`}
              >
                {st === 'ALL' && 'ทั้งหมด'}
                {st === 'PENDING' && 'รอดำเนินการ (PENDING)'}
                {st === 'APPROVED' && 'อนุมัติแล้ว (APPROVED)'}
                {st === 'REJECTED' && 'ปฏิเสธ (REJECTED)'}
                {st === 'CANCELLED' && 'ยกเลิก (CANCELLED)'}
                {st === 'COMPLETED' && 'เสร็จสิ้น (COMPLETED)'}
              </button>
            ))}
          </div>

          {reservationsLoading ? (
            <div className="py-16 text-center text-xs text-studio-secondary animate-pulse">
              กำลังโหลดคำขอจอง Flash...
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="bg-studio-card border border-studio-border p-12 rounded-[6px] text-center text-xs text-studio-secondary">
              ไม่มีคำขอจองในสถานะที่เลือก
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReservations.map((r) => {
                const isPending = r.status === 'PENDING';
                const isApproved = r.status === 'APPROVED';
                const isCompleted = r.status === 'COMPLETED';
                const isCancelled = r.status === 'CANCELLED';
                const isRejected = r.status === 'REJECTED';

                const design = r.flash_design;

                return (
                  <div
                    key={r.id}
                    className="bg-studio-card border border-studio-border p-4 rounded-[6px] space-y-3 shadow-md"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-studio-border/50 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-studio-red tracking-wider">
                          RES #{r.id.slice(0, 8)}
                        </span>
                        <span className="text-[10px] text-studio-muted">
                          ลูกค้า: <strong className="text-studio-primary">UUID {r.customer_user_id.slice(0, 8)}...</strong>
                        </span>
                        <span className="text-[10px] text-studio-muted">
                          • {new Date(r.created_at).toLocaleDateString('th-TH')}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isPending && (
                          <span className="bg-amber-950/60 border border-amber-600/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <Clock3 size={11} /> PENDING (Design HELD)
                          </span>
                        )}
                        {isApproved && (
                          <span className="bg-indigo-950/60 border border-indigo-600/40 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <CheckCircle2 size={11} /> APPROVED (Design RESERVED)
                          </span>
                        )}
                        {isCompleted && (
                          <span className="bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <CheckCircle2 size={11} /> COMPLETED (Design SOLD)
                          </span>
                        )}
                        {isCancelled && (
                          <span className="bg-[#171512] border border-[#4A443A] text-[#7A7265] text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <Ban size={11} /> CANCELLED
                          </span>
                        )}
                        {isRejected && (
                          <span className="bg-red-950/40 border border-red-900/60 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <Ban size={11} /> REJECTED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="flex gap-3.5 items-start">
                      {design?.image_url && (
                        <div className="w-16 h-20 bg-studio-main rounded overflow-hidden shrink-0 border border-studio-border/60">
                          <img src={design.image_url} alt={design.title} className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0 space-y-1 text-xs">
                        <div className="flex justify-between items-start">
                          <h4 className="font-bold text-studio-primary text-sm truncate">
                            {design?.title || 'แบบลายสัก Flash'}
                          </h4>
                          <span className="font-bold text-studio-red pl-2 text-sm">
                            ฿{design?.price?.toLocaleString()}
                          </span>
                        </div>

                        <div className="text-[11px] text-studio-secondary flex items-center gap-2">
                          <span>ช่าง: <strong className="text-studio-primary">{design?.artist?.name || 'ช่างประจำร้าน'}</strong></span>
                          <span>มัดจำ: ฿{design?.deposit_amount?.toLocaleString()}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-studio-muted pt-1">
                          {r.requested_date && <span>วันที่ลูกค้าสะดวก: <strong className="text-studio-primary">{r.requested_date}</strong></span>}
                          {r.requested_start_time && <span>เวลา: <strong className="text-studio-primary">{r.requested_start_time.slice(0, 5)} น.</strong></span>}
                        </div>

                        {r.customer_note && (
                          <div className="text-[11px] text-studio-secondary bg-studio-main/60 p-2 rounded border border-studio-border/30 mt-1">
                            <span className="text-studio-muted">ข้อความจากลูกค้า: </span>
                            {r.customer_note}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Admin Action Buttons */}
                    {(isPending || isApproved) && (
                      <div className="pt-2 border-t border-studio-border/40 flex flex-wrap justify-end gap-2 text-xs">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={processingId === r.id}
                              onClick={() => handleProcessReservation(r.id, 'REJECT')}
                              className="bg-transparent border border-red-900/60 text-red-400 hover:bg-red-950/40 px-3 py-1.5 rounded-[4px] font-semibold transition-all disabled:opacity-50"
                            >
                              ✕ ปฏิเสธ (Reject)
                            </button>
                            <button
                              type="button"
                              disabled={processingId === r.id}
                              onClick={() => handleProcessReservation(r.id, 'APPROVE')}
                              className="bg-studio-red border border-studio-red text-studio-primary hover:bg-studio-red/80 px-3 py-1.5 rounded-[4px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 shadow-md"
                            >
                              ✓ อนุมัติการจอง (Approve)
                            </button>
                          </>
                        )}

                        {isApproved && (
                          <>
                            <button
                              type="button"
                              disabled={processingId === r.id}
                              onClick={() => handleProcessReservation(r.id, 'CANCEL')}
                              className="bg-transparent border border-[#4A443A] text-studio-secondary hover:text-studio-primary px-3 py-1.5 rounded-[4px] font-semibold transition-all disabled:opacity-50"
                            >
                              ยกเลิกการจอง (Cancel)
                            </button>
                            <button
                              type="button"
                              disabled={processingId === r.id}
                              onClick={() => handleProcessReservation(r.id, 'COMPLETE')}
                              className="bg-emerald-700 border border-emerald-600 text-studio-primary hover:bg-emerald-600 px-3 py-1.5 rounded-[4px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                            >
                              ✓ สักเสร็จสิ้น (Mark SOLD)
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Design Create / Edit Modal */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-studio-main/90 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-studio-card border border-studio-border p-6 rounded-[8px] shadow-2xl relative my-6 text-studio-primary text-xs space-y-4">
            <div className="flex justify-between items-center border-b border-studio-border pb-3">
              <h3 className="text-base font-bold text-studio-primary">
                {editingDesign ? 'แก้ไขแบบลายสัก Flash' : 'เพิ่มแบบลายสัก Flash ใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="text-studio-muted hover:text-studio-red"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] text-red-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveDesign} className="space-y-3">
              <div className="space-y-1">
                <label className="text-studio-secondary font-medium block">ช่างสักเจ้าของลาย</label>
                <select
                  value={formArtistId}
                  onChange={(e) => setFormArtistId(e.target.value)}
                  className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red"
                >
                  <option value="">-- เลือกช่างสัก --</option>
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.nickname ? `(${a.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-studio-secondary font-medium block">ชื่อลายสัก (Title)</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="เช่น Geometric Compass & Arrow"
                  className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-studio-secondary font-medium block">สไตล์ (Style)</label>
                  <input
                    type="text"
                    value={formStyle}
                    onChange={(e) => setFormStyle(e.target.value)}
                    placeholder="Fine Line, Blackwork, Traditional..."
                    className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-studio-secondary font-medium block">ขนาดแนะนำ (Size)</label>
                  <input
                    type="text"
                    value={formSizeLabel}
                    onChange={(e) => setFormSizeLabel(e.target.value)}
                    placeholder="เช่น 8x8 ซม."
                    className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-studio-secondary font-medium block">ราคาค่าสัก (฿)</label>
                  <input
                    type="number"
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    min={0}
                    className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-studio-secondary font-medium block">เงินมัดจำ (฿)</label>
                  <input
                    type="number"
                    value={formDeposit}
                    onChange={(e) => setFormDeposit(Number(e.target.value))}
                    min={0}
                    className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-studio-secondary font-medium block">เวลาสัก (ชั่วโมง)</label>
                  <input
                    type="number"
                    value={formDuration}
                    onChange={(e) => setFormDuration(parseFloat(e.target.value) || 0)}
                    min={0.5}
                    step={0.5}
                    placeholder="เช่น 1, 1.5, 2"
                    className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red"
                  />
                </div>
              </div>

              {/* Flash Image Upload (Single Image Dropzone) */}
              <div className="space-y-2">
                <label className="text-studio-secondary font-medium block">
                  รูปภาพลาย Flash <span className="text-studio-red">*</span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageFileSelect}
                  disabled={isUploadingImage || formSubmitting}
                  className="hidden"
                />

                {isUploadingImage ? (
                  <div className="border border-dashed border-studio-border bg-studio-main p-6 rounded-[6px] flex flex-col items-center justify-center space-y-2 text-center animate-pulse">
                    <Loader2 size={24} className="animate-spin text-studio-red" />
                    <span className="text-xs text-studio-primary font-medium">กำลังอัปโหลดรูปภาพไปยัง Storage...</span>
                    <span className="text-[10px] text-studio-muted">ระบบกำลังบีบอัดและส่งขึ้น studio-assets/flash</span>
                  </div>
                ) : formImageUrl ? (
                  <div className="bg-studio-main border border-studio-border p-3 rounded-[6px] space-y-2">
                    <div className="relative aspect-[4/3] max-h-48 rounded overflow-hidden border border-studio-border bg-[#0E0D0C]">
                      <img
                        src={formImageUrl}
                        alt="Flash Preview"
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
                          disabled={isUploadingImage || formSubmitting}
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 bg-studio-card hover:bg-studio-sec border border-studio-border text-[11px] text-studio-primary rounded transition-colors flex items-center gap-1"
                        >
                          <Camera size={12} className="text-studio-red" />
                          <span>เปลี่ยนรูป</span>
                        </button>
                        <button
                          type="button"
                          disabled={isUploadingImage || formSubmitting}
                          onClick={() => {
                            setFormImageUrl('');
                            setImageUploadError('');
                          }}
                          className="px-2.5 py-1 bg-studio-card hover:bg-red-950/40 border border-studio-border hover:border-red-900/60 text-[11px] text-red-400 rounded transition-colors flex items-center gap-1"
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
                      if (!isUploadingImage && !formSubmitting) {
                        fileInputRef.current?.click();
                      }
                    }}
                    className="border border-dashed border-studio-border hover:border-studio-red/60 bg-studio-main hover:bg-[#141210] p-6 rounded-[6px] text-center cursor-pointer transition-colors flex flex-col items-center justify-center space-y-2 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-studio-card border border-studio-border group-hover:border-studio-red/60 flex items-center justify-center text-studio-secondary group-hover:text-studio-primary transition-colors">
                      <Upload size={18} />
                    </div>
                    <div>
                      <span className="text-xs text-studio-primary font-medium block">
                        + คลิกเพื่อเลือกรูปภาพจากเครื่อง
                      </span>
                      <span className="text-[10px] text-studio-muted block mt-0.5">
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
                    className="text-[10px] text-studio-muted hover:text-studio-primary hover:underline transition-colors"
                  >
                    {showManualUrlInput ? '▼ ซ่อนการกรอก URL รูปภายนอก' : '▶ หรือใช้ URL รูปภาพภายนอก (HTTPS)'}
                  </button>

                  {showManualUrlInput && (
                    <input
                      type="url"
                      value={formImageUrl}
                      onChange={(e) => {
                        setFormImageUrl(e.target.value);
                        setImageUploadError('');
                      }}
                      placeholder="https://images.unsplash.com/..."
                      className="mt-1.5 w-full bg-studio-main border border-studio-border text-studio-primary p-2 text-xs rounded-[4px] outline-none focus:border-studio-red font-mono"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-studio-secondary font-medium block">คำอธิบายรายละเอียด</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-studio-main border border-studio-border text-studio-primary p-2 rounded-[4px] outline-none focus:border-studio-red resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-studio-primary">
                  <input
                    type="checkbox"
                    checked={formIsVisible}
                    onChange={(e) => setFormIsVisible(e.target.checked)}
                    className="accent-studio-red"
                  />
                  <span>แสดงบนเว็บไซต์ (is_visible)</span>
                </label>

                <div className="flex items-center gap-1.5">
                  <span className="text-studio-muted">ลำดับ:</span>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(Number(e.target.value))}
                    className="w-16 bg-studio-main border border-studio-border text-studio-primary p-1 text-center rounded"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-studio-border">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={formSubmitting || isUploadingImage}
                  className="flex-1 bg-transparent border border-studio-border text-studio-secondary py-2 rounded-[4px] hover:text-studio-primary disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || isUploadingImage || !formImageUrl}
                  className="flex-[2] bg-studio-red text-studio-primary font-bold py-2 rounded-[4px] hover:bg-studio-red/80 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isUploadingImage ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>กำลังอัปโหลดรูป...</span>
                    </>
                  ) : formSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    'บันทึกแบบลายสัก'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-studio-card border border-studio-border rounded-[8px] max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950/50 border border-red-900/50 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-studio-primary">
                  ลบลาย Flash นี้?
                </h3>
                <p className="text-xs text-studio-secondary leading-relaxed">
                  ลาย Flash และไฟล์รูปภาพจะถูกลบออกจากระบบอย่างถาวร และไม่สามารถกู้คืนได้
                </p>
              </div>
            </div>

            {/* Target Info */}
            <div className="bg-studio-main border border-studio-border p-3.5 rounded-[6px] space-y-2 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded overflow-hidden border border-studio-border bg-black shrink-0">
                  <img
                    src={deleteTarget.image_url}
                    alt={deleteTarget.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-studio-primary text-sm truncate">
                    {deleteTarget.title}
                  </div>
                  <div className="text-[11px] text-studio-secondary flex items-center gap-2 mt-0.5">
                    <span>สไตล์: {deleteTarget.style}</span>
                    <span>•</span>
                    <span className="text-studio-red font-semibold">฿{deleteTarget.price.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Status Notice if not AVAILABLE */}
              {deleteTarget.status !== 'AVAILABLE' && (
                <div className="pt-2 border-t border-studio-border/60">
                  <div className="bg-amber-950/30 border border-amber-900/50 text-amber-300 p-2.5 rounded text-[11px] flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-amber-400" />
                    <span>
                      {deleteTarget.status === 'HELD' && 'ไม่สามารถลบได้ เนื่องจากลายนี้กำลังถูกพักสิทธิ์'}
                      {deleteTarget.status === 'RESERVED' && 'ไม่สามารถลบได้ เนื่องจากลายนี้มีการจองอยู่'}
                      {deleteTarget.status === 'SOLD' && 'ไม่สามารถลบลายที่ขายแล้วได้ เนื่องจากต้องเก็บประวัติการขาย'}
                      {deleteTarget.status !== 'HELD' && deleteTarget.status !== 'RESERVED' && deleteTarget.status !== 'SOLD' && `ไม่สามารถลบลาย Flash ในสถานะ ${deleteTarget.status} ได้`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message if any */}
            {deleteErrorMessage && (
              <div className="bg-red-950/40 border border-red-900/60 text-red-300 p-3 rounded text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-red-400" />
                <span>{deleteErrorMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingFlash}
                onClick={handleCloseDeleteModal}
                className="px-4 py-2 bg-studio-main hover:bg-studio-sec border border-studio-border text-xs text-studio-primary rounded-[4px] transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>

              <button
                type="button"
                disabled={isDeletingFlash || deleteTarget.status !== 'AVAILABLE'}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-950/40 disabled:text-red-400/40 disabled:border-red-900/30 text-white text-xs font-bold rounded-[4px] transition-colors flex items-center gap-1.5 shadow-md"
              >
                {isDeletingFlash ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>กำลังลบ...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>ลบถาวร</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
