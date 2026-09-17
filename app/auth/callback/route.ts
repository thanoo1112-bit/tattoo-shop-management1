import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSafeReturnUrl } from '@/lib/urlUtils';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') || searchParams.get('redirect');

  const safeNext = getSafeReturnUrl(rawNext);

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (supabaseUrl && anonKey) {
      const response = NextResponse.redirect(`${origin}${safeNext}`);

      const supabase = createServerClient(supabaseUrl, anonKey, {
        cookies: {
          getAll() {
            const cookieHeader = request.headers.get('cookie') || '';
            return cookieHeader.split('; ').filter(Boolean).map((c) => {
              const [name, ...val] = c.split('=');
              return { name, value: val.join('=') };
            });
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      });

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return response;
      }
      console.error('[Auth Callback] Code exchange error:', error.message);
    }
  }

  // Fallback to login if code exchange failed or no code present
  return NextResponse.redirect(`${origin}/login`);
}
