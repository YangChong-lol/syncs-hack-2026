const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SEED_FILE = path.join(DATA_DIR, 'users.seed.json');
const INVITES_FILE = path.join(DATA_DIR, 'invites.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function init() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.copyFileSync(SEED_FILE, USERS_FILE);
  if (!fs.existsSync(INVITES_FILE)) fs.writeFileSync(INVITES_FILE, '[]');
}

function load() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function save(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function loadInvites() {
  return JSON.parse(fs.readFileSync(INVITES_FILE, 'utf8'));
}

function saveInvites(invites) {
  fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2));
}

function idForEmail(email) {
  return 'u_' + crypto.createHash('md5').update(email.toLowerCase()).digest('hex').slice(0, 10);
}

// ---------- auth ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

// First login creates the account; wrong password on an existing account fails.
// Returns { user, created } or { error }.
function loginOrRegister(email, password) {
  const users = load();
  const key = email.toLowerCase();
  let user = users.find((u) => u.email.toLowerCase() === key);
  if (user && user.password_hash) {
    if (!checkPassword(password, user.password_hash)) return { error: 'wrong_password' };
  } else if (user) {
    // pre-existing record with no password (e.g. legacy) - claim it
    user.password_hash = hashPassword(password);
  } else {
    user = {
      id: idForEmail(email),
      name: email.split('@')[0],
      email,
      password_hash: hashPassword(password),
      lat: null,
      lng: null,
      photo: null,
      seed: false,
      ingredients: [],
      uncertain: [],
      updated_at: new Date().toISOString(),
    };
    users.push(user);
  }
  const created = !user.token && !user.lat && !user.ingredients.length;
  user.token = crypto.randomBytes(24).toString('hex');
  save(users);
  return { user, created };
}

function getUserByToken(token) {
  if (!token) return null;
  return load().find((u) => u.token === token) || null;
}

// ---------- profile / inventory ----------

function setLocation(userId, lat, lng) {
  const users = load();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  user.lat = lat;
  user.lng = lng;
  user.updated_at = new Date().toISOString();
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

function setInventory(userId, ingredients, photoUrl) {
  const users = load();
  const user = users.find((u) => u.id === userId);
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

// ---------- matching ----------

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
        u.id !== me.id &&
        Number.isFinite(u.lat) &&
        Array.isArray(u.ingredients) &&
        u.ingredients.length > 0
    )
    .map((u) => ({ ...u, distance_m: haversineM(me.lat, me.lng, u.lat, u.lng) }))
    .filter((u) => u.distance_m <= radiusKm * 1000)
    .sort((a, b) => a.distance_m - b.distance_m)
    .slice(0, limit);
}

// ---------- invites ----------

function hasPendingInvite(fromId, toId) {
  return loadInvites().some(
    (i) => i.from_id === fromId && i.to_id === toId && i.status === 'pending'
  );
}

function createInvite({ fromId, toId, dishes, subject, body, emailed }) {
  const invites = loadInvites();
  const invite = {
    id: 'inv_' + crypto.randomBytes(8).toString('hex'),
    from_id: fromId,
    to_id: toId,
    dishes,
    subject,
    body,
    emailed: !!emailed,
    status: 'pending',
    created_at: new Date().toISOString(),
    responded_at: null,
  };
  invites.push(invite);
  saveInvites(invites);
  return invite;
}

function getInvite(id) {
  return loadInvites().find((i) => i.id === id) || null;
}

function respondInvite(id, accept) {
  const invites = loadInvites();
  const invite = invites.find((i) => i.id === id);
  if (!invite || invite.status !== 'pending') return null;
  invite.status = accept ? 'accepted' : 'declined';
  invite.responded_at = new Date().toISOString();
  saveInvites(invites);
  return invite;
}

function invitesFor(userId) {
  const invites = loadInvites();
  return {
    received: invites.filter((i) => i.to_id === userId),
    sent: invites.filter((i) => i.from_id === userId),
  };
}

// Pending invites sent to seed users, ready for demo auto-accept.
function pendingSeedInvites(olderThanMs) {
  const users = load();
  const seedIds = new Set(users.filter((u) => u.seed).map((u) => u.id));
  const cutoff = Date.now() - olderThanMs;
  return loadInvites().filter(
    (i) =>
      i.status === 'pending' &&
      seedIds.has(i.to_id) &&
      new Date(i.created_at).getTime() <= cutoff
  );
}

module.exports = {
  init,
  loginOrRegister,
  getUserByToken,
  setLocation,
  savePhoto,
  setInventory,
  getUser,
  getUserById,
  nearby,
  hasPendingInvite,
  createInvite,
  getInvite,
  respondInvite,
  invitesFor,
  pendingSeedInvites,
  UPLOADS_DIR,
};
