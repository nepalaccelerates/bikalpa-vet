const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Storage drivers:
//  - Vercel Blob when BLOB_READ_WRITE_TOKEN is set (permanent, survives deploys)
//  - local JSON file + disk uploads otherwise (development)
const isVercel = !!process.env.VERCEL;
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const blob = useBlob ? require('@vercel/blob') : null;

const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'db.json');
const SEED_PATH = path.join(__dirname, 'data', 'seed.json');
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : path.join(__dirname, 'public', 'uploads');

// Blob stores serve objects publicly by URL, so the database lives at a
// pathname derived from the store token — unguessable without it.
const DB_BLOB_PATH = useBlob
  ? 'db/' + crypto.createHash('sha256').update(process.env.BLOB_READ_WRITE_TOKEN).digest('hex').slice(0, 40) + '.json'
  : null;
const CACHE_TTL = 15 * 1000;

const DEFAULT_SETTINGS = {
  site_title: 'Bikalpa Veterinary Clinic · Kathmandu',
  site_description: 'Walk-in vet clinic, pharmacy and pet shop in Kathmandu. Checkups, surgery, medicines and food for dogs and cats. No appointment needed.',
  logo: '/logo.jpg',
  clinic_name: 'Bikalpa',
  clinic_subtitle: 'Veterinary · Pharmacy · Pet Shop',
  hero_heading: 'Bring your pet in.',
  hero_accent: "We'll handle the rest.",
  hero_text: "No appointment needed. Come in for a checkup, an operation, medicines or a bag of food. If it's urgent, ring first so we're ready when you arrive.",
  hero_badge: 'Walk-ins welcome',
  hero_card_title: 'No appointment needed',
  hero_card_text: 'Walk in or call. We are here.',
  hero_image: '/images/doctor.jpg',
  stat1_value: '5,000+', stat1_label: 'Patients seen',
  stat2_value: '24 / 7', stat2_label: 'On-call vet',
  stat3_value: '< 1 hr', stat3_label: 'Lab results',
  trust_items: 'Licensed vets\nSurgery done on-site\nLab results within the hour\nISO microchips\nOpen day and night for emergencies',
  doctor_heading: 'Meet Dr. Bikash.',
  doctor_name: 'Dr. Bikash Bohara',
  doctor_title: 'Lead Veterinarian',
  doctor_bio: "Dr. Bikash Bohara has treated more than five thousand dogs and cats in Kathmandu. He'll tell you what's wrong in plain words, what it costs before he starts, and when the cheaper option will do.",
  doctor_image: '/images/doctor.jpg',
  phone_primary: '+977 9848 662 261',
  phone_primary_name: 'Dr. Bikash · 24/7',
  phone_backup: '+977 9764 379 786',
  phone_backup_name: 'Prabina Karki · Vet Technician',
  email: 'bikalpavetclinic@gmail.com',
  whatsapp_number: '+977 9848 662 261',
  whatsapp_greeting: "Namaste! What's going on with your pet?",
  whatsapp_message: 'Hi, I have a question about my pet.',
  address_line1: 'Bikalpa Veterinary Clinic & Animal Feed Supplement Center',
  address_line2: 'Kathmandu, Nepal',
  hours_main: 'Sunday – Friday · 9:00 – 19:00',
  hours_note: 'Emergencies 24/7',
  maps_query: 'Bikalpa veterinary clinic & Animal feed supplement Center',
  footer_blurb: "A small clinic in Kathmandu with its own pharmacy and pet shop. Bring your dog or cat in, or call first if you're not sure.",
  footer_credit_text: 'N/ACC',
  footer_credit_url: 'https://nepalaccelerates.com'
};

if (!useBlob) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (isVercel) {
    console.warn('BLOB_READ_WRITE_TOKEN is not set — content changes will NOT survive redeploys. Create a Blob store under Vercel → Storage and connect it to this project.');
  }
}

let cache = null;
let lastFetch = 0;

function readSeed() {
  if (fs.existsSync(SEED_PATH)) return JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  return { services: [], pharmacy: [], petshop: [], blogs: [], admins: [], settings: {}, _seq: {} };
}

function ensureAdmin(db) {
  if (db.admins && db.admins.length) return false;
  db.admins = [{ id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 10) }];
  db._seq = db._seq || {};
  db._seq.admins = 1;
  return true;
}

async function persist() {
  if (useBlob) {
    await blob.put(DB_BLOB_PATH, JSON.stringify(cache, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60
    });
  } else {
    fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2));
  }
  lastFetch = Date.now();
}

async function load(force = false) {
  if (cache && !force && (!useBlob || Date.now() - lastFetch < CACHE_TTL)) return cache;
  if (useBlob) {
    const result = await blob.get(DB_BLOB_PATH, { access: 'public', useCache: false });
    if (result && result.statusCode === 200) {
      cache = JSON.parse(await new Response(result.stream).text());
      lastFetch = Date.now();
      if (ensureAdmin(cache)) await persist();
      return cache;
    }
  } else if (fs.existsSync(STORE_PATH)) {
    cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    lastFetch = Date.now();
    if (ensureAdmin(cache)) await persist();
    return cache;
  }
  cache = readSeed();
  ensureAdmin(cache);
  await persist();
  return cache;
}

function nextId(collection) {
  cache._seq = cache._seq || {};
  cache._seq[collection] = (cache._seq[collection] || 0) + 1;
  return cache._seq[collection];
}

async function all(collection) {
  await load();
  return [...(cache[collection] || [])].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );
}

async function find(collection, id) {
  await load();
  return (cache[collection] || []).find(r => r.id === Number(id));
}

async function insert(collection, data) {
  await load(true);
  const row = { id: nextId(collection), created_at: new Date().toISOString(), ...data };
  cache[collection] = cache[collection] || [];
  cache[collection].push(row);
  await persist();
  return row;
}

async function update(collection, id, data) {
  await load(true);
  const list = cache[collection] || [];
  const idx = list.findIndex(r => r.id === Number(id));
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...data };
  await persist();
  return list[idx];
}

async function remove(collection, id) {
  await load(true);
  const list = cache[collection] || [];
  const idx = list.findIndex(r => r.id === Number(id));
  if (idx === -1) return false;
  const [removed] = list.splice(idx, 1);
  await persist();
  return removed;
}

async function getSettings() {
  await load();
  return { ...DEFAULT_SETTINGS, ...(cache.settings || {}) };
}

async function updateSettings(patch) {
  await load(true);
  cache.settings = { ...(cache.settings || {}), ...patch };
  await persist();
  return getSettings();
}

async function findAdmin(username) {
  await load(true);
  return (cache.admins || []).find(a => a.username === username);
}

async function updateAdminPassword(id, passwordHash) {
  await load(true);
  const admin = (cache.admins || []).find(a => a.id === Number(id));
  if (!admin) return false;
  admin.password = passwordHash;
  await persist();
  return true;
}

async function dump() {
  return load(true);
}

function uploadName(originalname) {
  const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
  return unique + path.extname(originalname).toLowerCase();
}

async function saveUpload(file) {
  const name = uploadName(file.originalname);
  if (useBlob) {
    const result = await blob.put('uploads/' + name, file.buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: file.mimetype
    });
    return result.url;
  }
  fs.writeFileSync(path.join(UPLOADS_DIR, name), file.buffer);
  return '/uploads/' + name;
}

async function deleteUpload(src) {
  if (!src) return;
  if (useBlob && src.includes('blob.vercel-storage.com')) {
    try { await blob.del(src); } catch {}
    return;
  }
  if (src.startsWith('/uploads/')) {
    const p = path.join(UPLOADS_DIR, path.basename(src));
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
  }
}

module.exports = {
  all, find, insert, update, remove,
  getSettings, updateSettings,
  findAdmin, updateAdminPassword, dump,
  saveUpload, deleteUpload,
  UPLOADS_DIR, isVercel
};
