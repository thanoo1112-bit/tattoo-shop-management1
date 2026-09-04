import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Extracts storage path from studio-assets public URL or raw path
 * Examples:
 *   "https://.../storage/v1/object/public/studio-assets/flash/xyz.webp" -> "flash/xyz.webp"
 *   "flash/xyz.webp" -> "flash/xyz.webp"
 */
function extractStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const marker = '/studio-assets/';
  const idx = urlOrPath.indexOf(marker);
  if (idx !== -1) {
    return urlOrPath.substring(idx + marker.length).split('?')[0];
  }
  if (urlOrPath.startsWith('flash/') || urlOrPath.startsWith('artists/') || urlOrPath.startsWith('portfolio/')) {
    return urlOrPath.split('?')[0];
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // 1. Verify User Authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 2. Verify Admin Role Authorization
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin' || profile.is_active === false) {
      return NextResponse.json(
        { error: 'คุณไม่มีสิทธิ์ในการลบข้อมูลลาย Flash (เฉพาะ Admin เท่านั้น)', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // 3. Parse Request Payload
    const body = await req.json();
    const { flashId } = body;

    if (!flashId || typeof flashId !== 'string') {
      return NextResponse.json(
        { error: 'รหัส Flash ID ไม่ถูกต้อง', code: 'INVALID_ID' },
        { status: 400 }
      );
    }

    // 4. Fetch Flash Record from Database (Server-side validation)
    const { data: flashDesign, error: fetchError } = await supabase
      .from('flash_designs')
      .select('id, title, status, image_url, image_url_2')
      .eq('id', flashId)
      .single();

    if (fetchError || !flashDesign) {
      return NextResponse.json(
        { error: 'ไม่พบลาย Flash ที่ต้องการลบในระบบ', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 5. Enforce Business Rules on Flash Status
    const status = flashDesign.status?.toUpperCase();
    if (status === 'HELD') {
      return NextResponse.json(
        { error: 'ไม่สามารถลบได้ เนื่องจากลายนี้กำลังถูกพักสิทธิ์', code: 'STATUS_HELD' },
        { status: 400 }
      );
    }
    if (status === 'RESERVED') {
      return NextResponse.json(
        { error: 'ไม่สามารถลบได้ เนื่องจากลายนี้มีการจองอยู่', code: 'STATUS_RESERVED' },
        { status: 400 }
      );
    }
    if (status === 'SOLD') {
      return NextResponse.json(
        { error: 'ไม่สามารถลบลายที่ขายแล้วได้ เนื่องจากต้องเก็บประวัติการขาย', code: 'STATUS_SOLD' },
        { status: 400 }
      );
    }
    if (status !== 'AVAILABLE') {
      return NextResponse.json(
        { error: `ไม่สามารถลบลาย Flash ในสถานะ ${status} ได้`, code: 'STATUS_INVALID' },
        { status: 400 }
      );
    }

    // 6. Check Foreign Key Constraints / Reservations History
    const { count: reservationCount, error: resCheckError } = await supabase
      .from('flash_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('flash_design_id', flashId);

    if (!resCheckError && reservationCount && reservationCount > 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถลบลาย Flash ที่มีประวัติการจองในระบบได้', code: 'HAS_RESERVATIONS' },
        { status: 400 }
      );
    }

    // 7. Extract and Delete Storage Images from studio-assets bucket
    const pathsToDelete: string[] = [];
    const path1 = extractStoragePath(flashDesign.image_url);
    if (path1) pathsToDelete.push(path1);

    const path2 = extractStoragePath(flashDesign.image_url_2);
    if (path2) pathsToDelete.push(path2);

    if (pathsToDelete.length > 0) {
      const { error: storageRemoveError } = await supabase.storage
        .from('studio-assets')
        .remove(pathsToDelete);

      if (storageRemoveError) {
        console.warn('[AdminDeleteFlash] Warning deleting storage files:', storageRemoveError);
      }
    }

    // 8. Delete Database Record from flash_designs
    const { error: dbDeleteError } = await supabase
      .from('flash_designs')
      .delete()
      .eq('id', flashId);

    if (dbDeleteError) {
      console.error('[AdminDeleteFlash] DB delete error:', dbDeleteError);
      return NextResponse.json(
        { error: `ไม่สามารถลบลาย Flash ได้: ${dbDeleteError.message}`, code: 'DB_ERROR' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'ลบลาย Flash เรียบร้อยแล้ว',
      deletedId: flashId,
      deletedTitle: flashDesign.title,
    });
  } catch (err: any) {
    console.error('[AdminDeleteFlash] Unexpected error:', err);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง', details: err?.message },
      { status: 500 }
    );
  }
}
