const CAMPERDOWN = [-33.8888, 151.177];
let pin = null;

const map = L.map('minimap').setView(CAMPERDOWN, 15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

function setPin(lat, lng) {
  if (pin) pin.setLatLng([lat, lng]);
  else pin = L.marker([lat, lng], { draggable: true }).addTo(map);
}

map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));

// restore previous session
const savedEmail = SMF.getEmail();
if (savedEmail) el('email').value = savedEmail;
const savedLoc = SMF.getLoc();
if (savedLoc) setPin(savedLoc.lat, savedLoc.lng);

el('continueBtn').addEventListener('click', async () => {
  const email = el('email').value.trim();
  const err = el('err');
  hide(err);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    err.textContent = 'Please enter a valid email address.';
    return show(err);
  }
  if (!pin) {
    err.textContent = 'Please tap the map to set your fridge location.';
    return show(err);
  }
  const { lat, lng } = pin.getLatLng();
  try {
    el('continueBtn').disabled = true;
    await api('/api/profile', { email, lat, lng });
    SMF.setEmail(email);
    SMF.setLoc(lat, lng);
    location.href = 'scan.html';
  } catch (e) {
    err.textContent = e.message;
    show(err);
    el('continueBtn').disabled = false;
  }
});
