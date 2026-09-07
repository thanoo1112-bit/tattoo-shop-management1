import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // 1. Verify User Authentication & Admin Authorization
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
        { error: 'คุณไม่มีสิทธิ์ในการสร้างบัญชีช่างสัก (เฉพาะ Admin เท่านั้น)', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // 2. Parse Payload
    const body = await req.json();
    const { artistId, email, password } = body;

    const basArtistId = 'd5af5064-d973-4bbb-b205-1ab6b2929abb';
    const targetArtistId = artistId || basArtistId;

    if (!targetArtistId || typeof targetArtistId !== 'string') {
      return NextResponse.json(
        { error: 'รหัสช่างสักไม่ถูกต้อง', code: 'INVALID_ARTIST_ID' },
        { status: 400 }
      );
    }

    const cleanEmail = email ? email.trim().toLowerCase() : 'artist@157tattoo.com';
    if (!cleanEmail || !password || password.trim() === '') {
      return NextResponse.json(
        { error: 'กรุณาระบุอีเมลและรหัสผ่าน', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร', code: 'INVALID_PASSWORD' },
        { status: 400 }
      );
    }

    // 3. Verify target artist row exists in DB
    const { data: artistRow, error: artistFetchError } = await supabase
      .from('artists')
      .select('id, name, nickname, user_id')
      .eq('id', targetArtistId)
      .single();

    if (artistFetchError || !artistRow) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลช่างสักที่ต้องการสร้างบัญชีในระบบ', code: 'ARTIST_NOT_FOUND' },
        { status: 404 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'ไม่พบ SUPABASE_SERVICE_ROLE_KEY ในระบบ ไม่สามารถดำเนินการได้', code: 'MISSING_SERVICE_KEY' },
        { status: 500 }
      );
    }

    const adminClient = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let targetAuthUid: string | null = null;

    // Check if Auth user with cleanEmail already exists (handling partial failure / retry safely)
    const { data: usersObj } = await adminClient.auth.admin.listUsers();
    const existingUser = usersObj?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);

    if (existingUser) {
      targetAuthUid = existingUser.id;
      // Update password & metadata for existing auth user
      const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(targetAuthUid, {
        password: password,
        user_metadata: { role: 'artist', display_name: artistRow.name },
      });
      if (updateAuthErr) {
        console.error('[CreateArtistAccount] Update existing auth user error:', updateAuthErr);
        throw updateAuthErr;
      }
    } else {
      // Create new Auth User
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,
        user_metadata: { role: 'artist', display_name: artistRow.name },
      });

      if (createError) {
        console.error('[CreateArtistAccount] createUser error:', createError);
        throw createError;
      }
      targetAuthUid = createData.user.id;
    }

    if (!targetAuthUid) {
      throw new Error('ไม่สามารถระบุ ID ของบัญชี Auth ได้');
    }

    // 4. Create / Re-insert public.profiles record with role = 'artist' using adminClient (bypasses RLS & UPDATE trigger)
    const displayName = artistRow.nickname ? `ช่าง${artistRow.nickname}` : artistRow.name;
    const profilePayload = {
      user_id: targetAuthUid,
      email: cleanEmail,
      display_name: displayName,
      role: 'artist',
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Delete default trigger-created profile if present
    await adminClient.from('profiles').delete().eq('user_id', targetAuthUid);

    // Insert profile with role = 'artist'
    const { error: profileInsError } = await adminClient
      .from('profiles')
      .insert(profilePayload);

    if (profileInsError) {
      console.error('[CreateArtistAccount] Profile insert error:', profileInsError);
      throw profileInsError;
    }

    // 5. Link public.artists row to the Auth user_id using adminClient
    const { error: artistLinkError } = await adminClient
      .from('artists')
      .update({
        user_id: targetAuthUid,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetArtistId);

    if (artistLinkError) {
      console.error('[CreateArtistAccount] Artist link error:', artistLinkError);
      throw artistLinkError;
    }

    return NextResponse.json({
      success: true,
      message: `สร้าง/เชื่อมต่อบัญชีสำหรับ ${artistRow.name} (${cleanEmail}) เรียบร้อยแล้ว`,
      user_id: targetAuthUid,
      email: cleanEmail,
      artist_id: targetArtistId,
      role: 'artist',
    });
  } catch (err: any) {
    console.error('[CreateArtistAccount] Error:', err);
    return NextResponse.json(
      { error: err.message || 'เกิดข้อผิดพลาดในการสร้างบัญชีช่างสัก', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
