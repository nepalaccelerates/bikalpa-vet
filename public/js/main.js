document.getElementById('year').textContent = new Date().getFullYear();


function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.dataset.icon;
    if (!name || el.dataset.painted) return;
    el.innerHTML = window.icon(name);
    el.dataset.painted = '1';
  });
}
paintIcons();

const mt = document.getElementById('menu-toggle');
const mm = document.getElementById('mobile-menu');
const mc = document.getElementById('mobile-close');
if (mt && mm) {
  mt.onclick = () => mm.classList.add('open');
  mc.onclick = () => mm.classList.remove('open');
  mm.querySelectorAll('a').forEach(a => a.onclick = () => mm.classList.remove('open'));
}

const waFab = document.getElementById('wa-fab');
const waPopup = document.getElementById('wa-popup');
if (waFab && waPopup) {
  waFab.onclick = () => { waPopup.hidden = !waPopup.hidden; };
  document.getElementById('wa-close').onclick = () => { waPopup.hidden = true; };
}

function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  document.querySelectorAll('.reveal:not(.in)').forEach(el => obs.observe(el));
}
initReveal();

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadServices() {
  const grid = document.getElementById('services-grid');
  try {
    const res = await fetch('/api/services');
    const items = await res.json();
    if (!items.length) { grid.innerHTML = '<div class="loading">No services yet.</div>'; return; }
    grid.innerHTML = items.map(s => `
      <article class="service-card ${s.image ? 'has-image' : ''} reveal">
        ${s.image ? `<div class="service-image"><img src="${s.image}" alt="${esc(s.title)}" loading="lazy"/></div>` : ''}
        <div class="${s.image ? 'service-body' : ''}">
          ${!s.image ? `<div class="service-icon">${window.icon(s.icon || 'paw')}</div>` : ''}
          ${s.category ? `<span class="service-cat">${esc(s.category)}</span>` : ''}
          <h3>${esc(s.title)}</h3>
          <p class="service-desc">${esc(s.description || '')}</p>
          <div class="service-foot">
            <span class="service-price">${esc(s.price || '—')}</span>
            <small>Dog &amp; cat</small>
          </div>
        </div>
      </article>
    `).join('');
    paintIcons(grid);
    initReveal();
  } catch (e) {
    grid.innerHTML = '<div class="loading">Could not load services.</div>';
    console.error(e);
  }
}

let productsState = { tab: 'pharmacy', cache: {} };
async function loadProducts(tab) {
  const grid = document.getElementById('products-grid');
  productsState.tab = tab;
  if (!productsState.cache[tab]) {
    grid.innerHTML = '<div class="loading">Loading products…</div>';
    try {
      const res = await fetch('/api/' + tab);
      productsState.cache[tab] = await res.json();
    } catch (e) {
      grid.innerHTML = '<div class="loading">Could not load.</div>';
      return;
    }
  }
  const items = productsState.cache[tab];
  if (!items.length) { grid.innerHTML = '<div class="loading">Nothing here yet.</div>'; return; }
  grid.innerHTML = items.map((p, i) => {
    const isRx = (p.stock || '').toLowerCase().includes('prescription');
    const placeholderIcon = tab === 'pharmacy' ? 'pill' : 'bag';
    return `
      <article class="product-card tint-${i % 4} reveal">
        <div class="product-image">
          ${p.image
            ? `<img src="${p.image}" alt="${esc(p.name)}" loading="lazy"/>`
            : `<span class="placeholder">${window.icon(placeholderIcon)}</span>`
          }
          ${p.stock ? `<span class="stock-pill ${isRx ? 'rx' : ''}">${esc(p.stock)}</span>` : ''}
        </div>
        <div class="product-body">
          ${p.category ? `<span class="product-cat">${esc(p.category)}</span>` : ''}
          <h4>${esc(p.name)}</h4>
          <p class="product-desc">${esc(p.description || '')}</p>
          <div class="product-price">${esc(p.price || '—')}</div>
        </div>
      </article>
    `;
  }).join('');
  initReveal();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadProducts(btn.dataset.tab);
  };
});

async function loadBlogs() {
  const grid = document.getElementById('blog-grid');
  try {
    const res = await fetch('/api/blogs');
    const items = await res.json();
    if (!items.length) { grid.innerHTML = '<div class="loading">No journal entries yet.</div>'; return; }
    grid.innerHTML = items.slice(0, 3).map(b => `
      <article class="blog-card reveal" onclick="openBlog(${b.id})">
        <div class="blog-image">
          ${b.image
            ? `<img src="${b.image}" alt="${esc(b.title)}" loading="lazy"/>`
            : `<span class="blog-image-placeholder">${window.icon('leaf')}</span>`
          }
        </div>
        <div class="blog-meta">
          <span>${esc(b.author || 'Vet team')}</span>
          <span>·</span>
          <span>${new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.excerpt || '')}</p>
        <span class="read">Read more</span>
      </article>
    `).join('');
    initReveal();
  } catch (e) {
    grid.innerHTML = '<div class="loading">Could not load articles.</div>';
  }
}

window.openBlog = async (id) => {
  const res = await fetch('/api/blogs/' + id);
  if (!res.ok) return;
  const b = await res.json();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <article class="modal-card">
      <button class="modal-close" aria-label="Close" onclick="this.closest('.modal-back').remove()">×</button>
      ${b.image ? `<img src="${b.image}" alt=""/>` : ''}
      <div class="modal-meta">${esc(b.author || '')} · ${new Date(b.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      <h2>${esc(b.title)}</h2>
      <p>${esc(b.content || '')}</p>
    </article>
  `;
  back.onclick = (e) => { if (e.target === back) back.remove(); };
  document.body.appendChild(back);
};

loadServices();
loadProducts('pharmacy');
loadBlogs();
