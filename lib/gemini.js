const fs = require('fs');
const path = require('path');

const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DETECT_MODEL = process.env.GEMINI_DETECT_MODEL || 'gemini-2.5-flash-lite';

const isMock = () => !KEY;

function prompt(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'prompts', name), 'utf8');
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('invalid image data URL');
  return { mime: m[1], data: m[2] };
}

async function call(model, parts, temperature = 0) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return JSON.parse(text);
}

// ---------- fridge detection (live camera gate) ----------

async function detectFridge(imageDataUrl) {
  if (isMock()) {
    await new Promise((r) => setTimeout(r, 400));
    return { fridge: true, box_2d: [80, 60, 940, 940], mock: true };
  }
  const img = parseDataUrl(imageDataUrl);
  const out = await call(DETECT_MODEL, [
    { text: prompt('detect.txt') },
    { inline_data: { mime_type: img.mime, data: img.data } },
  ]);
  return { fridge: !!out.fridge, box_2d: out.box_2d || null };
}

// ---------- ingredient extraction ----------

const MOCK_INVENTORY = {
  is_fridge_interior: true,
  ingredients: [
    { name: 'eggs', quantity: '6', category: 'egg', freshness: 'fresh' },
    { name: 'fresh milk', quantity: '1 bottle', category: 'dairy', freshness: 'fresh' },
    { name: 'bacon', quantity: '1 pack', category: 'meat', freshness: 'use_soon' },
    { name: 'cheddar cheese', quantity: '1 block', category: 'dairy', freshness: 'fresh' },
    { name: 'tomatoes', quantity: '3', category: 'vegetable', freshness: 'fresh' },
    { name: 'spring onions', quantity: '1 bunch', category: 'vegetable', freshness: 'use_soon' },
    { name: 'butter', quantity: '1 tub', category: 'dairy', freshness: 'unknown' },
  ],
  uncertain: [{ name: 'leftover pasta', reason: 'opaque container, contents unclear' }],
  mock: true,
};

async function analyzeFridge(imageDataUrl) {
  if (isMock()) {
    await new Promise((r) => setTimeout(r, 1200));
    return MOCK_INVENTORY;
  }
  const img = parseDataUrl(imageDataUrl);
  return call(MODEL, [
    { text: prompt('extract.txt') },
    { inline_data: { mime_type: img.mime, data: img.data } },
  ]);
}

// ---------- fridge-to-fridge matching ----------

const MOCK_RECIPES = [
  { name: 'Tomato & Egg Stir-fry', needs: [['egg'], ['tomato']] },
  { name: 'Prawn Fried Rice', needs: [['prawn', 'shrimp'], ['egg']] },
  { name: 'Chicken Salad Bowl', needs: [['chicken'], ['lettuce', 'cucumber', 'celery']] },
  { name: 'Berry Yogurt Parfait', needs: [['yogurt', 'yoghurt'], ['blueberr', 'strawberr', 'raspberr']] },
  { name: 'Veggie Omelette', needs: [['egg'], ['broccoli', 'spinach', 'mushroom', 'capsicum', 'pepper', 'onion']] },
  { name: 'Pork & Kimchi Stir-fry', needs: [['pork'], ['kimchi']] },
  { name: 'Cheese & Fruit Board', needs: [['cheese'], ['grape', 'apple', 'pear']] },
  { name: 'Egg & Noodle Stir-fry', needs: [['noodle'], ['egg', 'chicken', 'prawn', 'pork', 'sausage']] },
  { name: 'Garden Salad', needs: [['lettuce'], ['tomato', 'cucumber', 'capsicum', 'corn']] },
  { name: 'Bacon & Egg Burgers', needs: [['bacon', 'sausage', 'patt'], ['bun', 'bread', 'roll']] },
];

function mockMatch(me, candidates) {
  const mine = me.ingredients.map((i) => i.name.toLowerCase());
  const matches = candidates.map((c) => {
    const theirs = c.ingredients.map((i) => i.name.toLowerCase());
    const dishes = [];
    for (const r of MOCK_RECIPES) {
      const side = { yours: [], theirs: [] };
      let ok = true;
      for (const group of r.needs) {
        const my = mine.find((n) => group.some((g) => n.includes(g)));
        const th = theirs.find((n) => group.some((g) => n.includes(g)));
        if (my) side.yours.push(my);
        else if (th) side.theirs.push(th);
        else { ok = false; break; }
      }
      if (ok && side.yours.length && side.theirs.length) {
        dishes.push({ name: r.name, uses_yours: side.yours, uses_theirs: side.theirs, missing: [] });
      }
      if (dishes.length >= 3) break;
    }
    const score = dishes.length ? Math.min(95, 62 + dishes.length * 11) : 25;
    return { id: c.id, score, dishes };
  });
  return { matches, mock: true };
}

async function matchFridges(me, candidates) {
  if (isMock()) return mockMatch(me, candidates);
  const input = {
    me: { ingredients: me.ingredients },
    candidates: candidates.map((c) => ({ id: c.id, ingredients: c.ingredients })),
  };
  return call(MODEL, [{ text: prompt('match.txt') + '\n\nINPUT:\n' + JSON.stringify(input) }]);
}

// ---------- invitation email ----------

async function composeInvite(fromUser, toUser, dishes) {
  if (isMock()) {
    const dishNames = dishes.map((d) => d.name).join(', ');
    return {
      subject: `It's a match! A neighbour wants to cook ${dishes[0]?.name || 'something'} with you`,
      body:
        `Hi ${toUser.name},\n\n` +
        `A neighbour on FridgeTinder (about ${Math.max(1, Math.round((toUser.distance_m || 500) / 100) / 10)} km away) scanned their fridge, ` +
        `and it turns out your ingredients combine perfectly.\n\n` +
        `Together you could make: ${dishNames}.\n\n` +
        `They would love to team up and share a meal before anything goes to waste. ` +
        `Reply through FridgeTinder to accept - neither of you sees the other's email until you both agree.\n\n` +
        `Happy cooking,\nFridgeTinder (demo mode)`,
      mock: true,
    };
  }
  const input = {
    to_name: toUser.name,
    dishes: dishes.map((d) => ({
      name: d.name,
      sender_brings: d.uses_yours,
      recipient_brings: d.uses_theirs,
      missing: d.missing || [],
    })),
  };
  return call(MODEL, [{ text: prompt('email.txt') + '\n\nINPUT:\n' + JSON.stringify(input) }], 0.4);
}

module.exports = { isMock, detectFridge, analyzeFridge, matchFridges, composeInvite };
