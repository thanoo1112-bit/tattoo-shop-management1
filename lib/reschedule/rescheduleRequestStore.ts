/**
 * 157 TATTOO — Real Supabase Reschedule Request Service
 * Backed by table: public.booking_reschedule_requests & security definer RPCs.
 */

import { createClient } from '@/lib/supabase/client';

export type RescheduleRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface RescheduleRequest {
  id: string; // UUID
  booking_id: string; // UUID
  session_id?: string | null;
  customer_user_id: string;
  artist_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  artist_name?: string | null;
  original_date: string; // YYYY-MM-DD (Asia/Bangkok)
  original_start_time: string; // HH:MM
  original_end_time?: string | null; // HH:MM
  requested_date: string; // YYYY-MM-DD
  requested_start_time: string; // HH:MM
  requested_end_time?: string | null; // HH:MM
  reason: string;
  status: RescheduleRequestStatus;
  requested_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
  updated_at?: string;
  booking?: any;
}

const CHANGE_EVENT = '157-reschedule-requests-changed';
export const LEGACY_STORAGE_KEY = '157_reschedule_requests_prototype';

// Safe one-time cleanup of legacy prototype localStorage key
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (_) {}
}

/** Feature is enabled in all environments by default unless explicitly disabled with NEXT_PUBLIC_RESCHEDULE_ENABLED=off */
export function isRescheduleRequestUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RESCHEDULE_ENABLED !== 'off';
}

/** Reschedule requests are now backed by real Supabase tables */
export const RESCHEDULE_REQUESTS_PROTOTYPE_MODE = false;

export function normalizeBookingUuid(id?: string | null): string {
  return String(id || '').trim().toLowerCase();
}

// In-memory cache for synchronous component access (e.g., calendar cells and badges)
const memoryCache = new Map<string, RescheduleRequest>();
let isInitialized = false;
let realtimeChannel: any = null;

function broadcastChange() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch (_) {}
}

export function normalizeRescheduleRecord(raw: any): RescheduleRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const bookingId = normalizeBookingUuid(raw.booking_id ?? raw.bookingId);
  if (!bookingId) return null;

  const rawStatus = String(raw.status || 'PENDING').trim().toUpperCase();
  const status: RescheduleRequestStatus =
    rawStatus === 'APPROVED' ? 'APPROVED' : rawStatus === 'REJECTED' ? 'REJECTED' : rawStatus === 'CANCELLED' ? 'CANCELLED' : 'PENDING';

  return {
    id: String(raw.id),
    booking_id: bookingId,
    session_id: raw.session_id ?? raw.sessionId ?? null,
    customer_user_id: String(raw.customer_user_id ?? raw.customerUserId ?? raw.requested_by ?? ''),
    artist_id: String(raw.artist_id ?? raw.artistId ?? ''),
    customer_name: raw.customer_name ?? raw.customerName ?? null,
    customer_phone: raw.customer_phone ?? raw.customerPhone ?? null,
    artist_name: raw.artist_name ?? raw.artistName ?? null,
    original_date: String(raw.original_date ?? raw.originalDate ?? ''),
    original_start_time: String(raw.original_start_time ?? raw.originalStartTime ?? '').slice(0, 5),
    original_end_time: raw.original_end_time ? String(raw.original_end_time).slice(0, 5) : null,
    requested_date: String(raw.requested_date ?? raw.requestedDate ?? ''),
    requested_start_time: String(raw.requested_start_time ?? raw.requestedStartTime ?? '').slice(0, 5),
    requested_end_time: raw.requested_end_time ? String(raw.requested_end_time).slice(0, 5) : null,
    reason: String(raw.reason ?? ''),
    status,
    requested_by: raw.requested_by ?? raw.customer_user_id ?? null,
    reviewed_by: raw.reviewed_by ?? null,
    reviewed_at: raw.reviewed_at ?? null,
    review_note: raw.review_note ?? null,
    created_at: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
    booking: raw.booking ?? raw.bookings ?? null,
  };
}

/** Read all cached reschedule requests */
export function readAll(): RescheduleRequest[] {
  return Array.from(memoryCache.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Get pending request for a specific booking ID from cache */
export function getPendingRescheduleRequest(bookingId: string): RescheduleRequest | null {
  const target = normalizeBookingUuid(bookingId);
  if (!target) return null;
  return Array.from(memoryCache.values()).find((r) => r.booking_id === target && r.status === 'PENDING') || null;
}

/** Get latest request for a booking ID from cache (prioritizing PENDING) */
export function getLatestRescheduleRequest(bookingId: string): RescheduleRequest | null {
  const target = normalizeBookingUuid(bookingId);
  if (!target) return null;
  const list = Array.from(memoryCache.values())
    .filter((r) => r.booking_id === target)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return list.find((r) => r.status === 'PENDING') || list[0] || null;
}

/** Fetch reschedule requests from Supabase and update cache (flexible filter) */
export async function fetchBookingRescheduleRequests(
  filter?: string | { bookingId?: string; artistId?: string; status?: RescheduleRequestStatus }
): Promise<RescheduleRequest[]> {
  const bookingId = typeof filter === 'string' ? filter : filter?.bookingId;
  const artistId = typeof filter === 'object' ? filter?.artistId : undefined;
  const status = typeof filter === 'object' ? filter?.status : undefined;

  try {
    const supabase = createClient();
    let query = supabase
      .from('booking_reschedule_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (bookingId) {
      const target = normalizeBookingUuid(bookingId);
      if (target) query = query.eq('booking_id', target);
    }
    if (artistId) {
      query = query.eq('artist_id', artistId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    const items: RescheduleRequest[] = [];
    for (const raw of data) {
      const rec = normalizeRescheduleRecord(raw);
      if (rec) {
        memoryCache.set(rec.id, rec);
        items.push(rec);
      }
    }
    broadcastChange();
    return items;
  } catch (err) {
    console.error('[RescheduleStore] Error fetching requests:', err);
    return [];
  }
}

/** Fetch all active/pending reschedule requests from Supabase */
export async function hydrateRescheduleRequests(): Promise<RescheduleRequest[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('booking_reschedule_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error || !data) return readAll();

    memoryCache.clear();
    const list: RescheduleRequest[] = [];
    for (const raw of data) {
      const rec = normalizeRescheduleRecord(raw);
      if (rec) {
        memoryCache.set(rec.id, rec);
        list.push(rec);
      }
    }
    isInitialized = true;
    broadcastChange();
    return list;
  } catch (err) {
    console.error('[RescheduleStore] Error hydrating reschedule requests:', err);
    return readAll();
  }
}

/** Submit customer reschedule request via Supabase RPC */
export async function customerSubmitRescheduleRequest(params: {
  bookingId: string;
  requestedDate: string;
  requestedStartTime: string;
  requestedEndTime?: string | null;
  reason: string;
  sessionId?: string | null;
}): Promise<{ success: boolean; message?: string; request?: RescheduleRequest }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('customer_submit_reschedule_request', {
    p_booking_id: params.bookingId,
    p_requested_date: params.requestedDate,
    p_requested_start_time: params.requestedStartTime,
    p_requested_end_time: params.requestedEndTime || null,
    p_reason: params.reason,
    p_session_id: params.sessionId || null,
  });

  if (error) {
    throw new Error(error.message || 'เกิดข้อผิดพลาดในการส่งคำขอเลื่อนนัด');
  }

  const rawReq = data?.request;
  const normalized = normalizeRescheduleRecord(rawReq);
  if (normalized) {
    memoryCache.set(normalized.id, normalized);
    broadcastChange();
  }

  return {
    success: Boolean(data?.success),
    message: data?.message,
    request: normalized || undefined,
  };
}

/** Legacy alias for backwards compatibility */
export const createRescheduleRequest = (input: any): RescheduleRequest => {
  // Synchronous stub for backward compat if synchronous caller remains
  const normalized = normalizeRescheduleRecord({
    ...input,
    id: `rr_${Date.now()}`,
    status: 'PENDING',
    created_at: new Date().toISOString(),
  });
  if (normalized) {
    memoryCache.set(normalized.id, normalized);
    broadcastChange();
    // Fire async RPC in background
    customerSubmitRescheduleRequest({
      bookingId: input.booking_id,
      requestedDate: input.requested_date,
      requestedStartTime: input.requested_start_time,
      requestedEndTime: input.requested_end_time,
      reason: input.reason,
      sessionId: input.session_id,
    }).catch(console.error);
    return normalized;
  }
  throw new Error('Invalid input');
};

/** Cancel customer's own pending reschedule request via RPC */
export async function customerCancelRescheduleRequest(
  requestId: string
): Promise<{ success: boolean; message?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('customer_cancel_reschedule_request', {
    p_reschedule_request_id: requestId,
  });

  if (error) {
    throw new Error(error.message || 'เกิดข้อผิดพลาดในการยกเลิกคำขอเลื่อนนัด');
  }

  const existing = memoryCache.get(requestId);
  if (existing) {
    existing.status = 'CANCELLED';
    memoryCache.set(requestId, existing);
    broadcastChange();
  }

  return {
    success: Boolean(data?.success),
    message: data?.message,
  };
}

/** Staff (Admin / Assigned Artist) review reschedule request via RPC */
export async function staffReviewRescheduleRequest(params: {
  requestId: string;
  action: 'APPROVE' | 'REJECT';
  reviewNote?: string | null;
}): Promise<{ success: boolean; message?: string; action?: string; new_date?: string; new_start_time?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('staff_review_reschedule_request', {
    p_reschedule_request_id: params.requestId,
    p_action: params.action,
    p_review_note: params.reviewNote || null,
  });

  if (error) {
    throw new Error(error.message || 'เกิดข้อผิดพลาดในการพิจารณาคำขอเลื่อนนัด');
  }

  const existing = memoryCache.get(params.requestId);
  if (existing) {
    existing.status = params.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    existing.review_note = params.reviewNote || null;
    existing.reviewed_at = new Date().toISOString();
    memoryCache.set(params.requestId, existing);
    broadcastChange();
  }

  return {
    success: Boolean(data?.success),
    message: data?.message,
    action: data?.action,
    new_date: data?.new_date,
    new_start_time: data?.new_start_time,
  };
}

/** Legacy alias for backwards compatibility with existing components */
export const reviewRescheduleRequest = (
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reviewer: { reviewed_by?: string | null; review_note?: string | null }
): RescheduleRequest | null => {
  const existing = memoryCache.get(id);
  if (existing) {
    existing.status = status;
    existing.review_note = reviewer.review_note ?? null;
    existing.reviewed_by = reviewer.reviewed_by ?? null;
    existing.reviewed_at = new Date().toISOString();
    memoryCache.set(id, existing);
    broadcastChange();

    staffReviewRescheduleRequest({
      requestId: id,
      action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
      reviewNote: reviewer.review_note,
    }).catch(console.error);

    return existing;
  }
  return null;
};

/** Subscribe to changes (window event + Supabase realtime channel) */
export function subscribeRescheduleRequests(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(CHANGE_EVENT, cb);

  if (!isInitialized) {
    hydrateRescheduleRequests().then(cb).catch(() => {});
  }

  // Setup Supabase Realtime channel once
  const supabase = createClient();
  if (!realtimeChannel) {
    realtimeChannel = supabase
      .channel('reschedule_requests_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_reschedule_requests' },
        (payload: any) => {
          const newRec = normalizeRescheduleRecord(payload.new);
          if (newRec) {
            memoryCache.set(newRec.id, newRec);
          } else if (payload.eventType === 'DELETE' && payload.old?.id) {
            memoryCache.delete(payload.old.id);
          }
          broadcastChange();
        }
      )
      .subscribe();
  }

  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}
