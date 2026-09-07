// Types for Admin Payment Management UI
export interface BookingPaymentSummaryRow {
  booking_id: string;
  estimate_request_id: string | null;
  customer_user_id: string;
  artist_id: string | null;
  quoted_price: number;
  deposit_required: number;
  paid_total: number;
  remaining_balance: number;
  deposit_paid: boolean;
  is_fully_paid: boolean;
}

export interface BookingPaymentRecord {
  id: string;
  booking_id: string;
  payment_type: 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT' | 'OTHER';
  amount: number;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'QR' | 'OTHER';
  status: 'RECORDED' | 'VOIDED';
  paid_at: string;
  reference_no: string | null;
  note: string | null;
  created_by: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingSessionItem {
  id: string;
  session_number: number;
  start_at: string;
  end_at: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface PaymentBookingDetail {
  id: string;
  estimate_request_id: string | null;
  customer_user_id: string;
  artist_id: string | null;
  requested_date: string | null;
  booking_source?: string | null;
  status: 'PENDING' | 'APPROVED' | 'WAITING_DEPOSIT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  approved_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  
  // Relations
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  artist_name: string;
  artist_nickname: string | null;
  placement?: string;
  
  // Financial Summary from view
  summary: BookingPaymentSummaryRow;
  
  // Active Sessions
  sessions: BookingSessionItem[];
}

export type FinancialStatusFilter = 'ALL' | 'UNPAID' | 'PARTIAL' | 'PAID';
export type BookingStatusFilter = 'ALL' | 'WAITING_DEPOSIT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED';

export type SubmissionReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PaymentSubmissionDetail {
  id: string;
  booking_id: string;
  customer_user_id: string;
  claimed_amount: number;
  slip_path: string;
  reference_no?: string | null;
  customer_note?: string | null;
  status: SubmissionReviewStatus;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;

  // Joined metadata
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  artist_name: string;
  artist_nickname?: string | null;
  artwork_title?: string | null;
  artwork_image_url?: string | null;
  reference_images?: string[] | null;
  placement?: string | null;
  width_cm?: number | null;
  height_cm?: number | null;
  style?: string | null;
  description?: string | null;
  quoted_price?: number | null;
  requested_date?: string | null;
  booking_status: string;
  deposit_required: number;
  paid_total: number;
  outstanding_deposit: number;
  estimate_request_id?: string | null;
  estimate_reference_images?: string[] | null;
  sessions?: BookingSessionItem[];
}

export interface AdminPaymentSetting {
  id?: string;
  payment_qr_path?: string | null;
  payment_display_name?: string | null;
  bank_name?: string | null;
  account_no?: string | null;
  account_name?: string | null;
  promptpay_id?: string | null;
  payment_instruction?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

