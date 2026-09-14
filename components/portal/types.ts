export type EstimateStatus = 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'WAITING_DEPOSIT'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export type SessionStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface CustomerPortalArtist {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url?: string | null;
  specialties?: string[] | null;
  working_days?: string[] | null;
  base_price?: number | null;
}

export interface CustomerPortalSession {
  id: string;
  booking_id: string;
  artist_id: string;
  session_number: number;
  start_at: string;
  end_at: string;
  status: SessionStatus;
  note: string | null;
  created_at: string;
  artist?: CustomerPortalArtist | null;
}

export interface CustomerPortalFinancialSummary {
  booking_id: string;
  estimate_request_id?: string | null;
  customer_user_id: string;
  artist_id?: string | null;
  quoted_price: number | null;
  deposit_required: number | null;
  paid_total: number;
  remaining_balance: number | null;
  deposit_paid: boolean;
  is_fully_paid: boolean;
}

export type TattooWorkType = 'NEW_TATTOO' | 'REWORK' | 'COVER_UP' | 'SCAR_COVER';

export type ColorTechnique = 'LINEWORK' | 'BLACK_AND_GREY' | 'FULL_COLOR';

export type EstimatedSizeTier = 'MICRO' | 'SMALL_MED' | 'LARGE' | 'XL' | 'FULL_PROJECT';

export interface CustomerPortalEstimate {
  id: string;
  customer_user_id: string;
  artist_id: string | null;
  reference_images: string[];
  width_cm: number;
  height_cm: number;
  placement: string;
  style: string;
  description: string;
  preferred_date: string | null;
  status: EstimateStatus;
  request_type?: 'ESTIMATE' | 'DIRECT_BOOKING';
  service_type?: string | null;
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
  estimated_duration_minutes: number | null;
  deposit_required: number | null;
  quote_note: string | null;
  quoted_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_at: string;
  // Joined artist
  artist?: CustomerPortalArtist | null;
  // Linked booking if already booked
  booking_id?: string | null;
  has_pending_payment_submission?: boolean;
}

export interface CustomerPortalBooking {
  id: string;
  customer_user_id: string;
  artist_id: string;
  estimate_request_id: string | null;
  booking_source?: string;
  source_ref?: string | null;
  artwork_title?: string | null;
  style?: string | null;
  service_type?: string | null;
  work_type?: TattooWorkType | string | null;
  artwork_image_url?: string | null;
  reference_images?: string[] | null;
  placement?: string | null;
  width_cm?: number | null;
  height_cm?: number | null;
  description?: string | null;
  requested_date: string;
  requested_start_time: string | null;
  customer_note: string | null;
  admin_note: string | null;
  rejection_reason?: string | null;
  status: BookingStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  has_pending_payment_submission?: boolean;
  // Joined Relations
  artist?: CustomerPortalArtist | null;
  sessions: CustomerPortalSession[];
  financial?: CustomerPortalFinancialSummary | null;
}

export interface NextAppointmentInfo {
  session: CustomerPortalSession;
  booking: CustomerPortalBooking;
  artist: CustomerPortalArtist | null;
}

export type SubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface BookingPaymentSubmission {
  id: string;
  booking_id: string;
  customer_user_id: string;
  claimed_amount: number;
  slip_path: string;
  reference_no?: string | null;
  customer_note?: string | null;
  status: SubmissionStatus;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSetting {
  id: string;
  payment_qr_path?: string | null;
  payment_display_name?: string | null;
  bank_name?: string | null;
  account_no?: string | null;
  account_name?: string | null;
  promptpay_id?: string | null;
  payment_instruction?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
}

