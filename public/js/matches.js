if (!SMF.getEmail()) location.href = 'index.html';

let currentMatch = null;

function fmtDist(m) {
  return m < 1000 ? m + ' m away' : (m / 1000).toFixed(1) + ' km away';
}

async function load() {
  try {
    const data = await api('/api/matches?email=' + encodeURIComponent(SMF.getEmail()));
    hide(el('loading'));
    if (!data.matches.length) return renderNoMatch(data.almost);
    renderResults(data);
  } catch (e) {
    hide(el('loading'));
    if (/no inventory/.test(e.message)) return (location.href = 'scan.html');
    const err = el('err');
    err.textContent = e.message;
    show(err);
  }
}

function renderNoMatch(almost) {
  show(el('noMatch'));
  const t = el('almostText');
  if (almost && almost.dishes && almost.dishes.length) {
    const d = almost.dishes[0];
    const missing = (d.missing || []).join(', ');
    t.textContent = missing
      ? `So close! You and ${almost.name} (${fmtDist(almost.distance_m)}) could make ${d.name} - you're only missing ${missing}.`
      : `So close! You and ${almost.name} (${fmtDist(almost.distance_m)}) almost have ${d.name} covered.`;
  } else {
    t.textContent = 'Try again after adding a few more ingredients, or check back when more neighbours have scanned their fridges.';
  }
}

function renderResults(data) {
  show(el('results'));
  const map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const meIcon = L.divIcon({ className: '', html: '<div class="me-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  const meMarker = L.marker([data.me.lat, data.me.lng], { icon: meIcon }).addTo(map);
  meMarker.bindTooltip('You', { permanent: true, direction: 'top', offset: [0, -8] });

  const bounds = [[data.me.lat, data.me.lng]];
  const list = el('matchList');
  list.innerHTML = '';

  data.matches.forEach((m) => {
    const icon = L.divIcon({
      className: '',
      html: `<div class="photo-pin" style="border-color:${m.score >= 80 ? '#16a34a' : '#d97706'}"><img src="${m.photo}"></div>`,
      iconSize: [52, 52],
      iconAnchor: [26, 26],
    });
    L.marker([m.lat, m.lng], { icon }).addTo(map).on('click', () => openModal(m));
    bounds.push([m.lat, m.lng]);

    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <img src="${m.photo}" alt="fridge" />
      <div class="info">
        <h3>${m.name}'s fridge</h3>
        <p>${fmtDist(m.distance_m)} \u00b7 ${m.dishes.length} dish idea${m.dishes.length > 1 ? 's' : ''}</p>
        <p>${m.dishes.map((d) => d.name).join(', ')}</p>
      </div>
      <div class="score-badge ${m.score >= 80 ? '' : 'mid'}">${m.score}<small>match</small></div>`;
    card.onclick = () => openModal(m);
    list.appendChild(card);
  });

  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
}

// ---------- modal ----------

function openModal(m) {
  currentMatch = m;
  el('modalTitle').textContent = `Cook with ${m.name}`;
  el('modalSub').textContent = `${fmtDist(m.distance_m)} \u00b7 match score ${m.score}. Pick the dishes you're keen on:`;
  const list = el('dishList');
  list.innerHTML = '';
  m.dishes.forEach((d, i) => {
    const row = document.createElement('label');
    row.className = 'dish' + (i === 0 ? ' selected' : '');
    const missing = (d.missing || []).length
      ? `<p class="missing">Still needed: ${d.missing.join(', ')}</p>`
      : '';
    row.innerHTML = `
      <input type="checkbox" data-i="${i}" ${i === 0 ? 'checked' : ''} />
      <div class="body">
        <h4>${d.name}</h4>
        <p>You bring: ${(d.uses_yours || []).join(', ') || '-'}</p>
        <p>They bring: ${(d.uses_theirs || []).join(', ') || '-'}</p>
        ${missing}
      </div>`;
    row.querySelector('input').addEventListener('change', (e) => {
      row.classList.toggle('selected', e.target.checked);
    });
    list.appendChild(row);
  });
  hide(el('modalResult'));
  show(el('modalPick'));
  hide(el('inviteErr'));
  el('sendBtn').disabled = false;
  el('modalBg').classList.add('open');
}

el('closeModal').addEventListener('click', () => el('modalBg').classList.remove('open'));
el('doneBtn').addEventListener('click', () => el('modalBg').classList.remove('open'));
el('modalBg').addEventListener('click', (e) => {
  if (e.target === el('modalBg')) el('modalBg').classList.remove('open');
});

el('sendBtn').addEventListener('click', async () => {
  const err = el('inviteErr');
  hide(err);
  const selected = [...el('dishList').querySelectorAll('input:checked')].map(
    (cb) => currentMatch.dishes[Number(cb.dataset.i)]
  );
  if (!selected.length) {
    err.textContent = 'Select at least one dish.';
    return show(err);
  }
  try {
    el('sendBtn').disabled = true;
    const r = await api('/api/invite', {
      fromEmail: SMF.getEmail(),
      toId: currentMatch.id,
      dishes: selected,
    });
    el('resultTitle').textContent = r.sent ? 'Invite sent anonymously' : 'Invite ready (preview)';
    el('resultNote').textContent = r.note;
    el('emailPreview').innerHTML = `<b>${r.preview.subject}</b>${r.preview.body}`;
    hide(el('modalPick'));
    show(el('modalResult'));
  } catch (e) {
    err.textContent = e.message;
    show(err);
    el('sendBtn').disabled = false;
  }
});

load();
