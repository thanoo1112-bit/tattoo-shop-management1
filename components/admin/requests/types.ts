export type EstimateStatus = 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WAITING_DEPOSIT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface OperationalStatusInfo {
  key: string;
  label: string;
  badgeClass: string;
}

export interface PendingPaymentSubmission {
  id: string;
  booking_id: string;
  status: string;
  claimed_amount: number;
  slip_path?: string | null;
  proof_image_url?: string | null;
  reference_no?: string | null;
  created_at?: string;
}

export interface EstimateRequestItem {
  id: string;
  customer_user_id: string;
  artist_id: string | null;
  placement: string;
  description: string;
  width_cm: number | null;
  height_cm: number | null;
  style_preference?: string | null;
  style?: string | null;
  preferred_date?: string | null;
  reference_images?: string[] | null;
  status: EstimateStatus;
  quoted_price: number | null;
  deposit_required: number | null;
  estimated_duration_minutes: number | null;
  quote_note: string | null;
  quoted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields:
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  is_age_confirmed?: boolean;
  artist_name: string;
  artist_nickname?: string | null;
  // Operational Status Hydration:
  linked_booking?: BookingItem | null;
  has_pending_payment_submission?: boolean;
  pending_submission?: PendingPaymentSubmission | null;
  operational_status?: OperationalStatusInfo;
}

export interface BookingSessionItem {
  id: string;
  booking_id: string;
  artist_id: string;
  session_number: number;
  start_at: string; // ISO string
  end_at: string;   // ISO string
  status: SessionStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingFinancialData {
  quoted_price: number;
  deposit_required: number;
  total_paid: number;
  remaining_balance: number;
  is_deposit_paid: boolean;
  is_fully_paid: boolean;
}

export interface BookingItem {
  id: string;
  customer_user_id: string;
  artist_id: string | null;
  estimate_request_id: string | null;
  requested_date: string | null;
  requested_time?: string | null;
  status: BookingStatus;
  started_at?: string | null;
  completed_at?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields:
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  is_age_confirmed?: boolean;
  artist_name: string;
  artist_nickname?: string | null;
  // Tattoo Details
  placement?: string;
  width_cm?: number | null;
  height_cm?: number | null;
  style_preference?: string | null;
  description?: string | null;
  reference_images?: string[] | null;

  // Financial from booking_payment_summary
  financial: BookingFinancialData;
  // Sessions
  sessions: BookingSessionItem[];
  // Operational status hydration:
  has_pending_payment_submission?: boolean;
  pending_submission?: PendingPaymentSubmission | null;
  operational_status?: OperationalStatusInfo;
}

export interface RequestSummaryCounts {
  newEstimatesCount: number;
  waitingDepositCount: number;
  confirmedCount: number;
  inProgressCount: number;
}

// ------------------------------------------------------------------
// Timezone Utilities (Asia/Bangkok = UTC+07:00)
// ------------------------------------------------------------------

export function toBangkokDateString(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatDateBangkok(isoOrDateStr: string): string {
  if (!isoOrDateStr) return 'ไม่ระบุ';
  try {
    const d = isoOrDateStr.includes('T') ? new Date(isoOrDateStr) : new Date(`${isoOrDateStr}T00:00:00+07:00`);
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return isoOrDateStr;
  }
}

export function formatDateTimeBangkok(isoString: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatTimeBangkok(isoString: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function resolveEstimateOperationalStatus(
  request: { status: string },
  linkedBooking?: BookingItem | null,
  hasPendingSlip?: boolean
): OperationalStatusInfo {
  // 1. estimate request still pending
  if (request.status === 'PENDING') {
    return {
      key: 'PENDING',
      label: 'รอตรวจสอบ',
      badgeClass: 'bg-blue-950/60 text-blue-400 border border-blue-800/60',
    };
  }

  // 2. request rejected
  if (request.status === 'REJECTED') {
    return {
      key: 'REJECTED',
      label: 'ปฏิเสธ',
      badgeClass: 'bg-red-950/60 text-red-400 border border-red-800/60',
    };
  }

  // If there is a linked booking, evaluate its lifecycle
  if (linkedBooking) {
    // 3. linked booking cancelled
    if (linkedBooking.status === 'CANCELLED') {
      return {
        key: 'CANCELLED',
        label: 'ยกเลิก',
        badgeClass: 'bg-gray-900/60 text-gray-400 border border-gray-700/60',
      };
    }

    // 4. linked payment submission = PENDING
    if (hasPendingSlip) {
      return {
        key: 'WAITING_SLIP_VERIFICATION',
        label: 'สลิปรอตรวจ',
        badgeClass: 'bg-amber-950/60 text-amber-400 border border-amber-800/60 animate-pulse',
      };
    }

    // 5. linked booking = WAITING_DEPOSIT and no pending slip
    if (linkedBooking.status === 'WAITING_DEPOSIT') {
      return {
        key: 'WAITING_DEPOSIT',
        label: 'รอมัดจำ',
        badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
      };
    }

    // 7. active session / booking in progress
    const hasSessionInProgress = linkedBooking.sessions?.some((s) => s.status === 'IN_PROGRESS');
    if (linkedBooking.status === 'IN_PROGRESS' || hasSessionInProgress) {
      return {
        key: 'IN_PROGRESS',
        label: 'กำลังดำเนินงาน',
        badgeClass: 'bg-studio-red/20 text-studio-red border border-studio-red/40 animate-pulse',
      };
    }

    // 8. completed booking
    if (linkedBooking.status === 'COMPLETED') {
      return {
        key: 'COMPLETED',
        label: 'เสร็จสิ้น',
        badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
      };
    }

    // 6. linked booking/session confirmed
    if (linkedBooking.status === 'CONFIRMED') {
      return {
        key: 'CONFIRMED',
        label: 'ยืนยันคิวแล้ว',
        badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
      };
    }
  }

  // Fallback for ACCEPTED request without linked booking yet
  if (request.status === 'ACCEPTED') {
    return {
      key: 'ACCEPTED',
      label: 'ยืนยันแล้ว',
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
    };
  }

  if (request.status === 'QUOTED') {
    return {
      key: 'QUOTED',
      label: 'เสนอราคาแล้ว',
      badgeClass: 'bg-amber-950/60 text-amber-400 border border-amber-800/60',
    };
  }

  return {
    key: request.status,
    label: request.status,
    badgeClass: 'bg-gray-800 text-gray-300 border border-gray-600',
  };
}

export function resolveBookingOperationalStatus(
  booking: BookingItem,
  hasPendingSlip?: boolean
): OperationalStatusInfo {
  const isPendingSlip = hasPendingSlip ?? booking.has_pending_payment_submission ?? false;

  // 1. cancelled booking
  if (booking.status === 'CANCELLED') {
    return {
      key: 'CANCELLED',
      label: 'ยกเลิก',
      badgeClass: 'bg-gray-900/60 text-gray-400 border border-gray-700/60',
    };
  }

  // 2. pending payment submission
  if (isPendingSlip) {
    return {
      key: 'WAITING_SLIP_VERIFICATION',
      label: 'สลิปรอตรวจ',
      badgeClass: 'bg-amber-950/60 text-amber-400 border border-amber-800/60 animate-pulse',
    };
  }

  // 3. WAITING_DEPOSIT with no pending submission
  if (booking.status === 'WAITING_DEPOSIT') {
    return {
      key: 'WAITING_DEPOSIT',
      label: 'รอมัดจำ',
      badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
    };
  }

  // 4. active session / in progress
  const hasSessionInProgress = booking.sessions?.some((s) => s.status === 'IN_PROGRESS');
  if (booking.status === 'IN_PROGRESS' || hasSessionInProgress) {
    return {
      key: 'IN_PROGRESS',
      label: 'กำลังดำเนินงาน',
      badgeClass: 'bg-studio-red/20 text-studio-red border border-studio-red/40 animate-pulse',
    };
  }

  // 5. completed booking
  if (booking.status === 'COMPLETED') {
    return {
      key: 'COMPLETED',
      label: 'เสร็จสิ้น',
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
    };
  }

  // 6. CONFIRMED
  if (booking.status === 'CONFIRMED') {
    return {
      key: 'CONFIRMED',
      label: 'ยืนยันคิวแล้ว',
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
    };
  }

  if (booking.status === 'APPROVED') {
    return {
      key: 'APPROVED',
      label: 'อนุมัติแล้ว',
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
    };
  }

  if (booking.status === 'PENDING') {
    return {
      key: 'PENDING',
      label: 'รออนุมัติคิว',
      badgeClass: 'bg-blue-950/60 text-blue-400 border border-blue-800/60',
    };
  }

  return {
    key: booking.status,
    label: booking.status,
    badgeClass: 'bg-gray-800 text-gray-300 border border-gray-600',
  };
}
