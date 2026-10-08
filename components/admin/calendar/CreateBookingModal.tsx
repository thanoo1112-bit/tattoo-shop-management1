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
} from 'lucide-react';
import { CalendarArtist } from './types';
import { BlockedDateItem } from './AvailabilityBlockModal';
import { createClient } from '@/lib/supabase/client';
import { checkDateAvailability } from '@/lib/availabilityUtils';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import CustomDatePicker from './CustomDatePicker';
import { calculateBlockingEndTime } from '@/lib/utils/tattooDuration';

/**
 * Calculate default estimated end time based on tattoo size
 */
function calculateDefaultEndTime(startTimeStr: string, sizeCategory?: string): string {
  return calculateBlockingEndTime(startTimeStr, sizeCategory);
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
  // Existing Customer Search & Selection
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [existingCustomers, setExistingCustomers] = useState<ExistingCustomerItem[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ExistingCustomerItem | null>(null);

  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Booking & Session Details State
  const [artistId, setArtistId] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<string>(selectedDateStr || '');
  const [startTime, setStartTime] = useState<string>('13:00');
  const [endTime, setEndTime] = useState<string>('23:00');
  const [workType] = useState<string>('NEW_TATTOO');
  const [placement, setPlacement] = useState<string>('ต้นแขน');
  const [style, setStyle] = useState<string>('ตามที่ช่างแนะนำ');
  const [quotedPrice, setQuotedPrice] = useState<string>('3000');
  const [depositPaidAmount, setDepositPaidAmount] = useState<string>('500');
  const [description, setDescription] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      setSelectedCustomer(null);
      setCustomerSearchQuery('');
      setCopiedLink(false);
      setAppointmentDate(selectedDateStr || new Date().toISOString().split('T')[0]);
      setStartTime('13:00');
      setEndTime('16:00');
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

    // 1. Validation Checks
    if (!selectedCustomer) {
      setFormError('กรุณาเลือกลูกค้าเดิมจากระบบ');
      return;
    }

    if (!selectedCustomer.user_id) {
      setFormError('ลูกค้ารายนี้ยังไม่ได้เชื่อมต่อบัญชีผู้ใช้ ( user_id = null ) ไม่สามารถสร้างคิวงานได้ กรุณาส่งลิงก์ให้ลูกค้าลงทะเบียนและเข้าสู่ระบบก่อน');
      return;
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

    if (!startTime || !endTime) {
      setFormError('กรุณาระบุเวลานัดลูกค้าและเวลาเสร็จโดยประมาณ');
      return;
    }

    if (startTime >= endTime) {
      setFormError('เวลาเสร็จต้องอยู่หลังเวลานัดลูกค้า');
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

    // Validate Price & Deposit
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

    const targetCustomerId = selectedCustomer.id;
    const targetUserId = selectedCustomer.user_id;
    const targetCustomerName = selectedCustomer.display_name;

    setIsSubmitting(true);
    const supabase = createClient();

    let createdEstimateId: string | null = null;
    let createdBookingId: string | null = null;

    try {
      // Direct Booking Statuses
      const bookingStatus = 'CONFIRMED';
      const estimateStatus = 'ACCEPTED';

      const fullDescription = description.trim() || 'สร้างคิวงานใหม่สำหรับลูกค้าเดิมโดยผู้ดูแลระบบ (Master Calendar)';

      // Step 1: Insert estimate_requests with both customer_id and customer_user_id
      const estPayload = {
        customer_id: targetCustomerId,
        customer_user_id: targetUserId,
        artist_id: artistId,
        placement: placement.trim() || 'ไม่ระบุ',
        width_cm: 10,
        height_cm: 10,
        style: style.trim() || 'ตามที่ช่างแนะนำ',
        description: fullDescription,
        preferred_date: appointmentDate,
        preferred_time: startTime,
        reference_images: [],
        request_type: 'DIRECT_BOOKING',
        work_type: workType,
        quoted_price: priceNum,
        deposit_required: depositPaidNum,
        status: estimateStatus,
      };

      console.log('[CreateBookingModal] Step 1: Inserting estimate_requests...', estPayload);

      const { data: estData, error: estErr } = await supabase
        .from('estimate_requests')
        .insert([estPayload])
        .select('id')
        .single();

      if (estErr) {
        console.error('[CreateBookingModal] Step 1 failed (estimate_requests insert):', estErr);
        throw new Error(`[estimate_requests insert failed]: ${estErr.message || JSON.stringify(estErr)} (code: ${estErr.code}, details: ${estErr.details || 'none'})`);
      }

      console.log('[CreateBookingModal] Step 1 success:', estData);
      createdEstimateId = estData.id;

      // Step 2: Update estimate_requests status = 'QUOTED'
      const { data: estUpdateData, error: estUpdateErr } = await supabase
        .from('estimate_requests')
        .update({
          status: 'QUOTED',
          quoted_price: priceNum,
          deposit_required: depositPaidNum,
          quoted_at: new Date().toISOString(),
        })
        .eq('id', createdEstimateId)
        .select('id, quoted_price, deposit_required, status')
        .single();

      console.log('[CreateBookingModal] Direct Booking price sync:', {
        createdEstimateId,
        priceNum,
        depositNum: depositPaidNum,
        priceSyncResult: estUpdateData || estUpdateErr || 'done',
      });

      if (estUpdateErr) {
        console.error('[CreateBookingModal] Step 2 failed (estimate_requests price sync):', estUpdateErr);
        throw new Error(`[estimate_requests price sync failed]: ${estUpdateErr.message || JSON.stringify(estUpdateErr)} (code: ${estUpdateErr.code})`);
      }

      // Step 3: Insert bookings with both customer_id and customer_user_id
      const bPayload = {
        estimate_request_id: createdEstimateId,
        customer_id: targetCustomerId,
        customer_user_id: targetUserId,
        artist_id: artistId,
        requested_date: appointmentDate,
        requested_start_time: startTime,
        customer_note: fullDescription,
        status: bookingStatus,
        approved_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      };

      console.log('[CreateBookingModal] Step 3: Inserting bookings...', bPayload);

      const { data: bData, error: bErr } = await supabase
        .from('bookings')
        .insert([bPayload])
        .select('id')
        .single();

      if (bErr) {
        console.error('[CreateBookingModal] Step 3 failed (bookings insert):', bErr);
        throw new Error(`[bookings insert failed]: ${bErr.message || JSON.stringify(bErr)} (code: ${bErr.code}, details: ${bErr.details || 'none'})`);
      }

      console.log('[CreateBookingModal] Step 3 success:', bData);
      createdBookingId = bData.id;

      // Step 5: Insert booking_payments if deposit was paid (> 0)
      if (depositPaidNum > 0) {
        const paymentPayload = {
          booking_id: createdBookingId,
          customer_id: targetCustomerId,
          payment_type: 'DEPOSIT',
          amount: depositPaidNum,
          payment_method: 'CASH',
          status: 'RECORDED',
          paid_at: new Date().toISOString(),
          note: 'มัดจำที่รับแล้ว (Direct Booking)',
        };

        console.log('[CreateBookingModal] Step 5: Inserting booking_payments...', paymentPayload);

        const { error: payErr } = await supabase
          .from('booking_payments')
          .insert([paymentPayload]);

        if (payErr) {
          console.error('[CreateBookingModal] Step 5 failed (booking_payments insert):', payErr);
          throw new Error(`[booking_payments insert failed]: ${payErr.message || JSON.stringify(payErr)} (code: ${payErr.code})`);
        }

        console.log('[CreateBookingModal] Step 5 success (booking_payments inserted)');
      }

      // Success
      onSuccess(`สร้างคิวให้ ${targetCustomerName} (ยืนยันคิวเรียบร้อย) เรียบร้อยแล้ว`);
      onClose();
    } catch (err: any) {
      console.error('[CreateBookingModal] Error during submit flow:', err);

      // Rollback cleanup on failure
      try {
        if (createdBookingId) {
          console.log('[CreateBookingModal] Cleaning up created booking:', createdBookingId);
          await supabase.from('bookings').delete().eq('id', createdBookingId);
        }
        if (createdEstimateId) {
          console.log('[CreateBookingModal] Cleaning up created estimate_request:', createdEstimateId);
          await supabase.from('estimate_requests').delete().eq('id', createdEstimateId);
        }
      } catch (cleanupErr) {
        console.error('[CreateBookingModal] Rollback cleanup error:', cleanupErr);
      }

      setFormError(err.message || 'เกิดข้อผิดพลาดในการสร้างคิวงานใหม่');
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
                สร้างคิวงานให้ลูกค้าเดิม (Master Calendar)
              </h3>
              <p className="text-[11px] text-[#A89F91]">
                สร้างนัดหมายงานสักสำหรับลูกค้าที่มีบัญชีในระบบเรียบร้อยแล้ว
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-[#7A7265] hover:text-[#ECE4D3] transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* New Customer Booking Link Banner */}
        <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-300">สำหรับลูกค้าใหม่</p>
              <p className="text-[11px] text-[#A89F91]">
                กรุณาส่งลิงก์จองให้ลูกค้ากรอกข้อมูลและเข้าสู่ระบบก่อนส่งคำขอ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyBookingLink}
            className="shrink-0 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copiedLink ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์จอง'}</span>
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
          {/* Section 1: Customer Selection (Existing Customers Only) */}
          <div className="space-y-2.5 bg-[#0E0D0C] p-3.5 rounded-lg border border-[#4A443A]/60">
            <label className="text-xs font-semibold text-[#ECE4D3] flex items-center gap-1.5">
              <User size={14} className="text-amber-400" />
              <span>เลือกลูกค้าเดิมในระบบ <span className="text-red-400">*</span></span>
            </label>

            {selectedCustomer ? (
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
                  className="text-xs text-amber-400 hover:underline font-medium self-end sm:self-auto"
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
                    placeholder="พิมพ์ชื่อ, เบอร์โทรศัพท์ เพื่อค้นหาลูกค้าเดิม..."
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
                            if (!hasUserId) {
                              setFormError(`ลูกค้ารายนี้ (${cust.display_name}) ยังไม่ได้เชื่อมต่อบัญชีผู้ใช้ (user_id = null) ไม่สามารถเลือกได้ กรุณาส่งลิงก์ให้ลูกค้าลงทะเบียนก่อน`);
                            }
                            setSelectedCustomer(cust);
                          }}
                          className={`p-2.5 hover:bg-[#26231F] cursor-pointer flex items-center justify-between text-[#ECE4D3] transition-colors ${
                            !hasUserId ? 'opacity-70 bg-red-950/20' : ''
                          }`}
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
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                เวลานัดลูกค้า <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => {
                  const newStart = e.target.value;
                  setStartTime(newStart);
                  setEndTime(calculateDefaultEndTime(newStart));
                }}
                className="w-full bg-[#0E0D0C] border border-[#4A443A] rounded-lg px-3 py-2 text-xs text-[#ECE4D3] focus:outline-none focus:border-amber-400 [color-scheme:dark] cursor-pointer"
              />
            </div>

            {/* Estimated End Time */}
            <div>
              <label className="block text-xs font-medium text-[#ECE4D3] mb-1">
                เวลาเสร็จโดยประมาณ <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
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
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs text-[#A89F91] hover:text-[#ECE4D3] bg-[#0E0D0C] border border-[#4A443A] rounded-lg transition-colors"
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
