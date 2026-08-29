if (!SMF.getEmail()) location.href = 'index.html';

const video = el('video');
const overlay = el('overlay');
const indicator = el('indicator');
const indicatorText = el('indicatorText');
const shutter = el('shutter');

let stream = null;
let detecting = false;
let fridgeOk = false;
let detectTimer = null;
let capturedImage = null;
let ingredients = [];
let uncertain = [];

// ---------- camera ----------

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => {
      sizeOverlay();
      detectLoop();
      detectTimer = setInterval(detectLoop, 2600);
    });
  } catch (e) {
    const err = el('camErr');
    err.textContent = 'Camera unavailable (' + e.message + '). Use "Upload a photo instead" below.';
    show(err);
    setIndicator('idle', 'Camera unavailable');
  }
}

function sizeOverlay() {
  const wrap = overlay.parentElement;
  overlay.width = wrap.clientWidth;
  overlay.height = wrap.clientHeight;
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
  indicator.className = 'indicator ' + state;
  indicatorText.textContent = text;
}

function drawBox(box) {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!box) return;
  const [ymin, xmin, ymax, xmax] = box;
  const x = (xmin / 1000) * overlay.width;
  const y = (ymin / 1000) * overlay.height;
  const w = ((xmax - xmin) / 1000) * overlay.width;
  const h = ((ymax - ymin) / 1000) * overlay.height;
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(x, y, w, h);
}

async function detectLoop() {
  if (detecting || !video.videoWidth || !el('stage-camera') || el('stage-camera').classList.contains('hidden')) return;
  detecting = true;
  try {
    const frame = grabFrame(320, 0.55);
    const r = await api('/api/detect', { image: frame });
    fridgeOk = !!r.fridge;
    if (fridgeOk) {
      setIndicator('green', 'Fridge detected');
      drawBox(r.box_2d);
      shutter.disabled = false;
    } else {
      setIndicator('red', 'Did not detect fridge');
      drawBox(null);
      shutter.disabled = true;
    }
  } catch (e) {
    setIndicator('idle', 'Detection error, retrying...');
  } finally {
    detecting = false;
  }
}

// ---------- capture & analyze ----------

shutter.addEventListener('click', () => {
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

// ---------- confirm & save ----------

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

el('saveBtn').addEventListener('click', async () => {
  const err = el('confirmErr');
  hide(err);
  if (!ingredients.length) {
    err.textContent = 'Keep at least one ingredient.';
    return show(err);
  }
  try {
    el('saveBtn').disabled = true;
    await api('/api/inventory', { email: SMF.getEmail(), ingredients, image: capturedImage });
    if (detectTimer) clearInterval(detectTimer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    location.href = 'matches.html';
  } catch (e) {
    err.textContent = e.message;
    show(err);
    el('saveBtn').disabled = false;
  }
});

window.addEventListener('resize', sizeOverlay);
startCamera();
