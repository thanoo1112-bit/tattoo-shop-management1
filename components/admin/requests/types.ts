export type EstimateStatus = 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | 'APPROVED' | 'COMPLETED';

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WAITING_DEPOSIT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

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

export type TattooWorkType = 'NEW_TATTOO' | 'CUSTOM_DESIGN' | 'REWORK' | 'COVER_UP' | 'SCAR_COVER';

export type ColorTechnique = 'LINEWORK' | 'BLACK_AND_GREY' | 'FULL_COLOR';

export type EstimatedSizeTier = 'MICRO' | 'SMALL_MED' | 'LARGE' | 'XL' | 'FULL_PROJECT';

export const getColorTechniqueLabel = (colorTechnique?: string | null): string => {
  if (!colorTechnique) return '';
  switch (colorTechnique) {
    case 'LINEWORK':
      return 'เส้น / Linework';
    case 'BLACK_AND_GREY':
      return 'ขาวดำและแรเงา';
    case 'FULL_COLOR':
      return 'งานสี';
    default:
      return colorTechnique;
  }
};

export const getTattooWorkTypeLabel = (workType?: string | null): string => {
  if (!workType) return 'งานสักใหม่';
  switch (workType) {
    case 'NEW_TATTOO':
      return 'งานสักใหม่';
    case 'CUSTOM_DESIGN':
      return 'งานออกแบบลาย';
    case 'REWORK':
      return 'แก้ไขงานสักเดิม';
    case 'COVER_UP':
      return 'แก้/ทับรอยสักเดิม';
    case 'SCAR_COVER':
      return 'สักทับรอยแผลเป็น';
    default:
      return 'งานสักใหม่';
  }
};

export interface EstimateDateOption {
  id: string;
  estimate_request_id: string;
  proposed_date: string;
  proposed_time: string;
  option_order: number;
  status: 'PENDING' | 'SELECTED' | 'UNAVAILABLE' | 'CANCELLED';
  created_at?: string;
}

export interface EstimateRequestItem {
  id: string;
  customer_id?: string | null;
  customer_user_id?: string | null;
  artist_id: string | null;
  placement: string;
  description: string;
  width_cm: number | null;
  height_cm: number | null;
  style_preference?: string | null;
  style?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  reference_images?: string[] | null;
  artwork_title?: string | null;
  status: EstimateStatus;
  request_type?: 'ESTIMATE' | 'DIRECT_BOOKING' | 'FLASH';
  work_type?: TattooWorkType | null;
  color_technique?: ColorTechnique | null;
  quoted_price: number | null;
  estimated_min_price?: number | null;
  estimated_max_price?: number | null;
  estimated_base_price_snapshot?: number | null;
  estimated_size_tier?: EstimatedSizeTier | string | null;
  estimated_size_multiplier?: number | null;
  estimated_color_multiplier?: number | null;
  estimated_work_type_multiplier?: number | null;
  estimated_range_factor?: number | null;
  estimated_rounding_increment?: number | null;
  price_estimated_at?: string | null;
  deposit_required: number | null;
  estimated_duration_minutes: number | null;
  quote_note: string | null;
  quoted_at: string | null;
  admin_reviewed_at?: string | null;
  has_medical_condition?: boolean | null;
  medical_condition_note?: string | null;
  has_allergy?: boolean | null;
  allergy_note?: string | null;
  eligibility_confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Proposed options fields
  is_date_proposed?: boolean;
  proposed_artist_note?: string | null;
  date_options?: EstimateDateOption[] | null;
  // Joined fields:
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  date_of_birth?: string | null;
  customer_dob?: string | null;
  is_age_confirmed?: boolean;
  artist_name: string;
  artist_nickname?: string | null;
  // Operational Status Hydration:
  linked_booking?: BookingItem | null;
  has_pending_payment_submission?: boolean;
  pending_submission?: PendingPaymentSubmission | null;
  operational_status?: OperationalStatusInfo;
  price_adjustments?: PriceAdjustmentItem[];
  flash_reservation?: {
    id: string;
    flash_design_id: string;
    customer_user_id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
    requested_date?: string | null;
    requested_start_time?: string | null;
    placement?: string | null;
    width_cm?: number | null;
    height_cm?: number | null;
    customer_note?: string | null;
    admin_note?: string | null;
    approved_at?: string | null;
    rejected_at?: string | null;
    cancelled_at?: string | null;
    completed_at?: string | null;
    created_at: string;
    flash_design?: {
      id: string;
      artist_id?: string;
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
  } | null;
}

export function resolveCustomerConfirmationStatus(customer?: {
  eligibility_confirmed_at?: string | null;
  profile_completed_at?: string | null;
} | null): boolean {
  if (!customer) return false;
  return Boolean(customer.eligibility_confirmed_at || customer.profile_completed_at);
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
  session_paid_amount?: number;
}

export interface PriceAdjustmentItem {
  id: string;
  booking_id: string;
  estimate_request_id?: string | null;
  previous_price: number;
  new_price: number;
  adjustment_amount: number;
  note?: string | null;
  adjusted_by: string;
  created_at: string;
}

export interface BookingFinancialData {
  quoted_price: number;
  deposit_required: number;
  deposit_paid_total?: number;
  additional_paid_total?: number;
  total_paid: number;
  remaining_balance: number;
  is_deposit_paid: boolean;
  is_fully_paid: boolean;
  initial_price?: number;
}

export interface BookingItem {
  id: string;
  customer_id?: string | null;
  customer_user_id?: string | null;
  artist_id: string | null;
  estimate_request_id: string | null;
  flash_reservation_id?: string | null;
  booking_source?: string | null;
  requested_date: string | null;
  requested_time?: string | null;
  requested_start_time?: string | null;
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
  date_of_birth?: string | null;
  customer_dob?: string | null;
  is_age_confirmed?: boolean;
  artist_name: string;
  artist_nickname?: string | null;
  // Tattoo Details
  artwork_title?: string | null;
  artwork_image_url?: string | null;
  placement?: string;
  width_cm?: number | null;
  height_cm?: number | null;
  estimated_size_tier?: string | null;
  size_label?: string | null;
  style_preference?: string | null;
  description?: string | null;
  reference_images?: string[] | null;
  work_type?: TattooWorkType | string | null;

  // Financial from booking_payment_summary & estimate snapshot
  estimated_min_price?: number | null;
  estimated_max_price?: number | null;
  price_estimated_at?: string | null;
  financial: BookingFinancialData;
  // Sessions
  sessions: BookingSessionItem[];
  // Health alert indicators
  has_medical_condition?: boolean | null;
  has_allergy?: boolean | null;
  // Operational status hydration:
  has_pending_payment_submission?: boolean;
  pending_submission?: PendingPaymentSubmission | null;
  operational_status?: OperationalStatusInfo;
  price_adjustments?: PriceAdjustmentItem[];
}

export interface RequestSummaryCounts {
  pendingEvaluationCount: number;
  waitingCustomerCount: number;
  waitingDepositCount: number;
  pendingSlipsCount: number;
  confirmedCount: number;
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
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function isMultiSessionIncompleteBooking(booking: BookingItem): {
  isIncomplete: boolean;
  totalSessions: number;
  completedSessions: number;
  remainingSessions: number;
} {
  const sessions = booking.sessions || [];
  const totalSessions = sessions.length;

  // 1. Exclude terminal/final or pre-deposit statuses (COMPLETED, CANCELLED, REJECTED, EXPIRED, WAITING_DEPOSIT, PENDING, APPROVED)
  const statusUpper = (booking.status || '').toUpperCase();
  if (
    statusUpper === 'COMPLETED' ||
    statusUpper === 'CANCELLED' ||
    statusUpper === 'REJECTED' ||
    statusUpper === 'EXPIRED' ||
    statusUpper === 'WAITING_DEPOSIT' ||
    statusUpper === 'PENDING' ||
    statusUpper === 'APPROVED'
  ) {
    return { isIncomplete: false, totalSessions, completedSessions: 0, remainingSessions: 0 };
  }

  // 2. Restrict to Custom Booking only (always return false for Flash in all cases)
  const isFlash =
    booking.booking_source === 'FLASH' ||
    (booking as any).request_type === 'FLASH' ||
    (booking as any).booking_type === 'FLASH' ||
    (booking as any).booking_type === 'flash' ||
    (booking as any).flash_design_id != null ||
    (booking as any).flash_catalog_id != null ||
    (booking as any).flash_reservation_id != null ||
    booking.work_type === 'FLASH';

  if (isFlash) {
    return { isIncomplete: false, totalSessions, completedSessions: 0, remainingSessions: 0 };
  }

  // Must have at least 1 session in booking_sessions (totalSessions >= 1)
  if (totalSessions < 1) {
    return { isIncomplete: false, totalSessions, completedSessions: 0, remainingSessions: 0 };
  }

  const completedSessions = sessions.filter((s) => s.status === 'COMPLETED').length;
  const remainingSessions = sessions.filter(
    (s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS'
  ).length;

  const isIncomplete = completedSessions > 0 && remainingSessions > 0;

  return {
    isIncomplete,
    totalSessions,
    completedSessions,
    remainingSessions,
  };
}

export function resolveEstimateOperationalStatus(
  request: { status: string },
  linkedBooking?: BookingItem | null,
  hasPendingSlip?: boolean
): OperationalStatusInfo {
  // 1. Terminal / Cancelled / Rejected / Expired
  if (request.status === 'CANCELLED' || request.status === 'EXPIRED') {
    return {
      key: 'CANCELLED',
      label: request.status === 'EXPIRED' ? 'หมดเวลาชำระมัดจำ' : 'ยกเลิก',
      badgeClass: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
    };
  }

  if (request.status === 'REJECTED') {
    return {
      key: 'REJECTED',
      label: 'ปฏิเสธ',
      badgeClass: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
    };
  }

  // 2. Pending Payment Submission (Pending Slip takes priority over WAITING_DEPOSIT / QUOTED)
  if (hasPendingSlip) {
    return {
      key: 'WAITING_SLIP_VERIFICATION',
      label: 'สลิปรอตรวจ',
      badgeClass: 'bg-amber-950/80 text-amber-300 border border-amber-800/80 animate-pulse',
    };
  }

  // 3. Evaluate linked booking lifecycle
  if (linkedBooking) {
    if (linkedBooking.status === 'CANCELLED' || (linkedBooking.status as string) === 'EXPIRED') {
      return {
        key: 'CANCELLED',
        label: (linkedBooking.status as string) === 'EXPIRED' ? 'หมดเวลาชำระมัดจำ' : 'ยกเลิก',
        badgeClass: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
      };
    }

    if (linkedBooking.status === 'REJECTED') {
      return {
        key: 'REJECTED',
        label: 'ปฏิเสธ',
        badgeClass: 'bg-zinc-900/90 text-zinc-400 border border-zinc-700/80',
      };
    }

    if (linkedBooking.status === 'COMPLETED') {
      return {
        key: 'COMPLETED',
        label: 'เสร็จสิ้น',
        badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
      };
    }

    if (linkedBooking.status === 'WAITING_DEPOSIT' || linkedBooking.status === 'PENDING') {
      return {
        key: 'WAITING_DEPOSIT',
        label: 'รอมัดจำ',
        badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
      };
    }

    const multiSessionInfo = isMultiSessionIncompleteBooking(linkedBooking);
    if (multiSessionInfo.isIncomplete) {
      return {
        key: 'MULTI_SESSION_INCOMPLETE',
        label: 'รอบสัก',
        badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
      };
    }

    const hasSessionInProgress = linkedBooking.sessions?.some((s) => s.status === 'IN_PROGRESS');
    if (linkedBooking.status === 'IN_PROGRESS' || hasSessionInProgress) {
      return {
        key: 'IN_PROGRESS',
        label: 'กำลังสัก',
        badgeClass: 'bg-amber-950/60 text-amber-400 border border-amber-800/60 animate-pulse',
      };
    }

    if (linkedBooking.status === 'CONFIRMED') {
      return {
        key: 'CONFIRMED',
        label: 'นัดหมายแล้ว',
        badgeClass: 'bg-blue-950/60 text-blue-400 border border-blue-800/60',
      };
    }
  }

  // 4. Initial Pending Request
  if (request.status === 'PENDING') {
    return {
      key: 'PENDING',
      label: 'รอตรวจสอบ',
      badgeClass: 'bg-blue-950/60 text-blue-400 border border-blue-800/60',
    };
  }

  // 5. Quoted or Accepted requests awaiting deposit
  if (request.status === 'QUOTED' || request.status === 'ACCEPTED') {
    return {
      key: 'WAITING_DEPOSIT',
      label: 'รอมัดจำ',
      badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
    };
  }

  return {
    key: 'WAITING_DEPOSIT',
    label: 'รอมัดจำ',
    badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
  };
}

export function resolveBookingOperationalStatus(
  booking: BookingItem,
  hasPendingSlip?: boolean
): OperationalStatusInfo {
  const isPendingSlip = hasPendingSlip ?? booking.has_pending_payment_submission ?? false;

  // 1. cancelled, rejected, or expired booking (Terminal statuses)
  const statusStr = booking.status as string;
  if (statusStr === 'CANCELLED' || statusStr === 'EXPIRED' || statusStr === 'REJECTED') {
    return {
      key: statusStr,
      label: statusStr === 'EXPIRED' ? 'หมดอายุ' : statusStr === 'REJECTED' ? 'ปฏิเสธ' : 'ยกเลิก',
      badgeClass: 'bg-red-950/60 text-red-400 border border-red-800/60',
    };
  }

  // 2. completed booking (Terminal status)
  if (booking.status === 'COMPLETED') {
    return {
      key: 'COMPLETED',
      label: 'งานเสร็จสิ้น',
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
    };
  }

  // 3. pending payment submission
  if (isPendingSlip) {
    return {
      key: 'WAITING_SLIP_VERIFICATION',
      label: 'สลิปรอตรวจ',
      badgeClass: 'bg-amber-950/80 text-amber-300 border border-amber-800/80 animate-pulse',
    };
  }

  // 4. multi-session incomplete status ("รอบสัก")
  const multiSession = isMultiSessionIncompleteBooking(booking);
  if (multiSession.isIncomplete) {
    return {
      key: 'MULTI_SESSION_INCOMPLETE',
      label: 'รอบสัก',
      badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
    };
  }

  // 5. active session / in progress
  const hasSessionInProgress = booking.sessions?.some((s) => s.status === 'IN_PROGRESS');
  if (booking.status === 'IN_PROGRESS' || hasSessionInProgress) {
    return {
      key: 'IN_PROGRESS',
      label: 'กำลังสัก',
      badgeClass: 'bg-amber-950/60 text-amber-400 border border-amber-800/60 animate-pulse',
    };
  }

  // 6. WAITING_DEPOSIT / PENDING
  if (booking.status === 'WAITING_DEPOSIT' || booking.status === 'PENDING') {
    return {
      key: 'WAITING_DEPOSIT',
      label: 'รอมัดจำ',
      badgeClass: 'bg-purple-950/60 text-purple-400 border border-purple-800/60',
    };
  }

  // 7. CONFIRMED (or default confirmed status)
  return {
    key: 'CONFIRMED',
    label: 'นัดหมายแล้ว',
    badgeClass: 'bg-blue-950/60 text-blue-400 border border-blue-800/60',
  };
}
