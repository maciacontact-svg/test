// ===== Lista de recursos (editar aquí) =====
// tipo: 'video' → vídeo de Loom incrustado. Pega en `loom` el enlace para compartir (https://www.loom.com/share/...).
// tipo: 'enlace' → caja "Acceder al recurso". Pega en `url` el enlace de Drive.
// Mientras el enlace esté vacío, se muestra un hueco provisional.
const RECURSOS = [
  { titulo: 'Recurso 01 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 02 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 03 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 04 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 05 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 06 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 07 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 08 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 09 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { titulo: 'Recurso 10 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { titulo: 'Recurso 11 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { titulo: 'Recurso 12 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 13 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 14 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 15 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 16 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 17 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 18 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 19 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 20 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 21 · Título provisional', tipo: 'video', loom: '' },
  { titulo: 'Recurso 22 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { titulo: 'Recurso 23 · Base de datos (Drive)', tipo: 'enlace', url: '' },
];

// ===== Lógica =====
const $ = id => document.getElementById(id);
const viewer = $('viewer'), titleEl = $('title'), mediaEl = $('media');
const counterEl = $('counter'), typeEl = $('typeBadge'), gridEl = $('grid');
const prevBtn = $('prevBtn'), nextBtn = $('nextBtn'), searchEl = $('search'), emptyEl = $('empty');
const total = RECURSOS.length;
let current = 0, filter = 'todos';

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ICON_VIDEO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2v8l-4-2"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';

// Convierte https://www.loom.com/share/ID en https://www.loom.com/embed/ID
function loomEmbed(link) {
  const m = String(link || '').match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  return m ? `https://www.loom.com/embed/${m[1]}` : '';
}

function mediaHTML(r) {
  if (r.tipo === 'enlace') {
    const ok = !!r.url;
    return `
      <div class="linkbox">
        <div class="ico">${ICON_LINK.replace(/width="14" height="14"/, 'width="22" height="22"')}</div>
        <h4>Acceder al recurso</h4>
        <p>Se abre en una pestaña nueva.</p>
        <a class="pill${ok ? '' : ' disabled'}" ${ok ? `href="${esc(r.url)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>Abrir enlace <span aria-hidden="true">↗</span></a>
      </div>`;
  }
  const src = loomEmbed(r.loom);
  return `<div class="video">${src
    ? `<iframe src="${src}" allow="fullscreen" allowfullscreen loading="lazy" title="${esc(r.titulo)}"></iframe>`
    : `<div class="video-empty"><span class="play"></span>Aquí irá el vídeo de Loom</div>`}</div>`;
}

function renderGrid() {
  const q = norm(searchEl.value.trim());
  const items = RECURSOS.map((r, i) => ({ r, i }))
    .filter(({ r }) => (filter === 'todos' || r.tipo === filter) && (!q || norm(r.titulo).includes(q)));
  gridEl.innerHTML = items.map(({ r, i }, k) => `
    <a class="card${i === current ? ' on' : ''}" href="#r${pad(i + 1)}" style="--k:${k}">
      <span class="card-top">
        <span class="n">${pad(i + 1)}</span>
        <span class="kind">${r.tipo === 'enlace' ? ICON_LINK + 'Plantilla' : ICON_VIDEO + 'Vídeo'}</span>
      </span>
      <b>${esc(r.titulo)}</b>
    </a>`).join('');
  emptyEl.hidden = items.length > 0;
}

function show(i, scroll) {
  current = i;
  const r = RECURSOS[i];
  counterEl.textContent = `${pad(i + 1)} / ${pad(total)}`;
  typeEl.textContent = r.tipo === 'enlace' ? 'Plantilla' : 'Vídeo';
  titleEl.textContent = r.titulo;
  mediaEl.innerHTML = mediaHTML(r);
  prevBtn.disabled = i === 0;
  nextBtn.disabled = i === total - 1;
  document.title = `${r.titulo} · Tu Marca`;
  gridEl.querySelectorAll('.card').forEach(c => c.classList.toggle('on', c.getAttribute('href') === `#r${pad(i + 1)}`));
  viewer.classList.remove('swap'); void viewer.offsetWidth; viewer.classList.add('swap');
  if (scroll && viewer.getBoundingClientRect().top < 0 || scroll && viewer.getBoundingClientRect().top > innerHeight * .5) {
    viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function fromHash() {
  const n = parseInt((location.hash.match(/^#r(\d+)$/) || [])[1], 10);
  return n >= 1 && n <= total ? n - 1 : 0;
}
const go = i => { location.hash = `r${pad(i + 1)}`; };

prevBtn.addEventListener('click', () => current > 0 && go(current - 1));
nextBtn.addEventListener('click', () => current < total - 1 && go(current + 1));
document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.f;
  document.querySelectorAll('.filters button').forEach(x => x.classList.toggle('on', x === b));
  renderGrid();
}));
searchEl.addEventListener('input', renderGrid);
addEventListener('hashchange', () => show(fromHash(), true));

$('countTag').textContent = `Biblioteca · ${total} recursos`;
current = fromHash();
renderGrid();
show(current, false);
