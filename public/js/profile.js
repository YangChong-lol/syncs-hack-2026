// Profile tab: account info, fridge scan, location, invite inbox/outbox.

// ---------- render profile from /api/me ----------

FTApp.onMeChanged(renderProfile);

function renderProfile(data) {
  const u = data.user;
  el('avatar').textContent = (u.name || '?')[0].toUpperCase();
  el('pfName').textContent = u.name;
  el('pfEmail').textContent = u.email;
  const st = el('pfStatus');
  st.textContent = data.profile_complete ? 'Ready to match' : 'Incomplete';
  st.classList.toggle('ok', data.profile_complete);

  // fridge
  if (u.ingredients.length) {
    hide(el('fridgeEmpty'));
    show(el('fridgeInfo'));
    if (u.photo) {
      el('fridgePhoto').src = u.photo;
      show(el('fridgePhoto'));
    }
    const box = el('pfIngs');
    box.innerHTML = '';
    u.ingredients.forEach((ing) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (ing.freshness === 'use_soon' ? ' use-soon' : '');
      chip.innerHTML = `${ing.name} <small>${ing.quantity || ''}</small>`;
      box.appendChild(chip);
    });
  } else {
    show(el('fridgeEmpty'));
    hide(el('fridgeInfo'));
  }

  // location pin
  if (Number.isFinite(u.lat) && !pin) setPin(u.lat, u.lng);

  renderInvites(data);
}

// ---------- location minimap ----------

const CAMPERDOWN = [-33.8888, 151.177];
let miniMap = null;
let pin = null;

function initMiniMap() {
  if (miniMap) {
    setTimeout(() => miniMap.invalidateSize(), 60);
    return;
  }
  const me = FTApp.state.me && FTApp.state.me.user;
  const center = me && Number.isFinite(me.lat) ? [me.lat, me.lng] : CAMPERDOWN;
  miniMap = L.map('minimap').setView(center, 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(miniMap);
  miniMap.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
  if (me && Number.isFinite(me.lat)) setPin(me.lat, me.lng);
  setTimeout(() => miniMap.invalidateSize(), 60);
}

function setPin(lat, lng) {
  if (!miniMap) return;
  if (pin) pin.setLatLng([lat, lng]);
  else pin = L.marker([lat, lng], { draggable: true }).addTo(miniMap);
}

document.addEventListener('tabshown', (e) => {
  if (e.detail === 'profile') initMiniMap();
});

el('saveLocBtn').addEventListener('click', async () => {
  const msg = el('locMsg');
  hide(msg);
  if (!pin) {
    msg.textContent = 'Tap the map to drop a pin first.';
    msg.className = 'banner err';
    return show(msg);
  }
  const { lat, lng } = pin.getLatLng();
  try {
    await api('/api/profile', { lat, lng });
    await FTApp.loadMe();
    FTApp.refreshMatches();
    msg.textContent = 'Location saved.';
    msg.className = 'banner ok';
    show(msg);
    setTimeout(() => hide(msg), 2500);
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'banner err';
    show(msg);
  }
});

// ---------- invites ----------

function inviteDishNames(inv) {
  return inv.dishes.map((d) => d.name).join(', ');
}

function renderInvites(data) {
  const recv = el('recvList');
  const pendingCount = data.invites_received.filter((i) => i.status === 'pending').length;
  const cc = el('recvCount');
  cc.textContent = pendingCount;
  cc.classList.toggle('hidden', pendingCount === 0);

  if (!data.invites_received.length) {
    recv.innerHTML = '<p class="hint">No invites yet. They\'ll appear here when a neighbour wants to cook with you.</p>';
  } else {
    recv.innerHTML = '';
    data.invites_received.forEach((inv) => {
      const item = document.createElement('div');
      item.className = 'invite-item';
      const photo = inv.other.photo
        ? `<img src="${inv.other.photo}" alt="fridge" />`
        : '<div class="ph"></div>';
      let action = '';
      if (inv.status === 'pending') {
        action = `
          <div class="invite-actions">
            <button class="btn tinder small" data-act="accept" data-id="${inv.id}">Accept &amp; reply</button>
            <button class="btn secondary small" data-act="decline" data-id="${inv.id}">Decline</button>
          </div>`;
      } else if (inv.status === 'accepted') {
        action = `<p class="contact ok-text">Accepted \u2713 ${inv.other.email ? 'Contact: ' + inv.other.email : ''}</p>`;
      } else {
        action = '<p class="hint">Declined</p>';
      }
      item.innerHTML = `
        ${photo}
        <div class="body">
          <h4>${inv.other.name} wants to cook: ${inviteDishNames(inv)}</h4>
          <p class="hint invite-mail">${inv.subject}</p>
          ${action}
        </div>`;
      item.querySelector('.invite-mail').addEventListener('click', () => showInviteEmail(inv));
      recv.appendChild(item);
    });

    recv.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => respondInvite(btn.dataset.id, btn.dataset.act === 'accept', btn));
    });
  }

  const sent = el('sentList');
  if (!data.invites_sent.length) {
    sent.innerHTML = '<p class="hint">Nothing sent yet. Find a fridge in Explore and send a cooking invite.</p>';
  } else {
    sent.innerHTML = '';
    data.invites_sent.forEach((inv) => {
      const item = document.createElement('div');
      item.className = 'invite-item';
      const photo = inv.other.photo
        ? `<img src="${inv.other.photo}" alt="fridge" />`
        : '<div class="ph"></div>';
      let status;
      if (inv.status === 'accepted') {
        status = `<p class="contact ok-text">Accepted \u2713 ${inv.other.email ? 'Contact: ' + inv.other.email : ''}</p>`;
      } else if (inv.status === 'declined') {
        status = '<p class="hint">Declined</p>';
      } else {
        status = '<p class="hint">Waiting for their reply\u2026</p>';
      }
      item.innerHTML = `
        ${photo}
        <div class="body">
          <h4>To ${inv.other.name}: ${inviteDishNames(inv)}</h4>
          ${status}
        </div>`;
      sent.appendChild(item);
    });
  }
}

function showInviteEmail(inv) {
  el('modalTitle').textContent = 'Their invitation';
  el('modalSub').textContent = '';
  el('dishList').innerHTML = `<div class="email-preview"><b>${inv.subject}</b>${inv.body}</div>`;
  hide(el('inviteErr'));
  el('sendBtn').classList.add('hidden');
  show(el('modalPick'));
  hide(el('modalResult'));
  el('modalBg').classList.add('open');
  const restore = () => {
    el('sendBtn').classList.remove('hidden');
    el('modalBg').removeEventListener('transitionend', restore);
  };
  el('closeModal').addEventListener('click', restore, { once: true });
}

async function respondInvite(id, accept, btn) {
  try {
    btn.disabled = true;
    const r = await api(`/api/invite/${id}/respond`, { accept });
    if (accept && r.contact) {
      toast(`It's on! You can reach ${r.contact.name} at ${r.contact.email}`);
    } else {
      toast(accept ? 'Invite accepted.' : 'Invite declined.');
    }
    await FTApp.loadMe();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
  }
}

// ---------- scan overlay (camera gate -> analyze -> confirm) ----------

const video = el('video');
const overlayCanvas = el('overlay');
let stream = null;
let detecting = false;
let fridgeOk = false;
let detectTimer = null;
let capturedImage = null;
let ingredients = [];
let uncertain = [];

el('scanBtn').addEventListener('click', () => {
  show(el('scanOverlay'));
  document.body.classList.add('no-scroll');
  resetScanStages();
  startCamera();
});

el('scanClose').addEventListener('click', closeScan);

function closeScan() {
  stopCamera();
  hide(el('scanOverlay'));
  document.body.classList.remove('no-scroll');
}

function resetScanStages() {
  show(el('stage-camera'));
  hide(el('stage-analyzing'));
  hide(el('stage-confirm'));
  hide(el('camErr'));
}

function stopCamera() {
  if (detectTimer) { clearInterval(detectTimer); detectTimer = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
}

async function startCamera() {
  setIndicator('idle', 'Starting camera...');
  el('shutter').disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
      sizeOverlay();
      detectLoop();
      if (!detectTimer) detectTimer = setInterval(detectLoop, 3000);
    }, { once: true });
  } catch (e) {
    const err = el('camErr');
    err.textContent = 'Camera unavailable (' + e.message + '). Use "Upload a photo instead" below.';
    show(err);
    setIndicator('idle', 'Camera unavailable');
  }
}

function sizeOverlay() {
  const wrap = overlayCanvas.parentElement;
  overlayCanvas.width = wrap.clientWidth;
  overlayCanvas.height = wrap.clientHeight;
}

function grabFrame(maxWidth, quality) {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * scale);
  c.height = Math.round(video.videoHeight * scale);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function setIndicator(state, text) {
  el('indicator').className = 'indicator ' + state;
  el('indicatorText').textContent = text;
}

function drawBox(box) {
  const ctx = overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!box) return;
  const [ymin, xmin, ymax, xmax] = box;
  const x = (xmin / 1000) * overlayCanvas.width;
  const y = (ymin / 1000) * overlayCanvas.height;
  const w = ((xmax - xmin) / 1000) * overlayCanvas.width;
  const h = ((ymax - ymin) / 1000) * overlayCanvas.height;
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(x, y, w, h);
}

async function detectLoop() {
  if (detecting || !stream || !video.videoWidth) return;
  if (el('stage-camera').classList.contains('hidden')) return;
  detecting = true;
  try {
    const frame = grabFrame(320, 0.55);
    const r = await api('/api/detect', { image: frame });
    fridgeOk = !!r.fridge;
    if (fridgeOk) {
      setIndicator('green', 'Fridge detected');
      drawBox(r.box_2d);
      el('shutter').disabled = false;
    } else {
      setIndicator('red', 'Did not detect fridge');
      drawBox(null);
      el('shutter').disabled = true;
    }
  } catch (e) {
    setIndicator('idle', 'Detection error, retrying...');
  } finally {
    detecting = false;
  }
}

el('shutter').addEventListener('click', () => {
  if (!fridgeOk) return;
  capturedImage = grabFrame(1280, 0.85);
  analyze(capturedImage);
});

el('uploadLink').addEventListener('click', () => el('uploadInput').click());
el('uploadInput').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      capturedImage = c.toDataURL('image/jpeg', 0.85);
      analyze(capturedImage);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

async function analyze(image) {
  hide(el('stage-camera'));
  hide(el('camErr'));
  show(el('stage-analyzing'));
  try {
    const r = await api('/api/analyze', { image });
    if (!r.is_fridge_interior) {
      hide(el('stage-analyzing'));
      show(el('stage-camera'));
      const err = el('camErr');
      err.textContent = "That doesn't look like the inside of a fridge. Open your fridge and try again.";
      show(err);
      return;
    }
    ingredients = r.ingredients || [];
    uncertain = r.uncertain || [];
    renderConfirm();
    hide(el('stage-analyzing'));
    show(el('stage-confirm'));
  } catch (e) {
    hide(el('stage-analyzing'));
    show(el('stage-camera'));
    const err = el('camErr');
    err.textContent = 'Analysis failed: ' + e.message;
    show(err);
  }
}

function renderConfirm() {
  const ingList = el('ingList');
  ingList.innerHTML = '';
  ingredients.forEach((ing, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (ing.freshness === 'use_soon' ? ' use-soon' : '');
    chip.innerHTML = `${ing.name} <small>${ing.quantity || ''}</small>`;
    const btn = document.createElement('button');
    btn.textContent = '\u00d7';
    btn.onclick = () => { ingredients.splice(i, 1); renderConfirm(); };
    chip.appendChild(btn);
    ingList.appendChild(chip);
  });

  const uncCard = el('uncCard');
  const uncList = el('uncList');
  uncList.innerHTML = '';
  if (!uncertain.length) hide(uncCard);
  else {
    show(uncCard);
    uncertain.forEach((u, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip uncertain';
      chip.title = u.reason || '';
      chip.innerHTML = `${u.name}`;
      const btn = document.createElement('button');
      btn.textContent = '+';
      btn.onclick = () => {
        ingredients.push({ name: u.name, quantity: '', category: 'other', freshness: 'unknown' });
        uncertain.splice(i, 1);
        renderConfirm();
      };
      chip.appendChild(btn);
      uncList.appendChild(chip);
    });
  }
}

el('addBtn').addEventListener('click', () => {
  const v = el('addInput').value.trim();
  if (!v) return;
  ingredients.push({ name: v, quantity: '', category: 'other', freshness: 'unknown' });
  el('addInput').value = '';
  renderConfirm();
});

el('retakeBtn').addEventListener('click', () => {
  hide(el('stage-confirm'));
  show(el('stage-camera'));
});

el('saveInvBtn').addEventListener('click', async () => {
  const err = el('confirmErr');
  hide(err);
  if (!ingredients.length) {
    err.textContent = 'Keep at least one ingredient.';
    return show(err);
  }
  try {
    el('saveInvBtn').disabled = true;
    await api('/api/inventory', { ingredients, image: capturedImage });
    await FTApp.loadMe();
    FTApp.refreshMatches();
    closeScan();
    toast('Fridge saved. You can now match with neighbours!');
  } catch (e) {
    err.textContent = e.message;
    show(err);
  } finally {
    el('saveInvBtn').disabled = false;
  }
});
