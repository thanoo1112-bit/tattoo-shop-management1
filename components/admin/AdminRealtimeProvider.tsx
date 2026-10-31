'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import {
  readAll,
  subscribeRescheduleRequests,
  isRescheduleRequestUiEnabled,
} from '@/lib/reschedule/rescheduleRequestStore';
import { CheckCircle2, FileText, CreditCard, Calendar, User, Sparkles, X } from 'lucide-react';

interface ToastNotification {
  id: string;
  type: 'estimate' | 'submission' | 'booking' | 'customer' | 'reschedule' | 'general';
  title: string;
  message: string;
  timestamp: Date;
}

interface AdminRealtimeContextType {
  connectionStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  lastEventTime: number | null;
  lastEventTable: string | null;
}

const AdminRealtimeContext = createContext<AdminRealtimeContextType>({
  connectionStatus: 'CONNECTING',
  lastEventTime: null,
  lastEventTable: null,
});

export const useAdminRealtime = () => useContext(AdminRealtimeContext);

export default function AdminRealtimeProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { fetchEstimates, fetchBookings, fetchArtists, fetchFlashReservations } = useApp();

  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'>('CONNECTING');
  const [lastEventTime, setLastEventTime] = useState<number | null>(null);
  const [lastEventTable, setLastEventTable] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Ref to prevent duplicate channel creation
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

  // Reschedule request listener for Toast alerts (Group 3: New Reschedule Requests)
  const knownPendingRescheduleIdsRef = useRef<Set<string>>(new Set());
  const isRescheduleInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isRescheduleRequestUiEnabled()) return;

    const checkRescheduleRequests = () => {
      try {
        const all = readAll();
        const pending = all.filter((r) => r.status === 'PENDING');
        const known = knownPendingRescheduleIdsRef.current;

        if (isRescheduleInitializedRef.current) {
          const newItems = pending.filter((r) => !known.has(r.id));
          if (newItems.length > 0) {
            addToast('reschedule', 'มีคำขอเลื่อนนัดใหม่', 'ลูกค้าขอเลื่อนวันหรือเวลานัดหมาย');
          }
        } else {
          isRescheduleInitializedRef.current = true;
        }

        knownPendingRescheduleIdsRef.current = new Set(pending.map((r) => r.id));
      } catch (err) {
        console.error('Error monitoring reschedule requests for toast:', err);
      }
    };

    checkRescheduleRequests();
    const unsubscribe = subscribeRescheduleRequests(checkRescheduleRequests);
    return () => unsubscribe();
  }, [addToast]);

  // Handle Realtime Postgres Changes
  const handleRealtimePayload = useCallback((table: string, payload: any) => {
    const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
    const now = Date.now();

    setLastEventTime(now);
    setLastEventTable(table);

    // 1. Trigger custom browser event for mounted admin components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('admin:realtime', {
          detail: { table, eventType, payload },
        })
      );
    }

    // 2. Debounced Global App Context Refetch
    if (debounceTimerRef.current[table]) {
      clearTimeout(debounceTimerRef.current[table]);
    }

    debounceTimerRef.current[table] = setTimeout(() => {
      if (table === 'estimate_requests') {
        fetchEstimates();
      } else if (table === 'flash_reservations') {
        fetchFlashReservations();
      } else if (['bookings', 'booking_sessions', 'booking_payments', 'booking_payment_submissions'].includes(table)) {
        fetchBookings();
      } else if (table === 'artists') {
        fetchArtists();
      }
    }, 300);

    // 3. Selective Non-Intrusive UX Toast Notifications for Admin (Unified 3 categories)
    if (eventType === 'INSERT') {
      if (table === 'estimate_requests') {
        // Category 1: New Custom Request
        addToast('estimate', 'มีคำขอใหม่', 'มีคำขอออกแบบหรือประเมินราคาใหม่จากลูกค้า');
      } else if (table === 'flash_reservations') {
        // Category 1: New Flash Request
        addToast('estimate', 'มีคำขอใหม่', 'มีคำขอลายสัก Flash ใหม่จากลูกค้า');
      } else if (table === 'booking_payment_submissions') {
        // Category 2: New Deposit Slip
        addToast('submission', 'มีสลิปมัดจำใหม่', 'ลูกค้าแนบสลิปมัดจำรอตรวจสอบ');
      }
    } else if (eventType === 'UPDATE') {
      if (table === 'booking_payment_submissions' && payload.new?.status === 'PENDING' && payload.old?.status !== 'PENDING') {
        // Category 2: Deposit slip re-submitted / updated to PENDING
        addToast('submission', 'มีสลิปมัดจำใหม่', 'ลูกค้าแนบสลิปมัดจำรอตรวจสอบ');
      }
    }
  }, [fetchEstimates, fetchFlashReservations, fetchBookings, fetchArtists, addToast]);

  // Single Channel Lifecycle
  useEffect(() => {
    let isSubscribed = true;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = 'admin_global_realtime_sync';
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
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => handleRealtimePayload('bookings', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_payment_submissions' },
        (payload) => handleRealtimePayload('booking_payment_submissions', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        (payload) => handleRealtimePayload('customers', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => handleRealtimePayload('profiles', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_sessions' },
        (payload) => handleRealtimePayload('booking_sessions', payload)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_payments' },
        (payload) => handleRealtimePayload('booking_payments', payload)
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
  }, [supabase, handleRealtimePayload]);

  return (
    <AdminRealtimeContext.Provider
      value={{
        connectionStatus,
        lastEventTime,
        lastEventTable,
      }}
    >
      {children}

      {/* Non-intrusive Toast Container */}
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
              {toast.type === 'booking' && <Calendar size={18} className="text-emerald-400" />}
              {toast.type === 'customer' && <User size={18} className="text-sky-400" />}
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
              className="text-[#A89F91] hover:text-[#ECE4D3] p-1 rounded transition-colors shrink-0"
              title="ปิด"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </AdminRealtimeContext.Provider>
  );
}
