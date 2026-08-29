'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, Paperclip, X, ChevronLeft, ChevronRight, ChevronDown, AlertCircle, CalendarDays, Clock } from 'lucide-react';
import { EmptyState } from '@/components/owner/empty-state';
import { createClient } from '@/lib/supabase/client';
import { BalanceVerificationCard } from '@/components/payments/BalanceVerificationCard';
import { formatThaiDate, formatThaiTime, gregorianToThaiNumeric } from '@/lib/dateUtils';
import { ThaiBuddhistDatePicker } from '@/components/ui/ThaiBuddhistDatePicker';

type ProjectReference = {
  id: string;
};

type TattooProject = {
  id: string;
  name: string;
  description: string;
  tattoo_style: string;
  body_placement: string;
  width_cm: number;
  height_cm: number;
  color_mode: string;
  work_type: string;
  references: ProjectReference[];
  agreed_price?: number | null;
  flash_design_id?: string | null;
  flash_variant_id?: string | null;
  size_note?: string | null;
};

type FlashVariant = {
  id: string;
  size_name: string;
  min_size_cm: number | null;
  max_size_cm: number | null;
  price: number;
};

type Payment = {
  id: string;
  status: string;
  payment_type: string;
  amount: number;
  proof_storage_path: string | null;
  proof_submitted_at: string | null;
  created_at: string;
};

type BookingRequest = {
  id: string;
  requested_start_at: string;
  status: string;
  submitted_full_name: string;
  submitted_email: string | null;
  submitted_phone: string;
  health_note: string | null;
  is_first_tattoo: boolean | null;
  safety_notice_acknowledged: boolean | null;
  created_at: string;
  project_id?: string | null;
  project: TattooProject | null;
  confirmed_start_at?: string | null;
  confirmed_end_at?: string | null;
  payments?: Payment[] | null;
  artist_id?: string;
  artist?: {
    full_name: string | null;
    email: string | null;
  } | null;
  flash_design_id?: string | null;
  flash_designs?: {
    id: string;
    flash_code: string;
    image_path: string;
    size: string;
    price: number;
    style_name: string | null;
  } | null;
  flash_variant?: FlashVariant | null;
};

type ArtistBookingRequestsListProps = {
  initialRequests: BookingRequest[];
  isOwnerView?: boolean;
};

type MappedImage = {
  id: string;
  storage_path: string;
  reference_type: string;
  signedUrl: string;
};

const STATUS_TABS = [
  { id: 'all', name: 'ทั้งหมด' },
  { id: 'pending_review', name: 'รอตรวจสอบ' },
  { id: 'pending_payment', name: 'รอมัดจำ' },
  { id: 'approved', name: 'รับแล้ว' },
  { id: 'rejected', name: 'ปฏิเสธ' },
];

const WORK_TYPE_MAP: Record<string, string> = {
  new_work: 'งานใหม่',
  extension: 'ต่อเติมลายเดิม',
  touch_up: 'เก็บงาน/เติมสี',
  cover_up: 'แก้/ทับลายเดิม',
  scar_cover: 'สักทับรอยแผลเป็น',
};

const COLOR_MODE_MAP: Record<string, string> = {
  black_grey: 'Black & Grey',
  color: 'Color',
};

const REF_TYPE_MAP: Record<string, string> = {
  real_area: 'รูปพื้นที่จริง',
  design_reference: 'รูปอ้างอิงแบบสัก',
};

const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const hours = Math.floor(i / 2) + 10;
  const minutes = (i % 2 === 0) ? '00' : '30';
  return `${String(hours).padStart(2, '0')}:${minutes}`;
});

export default function ArtistBookingRequestsList({ initialRequests, isOwnerView = false }: ArtistBookingRequestsListProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [loadingRequestId, setLoadingRequestId] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Requests state that can be re-fetched client-side
  const [requestsList, setRequestsList] = useState<BookingRequest[]>(initialRequests);

  // Accordion state: only one open at a time across all screen sizes
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  // Lightbox States
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [lightboxImages, setLightboxImages] = useState<MappedImage[]>([]);

  // Accept Modal States
  const [acceptingRequest, setAcceptingRequest] = useState<BookingRequest | null>(null);
  const [agreedPrice, setAgreedPrice] = useState<string>('');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [confirmedDate, setConfirmedDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [isSubmittingAccept, setIsSubmittingAccept] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptSuccessMessage, setAcceptSuccessMessage] = useState<string | null>(null);
  const [acceptSuccessSubtext, setAcceptSuccessSubtext] = useState<string | null>(null);

  // Schedule Availability States
  const [scheduleAppointments, setScheduleAppointments] = useState<any[]>([]);
  const [scheduleHolds, setScheduleHolds] = useState<any[]>([]);
  const [scheduleOverrides, setScheduleOverrides] = useState<any[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  // Fetch schedule details for availability checks when accept modal opens
  useEffect(() => {
    if (!acceptingRequest) {
      setScheduleAppointments([]);
      setScheduleHolds([]);
      setScheduleOverrides([]);
      return;
    }

    const fetchSchedule = async () => {
      try {
        setIsLoadingSchedule(true);
        const client = createClient();
        
        // Fetch appointments (scheduled or in_progress only)
        const { data: appts } = await client
          .from('appointments')
          .select('id, session_number, status, start_at, end_at, project_id, customer:customers(full_name)')
          .eq('artist_id', acceptingRequest.artist_id)
          .in('status', ['scheduled', 'in_progress']);

        // Fetch active holds
        const { data: holds } = await client
          .from('booking_schedule_holds')
          .select('id, start_at, end_at, expires_at')
          .eq('artist_id', acceptingRequest.artist_id)
          .gt('expires_at', new Date().toISOString());

        // Fetch overrides
        const { data: overrides } = await client
          .from('artist_daily_overrides')
          .select('override_date, capacity, is_closed')
          .eq('artist_id', acceptingRequest.artist_id);

        setScheduleAppointments(appts || []);
        setScheduleHolds(holds || []);
        setScheduleOverrides(overrides || []);
      } catch (err) {
        console.error('Error fetching schedule details:', err);
      } finally {
        setIsLoadingSchedule(false);
      }
    };

    fetchSchedule();
  }, [acceptingRequest]);
  const [viewingProofUrl, setViewingProofUrl] = useState<string | null>(null);
  const [loadingProofId, setLoadingProofId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [proofViewError, setProofViewError] = useState<string | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [confirmPaidRequest, setConfirmPaidRequest] = useState<{request: BookingRequest, payment: Payment} | null>(null);
  const [confirmInvalidRequest, setConfirmInvalidRequest] = useState<{request: BookingRequest, payment: Payment} | null>(null);
  const [verifySuccessMessage, setVerifySuccessMessage] = useState<{title: string; desc: string} | null>(null);

  const supabase = createClient();

  useEffect(() => {
    setRequestsList(initialRequests);
  }, [initialRequests]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const filteredRequests = requestsList.filter((req) => {
    if (activeTab === 'all') return true;
    return req.status === activeTab;
  });

  const getTabCount = (tabId: string) => {
    if (tabId === 'all') return requestsList.length;
    return requestsList.filter(r => r.status === tabId).length;
  };

  const toggleCard = (requestId: string) => {
    setExpandedRequestId((prev) => (prev === requestId ? null : requestId));
  };

  const fetchRequestsList = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('booking_requests')
        .select(`
          id,
          requested_start_at,
          status,
          submitted_full_name,
          submitted_email,
          submitted_phone,
          health_note,
          is_first_tattoo,
          safety_notice_acknowledged,
          created_at,
          project_id,
          confirmed_start_at,
          confirmed_end_at,
          flash_design_id,
          flash_designs:flash_designs!booking_requests_flash_design_id_fkey (
            id,
            flash_code,
            image_path,
            size,
            price,
            style_name
          ),
          payments (
            id,
            status,
            payment_type,
            amount,
            proof_storage_path,
            proof_submitted_at,
            created_at
          ),
          project:tattoo_projects (
            id,
            name,
            description,
            tattoo_style,
            body_placement,
            width_cm,
            height_cm,
            color_mode,
            work_type,
            agreed_price,
            flash_design_id,
            references:tattoo_project_references (
              id
            )
          )
        `)
        .eq('artist_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((req: any) => ({
        ...req,
        project: req.project ? {
          ...req.project,
          references: req.project.references || []
        } : null
      }));
      setRequestsList(mapped);
    } catch (err) {
      console.error('Error fetching updated booking requests:', err);
    }
  };

  const handleAcceptClick = (request: BookingRequest) => {
    // Get current date/time in BKK timezone
    const bkkNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const bkkTodayStr = `${bkkNow.getFullYear()}-${String(bkkNow.getMonth() + 1).padStart(2, '0')}-${String(bkkNow.getDate()).padStart(2, '0')}`;
    const bkkCurrentTime = `${String(bkkNow.getHours()).padStart(2, '0')}:${String(bkkNow.getMinutes()).padStart(2, '0')}`;

    // Parse requested date in BKK timezone
    const reqDate = new Date(request.requested_start_at);
    const reqBkk = new Date(reqDate.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const yyyy = reqBkk.getFullYear();
    const mm = String(reqBkk.getMonth() + 1).padStart(2, '0');
    const dd = String(reqBkk.getDate()).padStart(2, '0');
    const reqBkkStr = `${yyyy}-${mm}-${dd}`;
    
    // Normalize to 30-minute increments and business hours (10:00 - 23:30)
    let rawHr = reqBkk.getHours();
    const rawMin = reqBkk.getMinutes();
    let normMin = rawMin < 15 ? 0 : (rawMin < 45 ? 30 : 0);
    if (rawMin >= 45) rawHr += 1;
    if (rawHr < 10) { rawHr = 10; normMin = 0; }
    if (rawHr > 23) { rawHr = 23; normMin = 30; }
    const reqTimeStr = `${String(rawHr).padStart(2, '0')}:${String(normMin).padStart(2, '0')}`;

    if (reqBkkStr < bkkTodayStr || (reqBkkStr === bkkTodayStr && reqTimeStr <= bkkCurrentTime)) {
      setConfirmedDate('');
      setStartTime('');
    } else {
      setConfirmedDate(reqBkkStr);
      setStartTime(reqTimeStr);
    }
    setEndTime('');
    const isFlash = !!request.flash_design_id || !!request.project?.flash_design_id;
    if (isFlash) {
      const flashPrice = request.project?.agreed_price ?? request.flash_designs?.price ?? '';
      setAgreedPrice(String(flashPrice));
    } else {
      setAgreedPrice('');
    }
    setDepositAmount('');
    setAcceptError(null);
    setAcceptSuccessMessage(null);
    setAcceptSuccessSubtext(null);
    setAcceptingRequest(request);
  };

  const submitAcceptRequest = async () => {
    if (!acceptingRequest) return;

    if (!agreedPrice || isNaN(Number(agreedPrice)) || Number(agreedPrice) < 0) {
      setAcceptError('ราคางานสักต้องเป็นตัวเลขและมากกว่าหรือเท่ากับ 0');
      return;
    }
    if (depositAmount === '' || isNaN(Number(depositAmount)) || Number(depositAmount) < 0) {
      setAcceptError('เงินมัดจำต้องเป็นตัวเลขและมากกว่าหรือเท่ากับ 0');
      return;
    }
    const finalDeposit = Number(depositAmount);

    if (finalDeposit > Number(agreedPrice)) {
      setAcceptError('เงินมัดจำต้องไม่เกินราคางานสัก');
      return;
    }
    if (!confirmedDate || !startTime || !endTime) {
      setAcceptError('กรุณากรอกวันที่และเวลาให้ครบถ้วน');
      return;
    }
    if (startTime >= endTime) {
      setAcceptError('เวลาเริ่มต้นต้องมาก่อนเวลาสิ้นสุด');
      return;
    }

    setIsSubmittingAccept(true);
    setAcceptError(null);

    const p_confirmed_start_at = `${confirmedDate}T${startTime}:00+07:00`;
    const p_confirmed_end_at = `${confirmedDate}T${endTime}:00+07:00`;

    console.log('SAFE_PARAMS', {
      bookingId: acceptingRequest.id,
      agreedPrice: Number(agreedPrice),
      depositAmount: finalDeposit,
      confirmedStartAt: p_confirmed_start_at,
      confirmedEndAt: p_confirmed_end_at
    });

    try {
      const { data, error } = await supabase.rpc('approve_booking_request_v2', {
        p_booking_id: acceptingRequest.id,
        p_agreed_price: Number(agreedPrice),
        p_deposit_amount: finalDeposit,
        p_confirmed_start_at: p_confirmed_start_at,
        p_confirmed_end_at: p_confirmed_end_at
      });

      if (error) {
        console.log('ACCEPT_REQUEST_RPC_ERROR', {
          code: error?.code ?? null,
          message: error?.message ?? null,
          details: error?.details ?? null,
          hint: error?.hint ?? null,
        });
        throw error;
      }

      const result = data && data[0];
      if (!result) {
        throw new Error('No result returned from approval function');
      }

      const { booking_status } = result;

      if (booking_status === 'approved') {
        setAcceptSuccessMessage('รับคำขอเรียบร้อย');
        setAcceptSuccessSubtext('สร้างคิวนัดหมายแล้ว');
      } else if (booking_status === 'pending_payment') {
        setAcceptSuccessMessage('รับคำขอแล้ว รอชำระเงินมัดจำ');
        setAcceptSuccessSubtext('ระบบสำรองช่วงเวลานี้ไว้ชั่วคราวระหว่างรอชำระเงิน');
      } else {
        setAcceptSuccessMessage('ดำเนินการเรียบร้อย');
        setAcceptSuccessSubtext(`สถานะ: ${booking_status}`);
      }

      setExpandedRequestId(null);
      await fetchRequestsList();
    } catch (err: any) {
      console.log('ACCEPT_REQUEST_CATCH_ERROR', {
        code: err?.code ?? null,
        message: err?.message ?? null,
        details: err?.details ?? null,
        hint: err?.hint ?? null,
      });
      const errMsg = err?.message || '';
      if (errMsg.includes('overlapping appointment') || errMsg.includes('overlapping schedule hold')) {
        setAcceptError('ช่วงเวลานี้มีคิวอื่นแล้ว กรุณาเลือกเวลาใหม่');
      } else if (errMsg.includes('Unauthorized') || errMsg.includes('unauthorized')) {
        setAcceptError('คุณไม่มีสิทธิ์รับคำขอนี้');
      } else if (errMsg.includes('not in pending_review state')) {
        setAcceptError('สถานะคำขอนี้ถูกเปลี่ยนแล้ว กรุณารีเฟรชข้อมูล');
      } else if (errMsg.includes('Deposit amount cannot exceed agreed price')) {
        setAcceptError('เงินมัดจำต้องไม่เกินราคางานสัก');
      } else if (errMsg.includes('Confirmed start time must be before end time')) {
        setAcceptError('กรุณาตรวจสอบเวลาเริ่มและเวลาสิ้นสุด');
      } else {
        setAcceptError('ไม่สามารถรับคำขอได้ กรุณาลองอีกครั้ง');
      }
    } finally {
      setIsSubmittingAccept(false);
    }
  };

  const handleViewSlip = async (storagePath: string, paymentId: string) => {
    try {
      setLoadingProofId(paymentId);
      setProofViewError(null);
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(storagePath, 300);

      if (error || !data) {
        throw error || new Error('No signed url returned');
      }

      setViewingProofUrl(data.signedUrl);
    } catch (err: any) {
      console.log('VIEW_SLIP_ERROR', {
        code: err?.code ?? null,
        message: err?.message ?? null,
      });
      setProofViewError('ไม่สามารถเปิดสลิปได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoadingProofId(null);
    }
  };

  const handleVerifyPaid = async (paymentId: string) => {
    try {
      setIsVerifyingPayment(true);
      setPaymentError(null);
      const requestId = confirmPaidRequest?.request.id;
      
      const { error } = await supabase.rpc('verify_manual_payment', {
        p_payment_id: paymentId,
        p_status: 'paid'
      });

      if (error) throw error;

      setConfirmPaidRequest(null);
      setViewingProofUrl(null);
      
      await fetchRequestsList();
      
      // Determine what happened
      if (requestId) {
        // Fetch the fresh status of the booking request
        const { data: updatedReq } = await supabase
          .from('booking_requests')
          .select('status')
          .eq('id', requestId)
          .single();
          
        if (updatedReq?.status === 'approved') {
          setVerifySuccessMessage({
            title: 'ยืนยันการชำระเงินแล้ว',
            desc: 'สร้างคิวนัดหมายเรียบร้อย'
          });
        } else if (updatedReq?.status === 'pending_review') {
          setVerifySuccessMessage({
            title: 'บันทึกการชำระเงินแล้ว',
            desc: 'กรุณากำหนดวันและเวลาใหม่ เนื่องจากช่วงเวลาที่พักไว้หมดอายุแล้ว'
          });
        }
      }
    } catch (err: any) {
      console.log('VERIFY_PAID_ERROR', {
        code: err?.code ?? null,
        message: err?.message ?? null,
      });
      setPaymentError('ไม่สามารถตรวจสอบการชำระเงินได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const handleVerifyFailed = async (paymentId: string) => {
    try {
      setIsVerifyingPayment(true);
      setPaymentError(null);
      
      const { error } = await supabase.rpc('verify_manual_payment', {
        p_payment_id: paymentId,
        p_status: 'failed'
      });

      if (error) throw error;

      setConfirmInvalidRequest(null);
      setViewingProofUrl(null);
      
      await fetchRequestsList();
    } catch (err: any) {
      console.log('VERIFY_FAILED_ERROR', {
        code: err?.code ?? null,
        message: err?.message ?? null,
      });
      setPaymentError('ไม่สามารถตรวจสอบการชำระเงินได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#262626] text-[#F5F5F5] border border-[#262626]">
            รอตรวจสอบ
          </span>
        );
      case 'pending_payment':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            รอมัดจำ
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            รับแล้ว
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            ปฏิเสธ
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1F1F1F] text-[#737373] border border-[#262626]">
            หมดอายุ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#262626] text-[#A3A3A3]">
            {status}
          </span>
        );
    }
  };

  // Fetch and sign URLs on-demand and open Lightbox
  const handleOpenImages = async (request: BookingRequest) => {
    const project = request.project;
    if (!project) return;

    setLoadingRequestId(request.id);
    setErrorRequestId(null);

    try {
      const { data: refs, error: refsError } = await supabase
        .from('tattoo_project_references')
        .select('id, storage_path, reference_type')
        .eq('project_id', project.id);

      if (refsError || !refs || refs.length === 0) {
        throw new Error('No references or failed fetching');
      }

      const paths = refs.map((r) => r.storage_path);
      const { data: signedData, error: signedError } = await supabase.storage
        .from('tattoo-references')
        .createSignedUrls(paths, 300);

      if (signedError || !signedData) {
        throw new Error('Failed to create signed URLs');
      }

      const mapped: MappedImage[] = refs
        .map((ref) => {
          const signedObj = signedData.find((s) => s.path === ref.storage_path);
          return {
            id: ref.id,
            storage_path: ref.storage_path,
            reference_type: ref.reference_type,
            signedUrl: signedObj?.signedUrl || '',
          };
        })
        .filter((img) => img.signedUrl !== '');

      if (mapped.length === 0) {
        throw new Error('No valid signed URLs mapped');
      }

      setLightboxImages(mapped);
      setActiveImageIndex(0);
      setLightboxOpen(true);
    } catch (err) {
      console.error('On-demand photo fetch error:', err);
      setErrorRequestId(request.id);
    } finally {
      setLoadingRequestId(null);
    }
  };

  // Lightbox Navigation Controls
  const handlePrev = () => {
    if (activeImageIndex === null || lightboxImages.length === 0) return;
    setActiveImageIndex((prev) => (prev === 0 ? lightboxImages.length - 1 : (prev ?? 0) - 1));
  };

  const handleNext = () => {
    if (activeImageIndex === null || lightboxImages.length === 0) return;
    setActiveImageIndex((prev) => (prev === lightboxImages.length - 1 ? 0 : (prev ?? 0) + 1));
  };

  // Keyboard navigation listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen || activeImageIndex === null) return;
      if (e.key === 'Escape') {
        setLightboxOpen(false);
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxOpen, activeImageIndex, lightboxImages.length]);

  // Body scroll lock
  useEffect(() => {
    if (lightboxOpen || acceptingRequest) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [lightboxOpen, acceptingRequest]);

  // Get current date/time in BKK timezone for validation
  const bkkNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const bkkTodayStr = `${bkkNow.getFullYear()}-${String(bkkNow.getMonth() + 1).padStart(2, '0')}-${String(bkkNow.getDate()).padStart(2, '0')}`;
  const bkkCurrentTime = `${String(bkkNow.getHours()).padStart(2, '0')}:${String(bkkNow.getMinutes()).padStart(2, '0')}`;

  // Helper to build availability metadata for the date picker
  const getDayMeta = () => {
    const meta: Record<string, { hasBooking?: boolean; closed?: boolean }> = {};
    if (!acceptingRequest) return meta;

    // Build meta for +/- 60 days around today
    const now = new Date();
    for (let i = -30; i <= 90; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      
      const startOfDayMs = new Date(`${dateStr}T00:00:00+07:00`).getTime();
      const endOfDayMs = new Date(`${dateStr}T23:59:59.999+07:00`).getTime();
      
      const override = scheduleOverrides.find(o => o.override_date === dateStr);
      const closed = override?.is_closed || false;
      
      const hasAppt = scheduleAppointments.some(a => {
        const aStart = new Date(a.start_at).getTime();
        const aEnd = new Date(a.end_at).getTime();
        return aStart < endOfDayMs && aEnd > startOfDayMs;
      });

      const hasHold = scheduleHolds.some(h => {
        const hStart = new Date(h.start_at).getTime();
        const hEnd = new Date(h.end_at).getTime();
        return hStart < endOfDayMs && hEnd > startOfDayMs;
      });

      if (closed || hasAppt || hasHold) {
        meta[dateStr] = {
          closed,
          hasBooking: hasAppt || hasHold
        };
      }
    }
    return meta;
  };

  const dayMeta = getDayMeta();

  // Helper to get events on the selected date
  const getSelectedDayEvents = () => {
    if (!confirmedDate) return [];
    const startOfDayMs = new Date(`${confirmedDate}T00:00:00+07:00`).getTime();
    const endOfDayMs = new Date(`${confirmedDate}T23:59:59.999+07:00`).getTime();

    const events: { start: string; end: string; label: string; isHold?: boolean }[] = [];

    scheduleAppointments.forEach(a => {
      const aStart = new Date(a.start_at).getTime();
      const aEnd = new Date(a.end_at).getTime();
      if (aStart < endOfDayMs && aEnd > startOfDayMs) {
        const fmtTime = (iso: string) => {
          const d = new Date(iso);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        const isNextDay = new Date(a.end_at).getDate() !== new Date(a.start_at).getDate();
        const timeLabel = `${fmtTime(a.start_at)}–${fmtTime(a.end_at)}${isNextDay ? ' (+1 วัน)' : ''}`;
        events.push({
          start: a.start_at,
          end: a.end_at,
          label: `${timeLabel} | ${a.customer?.full_name || 'ลูกค้าทั่วไป'} • ครั้งที่ ${a.session_number}`
        });
      }
    });

    scheduleHolds.forEach(h => {
      const hStart = new Date(h.start_at).getTime();
      const hEnd = new Date(h.end_at).getTime();
      if (hStart < endOfDayMs && hEnd > startOfDayMs) {
        const fmtTime = (iso: string) => {
          const d = new Date(iso);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        const isNextDay = new Date(h.end_at).getDate() !== new Date(h.start_at).getDate();
        const timeLabel = `${fmtTime(h.start_at)}–${fmtTime(h.end_at)}${isNextDay ? ' (+1 วัน)' : ''}`;
        events.push({
          start: h.start_at,
          end: h.end_at,
          label: `${timeLabel} | รอชำระมัดจำ`,
          isHold: true
        });
      }
    });

    return events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  };

  const selectedDayEvents = getSelectedDayEvents();

  // Helper to check if proposed time conflicts with any appointments/holds
  const hasTimeConflict = (() => {
    if (!confirmedDate || !startTime || !endTime) return false;
    
    const startIso = `${confirmedDate}T${startTime}:00+07:00`;
    let endDate = confirmedDate;
    if (endTime <= startTime) {
      const [yyyy, mm, dd] = confirmedDate.split('-').map(Number);
      const nextDay = new Date(Date.UTC(yyyy, mm - 1, dd + 1));
      endDate = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`;
    }
    const endIso = `${endDate}T${endTime}:00+07:00`;
    
    const newStartMs = new Date(startIso).getTime();
    const newEndMs = new Date(endIso).getTime();

    const apptConflict = scheduleAppointments.some(a => {
      const aStart = new Date(a.start_at).getTime();
      const aEnd = new Date(a.end_at).getTime();
      return aStart < newEndMs && aEnd > newStartMs;
    });

    const holdConflict = scheduleHolds.some(h => {
      const hStart = new Date(h.start_at).getTime();
      const hEnd = new Date(h.end_at).getTime();
      return hStart < newEndMs && hEnd > newStartMs;
    });

    return apptConflict || holdConflict;
  })();

  // Form validity calculation
  const isFormValid =
    agreedPrice !== '' &&
    !isNaN(Number(agreedPrice)) &&
    Number(agreedPrice) >= 0 &&
    depositAmount !== '' &&
    !isNaN(Number(depositAmount)) &&
    Number(depositAmount) >= 0 &&
    Number(depositAmount) <= Number(agreedPrice) &&
    confirmedDate !== '' &&
    confirmedDate >= bkkTodayStr &&
    startTime !== '' &&
    endTime !== '' &&
    TIME_SLOTS.includes(startTime) &&
    TIME_SLOTS.includes(endTime) &&
    startTime < endTime &&
    (confirmedDate !== bkkTodayStr || startTime > bkkCurrentTime) &&
    !hasTimeConflict;

  // DRY Card renderer
  const renderRequestCard = (request: BookingRequest) => {
    const project = request.project;
    const photoCount = project?.references?.length || 0;
    const isExpanded = expandedRequestId === request.id;
    const isFlash = !!(request.flash_design_id || request.flash_designs?.id || request.project?.flash_design_id);

    return (
      <div
        key={request.id}
        className={`bg-[#121212] border border-[#262626] rounded-xl p-5 hover:border-[#F5F5F5]/30 transition-all duration-200 flex flex-col gap-3 ${
          isExpanded ? 'border-[#F5F5F5]/30' : ''
        }`}
      >
        {/* Header/Summary Area */}
        <div 
          onClick={() => toggleCard(request.id)}
          className="cursor-pointer space-y-3 w-full"
        >
          {/* 1. Header */}
          <div className="space-y-1 pb-1">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 truncate">
                  <h3 className="text-lg font-semibold text-[#F5F5F5] tracking-wide truncate">
                    {request.submitted_full_name}
                  </h3>
                  {isFlash && (
                    <span className="bg-[#FFFFFF] text-black text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide font-mono whitespace-nowrap">
                      FLASH
                    </span>
                  )}
                  {isOwnerView && request.artist && (
                    <span className="text-[10px] bg-[#262626] text-[#A3A3A3] px-2 py-0.5 rounded-full border border-[#333] whitespace-nowrap">
                      ช่าง: {request.artist.full_name || request.artist.email || 'ไม่ทราบชื่อ'}
                    </span>
                  )}
                </div>
              {getStatusBadge(request.status)}
            </div>
            <div className="text-[11px] text-[#737373] flex items-center gap-1">
              <span>ส่งคำขอเมื่อ:</span>
              <span>{formatThaiDate(request.created_at)}</span>
            </div>
          </div>

          {/* 2. Collapsed Short Summary */}
          <div className="flex gap-4 pt-3 border-t border-[#262626]/40">
            {isFlash && request.flash_designs?.image_path && (
              <div className="w-16 h-16 shrink-0 bg-[#0A0A0A] border border-[#262626] rounded-lg overflow-hidden">
                <img 
                  src={supabase.storage.from('flash-images').getPublicUrl(request.flash_designs.image_path).data.publicUrl} 
                  alt={request.flash_designs.flash_code}
                  className="w-full h-full object-cover grayscale"
                />
              </div>
            )}
            <div className="space-y-1.5 text-xs sm:text-sm text-[#A3A3A3] leading-relaxed font-medium flex-1">
              {isFlash ? (
                <>
                  <div className="text-[#F5F5F5] font-semibold text-sm">
                    งาน Flash • {request.flash_designs?.flash_code || 'Flash Design'}
                  </div>
                  <div>
                    สไตล์: {request.flash_designs?.style_name || 'ไม่ระบุสไตล์'}
                  </div>
                  <div>
                    {request.flash_variant ? (
                      <span>
                        ขนาด: {request.flash_variant.size_name}
                        {project?.width_cm && project?.height_cm ? (
                          <>
                            {' • '}กว้าง {project.width_cm} ซม. × ยาว {project.height_cm} ซม.
                          </>
                        ) : request.flash_variant.min_size_cm !== null ? (
                          <span className="text-[#737373]">
                            {' '}({request.flash_variant.min_size_cm}
                            {request.flash_variant.max_size_cm !== null
                              ? `–${request.flash_variant.max_size_cm} ซม.`
                              : ' ซม. ขึ้นไป'})
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span>ขนาด: {project?.width_cm && project?.height_cm ? `กว้าง ${project.width_cm} ซม. × ยาว ${project.height_cm} ซม.` : request.flash_designs?.size || 'อิงตามขนาดดีไซน์'}</span>
                    )}
                  </div>
                  <div>
                    ตำแหน่ง: {project?.body_placement || 'ไม่ระบุตำแหน่ง'}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    {project ? `${project.tattoo_style || 'ไม่ระบุสไตล์'} • ${WORK_TYPE_MAP[project.work_type] || project.work_type} • ${COLOR_MODE_MAP[project.color_mode] || project.color_mode}` : 'ไม่ระบุรายละเอียดงาน'}
                  </div>
                  <div>
                    {project ? (
                      <>
                        {project.width_cm && project.height_cm ? `ขนาด: กว้าง ${project.width_cm} ซม. × ยาว ${project.height_cm} ซม.` : 'ขนาด: ไม่ระบุ'}
                        {' • '}
                        {project.body_placement || 'ไม่ระบุตำแหน่ง'}
                      </>
                    ) : ''}
                  </div>
                </>
              )}
              
              <div>
                {formatThaiDate(request.requested_start_at)} • {formatThaiTime(request.requested_start_at)}
              </div>
            </div>
          </div>

          {/* 3. Chevron Down/Up Rotator */}
          <div className="flex justify-end pt-1">
            <ChevronDown className={`h-4 w-4 text-[#737373] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        {/* 4. Smooth Expandable content section */}
        <div className={`grid transition-all duration-200 ease-in-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}>
          <div className="overflow-hidden flex flex-col gap-3">
            {/* Customer Contact */}
            <div className="pt-3 border-t border-[#262626]/50 text-sm">
              <span className="text-xs text-[#737373] uppercase tracking-wider block font-medium mb-1.5">ข้อมูลติดต่อ</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm text-[#F5F5F5]">
                <div>
                  <span className="text-xs text-[#737373] block mb-0.5">เบอร์โทรศัพท์</span>
                  <span className="font-semibold text-xs sm:text-sm">{request.submitted_phone}</span>
                </div>
                <div>
                  <span className="text-xs text-[#737373] block mb-0.5">อีเมล</span>
                  <span className="font-semibold text-xs sm:text-sm">{request.submitted_email || 'ไม่ได้ระบุ'}</span>
                </div>
              </div>
            </div>

            {/* Pricing Section (Agreed Price & Deposit) */}
            <div className="pt-3 border-t border-[#262626]/50 text-sm">
              <span className="text-xs text-[#737373] uppercase tracking-wider block font-medium mb-2">สรุปค่าบริการ</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm text-[#F5F5F5]">
                <div>
                  <span className="text-xs text-[#737373] block mb-0.5">ราคางานสัก</span>
                  <span className="font-semibold text-xs sm:text-sm text-[#F5F5F5]">
                    {isFlash ? (
                      <>
                        ฿{(project?.agreed_price ?? request.flash_variant?.price ?? request.flash_designs?.price ?? 0).toLocaleString()}
                      </>
                    ) : (
                      project?.agreed_price ? `฿${project.agreed_price.toLocaleString()}` : 'รอช่างประเมินราคา'
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#737373] block mb-0.5">ยอดมัดจำ</span>
                  <span className="font-semibold text-xs sm:text-sm text-[#F5F5F5]">
                    {(() => {
                      const depositPayment = (request.payments || []).find(p => p.payment_type === 'deposit');
                      const amt = depositPayment?.amount ?? (isFlash ? 500 : null);
                      return amt !== null ? `฿${amt.toLocaleString()}` : 'รอสรุปยอดมัดจำ';
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Description (Custom Only) */}
            {!isFlash && (
              <div className="pt-3 border-t border-[#262626]/50 text-sm">
                <span className="text-xs text-[#737373] uppercase tracking-wider block font-medium mb-1">รายละเอียด / แนวคิดงาน</span>
                <p className="text-[#F5F5F5] whitespace-pre-wrap leading-relaxed font-medium">
                  {project?.description || 'ไม่ได้ระบุ'}
                </p>
              </div>
            )}

            {/* Health Note */}
            {request.health_note && (
              <div className="pt-3 border-t border-[#262626]/50 text-sm bg-red-500/5 px-3 py-2.5 rounded-lg border border-red-500/10">
                <span className="text-xs text-red-400 uppercase tracking-wider block font-semibold mb-1">ข้อมูลที่แจ้งช่างเพิ่มเติม</span>
                <p className="text-[#F5F5F5] whitespace-pre-wrap leading-relaxed font-medium">
                  {request.health_note}
                </p>
              </div>
            )}

            {/* Health / First Timer */}
            {(request.is_first_tattoo !== null || request.safety_notice_acknowledged !== null) && (
              <div className="pt-3 border-t border-[#262626]/50 text-sm">
                <span className="text-xs text-[#737373] uppercase tracking-wider block font-medium mb-2">ข้อมูลสุขภาพและการสัก</span>
                <div className="space-y-1">
                  {request.is_first_tattoo !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[#A3A3A3] text-xs">สักครั้งแรก:</span>
                      <span className="text-[#F5F5F5] text-xs font-medium">{request.is_first_tattoo ? 'ใช่' : 'ไม่ใช่'}</span>
                    </div>
                  )}
                  {request.safety_notice_acknowledged && (
                    <div className="flex items-center gap-2">
                      <span className="text-[#A3A3A3] text-xs">ข้อมูลด้านความปลอดภัย:</span>
                      <span className="text-[#F5F5F5] text-xs font-medium">รับทราบข้อมูลด้านความปลอดภัยแล้ว</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Balance Payment Section (shown when project exists) */}
            {request.project_id && (
              <div className="pt-3 border-t border-[#262626]/50" onClick={(e) => e.stopPropagation()}>
                <BalanceVerificationCard
                  projectId={request.project_id}
                  bookingRequestId={request.id}
                />
              </div>
            )}

            {/* Image References (Custom Only) */}
            {!isFlash && photoCount > 0 && (
              <div className="pt-3 border-t border-[#262626]/50 space-y-2">
                <span className="text-xs text-[#737373] uppercase tracking-wider block font-medium">รูปภาพแนบจากลูกค้า</span>
                <button
                  type="button"
                  disabled={loadingRequestId === request.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenImages(request);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#171717] border border-[#262626] hover:border-[#F5F5F5]/30 hover:bg-[#262626] text-xs text-[#A3A3A3] hover:text-[#F5F5F5] transition-all cursor-pointer disabled:opacity-50"
                >
                  <Paperclip className="h-3.5 w-3.5 text-[#737373]" />
                  <span>{loadingRequestId === request.id ? 'กำลังโหลดรูป...' : `${photoCount} รูป`}</span>
                </button>

                {errorRequestId === request.id && (
                  <div 
                    className="text-[10px] text-red-400 flex items-center gap-1 mt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AlertCircle className="h-3 w-3" />
                    <span>ไม่สามารถโหลดรูปได้ กรุณาลองอีกครั้ง</span>
                  </div>
                )}
              </div>
            )}

            {/* Pending Payment Schedule Information */}
            {request.status === 'pending_payment' && (() => {
              const depositPayments = (request.payments || []).filter(p => p.payment_type === 'deposit');
              const sortedDeposits = depositPayments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              const depositPayment = sortedDeposits[0];
              return (
                <div className="pt-3 border-t border-[#262626]/50 text-sm space-y-4">
                  <div>
                    <span className="text-xs text-yellow-400 font-semibold block uppercase tracking-wider mb-2">
                      {depositPayment?.status === 'verification_pending' ? 'รอตรวจสอบการชำระเงิน' : 'รอลูกค้าชำระเงิน'}
                    </span>
                    <div className="bg-[#171717] border border-[#262626] rounded-lg p-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-[#737373] uppercase font-semibold">ยอดมัดจำ</span>
                        <span className="text-sm font-semibold text-[#F5F5F5]">
                          {depositPayment?.amount ? `฿${depositPayment.amount.toLocaleString()}` : '-'}
                        </span>
                      </div>
                      {request.confirmed_start_at && request.confirmed_end_at && (
                        <div className="text-xs text-[#A3A3A3] pt-2 border-t border-[#262626]/50">
                          <span className="block text-[#737373] text-[10px] uppercase font-semibold mb-0.5">วันเวลาที่ช่างกำหนด</span>
                          <span className="font-medium text-[#F5F5F5]">
                            {formatThaiDate(request.confirmed_start_at)} • {formatThaiTime(request.confirmed_start_at)} – {formatThaiTime(request.confirmed_end_at)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {depositPayment?.status === 'verification_pending' && (
                    <div>
                      <span className="text-xs text-[#737373] uppercase tracking-wider block font-medium mb-2">หลักฐานการชำระเงิน</span>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (depositPayment.proof_storage_path) {
                              handleViewSlip(depositPayment.proof_storage_path, depositPayment.id);
                            }
                          }}
                          disabled={loadingProofId === depositPayment.id || isVerifyingPayment}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#171717] border border-[#262626] hover:border-[#F5F5F5]/30 hover:bg-[#262626] text-xs text-[#A3A3A3] hover:text-[#F5F5F5] transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Paperclip className="h-3.5 w-3.5 text-[#737373]" />
                          <span>
                            {loadingProofId === depositPayment.id ? 'กำลังเปิด...' : 'ดูสลิป'}
                          </span>
                        </button>
                      </div>
                      
                      {proofViewError && (
                        <div className="text-xs text-red-400 mt-2 text-right">
                          {proofViewError}
                        </div>
                      )}
                      
                      {isOwnerView && (
                        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[#262626]/50" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setConfirmInvalidRequest({ request, payment: depositPayment })}
                            disabled={isVerifyingPayment}
                            className="px-4 py-2 border border-red-500/60 text-red-500 hover:text-red-400 hover:bg-red-500/8 hover:border-red-400/75 rounded-lg text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 cursor-pointer"
                          >
                            การชำระเงินไม่ถูกต้อง
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmPaidRequest({ request, payment: depositPayment })}
                            disabled={isVerifyingPayment}
                            className="px-4 py-2 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer disabled:opacity-50"
                          >
                            ยืนยันได้รับเงิน
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Action buttons (only for pending_review) */}
            {request.status === 'pending_review' && (
              <div className="pt-4 border-t border-[#262626]/50 flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="px-4 py-2 border border-red-500/60 text-red-500 hover:text-red-400 hover:bg-red-500/8 hover:border-red-400/75 active:bg-red-500/15 rounded-lg text-xs sm:text-sm font-semibold transition-all disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
                  style={{ boxShadow: '0 0 14px rgba(239, 68, 68, 0.12)' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 18px rgba(239, 68, 68, 0.22)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 14px rgba(239, 68, 68, 0.12)';
                  }}
                  onMouseDown={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.10)';
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 18px rgba(239, 68, 68, 0.22)';
                  }}
                  disabled
                >
                  ปฏิเสธคำขอ
                </button>
                <button
                  type="button"
                  onClick={() => handleAcceptClick(request)}
                  className="px-4 py-2 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer"
                >
                  รับคำขอ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getEmptyStateDetails = () => {
    switch (activeTab) {
      case 'pending_review':
        return {
          title: 'ไม่มีคำขอที่รอตรวจสอบ',
          description: 'คำขอจองใหม่ทั้งหมดที่รอการตรวจสอบจากคุณจะแสดงที่นี่'
        };
      case 'pending_payment':
        return {
          title: 'ไม่มีคำขอที่รอมัดจำ',
          description: 'คำขอจองที่ผ่านการอนุมัติแล้วและอยู่ระหว่างรอชำระเงินมัดจำจะแสดงที่นี่'
        };
      case 'approved':
        return {
          title: 'ไม่มีคำขอที่รับแล้ว',
          description: 'คำขอจองที่คุณกดยืนยันรับงานเรียบร้อยแล้วจะแสดงที่นี่'
        };
      case 'rejected':
        return {
          title: 'ไม่มีคำขอที่ปฏิเสธ',
          description: 'คำขอจองที่คุณปฏิเสธจะแสดงที่นี่'
        };
      default:
        return {
          title: 'ยังไม่มีคำขอจอง',
          description: 'เมื่อมีลูกค้าส่งคำขอจอง รายการจะปรากฏที่นี่'
        };
    }
  };

  const emptyState = getEmptyStateDetails();

  return (
    <div className="space-y-6">
      {/* Tabs Filter */}
      <div className="grid grid-cols-5 border-b border-[#262626] w-full md:flex md:w-auto">
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = getTabCount(tab.id);

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 md:px-4 font-medium text-xs sm:text-sm border-b-2 transition-all whitespace-nowrap flex items-center justify-center gap-1 min-w-0 w-full md:w-auto ${
                isActive
                  ? 'border-[#F5F5F5] text-[#F5F5F5]'
                  : 'border-transparent text-[#737373] hover:text-[#A3A3A3]'
              }`}
            >
              {tab.id === 'pending_review' ? (
                <>
                  <span className="hidden md:inline">รอตรวจสอบ</span>
                  <span className="inline md:hidden truncate">รอตรวจ</span>
                </>
              ) : (
                <span>{tab.name}</span>
              )}

              {/* Desktop Count Badge */}
              <span className={`hidden md:inline-flex text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-[#262626] text-[#F5F5F5]' : 'bg-[#171717] text-[#737373]'
              }`}>
                {count}
              </span>

              {/* Mobile Compact Count (Superscript style on the same line) */}
              <span className="inline md:hidden text-[9px] text-[#737373] align-super ml-0.5 font-normal">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Requests Lists */}
      {filteredRequests.length === 0 ? (
        <div className="min-h-[300px] flex items-center justify-center bg-[#121212] border border-[#262626] rounded-xl p-8">
          <EmptyState
            icon={Inbox}
            title={emptyState.title}
            description={emptyState.description}
          />
        </div>
      ) : (
        <>
          {/* Below lg breakpoint: Single Column flow (mobile & tablet) */}
          <div className="flex flex-col gap-5 lg:hidden">
            {filteredRequests.map((request) => renderRequestCard(request))}
          </div>

          {/* At lg breakpoint and above: Two independent vertical columns flow */}
          <div className="hidden lg:grid lg:grid-cols-2 gap-5 items-start">
            {/* Left Column (Even indexes) */}
            <div className="flex flex-col gap-5">
              {filteredRequests
                .filter((_, idx) => idx % 2 === 0)
                .map((request) => renderRequestCard(request))}
            </div>

            {/* Right Column (Odd indexes) */}
            <div className="flex flex-col gap-5">
              {filteredRequests
                .filter((_, idx) => idx % 2 === 1)
                .map((request) => renderRequestCard(request))}
            </div>
          </div>
        </>
      )}

      {/* Lightbox Modal (Same page, 1 image at a time) */}
      {mounted && lightboxOpen && activeImageIndex !== null && lightboxImages.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/94 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close Button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="fixed top-[calc(env(safe-area-inset-top)+16px)] right-4 md:top-6 md:right-6 p-2 rounded-full bg-black/40 border border-white/12 text-white/85 hover:text-white hover:bg-black/65 transition-all z-[10000] focus:outline-none w-11 h-11 flex items-center justify-center"
            aria-label="ปิดรูปภาพ"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Large Image Container */}
          <div
            className="relative max-w-full max-h-full p-4 flex flex-col items-center justify-center z-40"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image Stage */}
            <div className="relative w-[calc(100vw-32px)] h-[calc(100dvh-210px)] md:w-[min(72vw,1100px)] md:h-[80dvh] flex items-center justify-center rounded overflow-hidden">
              {/* Prev Button */}
              {lightboxImages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/35 border border-white/10 text-white/85 hover:text-white hover:bg-black/60 transition-all z-50 focus:outline-none w-11 h-11 flex items-center justify-center"
                  aria-label="รูปก่อนหน้า"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImages[activeImageIndex].signedUrl}
                alt={`รูปภาพประกอบที่ ${activeImageIndex + 1}`}
                className="max-w-full max-h-full md:max-w-full md:max-h-[80dvh] object-contain rounded"
              />

              {/* Next Button */}
              {lightboxImages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/35 border border-white/10 text-[#FFFFFF]/85 hover:text-white hover:bg-black/60 transition-all z-50 focus:outline-none w-11 h-11 flex items-center justify-center"
                  aria-label="รูปถัดไป"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Category Label and Counter */}
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <span className="text-xs text-[#737373] uppercase tracking-wider font-semibold">
                {REF_TYPE_MAP[lightboxImages[activeImageIndex].reference_type] || lightboxImages[activeImageIndex].reference_type}
              </span>
              <div className="px-3 py-1.5 rounded-full bg-[#121212]/80 border border-[#262626] text-xs font-medium text-[#A3A3A3]">
                {activeImageIndex + 1} / {lightboxImages.length}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Accept Modal Sheet (Mobile Floating Sheet / Desktop Centered Modal) */}
      {mounted && acceptingRequest && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+16px)] sm:p-4 animate-in fade-in duration-200">
          <style dangerouslySetInnerHTML={{ __html: `
            .hide-native-picker::-webkit-calendar-picker-indicator {
              opacity: 0 !important;
              cursor: pointer !important;
              position: absolute !important;
              right: 8px !important;
              top: 0 !important;
              bottom: 0 !important;
              width: 24px !important;
              height: auto !important;
              z-index: 10 !important;
            }
          `}} />
          <div className="bg-[#121212] border border-[#262626] w-full sm:max-w-md rounded-2xl flex flex-col shadow-xl max-h-full overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#262626] shrink-0">
              <div>
                <h3 className="text-lg font-bold text-[#F5F5F5]">รับคำขอจอง</h3>
                <p className="text-xs text-[#737373] mt-0.5">ตรวจสอบราคา เงินมัดจำ และกำหนดวันเวลานัดหมายจริง</p>
              </div>
              {!isSubmittingAccept && !acceptSuccessMessage && (
                <button
                  type="button"
                  onClick={() => setAcceptingRequest(null)}
                  className="p-1.5 rounded-full bg-[#171717] hover:bg-[#262626] text-[#F5F5F5] w-9 h-9 flex items-center justify-center cursor-pointer shrink-0"
                >
                  <X className="h-5 w-5 text-white" />
                </button>
              )}
            </div>

            {/* Success state */}
            {acceptSuccessMessage ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-3 min-h-[300px]">
                <div className="h-12 w-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400 text-2xl font-bold">
                  ✓
                </div>
                <h4 className="text-lg font-semibold text-[#F5F5F5]">{acceptSuccessMessage}</h4>
                <p className="text-sm text-[#A3A3A3]">{acceptSuccessSubtext}</p>
                <button
                  type="button"
                  onClick={() => setAcceptingRequest(null)}
                  className="mt-6 px-6 py-2.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black font-semibold rounded-lg text-sm transition-all w-full cursor-pointer"
                >
                  ตกลง
                </button>
              </div>
            ) : (
              <>
                {/* Scrollable Content Container */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                  {/* Reference time */}
                  <div className="bg-[#171717] border border-[#262626] rounded-xl p-3.5 space-y-2">
                    <span className="text-[10px] text-[#737373] font-semibold uppercase tracking-wider block">เวลาที่ลูกค้าแจ้งไว้</span>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[#A3A3A3] block mb-0.5">วันที่ลูกค้าสะดวก</span>
                        <span className="font-semibold text-[#F5F5F5]">
                          {formatThaiDate(acceptingRequest.requested_start_at)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#A3A3A3] block mb-0.5">เวลาที่ลูกค้าสะดวก</span>
                        <span className="font-semibold text-[#F5F5F5]">
                          {formatThaiTime(acceptingRequest.requested_start_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-4">
                    {/* Price */}
                    <div>
                      <label className="text-xs text-[#A3A3A3] font-semibold block mb-1.5">ราคางานสัก (บาท)</label>
                      {(() => {
                        const isFlash = !!acceptingRequest?.flash_design_id || !!acceptingRequest?.project?.flash_design_id;
                        return (
                          <>
                            <input
                              type="number"
                              min="0"
                              value={agreedPrice}
                              onChange={(e) => setAgreedPrice(e.target.value)}
                              placeholder="เช่น 3500"
                              readOnly={isFlash}
                              className={`w-full bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#F5F5F5]/30 ${isFlash ? 'opacity-60 bg-neutral-900 cursor-not-allowed' : ''}`}
                            />
                            {isFlash && (
                              <p className="text-[11px] text-[#A3A3A3] mt-1">
                                ราคาถูกกำหนดตามลาย Flash แล้วและไม่สามารถแก้ไขได้
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Deposit */}
                    <div>
                      <label className="text-xs text-[#A3A3A3] font-semibold block mb-1.5">เงินมัดจำ (บาท)</label>
                      <input
                        type="number"
                        min="0"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="เช่น 1000 (ใส่ 0 หากไม่ต้องการมัดจำ)"
                        className="w-full bg-[#171717] border border-[#262626] rounded-lg px-3 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#F5F5F5]/30"
                      />
                      {depositAmount !== '' && agreedPrice !== '' && Number(depositAmount) > Number(agreedPrice) && (
                        <span className="text-[11px] text-red-400 mt-1 block font-medium">เงินมัดจำต้องไม่เกินราคางานสัก</span>
                      )}
                    </div>

                    {/* Confirmed Date */}
                    <div>
                      <label className="text-xs text-[#A3A3A3] font-semibold block mb-1.5">วันที่นัดหมายจริง</label>
                      <ThaiBuddhistDatePicker
                        value={confirmedDate}
                        onChange={setConfirmedDate}
                        minDate={bkkTodayStr}
                        dayMeta={dayMeta}
                      />
                      {confirmedDate !== '' && confirmedDate < bkkTodayStr && (
                        <span className="text-[11px] text-red-400 mt-1 block font-medium">ไม่สามารถเลือกวันที่ย้อนหลังได้</span>
                      )}

                      {/* Selected Day Schedule Summary */}
                      {confirmedDate !== '' && (
                        <div className="mt-3 p-3.5 bg-[#171717]/60 border border-[#262626] rounded-xl space-y-2">
                          <span className="text-[10px] text-[#737373] font-semibold uppercase tracking-wider block">คิวของวันที่เลือก</span>
                          {isLoadingSchedule ? (
                            <p className="text-xs text-[#737373] animate-pulse">กำลังโหลดคิว...</p>
                          ) : selectedDayEvents.length === 0 ? (
                            <p className="text-xs text-[#737373]">วันนี้ยังไม่มีคิวนัด</p>
                          ) : (
                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                              {selectedDayEvents.map((evt, idx) => (
                                <div key={idx} className="flex flex-col text-xs py-1 border-b border-[#262626]/30 last:border-0">
                                  <span className={`font-medium ${evt.isHold ? 'text-[#737373]' : 'text-[#D4D4D4]'}`}>
                                    {evt.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Time Range */}
                    <div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-[#A3A3A3] font-semibold block mb-1.5">เวลาเริ่ม</label>
                          <div className="relative">
                            <select
                              value={startTime}
                              onChange={(e) => setStartTime(e.target.value)}
                              style={{ colorScheme: 'dark' }}
                              className="w-full bg-[#171717] border border-[#262626] rounded-lg pl-3 pr-10 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#F5F5F5]/30 appearance-none cursor-pointer"
                            >
                              <option value="" disabled>เลือกเวลา</option>
                              {TIME_SLOTS.map((time) => (
                                <option key={time} value={time}>{time}</option>
                              ))}
                            </select>
                            <Clock className="absolute right-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#F5F5F5] pointer-events-none opacity-95" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[#A3A3A3] font-semibold block mb-1.5">เวลาสิ้นสุด</label>
                          <div className="relative">
                            <select
                              value={endTime}
                              onChange={(e) => setEndTime(e.target.value)}
                              style={{ colorScheme: 'dark' }}
                              className="w-full bg-[#171717] border border-[#262626] rounded-lg pl-3 pr-10 py-2 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#F5F5F5]/30 appearance-none cursor-pointer"
                            >
                              <option value="" disabled>เลือกเวลา</option>
                              {TIME_SLOTS.map((time) => (
                                <option key={time} value={time}>{time}</option>
                              ))}
                            </select>
                            <Clock className="absolute right-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#F5F5F5] pointer-events-none opacity-95" />
                          </div>
                        </div>
                      </div>
                      {startTime !== '' && !TIME_SLOTS.includes(startTime) && (
                        <span className="text-[11px] text-red-400 mt-1 block font-medium">กรุณาเลือกเวลาเป็นช่วงทุก 30 นาที</span>
                      )}
                      {endTime !== '' && !TIME_SLOTS.includes(endTime) && (
                        <span className="text-[11px] text-red-400 mt-1 block font-medium">กรุณาเลือกเวลาเป็นช่วงทุก 30 นาที</span>
                      )}
                      {startTime !== '' && endTime !== '' && endTime <= startTime && (
                        <span className="text-[11px] text-red-400 mt-1 block font-medium">เวลาสิ้นสุดต้องหลังเวลาเริ่ม</span>
                      )}
                      {confirmedDate === bkkTodayStr && startTime !== '' && startTime <= bkkCurrentTime && (
                        <span className="text-[11px] text-red-400 mt-1 block font-medium">เวลานัดหมายต้องเป็นเวลาในอนาคต</span>
                      )}
                      {startTime !== '' && endTime !== '' && hasTimeConflict && (
                        <span className="text-[11px] text-red-400 mt-1 block font-medium">ช่วงเวลานี้มีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น</span>
                      )}
                    </div>
                  </div>

                  {/* Error message */}
                  {acceptError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2.5 rounded-lg flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{acceptError}</span>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="border-t border-[#262626] p-5 sm:p-6 bg-[#121212] shrink-0 flex gap-3">
                  <button
                    type="button"
                    disabled={isSubmittingAccept}
                    onClick={() => setAcceptingRequest(null)}
                    className="flex-1 px-4 py-2.5 border border-[#262626] hover:bg-[#262626] text-[#A3A3A3] hover:text-[#F5F5F5] font-semibold rounded-lg text-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingAccept || !isFormValid}
                    onClick={submitAcceptRequest}
                    className={`flex-1 px-4 py-2.5 font-semibold rounded-lg text-sm transition-all flex items-center justify-center gap-1.5 ${
                      isSubmittingAccept || !isFormValid
                        ? 'bg-[#262626] text-[#737373] cursor-not-allowed border border-[#262626]'
                        : 'bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black cursor-pointer'
                    }`}
                  >
                    {isSubmittingAccept ? 'กำลังบันทึก...' : 'ยืนยันรับคำขอ'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Slip Viewer Lightbox */}
      {mounted && viewingProofUrl && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setViewingProofUrl(null)}
        >
          <button
            onClick={() => setViewingProofUrl(null)}
            className="fixed top-[calc(env(safe-area-inset-top)+16px)] right-4 md:top-6 md:right-6 p-2 rounded-full bg-black/40 border border-white/12 text-white/85 hover:text-white hover:bg-black/65 transition-all z-[10000] focus:outline-none w-11 h-11 flex items-center justify-center"
          >
            <X className="h-6 w-6" strokeWidth={1.5} />
          </button>
          
          <div className="relative w-full max-w-[90vw] max-h-[85vh] h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewingProofUrl}
              alt="Payment Proof"
              className="max-w-full max-h-full object-contain rounded-md"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Invalid Payment Dialog */}
      {mounted && confirmInvalidRequest && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200" onClick={() => !isVerifyingPayment && setConfirmInvalidRequest(null)}>
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-2">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="text-lg font-medium text-[#F5F5F5]">ยืนยันว่าการชำระเงินไม่ถูกต้อง</h3>
              <p className="text-sm text-[#A3A3A3] leading-relaxed">
                เมื่อยืนยัน คำขอนี้จะสิ้นสุดและช่วงเวลาที่พักไว้จะถูกปล่อย
              </p>
            </div>
            {paymentError && (
              <div className="px-6 pb-2 text-center text-xs text-red-400">{paymentError}</div>
            )}
            <div className="border-t border-[#262626] p-4 flex gap-3 bg-[#121212]">
              <button
                type="button"
                disabled={isVerifyingPayment}
                onClick={() => setConfirmInvalidRequest(null)}
                className="flex-1 px-4 py-2 border border-[#262626] hover:bg-[#262626] text-[#A3A3A3] hover:text-[#F5F5F5] font-semibold rounded-lg text-sm transition-all disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isVerifyingPayment}
                onClick={() => handleVerifyFailed(confirmInvalidRequest.payment.id)}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg text-sm transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isVerifyingPayment ? 'กำลังดำเนินการ...' : 'ยืนยันว่าไม่ถูกต้อง'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Paid Payment Dialog */}
      {mounted && confirmPaidRequest && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200" onClick={() => !isVerifyingPayment && setConfirmPaidRequest(null)}>
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center space-y-4">
              <h3 className="text-lg font-medium text-[#F5F5F5]">ยืนยันการได้รับเงิน</h3>
              <p className="text-sm text-[#A3A3A3] leading-relaxed">
                ตรวจสอบสลิปและยอดเงินเรียบร้อยแล้วใช่หรือไม่
              </p>
              <div className="bg-[#121212] border border-[#262626] rounded-lg p-3 mt-4">
                <span className="text-xs text-[#737373] block mb-1">ยอดมัดจำ</span>
                <span className="text-lg font-semibold text-[#F5F5F5]">฿{confirmPaidRequest.payment.amount.toLocaleString()}</span>
              </div>
            </div>
            {paymentError && (
              <div className="px-6 pb-2 text-center text-xs text-red-400">{paymentError}</div>
            )}
            <div className="border-t border-[#262626] p-4 flex gap-3 bg-[#121212]">
              <button
                type="button"
                disabled={isVerifyingPayment}
                onClick={() => setConfirmPaidRequest(null)}
                className="flex-1 px-4 py-2 border border-[#262626] hover:bg-[#262626] text-[#A3A3A3] hover:text-[#F5F5F5] font-semibold rounded-lg text-sm transition-all disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isVerifyingPayment}
                onClick={() => handleVerifyPaid(confirmPaidRequest.payment.id)}
                className="flex-1 px-4 py-2 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black font-semibold rounded-lg text-sm transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {isVerifyingPayment ? 'กำลังยืนยัน...' : 'ยืนยันได้รับเงิน'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Verify Success Modal */}
      {mounted && verifySuccessMessage && createPortal(
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200">
          <div className="bg-[#171717] border border-[#262626] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4 border border-green-500/20">
              <span className="text-green-400 text-xl font-bold">✓</span>
            </div>
            <h3 className="text-lg font-medium text-[#F5F5F5] mb-2">{verifySuccessMessage.title}</h3>
            <p className="text-sm text-[#A3A3A3] leading-relaxed mb-6">
              {verifySuccessMessage.desc}
            </p>
            <button
              type="button"
              onClick={() => setVerifySuccessMessage(null)}
              className="w-full px-4 py-2 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-black font-semibold rounded-lg text-sm transition-all"
            >
              ตกลง
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
