import { createClient } from '@/lib/supabase/client';
import type { FlashDesignData } from '@/components/flash/FlashReservationModal';

export interface FlashDesignWithMeta extends FlashDesignData {
  created_at?: string;
}

/**
 * Shared data source for live Flash designs.
 * Extracted verbatim from app/flash/page.tsx so that /flash and /booking
 * read the exact same query and apply the exact same visibility filtering.
 * Throws on query error (callers handle error UI).
 */
export async function fetchLiveFlashDesigns(): Promise<FlashDesignWithMeta[]> {
  const supabase = createClient();
  const { data: designs, error: fetchErr } = await supabase
    .from('flash_designs')
    .select(`
      id,
      artist_id,
      title,
      description,
      style,
      size_label,
      price,
      deposit_amount,
      estimated_duration_minutes,
      image_url,
      image_url_2,
      status,
      is_visible,
      is_repeatable,
      sort_order,
      created_at,
      artists (
        id,
        name,
        nickname,
        is_active,
        is_visible
      )
    `)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (fetchErr) throw fetchErr;

  return (designs || [])
    .map((d: any) => ({
      id: d.id,
      artist_id: d.artist_id,
      title: d.title,
      description: d.description,
      style: d.style || '',
      size_label: d.size_label,
      price: Number(d.price) || 0,
      deposit_amount: Number(d.deposit_amount) || 0,
      estimated_duration_minutes: d.estimated_duration_minutes ? Number(d.estimated_duration_minutes) : null,
      image_url: d.image_url,
      image_url_2: d.image_url_2 || null,
      status: d.status,
      is_visible: d.is_visible,
      is_repeatable: Boolean(d.is_repeatable),
      created_at: d.created_at || '',
      artist: d.artists ? {
        id: d.artists.id,
        name: d.artists.name,
        nickname: d.artists.nickname,
        is_active: d.artists.is_active,
        is_visible: d.artists.is_visible,
      } : null,
    }))
    .filter((d: FlashDesignWithMeta) => {
      if (!d.artist_id || !d.artist) return false;
      if (d.artist.is_active === false || d.artist.is_visible === false) return false;
      return true;
    });
}
