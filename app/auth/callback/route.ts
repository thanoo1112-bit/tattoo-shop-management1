import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSafeReturnUrl } from '@/lib/urlUtils';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as any;
  const rawNext = searchParams.get('next') || searchParams.get('redirect');

  const safeNext = getSafeReturnUrl(rawNext);
  const redirectTarget = new URL(safeNext, origin);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && anonKey) {
    const response = NextResponse.redirect(redirectTarget);

    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          const cookieHeader = request.headers.get('cookie') || '';
          return cookieHeader.split('; ').filter(Boolean).map((c) => {
            const [name, ...val] = c.split('=');
            return { name: name.trim(), value: val.join('=').trim() };
          });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    // 1. Exchange PKCE code if present
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return response;
      }
      console.error('[Auth Callback] Code exchange error:', error.message);
    }

    // 2. Verify OTP token_hash if present
    if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type || 'recovery',
      });
      if (!error) {
        return response;
      }
      console.error('[Auth Callback] Token hash verify error:', error.message);
    }
  }

  // Fallback / Forward parameters for /reset-password so client can verify if server exchange failed
  if (safeNext === '/reset-password' || safeNext.startsWith('/reset-password')) {
    const fallbackUrl = new URL(safeNext, origin);
    if (code) fallbackUrl.searchParams.set('code', code);
    if (tokenHash) fallbackUrl.searchParams.set('token_hash', tokenHash);
    if (type) fallbackUrl.searchParams.set('type', type);
    return NextResponse.redirect(fallbackUrl);
  }

  // Fallback to login if code exchange failed or no code present
  return NextResponse.redirect(`${origin}/login`);
}
