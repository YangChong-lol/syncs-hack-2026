// Already logged in? Go straight to the app.
if (FT.getToken()) {
  api('/api/me')
    .then(() => (location.href = 'app.html'))
    .catch(() => {}); // stale token: stay on login (api() already cleared it on 401)
}

async function submit() {
  const err = el('err');
  hide(err);
  const email = el('email').value.trim();
  const password = el('password').value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    err.textContent = 'Please enter a valid email address.';
    return show(err);
  }
  if (password.length < 4) {
    err.textContent = 'Password must be at least 4 characters.';
    return show(err);
  }
  try {
    el('loginBtn').disabled = true;
    const r = await api('/api/auth/login', { email, password });
    FT.setToken(r.token);
    location.href = 'app.html' + (r.created ? '#profile' : '');
  } catch (e) {
    err.textContent = e.message;
    show(err);
    el('loginBtn').disabled = false;
  }
}

el('loginBtn').addEventListener('click', submit);
el('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submit();
});
