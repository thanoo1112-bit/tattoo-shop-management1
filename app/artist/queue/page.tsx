'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ArtistQueueRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams.toString();
    const targetUrl = q ? `/artist/calendar?view=queue&${q}` : '/artist/calendar?view=queue';
    router.replace(targetUrl);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-[#0E0D0C] flex items-center justify-center font-prompt text-xs text-[#A89F91]">
      <span className="animate-pulse">กำลังนำทางไปหน้าคิวงานและปฏิทิน...</span>
    </div>
  );
}

export default function ArtistQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0E0D0C] flex items-center justify-center font-prompt text-xs text-[#A89F91]">
          <span>กำลังนำทางไปหน้าคิวงานและปฏิทิน...</span>
        </div>
      }
    >
      <ArtistQueueRedirectContent />
    </Suspense>
  );
}
