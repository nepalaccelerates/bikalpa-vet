const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PATH = process.env.ADMIN_PATH || '/portal-9k2x';
const VIEWS_DIR = path.join(__dirname, 'views');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/uploads', express.static(store.UPLOADS_DIR));

// --- Auth: stateless HMAC-signed cookie (survives serverless cold starts as
// long as SESSION_SECRET is set; falls back to a per-boot random secret).
const AUTH_COOKIE = 'bvc_auth';
const AUTH_TTL = 1000 * 60 * 60 * 8;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function issueToken(admin) {
  const payload = Buffer.from(JSON.stringify({
    id: admin.id, username: admin.username, exp: Date.now() + AUTH_TTL
  })).toString('base64url');
  return payload + '.' + sign(payload);
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, mac] = token.split('.');
  const expected = sign(payload);
  if (mac.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function getAdmin(req) {
  const cookies = req.headers.cookie || '';
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith(AUTH_COOKIE + '='));
  return match ? readToken(decodeURIComponent(match.slice(AUTH_COOKIE.length + 1))) : null;
}

function setAuthCookie(res, token) {
  const attrs = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${token ? Math.floor(AUTH_TTL / 1000) : 0}`
  ];
  if (store.isVercel) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function requireAuth(req, res, next) {
  const admin = getAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  req.admin = admin;
  next();
}

// --- Uploads (buffered in memory, persisted through the store driver)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Express 4 does not forward rejected promises to the error handler.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Content collections: public read, authenticated write
function makeResource(collection) {
  app.get(`/api/${collection}`, wrap(async (req, res) => {
    res.json(await store.all(collection));
  }));
  app.get(`/api/${collection}/:id`, wrap(async (req, res) => {
    const row = await store.find(collection, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));
  app.post(`/api/admin/${collection}`, requireAuth, upload.single('image'), wrap(async (req, res) => {
    const data = { ...req.body };
    if (req.file) data.image = await store.saveUpload(req.file);
    res.json(await store.insert(collection, data));
  }));
  app.put(`/api/admin/${collection}/:id`, requireAuth, upload.single('image'), wrap(async (req, res) => {
    const data = { ...req.body };
    if (req.file) data.image = await store.saveUpload(req.file);
    const row = await store.update(collection, req.params.id, data);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));
  app.delete(`/api/admin/${collection}/:id`, requireAuth, wrap(async (req, res) => {
    const row = await store.find(collection, req.params.id);
    if (row) await store.deleteUpload(row.image);
    await store.remove(collection, req.params.id);
    res.json({ success: true });
  }));
}
['services', 'pharmacy', 'petshop', 'blogs'].forEach(makeResource);

// --- Site settings
const SETTINGS_TEXT_KEYS = [
  'site_title', 'site_description', 'clinic_name', 'clinic_subtitle',
  'hero_heading', 'hero_accent', 'hero_text', 'hero_badge', 'hero_card_title', 'hero_card_text',
  'stat1_value', 'stat1_label', 'stat2_value', 'stat2_label', 'stat3_value', 'stat3_label',
  'trust_items',
  'doctor_heading', 'doctor_name', 'doctor_title', 'doctor_bio',
  'phone_primary', 'phone_primary_name', 'phone_backup', 'phone_backup_name',
  'email', 'whatsapp_number', 'whatsapp_greeting', 'whatsapp_message',
  'address_line1', 'address_line2', 'hours_main', 'hours_note', 'maps_query',
  'footer_blurb', 'footer_credit_text', 'footer_credit_url'
];
const SETTINGS_IMAGE_KEYS = ['logo', 'doctor_image', 'hero_image'];

app.get('/api/settings', wrap(async (req, res) => {
  res.json(await store.getSettings());
}));

app.put('/api/admin/settings', requireAuth,
  upload.fields(SETTINGS_IMAGE_KEYS.map(name => ({ name, maxCount: 1 }))),
  wrap(async (req, res) => {
    const current = await store.getSettings();
    const patch = {};
    for (const key of SETTINGS_TEXT_KEYS) {
      if (typeof req.body[key] === 'string') patch[key] = req.body[key].trim();
    }
    for (const key of SETTINGS_IMAGE_KEYS) {
      const file = req.files && req.files[key] && req.files[key][0];
      if (file) {
        await store.deleteUpload(current[key]);
        patch[key] = await store.saveUpload(file);
      } else if (req.body[key + '_clear'] === '1') {
        await store.deleteUpload(current[key]);
        patch[key] = key === 'logo' ? '/logo.jpg' : '';
      }
    }
    res.json(await store.updateSettings(patch));
  }));

// --- Admin session & account
app.post('/api/admin/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const user = await store.findAdmin(username);
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  setAuthCookie(res, issueToken(user));
  res.json({ success: true });
}));

app.post('/api/admin/logout', (req, res) => {
  setAuthCookie(res, '');
  res.json({ success: true });
});

app.get('/api/admin/me', (req, res) => {
  const admin = getAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ admin: { id: admin.id, username: admin.username } });
});

app.post('/api/admin/password', requireAuth, wrap(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const user = await store.findAdmin(req.admin.username);
  if (!user || !bcrypt.compareSync(current_password || '', user.password)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  await store.updateAdminPassword(user.id, bcrypt.hashSync(new_password, 10));
  res.json({ success: true });
}));

app.get('/api/admin/export', requireAuth, wrap(async (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="site-backup.json"');
  res.json(await store.dump());
}));

// --- Views: tiny token renderer. {{key}} is HTML-escaped, {{{key}}} is raw.
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(view, tokens) {
  let html = fs.readFileSync(path.join(VIEWS_DIR, view), 'utf8');
  html = html.replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => tokens[k] ?? '');
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => escapeHtml(tokens[k] ?? ''));
  return html;
}

function telHref(num) {
  return 'tel:' + String(num || '').replace(/[^+\d]/g, '');
}

function waHref(number, message) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  const text = message ? '?text=' + encodeURIComponent(message) : '';
  return `https://wa.me/${digits}${text}`;
}

function paragraphs(text) {
  return String(text || '').split(/\n\s*\n/).filter(Boolean)
    .map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
}

async function buildIndexTokens() {
  const s = await store.getSettings();

  const stats = [1, 2, 3]
    .map(n => ({ value: s[`stat${n}_value`], label: s[`stat${n}_label`] }))
    .filter(st => st.value)
    .map(st => `<div class="hero-meta-item"><strong>${escapeHtml(st.value)}</strong><span>${escapeHtml(st.label)}</span></div>`)
    .join('\n');

  const trust = String(s.trust_items || '').split('\n').map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="trust-item"><span data-icon="check"></span> ${escapeHtml(t)}</span>`)
    .join('\n');

  const heroVisual = s.hero_image
    ? `<img src="${escapeHtml(s.hero_image)}" alt="" class="hero-photo"/>`
    : '<canvas id="hero-canvas"></canvas>';

  const heroScripts = s.hero_image ? '' : [
    '<script type="importmap">',
    '{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }',
    '</script>',
    '<script type="module" src="/js/three-scene.js"></script>'
  ].join('\n');

  const backupRow = s.phone_backup ? `
    <div class="contact-row">
      <span class="lbl">Backup</span>
      <span class="val"><a href="${telHref(s.phone_backup)}">${escapeHtml(s.phone_backup)}</a><small>${escapeHtml(s.phone_backup_name)}</small></span>
    </div>` : '';

  const wa = waHref(s.whatsapp_number, s.whatsapp_message);
  const whatsapp = wa ? `
  <div class="wa-widget">
    <div class="wa-popup" id="wa-popup" hidden>
      <div class="wa-popup-head">
        <img src="${escapeHtml(s.logo)}" alt=""/>
        <div>
          <strong>${escapeHtml(s.clinic_name)}</strong>
          <span>Typically replies within minutes</span>
        </div>
        <button class="wa-popup-close" id="wa-close" aria-label="Close chat">&times;</button>
      </div>
      <div class="wa-popup-body"><p>${escapeHtml(s.whatsapp_greeting)}</p></div>
      <a class="wa-popup-btn" href="${wa}" target="_blank" rel="noopener">
        <span data-icon="whatsapp"></span> Chat on WhatsApp
      </a>
    </div>
    <button class="wa-fab" id="wa-fab" aria-label="Chat on WhatsApp"><span data-icon="whatsapp"></span></button>
  </div>` : '';

  const credit = s.footer_credit_text ? `
    <span class="crafted">Crafted by <a href="${escapeHtml(s.footer_credit_url || '#')}" target="_blank" rel="noopener">${escapeHtml(s.footer_credit_text)}</a></span>` : '';

  return {
    ...s,
    tel_primary: telHref(s.phone_primary),
    maps_src: 'https://www.google.com/maps?q=' + encodeURIComponent(s.maps_query || s.address_line1) + '&output=embed',
    doctor_bio_html: paragraphs(s.doctor_bio),
    stats_html: stats,
    trust_html: trust,
    hero_visual_html: heroVisual,
    hero_scripts_html: heroScripts,
    contact_backup_html: backupRow,
    whatsapp_html: whatsapp,
    credit_html: credit
  };
}

app.get('/', wrap(async (req, res) => {
  res.send(render('index.html', await buildIndexTokens()));
}));

app.get(ADMIN_PATH, wrap(async (req, res) => {
  if (getAdmin(req)) return res.redirect(ADMIN_PATH + '/dashboard');
  const s = await store.getSettings();
  res.send(render('login.html', { ...s, admin_path: ADMIN_PATH }));
}));

app.get(ADMIN_PATH + '/dashboard', wrap(async (req, res) => {
  if (!getAdmin(req)) return res.redirect(ADMIN_PATH);
  const s = await store.getSettings();
  res.send(render('admin.html', { ...s, admin_path: ADMIN_PATH }));
}));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(400).json({ error: err.message || 'Request failed' });
});

if (!store.isVercel) {
  app.listen(PORT, () => {
    console.log(`Public:  http://localhost:${PORT}`);
    console.log(`Admin:   http://localhost:${PORT}${ADMIN_PATH}`);
  });
}

module.exports = app;
