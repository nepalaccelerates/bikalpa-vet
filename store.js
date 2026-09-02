const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const isVercel = !!process.env.VERCEL;
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'db.json');
const SEED_PATH = path.join(__dirname, 'data', 'seed.json');
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(STORE_PATH)) {
    if (fs.existsSync(SEED_PATH)) {
      cache = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    } else {
      cache = { services: [], pharmacy: [], petshop: [], blogs: [], admins: [], _seq: { services: 0, pharmacy: 0, petshop: 0, blogs: 0, admins: 0 } };
    }
    if (!cache.admins || cache.admins.length === 0) {
      cache.admins = [{ id: 1, username: 'admin', password: bcrypt.hashSync('admin123', 10) }];
      cache._seq.admins = 1;
    }
    persist();
  } else {
    cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  }
  return cache;
}

function persist() {
  fs.writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2));
}

function nextId(collection) {
  cache._seq[collection] = (cache._seq[collection] || 0) + 1;
  return cache._seq[collection];
}

function all(collection) {
  load();
  return [...(cache[collection] || [])].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );
}

function find(collection, id) {
  load();
  return (cache[collection] || []).find(r => r.id === Number(id));
}

function insert(collection, data) {
  load();
  const row = { id: nextId(collection), created_at: new Date().toISOString(), ...data };
  cache[collection] = cache[collection] || [];
  cache[collection].push(row);
  persist();
  return row;
}

function update(collection, id, data) {
  load();
  const list = cache[collection] || [];
  const idx = list.findIndex(r => r.id === Number(id));
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...data };
  persist();
  return list[idx];
}

function remove(collection, id) {
  load();
  const list = cache[collection] || [];
  const idx = list.findIndex(r => r.id === Number(id));
  if (idx === -1) return false;
  const [removed] = list.splice(idx, 1);
  persist();
  return removed;
}

function findAdmin(username) {
  load();
  return (cache.admins || []).find(a => a.username === username);
}

module.exports = {
  load, all, find, insert, update, remove, findAdmin,
  UPLOADS_DIR, isVercel
};
