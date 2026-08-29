// Re-extract seed users' inventories by running real image recognition
// over public/seed-fridges/*.jpg. Requires GEMINI_API_KEY in .env.
// Usage: npm run seed
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const gemini = require('../lib/gemini');

const SEED_FILE = path.join(__dirname, '..', 'data', 'users.seed.json');
const IMG_DIR = path.join(__dirname, '..', 'public', 'seed-fridges');

async function main() {
  if (gemini.isMock()) {
    console.error('GEMINI_API_KEY not set - cannot run real extraction.');
    process.exit(1);
  }
  const users = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  for (const user of users) {
    const file = path.join(IMG_DIR, path.basename(user.photo));
    const b64 = fs.readFileSync(file).toString('base64');
    const dataUrl = 'data:image/jpeg;base64,' + b64;
    process.stdout.write(`Extracting ${user.name} (${path.basename(file)})... `);
    try {
      const r = await gemini.analyzeFridge(dataUrl);
      if (!r.is_fridge_interior) {
        console.log('SKIPPED (not detected as fridge)');
        continue;
      }
      user.ingredients = r.ingredients || [];
      user.uncertain = r.uncertain || [];
      user.updated_at = new Date().toISOString();
      console.log(`${user.ingredients.length} ingredients, ${user.uncertain.length} uncertain`);
    } catch (e) {
      console.log('FAILED: ' + e.message);
    }
  }
  fs.writeFileSync(SEED_FILE, JSON.stringify(users, null, 2));
  const runtime = path.join(__dirname, '..', 'data', 'users.json');
  if (fs.existsSync(runtime)) fs.unlinkSync(runtime);
  console.log('Seed file updated. Runtime users.json reset - restart the server.');
}

main();
