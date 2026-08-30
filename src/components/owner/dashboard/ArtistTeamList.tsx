'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { User, Users, ArrowRight, Phone, Mail } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/owner/empty-state';
import { createClient } from '@/lib/supabase/client';

interface Artist {
  id: string; // shop_member id
  user_id: string; // This is the ID used for presence
  profiles: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
}

interface ArtistTeamListProps {
  artists: any[];
  shopId: string;
  todayApptsCountByArtist?: Record<string, number>;
}

export function ArtistTeamList({ artists, shopId, todayApptsCountByArtist = {} }: ArtistTeamListProps) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    console.log('[DEBUG] Owner ArtistTeamList mounted for shop:', shopId);
    const supabase = createClient();
    const channelName = `shop:${shopId}:artist-presence`;
    console.log('[DEBUG] Owner connecting to channel:', channelName);
    
    const channel = supabase.channel(channelName);

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[DEBUG] Owner presence sync event received');
        const state = channel.presenceState();
        console.log('[DEBUG] Owner presence state:', state);
        const onlineIds = new Set<string>();
        
        for (const key in state) {
          const presences = state[key] as any[];
          presences.forEach(presence => {
            if (presence.user_id) {
              onlineIds.add(presence.user_id);
            }
          });
        }
        
        console.log('[DEBUG] Owner extracted online user IDs:', Array.from(onlineIds));
        setOnlineUserIds(onlineIds);
        setIsSyncing(false);
        setHasError(false);
      })
      .subscribe((status, err) => {
        console.log('[DEBUG] Owner subscribe status:', status, 'error:', err);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsSyncing(false);
          setHasError(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shopId]);

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
          <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">ทีมช่างสัก</h2>
        </div>
        <Link href="/owner/artists" className="text-xs text-[#9CA3AB] hover:text-[#FFFFFF] flex items-center gap-1 transition-colors">
          ดูช่างทั้งหมด <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {artists.length > 0 ? (
        <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-md">
          <div className="overflow-y-auto overflow-x-hidden max-h-[220px] md:max-h-[292px] divide-y divide-[#262626] pr-1">
            {artists.map((artist) => {
            // Presence variables kept to avoid unused warnings
            const isOnline = onlineUserIds.has(artist.user_id);
            const _statusColor = isOnline ? "bg-[#22C55E]" : "bg-[#EF4444]";
            
              return (
                <div key={artist.id} className="p-4 flex flex-row items-center justify-between gap-3 sm:gap-4 hover:bg-[#1E1E1E] transition-colors w-full overflow-hidden">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {artist.profiles?.avatar_url ? (
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-[#262626] flex-shrink-0">
                        <Image src={artist.profiles.avatar_url} alt={artist.profiles.full_name || 'Artist'} fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#262626] border border-[#333333] flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-[#9CA3AB]" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#F3F3F3] truncate">
                          {artist.profiles?.full_name || 'ช่างสักนิรนาม'}
                        </p>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                      </div>
                      <p className="text-xs text-[#9CA3AB] mt-0.5">
                        {artist.role === 'owner' ? 'เจ้าของร้าน' : 'ช่างสัก'} • {isOnline ? 'ออนไลน์' : 'ออฟไลน์'}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#1C1C1C] border border-[#292929] text-[#A3A3A3]">
                      คิววันนี้: {todayApptsCountByArtist?.[artist.user_id] || 0}
                    </span>
                  </div>
                </div>
              );
          })}
          </div>
        </div>
      ) : (
        <div className="border border-[#262626] rounded-xl bg-[#171717] shadow-md">
          <EmptyState 
            icon={Users}
            title="ยังไม่มีช่างสักในทีม"
            description="เชิญช่างสักเข้าร่วมร้านเพื่อเริ่มจัดการทีม"
            actionLabel="ดูช่างทั้งหมด"
            actionHref="/owner/artists"
          />
        </div>
      )}
    </section>
  );
}
