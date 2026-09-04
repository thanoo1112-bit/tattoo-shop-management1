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
  quoted_price: number | null;
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
}

export interface CustomerPortalBooking {
  id: string;
  customer_user_id: string;
  artist_id: string;
  estimate_request_id: string | null;
  booking_source?: string;
  source_ref?: string | null;
  artwork_title?: string | null;
  artwork_image_url?: string | null;
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
