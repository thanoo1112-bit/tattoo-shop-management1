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

export type FinancialStatusFilter = 'ALL' | 'WAITING_DEPOSIT' | 'PARTIAL' | 'FULLY_PAID';
export type BookingStatusFilter = 'ALL' | 'WAITING_DEPOSIT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED';
