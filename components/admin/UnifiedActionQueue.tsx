'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ClipboardList,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Calendar,
  Clock,
  User,
  Layers,
  ArrowRight,
  Eye,
  FileText,
  DollarSign,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import PaymentSlipImage from '@/components/common/PaymentSlipImage';
import PaymentSubmissionReviewDrawer from '@/components/admin/payments/PaymentSubmissionReviewDrawer';
import EstimateDetailPanel from '@/components/admin/requests/EstimateDetailPanel';
import BookingDetailPanel from '@/components/admin/requests/BookingDetailPanel';
import { formatDateBangkok, formatTimeBangkok } from '@/components/admin/calendar/calendarUtils';

export type UnifiedQueueTab = 'all' | 'custom' | 'payments' | 'flash';

export interface UnifiedQueueItem {
  id: string;
  type: 'custom' | 'payment' | 'flash';
  created_at: string;

  // Common metadata
  customerName: string;
  customerPhone?: string;
  artistName: string;

  // Custom request specific
  estimateData?: any;
  bookingData?: any;

  // Payment specific
  submissionData?: any;
  depositRequired?: number;
  claimedAmount?: number;

  // Flash specific
  flashData?: any;
}

export default function UnifiedActionQueue() {
  const supabase = createClient();

  const [activeFilter, setActiveFilter] = useState<UnifiedQueueTab>('all');
  const [loading, setLoading] = useState(true);

  // Data lists
  const [items, setItems] = useState<UnifiedQueueItem[]>([]);

  // Drawers / Modals State
  const [selectedPaymentSub, setSelectedPaymentSub] = useState<any | null>(null);
  const [selectedEstimateReq, setSelectedEstimateReq] = useState<any | null>(null);
  const [selectedBookingReq, setSelectedBookingReq] = useState<any | null>(null);

  // Core Data Fetcher
  const fetchUnifiedQueue = useCallback(async (opts?: { isInitial?: boolean }) => {
    if (opts?.isInitial) {
      setLoading(true);
    }
    try {
      // 1. Fetch Artists
      const { data: artData } = await supabase.from('artists').select('id, name, nickname');
      const artMap = new Map<string, string>();
      (artData || []).forEach((a) => artMap.set(a.id, a.nickname ? `${a.name} (${a.nickname})` : a.name));

      // 2. Fetch Customers & Profiles
      const { data: custData } = await supabase
        .from('customers')
        .select('user_id, display_name, first_name, last_name, phone, email');
      const { data: profData } = await supabase.from('profiles').select('user_id, display_name, phone, email');

      const getCustomerInfo = (uid: string) => {
        const c = (custData || []).find((x) => x.user_id === uid);
        const p = (profData || []).find((x) => x.user_id === uid);
        const nameCandidate = c?.first_name
          ? `${c.first_name} ${c.last_name || ''}`.trim()
          : c?.display_name && c.display_name !== 'ลูกค้าประจำ'
          ? c.display_name
          : p?.display_name && p.display_name !== 'ลูกค้าประจำ'
          ? p.display_name
          : c?.email
          ? c.email.split('@')[0]
          : 'ลูกค้า';
        const phoneCandidate = p?.phone || c?.phone || '';
        return { name: nameCandidate, phone: phoneCandidate };
      };

      const unifiedList: UnifiedQueueItem[] = [];

      // A. Custom Tattoo Requests (PENDING estimate_requests)
      const { data: pendingEst } = await supabase
        .from('estimate_requests')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      (pendingEst || []).forEach((est: any) => {
        const custInfo = getCustomerInfo(est.customer_user_id);
        unifiedList.push({
          id: est.id,
          type: 'custom',
          created_at: est.created_at,
          customerName: custInfo.name,
          customerPhone: custInfo.phone,
          artistName: artMap.get(est.artist_id) || 'ช่างสักประจำร้าน',
          estimateData: {
            ...est,
            customer_name: custInfo.name,
            customer_phone: custInfo.phone,
            artist_name: artMap.get(est.artist_id),
          },
        });
      });

      // B. Payment Reviews (PENDING booking_payment_submissions)
      const { data: pendingSubs } = await supabase
        .from('booking_payment_submissions')
        .select('*')
        .eq('status', 'PENDING')
        .order('submitted_at', { ascending: false });

      if (pendingSubs && pendingSubs.length > 0) {
        const bookingIds = Array.from(new Set(pendingSubs.map((s: any) => s.booking_id)));
        const { data: rawBookings } = await supabase
          .from('bookings')
          .select('*, artists(id, name, nickname), booking_sessions(id, session_number, start_at, end_at, status)')
          .in('id', bookingIds);

        const estIds = Array.from(new Set((rawBookings || []).map((b: any) => b.estimate_request_id).filter(Boolean)));
        const { data: rawEstimates } = estIds.length > 0
          ? await supabase.from('estimate_requests').select('*').in('id', estIds)
          : { data: [] };

        const { data: rawFinancials } = await supabase
          .from('booking_payment_summary')
          .select('*')
          .in('booking_id', bookingIds);

        pendingSubs.forEach((sub: any) => {
          const b = (rawBookings || []).find((x: any) => x.id === sub.booking_id);
          const est = b?.estimate_request_id ? (rawEstimates || []).find((e: any) => e.id === b.estimate_request_id) : null;
          const f = (rawFinancials || []).find((x: any) => x.booking_id === sub.booking_id);
          const custInfo = getCustomerInfo(sub.customer_user_id);
          const artistObj: any = Array.isArray(b?.artists) ? b.artists[0] : b?.artists;
          const artistFormatted = artistObj
            ? `${artistObj.name}${artistObj.nickname ? ` (${artistObj.nickname})` : ''}`
            : (b ? artMap.get(b.artist_id) || 'ช่างสักประจำร้าน' : 'ช่างสักประจำร้าน');

          const depReq = Number(f?.deposit_required ?? est?.deposit_required ?? 0);
          const paidTotal = Number(f?.paid_total ?? 0);
          const outstanding = Math.max(0, depReq - paidTotal);

          unifiedList.push({
            id: sub.id,
            type: 'payment',
            created_at: sub.submitted_at,
            customerName: custInfo.name,
            customerPhone: custInfo.phone,
            artistName: artistFormatted,
            submissionData: {
              ...sub,
              customer_name: custInfo.name,
              customer_phone: custInfo.phone,
              artist_name: artistFormatted,
              artist_nickname: artistObj?.nickname || null,
              artwork_title: b?.artwork_title || est?.style || 'งานสัก Custom',
              artwork_image_url: b?.artwork_image_url || null,
              reference_images: b?.reference_images || null,
              placement: b?.placement || est?.placement || null,
              width_cm: b?.width_cm || est?.width_cm || null,
              height_cm: b?.height_cm || est?.height_cm || null,
              style: est?.style || null,
              description: est?.description || b?.description || null,
              quoted_price: Number(f?.quoted_price ?? est?.quoted_price ?? 0),
              deposit_required: depReq,
              paid_total: paidTotal,
              outstanding_deposit: outstanding,
              requested_date: b?.requested_date || null,
              booking_status: b?.status || 'WAITING_DEPOSIT',
              estimate_request_id: b?.estimate_request_id || null,
              estimate_reference_images: est?.reference_images || null,
              sessions: b?.booking_sessions || [],
            },
            depositRequired: depReq,
            claimedAmount: Number(sub.claimed_amount || 0),
          });
        });
      }

      // C. Flash Booking Requests (PENDING flash_reservations)
      const { data: pendingFlash } = await supabase
        .from('flash_reservations')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (pendingFlash && pendingFlash.length > 0) {
        const flashIds = Array.from(new Set(pendingFlash.map((f: any) => f.flash_design_id)));
        const { data: rawFlashDesigns } = await supabase.from('flash_designs').select('*').in('id', flashIds);

        pendingFlash.forEach((fl: any) => {
          const design = (rawFlashDesigns || []).find((d: any) => d.id === fl.flash_design_id);
          const custInfo = getCustomerInfo(fl.customer_user_id);

          unifiedList.push({
            id: fl.id,
            type: 'flash',
            created_at: fl.created_at,
            customerName: custInfo.name,
            customerPhone: custInfo.phone,
            artistName: design ? artMap.get(design.artist_id) || 'ช่างสักประจำร้าน' : 'ช่างสักประจำร้าน',
            flashData: {
              ...fl,
              flash_design: design,
              customer_name: custInfo.name,
            },
          });
        });
      }

      // Sort unified items newest first
      unifiedList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(unifiedList);
    } catch (err) {
      console.error('Error fetching unified action queue:', err);
    } finally {
      if (opts?.isInitial) {
        setLoading(false);
      }
    }
  }, [supabase]);

  const isMountedRef = React.useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      fetchUnifiedQueue({ isInitial: true });
    } else {
      fetchUnifiedQueue({ isInitial: false });
    }
  }, [fetchUnifiedQueue]);

  // Counts
  const customCount = useMemo(() => items.filter((i) => i.type === 'custom').length, [items]);
  const paymentCount = useMemo(() => items.filter((i) => i.type === 'payment').length, [items]);
  const flashCount = useMemo(() => items.filter((i) => i.type === 'flash').length, [items]);
  const totalCount = items.length;

  // Filtered items for selected tab
  const displayedItems = useMemo(() => {
    if (activeFilter === 'custom') return items.filter((i) => i.type === 'custom');
    if (activeFilter === 'payments') return items.filter((i) => i.type === 'payment');
    if (activeFilter === 'flash') return items.filter((i) => i.type === 'flash');
    return items;
  }, [items, activeFilter]);

  return (
    <div className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden w-full space-y-0 shadow-lg font-prompt">
      {/* SECTION HEADER */}
      <div className="p-4 sm:p-5 border-b border-studio-border bg-studio-sec/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-studio-red animate-pulse" />
          <h2 className="text-base sm:text-lg font-heading font-semibold text-studio-primary">
            งานที่ต้องดำเนินการ ({totalCount})
          </h2>
        </div>

        {/* Refresh & Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fetchUnifiedQueue({ isInitial: false })}
            className="p-1.5 bg-studio-main border border-studio-border hover:border-studio-red text-studio-secondary hover:text-studio-primary rounded transition-colors"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          <div className="flex bg-studio-main border border-studio-border rounded-[4px] p-0.5 text-xs">
            {[
              { key: 'all', label: `ทั้งหมด ${totalCount}` },
              { key: 'custom', label: `คำขอจอง ${customCount}` },
              { key: 'payments', label: `สลิปรอตรวจ ${paymentCount}` },
              { key: 'flash', label: `Flash ${flashCount}` },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveFilter(t.key as any)}
                className={`px-3 py-1 rounded-[3px] font-medium transition-colors ${
                  activeFilter === t.key
                    ? 'bg-studio-red text-studio-primary font-semibold'
                    : 'text-studio-secondary hover:text-studio-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* QUEUE BODY */}
      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="p-12 text-center text-studio-secondary animate-pulse flex flex-col items-center justify-center space-y-2">
            <Loader2 size={20} className="animate-spin text-studio-red" />
            <span className="text-xs">กำลังโหลดงานที่ต้องดำเนินการ...</span>
          </div>
        ) : totalCount === 0 || displayedItems.length === 0 ? (
          /* EMPTY STATE */
          <div className="p-8 sm:p-12 text-center bg-studio-card/40 border border-dashed border-studio-border rounded-xl space-y-2">
            <div className="w-12 h-12 rounded-full bg-studio-sec mx-auto flex items-center justify-center text-studio-muted">
              <CheckCircle2 size={22} className="text-emerald-500" />
            </div>
            <p className="text-sm text-studio-primary font-medium">ไม่มีงานที่ต้องดำเนินการในขณะนี้</p>
            <p className="text-xs text-studio-secondary max-w-sm mx-auto font-light">
              คำขอจองคิว สลิปโอนเงินมัดจำ และการจอง Flash ทั้งหมดได้รับการตรวจสอบเรียบร้อยแล้ว
            </p>
          </div>
        ) : (
          /* UNIFIED ACTION ITEMS LIST */
          <div className="space-y-3">
            {displayedItems.map((item) => {
              // 1. CUSTOM TATTOO REQUEST ITEM
              if (item.type === 'custom') {
                const est = item.estimateData;
                return (
                  <div
                    key={item.id}
                    className="bg-studio-main border border-studio-border hover:border-studio-red/50 p-4 rounded-[6px] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-[10px] bg-studio-red/15 text-studio-red border border-studio-red/30 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          คำขอจอง
                        </span>
                        <span className="text-[10px] text-studio-muted font-mono">#{item.id.slice(0, 8)}</span>
                        <span className="text-[10px] text-studio-secondary font-mono">
                          {formatDateBangkok(item.created_at, true)}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-studio-primary group-hover:text-studio-red transition-colors">
                        งานสักสไตล์ {est.style || 'Custom'} ({est.width_cm || 10}x{est.height_cm || 10} ซม.)
                      </h4>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                        <span>ลูกค้า: <strong className="text-studio-primary">{item.customerName}</strong></span>
                        <span>ช่างสัก: <strong className="text-studio-primary">{item.artistName}</strong></span>
                        <span>ตำแหน่ง: {est.placement || 'ไม่ระบุ'}</span>
                        {est.preferred_date && (
                          <span>วันที่สะดวก: {formatDateBangkok(est.preferred_date)}</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedEstimateReq(est)}
                        className="w-full sm:w-auto px-4 py-2 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded border border-studio-border transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>ดูรายละเอียด</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // 2. PAYMENT REVIEW ITEM
              if (item.type === 'payment') {
                const sub = item.submissionData;
                return (
                  <div
                    key={item.id}
                    className="bg-studio-main border border-amber-900/40 hover:border-amber-700/60 p-4 rounded-[6px] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                  >
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      {/* Single Slip Thumbnail */}
                      <div className="w-14 h-14 bg-studio-card border border-amber-900/50 rounded overflow-hidden shrink-0">
                        <PaymentSlipImage src={sub.slip_path} className="w-full h-full object-cover" />
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-[10px] bg-amber-950/60 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            สลิปรอตรวจ
                          </span>
                          <span className="text-[10px] text-studio-muted font-mono">#{item.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-studio-secondary font-mono">
                            {formatDateBangkok(item.created_at, true)}
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-studio-primary group-hover:text-amber-400 transition-colors">
                          แจ้งโอน ฿{Number(sub.claimed_amount || 0).toLocaleString()} (มัดจำ: ฿{Number(sub.deposit_required || 0).toLocaleString()})
                        </h4>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                          <span>ลูกค้า: <strong className="text-studio-primary">{item.customerName}</strong></span>
                          <span>ช่างสัก: <strong className="text-studio-primary">{item.artistName}</strong></span>
                          <span>งาน: {sub.artwork_title || 'คิวจองสัก'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setSelectedPaymentSub(sub)}
                        className="w-full sm:w-auto px-4 py-2 bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-800 text-xs font-semibold rounded transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow"
                      >
                        <ShieldCheck size={14} />
                        <span>ตรวจสลิป</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // 3. FLASH REQUEST ITEM
              if (item.type === 'flash') {
                const fl = item.flashData;
                const design = fl.flash_design;
                return (
                  <div
                    key={item.id}
                    className="bg-studio-main border border-studio-border hover:border-purple-500/50 p-4 rounded-[6px] transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group"
                  >
                    <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                      {design?.image_url && (
                        <div className="w-12 h-12 bg-studio-card border border-studio-border rounded overflow-hidden shrink-0">
                          <img src={design.image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="text-[10px] bg-purple-950/60 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            Flash
                          </span>
                          <span className="text-[10px] text-studio-muted font-mono">#{item.id.slice(0, 8)}</span>
                          <span className="text-[10px] text-studio-secondary font-mono">
                            {formatDateBangkok(item.created_at, true)}
                          </span>
                        </div>

                        <h4 className="text-sm font-semibold text-studio-primary group-hover:text-purple-300 transition-colors">
                          จองลาย Flash: {design?.title || 'แบบลายสัก Flash'} (฿{design?.price ? Number(design.price).toLocaleString() : 0})
                        </h4>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-studio-secondary">
                          <span>ลูกค้า: <strong className="text-studio-primary">{item.customerName}</strong></span>
                          <span>ช่างสัก: <strong className="text-studio-primary">{item.artistName}</strong></span>
                          {fl.requested_date && <span>วันนัด: {formatDateBangkok(fl.requested_date)}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto">
                      <a
                        href="/admin/flash"
                        className="w-full sm:w-auto px-4 py-2 bg-studio-sec hover:bg-studio-border text-studio-primary text-xs font-semibold rounded border border-studio-border transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>ดูคำขอ</span>
                      </a>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>

      {/* DRAWERS & REVIEW MODALS */}
      {selectedPaymentSub && (
        <PaymentSubmissionReviewDrawer
          isOpen={Boolean(selectedPaymentSub)}
          submission={selectedPaymentSub}
          onClose={() => setSelectedPaymentSub(null)}
          onSuccess={() => {
            setSelectedPaymentSub(null);
            fetchUnifiedQueue();
          }}
          onError={(err) => alert(err)}
        />
      )}

      {selectedEstimateReq && (
        <EstimateDetailPanel
          estimate={selectedEstimateReq}
          onClose={() => setSelectedEstimateReq(null)}
          onRefresh={() => {
            setSelectedEstimateReq(null);
            fetchUnifiedQueue();
          }}
        />
      )}
    </div>
  );
}
