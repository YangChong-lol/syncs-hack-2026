// End-to-end test: login -> profile -> inventory -> matching -> invite ->
// seed auto-accept -> contact exchange. Run with the server up.
const BASE = 'http://localhost:3000';
let TOKEN = '';

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('ok -', msg);
}

(async () => {
  const email = 'e2e-test@example.com';

  // --- auth ---
  let r = await req('POST', '/api/auth/login', { email, password: 'hunter22' });
  assert(r.status === 200 && r.json.token, 'first login creates account');
  TOKEN = r.json.token;

  r = await req('POST', '/api/auth/login', { email, password: 'WRONG' });
  assert(r.status === 401 && /wrong password/i.test(r.json.error), 'wrong password rejected');

  r = await req('POST', '/api/auth/login', { email, password: 'hunter22' });
  assert(r.status === 200, 'correct password logs in');
  TOKEN = r.json.token;

  // --- gating ---
  r = await req('GET', '/api/matches');
  assert(r.status === 400, 'matches blocked before profile complete');

  // --- profile setup ---
  r = await req('POST', '/api/profile', { lat: -33.8885, lng: 151.1767 });
  assert(r.status === 200, 'location saved');

  r = await req('POST', '/api/inventory', {
    ingredients: [
      { name: 'eggs', quantity: '6', category: 'egg', freshness: 'fresh' },
      { name: 'tomatoes', quantity: '3', category: 'vegetable', freshness: 'use_soon' },
      { name: 'bacon', quantity: '1 pack', category: 'meat', freshness: 'fresh' },
      { name: 'cheddar cheese', quantity: '1 block', category: 'dairy', freshness: 'fresh' },
      { name: 'spring onions', quantity: '1 bunch', category: 'vegetable', freshness: 'use_soon' },
    ],
  });
  assert(r.status === 200, 'inventory saved');

  r = await req('GET', '/api/me');
  assert(r.json.profile_complete === true, 'profile now complete');

  // --- matching ---
  const t0 = Date.now();
  r = await req('GET', '/api/matches');
  assert(r.status === 200 && r.json.matches.length > 0, `matching works (${r.json.matches.length} matches in ${Date.now() - t0}ms)`);
  const top = r.json.matches[0];
  console.log('   top match:', top.name, top.score, '-', top.dishes.map((d) => d.name).join(' | '));

  // --- invite + dedupe ---
  r = await req('POST', '/api/invite', { toId: top.id, dishes: top.dishes.slice(0, 1) });
  assert(r.status === 200 && r.json.invite_id, 'invite sent (in-app)');
  console.log('   subject:', r.json.preview.subject);

  r = await req('POST', '/api/invite', { toId: top.id, dishes: top.dishes.slice(0, 1) });
  assert(r.status === 400, 'duplicate pending invite blocked');

  r = await req('GET', '/api/me');
  const sentInv = r.json.invites_sent[0];
  assert(sentInv.status === 'pending', 'sent invite is pending');
  assert(sentInv.other.email === null, 'recipient email hidden while pending');
  assert(sentInv.other.name === 'A neighbour', 'recipient name anonymised while pending');

  // --- seed auto-accept (demo) ---
  console.log('   waiting 35s for seed auto-accept...');
  await new Promise((res2) => setTimeout(res2, 35000));

  r = await req('GET', '/api/me');
  const accepted = r.json.invites_sent[0];
  assert(accepted.status === 'accepted', 'seed user auto-accepted');
  assert(!!accepted.other.email, `contact revealed after accept (${accepted.other.name}: ${accepted.other.email})`);

  console.log('\nALL TESTS PASSED');
})().catch((e) => { console.error('\n' + e.message); process.exit(1); });
