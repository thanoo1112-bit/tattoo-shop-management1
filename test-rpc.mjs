const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const headers = { 'apikey': key, 'Content-Type': 'application/json' };

async function run() {
  const shopRes = await fetch(`${url}/rest/v1/rpc/get_public_shop_info`, { 
    method: 'POST', headers, body: JSON.stringify({ p_slug: '157-tattoo' }) 
  });
  const shop = await shopRes.json();
  const shopId = shop.id;
  
  const artistsRes = await fetch(`${url}/rest/v1/rpc/get_public_artists_by_shop_slug`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_slug: '157-tattoo' })
  });
  const artists = await artistsRes.json();

  if (artists.length > 1) {
    const artist = artists[1]; // ต้น กล้า
    console.log('Testing artist:', artist.display_name);
    const stylesRes = await fetch(`${url}/rest/v1/rpc/get_public_artist_tattoo_styles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_shop_slug: '157-tattoo', p_artist_id: artist.artist_id })
    });
    console.log('Styles using artist_id & p_shop_slug:', await stylesRes.json());
  }
}
run();
