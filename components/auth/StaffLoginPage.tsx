'use client';

import React, { Suspense } from 'react';
import CustomerLoginPage from './CustomerLoginPage';

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt text-studio-secondary text-xs">กำลังโหลด...</div>}>
      <CustomerLoginPage initialFlipped={true} />
    </Suspense>
  );
}
