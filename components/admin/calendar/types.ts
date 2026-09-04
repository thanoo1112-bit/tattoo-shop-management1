export type ViewMode = 'MONTH' | 'WEEK' | 'DAY';

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WAITING_DEPOSIT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface CalendarArtist {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  working_days?: string[] | null;
  styles?: string[] | null;
}

export interface CalendarCustomer {
  user_id: string;
  display_name: string;
  phone: string | null;
  email: string | null;
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
  start_at: string;
  end_at: string;
  status: SessionStatus;
  note: string | null;
  created_at: string;
  // Joined Relations
  artist?: CalendarArtist | null;
  booking?: {
    id: string;
    status: BookingStatus;
    customer_user_id: string;
    requested_date: string;
    requested_start_time: string | null;
    customer_note: string | null;
    admin_note: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
  } | null;
  customer?: CalendarCustomer | null;
  financial?: CalendarFinancialSummary | null;
}

export interface CalendarSummaryMetrics {
  todaySessionsCount: number;
  inProgressCount: number;
  waitingDepositCount: number;
  activeArtistsCount: number;
}
