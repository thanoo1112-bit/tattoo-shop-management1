export type ViewMode = 'MONTH' | 'QUEUE' | 'WEEK' | 'DAY';

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WAITING_DEPOSIT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

export interface CalendarArtist {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  working_days?: string[] | null;
  styles?: string[] | null;
  specialties?: string[] | null;
}

export interface CalendarCustomer {
  id?: string | null;
  user_id?: string | null;
  display_name: string;
  phone: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  has_medical_condition?: boolean | null;
  medical_condition_note?: string | null;
  has_allergy?: boolean | null;
  allergy_note?: string | null;
}

export interface CalendarFinancialSummary {
  booking_id: string;
  quoted_price: number;
  deposit_required: number;
  paid_total: number;
  remaining_balance: number;
  deposit_paid: boolean;
  is_fully_paid: boolean;
}

export interface CalendarSessionEvent {
  id: string;
  booking_id: string;
  artist_id: string;
  session_number: number;
  total_sessions_count?: number;
  start_at: string;
  end_at: string;
  status: SessionStatus;
  note: string | null;
  created_at: string;
  // Joined Relations
  artist?: CalendarArtist | null;
  booking?: {
    id: string;
    customer_id?: string | null;
    status: BookingStatus;
    customer_user_id?: string | null;
    requested_date: string;
    requested_start_time: string | null;
    customer_note: string | null;
    admin_note: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at?: string | null;
    approved_at?: string | null;
    estimate_request_id?: string | null;
    style_preference?: string | null;
    placement?: string | null;
    width_cm?: number | null;
    height_cm?: number | null;
    work_type?: string | null;
    description?: string | null;
    reference_images?: string[] | null;
    sessions?: Array<{
      id?: string;
      session_number?: number;
      status?: string | null;
      start_at?: string | null;
      end_at?: string | null;
    }> | null;
  } | null;
  estimate?: {
    id: string;
    style?: string | null;
    width_cm?: number | null;
    height_cm?: number | null;
    placement?: string | null;
    reference_images?: string[] | null;
    work_type?: string | null;
    description?: string | null;
    quoted_price?: number | null;
    deposit_required?: number | null;
  } | null;
  customer?: CalendarCustomer | null;
  financial?: CalendarFinancialSummary | null;
}

export interface CalendarSummaryMetrics {
  todaySessionsCount: number;
  inProgressCount: number;
  confirmedCount?: number;
  waitingDepositCount?: number;
  activeArtistsCount: number;
}
