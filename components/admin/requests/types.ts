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

export interface EstimateRequestItem {
  id: string;
  customer_user_id: string;
  artist_id: string | null;
  placement: string;
  description: string;
  width_cm: number | null;
  height_cm: number | null;
  style_preference?: string | null;
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
  artist_name: string;
  artist_nickname?: string | null;
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
  artist_name: string;
  artist_nickname?: string | null;
  // Financial from booking_payment_summary
  financial: BookingFinancialData;
  // Sessions
  sessions: BookingSessionItem[];
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
