# FridgeTinder

**It's a match! Your fridge and a neighbour's fridge just swiped right on each other.**

FridgeTinder is Tinder for fridges: scan your fridge with your camera, AI reads the ingredients, finds nearby fridges whose contents *combine* with yours into real dishes, and sends an anonymous AI-written invite to cook together - before the food goes to waste.

Built for **SYNCS HACK 2026** - theme: *Blocks that make up the world*. Ingredients are blocks: alone they sit and expire, combined across two fridges they become a meal and a new connection between neighbours.

## How it works

1. **Log in** (Tinder-style: email + password; first login creates your account) - you join the match pool.
2. **Profile tab**: point your camera at your open fridge. A live indicator turns green ("Fridge detected") only when AI confirms the camera is actually aimed at a fridge interior - only then does the shutter unlock. After the shot, AI extracts every visible ingredient; you confirm/edit the list. Drop a pin for your location. Both are required to unlock matching.
3. **Explore tab**: nearby fridges appear on the map. AI proposes real dishes that use ingredients from *both* fridges, with a match score (rubric-anchored, reproducible) and what each side brings. Pick dishes and send an anonymous invite - the email is AI-written and relayed by the platform.
4. **Swipe tab** (under construction): browse matched fridges as a swipe deck; right swipe = send the invite.
5. **Invites**: recipients see the invite in their Profile inbox (real users also get the email). When they hit **Accept**, and only then, both sides see each other's contact - emails stay private until mutual consent. Demo seed users auto-accept after ~25 s so the full loop can be shown live.

## Tech

- **Frontend**: vanilla JS + Leaflet (OpenStreetMap), no build step. Live camera via `getUserMedia`.
- **Backend**: Node.js + Express, JSON file storage.
- **AI**: Google Gemini multimodal - fridge-interior gate (`prompts/detect.txt`), ingredient extraction with uncertainty separation (`prompts/extract.txt`), cross-fridge dish matching with a strict scoring rubric (`prompts/match.txt`), invite writing (`prompts/email.txt`). Temperature 0 for reproducible results. No model training required.
- **Email**: Nodemailer relay (optional; previews shown in-app when SMTP is not configured).

## Quick start

```bash
npm install
copy .env.example .env    # then put your GEMINI_API_KEY inside
npm start                 # http://localhost:3000
```

- Get a free Gemini key (no credit card): https://aistudio.google.com/apikey
- **No key? It still runs** in demo mode with canned detection/extraction and a rule-based matcher, so the full flow is clickable.
- Camera requires `localhost` or HTTPS. On a phone, use a tunnel (e.g. `npx localtunnel --port 3000`) or use the "Upload a photo instead" fallback.

### 中文快速开始

```bash
npm install
copy .env.example .env    # 在 .env 里填入 GEMINI_API_KEY
npm start                 # 打开 http://localhost:3000
```

不填 key 也能跑(演示模式,识别与匹配用内置假结果);填了 key 后识别、匹配、写信全部真实调用 Gemini。

## Seed data

`data/users.seed.json` contains 11 fictional neighbours spread around **Camperdown, Sydney**. Their fridge photos are in `public/seed-fridges/`, and their ingredient lists were produced by **real vision-model recognition of those exact photos** (conservative: uncertain items are listed separately, nothing invented). To re-run the extraction with your own API key:

```bash
npm run seed
```

## Project structure

```
server.js            Express app + API routes (auth, invites, matching)
lib/gemini.js        Gemini calls + demo-mode fallbacks
lib/store.js         JSON user store, auth, invites, geo search
lib/mailer.js        anonymous email relay
prompts/             all LLM prompts (the real "source code" of the AI)
public/index.html    login page (email + password)
public/app.html      main app: Swipe / Explore / Profile tabs
public/js/app.js     app shell + FTApp interface (swipe deck plugs in here)
public/js/explore.js map of matched fridges + invite modal
public/js/profile.js fridge scan, location, invite inbox/outbox
public/seed-fridges/ seed users' fridge photos
data/users.seed.json seed users (real recognition results)
scripts/             seed extraction + E2E test scripts
```

## Credits / third-party

- [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) tiles
- [Google Gemini API](https://ai.google.dev/)
- [Express](https://expressjs.com/), [Nodemailer](https://nodemailer.com/), [dotenv](https://github.com/motdotla/dotenv)
- Seed fridge photos: public posts on Xiaohongshu (小红书), used for demo purposes only (original poster IDs visible in watermarks)

## Team

- Yang Chong - Designer, programmer
- Ruihan Zhao - Designer, UI programmer
- Cursor Agent - The Workhorse
