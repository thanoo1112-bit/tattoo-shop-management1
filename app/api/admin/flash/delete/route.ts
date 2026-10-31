import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractStudioStoragePath, getStudioThumbnailStoragePath } from '@/lib/utils/storageUploader';

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

    // 7. Check Shared References for Images (protect against orphan removal of shared files)
    let canDeleteImage1 = Boolean(flashDesign.image_url);
    if (flashDesign.image_url) {
      const { count: flashCount1 } = await supabase
        .from('flash_designs')
        .select('id', { count: 'exact', head: true })
        .eq('image_url', flashDesign.image_url)
        .neq('id', flashId);

      const { count: flashCount1In2 } = await supabase
        .from('flash_designs')
        .select('id', { count: 'exact', head: true })
        .eq('image_url_2', flashDesign.image_url)
        .neq('id', flashId);

      const { count: portfolioCount1 } = await supabase
        .from('portfolio_artworks')
        .select('id', { count: 'exact', head: true })
        .eq('image_url', flashDesign.image_url);

      if ((flashCount1 && flashCount1 > 0) || (flashCount1In2 && flashCount1In2 > 0) || (portfolioCount1 && portfolioCount1 > 0)) {
        canDeleteImage1 = false;
        console.info('[AdminDeleteFlash] image_url is shared with other record(s). Skipping file cleanup.');
      }
    }

    let canDeleteImage2 = Boolean(flashDesign.image_url_2);
    if (flashDesign.image_url_2) {
      const { count: flashCount2 } = await supabase
        .from('flash_designs')
        .select('id', { count: 'exact', head: true })
        .eq('image_url_2', flashDesign.image_url_2)
        .neq('id', flashId);

      const { count: flashCount2In1 } = await supabase
        .from('flash_designs')
        .select('id', { count: 'exact', head: true })
        .eq('image_url', flashDesign.image_url_2)
        .neq('id', flashId);

      const { count: portfolioCount2 } = await supabase
        .from('portfolio_artworks')
        .select('id', { count: 'exact', head: true })
        .eq('image_url', flashDesign.image_url_2);

      if ((flashCount2 && flashCount2 > 0) || (flashCount2In1 && flashCount2In1 > 0) || (portfolioCount2 && portfolioCount2 > 0)) {
        canDeleteImage2 = false;
        console.info('[AdminDeleteFlash] image_url_2 is shared with other record(s). Skipping file cleanup.');
      }
    }

    // 8. Delete Database Record from flash_designs FIRST
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

    // 9. Storage Cleanup AFTER DB delete succeeds
    const pathsToDelete: string[] = [];

    if (canDeleteImage1 && flashDesign.image_url) {
      const p1 = extractStudioStoragePath(flashDesign.image_url);
      if (p1 && !pathsToDelete.includes(p1)) pathsToDelete.push(p1);
      const t1 = getStudioThumbnailStoragePath(flashDesign.image_url);
      if (t1 && !pathsToDelete.includes(t1)) pathsToDelete.push(t1);
    }

    if (canDeleteImage2 && flashDesign.image_url_2) {
      const p2 = extractStudioStoragePath(flashDesign.image_url_2);
      if (p2 && !pathsToDelete.includes(p2)) pathsToDelete.push(p2);
      const t2 = getStudioThumbnailStoragePath(flashDesign.image_url_2);
      if (t2 && !pathsToDelete.includes(t2)) pathsToDelete.push(t2);
    }

    let storageWarning: string | null = null;
    if (pathsToDelete.length > 0) {
      const { error: storageRemoveError } = await supabase.storage
        .from('studio-assets')
        .remove(pathsToDelete);

      if (storageRemoveError) {
        console.warn('[AdminDeleteFlash] Warning deleting storage files after DB delete:', storageRemoveError);
        storageWarning = storageRemoveError.message;
      }
    }

    return NextResponse.json({
      success: true,
      message: storageWarning
        ? 'ลบข้อมูลลาย Flash เรียบร้อยแล้ว (แต่ไม่สามารถลบไฟล์รูปภาพใน Storage ได้)'
        : 'ลบลาย Flash และไฟล์รูปภาพเรียบร้อยแล้ว',
      storageCleanupFailed: Boolean(storageWarning),
      storageWarning,
      deletedId: flashId,
      deletedTitle: flashDesign.title,
      cleanedPaths: pathsToDelete,
    });
  } catch (err: any) {
    console.error('[AdminDeleteFlash] Unexpected error:', err);
    return NextResponse.json(
      { error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง', details: err?.message },
      { status: 500 }
    );
  }
}
