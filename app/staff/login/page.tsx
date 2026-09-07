'use client';

import React, { Suspense } from 'react';
import CustomerLoginPage from '@/components/auth/CustomerLoginPage';

export default function StaffLoginRoute() {
  return (
    <div className="bg-studio-main min-h-screen">
      <Suspense fallback={<div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt text-studio-secondary text-xs">กำลังโหลด...</div>}>
        <CustomerLoginPage initialFlipped={true} />
      </Suspense>
    </div>
  );
}
