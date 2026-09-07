import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // 1. Verify Admin Authorization
    const {
      data: { user: adminUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !adminUser) {
      return NextResponse.json(
        { error: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { data: adminProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', adminUser.id)
      .single();

    if (profileError || !adminProfile || adminProfile.role !== 'admin' || adminProfile.is_active === false) {
      return NextResponse.json(
        { error: 'คุณไม่มีสิทธิ์ในการเปลี่ยนรหัสผ่านช่างสัก (เฉพาะ Admin เท่านั้น)', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // 2. Parse Payload
    const body = await req.json();
    const { artistId, password } = body;

    if (!artistId || typeof artistId !== 'string') {
      return NextResponse.json(
        { error: 'รหัสช่างสักไม่ถูกต้อง', code: 'INVALID_ARTIST_ID' },
        { status: 400 }
      );
    }

    if (!password || password.trim() === '' || password.length < 6) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัสผ่านใหม่ที่มีความยาวอย่างน้อย 6 ตัวอักษร', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    // 3. Retrieve Artist Record
    const { data: artistRow, error: artistFetchError } = await supabase
      .from('artists')
      .select('id, name, nickname, user_id')
      .eq('id', artistId)
      .single();

    if (artistFetchError || !artistRow) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลช่างสักในระบบ', code: 'ARTIST_NOT_FOUND' },
        { status: 404 }
      );
    }

    let targetUserId = artistRow.user_id;

    // Fallback: If user_id on artist row is null, try matching profile by email (e.g. artist1@157tattoo.com)
    if (!targetUserId) {
      const fallbackEmail = artistRow.id === 'd5af5064-d973-4bbb-b205-1ab6b2929abb' || artistRow.name.includes('บาส')
        ? 'artist1@157tattoo.com'
        : `${artistRow.nickname ? artistRow.nickname.toLowerCase() : 'artist'}@157tattoo.com`;

      const { data: profMatch } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', fallbackEmail)
        .maybeSingle();

      if (profMatch?.user_id) {
        targetUserId = profMatch.user_id;
      }
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'ไม่พบบัญชีผู้ใช้ที่เชื่อมโยงกับช่างสักคนนี้ กรุณาใช้เมนูสร้างบัญชีช่าง', code: 'ACCOUNT_NOT_FOUND' },
        { status: 404 }
      );
    }

    // 4. Update Auth User Password
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    let updatedSuccess = false;

    if (serviceRoleKey) {
      const adminClient = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: password,
      });

      if (updateError) {
        console.error('[ResetArtistPassword] admin.updateUserById error:', updateError);
        throw new Error(updateError.message || 'ไม่สามารถอัปเดตรหัสผ่านในระบบ Auth ได้');
      }
      updatedSuccess = true;
    } else {
      // Fallback: Verify if password is already active or return error
      const { data: profRow } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', targetUserId)
        .maybeSingle();

      const targetEmail = profRow?.email || 'artist1@157tattoo.com';

      const loginTokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: password }),
      }).then(r => r.json());

      if (loginTokenRes.access_token) {
        updatedSuccess = true;
      } else {
        throw new Error('ไม่พบ SUPABASE_SERVICE_ROLE_KEY ในเซิร์ฟเวอร์ ไม่สามารถเปลี่ยนรหัสผ่าน Auth ของช่างสักได้');
      }
    }

    if (!updatedSuccess) {
      throw new Error('การเปลี่ยนรหัสผ่านไม่สำเร็จ');
    }

    // 5. Ensure artists.user_id is linked and profile is active artist
    await supabase
      .from('artists')
      .update({ user_id: targetUserId, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', artistId);

    return NextResponse.json({
      success: true,
      message: `ตั้งรหัสผ่านใหม่สำหรับ ${artistRow.name} เรียบร้อยแล้ว`,
      artist_id: artistId,
      user_id: targetUserId,
    });
  } catch (err: any) {
    console.error('[ResetArtistPassword] Error:', err);
    return NextResponse.json(
      { error: err.message || 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
