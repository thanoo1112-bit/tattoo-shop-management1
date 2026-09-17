'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import { CheckCircle2, FileText, CreditCard, Calendar, User, Sparkles, X } from 'lucide-react';

interface ToastNotification {
  id: string;
  type: 'estimate' | 'submission' | 'booking' | 'customer' | 'general';
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
  const { fetchEstimates, fetchBookings, fetchArtists } = useApp();

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
      } else if (['bookings', 'booking_sessions', 'booking_payments', 'booking_payment_submissions'].includes(table)) {
        fetchBookings();
      } else if (table === 'artists') {
        fetchArtists();
      }
    }, 300);

    // 3. Selective Non-Intrusive UX Toast Notifications for Admin
    if (eventType === 'INSERT') {
      if (table === 'estimate_requests') {
        addToast('estimate', 'คำขอใหม่', 'มีคำขอประเมินราคาใหม่จากลูกค้า');
      } else if (table === 'booking_payment_submissions') {
        addToast('submission', 'สลิปใหม่', 'ลูกค้าส่งสลิปชำระเงินมัดจำแล้ว');
      } else if (table === 'bookings') {
        addToast('booking', 'รายการจองใหม่', 'มีรายการคิวงานใหม่ในระบบ');
      }
    } else if (eventType === 'UPDATE') {
      if (table === 'booking_payment_submissions' && payload.new?.status === 'PENDING' && payload.old?.status !== 'PENDING') {
        addToast('submission', 'สลิปใหม่อัปเดต', 'ลูกค้าส่งสลิปชำระเงินมัดจำแล้ว');
      } else if (table === 'customers') {
        addToast('customer', 'ข้อมูลลูกค้า', 'ข้อมูล Profile ลูกค้าถูกอัปเดต');
      }
    }
  }, [fetchEstimates, fetchBookings, fetchArtists, addToast]);

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
            className="pointer-events-auto bg-[#171512]/95 text-[#ECE4D3] border border-[#9C2F2F]/60 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300 font-prompt"
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'estimate' && <FileText size={18} className="text-[#9C2F2F]" />}
              {toast.type === 'submission' && <CreditCard size={18} className="text-amber-400" />}
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
