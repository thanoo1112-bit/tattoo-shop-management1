import React from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:pl-60 font-prompt min-h-screen bg-[#0E0D0C]">
      {children}
    </div>
  );
}
