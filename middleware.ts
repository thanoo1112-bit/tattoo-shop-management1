import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  let supabaseUser = null;
  let supabaseRole: string | null = null;
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
        .single();
      if (profile && profile.is_active !== false) {
        supabaseRole = profile.role || 'customer';
      }
    }
  } catch (err) {
    // Supabase network / offline fallback
  }

  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // Server-Side Role Enforcement (when verified Supabase session exists)
  if (supabaseUser && supabaseRole) {
    if (pathname.startsWith('/admin') && supabaseRole !== 'admin') {
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith('/portal') && supabaseRole === 'admin') {
      url.pathname = '/admin/dashboard';
      return NextResponse.redirect(url);
    }
  }

  // Pass through to Client-Side SPA Route Guards for definitive Supabase verification
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all protected page routes for customer and staff
     */
    '/portal/:path*',
    '/admin/:path*',
  ],
};
