const SMF = {
  getEmail: () => localStorage.getItem('smf_email') || '',
  setEmail: (v) => localStorage.setItem('smf_email', v),
  getLoc: () => {
    const lat = parseFloat(localStorage.getItem('smf_lat'));
    const lng = parseFloat(localStorage.getItem('smf_lng'));
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  },
  setLoc: (lat, lng) => {
    localStorage.setItem('smf_lat', String(lat));
    localStorage.setItem('smf_lng', String(lng));
  },
};

async function api(path, body) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function el(id) { return document.getElementById(id); }
