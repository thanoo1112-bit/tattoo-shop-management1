import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import FlashBookingClient from '@/components/booking/FlashBookingClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string; flashId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FlashBookingPageRoute({ params, searchParams }: PageProps) {
  const { slug, flashId } = await params;
  const resolvedSearchParams = await searchParams;
  const variantId = (resolvedSearchParams.variant_id as string) || '';

  // 1. Fetch Shop details
  const { data: shopDataRaw } = await supabase.rpc('get_public_shop_by_slug', { p_slug: slug });
  if (!shopDataRaw || shopDataRaw.length === 0) {
    notFound();
  }
  const shop = shopDataRaw[0] as { id: string; name: string; slug: string; logo_url: string | null };

  // 2. Fetch Flash Design
  const { data: flash } = await supabase
    .from('flash_designs')
    .select('*')
    .eq('id', flashId)
    .maybeSingle();

  if (!flash) {
    notFound();
  }

  // 3. Fetch Artist Profile and work settings via public secure RPC
  const { data: artistDataRaw } = await supabase.rpc('get_public_artist_by_id', {
    p_shop_id: shop.id,
    p_artist_id: flash.artist_id
  });

  if (!artistDataRaw || artistDataRaw.length === 0) {
    notFound();
  }
  const artistData = artistDataRaw[0] as {
    id: string;
    full_name: string;
    avatar_url: string;
    accepts_color: boolean;
    accepts_black_grey: boolean;
  };

  const artist = {
    id: artistData.id,
    full_name: artistData.full_name,
    avatar_url: artistData.avatar_url
  };

  const acceptsColor = artistData.accepts_color;
  const acceptsBlackGrey = artistData.accepts_black_grey;

  // 4. Fetch Style details
  const { data: style } = await supabase
    .from('tattoo_styles')
    .select('id, name')
    .eq('id', flash.style_id)
    .maybeSingle();

  const styleName = style ? style.name : 'Unknown';

  // 5. Fetch Flash Design Variants
  const { data: variants } = await supabase
    .from('flash_design_variants')
    .select('*')
    .eq('flash_design_id', flashId)
    .eq('is_enabled', true)
    .order('sort_order', { ascending: true });

  // 6. Fetch Shop Booking Settings
  const { data: settings } = await supabase
    .from('shop_booking_settings')
    .select('*')
    .eq('shop_id', shop.id)
    .maybeSingle();


  return (
    <main className="min-h-screen bg-[#0A0A0A] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <FlashBookingClient
          shop={shop}
          flash={flash}
          artist={{
            artist_id: artist.id,
            display_name: artist.full_name,
            avatar_url: artist.avatar_url
          }}
          styleName={styleName}
          variants={variants || []}
          initialVariantId={variantId}
          settings={settings}
          acceptsColor={acceptsColor}
          acceptsBlackGrey={acceptsBlackGrey}
        />
      </div>
    </main>
  );
}
