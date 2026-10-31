'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import {
  readAll,
  subscribeRescheduleRequests,
  isRescheduleRequestUiEnabled,
  normalizeBookingUuid,
} from '@/lib/reschedule/rescheduleRequestStore';
import { FileText, CreditCard, Calendar, Sparkles, X } from 'lucide-react';

interface ToastNotification {
  id: string;
  type: 'estimate' | 'submission' | 'reschedule' | 'general';
  title: string;
  message: string;
  timestamp: Date;
}

interface ArtistRealtimeContextType {
  connectionStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  lastEventTime: number | null;
  lastEventTable: string | null;
}

const ArtistRealtimeContext = createContext<ArtistRealtimeContextType>({
  connectionStatus: 'CONNECTING',
  lastEventTime: null,
  lastEventTable: null,
});

export const useArtistRealtime = () => useContext(ArtistRealtimeContext);

export default function ArtistRealtimeProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { staffArtistId, fetchEstimates, fetchBookings } = useApp();

  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('CONNECTING');
  const [lastEventTime, setLastEventTime] = useState<number | null>(null);
  const [lastEventTable, setLastEventTable] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Refs for tracking artist ownership Sets
  const myBookingIdsRef = useRef<Set<string>>(new Set());
  const myFlashDesignIdsRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<any>(null);
  const debounceTimerRef = useRef<{ [table: string]: NodeJS.Timeout }>({});

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastNotification['type'], title: string, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newToast: ToastNotification = {
      id,
      type,
      title,
      message,
      timestamp: new Date(),
    };

    setToasts((prev) => [...prev.slice(-3), newToast]); // Keep max 4 toasts

    // Auto dismiss after 4 seconds
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  // Refresh ownership sets (bookings and flash designs belonging to this artist)
  const refreshOwnershipSets = useCallback(async () => {
    if (!staffArtistId) {
      myBookingIdsRef.current.clear();
      myFlashDesignIdsRef.current.clear();
      return;
    }

    try {
      const [bookingsRes, flashDesignsRes] = await Promise.all([
        supabase.from('bookings').select('id').eq('artist_id', staffArtistId),
        supabase.from('flash_designs').select('id').eq('artist_id', staffArtistId),
      ]);

      if (bookingsRes.data) {
        myBookingIdsRef.current = new Set(
          bookingsRes.data.map((b: any) => normalizeBookingUuid(b.id))
        );
      }

      if (flashDesignsRes.data) {
        myFlashDesignIdsRef.current = new Set(
          flashDesignsRes.data.map((f: any) => String(f.id).toLowerCase())
        );
      }
    } catch (err) {
      console.error('[ArtistRealtimeProvider] Error loading ownership sets:', err);
    }
  }, [supabase, staffArtistId]);

  useEffect(() => {
    refreshOwnershipSets();
  }, [refreshOwnershipSets]);

  // Handle Realtime Postgres Changes scoped to the current artist
  const handleRealtimePayload = useCallback(
    async (table: string, payload: any) => {
      if (!staffArtistId) return;

      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      const newRec = payload.new || {};
      const oldRec = payload.old || {};
      const now = Date.now();

      let isRelevantToThisArtist = false;
      let toastToTrigger: { type: ToastNotification['type']; title: string; message: string } | null = null;

      // 1. Estimate Requests (Custom)
      if (table === 'estimate_requests') {
        const estArtistId = newRec.artist_id || oldRec.artist_id;
        if (estArtistId === staffArtistId) {
          isRelevantToThisArtist = true;
          if (eventType === 'INSERT' && newRec.status === 'PENDING' && newRec.request_type !== 'DIRECT_BOOKING') {
            toastToTrigger = {
              type: 'estimate',
              title: 'มีคำขอใหม่',
              message: 'มีคำขอใหม่จากลูกค้า',
            };
          }
        }
      }

      // 2. Flash Reservations (Flash)
      else if (table === 'flash_reservations') {
        const designId = String(newRec.flash_design_id || oldRec.flash_design_id || '').toLowerCase();
        let isMyDesign = myFlashDesignIdsRef.current.has(designId);

        // Fallback: If not found in cache, verify directly from DB in case design was newly added
        if (!isMyDesign && designId) {
          try {
            const { data } = await supabase
              .from('flash_designs')
              .select('id, artist_id')
              .eq('id', designId)
              .single();
            if (data?.artist_id === staffArtistId) {
              myFlashDesignIdsRef.current.add(designId);
              isMyDesign = true;
            }
          } catch (_) {}
        }

        if (isMyDesign) {
          isRelevantToThisArtist = true;
          if (eventType === 'INSERT' && newRec.status === 'PENDING') {
            toastToTrigger = {
              type: 'estimate',
              title: 'มีคำขอใหม่',
              message: 'มีคำขอใหม่จากลูกค้า',
            };
          }
        }
      }

      // 3. Deposit Slips (booking_payment_submissions)
      else if (table === 'booking_payment_submissions') {
        const bookingId = normalizeBookingUuid(newRec.booking_id || oldRec.booking_id);
        let isMyBooking = myBookingIdsRef.current.has(bookingId);

        // Fallback: verify from DB
        if (!isMyBooking && bookingId) {
          try {
            const { data } = await supabase
              .from('bookings')
              .select('id, artist_id')
              .eq('id', bookingId)
              .single();
            if (data?.artist_id === staffArtistId) {
              myBookingIdsRef.current.add(bookingId);
              isMyBooking = true;
            }
          } catch (_) {}
        }

        if (isMyBooking) {
          isRelevantToThisArtist = true;
          const isPendingNow = newRec.status === 'PENDING';
          const wasNotPending = oldRec.status !== 'PENDING';
          if ((eventType === 'INSERT' && isPendingNow) || (eventType === 'UPDATE' && isPendingNow && wasNotPending)) {
            toastToTrigger = {
              type: 'submission',
              title: 'มีสลิปมัดจำใหม่',
              message: 'ลูกค้าแนบสลิปมัดจำรอตรวจสอบ',
            };
          }
        }
      }

      // 4. Bookings table changes
      else if (table === 'bookings') {
        const bArtistId = newRec.artist_id || oldRec.artist_id;
        if (bArtistId === staffArtistId) {
          isRelevantToThisArtist = true;
          if (newRec.id) {
            myBookingIdsRef.current.add(normalizeBookingUuid(newRec.id));
          }
        }
      }

      // Only proceed if genuinely belonging to this artist!
      if (!isRelevantToThisArtist) {
        return;
      }

      setLastEventTime(now);
      setLastEventTable(table);

      // Trigger custom browser event for mounted artist components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('artist:realtime', {
            detail: { table, eventType, payload },
          })
        );
      }

      // Debounced refetch of AppContext data
      if (debounceTimerRef.current[table]) {
        clearTimeout(debounceTimerRef.current[table]);
      }
      debounceTimerRef.current[table] = setTimeout(() => {
        if (table === 'estimate_requests') {
          fetchEstimates();
        } else if (['bookings', 'booking_payment_submissions'].includes(table)) {
          fetchBookings();
        }
      }, 300);

      // Trigger Toast if conditions met
      if (toastToTrigger) {
        addToast(toastToTrigger.type, toastToTrigger.title, toastToTrigger.message);
      }
    },
    [staffArtistId, supabase, fetchEstimates, fetchBookings, addToast]
  );

  // Reschedule request listener for Toast alerts (Group 4: New Reschedule Requests)
  const knownPendingRescheduleIdsRef = useRef<Set<string>>(new Set());
  const isRescheduleInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isRescheduleRequestUiEnabled() || !staffArtistId) return;

    const checkRescheduleRequests = () => {
      try {
        const all = readAll();
        // Filter strictly to this artist!
        const myPending = all.filter(
          (r) =>
            r.status === 'PENDING' &&
            (r.artist_id === staffArtistId ||
              (r.booking_id && myBookingIdsRef.current.has(normalizeBookingUuid(r.booking_id))))
        );

        const known = knownPendingRescheduleIdsRef.current;

        if (isRescheduleInitializedRef.current) {
          const newItems = myPending.filter((r) => !known.has(r.id));
          if (newItems.length > 0) {
            addToast('reschedule', 'มีคำขอเลื่อนนัดใหม่', 'ลูกค้าขอเลื่อนวันหรือเวลานัดหมาย');
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('artist:realtime', {
                  detail: { table: 'reschedule_requests', count: newItems.length },
                })
              );
            }
          }
        } else {
          isRescheduleInitializedRef.current = true;
        }

        knownPendingRescheduleIdsRef.current = new Set(myPending.map((r) => r.id));
      } catch (err) {
        console.error('[ArtistRealtimeProvider] Error monitoring reschedule requests:', err);
      }
    };

    checkRescheduleRequests();
    const unsubscribe = subscribeRescheduleRequests(checkRescheduleRequests);
    return () => unsubscribe();
  }, [staffArtistId, addToast]);

  // Single Channel Lifecycle scoped to this artist
  useEffect(() => {
    if (!staffArtistId) return;

    let isSubscribed = true;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `artist_realtime_sync_${staffArtistId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'estimate_requests' },
        (payload) => handleRealtimePayload('estimate_requests', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'flash_reservations' },
        (payload) => handleRealtimePayload('flash_reservations', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_payment_submissions' },
        (payload) => handleRealtimePayload('booking_payment_submissions', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => handleRealtimePayload('bookings', payload)
      )
      .subscribe((status) => {
        if (!isSubscribed) return;
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('CONNECTED');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setConnectionStatus('DISCONNECTED');
        } else {
          setConnectionStatus('CONNECTING');
        }
      });

    channelRef.current = channel;

    return () => {
      isSubscribed = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      Object.values(debounceTimerRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, [staffArtistId, supabase, handleRealtimePayload]);

  return (
    <ArtistRealtimeContext.Provider
      value={{
        connectionStatus,
        lastEventTime,
        lastEventTable,
      }}
    >
      {children}

      {/* Non-intrusive Toast Container for Artist */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-[#171512]/95 text-[#ECE4D3] border border-[#C12D2D]/60 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300 font-prompt"
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'estimate' && <FileText size={18} className="text-[#C12D2D]" />}
              {toast.type === 'submission' && <CreditCard size={18} className="text-amber-400" />}
              {toast.type === 'reschedule' && <Calendar size={18} className="text-sky-400" />}
              {toast.type === 'general' && <Sparkles size={18} className="text-amber-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#ECE4D3] tracking-wide">{toast.title}</h4>
                <span className="text-[10px] text-[#A89F91] font-mono">Realtime</span>
              </div>
              <p className="text-[11px] text-[#A89F91] mt-0.5 leading-snug">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#A89F91] hover:text-[#ECE4D3] p-1 rounded transition-colors shrink-0 cursor-pointer"
              title="ปิด"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ArtistRealtimeContext.Provider>
  );
}
