const URL = 'https://sftkthsgldvyorydznyz.supabase.co';
const KEY = 'sb_publishable_mM82fQa0YSahIDePZ1r0vg_cwQc_mB9';

async function rpc(name, body) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    const error = await res.json();
    return { error, status: res.status };
  }
  const data = await res.json();
  return { data };
}

async function test() {
  console.log('Testing get_public_shop_by_slug...');
  const shopResult = await rpc('get_public_shop_by_slug', { p_slug: '157-tattoo' });
  console.log('Shop RPC Result:', JSON.stringify(shopResult, null, 2));

  console.log('\nTesting get_public_artists_by_shop_slug...');
  const artistResult = await rpc('get_public_artists_by_shop_slug', { p_slug: '157-tattoo' });
  console.log('Artist RPC Result:', JSON.stringify(artistResult, null, 2));

  console.log('\nChecking if shop exists...');
  const res = await fetch(`${URL}/rest/v1/shops?slug=eq.157-tattoo&select=id,name,slug`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  });
  console.log('Shop Exists:', JSON.stringify(await res.json(), null, 2));
}

test();
