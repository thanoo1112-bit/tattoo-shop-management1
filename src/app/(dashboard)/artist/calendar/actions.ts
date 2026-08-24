'use server';

import { createClient } from '@/lib/supabase/server';
import { requireArtist } from '@/lib/auth/membership';
import { revalidatePath } from 'next/cache';

export async function updateArtistDefaultCapacity(capacity: number) {
  const { membership, user } = await requireArtist();
  const supabase = await createClient();

  const { error } = await supabase
    .from('artist_booking_settings')
    .upsert(
      {
        shop_id: membership.shop_id,
        artist_id: user.id,
        daily_capacity: capacity,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'shop_id, artist_id' }
    );

  if (error) {
    console.error('Failed to update default capacity:', error);
    return { error: error.message };
  }

  revalidatePath('/artist/calendar');
  return { success: true };
}

export async function updateArtistDailyOverride(date: string, capacity: number | null, isClosed: boolean) {
  const { membership, user } = await requireArtist();
  const supabase = await createClient();

  if (capacity === null && !isClosed) {
    // Remove override
    const { error } = await supabase
      .from('artist_daily_overrides')
      .delete()
      .eq('shop_id', membership.shop_id)
      .eq('artist_id', user.id)
      .eq('override_date', date);

    if (error) {
      console.error('Failed to remove daily override:', error);
      return { error: error.message };
    }
  } else {
    // Upsert override
    const { error } = await supabase
      .from('artist_daily_overrides')
      .upsert(
        {
          shop_id: membership.shop_id,
          artist_id: user.id,
          override_date: date,
          capacity: capacity || 0,
          is_closed: isClosed,
          created_by: user.id,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'shop_id, artist_id, override_date' }
      );

    if (error) {
      console.error('Failed to update daily override:', error);
      return { error: error.message };
    }
  }

  revalidatePath('/artist/calendar');
  return { success: true };
}
