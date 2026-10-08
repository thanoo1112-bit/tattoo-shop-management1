'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import BookingDetailPanel from '@/components/admin/requests/BookingDetailPanel';
import { BookingItem } from '@/components/admin/requests/types';
import { ShieldAlert, Loader2, X } from 'lucide-react';

export interface ArtistSessionDetail {
  session_id: string;
  session_number: number;
  session_title?: string | null;
  start_at: string;
  end_at: string;
  session_status: string;
  session_notes?: string | null;
  
  // Booking Info
  booking_id: string;
  artist_id?: string | null;
  booking_status: string;
  booking_source?: string | null;
  artwork_title?: string | null;
  artwork_image_url?: string | null;
  placement?: string | null;
  width_cm?: number | null;
  height_cm?: number | null;
  description?: string | null;
  customer_note?: string | null;
  staff_note?: string | null;

  // Customer Info
  customer_user_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_dob?: string | null;
  date_of_birth?: string | null;
  is_age_confirmed?: boolean;

  // Estimate / Tattoo Details
  estimate_request_id?: string | null;
  request_type?: string | null;
  work_type?: string | null;
  style?: string | null;
  reference_images?: string[] | null;

  // Financial & Deposit Details
  estimated_min_price?: number | null;
  estimated_max_price?: number | null;
  price_estimated_at?: string | null;
  quoted_price?: number | null;
  deposit_required?: number | null;
  paid_total?: number | null;
  remaining_balance?: number | null;
  deposit_status?: string | null;
  is_deposit_paid?: boolean;
  is_fully_paid?: boolean;

  all_sessions?: Array<{
    id: string;
    session_number: number;
    start_at: string;
    end_at: string;
    status: string;
    notes?: string | null;
  }>;
}

interface Props {
  session: ArtistSessionDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => Promise<void> | void;
}

export default function ArtistAppointmentDetailDrawer({ session, isOpen, onClose, onRefresh }: Props) {
  const supabase = createClient();
  const { staffArtistId } = useApp();

  const [booking, setBooking] = useState<BookingItem | null>(null);
  const [artists, setArtists] = useState<Array<{ id: string; name: string; nickname: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const fetchBookingData = useCallback(async () => {
    if (!session?.booking_id) return;
    setLoading(true);
    setAccessDenied(false);

    try {
      // 1. Fetch booking row
      const { data: bRow, error: bErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', session.booking_id)
        .maybeSingle();

      if (bErr || !bRow) {
        console.error('Error fetching booking row:', bErr);
        setBooking(null);
        setLoading(false);
        return;
      }

      // Security Check: Artist can ONLY access their assigned bookings
      if (staffArtistId && bRow.artist_id && bRow.artist_id !== staffArtistId) {
        setAccessDenied(true);
        setBooking(null);
        setLoading(false);
        return;
      }

      // 2. Fetch linked sessions
      const { data: sessRows } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('booking_id', bRow.id)
        .order('session_number', { ascending: true });

      // 3. Fetch linked estimate request or flash reservation
      let estData: any = null;
      let flashResData: any = null;

      if (bRow.estimate_request_id) {
        const { data: eRow } = await supabase
          .from('estimate_requests')
          .select('*')
          .eq('id', bRow.estimate_request_id)
          .maybeSingle();
        estData = eRow;
      }

      if (bRow.flash_reservation_id) {
        const { data: frRow } = await supabase
          .from('flash_reservations')
          .select('*, flash_designs(*)')
          .eq('id', bRow.flash_reservation_id)
          .maybeSingle();

        if (frRow) {
          flashResData = frRow;
        } else if (staffArtistId) {
          const { data: flashRpcData } = await supabase
            .rpc('artist_get_flash_reservations', { p_artist_id: staffArtistId });
          const matchedRpc = (flashRpcData || []).find((fr: any) => fr.id === bRow.flash_reservation_id);
          if (matchedRpc) {
            flashResData = {
              ...matchedRpc,
              placement: matchedRpc.placement,
              width_cm: matchedRpc.width_cm,
              height_cm: matchedRpc.height_cm,
              flash_designs: {
                id: matchedRpc.flash_design_id,
                title: matchedRpc.flash_design_title,
                style: matchedRpc.flash_design_style,
                image_url: matchedRpc.flash_design_image_url,
                price: matchedRpc.flash_design_price,
                deposit_amount: matchedRpc.flash_design_deposit_amount,
                width_cm: matchedRpc.flash_design_width_cm || matchedRpc.width_cm,
                height_cm: matchedRpc.flash_design_height_cm || matchedRpc.height_cm,
                artist_id: matchedRpc.flash_design_artist_id,
              }
            };
          }
        }
      }

      // 4. Fetch customer info
      let custData: any = null;
      if (bRow.customer_user_id) {
        const { data: cRow } = await supabase
          .from('customers')
          .select('display_name, phone, email, date_of_birth, eligibility_confirmed_at, profile_completed_at, has_medical_condition, medical_condition_note, medical_conditions, has_allergy, allergy_note, allergies')
          .eq('user_id', bRow.customer_user_id)
          .maybeSingle();
        custData = cRow;
      }

      // 5. Fetch payment submission
      const { data: subData } = await supabase
        .from('booking_payment_submissions')
        .select('*')
        .eq('booking_id', bRow.id)
        .eq('status', 'PENDING')
        .maybeSingle();

      // 6. Fetch financial summary
      const { data: sumData } = await supabase
        .from('booking_payment_summary')
        .select('*')
        .eq('booking_id', bRow.id)
        .maybeSingle();

      // 7. Fetch active artists for display name resolution
      const { data: artRows } = await supabase
        .from('artists')
        .select('id, name, nickname')
        .eq('is_active', true);

      const artistsList = artRows || [];
      setArtists(artistsList);

      const matchedArtist = artistsList.find((a: any) => a.id === bRow.artist_id);

      const flashDesignObj = flashResData?.flash_designs || flashResData?.flash_design;
      const flashDesignImg = flashDesignObj?.image_url || flashResData?.flash_design_image_url || session.artwork_image_url || null;
      const flashDesignTitle = flashDesignObj?.title || flashResData?.flash_design_title || (session.artwork_title?.includes('ลาย Flash:') ? session.artwork_title.replace('ลาย Flash:', '').trim() : null);

      const quotedPriceVal = Number(sumData?.quoted_price ?? estData?.quoted_price ?? flashDesignObj?.price ?? flashResData?.flash_design_price ?? session.quoted_price ?? 0);
      const depositReqVal = Number(sumData?.deposit_required ?? estData?.deposit_required ?? session.deposit_required ?? 500);
      const totalPaidVal = Number(sumData?.paid_total ?? session.paid_total ?? 0);
      const remBalVal = Number(sumData?.remaining_balance ?? session.remaining_balance ?? (quotedPriceVal - totalPaidVal));
      const isDepositPaidVal = Boolean(sumData?.deposit_paid ?? session.is_deposit_paid ?? (totalPaidVal >= depositReqVal));
      const isFullyPaidVal = Boolean(sumData?.is_fully_paid ?? session.is_fully_paid ?? (quotedPriceVal > 0 && totalPaidVal >= quotedPriceVal));

      // Build full BookingItem for shared BookingDetailPanel component
      const constructedBooking: BookingItem = {
        id: bRow.id,
        customer_id: bRow.customer_id,
        customer_user_id: bRow.customer_user_id,
        artist_id: bRow.artist_id,
        estimate_request_id: bRow.estimate_request_id,
        booking_source: bRow.booking_source || (bRow.flash_reservation_id ? 'FLASH' : undefined),
        requested_date: bRow.requested_date || session.start_at?.split('T')[0] || null,
        requested_time: bRow.requested_time || bRow.requested_start_time,
        requested_start_time: bRow.requested_start_time,
        status: bRow.status,
        started_at: bRow.started_at,
        completed_at: bRow.completed_at,
        customer_note: bRow.customer_note || flashResData?.customer_note,
        admin_note: bRow.admin_note || flashResData?.admin_note,
        created_at: bRow.created_at,
        updated_at: bRow.updated_at,

        customer_name: custData?.display_name || session.customer_name || 'ไม่ระบุชื่อ',
        customer_phone: custData?.phone || session.customer_phone || undefined,
        customer_email: custData?.email || session.customer_email || undefined,
        date_of_birth: custData?.date_of_birth || (bRow as any).date_of_birth || (estData as any)?.date_of_birth || null,
        customer_dob: custData?.date_of_birth || (bRow as any).customer_dob || (estData as any)?.customer_dob || null,
        is_age_confirmed: Boolean(custData?.eligibility_confirmed_at || custData?.profile_completed_at || session.is_age_confirmed),

        artist_name: matchedArtist?.name || 'ช่างประจำร้าน',
        artist_nickname: matchedArtist?.nickname || null,

        artwork_title: bRow.artwork_title || (flashDesignTitle ? `ลาย Flash: ${flashDesignTitle}` : (bRow.flash_reservation_id ? 'ลาย Flash' : undefined)),
        artwork_image_url: flashDesignImg || bRow.artwork_image_url || undefined,
        placement: bRow.placement || flashResData?.placement || estData?.placement || session.placement || undefined,
        width_cm: bRow.width_cm ?? flashResData?.width_cm ?? flashDesignObj?.width_cm ?? flashResData?.flash_design_width_cm ?? estData?.width_cm ?? session.width_cm ?? null,
        height_cm: bRow.height_cm ?? flashResData?.height_cm ?? flashDesignObj?.height_cm ?? flashResData?.flash_design_height_cm ?? estData?.height_cm ?? session.height_cm ?? null,
        estimated_size_tier: (bRow as any).estimated_size_tier || estData?.estimated_size_tier || null,
        size_label: flashDesignObj?.size_label || flashResData?.flash_design_size_label || null,
        style_preference: flashDesignObj?.style || flashResData?.flash_design_style || estData?.style || estData?.style_preference || bRow.style_preference || session.style || undefined,
        description: bRow.description || flashResData?.customer_note || estData?.description || session.description || undefined,
        reference_images: flashDesignImg ? [flashDesignImg] : (estData?.reference_images || (bRow.artwork_image_url ? [bRow.artwork_image_url] : session.reference_images || null)),
        work_type: estData?.work_type || (bRow.flash_reservation_id ? 'FLASH' : session.work_type || null),

        financial: {
          quoted_price: quotedPriceVal,
          deposit_required: depositReqVal,
          total_paid: totalPaidVal,
          remaining_balance: remBalVal,
          is_deposit_paid: isDepositPaidVal,
          is_fully_paid: isFullyPaidVal,
        },

        sessions: (sessRows && sessRows.length > 0)
          ? sessRows.map((s: any) => ({
              id: s.id,
              booking_id: s.booking_id,
              artist_id: s.artist_id,
              session_number: s.session_number,
              start_at: s.start_at,
              end_at: s.end_at,
              status: s.status,
              note: s.notes || s.session_notes || s.note || null,
              created_at: s.created_at,
              updated_at: s.updated_at,
            }))
          : session.start_at
          ? [{
              id: session.session_id,
              booking_id: session.booking_id,
              artist_id: bRow.artist_id || staffArtistId || '',
              session_number: session.session_number || 1,
              start_at: session.start_at,
              end_at: session.end_at,
              status: (session.session_status as any) || 'SCHEDULED',
              note: session.session_notes || null,
              created_at: bRow.created_at,
              updated_at: bRow.updated_at,
            }]
          : [],

        pending_submission: subData ? {
          id: subData.id,
          booking_id: subData.booking_id,
          status: subData.status,
          claimed_amount: subData.claimed_amount,
          slip_path: subData.slip_path,
          proof_image_url: subData.proof_image_url,
          reference_no: subData.reference_no,
          created_at: subData.created_at,
        } : null,
        has_pending_payment_submission: Boolean(subData),
      };

      setBooking(constructedBooking);
    } catch (err) {
      console.error('Exception fetching booking data in Artist drawer:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, session, staffArtistId]);

  useEffect(() => {
    if (isOpen && session?.booking_id) {
      fetchBookingData();
    } else if (!isOpen) {
      setBooking(null);
      setAccessDenied(false);
    }
  }, [isOpen, session?.booking_id, fetchBookingData]);

  if (!isOpen) return null;

  if (accessDenied) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end font-prompt bg-black/70 backdrop-blur-xs">
        <div className="relative w-full max-w-lg bg-studio-card border-l border-studio-border h-full flex flex-col shadow-2xl p-6 justify-center items-center text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-950/60 border border-red-800/80 flex items-center justify-center text-red-400">
            <ShieldAlert size={28} />
          </div>
          <h3 className="text-base font-bold text-studio-primary">ไม่สามารถเข้าถึงคิวงานนี้ได้</h3>
          <p className="text-xs text-studio-secondary max-w-xs">
            คุณไม่มีสิทธิ์เข้าถึงหรือจัดการคิวงานของช่างท่านอื่น รายการนี้ถูกมอบหมายให้ช่างคนอื่นในระบบ
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-studio-sec hover:bg-studio-border text-studio-primary border border-studio-border text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    );
  }

  if (loading || !booking) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end font-prompt bg-black/70 backdrop-blur-xs">
        <div className="relative w-full max-w-lg bg-studio-card border-l border-studio-border h-full flex flex-col shadow-2xl p-6 justify-center items-center text-center space-y-3">
          <Loader2 size={24} className="text-amber-400 animate-spin" />
          <p className="text-xs text-studio-secondary">กำลังโหลดข้อมูลรายละเอียดคิวงาน...</p>
        </div>
      </div>
    );
  }

  return (
    <BookingDetailPanel
      booking={booking}
      artists={artists}
      blockedDates={[]}
      isArtistView={true}
      onClose={onClose}
      onRefresh={async () => {
        await fetchBookingData();
        if (onRefresh) await onRefresh();
      }}
    />
  );
}
