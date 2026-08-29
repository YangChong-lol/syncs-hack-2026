const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SEED_FILE = path.join(DATA_DIR, 'users.seed.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function init() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.copyFileSync(SEED_FILE, USERS_FILE);
  }
}

function load() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function save(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function idForEmail(email) {
  return 'u_' + crypto.createHash('md5').update(email.toLowerCase()).digest('hex').slice(0, 10);
}

function upsertProfile({ email, lat, lng }) {
  const users = load();
  const key = email.toLowerCase();
  let user = users.find((u) => u.email.toLowerCase() === key);
  if (user) {
    user.lat = lat;
    user.lng = lng;
  } else {
    user = {
      id: idForEmail(email),
      name: email.split('@')[0],
      email,
      lat,
      lng,
      photo: null,
      seed: false,
      ingredients: [],
      uncertain: [],
      updated_at: new Date().toISOString(),
    };
    users.push(user);
  }
  save(users);
  return user;
}

function savePhoto(userId, dataUrl) {
  const m = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1] === 'png' ? 'png' : 'jpg';
  const file = `${userId}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, file), Buffer.from(m[2], 'base64'));
  return '/uploads/' + file;
}

function setInventory(email, ingredients, photoUrl) {
  const users = load();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  user.ingredients = ingredients;
  if (photoUrl) user.photo = photoUrl;
  user.updated_at = new Date().toISOString();
  save(users);
  return user;
}

function getUser(email) {
  return load().find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}

function getUserById(id) {
  return load().find((u) => u.id === id) || null;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function nearby(me, radiusKm, limit) {
  return load()
    .filter(
      (u) =>
        u.email.toLowerCase() !== me.email.toLowerCase() &&
        Array.isArray(u.ingredients) &&
        u.ingredients.length > 0
    )
    .map((u) => ({ ...u, distance_m: haversineM(me.lat, me.lng, u.lat, u.lng) }))
    .filter((u) => u.distance_m <= radiusKm * 1000)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
}

module.exports = {
  init,
  upsertProfile,
  savePhoto,
  setInventory,
  getUser,
  getUserById,
  nearby,
  UPLOADS_DIR,
};
