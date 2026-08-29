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

// Live camera gate: is the camera pointed at a fridge interior?
app.post('/api/detect', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    res.json(await gemini.detectFridge(image));
  } catch (e) {
    console.error('detect:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Full ingredient extraction from a captured photo
app.post('/api/analyze', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    res.json(await gemini.analyzeFridge(image));
  } catch (e) {
    console.error('analyze:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Page 1: register email + location
app.post('/api/profile', (req, res) => {
  const { email, lat, lng } = req.body;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ error: 'valid email required' });
  if (typeof lat !== 'number' || typeof lng !== 'number')
    return res.status(400).json({ error: 'location required' });
  const user = store.upsertProfile({ email, lat, lng });
  res.json({ ok: true, id: user.id });
});

// Save confirmed inventory + fridge photo
app.post('/api/inventory', (req, res) => {
  const { email, ingredients, image } = req.body;
  const user = store.getUser(email);
  if (!user) return res.status(400).json({ error: 'unknown user, register first' });
  if (!Array.isArray(ingredients) || !ingredients.length)
    return res.status(400).json({ error: 'ingredients required' });
  const photoUrl = image ? store.savePhoto(user.id, image) : null;
  store.setInventory(email, ingredients, photoUrl);
  res.json({ ok: true });
});

// Page 3: find matching fridges nearby
app.get('/api/matches', async (req, res) => {
  try {
    const me = store.getUser(req.query.email || '');
    if (!me) return res.status(400).json({ error: 'unknown user' });
    if (!me.ingredients?.length) return res.status(400).json({ error: 'no inventory yet' });

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

// Send anonymous AI-written invitation (emails are never exposed to either side)
app.post('/api/invite', async (req, res) => {
  try {
    const { fromEmail, toId, dishes } = req.body;
    const from = store.getUser(fromEmail || '');
    const to = store.getUserById(toId || '');
    if (!from || !to) return res.status(400).json({ error: 'user not found' });
    if (!Array.isArray(dishes) || !dishes.length)
      return res.status(400).json({ error: 'select at least one dish' });

    const email = await gemini.composeInvite(from, to, dishes);
    const delivery = await mailer.send(to.email, email.subject, email.body);
    res.json({ sent: delivery.sent, note: delivery.note, preview: { subject: email.subject, body: email.body } });
  } catch (e) {
    console.error('invite:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`FridgeTinder running on http://localhost:${PORT}`);
  if (gemini.isMock())
    console.log('DEMO MODE: no GEMINI_API_KEY set - detection/extraction/matching use canned results.');
  if (!mailer.configured())
    console.log('EMAIL PREVIEW MODE: no SMTP configured - invites are previewed, not sent.');
});
