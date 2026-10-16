/**
 * 157 TATTOO — Customer reschedule request store (FRONTEND PROTOTYPE).
 *
 * IMPORTANT: The database currently has NO table for reschedule requests, and this task
 * forbids schema/SQL/RPC changes. Requests are persisted in localStorage
 * (`157_reschedule_requests_prototype`) and synchronized across tabs/windows via
 * `storage` events, `BroadcastChannel`, and the local prototype endpoint
 * (`/api/prototype/reschedule-requests`).
 */

export type RescheduleRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface RescheduleRequest {
  id: string; // reschedule_request_id
  booking_id: string; // Full booking UUID (lowercase)
  artist_id: string | null;
  customer_name?: string | null;
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
}

export const STORAGE_KEY = '157_reschedule_requests_prototype';
const CHANGE_EVENT = '157-reschedule-requests-changed';
const BROADCAST_CHANNEL_NAME = '157_reschedule_requests_channel';
const SYNC_ENDPOINT = '/api/prototype/reschedule-requests';

const INITIAL_PROTOTYPE_SEED: RescheduleRequest = {
  id: 'rr_mvaixyp1_5xifcv',
  booking_id: 'ffa5b820-d249-43bd-8792-3a2cf979f2d4',
  artist_id: 'd5af5064-d973-4bbb-b205-1ab6b2929abb',
  customer_name: 'ต้นกล้า อามอ',
  original_date: '2026-10-16',
  original_start_time: '15:20',
  original_end_time: '17:20',
  requested_date: '2026-10-20',
  requested_start_time: '17:00',
  requested_end_time: '19:00',
  reason: 'ไม่สะดวกขอเลื่อน',
  status: 'PENDING',
  requested_by: '07cab141-a788-47aa-926a-1cbf7988fbf9',
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-10-16T05:25:41.989Z',
};

/** Prototype UI is enabled by default for local evaluation unless explicitly disabled. */
export function isRescheduleRequestUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RESCHEDULE_PROTOTYPE !== 'off';
}

/** True while requests are stored locally (no database table yet). */
export const RESCHEDULE_REQUESTS_PROTOTYPE_MODE = true;

export function normalizeBookingUuid(id?: string | null): string {
  return String(id || '').trim().toLowerCase();
}

function normalizeStatus(status?: string | null): RescheduleRequestStatus {
  const s = String(status || 'PENDING').trim().toUpperCase();
  if (s === 'APPROVED') return 'APPROVED';
  if (s === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

function normalizeRecord(raw: any): RescheduleRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const bookingId = normalizeBookingUuid(raw.booking_id ?? raw.bookingId);
  if (!bookingId) return null;
  const status = normalizeStatus(raw.status);
  return {
    id: String(raw.id || `rr_${Date.now().toString(36)}`),
    booking_id: bookingId,
    artist_id: raw.artist_id ?? raw.artistId ?? null,
    customer_name: raw.customer_name ?? raw.customerName ?? null,
    original_date: String(raw.original_date ?? raw.originalDate ?? ''),
    original_start_time: String(raw.original_start_time ?? raw.originalStartTime ?? '').slice(0, 5),
    original_end_time: raw.original_end_time
      ? String(raw.original_end_time).slice(0, 5)
      : raw.originalEndTime
      ? String(raw.originalEndTime).slice(0, 5)
      : null,
    requested_date: String(raw.requested_date ?? raw.requestedDate ?? ''),
    requested_start_time: String(raw.requested_start_time ?? raw.requestedStartTime ?? '').slice(0, 5),
    requested_end_time: raw.requested_end_time
      ? String(raw.requested_end_time).slice(0, 5)
      : raw.requestedEndTime
      ? String(raw.requestedEndTime).slice(0, 5)
      : null,
    reason: String(raw.reason ?? ''),
    status,
    requested_by: raw.requested_by ?? raw.requestedBy ?? null,
    reviewed_by: status === 'PENDING' ? null : (raw.reviewed_by ?? raw.reviewedBy ?? null),
    reviewed_at: status === 'PENDING' ? null : (raw.reviewed_at ?? raw.reviewedAt ?? null),
    review_note: status === 'PENDING' ? null : (raw.review_note ?? raw.reviewNote ?? null),
    created_at: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
  };
}

function mergeSameIdRecord(existing: RescheduleRequest, incoming: RescheduleRequest): RescheduleRequest {
  const exReviewed = existing.status === 'APPROVED' || existing.status === 'REJECTED';
  const incReviewed = incoming.status === 'APPROVED' || incoming.status === 'REJECTED';

  if (exReviewed && !incReviewed) return existing;
  if (!exReviewed && incReviewed) return incoming;
  if (exReviewed && incReviewed) {
    const exTime = String(existing.reviewed_at || '');
    const incTime = String(incoming.reviewed_at || '');
    return incTime >= exTime ? incoming : existing;
  }
  return incoming;
}

export function mergeRescheduleRequestLists(
  baseList: RescheduleRequest[],
  incomingList: RescheduleRequest[]
): RescheduleRequest[] {
  const byId = new Map<string, RescheduleRequest>();

  for (const raw of baseList) {
    const item = normalizeRecord(raw);
    if (item) byId.set(item.id, item);
  }

  for (const raw of incomingList) {
    const item = normalizeRecord(raw);
    if (!item) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? mergeSameIdRecord(prev, item) : item);
  }

  const byBooking = new Map<string, RescheduleRequest[]>();
  for (const item of Array.from(byId.values())) {
    const bId = normalizeBookingUuid(item.booking_id);
    const arr = byBooking.get(bId) || [];
    arr.push(item);
    byBooking.set(bId, arr);
  }

  const finalItems: RescheduleRequest[] = [];

  for (const [, group] of Array.from(byBooking.entries())) {
    if (group.length === 1) {
      finalItems.push(group[0]);
      continue;
    }

    const reviewedRecords = group
      .filter((r: RescheduleRequest) => r.status === 'APPROVED' || r.status === 'REJECTED')
      .sort((a: RescheduleRequest, b: RescheduleRequest) => (String(a.reviewed_at || '') < String(b.reviewed_at || '') ? 1 : -1));
    const latestReviewed = reviewedRecords[0] || null;

    const nonSeedItems = group.filter((r: RescheduleRequest) => r.id !== 'rr_seed_ffa5b820');
    const candidates = nonSeedItems.length > 0 ? nonSeedItems : group;

    for (const item of candidates) {
      if (item.status === 'PENDING' && latestReviewed) {
        const itemCreated = String(item.created_at || '');
        const revAt = String(latestReviewed.reviewed_at || '');
        const sameTargetSlot =
          item.requested_date === latestReviewed.requested_date &&
          item.requested_start_time === latestReviewed.requested_start_time;

        if ((revAt && itemCreated <= revAt) || (sameTargetSlot && (!revAt || itemCreated <= revAt))) {
          if (!candidates.some((c: RescheduleRequest) => c.id === latestReviewed.id)) {
            finalItems.push({
              ...item,
              status: latestReviewed.status,
              reviewed_by: latestReviewed.reviewed_by,
              reviewed_at: latestReviewed.reviewed_at,
              review_note: latestReviewed.review_note,
            });
          }
          continue;
        }
      }
      finalItems.push(item);
    }
  }

  return finalItems.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function broadcastChange() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch (_) {}
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.postMessage({ type: CHANGE_EVENT, ts: Date.now() });
      bc.close();
    }
  } catch (_) {}
}

export function readAll(): RescheduleRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: RescheduleRequest[] = Array.isArray(parsed)
      ? mergeRescheduleRequestLists([], parsed.map(normalizeRecord).filter(Boolean) as RescheduleRequest[])
      : [];

    const hasSeedBooking = list.some(
      (r) => normalizeBookingUuid(r.booking_id) === INITIAL_PROTOTYPE_SEED.booking_id
    );
    if (!hasSeedBooking) {
      const seeded = [INITIAL_PROTOTYPE_SEED, ...list];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      } catch (_) {}
      return seeded;
    }

    return list;
  } catch (_) {
    return [INITIAL_PROTOTYPE_SEED];
  }
}

function writeAll(list: RescheduleRequest[], syncServer: boolean = true, forceReplaceIds?: string[]) {
  if (typeof window === 'undefined') return;
  const normalized = mergeRescheduleRequestLists([], list);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (_) {}
  broadcastChange();

  if (syncServer) {
    fetch(SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: normalized, forceReplaceIds }),
      cache: 'no-store',
    }).catch(() => {});
  }
}

/**
 * Hydrate & synchronize localStorage with the local prototype endpoint so that
 * Customer and Artist/Admin views stay in sync across tabs/windows without overwriting
 * reviewed statuses (APPROVED / REJECTED) with stale PENDING copies.
 */
export async function hydrateRescheduleRequests(): Promise<RescheduleRequest[]> {
  if (typeof window === 'undefined') return [];
  const localList = readAll();

  try {
    // 1. Pull authoritative server state first via GET
    const getRes = await fetch(SYNC_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!getRes.ok) return localList;
    const getData = await getRes.json();
    const serverItems: RescheduleRequest[] = Array.isArray(getData?.items)
      ? (getData.items.map(normalizeRecord).filter(Boolean) as RescheduleRequest[])
      : [];

    // 2. Conflict-free merge: reviewed statuses (APPROVED/REJECTED) always win over stale PENDING
    const merged = mergeRescheduleRequestLists(serverItems, localList);

    const currentLocalRaw = window.localStorage.getItem(STORAGE_KEY);
    const mergedRaw = JSON.stringify(merged);
    if (currentLocalRaw !== mergedRaw) {
      window.localStorage.setItem(STORAGE_KEY, mergedRaw);
      broadcastChange();
    }

    // 3. Only push back to server if merged contains new/updated records not yet on server
    const serverRaw = JSON.stringify(mergeRescheduleRequestLists([], serverItems));
    if (serverRaw !== mergedRaw) {
      fetch(SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: merged }),
        cache: 'no-store',
      }).catch(() => {});
    }

    return merged;
  } catch (_) {}

  return localList;
}

/** Subscribe to changes (same tab + other tabs + window focus + periodic sync). Returns unsubscribe. */
export function subscribeRescheduleRequests(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === STORAGE_KEY) cb();
  };

  const onFocusOrVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    hydrateRescheduleRequests().then(() => cb()).catch(() => cb());
  };

  let bc: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      bc.onmessage = () => cb();
    }
  } catch (_) {}

  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', onFocusOrVisible);
  document.addEventListener('visibilitychange', onFocusOrVisible);

  // Initial hydration on mount
  hydrateRescheduleRequests().then(() => cb()).catch(() => {});

  // Lightweight periodic sync while tab is visible so side-by-side windows sync without focus clicks
  const intervalId = window.setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    hydrateRescheduleRequests().then(() => cb()).catch(() => {});
  }, 2500);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', onFocusOrVisible);
    document.removeEventListener('visibilitychange', onFocusOrVisible);
    if (bc) {
      try {
        bc.close();
      } catch (_) {}
    }
  };
}

export function getRescheduleRequestsForBooking(bookingId: string): RescheduleRequest[] {
  const target = normalizeBookingUuid(bookingId);
  if (!target) return [];
  return readAll()
    .filter((r) => normalizeBookingUuid(r.booking_id) === target)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function getPendingRescheduleRequest(bookingId: string): RescheduleRequest | null {
  return (
    getRescheduleRequestsForBooking(bookingId).find((r) => r.status === 'PENDING') || null
  );
}

export function getLatestRescheduleRequest(bookingId: string): RescheduleRequest | null {
  const list = getRescheduleRequestsForBooking(bookingId);
  // Always prioritize an active PENDING request if one exists for this booking
  return list.find((r) => r.status === 'PENDING') || list[0] || null;
}

export type CreateRescheduleRequestInput = Omit<
  RescheduleRequest,
  'id' | 'status' | 'created_at' | 'reviewed_by' | 'reviewed_at' | 'review_note'
>;

export function createRescheduleRequest(input: CreateRescheduleRequestInput): RescheduleRequest {
  const targetBookingId = normalizeBookingUuid(input.booking_id);
  const all = readAll().filter(
    (r) => !(r.id === 'rr_seed_ffa5b820' && normalizeBookingUuid(r.booking_id) === targetBookingId)
  );
  if (all.some((r) => normalizeBookingUuid(r.booking_id) === targetBookingId && r.status === 'PENDING')) {
    throw new Error('มีคำขอเลื่อนนัดที่กำลังรอพิจารณาอยู่แล้ว');
  }
  const created: RescheduleRequest = {
    ...input,
    booking_id: targetBookingId,
    id: `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'PENDING',
    created_at: new Date().toISOString(),
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  };
  writeAll([created, ...all], true, [created.id]);
  return created;
}

export function reviewRescheduleRequest(
  id: string,
  status: Exclude<RescheduleRequestStatus, 'PENDING'>,
  reviewer: { reviewed_by?: string | null; review_note?: string | null }
): RescheduleRequest | null {
  const all = readAll();
  const targetRecord = all.find((r) => r.id === id);
  const targetBookingId = targetRecord ? normalizeBookingUuid(targetRecord.booking_id) : null;
  const reviewedAt = new Date().toISOString();
  const nextStatus = normalizeStatus(status) as Exclude<RescheduleRequestStatus, 'PENDING'>;

  let updated: RescheduleRequest | null = null;
  const forceIds: string[] = [];

  const next = all.map((r) => {
    const isTargetId = r.id === id;
    const isSameBookingPending =
      targetBookingId && normalizeBookingUuid(r.booking_id) === targetBookingId && r.status === 'PENDING';

    if (!isTargetId && !isSameBookingPending) return r;

    const revItem: RescheduleRequest = {
      ...r,
      status: nextStatus,
      reviewed_by: reviewer.reviewed_by ?? null,
      reviewed_at: reviewedAt,
      review_note: reviewer.review_note ?? null,
    };
    forceIds.push(revItem.id);
    if (isTargetId || !updated) {
      updated = revItem;
    }
    return revItem;
  });

  if (updated) {
    writeAll(next, true, forceIds);
  }
  return updated;
}
