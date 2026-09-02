const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bikalpa-vet-change-this-in-prod-please',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(store.UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, store.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png|gif|webp/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function makeResource(collection) {
  app.get(`/api/${collection}`, (req, res) => {
    res.json(store.all(collection));
  });
  app.get(`/api/${collection}/:id`, (req, res) => {
    const row = store.find(collection, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
  app.post(`/api/admin/${collection}`, requireAuth, upload.single('image'), (req, res) => {
    const data = { ...req.body };
    if (req.file) data.image = '/uploads/' + req.file.filename;
    const row = store.insert(collection, data);
    res.json(row);
  });
  app.put(`/api/admin/${collection}/:id`, requireAuth, upload.single('image'), (req, res) => {
    const data = { ...req.body };
    if (req.file) data.image = '/uploads/' + req.file.filename;
    const row = store.update(collection, req.params.id, data);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  });
  app.delete(`/api/admin/${collection}/:id`, requireAuth, (req, res) => {
    const row = store.find(collection, req.params.id);
    if (row && row.image && row.image.startsWith('/uploads/')) {
      const p = path.join(store.UPLOADS_DIR, path.basename(row.image));
      if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) {} }
    }
    store.remove(collection, req.params.id);
    res.json({ success: true });
  });
}

['services', 'pharmacy', 'petshop', 'blogs'].forEach(makeResource);


app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = store.findAdmin(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.admin = { id: user.id, username: user.username };
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.admin) return res.json({ admin: req.session.admin });
  res.status(401).json({ error: 'Unauthorized' });
});


const ADMIN_PATH = '/portal-9k2x';
app.get(ADMIN_PATH, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get(ADMIN_PATH + '/dashboard', (req, res) => {
  if (!req.session || !req.session.admin) return res.redirect(ADMIN_PATH);
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!store.isVercel) {
  app.listen(PORT, () => {
    console.log(`\nBikalpa Veterinary Clinic — local dev`);
    console.log(`  Public:  http://localhost:${PORT}`);
    console.log(`  Admin:   http://localhost:${PORT}${ADMIN_PATH}`);
    console.log(`  Login:   admin / admin123\n`);
  });
}

module.exports = app;
