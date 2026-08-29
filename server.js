require('dotenv').config();
const path = require('path');
const express = require('express');
const store = require('./lib/store');
const gemini = require('./lib/gemini');
const mailer = require('./lib/mailer');

store.init();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(store.UPLOADS_DIR));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mock: gemini.isMock(), email_configured: mailer.configured() });
});

// ---------- auth ----------

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ error: 'valid email required' });
  if (!password || String(password).length < 4)
    return res.status(400).json({ error: 'password must be at least 4 characters' });
  const result = store.loginOrRegister(email, String(password));
  if (result.error === 'wrong_password')
    return res.status(401).json({ error: 'Wrong password' });
  res.json({ token: result.user.token, created: result.created });
});

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = store.getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'not logged in' });
  req.user = user;
  next();
}

function profileComplete(u) {
  return Number.isFinite(u.lat) && Number.isFinite(u.lng) && (u.ingredients || []).length > 0;
}

// ---------- me: profile + invite inbox/outbox ----------

app.get('/api/me', auth, (req, res) => {
  const me = req.user;
  const { received, sent } = store.invitesFor(me.id);

  const shapeInvite = (i, other, direction) => ({
    id: i.id,
    direction,
    status: i.status,
    dishes: i.dishes,
    subject: i.subject,
    body: i.body,
    created_at: i.created_at,
    other: other
      ? {
          name: i.status === 'accepted' ? other.name : 'A neighbour',
          photo: other.photo,
          // emails stay hidden until both sides agree (accept)
          email: i.status === 'accepted' ? other.email : null,
        }
      : { name: 'Unknown', photo: null, email: null },
  });

  res.json({
    user: {
      id: me.id,
      name: me.name,
      email: me.email,
      lat: me.lat,
      lng: me.lng,
      photo: me.photo,
      ingredients: me.ingredients || [],
    },
    profile_complete: profileComplete(me),
    invites_received: received
      .map((i) => shapeInvite(i, store.getUserById(i.from_id), 'received'))
      .reverse(),
    invites_sent: sent
      .map((i) => shapeInvite(i, store.getUserById(i.to_id), 'sent'))
      .reverse(),
  });
});

// ---------- profile setup ----------

app.post('/api/profile', auth, (req, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number')
    return res.status(400).json({ error: 'location required' });
  store.setLocation(req.user.id, lat, lng);
  res.json({ ok: true });
});

app.post('/api/inventory', auth, (req, res) => {
  const { ingredients, image } = req.body || {};
  if (!Array.isArray(ingredients) || !ingredients.length)
    return res.status(400).json({ error: 'ingredients required' });
  const photoUrl = image ? store.savePhoto(req.user.id, image) : null;
  store.setInventory(req.user.id, ingredients, photoUrl);
  res.json({ ok: true });
});

// ---------- AI vision ----------

app.post('/api/detect', auth, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    res.json(await gemini.detectFridge(image));
  } catch (e) {
    console.error('detect:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/analyze', auth, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    res.json(await gemini.analyzeFridge(image));
  } catch (e) {
    console.error('analyze:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------- matching (shared by swipe deck and explore map) ----------

app.get('/api/matches', auth, async (req, res) => {
  try {
    const me = req.user;
    if (!profileComplete(me))
      return res.status(400).json({ error: 'complete your profile first' });

    const radiusKm = Number(process.env.RADIUS_KM || 5);
    const candidates = store.nearby(me, radiusKm, 10);
    if (!candidates.length)
      return res.json({ me: { lat: me.lat, lng: me.lng }, matches: [], almost: null });

    const result = await gemini.matchFridges(me, candidates);
    const byId = Object.fromEntries(candidates.map((c) => [c.id, c]));

    const enriched = (result.matches || [])
      .filter((m) => byId[m.id])
      .map((m) => {
        const c = byId[m.id];
        return {
          id: c.id,
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          photo: c.photo,
          distance_m: c.distance_m,
          ingredients: c.ingredients.map((i) => i.name),
          score: Math.max(0, Math.min(100, Math.round(m.score || 0))),
          dishes: (m.dishes || []).slice(0, 3),
          invite_pending: store.hasPendingInvite(me.id, c.id),
        };
      })
      .sort((a, b) => b.score - a.score);

    const matches = enriched.filter((m) => m.score >= 50 && m.dishes.length);
    const almost = !matches.length && enriched.length ? enriched[0] : null;
    res.json({ me: { lat: me.lat, lng: me.lng }, matches, almost });
  } catch (e) {
    console.error('matches:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------- invites ----------

app.post('/api/invite', auth, async (req, res) => {
  try {
    const { toId, dishes } = req.body || {};
    const from = req.user;
    const to = store.getUserById(toId || '');
    if (!to) return res.status(400).json({ error: 'user not found' });
    if (to.id === from.id) return res.status(400).json({ error: 'cannot invite yourself' });
    if (!Array.isArray(dishes) || !dishes.length)
      return res.status(400).json({ error: 'select at least one dish' });
    if (store.hasPendingInvite(from.id, to.id))
      return res.status(400).json({ error: 'You already have a pending invite to this neighbour.' });

    const email = await gemini.composeInvite(from, to, dishes);

    // Real users get a real email (when SMTP configured); seed users only get
    // the in-app invite - their .example addresses are undeliverable.
    let emailed = false;
    if (!to.seed && mailer.configured()) {
      const delivery = await mailer.send(to.email, email.subject, email.body);
      emailed = delivery.sent;
    }

    const invite = store.createInvite({
      fromId: from.id,
      toId: to.id,
      dishes,
      subject: email.subject,
      body: email.body,
      emailed,
    });

    res.json({
      ok: true,
      invite_id: invite.id,
      emailed,
      note: emailed
        ? 'Invite emailed anonymously and added to their FridgeTinder inbox.'
        : 'Invite delivered to their FridgeTinder inbox.' +
          (mailer.configured() ? '' : ' (SMTP not configured - email preview only.)'),
      preview: { subject: email.subject, body: email.body },
    });
  } catch (e) {
    console.error('invite:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/invite/:id/respond', auth, async (req, res) => {
  try {
    const invite = store.getInvite(req.params.id);
    if (!invite) return res.status(404).json({ error: 'invite not found' });
    if (invite.to_id !== req.user.id)
      return res.status(403).json({ error: 'this invite is not addressed to you' });
    if (invite.status !== 'pending')
      return res.status(400).json({ error: 'invite already ' + invite.status });

    const accept = !!(req.body || {}).accept;
    store.respondInvite(invite.id, accept);
    const from = store.getUserById(invite.from_id);

    if (accept) {
      // Mutual consent reached - both sides may now see each other's contact.
      if (from && !from.seed && mailer.configured()) {
        const dishNames = invite.dishes.map((d) => d.name).join(', ');
        await mailer.send(
          from.email,
          `It's on! ${req.user.name} accepted your cooking invite`,
          `Good news - your FridgeTinder invite was accepted!\n\n` +
            `${req.user.name} is keen to cook with you: ${dishNames}.\n` +
            `You can reach them at: ${req.user.email}\n\n` +
            `Happy cooking,\nFridgeTinder`
        );
      }
      return res.json({
        ok: true,
        status: 'accepted',
        contact: from ? { name: from.name, email: from.email } : null,
      });
    }
    res.json({ ok: true, status: 'declined' });
  } catch (e) {
    console.error('respond:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------- demo: seed users auto-accept after a short delay ----------

const SEED_ACCEPT_DELAY_MS = 25 * 1000;
setInterval(() => {
  try {
    for (const invite of store.pendingSeedInvites(SEED_ACCEPT_DELAY_MS)) {
      store.respondInvite(invite.id, true);
      const to = store.getUserById(invite.to_id);
      console.log(`demo: ${to ? to.name : invite.to_id} auto-accepted invite ${invite.id}`);
    }
  } catch (e) {
    console.error('auto-accept sweep:', e.message);
  }
}, 5000);

app.listen(PORT, () => {
  console.log(`FridgeTinder running on http://localhost:${PORT}`);
  if (gemini.isMock())
    console.log('DEMO MODE: no GEMINI_API_KEY set - detection/extraction/matching use canned results.');
  if (!mailer.configured())
    console.log('EMAIL PREVIEW MODE: no SMTP configured - invites are previewed, not sent.');
});
