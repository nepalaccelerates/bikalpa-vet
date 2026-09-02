# Bikalpa Veterinary Clinic — Website

A veterinary clinic website (clinic + pharmacy + pet shop) with a built-in admin panel.
Every piece of content on the site — logo, names, hero text, doctor profile, contact
details, services, products, blog posts and the WhatsApp chat button — is editable from
the admin panel without touching code.

## Stack

- Node.js + Express, no build step
- Storage: Vercel Blob in production (permanent), local JSON file in development
- Server-rendered public page (`views/index.html`), vanilla JS front end
- Deployable to Vercel as a single serverless function

## Running locally

```bash
npm install
npm start
```

- Website: http://localhost:3000
- Admin panel: http://localhost:3000/portal-9k2x
- First login: `admin` / `admin123` — **change it immediately** in Admin → Account.

## Admin panel

| Section | What it controls |
|---|---|
| Services / Pharmacy / Pet shop / Journal | Content cards shown on the homepage, with image uploads |
| Site settings | Logo, clinic name, browser title, hero text and photo, stats, trust bar, vet profile, phones, email, WhatsApp chat button, address, hours, map, footer |
| Account | Change password, download a full JSON backup |

The WhatsApp chat bubble appears automatically once a WhatsApp number is set in
Site settings → Contact & location. Clear the field to hide it.

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel (or run `vercel`).
2. **Create the storage** (required for content to persist): in the Vercel project,
   open **Storage → Create Database → Blob** and connect it to the project. Vercel
   automatically adds the `BLOB_READ_WRITE_TOKEN` environment variable — no code
   changes needed.
3. Add one more environment variable under Settings → Environment Variables:
   - `SESSION_SECRET` — any long random string. Without it, admins are logged out
     whenever the serverless function cold-starts.
4. Deploy. `vercel.json` is already configured.

Optionally set `ADMIN_PATH` (defaults to `/portal-9k2x`) to move the admin login URL.

### How storage works

- **Production (Vercel):** all content and settings live in a private Vercel Blob
  object; uploaded images are stored as public blobs. Everything survives redeploys,
  cold starts and traffic spikes. On the very first boot the store is seeded from
  `data/seed.json`; after that, the admin panel is the source of truth.
- **Development (local):** content lives in `data/db.json` (git-ignored) and uploads
  in `public/uploads/`. Delete `data/db.json` to reset to the seed.
- If the Blob store is ever missing in production, the site still runs (from
  `data/seed.json` in temporary storage) and logs a warning — but edits won't
  survive, so keep the Blob store connected.

Admin → Account → **Download backup** exports everything as JSON at any time.

## Project layout

```
api/index.js       Vercel entry point (wraps server.js)
server.js          Express app: API routes, auth, page rendering
store.js           Storage drivers (Vercel Blob / local files) + default site settings
views/             Server-rendered pages (public site, admin, login)
public/            Static assets (css, js, images, uploads)
data/seed.json     Initial content — the source of truth for deployments
```
