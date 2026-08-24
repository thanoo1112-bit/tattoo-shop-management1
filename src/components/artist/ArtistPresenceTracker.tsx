'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ArtistPresenceTrackerProps {
  userId: string;
  shopId: string;
}

export function ArtistPresenceTracker({ userId, shopId }: ArtistPresenceTrackerProps) {
  useEffect(() => {
    console.log('[DEBUG] ArtistPresenceTracker mounted for user:', userId, 'shop:', shopId);
    const supabase = createClient();
    const channelName = `shop:${shopId}:artist-presence`;
    console.log('[DEBUG] Artist connecting to channel:', channelName);

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[DEBUG] Artist presence sync event received');
      })
      .subscribe(async (status, err) => {
        console.log('[DEBUG] Artist subscribe status:', status, 'error:', err);
        if (status === 'SUBSCRIBED') {
          try {
            const trackResult = await channel.track({
              user_id: userId,
              shop_id: shopId,
              role: 'artist',
              online_at: new Date().toISOString(),
            });
            console.log('[DEBUG] Artist track success, result:', trackResult);
          } catch (e) {
            console.error('[DEBUG] Artist track fail:', e);
          }
        }
      });

    return () => {
      console.log('[DEBUG] ArtistPresenceTracker unmounting');
      supabase.removeChannel(channel);
    };
  }, [userId, shopId]);

  return null;
}
