// End-to-end test of profile -> inventory -> real AI matching -> real AI invite.
const BASE = 'http://localhost:3000';

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

(async () => {
  const email = 'e2e-test@example.com';

  // Camperdown, near the seed users
  await req('POST', '/api/profile', { email, lat: -33.8885, lng: 151.1767 });
  console.log('profile OK');

  await req('POST', '/api/inventory', {
    email,
    ingredients: [
      { name: 'eggs', quantity: '6', category: 'egg', freshness: 'fresh' },
      { name: 'tomatoes', quantity: '3', category: 'vegetable', freshness: 'use_soon' },
      { name: 'bacon', quantity: '1 pack', category: 'meat', freshness: 'fresh' },
      { name: 'cheddar cheese', quantity: '1 block', category: 'dairy', freshness: 'fresh' },
      { name: 'spring onions', quantity: '1 bunch', category: 'vegetable', freshness: 'use_soon' },
    ],
  });
  console.log('inventory OK');

  const t0 = Date.now();
  const m = await req('GET', `/api/matches?email=${encodeURIComponent(email)}`);
  console.log(`matches in ${Date.now() - t0}ms: ${m.matches.length} matches`);
  for (const match of m.matches) {
    console.log(`  ${match.name} (score ${match.score}, ${match.distance_m}m): ` +
      match.dishes.map((d) => d.name).join(' | '));
  }

  if (!m.matches.length) return console.log('No matches - nothing to invite.');

  const top = m.matches[0];
  const t1 = Date.now();
  const inv = await req('POST', '/api/invite', {
    fromEmail: email,
    toId: top.id,
    dishes: top.dishes.slice(0, 1),
  });
  console.log(`invite in ${Date.now() - t1}ms (sent=${inv.sent})`);
  console.log('SUBJECT:', inv.preview.subject);
  console.log('BODY:\n' + inv.preview.body);
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
