const FT = {
  getToken: () => localStorage.getItem('ft_token') || '',
  setToken: (v) => localStorage.setItem('ft_token', v),
  logout: () => {
    localStorage.removeItem('ft_token');
    location.href = 'index.html';
  },
};

async function api(path, body, method) {
  const opts = {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
  };
  if (FT.getToken()) opts.headers['Authorization'] = 'Bearer ' + FT.getToken();
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth')) {
    FT.logout();
    throw new Error('session expired');
  }
  if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
  return json;
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function el(id) { return document.getElementById(id); }

function fmtDist(m) {
  return m < 1000 ? m + ' m away' : (m / 1000).toFixed(1) + ' km away';
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('open');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('open'), 2600);
}
