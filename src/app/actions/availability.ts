'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentMembership } from '@/lib/auth/membership';
import { revalidatePath } from 'next/cache';

export async function createAvailabilitySlot(
  artistId: string, 
  startAtIso: string, 
  endAtIso: string
) {
  try {
    const membership = await getCurrentMembership();
    if (!membership) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabase = await createClient();

    let targetArtistId = artistId;

    // Validation based on role
    if (membership.role === 'artist') {
      // Artists can only create slots for themselves
      targetArtistId = membership.user_id;
    } else if (membership.role === 'owner') {
      // Owners must specify an artist
      if (!artistId) {
        return { success: false, error: 'กรุณาเลือกช่างสัก' };
      }
      
      // Validate the target artist is in the same shop and is active
      const { data: artistMembership, error: artistError } = await supabase
        .from('shop_members')
        .select('role, status')
        .eq('shop_id', membership.shop_id)
        .eq('user_id', artistId)
        .single();
        
      if (artistError || !artistMembership || artistMembership.status !== 'active' || artistMembership.role !== 'artist') {
        return { success: false, error: 'ช่างสักไม่ถูกต้องหรือไม่มีสิทธิ์' };
      }
    } else {
      return { success: false, error: 'Unauthorized' };
    }

    // Call RPC
    const { data, error } = await supabase.rpc('create_availability_slot', {
      p_shop_id: membership.shop_id,
      p_artist_id: targetArtistId,
      p_start_at: startAtIso,
      p_end_at: endAtIso
    });

    if (error) {
      console.error('Create slot error:', error);
      // Handle overlap gracefully
      if (error.message.includes('overlap')) {
         return { success: false, error: 'ช่วงเวลานี้ทับซ้อนกับตารางที่มีอยู่แล้ว กรุณาเลือกเวลาอื่น' };
      }
      return { success: false, error: 'ไม่สามารถเปิดช่วงเวลานี้ได้ กรุณาลองใหม่อีกครั้ง' };
    }

    revalidatePath('/owner/calendar');
    revalidatePath('/artist/calendar');
    revalidatePath('/book/[slug]', 'page');

    return { success: true, slotId: data };
  } catch (err) {
    console.error('Create slot exception:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดภายในระบบ' };
  }
}

export async function cancelAvailabilitySlot(slotId: string) {
  try {
    const membership = await getCurrentMembership();
    if (!membership) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabase = await createClient();

    // The RPC will handle RLS and ownership validation, but we just call it
    const { error } = await supabase.rpc('cancel_availability_slot', {
      p_slot_id: slotId
    });

    if (error) {
      console.error('Cancel slot error:', error);
      if (error.message === 'Unauthorized') {
        return { success: false, error: 'คุณไม่มีสิทธิ์จัดการตารางนี้' };
      }
      return { success: false, error: 'ไม่สามารถยกเลิกช่วงเวลานี้ได้' };
    }

    revalidatePath('/owner/calendar');
    revalidatePath('/artist/calendar');
    revalidatePath('/book/[slug]', 'page');

    return { success: true };
  } catch (err) {
    console.error('Cancel slot exception:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดภายในระบบ' };
  }
}

export async function deleteAvailabilitySlot(slotId: string) {
  try {
    const membership = await getCurrentMembership();
    if (!membership) {
      return { success: false, error: 'Unauthorized' };
    }

    const supabase = await createClient();

    const { error } = await supabase.rpc('delete_availability_slot', {
      p_slot_id: slotId
    });

    if (error) {
      console.error('Delete slot error:', error);
      if (error.message.includes('Unauthorized')) {
        return { success: false, error: 'คุณไม่มีสิทธิ์ลบช่วงเวลานี้' };
      }
      if (error.message.includes('สถานะปัจจุบัน')) {
        return { success: false, error: 'ช่วงเวลานี้ไม่สามารถลบได้ในสถานะปัจจุบัน' };
      }
      if (error.message.includes('ประวัติการจอง')) {
        return { success: false, error: 'ไม่สามารถลบช่วงเวลานี้ได้ เนื่องจากมีประวัติการจองที่เกี่ยวข้อง' };
      }
      return { success: false, error: 'ไม่สามารถลบช่วงเวลานี้ได้' };
    }

    revalidatePath('/owner/calendar');
    revalidatePath('/artist/calendar');
    revalidatePath('/book/[slug]', 'page');

    return { success: true };
  } catch (err) {
    console.error('Delete slot exception:', err);
    return { success: false, error: 'เกิดข้อผิดพลาดภายในระบบ' };
  }
}

