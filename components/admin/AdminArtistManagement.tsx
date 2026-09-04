'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';
import { Artist } from '@/data/mockArtists';
import {
  Search,
  User,
  Users,
  Calendar,
  Clock,
  ChevronDown,
  Check,
  X,
  Sparkles,
  ArrowUpDown,
  Plus,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Palette,
  AlertCircle,
  RefreshCw,
  Loader2,
  Power,
  SlidersHorizontal,
  Upload,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import { compressImageWithMetrics } from '@/lib/utils/imageCompressor';
import { uploadStudioImage } from '@/lib/utils/storageUploader';

const PRESET_SPECIALTIES = [
  'Blackwork',
  'Darkwork',
  'Fine Line',
  'Minimal',
  'Traditional',
  'Japanese',
  'Realism',
  'Portrait',
  'Chicano',
  'Tribal',
  'Geometric',
];

const WORKING_DAYS_LIST = [
  { key: 'Mon', th: 'จ.' },
  { key: 'Tue', th: 'อ.' },
  { key: 'Wed', th: 'พ.' },
  { key: 'Thu', th: 'พฤ.' },
  { key: 'Fri', th: 'ศ.' },
  { key: 'Sat', th: 'ส.' },
  { key: 'Sun', th: 'อา.' },
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  AVAILABLE: { label: 'ว่าง', dot: 'bg-[#4E9F6E]', badge: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' },
  TATTOOING: { label: 'กำลังสัก', dot: 'bg-[#9C2F2F]', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' },
  BREAK: { label: 'พัก', dot: 'bg-[#C9A86A]', badge: 'text-amber-300 bg-amber-950/60 border-amber-800' },
  OFF_DUTY: { label: 'หยุด', dot: 'bg-[#7A7265]', badge: 'text-[#A89F91] bg-[#171512] border-[#4A443A]' },
};

function normalizeStatus(status?: string): 'AVAILABLE' | 'TATTOOING' | 'BREAK' | 'OFF_DUTY' {
  if (!status) return 'AVAILABLE';
  const upper = status.toUpperCase().replace(/\s+/g, '_');
  if (['AVAILABLE', 'TATTOOING', 'BREAK', 'OFF_DUTY'].includes(upper)) {
    return upper as any;
  }
  return 'AVAILABLE';
}

function ArtistAvatarUploader({
  previewUrl,
  onImageSelected,
}: {
  previewUrl: string;
  onImageSelected: (file: File | null, preview: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionMetrics, setCompressionMetrics] = useState<{
    width: number;
    height: number;
    origKb: number;
    compKb: number;
  } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validMimeTypes.includes(file.type.toLowerCase())) {
      setUploadError('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB');
      return;
    }

    try {
      setIsCompressing(true);
      setUploadError(null);

      // Perform client-side compression (Preserves 100% original dimensions, quality 0.82)
      const result = await compressImageWithMetrics(file, { quality: 0.82 });

      setCompressionMetrics({
        width: result.width,
        height: result.height,
        origKb: Math.round(result.originalSize / 1024),
        compKb: Math.round(result.compressedSize / 1024),
      });

      onImageSelected(result.file, result.previewUrl);
    } catch (err: any) {
      console.error('Avatar compression error:', err);
      setUploadError(err.message || 'ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleRemoveImage = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadError(null);
    setCompressionMetrics(null);
    onImageSelected(null, '');
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-[#A89F91] text-xs font-medium">
        รูปโปรไฟล์ช่าง (Artist Avatar)
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {isCompressing ? (
        <div className="p-4 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] flex items-center justify-center space-x-2 text-xs text-[#A89F91]">
          <Loader2 size={16} className="animate-spin text-[#9C2F2F]" />
          <span>กำลังบีบอัดรูปภาพ (คงขนาดความละเอียดเดิม)...</span>
        </div>
      ) : previewUrl ? (
        <div className="p-3 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] flex items-center space-x-4">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-[6px] overflow-hidden border border-[#4A443A] shrink-0 bg-[#171512]">
            <img
              src={previewUrl}
              alt="Artist Avatar Preview"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-[#171512] hover:bg-[#25211D] border border-[#4A443A] hover:border-[#9C2F2F] text-xs text-[#ECE4D3] rounded transition-colors flex items-center space-x-1.5"
              >
                <Camera size={13} className="text-[#9C2F2F]" />
                <span>เปลี่ยนรูป</span>
              </button>
              <button
                type="button"
                onClick={handleRemoveImage}
                className="px-3 py-1.5 bg-[#171512] hover:bg-red-950/40 border border-[#4A443A] hover:border-red-900/60 text-xs text-red-400 rounded transition-colors flex items-center space-x-1.5"
              >
                <Trash2 size={13} />
                <span>ลบรูป</span>
              </button>
            </div>
            {compressionMetrics ? (
              <p className="text-[10px] text-emerald-400 font-mono">
                ✓ บีบอัดแล้ว: {compressionMetrics.width}×{compressionMetrics.height}px ({compressionMetrics.compKb} KB จาก {compressionMetrics.origKb} KB)
              </p>
            ) : (
              <p className="text-[10px] text-[#7A7265] leading-tight font-light">
                รูปตัวอย่างพร้อมใช้งาน กดบันทึกเพื่ออัปโหลด
              </p>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-[#4A443A] hover:border-[#9C2F2F] bg-[#0E0D0C] hover:bg-[#141210] p-4 rounded-[6px] text-center cursor-pointer transition-colors flex flex-col items-center justify-center space-y-2 group"
        >
          <div className="w-10 h-10 rounded-full bg-[#171512] border border-[#4A443A] group-hover:border-[#9C2F2F] flex items-center justify-center text-[#A89F91] group-hover:text-[#ECE4D3] transition-colors">
            <Upload size={18} />
          </div>
          <div>
            <span className="text-xs text-[#ECE4D3] font-medium block">
              + อัปโหลดรูปภาพโปรไฟล์
            </span>
            <span className="text-[10px] text-[#7A7265] block mt-0.5">
              รองรับ JPG, PNG, WEBP (บีบอัดอัตโนมัติ ไม่ลดมิติภาพ)
            </span>
          </div>
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-red-400 flex items-center space-x-1">
          <AlertCircle size={13} className="shrink-0" />
          <span>{uploadError}</span>
        </p>
      )}
    </div>
  );
}

interface ArtistFormProps {
  mode: 'create' | 'edit';
  artistName?: string;
  formName: string;
  setFormName: (val: string) => void;
  formNickname: string;
  setFormNickname: (val: string) => void;
  formAvatarPreview: string;
  setFormAvatarPreview: (val: string) => void;
  setFormAvatarFile: (file: File | null) => void;
  setFormAvatarUrl: (val: string) => void;
  formBio: string;
  setFormBio: (val: string) => void;
  formSpecialties: string[];
  setFormSpecialties: (val: string[]) => void;
  handleToggleSpecialty: (spec: string) => void;
  customSpecialtyInput: string;
  setCustomSpecialtyInput: (val: string) => void;
  handleAddCustomSpecialty: () => void;
  formWorkingDays: string[];
  handleToggleWorkingDay: (dayKey: string) => void;
  formStatus: 'AVAILABLE' | 'TATTOOING' | 'BREAK' | 'OFF_DUTY';
  setFormStatus: (val: 'AVAILABLE' | 'TATTOOING' | 'BREAK' | 'OFF_DUTY') => void;
  formIsVisible: boolean;
  setFormIsVisible: (val: boolean) => void;
  formIsActive: boolean;
  setFormIsActive: (val: boolean) => void;
  formError: string | null;
  isSubmitting: boolean;
  isAuthValid?: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function ArtistForm({
  mode,
  artistName,
  formName,
  setFormName,
  formNickname,
  setFormNickname,
  formAvatarPreview,
  setFormAvatarPreview,
  setFormAvatarFile,
  setFormAvatarUrl,
  formBio,
  setFormBio,
  formSpecialties,
  setFormSpecialties,
  handleToggleSpecialty,
  customSpecialtyInput,
  setCustomSpecialtyInput,
  handleAddCustomSpecialty,
  formWorkingDays,
  handleToggleWorkingDay,
  formStatus,
  setFormStatus,
  formIsVisible,
  setFormIsVisible,
  formIsActive,
  setFormIsActive,
  formError,
  isSubmitting,
  isAuthValid,
  onSubmit,
  onCancel,
}: ArtistFormProps) {
  // Dynamic list of specialty chips (starts with presets + any specialties existing in formSpecialties)
  const [availableSpecialties, setAvailableSpecialties] = useState<string[]>(() => {
    const list = [...PRESET_SPECIALTIES];
    formSpecialties.forEach((s) => {
      if (s && !list.includes(s)) {
        list.push(s);
      }
    });
    return list;
  });

  // Sync if formSpecialties receives items not yet in availableSpecialties
  useEffect(() => {
    setAvailableSpecialties((prev) => {
      const missing = formSpecialties.filter((s) => s && !prev.includes(s));
      if (missing.length === 0) return prev;
      return [...prev, ...missing];
    });
  }, [formSpecialties]);

  // Handle adding custom specialty
  const handleAddCustom = () => {
    const trimmed = customSpecialtyInput.trim();
    if (!trimmed) return;
    if (!availableSpecialties.includes(trimmed)) {
      setAvailableSpecialties((prev) => [...prev, trimmed]);
    }
    if (!formSpecialties.includes(trimmed)) {
      setFormSpecialties([...formSpecialties, trimmed]);
    }
    setCustomSpecialtyInput('');
  };

  // Handle deleting specialty chip with small 'x' button
  const handleDeleteSpecialty = (spec: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAvailableSpecialties((prev) => prev.filter((s) => s !== spec));
    if (formSpecialties.includes(spec)) {
      setFormSpecialties(formSpecialties.filter((s) => s !== spec));
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5 flex-1 flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex justify-between items-center border-b border-[#4A443A]/60 pb-4 mb-5">
          <div className="flex items-center space-x-2">
            {mode === 'create' ? (
              <Plus size={16} className="text-[#9C2F2F]" />
            ) : (
              <Edit3 size={15} className="text-[#9C2F2F]" />
            )}
            <h2 className="text-lg font-heading tracking-wide text-[#ECE4D3]">
              {mode === 'create'
                ? 'เพิ่มช่างสักใหม่ (ADD ARTIST)'
                : `แก้ไขข้อมูล: ${artistName || formName}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {isAuthValid === false && (
          <div className="p-3 bg-[#9C2F2F]/20 border border-[#9C2F2F] rounded text-xs text-[#ECE4D3] mb-4 flex items-center justify-between">
            <span>เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่</span>
            <a href="/staff/login" className="px-2 py-1 bg-[#9C2F2F] text-white rounded text-[11px] font-bold hover:bg-[#802222]">
              เข้าสู่ระบบ
            </a>
          </div>
        )}

        {formError && (
          <div className="p-3 bg-[#9C2F2F]/20 border border-[#9C2F2F] rounded text-xs text-[#ECE4D3] mb-4">
            {formError}
          </div>
        )}

        <div className="space-y-4 text-xs">
          {/* 1. ชื่อช่าง * & 2. ชื่อเล่น */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[#A89F91] mb-1 font-medium">
                ชื่อช่าง *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="เช่น ช่างปอนด์ (Pond)"
                className="w-full h-9 px-3 bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] rounded text-xs text-[#ECE4D3] outline-none"
              />
            </div>
            <div>
              <label className="block text-[#A89F91] mb-1 font-medium">
                ชื่อเล่น
              </label>
              <input
                type="text"
                value={formNickname}
                onChange={(e) => setFormNickname(e.target.value)}
                placeholder="เช่น ปอนด์"
                className="w-full h-9 px-3 bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] rounded text-xs text-[#ECE4D3] outline-none"
              />
            </div>
          </div>

          {/* 3. รูปโปรไฟล์ช่าง */}
          <ArtistAvatarUploader
            previewUrl={formAvatarPreview}
            onImageSelected={(file, preview) => {
              setFormAvatarFile(file);
              setFormAvatarPreview(preview);
              if (!file && !preview) {
                setFormAvatarUrl('');
              }
            }}
          />

          {/* 4. ประวัติ (Bio) */}
          <div>
            <label className="block text-[#A89F91] mb-1 font-medium">
              ประวัติ (Bio)
            </label>
            <textarea
              rows={3}
              value={formBio}
              onChange={(e) => setFormBio(e.target.value)}
              placeholder="อธิบายความเชี่ยวชาญ สไตล์ และประสบการณ์ของช่าง..."
              className="w-full p-2.5 bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] rounded text-xs text-[#ECE4D3] outline-none resize-none leading-relaxed"
            />
          </div>

          {/* 5. สไตล์ที่ถนัด (Specialties) */}
          <div>
            <label className="block text-[#A89F91] mb-1.5 font-medium">
              สไตล์ที่ถนัด (Specialties)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {availableSpecialties.map((spec) => {
                const active = formSpecialties.includes(spec);
                return (
                  <div
                    key={spec}
                    className="relative inline-flex items-center"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleSpecialty(spec)}
                      className={`pl-2.5 pr-5 py-1 rounded text-[11px] font-heading tracking-wider transition-colors select-none ${
                        active
                          ? 'bg-[#9C2F2F] text-[#ECE4D3] border border-[#9C2F2F]'
                          : 'bg-[#0E0D0C] text-[#7A7265] border border-[#4A443A] hover:border-[#7A7265]'
                      }`}
                    >
                      {active && '✓ '}
                      {spec}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSpecialty(spec, e)}
                      title={`ลบ ${spec}`}
                      aria-label={`ลบ ${spec}`}
                      className={`absolute top-0.5 right-1 w-3.5 h-3.5 flex items-center justify-center rounded-full text-[10px] transition-colors ${
                        active
                          ? 'text-[#ECE4D3]/70 hover:text-white hover:bg-black/25'
                          : 'text-[#7A7265] hover:text-[#ECE4D3] hover:bg-white/10'
                      }`}
                    >
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Custom Specialty Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customSpecialtyInput}
                onChange={(e) => setCustomSpecialtyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                placeholder="เพิ่มสไตล์อื่น ๆ..."
                className="flex-1 h-8 px-2.5 bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] rounded text-xs text-[#ECE4D3] outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                className="px-3 bg-[#171512] border border-[#4A443A] hover:border-[#ECE4D3] text-[#ECE4D3] rounded text-xs font-medium"
              >
                เพิ่ม
              </button>
            </div>
          </div>

          {/* 6. วันทำงาน */}
          <div>
            <label className="block text-[#A89F91] mb-1.5 font-medium">
              วันทำงาน (Working Days)
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {WORKING_DAYS_LIST.map((day) => {
                const active = formWorkingDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => handleToggleWorkingDay(day.key)}
                    className={`py-2 rounded text-center transition-colors border ${
                      active
                        ? 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#ECE4D3] font-bold'
                        : 'bg-[#0E0D0C] border-[#4A443A] text-[#7A7265]'
                    }`}
                  >
                    <span className="block text-xs">{day.th}</span>
                    <span className="block text-[9px] font-mono opacity-60">{day.key}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. สถานะการทำงาน (Status) */}
          <div>
            <label className="block text-[#A89F91] mb-1 font-medium">
              สถานะการทำงาน (Status)
            </label>
            <select
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value as any)}
              className="w-full h-9 px-3 bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] rounded text-xs text-[#ECE4D3] outline-none"
            >
              <option value="AVAILABLE">ว่าง (Available)</option>
              <option value="TATTOOING">กำลังสัก (Tattooing)</option>
              <option value="BREAK">พัก (Break)</option>
              <option value="OFF_DUTY">ไม่เข้าร้าน (Off Duty)</option>
            </select>
          </div>

          {/* 8. แสดงบนหน้าเว็บ (Visible) & 9. เปิดใช้งาน (Active) */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#4A443A]/40">
            <label className="flex items-center space-x-2.5 p-2 bg-[#0E0D0C] border border-[#4A443A] rounded cursor-pointer">
              <input
                type="checkbox"
                checked={formIsVisible}
                onChange={(e) => setFormIsVisible(e.target.checked)}
                className="rounded border-[#4A443A] text-[#9C2F2F] focus:ring-0"
              />
              <span className="text-xs text-[#ECE4D3]">แสดงบนหน้าเว็บ (Visible)</span>
            </label>
            <label className="flex items-center space-x-2.5 p-2 bg-[#0E0D0C] border border-[#4A443A] rounded cursor-pointer">
              <input
                type="checkbox"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="rounded border-[#4A443A] text-[#9C2F2F] focus:ring-0"
              />
              <span className="text-xs text-[#ECE4D3]">เปิดใช้งาน (Active)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Drawer Footer Actions */}
      <div className="pt-4 border-t border-[#4A443A]/60 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-10 bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] rounded text-xs font-medium transition-colors"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={isSubmitting || isAuthValid === false}
          className={`flex-1 h-10 text-[#ECE4D3] rounded text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5 shadow ${
            isAuthValid === false
              ? 'bg-[#4A443A] opacity-50 cursor-not-allowed'
              : 'bg-[#9C2F2F] hover:bg-[#802222]'
          }`}
          title={isAuthValid === false ? 'เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่' : undefined}
        >
          {isSubmitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          <span>{mode === 'create' ? 'บันทึกช่างสัก' : 'บันทึกการแก้ไข'}</span>
        </button>
      </div>
    </form>
  );
}

export default function AdminArtistManagement() {
  const { supabase, user, profile, bookings, estimateRequests } = useApp();
  const isAuthValid = !!user && profile?.role === 'admin' && profile?.is_active !== false;

  // Data states
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedSpecialtyFilter, setSelectedSpecialtyFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'sort_order' | 'name' | 'status'>('sort_order');

  // Dropdown States
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isSpecialtyDropdownOpen, setIsSpecialtyDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const specialtyDropdownRef = useRef<HTMLDivElement>(null);

  // Drawer States
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteConfirmArtist, setDeleteConfirmArtist] = useState<Artist | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Field States
  const [formName, setFormName] = useState('');
  const [formNickname, setFormNickname] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formAvatarUrl, setFormAvatarUrl] = useState('');
  const [formAvatarFile, setFormAvatarFile] = useState<File | null>(null);
  const [formAvatarPreview, setFormAvatarPreview] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formSpecialties, setFormSpecialties] = useState<string[]>([]);
  const [customSpecialtyInput, setCustomSpecialtyInput] = useState('');
  const [formWorkingDays, setFormWorkingDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [formStatus, setFormStatus] = useState<'AVAILABLE' | 'TATTOOING' | 'BREAK' | 'OFF_DUTY'>('AVAILABLE');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsVisible, setFormIsVisible] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);

  // Helper: Upload avatar file to Supabase Storage (studio-assets/artists)
  const uploadAvatarIfPending = async (file: File | null, existingUrl: string): Promise<string | null> => {
    if (!file) {
      return existingUrl.trim() || null;
    }

    // Upload to studio-assets/artists via shared storage uploader
    const result = await uploadStudioImage(file, 'artists');
    return result.publicUrl;
  };

  // Fetch Artists directly from Supabase
  const loadArtists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('artists')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (err) {
        throw err;
      }

      if (data) {
        const mapped: Artist[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          nickname: item.nickname || undefined,
          slug: item.slug || undefined,
          specialty: (item.specialties && item.specialties.length > 0) ? item.specialties.join(' / ') : '',
          specialties: item.specialties || [],
          bio: item.bio || '',
          avatar: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
          avatar_url: item.avatar_url || undefined,
          portfolio: [],
          availability: item.working_days || [],
          working_days: item.working_days || [],
          status: normalizeStatus(item.status),
          is_active: item.is_active,
          is_visible: item.is_visible,
          sort_order: item.sort_order,
          created_at: item.created_at,
          updated_at: item.updated_at,
        }));
        setArtists(mapped);
      }
    } catch (e: any) {
      console.error('Error fetching artists from Supabase:', e);
      setError(e.message || 'ไม่สามารถโหลดข้อมูลช่างได้');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadArtists();
  }, [loadArtists]);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusDropdownOpen(false);
      }
      if (
        specialtyDropdownRef.current &&
        !specialtyDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSpecialtyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Extract unique specialties from current artists for filtering
  const uniqueSpecialties = useMemo(() => {
    const set = new Set<string>();
    artists.forEach((a) => {
      (a.specialties || []).forEach((s) => set.add(s.trim()));
      if (a.specialty) {
        a.specialty.split('/').forEach((s) => set.add(s.trim()));
      }
    });
    return Array.from(set).filter(Boolean);
  }, [artists]);

  // Reset Add Form
  const resetAddForm = () => {
    setFormName('');
    setFormNickname('');
    setFormSlug('');
    setFormAvatarUrl('');
    setFormAvatarFile(null);
    setFormAvatarPreview('');
    setFormBio('');
    setFormSpecialties([]);
    setCustomSpecialtyInput('');
    setFormWorkingDays([]);
    setFormStatus('AVAILABLE');
    setFormIsActive(true);
    setFormIsVisible(true);
    setFormSortOrder((artists.length + 1) * 10);
    setFormError(null);
  };

  // Open Add Drawer
  const handleOpenAddDrawer = () => {
    resetAddForm();
    setIsAddDrawerOpen(true);
  };

  // Populate Edit Form
  const handleOpenEdit = (artist: Artist) => {
    setFormName(artist.name || '');
    setFormNickname(artist.nickname || '');
    setFormSlug(artist.slug || '');
    const initialAvatar = artist.avatar_url || artist.avatar || '';
    setFormAvatarUrl(initialAvatar);
    setFormAvatarFile(null);
    setFormAvatarPreview(initialAvatar);
    setFormBio(artist.bio || '');
    const loadedSpecs = artist.specialties && artist.specialties.length > 0
      ? artist.specialties
      : (artist.specialty ? artist.specialty.split('/').map((s: string) => s.trim()) : []);
    setFormSpecialties(loadedSpecs);
    setCustomSpecialtyInput('');
    const loadedDays = artist.working_days || artist.availability || [];
    setFormWorkingDays(loadedDays);
    setFormStatus(normalizeStatus(artist.status));
    setFormIsActive(artist.is_active !== undefined ? artist.is_active : true);
    setFormIsVisible(artist.is_visible !== undefined ? artist.is_visible : true);
    setFormSortOrder(artist.sort_order ?? 0);
    setFormError(null);
    setIsEditMode(true);
  };

  // Toggle Specialty Tag in Form
  const handleToggleSpecialty = (spec: string) => {
    if (formSpecialties.includes(spec)) {
      setFormSpecialties(formSpecialties.filter((s) => s !== spec));
    } else {
      setFormSpecialties([...formSpecialties, spec]);
    }
  };

  // Add Custom Specialty Tag
  const handleAddCustomSpecialty = () => {
    const trimmed = customSpecialtyInput.trim();
    if (trimmed && !formSpecialties.includes(trimmed)) {
      setFormSpecialties([...formSpecialties, trimmed]);
      setCustomSpecialtyInput('');
    }
  };

  // Toggle Working Day in Form
  const handleToggleWorkingDay = (dayKey: string) => {
    if (formWorkingDays.includes(dayKey)) {
      setFormWorkingDays(formWorkingDays.filter((d) => d !== dayKey));
    } else {
      setFormWorkingDays([...formWorkingDays, dayKey]);
    }
  };

  // INSERT Real Artist to Supabase
  const handleSaveNewArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('กรุณากรอกชื่อช่างสัก');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    // Auto-generate clean, unique slug from nickname or name
    const rawName = (formNickname.trim() || formName.trim()).toLowerCase();
    const cleanSlugBase = rawName
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'artist';
    const uniqueSuffix = Date.now().toString(36);
    const generatedSlug = `${cleanSlugBase}-${uniqueSuffix}`;

    try {
      // =========================================================================
      // 1. VERIFY ACTUAL SESSION AT SAVE TIME
      // =========================================================================
      console.log('[ARTIST-SAVE 01] save started (insert)');
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      const sessionExists = !!session;
      const userExists = !!session?.user;
      console.log('[ARTIST-SAVE 02] session exists:', sessionExists);
      console.log('[ARTIST-SAVE 03] user exists:', userExists);

      if (!session || !session.user) {
        console.warn('[ARTIST-SAVE 04] session missing or expired');
        setFormError('เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/staff/login';
          }
        }, 1500);
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('user_id', session.user.id)
        .single();

      const role = prof?.role;
      const isActive = prof?.is_active !== false;
      console.log('[ARTIST-SAVE 04] profile role resolved:', role);

      if (!prof || role !== 'admin' || !isActive) {
        console.warn('[ARTIST-SAVE 04] profile unauthorized or inactive:', role);
        setFormError('เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/staff/login';
          }
        }, 1500);
        return;
      }

      const finalAvatarUrl = await uploadAvatarIfPending(formAvatarFile, formAvatarUrl);

      const nextSortOrder = (artists.length + 1) * 10;

      const payload: any = {
        name: formName.trim(),
        nickname: formNickname.trim() || null,
        slug: generatedSlug,
        avatar_url: finalAvatarUrl || null,
        bio: formBio.trim() || null,
        specialties: formSpecialties,
        working_days: formWorkingDays,
        status: formStatus,
        is_active: formIsActive,
        is_visible: formIsVisible,
        sort_order: nextSortOrder,
      };

      console.log('[ARTIST-SAVE 05] before artists insert');
      const { data, error: insertErr } = await supabase
        .from('artists')
        .insert(payload)
        .select()
        .single();
      console.log('[ARTIST-SAVE 06] artists insert returned. Success:', !insertErr, 'Error:', insertErr ? insertErr.message : 'none');

      if (insertErr) {
        throw insertErr;
      }

      setIsAddDrawerOpen(false);
      await loadArtists();
    } catch (err: any) {
      console.error('Error inserting artist:', err);
      setFormError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลช่างสัก');
    } finally {
      setIsSubmitting(false);
    }
  };

  // UPDATE Real Artist in Supabase
  const handleUpdateArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArtist) return;
    if (!formName.trim()) {
      setFormError('กรุณากรอกชื่อช่างสัก');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    // For Edit Artist: DO NOT change existing slug unless missing
    const existingSlug = selectedArtist.slug || formSlug || (formNickname.trim() || formName.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    try {
      // =========================================================================
      // 1. VERIFY ACTUAL SESSION AT SAVE TIME
      // =========================================================================
      console.log('[ARTIST-SAVE 01] save started (update)');
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      const sessionExists = !!session;
      const userExists = !!session?.user;
      console.log('[ARTIST-SAVE 02] session exists:', sessionExists);
      console.log('[ARTIST-SAVE 03] user exists:', userExists);

      if (!session || !session.user) {
        console.warn('[ARTIST-SAVE 04] session missing or expired');
        setFormError('เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/staff/login';
          }
        }, 1500);
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('user_id', session.user.id)
        .single();

      const role = prof?.role;
      const isActive = prof?.is_active !== false;
      console.log('[ARTIST-SAVE 04] profile role resolved:', role);

      if (!prof || role !== 'admin' || !isActive) {
        console.warn('[ARTIST-SAVE 04] profile unauthorized or inactive:', role);
        setFormError('เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/staff/login';
          }
        }, 1500);
        return;
      }

      const finalAvatarUrl = await uploadAvatarIfPending(formAvatarFile, formAvatarUrl);

      const payload: any = {
        name: formName.trim(),
        nickname: formNickname.trim() || null,
        slug: existingSlug || null,
        avatar_url: finalAvatarUrl || null,
        bio: formBio.trim() || null,
        specialties: formSpecialties,
        working_days: formWorkingDays,
        status: formStatus,
        is_active: formIsActive,
        is_visible: formIsVisible,
        sort_order: selectedArtist.sort_order ?? formSortOrder ?? 0,
      };

      console.log('[ARTIST-SAVE 05] before artists update');
      const { data, error: updateErr } = await supabase
        .from('artists')
        .update(payload)
        .eq('id', selectedArtist.id)
        .select()
        .single();
      console.log('[ARTIST-SAVE 06] artists update returned. Success:', !updateErr, 'Error:', updateErr ? updateErr.message : 'none');

      if (updateErr) {
        throw updateErr;
      }

      setIsEditMode(false);
      setSelectedArtist(null);
      await loadArtists();
    } catch (err: any) {
      console.error('Error updating artist:', err);
      setFormError(err.message || 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลช่างสัก');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Quick Status Change
  const handleQuickStatusChange = async (artistId: string, newStatus: 'AVAILABLE' | 'TATTOOING' | 'BREAK' | 'OFF_DUTY') => {
    // Optimistic local state update
    setArtists((prev) =>
      prev.map((a) => (a.id === artistId ? { ...a, status: newStatus } : a))
    );
    if (selectedArtist && selectedArtist.id === artistId) {
      setSelectedArtist((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    try {
      await supabase
        .from('artists')
        .update({ status: newStatus })
        .eq('id', artistId);
    } catch (err) {
      console.error('Failed to update status:', err);
      loadArtists();
    }
  };

  // Direct Toggle Visibility
  const handleToggleVisibility = async (artist: Artist) => {
    const nextVal = !artist.is_visible;
    setArtists((prev) =>
      prev.map((a) => (a.id === artist.id ? { ...a, is_visible: nextVal } : a))
    );
    if (selectedArtist && selectedArtist.id === artist.id) {
      setSelectedArtist((prev) => (prev ? { ...prev, is_visible: nextVal } : null));
    }

    try {
      await supabase
        .from('artists')
        .update({ is_visible: nextVal })
        .eq('id', artist.id);
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
      loadArtists();
    }
  };

  // Direct Toggle Active
  const handleToggleActive = async (artist: Artist) => {
    const nextVal = !artist.is_active;
    setArtists((prev) =>
      prev.map((a) => (a.id === artist.id ? { ...a, is_active: nextVal } : a))
    );
    if (selectedArtist && selectedArtist.id === artist.id) {
      setSelectedArtist((prev) => (prev ? { ...prev, is_active: nextVal } : null));
    }

    try {
      await supabase
        .from('artists')
        .update({ is_active: nextVal })
        .eq('id', artist.id);
    } catch (err) {
      console.error('Failed to toggle active:', err);
      loadArtists();
    }
  };

  // DELETE Artist
  const handleConfirmDelete = async () => {
    if (!deleteConfirmArtist) return;
    setIsSubmitting(true);

    try {
      const { error: delErr } = await supabase
        .from('artists')
        .delete()
        .eq('id', deleteConfirmArtist.id);

      if (delErr) {
        throw delErr;
      }

      setDeleteConfirmArtist(null);
      setSelectedArtist(null);
      setIsEditMode(false);
      await loadArtists();
    } catch (err: any) {
      console.error('Error deleting artist:', err);
      alert(err.message || 'ไม่สามารถลบช่างได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered & Sorted Artists
  const filteredArtists = useMemo(() => {
    return artists
      .filter((artist) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          artist.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (artist.nickname && artist.nickname.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (artist.specialties && artist.specialties.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))) ||
          artist.bio.toLowerCase().includes(searchQuery.toLowerCase());

        const normStat = normalizeStatus(artist.status);
        const matchesStatus =
          selectedStatusFilter === 'ALL' || normStat === selectedStatusFilter;

        const matchesSpecialty =
          selectedSpecialtyFilter === 'ALL' ||
          (artist.specialties && artist.specialties.includes(selectedSpecialtyFilter)) ||
          artist.specialty.toLowerCase().includes(selectedSpecialtyFilter.toLowerCase());

        return matchesSearch && matchesStatus && matchesSpecialty;
      })
      .sort((a, b) => {
        if (sortOrder === 'sort_order') {
          return (a.sort_order || 0) - (b.sort_order || 0);
        }
        if (sortOrder === 'status') {
          return normalizeStatus(a.status).localeCompare(normalizeStatus(b.status));
        }
        return a.name.localeCompare(b.name, 'th');
      });
  }, [artists, searchQuery, selectedStatusFilter, selectedSpecialtyFilter, sortOrder]);

  return (
    <div className="space-y-6 font-prompt text-[#ECE4D3] pb-24 md:pb-12">
      {/* 1. TOP PAGE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#4A443A] pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <Palette size={12} className="text-[#9C2F2F]" />
            <span>ARTISTS MASTER DATA • จัดการช่างสักประจำร้าน</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            ช่างสักประจำร้าน
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5 font-light">
            เพิ่ม แก้ไข และกำหนดสถานะการทำงานของช่างสักในร้าน 157 TATTOO
          </p>
        </div>

        {/* Right Actions: Total Count & Add Artist Button */}
        <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-end">
          <div className="px-3.5 py-2 bg-[#171512] border border-[#4A443A] rounded-[6px] flex items-center space-x-2">
            <User size={14} className="text-[#9C2F2F]" />
            <span className="text-xs font-semibold text-[#ECE4D3] font-mono">
              {artists.length} ARTISTS
            </span>
          </div>

          <button
            type="button"
            onClick={handleOpenAddDrawer}
            className="h-[38px] px-4 bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] rounded-[6px] text-xs font-semibold tracking-wide transition-all shadow-md flex items-center space-x-1.5 active:scale-95"
          >
            <Plus size={15} />
            <span>เพิ่มช่างสัก</span>
          </button>
        </div>
      </div>

      {/* 2. TOOLBAR (SEARCH + FILTERS + SORT) */}
      <div className="bg-[#171512] border border-[#4A443A] p-3 rounded-[8px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 shadow-md">
        {/* Search Box */}
        <div className="relative w-full sm:w-80">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาช่างหรือสไตล์..."
            className="w-full h-[38px] pl-9 pr-8 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] focus:border-[#9C2F2F] rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7265] hover:text-[#ECE4D3]"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Custom Status Filter */}
          <div ref={statusDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#9C2F2F]" />
              <span>
                {selectedStatusFilter === 'ALL' && 'สถานะทั้งหมด'}
                {selectedStatusFilter === 'AVAILABLE' && 'ว่าง'}
                {selectedStatusFilter === 'TATTOOING' && 'กำลังสัก'}
                {selectedStatusFilter === 'BREAK' && 'พัก'}
                {selectedStatusFilter === 'OFF_DUTY' && 'หยุด'}
              </span>
              <ChevronDown size={13} className="text-[#7A7265]" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 w-[160px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                {[
                  { id: 'ALL', label: 'สถานะทั้งหมด' },
                  { id: 'AVAILABLE', label: '● ว่าง' },
                  { id: 'TATTOOING', label: '● กำลังสัก' },
                  { id: 'BREAK', label: '● พัก' },
                  { id: 'OFF_DUTY', label: '● หยุด' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedStatusFilter(item.id);
                      setIsStatusDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedStatusFilter === item.id
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {selectedStatusFilter === item.id && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom Specialty Filter */}
          {uniqueSpecialties.length > 0 && (
            <div ref={specialtyDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsSpecialtyDropdownOpen((prev) => !prev)}
                className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
              >
                <Palette size={13} className="text-[#9C2F2F]" />
                <span className="truncate max-w-[120px]">
                  {selectedSpecialtyFilter === 'ALL'
                    ? 'สไตล์ทั้งหมด'
                    : selectedSpecialtyFilter}
                </span>
                <ChevronDown size={13} className="text-[#7A7265]" />
              </button>

              {isSpecialtyDropdownOpen && (
                <div className="absolute top-full mt-1 right-0 z-50 w-[180px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSpecialtyFilter('ALL');
                      setIsSpecialtyDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedSpecialtyFilter === 'ALL'
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span>สไตล์ทั้งหมด</span>
                    {selectedSpecialtyFilter === 'ALL' && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                  {uniqueSpecialties.map((spec) => (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => {
                        setSelectedSpecialtyFilter(spec);
                        setIsSpecialtyDropdownOpen(false);
                      }}
                      className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                        selectedSpecialtyFilter === spec
                          ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                          : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                      }`}
                    >
                      <span>{spec}</span>
                      {selectedSpecialtyFilter === spec && (
                        <Check size={13} className="text-[#9C2F2F]" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sort Toggle */}
          <button
            type="button"
            onClick={() =>
              setSortOrder((prev) =>
                prev === 'sort_order' ? 'name' : prev === 'name' ? 'status' : 'sort_order'
              )
            }
            className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-1.5 transition-colors"
            title="เรียงตาม"
          >
            <ArrowUpDown size={12} className="text-[#9C2F2F]" />
            <span>
              {sortOrder === 'sort_order'
                ? 'ลำดับ'
                : sortOrder === 'name'
                ? 'ชื่อช่าง'
                : 'สถานะ'}
            </span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={loadArtists}
            disabled={loading}
            className="h-[38px] w-[38px] bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] flex items-center justify-center text-[#A89F91] hover:text-[#ECE4D3] transition-colors"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 3. LOADING STATE */}
      {loading && artists.length === 0 && (
        <div className="py-24 text-center space-y-3 bg-[#171512] border border-[#4A443A] rounded-[8px]">
          <Loader2 size={24} className="text-[#9C2F2F] animate-spin mx-auto" />
          <p className="text-xs text-[#A89F91]">กำลังโหลดข้อมูลช่างสักจากฐานข้อมูล...</p>
        </div>
      )}

      {/* 4. ERROR STATE */}
      {error && !loading && (
        <div className="p-6 bg-[#9C2F2F]/10 border border-[#9C2F2F]/40 rounded-[8px] text-center space-y-2">
          <AlertCircle size={20} className="text-[#9C2F2F] mx-auto" />
          <p className="text-xs text-[#ECE4D3] font-medium">{error}</p>
          <button
            onClick={loadArtists}
            className="px-4 py-1.5 bg-[#9C2F2F] text-[#ECE4D3] rounded text-xs font-semibold hover:bg-[#802222] transition-colors"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      )}

      {/* 5. EMPTY STATE (When Database has 0 Artists) */}
      {!loading && !error && artists.length === 0 && (
        <div className="py-20 px-6 text-center space-y-4 bg-[#171512] border border-[#4A443A] rounded-[8px] shadow-lg animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center mx-auto text-[#7A7265]">
            <Users size={28} className="text-[#9C2F2F]" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-xl font-heading font-normal text-[#ECE4D3]">
              ยังไม่มีช่างสักในระบบ
            </h3>
            <p className="text-xs text-[#A89F91] leading-relaxed font-light">
              เริ่มต้นด้วยการเพิ่มช่างสักประจำร้าน เพื่อให้ข้อมูลแสดงในระบบหลังบ้านและหน้าเว็บไซต์สำหรับลูกค้า
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAddDrawer}
            className="h-10 px-5 bg-[#9C2F2F] hover:bg-[#802222] text-[#ECE4D3] rounded-[6px] text-xs font-semibold tracking-wide transition-all shadow-lg inline-flex items-center space-x-2 active:scale-95"
          >
            <Plus size={16} />
            <span>เพิ่มช่างสักคนแรก</span>
          </button>
        </div>
      )}

      {/* 6. DESKTOP ARTIST PROFILE CARDS GRID */}
      {!loading && artists.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredArtists.length === 0 ? (
            <div className="col-span-full py-16 text-center text-xs text-[#7A7265] bg-[#171512] border border-[#4A443A] rounded-[8px]">
              ไม่พบช่างสักที่ตรงกับการค้นหา
            </div>
          ) : (
            filteredArtists.map((artist) => {
              const normStatus = normalizeStatus(artist.status);
              const statusInfo = STATUS_CONFIG[normStatus] || STATUS_CONFIG.AVAILABLE;

              return (
                <div
                  key={artist.id}
                  onClick={() => {
                    setSelectedArtist(artist);
                    setIsEditMode(false);
                  }}
                  className={`bg-[#171512] border rounded-[8px] overflow-hidden flex flex-col justify-between transition-all duration-200 cursor-pointer group shadow-lg ${
                    artist.is_active === false
                      ? 'border-[#4A443A]/40 opacity-60'
                      : 'border-[#4A443A] hover:border-[#9C2F2F]'
                  }`}
                >
                  {/* Top: Portrait */}
                  <div className="relative h-64 overflow-hidden bg-[#0E0D0C]">
                    <img
                      src={artist.avatar_url || artist.avatar}
                      alt={artist.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#171512] via-transparent to-black/20" />

                    {/* Top Left Badges: Visibility / Active */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      {artist.is_visible === false && (
                        <span className="px-2 py-0.5 rounded bg-black/80 border border-amber-500/40 text-amber-300 text-[9px] font-medium flex items-center gap-1">
                          <EyeOff size={10} />
                          <span>ซ่อนหน้าเว็บ</span>
                        </span>
                      )}
                      {artist.is_active === false && (
                        <span className="px-2 py-0.5 rounded bg-black/80 border border-[#9C2F2F]/40 text-[#9C2F2F] text-[9px] font-medium flex items-center gap-1">
                          <Power size={10} />
                          <span>ปิดใช้งาน</span>
                        </span>
                      )}
                    </div>

                    {/* Top Right: Status Badge */}
                    <div
                      className="absolute top-3 right-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="bg-[#0E0D0C]/90 border border-[#4A443A] px-2.5 py-1 rounded-[4px] flex items-center space-x-1.5 shadow">
                        <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                        <span className="text-[10px] text-[#ECE4D3] font-medium">
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>

                    {/* Specialties Tags Bottom Left */}
                    <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
                      {(artist.specialties && artist.specialties.length > 0
                        ? artist.specialties
                        : artist.specialty ? artist.specialty.split('/') : []
                      ).map((style) => (
                        <span
                          key={style}
                          className="px-2 py-0.5 rounded bg-[#0E0D0C]/90 border border-[#4A443A] text-[#ECE4D3] text-[10px] font-heading tracking-wider"
                        >
                          {style.trim()}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <h3 className="text-xl font-heading font-normal text-[#ECE4D3] group-hover:text-white transition-colors truncate">
                          {artist.name}
                        </h3>
                        {artist.nickname && (
                          <span className="text-xs text-[#7A7265] font-mono">
                            ({artist.nickname})
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#A89F91] line-clamp-2 mt-1 font-light leading-relaxed">
                        {artist.bio || 'ยังไม่มีรายละเอียดประวัติช่าง'}
                      </p>
                    </div>

                    {/* Working Days Row */}
                    <div className="pt-2 border-t border-[#4A443A]/40 flex items-center justify-between text-xs text-[#7A7265]">
                      <span className="text-[10px]">วันทำงาน:</span>
                      <div className="flex gap-1 font-mono text-[10px] text-[#ECE4D3]">
                        {(artist.working_days || artist.availability || []).map((d) => (
                          <span key={d} className="px-1 py-0.5 bg-[#0E0D0C] border border-[#4A443A]/40 rounded">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions Button */}
                    <div className="pt-2 border-t border-[#4A443A]/40 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedArtist(artist);
                          handleOpenEdit(artist);
                        }}
                        className="flex-1 h-8 bg-[#0E0D0C] hover:bg-[#1f1b17] border border-[#4A443A] text-[#ECE4D3] rounded-[4px] text-xs font-semibold transition-colors flex items-center justify-center space-x-1"
                      >
                        <Edit3 size={12} className="text-[#A89F91]" />
                        <span>แก้ไข</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedArtist(artist);
                          setIsEditMode(false);
                        }}
                        className="h-8 px-3 bg-[#0E0D0C] hover:bg-[#9C2F2F] border border-[#4A443A] hover:border-[#9C2F2F] text-[#ECE4D3] rounded-[4px] text-xs font-semibold transition-colors flex items-center justify-center"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. ADD ARTIST DRAWER */}
      {/* ========================================================================= */}
      {isAddDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setIsAddDrawerOpen(false)} />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 shadow-2xl animate-slideLeft">
            <ArtistForm
              mode="create"
              formName={formName}
              setFormName={setFormName}
              formNickname={formNickname}
              setFormNickname={setFormNickname}
              formAvatarPreview={formAvatarPreview}
              setFormAvatarPreview={setFormAvatarPreview}
              setFormAvatarFile={setFormAvatarFile}
              setFormAvatarUrl={setFormAvatarUrl}
              formBio={formBio}
              setFormBio={setFormBio}
              formSpecialties={formSpecialties}
              setFormSpecialties={setFormSpecialties}
              handleToggleSpecialty={handleToggleSpecialty}
              customSpecialtyInput={customSpecialtyInput}
              setCustomSpecialtyInput={setCustomSpecialtyInput}
              handleAddCustomSpecialty={handleAddCustomSpecialty}
              formWorkingDays={formWorkingDays}
              handleToggleWorkingDay={handleToggleWorkingDay}
              formStatus={formStatus}
              setFormStatus={setFormStatus}
              formIsVisible={formIsVisible}
              setFormIsVisible={setFormIsVisible}
              formIsActive={formIsActive}
              setFormIsActive={setFormIsActive}
              formError={formError}
              isSubmitting={isSubmitting}
              isAuthValid={isAuthValid}
              onSubmit={handleSaveNewArtist}
              onCancel={() => setIsAddDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. ARTIST DETAIL / EDIT DRAWER */}
      {/* ========================================================================= */}
      {selectedArtist && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div
            className="absolute inset-0"
            onClick={() => {
              setSelectedArtist(null);
              setIsEditMode(false);
            }}
          />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 shadow-2xl animate-slideLeft">
            {!isEditMode ? (
              /* VIEW MODE */
              <div className="space-y-5 flex-1 flex flex-col justify-between">
                <div>
                  {/* Drawer Header */}
                  <div className="flex justify-between items-center border-b border-[#4A443A]/60 pb-4 mb-4">
                    <div className="flex items-center space-x-2">
                      <Sparkles size={16} className="text-[#9C2F2F]" />
                      <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                        ARTIST DETAILS • ข้อมูลช่างสัก
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedArtist(null)}
                      className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Profile Header Block */}
                  <div className="flex items-start space-x-4 pb-4 border-b border-[#4A443A]/40">
                    <div className="w-24 h-28 rounded-[6px] overflow-hidden bg-[#0E0D0C] border border-[#4A443A] shrink-0">
                      <img
                        src={selectedArtist.avatar_url || selectedArtist.avatar}
                        alt={selectedArtist.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-heading font-normal tracking-wide text-[#ECE4D3] truncate">
                          {selectedArtist.name}
                        </h2>
                      </div>
                      {selectedArtist.nickname && (
                        <p className="text-xs text-[#7A7265] font-mono">
                          ชื่อเล่น: {selectedArtist.nickname}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {(selectedArtist.specialties && selectedArtist.specialties.length > 0
                          ? selectedArtist.specialties
                          : selectedArtist.specialty ? selectedArtist.specialty.split('/') : []
                        ).map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded bg-[#0E0D0C] border border-[#4A443A] text-[#ECE4D3] text-[10px] font-heading tracking-wider"
                          >
                            {s.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Status & Toggles Controls */}
                  <div className="py-4 space-y-3 border-b border-[#4A443A]/40 text-xs">
                    <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                      สถานะและการแสดงผล:
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Status Selector */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-[#A89F91]">เปลี่ยนสถานะ:</label>
                        <select
                          value={normalizeStatus(selectedArtist.status)}
                          onChange={(e) => handleQuickStatusChange(selectedArtist.id, e.target.value as any)}
                          className="w-full h-8 px-2.5 bg-[#0E0D0C] border border-[#4A443A] focus:border-[#9C2F2F] rounded text-xs text-[#ECE4D3] outline-none"
                        >
                          <option value="AVAILABLE">🟢 ว่าง (Available)</option>
                          <option value="TATTOOING">🔴 กำลังสัก (Tattooing)</option>
                          <option value="BREAK">🟡 พัก (Break)</option>
                          <option value="OFF_DUTY">⚪ หยุด (Off Duty)</option>
                        </select>
                      </div>

                      {/* Visibility Quick Toggle */}
                      <div className="space-y-1">
                        <label className="text-[10px] text-[#A89F91]">การแสดงผล:</label>
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(selectedArtist)}
                          className={`w-full h-8 px-2.5 rounded border text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors ${
                            selectedArtist.is_visible !== false
                              ? 'bg-[#0E0D0C] border-emerald-800/80 text-emerald-400'
                              : 'bg-[#0E0D0C] border-amber-800/80 text-amber-300'
                          }`}
                        >
                          {selectedArtist.is_visible !== false ? <Eye size={12} /> : <EyeOff size={12} />}
                          <span>{selectedArtist.is_visible !== false ? 'แสดงหน้าเว็บ' : 'ซ่อนจากหน้าเว็บ'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bio & Details */}
                  <div className="py-4 space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block mb-1">
                        ประวัติและรายละเอียด:
                      </span>
                      <p className="text-xs text-[#A89F91] leading-relaxed font-light bg-[#0E0D0C] p-3 rounded border border-[#4A443A]/40">
                        {selectedArtist.bio || 'ยังไม่มีข้อมูลประวัติ'}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block mb-1">
                        วันปฏิบัติงาน:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                          const isAvail = (selectedArtist.working_days || selectedArtist.availability || []).includes(day);
                          return (
                            <span
                              key={day}
                              className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                                isAvail
                                  ? 'bg-[#9C2F2F]/20 border border-[#9C2F2F] text-[#ECE4D3]'
                                  : 'bg-[#0E0D0C] border border-[#4A443A]/30 text-[#7A7265]'
                              }`}
                            >
                              {day}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* View Mode Footer Actions */}
                <div className="pt-4 border-t border-[#4A443A]/60 space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(selectedArtist)}
                      className="flex-1 h-10 bg-[#0E0D0C] hover:bg-[#1f1b17] border border-[#4A443A] text-[#ECE4D3] rounded text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <Edit3 size={14} className="text-[#A89F91]" />
                      <span>แก้ไขข้อมูลช่างสัก</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(selectedArtist)}
                      className={`h-10 px-4 rounded border text-xs font-medium flex items-center space-x-1.5 transition-colors ${
                        selectedArtist.is_active !== false
                          ? 'bg-[#0E0D0C] border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3]'
                          : 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#9C2F2F]'
                      }`}
                    >
                      <Power size={13} />
                      <span>{selectedArtist.is_active !== false ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</span>
                    </button>
                  </div>

                  {/* Secondary Dangerous Delete Action */}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmArtist(selectedArtist)}
                    className="w-full h-8 text-[11px] text-[#7A7265] hover:text-[#9C2F2F] transition-colors text-center"
                  >
                    ลบช่างคนนี้ออกจากระบบ...
                  </button>
                </div>
              </div>
            ) : (
              /* EDIT MODE FORM */
              <ArtistForm
                mode="edit"
                artistName={selectedArtist.name}
                formName={formName}
                setFormName={setFormName}
                formNickname={formNickname}
                setFormNickname={setFormNickname}
                formAvatarPreview={formAvatarPreview}
                setFormAvatarPreview={setFormAvatarPreview}
                setFormAvatarFile={setFormAvatarFile}
                setFormAvatarUrl={setFormAvatarUrl}
                formBio={formBio}
                setFormBio={setFormBio}
                formSpecialties={formSpecialties}
                setFormSpecialties={setFormSpecialties}
                handleToggleSpecialty={handleToggleSpecialty}
                customSpecialtyInput={customSpecialtyInput}
                setCustomSpecialtyInput={setCustomSpecialtyInput}
                handleAddCustomSpecialty={handleAddCustomSpecialty}
                formWorkingDays={formWorkingDays}
                handleToggleWorkingDay={handleToggleWorkingDay}
                formStatus={formStatus}
                setFormStatus={setFormStatus}
                formIsVisible={formIsVisible}
                setFormIsVisible={setFormIsVisible}
                formIsActive={formIsActive}
                setFormIsActive={setFormIsActive}
                formError={formError}
                isSubmitting={isSubmitting}
                isAuthValid={isAuthValid}
                onSubmit={handleUpdateArtist}
                onCancel={() => setIsEditMode(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. CUSTOM DELETE CONFIRMATION MODAL (No window.confirm) */}
      {/* ========================================================================= */}
      {deleteConfirmArtist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm font-prompt animate-fadeIn">
          <div className="w-full max-w-md bg-[#171512] border border-[#9C2F2F]/60 rounded-[8px] p-6 space-y-4 shadow-2xl animate-scaleUp">
            <div className="w-12 h-12 rounded-full bg-[#9C2F2F]/20 border border-[#9C2F2F] flex items-center justify-center text-[#9C2F2F] mx-auto">
              <Trash2 size={20} />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-heading text-[#ECE4D3]">
                ลบช่างสัก {deleteConfirmArtist.name} ออกจากระบบ?
              </h3>
              <p className="text-xs text-[#A89F91] leading-relaxed font-light">
                การลบช่างสักจะลบข้อมูลออกจากฐานข้อมูลอย่างถาวร หากช่างมีประวัติคิวงานในอนาคต แนะนำให้ใช้ <strong className="text-[#ECE4D3]">&quot;ปิดใช้งาน&quot;</strong> แทนการลบเพื่อรักษาประวัติข้อมูล
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmArtist(null)}
                disabled={isSubmitting}
                className="flex-1 h-10 bg-[#0E0D0C] hover:bg-[#1a1714] border border-[#4A443A] text-[#ECE4D3] rounded text-xs font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="flex-1 h-10 bg-[#9C2F2F] hover:bg-[#802222] text-white rounded text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5 shadow"
              >
                {isSubmitting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>ยืนยันการลบ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
