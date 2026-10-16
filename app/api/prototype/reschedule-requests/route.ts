import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const dynamic = 'force-dynamic';

const FILE_PATH = path.join(os.tmpdir(), '157_reschedule_requests_prototype.json');

const SEEDED_REQUESTS = [
  {
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
  },
];

function normalizeItem(raw: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  const bookingId = String(raw.booking_id || raw.bookingId || '').trim().toLowerCase();
  if (!bookingId) return null;
  const statusRaw = String(raw.status || 'PENDING').trim().toUpperCase();
  const status = statusRaw === 'APPROVED' ? 'APPROVED' : statusRaw === 'REJECTED' ? 'REJECTED' : 'PENDING';
  return {
    ...raw,
    id: String(raw.id || `rr_${Date.now().toString(36)}`),
    booking_id: bookingId,
    status,
    reviewed_by: status === 'PENDING' ? null : (raw.reviewed_by ?? raw.reviewedBy ?? null),
    reviewed_at: status === 'PENDING' ? null : (raw.reviewed_at ?? raw.reviewedAt ?? null),
    review_note: status === 'PENDING' ? null : (raw.review_note ?? raw.reviewNote ?? null),
  };
}

/**
 * Conflict-free merge between two copies of the same request ID:
 * - A reviewed state (APPROVED or REJECTED) ALWAYS wins over PENDING for the same request ID,
 *   preventing a stale tab's localStorage from reverting a reviewed request back to PENDING.
 * - If both are reviewed, the one with the newer reviewed_at timestamp wins.
 */
function mergeSameIdRecord(existing: any, incoming: any): any {
  const ex = normalizeItem(existing);
  const inc = normalizeItem(incoming);
  if (!ex) return inc;
  if (!inc) return ex;

  const exReviewed = ex.status === 'APPROVED' || ex.status === 'REJECTED';
  const incReviewed = inc.status === 'APPROVED' || inc.status === 'REJECTED';

  if (exReviewed && !incReviewed) {
    return ex;
  }
  if (!exReviewed && incReviewed) {
    return inc;
  }
  if (exReviewed && incReviewed) {
    const exTime = String(ex.reviewed_at || '');
    const incTime = String(inc.reviewed_at || '');
    return incTime >= exTime ? inc : ex;
  }
  return inc;
}

/**
 * Merge & deduplicate across existing and incoming items:
 * 1. Merge records with identical IDs using mergeSameIdRecord.
 * 2. Collapse legacy seed ID ('rr_seed_ffa5b820') into the real request for the same booking_id.
 * 3. If a booking has a reviewed request (with reviewed_at) and also a stale PENDING request
 *    created at or before reviewed_at (or for the exact same requested slot without a newer created_at),
 *    propagate the review status / drop the stale PENDING duplicate so old tabs cannot resurrect PENDING.
 */
function mergeAllItems(existingList: any[], incomingList: any[], forceReplaceIds?: Set<string>): any[] {
  const byId = new Map<string, any>();

  for (const raw of existingList) {
    const item = normalizeItem(raw);
    if (item) byId.set(item.id, item);
  }

  for (const raw of incomingList) {
    const item = normalizeItem(raw);
    if (!item) continue;
    if (forceReplaceIds && forceReplaceIds.has(item.id)) {
      byId.set(item.id, item);
    } else {
      const prev = byId.get(item.id);
      byId.set(item.id, prev ? mergeSameIdRecord(prev, item) : item);
    }
  }

  // Group by booking_id to clean up legacy seed IDs and stale pre-review PENDING duplicates
  const byBooking = new Map<string, any[]>();
  for (const item of Array.from(byId.values())) {
    const bId = item.booking_id;
    const arr = byBooking.get(bId) || [];
    arr.push(item);
    byBooking.set(bId, arr);
  }

  const finalItems: any[] = [];

  for (const [, group] of Array.from(byBooking.entries())) {
    if (group.length === 1) {
      finalItems.push(group[0]);
      continue;
    }

    // Find the most recently reviewed record in this booking group, if any
    const reviewedRecords = group
      .filter((r: any) => r.status === 'APPROVED' || r.status === 'REJECTED')
      .sort((a: any, b: any) => (String(a.reviewed_at || '') < String(b.reviewed_at || '') ? 1 : -1));
    const latestReviewed = reviewedRecords[0] || null;

    const nonSeedItems = group.filter((r: any) => r.id !== 'rr_seed_ffa5b820');
    const candidates = nonSeedItems.length > 0 ? nonSeedItems : group;

    for (const item of candidates) {
      if (item.status === 'PENDING' && latestReviewed) {
        const itemCreated = String(item.created_at || '');
        const revAt = String(latestReviewed.reviewed_at || '');
        const sameTargetSlot =
          item.requested_date === latestReviewed.requested_date &&
          item.requested_start_time === latestReviewed.requested_start_time;

        // If this PENDING item was created before the review happened (or is the same slot from before review),
        // it is the same request that was reviewed under a seed/duplicate ID.
        if ((revAt && itemCreated <= revAt) || (sameTargetSlot && (!revAt || itemCreated <= revAt))) {
          // If candidates doesn't already include latestReviewed (e.g. latestReviewed was rr_seed_ffa5b820),
          // apply the review metadata onto this real item; otherwise skip the stale duplicate.
          if (!candidates.some((c: any) => c.id === latestReviewed.id)) {
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

  return finalItems.sort((a, b) =>
    String(a.created_at || '') < String(b.created_at || '') ? 1 : -1
  );
}

function readStoreFile(): any[] {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      fs.writeFileSync(FILE_PATH, JSON.stringify(SEEDED_REQUESTS, null, 2), 'utf8');
      return [...SEEDED_REQUESTS];
    }
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...SEEDED_REQUESTS];
    return mergeAllItems([], parsed);
  } catch {
    return [...SEEDED_REQUESTS];
  }
}

function writeStoreFile(items: any[]) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf8');
  } catch {
    // ignore fs errors in restricted environments
  }
}

export async function GET() {
  const items = readStoreFile();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incoming: any[] = Array.isArray(body?.items)
      ? body.items
      : body?.item
      ? [body.item]
      : [];

    const forceIds = Array.isArray(body?.forceReplaceIds)
      ? new Set<string>(body.forceReplaceIds.map(String))
      : undefined;

    const existing = readStoreFile();
    const merged = mergeAllItems(existing, incoming, forceIds);
    writeStoreFile(merged);
    return NextResponse.json({ items: merged });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Invalid payload' }, { status: 400 });
  }
}
