import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  let supabaseUser = null;
  let supabaseRole: string | null = null;
  let isActive = true;
  let isValidArtist = false;
  let supabaseResponse = NextResponse.next({ request });

  try {
    const sessionRes = await updateSession(request);
    supabaseUser = sessionRes.user;
    supabaseResponse = sessionRes.supabaseResponse;
    if (supabaseUser && sessionRes.supabase) {
      const { data: profile } = await sessionRes.supabase
        .from('profiles')
        .select('role, is_active')
        .eq('user_id', supabaseUser.id)
        .maybeSingle();

      if (profile) {
        isActive = profile.is_active !== false;
        if (isActive) {
          const userMetaRole = supabaseUser.user_metadata?.role;
          supabaseRole = (profile.role && profile.role !== 'customer')
            ? profile.role
            : (userMetaRole || profile.role || 'customer');

          if (supabaseRole === 'artist') {
            const { data: artistRecord } = await sessionRes.supabase
              .from('artists')
              .select('id, is_active')
              .eq('user_id', supabaseUser.id)
              .eq('is_active', true)
              .maybeSingle();

            isValidArtist = Boolean(artistRecord && artistRecord.is_active !== false);
          }
        }
      }
    }
  } catch (err) {
    // Supabase network / offline fallback
  }

  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // 1. Unauthenticated or Inactive Account accessing Staff Protected Routes
  if (!supabaseUser || !supabaseRole || !isActive) {
    if (pathname.startsWith('/admin') || pathname.startsWith('/artist')) {
      url.pathname = '/staff/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 2. Authenticated ADMIN (Dual Access: Admin Portal + Own Artist Portal, Bypasses Customer Onboarding)
  if (supabaseRole === 'admin') {
    if (
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/staff/login' ||
      pathname === '/complete-profile' ||
      pathname.startsWith('/portal')
    ) {
      url.pathname = '/admin/dashboard';
      return NextResponse.redirect(url);
    }
    if (pathname === '/artist') {
      url.pathname = '/artist/dashboard';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 3. Authenticated ARTIST (Bypasses Customer Onboarding)
  if (supabaseRole === 'artist') {
    if (!isValidArtist) {
      // Artist role without linked active artists row -> Denied
      if (
        pathname.startsWith('/admin') ||
        pathname.startsWith('/artist') ||
        pathname === '/complete-profile'
      ) {
        url.pathname = '/staff/login';
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    if (
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/staff/login' ||
      pathname === '/complete-profile' ||
      pathname.startsWith('/portal') ||
      pathname.startsWith('/admin')
    ) {
      url.pathname = '/artist/dashboard';
      return NextResponse.redirect(url);
    }
    if (pathname === '/artist') {
      url.pathname = '/artist/dashboard';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 4. Authenticated CUSTOMER
  if (supabaseRole === 'customer') {
    if (pathname.startsWith('/admin') || pathname.startsWith('/artist')) {
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }
    if (pathname === '/staff/login') {
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Pass through to Client-Side SPA Route Guards for definitive Supabase verification
  return supabaseResponse;
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/complete-profile',
    '/portal/:path*',
    '/admin/:path*',
    '/artist/:path*',
    '/artist',
    '/staff/login',
  ],
};
