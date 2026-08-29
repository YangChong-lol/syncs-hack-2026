// Quick smoke test of the real Gemini pipeline via local server endpoints.
// Usage: node scripts/test-real-api.js <fridgeImage> <nonFridgeImage>
const fs = require('fs');

const BASE = 'http://localhost:3000';

function toDataUrl(file) {
  const ext = file.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  return `data:image/${ext};base64,` + fs.readFileSync(file).toString('base64');
}

let TOKEN = '';

async function post(path, body) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ms: Date.now() - t0, status: res.status, json };
}

(async () => {
  const [fridgeImg, otherImg] = process.argv.slice(2);

  TOKEN = (await post('/api/auth/login', { email: 'vision-test@example.com', password: 'test1234' })).json.token;

  console.log('--- detect: real fridge photo ---');
  let r = await post('/api/detect', { image: toDataUrl(fridgeImg) });
  console.log(`${r.status} in ${r.ms}ms:`, JSON.stringify(r.json));

  if (otherImg) {
    console.log('--- detect: NON-fridge image (screenshot) ---');
    r = await post('/api/detect', { image: toDataUrl(otherImg) });
    console.log(`${r.status} in ${r.ms}ms:`, JSON.stringify(r.json));
  }

  console.log('--- analyze: real fridge photo ---');
  r = await post('/api/analyze', { image: toDataUrl(fridgeImg) });
  console.log(`${r.status} in ${r.ms}ms:`);
  console.log(JSON.stringify(r.json, null, 2));
})().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
