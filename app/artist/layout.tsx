import React from 'react';
import ArtistRealtimeProvider from '@/components/artist/ArtistRealtimeProvider';

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <ArtistRealtimeProvider>
      {children}
    </ArtistRealtimeProvider>
  );
}
