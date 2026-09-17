import React from 'react';
import AdminRealtimeProvider from '@/components/admin/AdminRealtimeProvider';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRealtimeProvider>
      <div className="md:pl-60 font-prompt min-h-screen bg-[#0E0D0C]">
        {children}
      </div>
    </AdminRealtimeProvider>
  );
}
