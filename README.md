# SaveMyFridge

**Your fridge is missing one ingredient. A neighbour's fridge has it.**

SaveMyFridge matches your fridge with a neighbour's: scan your fridge with your camera, AI reads the ingredients, finds nearby fridges whose contents *combine* with yours into real dishes, and sends an anonymous AI-written invite to cook together - before the food goes to waste.

Built for **SYNCS HACK 2026** - theme: *Blocks that make up the world*. Ingredients are blocks: alone they sit and expire, combined they become a meal and a new connection between neighbours.

## How it works

1. **Step 1 - Who & where**: enter your email (never shown to anyone) and drop a pin on the map.
2. **Step 2 - Scan**: point your camera at your open fridge. A live indicator turns green ("Fridge detected") only when AI confirms the camera is actually aimed at a fridge interior - only then does the shutter unlock. After the shot, AI extracts every visible ingredient; you confirm/edit the list.
3. **Step 3 - Match**: nearby fridges appear on the map. AI proposes real dishes that use ingredients from *both* fridges, with a match score (rubric-anchored, reproducible) and what each side brings. Pick dishes and send an anonymous invite - the email is AI-written and relayed by the platform, so no one's address is exposed until both sides agree.

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
server.js            Express app + API routes
lib/gemini.js        Gemini calls + demo-mode fallbacks
lib/store.js         JSON user store, geo search
lib/mailer.js        anonymous email relay
prompts/             all LLM prompts (the real "source code" of the AI)
public/              3-page frontend (index -> scan -> matches)
public/seed-fridges/ seed users' fridge photos
data/users.seed.json seed users (real recognition results)
scripts/extract-seeds.js  re-extract seed inventories via API
```

## Credits / third-party

- [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/) tiles
- [Google Gemini API](https://ai.google.dev/)
- [Express](https://expressjs.com/), [Nodemailer](https://nodemailer.com/), [dotenv](https://github.com/motdotla/dotenv)
- Seed fridge photos: public posts on Xiaohongshu (小红书), used for demo purposes only (original poster IDs visible in watermarks)

## Team

- (add each member's role/contribution here before submission)
