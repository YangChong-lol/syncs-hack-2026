// Explore tab: matched fridges on a map + list, invite via dish modal.

let exMap = null;
let exMarkers = [];
let exLoaded = false;
let currentMatch = null;

document.addEventListener('tabshown', (e) => {
  if (e.detail !== 'explore' || !FTApp.state.profileComplete) return;
  if (!exLoaded) loadExplore();
  else if (exMap) setTimeout(() => exMap.invalidateSize(), 60);
});

el('exRefresh').addEventListener('click', () => {
  exLoaded = false;
  FTApp.refreshMatches();
  loadExplore();
});

async function loadExplore() {
  exLoaded = true;
  hide(el('exResults'));
  hide(el('exNoMatch'));
  hide(el('exErr'));
  show(el('exLoading'));
  try {
    const data = await FTApp.getMatches();
    hide(el('exLoading'));
    if (!data.matches.length) return renderNoMatch(data.almost);
    renderResults(data);
  } catch (e) {
    hide(el('exLoading'));
    const err = el('exErr');
    err.textContent = e.message;
    show(err);
  }
}

function renderNoMatch(almost) {
  show(el('exNoMatch'));
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
  show(el('exResults'));

  if (!exMap) {
    exMap = L.map('map');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(exMap);
  }
  exMarkers.forEach((m) => m.remove());
  exMarkers = [];

  const meIcon = L.divIcon({ className: '', html: '<div class="me-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
  const meMarker = L.marker([data.me.lat, data.me.lng], { icon: meIcon }).addTo(exMap);
  meMarker.bindTooltip('You', { permanent: true, direction: 'top', offset: [0, -8] });
  exMarkers.push(meMarker);

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
    const marker = L.marker([m.lat, m.lng], { icon }).addTo(exMap).on('click', () => openModal(m));
    exMarkers.push(marker);
    bounds.push([m.lat, m.lng]);

    const pendingTag = m.invite_pending ? '<span class="pending-tag">Invite pending</span>' : '';
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <img src="${m.photo}" alt="fridge" />
      <div class="info">
        <h3>${m.name}'s fridge ${pendingTag}</h3>
        <p>${fmtDist(m.distance_m)} \u00b7 ${m.dishes.length} dish idea${m.dishes.length > 1 ? 's' : ''}</p>
        <p>${m.dishes.map((d) => d.name).join(', ')}</p>
      </div>
      <div class="score-badge ${m.score >= 80 ? '' : 'mid'}">${m.score}<small>match</small></div>`;
    card.onclick = () => openModal(m);
    list.appendChild(card);
  });

  setTimeout(() => {
    exMap.invalidateSize();
    exMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, 60);
}

// ---------- dish modal ----------

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
    row.querySelector('input').addEventListener('change', (ev) => {
      row.classList.toggle('selected', ev.target.checked);
    });
    list.appendChild(row);
  });
  hide(el('modalResult'));
  show(el('modalPick'));
  hide(el('inviteErr'));
  el('sendBtn').disabled = !!m.invite_pending;
  el('sendBtn').textContent = m.invite_pending ? 'Invite already pending' : 'Send anonymous invite';
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
    const r = await FTApp.sendInvite(currentMatch.id, selected);
    currentMatch.invite_pending = true;
    el('resultTitle').textContent = r.emailed ? 'Invite sent anonymously' : 'Invite delivered';
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
