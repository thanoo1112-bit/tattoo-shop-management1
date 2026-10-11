import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  Plus,
  Search,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Info,
  Check,
  Copy,
  UserPlus,
} from 'lucide-react';
import { CalendarArtist } from './types';
import { BlockedDateItem } from './AvailabilityBlockModal';
import { createClient } from '@/lib/supabase/client';
import { checkDateAvailability } from '@/lib/availabilityUtils';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import CustomDatePicker from './CustomDatePicker';

/**
 * Normalize Thai phone number: strips non-digits, converts +66/66 to 0
 */
function normalizeThaiPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('66') && digits.length === 11) {
    return '0' + digits.slice(2);
  }
  return digits;
}

/**
 * Maps atomic RPC error codes and messages to friendly Thai user messages
 */
function mapRpcError(errorMsg?: string, errorCode?: string): string {
  const combined = `${errorCode || ''} ${errorMsg || ''}`.toUpperCase();

  if (combined.includes('42501') || combined.includes('UNAUTHORIZED') || combined.includes('FORBIDDEN')) {
    return 'คุณไม่มีสิทธิ์สร้างคิวงาน';
  }
  if (combined.includes('INVALID_CUSTOMER_MODE')) {
    return 'รูปแบบลูกค้าไม่ถูกต้อง';
  }
  if (combined.includes('NAME_REQUIRED')) {
    return 'กรุณาระบุชื่อลูกค้า';
  }
  if (combined.includes('PHONE_REQUIRED')) {
    return 'กรุณาระบุเบอร์โทรศัพท์';
  }
  if (combined.includes('INVALID_PHONE')) {
    return 'กรุณาระบุเบอร์โทรศัพท์ให้ถูกต้อง';
  }
  if (combined.includes('DUPLICATE_EMAIL')) {
    return 'อีเมลนี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบข้อมูล';
  }
  if (combined.includes('DUPLICATE_CONFLICT')) {
    return 'เบอร์โทรและอีเมลตรงกับลูกค้าคนละราย กรุณาตรวจสอบข้อมูล';
  }
  if (combined.includes('CUSTOMER_NOT_FOUND')) {
    return 'ไม่พบข้อมูลลูกค้าที่เลือก';
  }
  if (combined.includes('ARTIST_NOT_FOUND')) {
    return 'ไม่พบข้อมูลช่าง';
  }
  if (combined.includes('INVALID_DATE') || combined.includes('STUDIO_DATE_BLOCKED') || combined.includes('ARTIST_DATE_BLOCKED')) {
    return 'กรุณาตรวจสอบวันที่นัดหมาย';
  }
  if (combined.includes('INVALID_TIME')) {
    return 'กรุณาตรวจสอบเวลานัดหมาย';
  }
  if (combined.includes('INVALID_PRICE')) {
    return 'กรุณาตรวจสอบราคาและเงินมัดจำ';
  }
  if (combined.includes('SESSION_CREATION_FAILED')) {
    return 'ไม่สามารถสร้างรอบนัดหมายได้';
  }
  if (combined.includes('23P01') || combined.includes('EXCLUSION') || combined.includes('NO_ARTIST_DOUBLE_BOOKING')) {
    return 'ช่างมีคิวงานในช่วงเวลานี้แล้ว กรุณาเลือกเวลาใหม่';
  }
  if (combined.includes('23505') || combined.includes('UNIQUE_VIOLATION')) {
    return 'มีข้อมูลซ้ำซ้อนในระบบ กรุณาตรวจสอบข้อมูลหรือเลือกเวลาใหม่';
  }
  if (combined.includes('23514') || combined.includes('CHECK_VIOLATION')) {
    return 'ข้อมูลไม่ตรงตามเงื่อนไขของระบบ กรุณาตรวจสอบข้อมูล';
  }

  return errorMsg || 'เกิดข้อผิดพลาดในการสร้างคิวงานใหม่';
}

interface ExistingCustomerItem {
  id: string;
  user_id: string | null;
  display_name: string;
  phone: string;
  email?: string;
}

interface CreateBookingModalProps {
  isOpen: boolean;
  selectedDateStr: string;
  artists: CalendarArtist[];
  blockedDates: BlockedDateItem[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (errorMessage: string) => void;
}

export default function CreateBookingModal({
  isOpen,
  selectedDateStr,
  artists,
  blockedDates,
  onClose,
  onSuccess,
  onError,
}: CreateBookingModalProps) {
  // Customer Mode: 'EXISTING' vs 'NEW'
  const [customerMode, setCustomerMode] = useState<'EXISTING' | 'NEW'>('EXISTING');

  // Existing Customer Search & Selection
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [existingCustomers, setExistingCustomers] = useState<ExistingCustomerItem[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ExistingCustomerItem | null>(null);

  // New Customer Form State
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>('');
  const [newCustomerEmail, setNewCustomerEmail] = useState<string>('');
  const [newCustomerDob, setNewCustomerDob] = useState<string>('');
  const [newCustomerErrors, setNewCustomerErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
  }>({});
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerNotice, setCustomerNotice] = useState<string | null>(null);

  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Booking & Session Details State
  const [artistId, setArtistId] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<string>(selectedDateStr || '');
  const [startTime, setStartTime] = useState<string>('13:00');
  const [placement, setPlacement] = useState<string>('ต้นแขน');
  const [style, setStyle] = useState<string>('ตามที่ช่างแนะนำ');
  const [quotedPrice, setQuotedPrice] = useState<string>('3000');
  const [depositPaidAmount, setDepositPaidAmount] = useState<string>('500');
  const [description, setDescription] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Switch Customer Mode with State Reset (Section 12)
  const handleSwitchMode = (mode: 'EXISTING' | 'NEW') => {
    setCustomerMode(mode);
    setCustomerError(null);
    setCustomerNotice(null);
    setFormError(null);
    if (mode === 'NEW') {
      setSelectedCustomer(null);
      setCustomerSearchQuery('');
    } else {
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
      setNewCustomerDob('');
      setNewCustomerErrors({});
    }
  };

  // Close Modal with Complete State Reset (Section 12)
  const handleClose = () => {
    setCustomerMode('EXISTING');
    setSelectedCustomer(null);
    setCustomerSearchQuery('');
    setNewCustomerName('');
    setNewCustomerPhone('');
    setNewCustomerEmail('');
    setNewCustomerDob('');
    setNewCustomerErrors({});
    setCustomerError(null);
    setCustomerNotice(null);
    setFormError(null);
    onClose();
  };

  const selectedArtistObj = useMemo(() => {
    return artists.find((a) => a.id === artistId) || null;
  }, [artists, artistId]);

  const availableStyles = useMemo(() => {
    if (!selectedArtistObj) return ['ตามที่ช่างแนะนำ'];
    const raw = selectedArtistObj.specialties || selectedArtistObj.styles || [];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw;
    }
    return ['Fine Line', 'Black & Grey', 'Minimal', 'Color Tattoo', 'Old School', 'Realism', 'ตามที่ช่างแนะนำ'];
  }, [selectedArtistObj]);

  const handleCopyBookingLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const bookingUrl = `${origin}/booking`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(bookingUrl);
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // Update style when artist changes or availableStyles update
  useEffect(() => {
    if (availableStyles.length > 0) {
      if (!style || !availableStyles.includes(style)) {
        setStyle(availableStyles[0]);
      }
    } else {
      setStyle('ตามที่ช่างแนะนำ');
    }
  }, [artistId, availableStyles]);

  // Initialize form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomerMode('EXISTING');
      setSelectedCustomer(null);
      setCustomerSearchQuery('');
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerEmail('');
      setNewCustomerDob('');
      setNewCustomerErrors({});
      setCustomerError(null);
      setCustomerNotice(null);
      setCopiedLink(false);
      setAppointmentDate(selectedDateStr || new Date().toISOString().split('T')[0]);
      setStartTime('13:00');
      setPlacement('ต้นแขน');
      setQuotedPrice('3000');
      setDepositPaidAmount('500');
      setDescription('');
      setFormError(null);

      if (artists.length > 0) {
        setArtistId(artists[0].id);
        const firstArtist = artists[0];
        const firstStyles = firstArtist.specialties || firstArtist.styles || [];
        setStyle(firstStyles.length > 0 ? firstStyles[0] : 'ตามที่ช่างแนะนำ');
      }
    }
  }, [isOpen, selectedDateStr, artists]);

  // Live Customer Search for Existing Customers
  useEffect(() => {
    if (!customerSearchQuery.trim()) {
      setExistingCustomers([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSearchingCustomers(true);
      try {
        const supabase = createClient();
        const q = customerSearchQuery.trim().toLowerCase();

        const { data } = await supabase
          .from('customers')
          .select('id, user_id, display_name, phone, email')
          .or(`display_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(10);

        if (isMounted && data) {
          setExistingCustomers(data as ExistingCustomerItem[]);
        }
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        if (isMounted) setIsSearchingCustomers(false);
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [customerSearchQuery]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCustomerError(null);
    setCustomerNotice(null);

    // 1. Customer Validation
    let cleanNewName = '';
    let cleanNewPhone = '';
    let cleanNewEmail: string | null = null;
    let cleanNewDob: string | null = null;

    if (customerMode === 'NEW') {
      const errors: { name?: string; phone?: string; email?: string } = {};
      cleanNewName = newCustomerName.trim();
      cleanNewPhone = normalizeThaiPhone(newCustomerPhone);
      cleanNewEmail = newCustomerEmail.trim() ? newCustomerEmail.trim().toLowerCase() : null;
      cleanNewDob = newCustomerDob || null;

      if (!cleanNewName) {
        errors.name = 'กรุณาระบุชื่อลูกค้า';
      }
      if (!cleanNewPhone) {
        errors.phone = 'กรุณาระบุเบอร์โทรศัพท์';
      } else if (!/^0[0-9]{9}$/.test(cleanNewPhone)) {
        errors.phone = 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (เช่น 0812345678)';
      }
      if (cleanNewEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanNewEmail)) {
          errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
        }
      }

      if (Object.keys(errors).length > 0) {
        setNewCustomerErrors(errors);
        setCustomerError('กรุณากรอกข้อมูลลูกค้าใหม่ให้ถูกต้อง');
        return;
      }
    } else {
      if (!selectedCustomer) {
        setCustomerError('กรุณาเลือกลูกค้าเดิมจากระบบ');
        setFormError('กรุณาเลือกลูกค้าเดิมจากระบบ');
        return;
      }
    }

    if (!artistId) {
      setFormError('กรุณาเลือกช่างสักประจำคิวงาน');
      return;
    }

    if (!style || !style.trim()) {
      setFormError('กรุณาเลือกสไตล์งานสัก');
      return;
    }

    if (!appointmentDate) {
      setFormError('กรุณาระบุวันที่นัดหมาย');
      return;
    }

    if (!startTime) {
      setFormError('กรุณาระบุเวลานัดลูกค้า');
      return;
    }

    // Date Availability Check
    const selectedArtist = artists.find((a) => a.id === artistId);
    const availCheck = checkDateAvailability(
      appointmentDate,
      artistId,
      blockedDates,
      selectedArtist?.nickname || selectedArtist?.name
    );

    if (availCheck.isBlocked) {
      setFormError(availCheck.errorMessage || 'ไม่สามารถเลือกวันที่นี้ได้ เนื่องจากร้านหรือช่างปิดรับคิว');
      return;
    }

    // Validate Price & Deposit (Synchronous form check)
    const priceNum = parseFloat(quotedPrice) || 0;
    const depositPaidNum = parseFloat(depositPaidAmount) || 0;

    if (priceNum < 0) {
      setFormError('ราคากลางงานสักต้องไม่น้อยกว่า 0');
      return;
    }

    if (depositPaidNum < 0) {
      setFormError('มัดจำที่รับแล้วต้องไม่น้อยกว่า 0');
      return;
    }

    if (depositPaidNum > priceNum) {
      setFormError('มัดจำที่รับแล้วต้องไม่มากกว่าราคางานสัก');
      return;
    }

    // Pre-check: Shop capacity max 1 booking per day across all artists
    const supabaseCheck = createClient();
    const dayStartIso = `${appointmentDate}T00:00:00+07:00`;
    const dayEndIso = `${appointmentDate}T23:59:59+07:00`;

    const { data: activeEst } = await supabaseCheck
      .from('estimate_requests')
      .select('id')
      .eq('preferred_date', appointmentDate)
      .not('status', 'in', '("CANCELLED","REJECTED","EXPIRED","COMPLETED")')
      .limit(1);

    if (activeEst && activeEst.length > 0) {
      setFormError('วันที่เลือกมีคิวงานของร้านแล้ว กรุณาเลือกวันอื่น');
      return;
    }

    const { data: existingSessions } = await supabaseCheck
      .from('booking_sessions')
      .select('id, status')
      .gte('start_at', dayStartIso)
      .lte('start_at', dayEndIso)
      .not('status', 'in', '("CANCELLED","COMPLETED")');

    if (existingSessions && existingSessions.length > 0) {
      setFormError('วันที่เลือกมีคิวงานของร้านแล้ว กรุณาเลือกวันอื่น');
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const payload = {
        p_customer_mode: customerMode,
        p_customer_id: customerMode === 'EXISTING' ? selectedCustomer?.id : null,
        p_display_name: customerMode === 'NEW' ? cleanNewName : null,
        p_phone: customerMode === 'NEW' ? cleanNewPhone : null,
        p_email: customerMode === 'NEW' && cleanNewEmail ? cleanNewEmail : null,
        p_date_of_birth: customerMode === 'NEW' ? cleanNewDob || null : null,
        p_artist_id: artistId,
        p_appointment_date: appointmentDate,
        p_start_time: startTime,
        p_end_time: null,
        p_placement: placement.trim() || 'ไม่ระบุ',
        p_style: style.trim(),
        p_description: description.trim() || null,
        p_quoted_price: priceNum,
        p_deposit_amount: depositPaidNum,
        p_payment_method: 'CASH',
      };

      console.log('[CreateBookingModal] Calling admin_create_direct_booking RPC...', payload);

      const { data, error } = await supabase.rpc('admin_create_direct_booking', payload);

      if (error) {
        console.error('[CreateBookingModal] RPC Error:', error);
        const mappedMsg = mapRpcError(error.message, error.code);
        if (
          customerMode === 'NEW' &&
          (error.message?.includes('DUPLICATE') ||
            error.message?.includes('PHONE') ||
            error.message?.includes('NAME'))
        ) {
          setCustomerError(mappedMsg);
        }
        setFormError(mappedMsg);
        return;
      }

      if (!data || data.success === false) {
        console.error('[CreateBookingModal] RPC returned unsuccessful:', data);
        const mappedMsg = mapRpcError(data?.message || '', data?.error_code);
        if (
          customerMode === 'NEW' &&
          (data?.error_code?.includes('DUPLICATE') ||
            data?.error_code?.includes('PHONE') ||
            data?.error_code?.includes('NAME'))
        ) {
          setCustomerError(mappedMsg);
        }
        setFormError(mappedMsg);
        return;
      }

      // Success handling (Section 6)
      if (data.is_duplicate_customer) {
        onSuccess('พบลูกค้าเดิมในระบบ และสร้างคิวงานเรียบร้อยแล้ว');
      } else {
        onSuccess('สร้างคิวงานเรียบร้อยแล้ว');
      }
      handleClose();
    } catch (err: any) {
      console.error('[CreateBookingModal] Unexpected error during submit flow:', err);
      const mappedMsg = mapRpcError(err.message, err.code);
      setFormError(mappedMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-prompt">
      <div className="bg-[#171512] border border-[#4A443A] rounded-xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-[#4A443A] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center text-emerald-400">
              <Plus size={18} />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-[#ECE4D3]">
                สร้างคิวงานใหม่ (Master Calendar)
              </h3>
              <p className="text-[11px] text-[#A89F91]">
                สร้างนัดหมายงานสักสำหรับลูกค้าเดิมหรือลูกค้าใหม่ (Walk-in)
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Error Alert */}
        {formError && (
          <div className="p-3 bg-red-950/70 border border-red-800/80 rounded-lg flex items-start gap-2 text-xs text-red-300 animate-fadeIn">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Section 1: Customer Selection (Segmented Tabs: Existing vs New Customer) */}
          <div className="space-y-3 bg-[#0E0D0C] p-3.5 rounded-lg border border-[#4A443A]/60">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <label className="text-xs font-semibold text-[#ECE4D3] flex items-center gap-1.5">
                <User size={14} className="text-amber-400" />
                <span>ลูกค้า <span className="text-red-400">*</span></span>
              </label>

              {/* Segmented Control */}
              <div className="inline-flex bg-[#171512] border border-[#4A443A] p-0.5 rounded-lg self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('EXISTING')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    customerMode === 'EXISTING'
                      ? 'bg-[#2A2620] text-[#ECE4D3] shadow-sm font-semibold border border-[#4A443A]'
                      : 'text-[#A89F91] hover:text-[#ECE4D3]'
                  }`}
                >
                  เลือกลูกค้าเดิม
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('NEW')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
                    customerMode === 'NEW'
                      ? 'bg-amber-500/20 text-amber-200 shadow-sm font-semibold border border-amber-500/40'
                      : 'text-[#A89F91] hover:text-[#ECE4D3]'
                  }`}
                >
                  <UserPlus size={12} />
                  <span>+ ลูกค้าใหม่</span>
                </button>
              </div>
            </div>

            {/* Customer Notice if duplicate phone resolved */}
            {customerNotice && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-md text-[11px] text-amber-200 flex items-center gap-1.5 animate-fadeIn">
                <Info size={13} className="text-amber-400 shrink-0" />
                <span>{customerNotice}</span>
              </div>
            )}

            {/* Customer Error (Duplicate Email, Conflict, etc.) */}
            {customerError && (
              <div className="p-2.5 bg-red-950/60 border border-red-800/80 rounded-md text-[11px] text-red-300 flex items-start gap-1.5 animate-fadeIn">
                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                <span>{customerError}</span>
              </div>
            )}

            {customerMode === 'EXISTING' ? (
              /* โหมด A: เลือกลูกค้าเดิม (Live Search 100%) */
              selectedCustomer ? (
                <div className="p-3 bg-[#171512] border border-amber-500/50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-amber-950 border border-amber-700 flex items-center justify-center text-amber-300 font-bold text-xs shrink-0">
                      {selectedCustomer.display_name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[#ECE4D3]">{selectedCustomer.display_name}</p>
                        {selectedCustomer.user_id ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono">
                            ผูกบัญชีแล้ว
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 text-[10px] font-mono">
                            ยังไม่ผูกบัญชีผู้ใช้
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#A89F91]">
                        เบอร์โทร: {formatThaiPhoneForDisplay(selectedCustomer.phone)}
                        {selectedCustomer.email && ` | ${selectedCustomer.email}`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="text-xs text-amber-400 hover:underline font-medium self-end sm:self-auto cursor-pointer"
                  >
                    เปลี่ยนลูกค้า
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]" />
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      placeholder="พิมพ์ชื่อ, เบอร์โทรศัพท์ หรืออีเมล เพื่อค้นหาลูกค้าเดิม..."
                      className="w-full pl-9 pr-3 py-2 bg-[#171512] border border-[#4A443A] focus:border-amber-400 rounded-lg text-xs text-[#ECE4D3] focus:outline-none"
                    />
                    {isSearchingCustomers && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400 animate-spin" />
                    )}
                  </div>

                  {existingCustomers.length > 0 && (
                    <div className="max-h-40 overflow-y-auto bg-[#171512] border border-[#4A443A] rounded-lg divide-y divide-[#4A443A]/40 text-xs">
                      {existingCustomers.map((cust) => {
                        const hasUserId = Boolean(cust.user_id);
                        return (
                          <div
                            key={cust.id}
                            onClick={() => {
                              setSelectedCustomer(cust);
                            }}
                            className="p-2.5 hover:bg-[#26231F] cursor-pointer flex items-center justify-between text-[#ECE4D3] transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{cust.display_name}</span>
                              {!hasUserId && (
                                <span className="text-[10px] text-red-400 bg-red-950/80 border border-red-900 px-1.5 py-0.5 rounded">
                                  ยังไม่ผูกบัญชี
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[#A89F91] font-mono">
                              {formatThaiPhoneForDisplay(cust.phone)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            ) : (
              /* โหมด B: ลูกค้าใหม่ (Walk-in) */
              <div className="space-y-3 pt-1 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                      ชื่อลูกค้า <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => {
                        setNewCustomerName(e.target.value);
                        setNewCustomerErrors((prev) => ({ ...prev, name: undefined }));
                        setCustomerError(null);
                      }}
                      placeholder="เช่น สมชาย ใจดี"
                      className={`w-full bg-[#171512] border rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none ${
                        newCustomerErrors.name ? 'border-red-500' : 'border-[#4A443A] focus:border-amber-400'
                      }`}
                    />
                    {newCustomerErrors.name && (
                      <p className="text-[10px] text-red-400 mt-0.5">{newCustomerErrors.name}</p>
                    )}
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                      เบอร์โทรศัพท์ <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={newCustomerPhone}
                      onChange={(e) => {
                        setNewCustomerPhone(e.target.value);
                        setNewCustomerErrors((prev) => ({ ...prev, phone: undefined }));
                        setCustomerError(null);
                      }}
                      placeholder="เช่น 0812345678"
                      className={`w-full bg-[#171512] border rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none ${
                        newCustomerErrors.phone ? 'border-red-500' : 'border-[#4A443A] focus:border-amber-400'
                      }`}
                    />
                    {newCustomerErrors.phone && (
                      <p className="text-[10px] text-red-400 mt-0.5">{newCustomerErrors.phone}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                      อีเมล <span className="text-[#7A7265] text-[10px]">(ไม่บังคับ)</span>
                    </label>
                    <input
                      type="email"
                      value={newCustomerEmail}
                      onChange={(e) => {
                        setNewCustomerEmail(e.target.value);
                        setNewCustomerErrors((prev) => ({ ...prev, email: undefined }));
                        setCustomerError(null);
                      }}
                      placeholder="customer@example.com"
                      className={`w-full bg-[#171512] border rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none ${
                        newCustomerErrors.email ? 'border-red-500' : 'border-[#4A443A] focus:border-amber-400'
                      }`}
                    />
                    {newCustomerErrors.email && (
                      <p className="text-[10px] text-red-400 mt-0.5">{newCustomerErrors.email}</p>
                    )}
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                      วันเดือนปีเกิด <span className="text-[#7A7265] text-[10px]">(ไม่บังคับ)</span>
                    </label>
                    <input
                      type="date"
                      value={newCustomerDob}
                      onChange={(e) => setNewCustomerDob(e.target.value)}
                      className="w-full bg-[#171512] border border-[#4A443A] focus:border-amber-400 rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none [color-scheme:dark] cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Appointment & Artist Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Artist Selection */}
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                เลือกช่างสัก <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={artistId}
                onChange={(e) => setArtistId(e.target.value)}
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-amber-400"
              >
                {artists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nickname ? `ช่าง${a.nickname}` : a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Appointment Date */}
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                วันที่นัดหมาย <span className="text-red-400">*</span>
              </label>
              <CustomDatePicker
                id="appointment-date-picker"
                value={appointmentDate}
                onChange={(val: string) => setAppointmentDate(val)}
                disabled={isSubmitting}
              />
            </div>

            {/* Appointment Start Time */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                เวลานัดลูกค้า <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-amber-400 [color-scheme:dark] cursor-pointer"
              />
            </div>

            {/* Placement */}
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                ตำแหน่งที่สัก
              </label>
              <input
                type="text"
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                placeholder="เช่น ต้นแขนขวา, แผ่นหลัง"
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-amber-400"
              />
            </div>

            {/* Tattoo Style */}
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                สไตล์งานสัก <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-amber-400"
              >
                {availableStyles.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Pricing Section: 3 Responsive Columns */}
            <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-[#4A443A]/40">
              {/* Quoted Price */}
              <div>
                <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                  ราคากลางงานสัก (บาท)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={quotedPrice}
                  onChange={(e) => setQuotedPrice(e.target.value)}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] font-semibold focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Deposit Paid Amount */}
              <div>
                <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                  มัดจำที่รับแล้ว (บาท)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={depositPaidAmount}
                  onChange={(e) => setDepositPaidAmount(e.target.value)}
                  className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] font-semibold focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Remaining Balance (Calculated Read-only) */}
              <div>
                <label className="block text-xs font-medium text-[#A89F91] mb-1">
                  ยอดคงเหลือ (บาท)
                </label>
                <input
                  type="text"
                  disabled
                  readOnly
                  value={Math.max((parseFloat(quotedPrice) || 0) - (parseFloat(depositPaidAmount) || 0), 0).toLocaleString()}
                  className="w-full bg-[#0E0D0C]/80 border border-[#4A443A]/60 rounded-lg px-3 py-2 text-xs text-amber-400 font-bold cursor-not-allowed opacity-90 select-none"
                />
              </div>
            </div>
          </div>

          {/* Description / Admin Note */}
          <div>
            <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
              รายละเอียดงาน / หมายเหตุร้าน
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุรายละเอียด เช่น ชนิดลายสัก, หมายเหตุการจอง"
              className="w-full p-2.5 bg-[#0E0D0C] border border-[#4A443A] rounded-lg text-xs text-[#ECE4D3] focus:outline-none focus:border-amber-400 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#4A443A]/60">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs text-[#A89F91] hover:text-[#ECE4D3] bg-[#0E0D0C] border border-[#4A443A] rounded-lg transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-stone-950 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>กำลังสร้างคิว...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>สร้างคิวงานใหม่</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
