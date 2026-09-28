// ===== Fases (grupos del índice) =====
const FASES = ['Nicho y validación', 'Producción con IA', 'Retención y crecimiento', 'Monetización y escala'];

// ===== Lista de recursos (editar aquí) =====
// fase: 1-4 (grupo del índice, según FASES)
// tipo: 'video'  → vídeo de Loom incrustado. Pega en `loom` el enlace para compartir (https://www.loom.com/share/...).
// tipo: 'enlace' → caja "Acceder al recurso". Pega en `url` el enlace de Drive.
// Mientras el enlace esté vacío, se muestra un hueco provisional.
const RECURSOS = [
  { fase: 1, titulo: 'Recurso 01 · Título provisional', tipo: 'video', loom: '' },
  { fase: 1, titulo: 'Recurso 02 · Título provisional', tipo: 'video', loom: '' },
  { fase: 1, titulo: 'Recurso 03 · Título provisional', tipo: 'video', loom: '' },
  { fase: 1, titulo: 'Recurso 04 · Título provisional', tipo: 'video', loom: '' },
  { fase: 1, titulo: 'Recurso 05 · Título provisional', tipo: 'video', loom: '' },
  { fase: 1, titulo: 'Recurso 06 · Título provisional', tipo: 'video', loom: '' },
  { fase: 2, titulo: 'Recurso 07 · Título provisional', tipo: 'video', loom: '' },
  { fase: 2, titulo: 'Recurso 08 · Título provisional', tipo: 'video', loom: '' },
  { fase: 2, titulo: 'Recurso 09 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { fase: 2, titulo: 'Recurso 10 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { fase: 2, titulo: 'Recurso 11 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { fase: 3, titulo: 'Recurso 12 · Título provisional', tipo: 'video', loom: '' },
  { fase: 3, titulo: 'Recurso 13 · Título provisional', tipo: 'video', loom: '' },
  { fase: 3, titulo: 'Recurso 14 · Título provisional', tipo: 'video', loom: '' },
  { fase: 3, titulo: 'Recurso 15 · Título provisional', tipo: 'video', loom: '' },
  { fase: 3, titulo: 'Recurso 16 · Título provisional', tipo: 'video', loom: '' },
  { fase: 3, titulo: 'Recurso 17 · Título provisional', tipo: 'video', loom: '' },
  { fase: 4, titulo: 'Recurso 18 · Título provisional', tipo: 'video', loom: '' },
  { fase: 4, titulo: 'Recurso 19 · Título provisional', tipo: 'video', loom: '' },
  { fase: 4, titulo: 'Recurso 20 · Título provisional', tipo: 'video', loom: '' },
  { fase: 4, titulo: 'Recurso 21 · Título provisional', tipo: 'video', loom: '' },
  { fase: 4, titulo: 'Recurso 22 · Plantilla (Drive)', tipo: 'enlace', url: '' },
  { fase: 4, titulo: 'Recurso 23 · Base de datos (Drive)', tipo: 'enlace', url: '' },
];

// ===== Lógica =====
const $ = id => document.getElementById(id);
const listEl = $('list'), mainEl = $('main'), titleEl = $('title'), mediaEl = $('media');
const searchEl = $('search'), prevBtn = $('prevBtn'), nextBtn = $('nextBtn'), seenBtn = $('seenBtn');
const total = RECURSOS.length;
const STORE = 'biblioteca-vistos';
let current = 0, filter = 'todos';
const closed = new Set();

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Recursos vistos: se guardan en este navegador
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch (e) {}
function saveSeen() { try { localStorage.setItem(STORE, JSON.stringify([...seen])); } catch (e) {} }

const ICON = {
  video: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2v8l-4-2"/></svg>',
  enlace: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" width="12" height="12"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

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
        <div class="ico">${ICON.enlace.replace('width="15" height="15"', 'width="24" height="24"')}</div>
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

function renderList() {
  const q = norm(searchEl.value.trim());
  const match = (r, i) =>
    (filter === 'todos' || filter === r.tipo || (filter === 'pendientes' && !seen.has(i))) &&
    (!q || norm(r.titulo).includes(q));
  let html = '', any = false;
  FASES.forEach((nombre, f) => {
    const all = RECURSOS.map((r, i) => ({ r, i })).filter(({ r }) => r.fase === f + 1);
    const shown = all.filter(({ r, i }) => match(r, i));
    if (!shown.length) return;
    any = true;
    const done = all.filter(({ i }) => seen.has(i)).length;
    const isClosed = closed.has(f) && !q;
    html += `
      <div class="group${isClosed ? ' closed' : ''}">
        <button type="button" class="group-head" data-g="${f}">
          <span>${pad(f + 1)} · ${esc(nombre)}</span>
          <span class="gcount">${done}/${all.length}${ICON.chev}</span>
        </button>
        <div class="items">${shown.map(({ r, i }) => `
          <a class="item${i === current ? ' on' : ''}${seen.has(i) ? ' seen' : ''}" href="#r${pad(i + 1)}" data-i="${i}">
            <span class="n">${pad(i + 1)}</span>
            <span class="t">${esc(r.titulo)}</span>
            <span class="k" title="${seen.has(i) ? 'Visto' : r.tipo === 'enlace' ? 'Plantilla' : 'Vídeo'}">${seen.has(i) ? ICON.check : ICON[r.tipo]}</span>
          </a>`).join('')}
        </div>
      </div>`;
  });
  listEl.innerHTML = any ? html : '<p class="no-results">No hay recursos que coincidan.</p>';
}

function renderProgress() {
  $('progText').textContent = `${seen.size} de ${total} vistos`;
  $('progFill').style.width = `${(seen.size / total) * 100}%`;
}

function renderSeenBtn() {
  const on = seen.has(current);
  seenBtn.setAttribute('aria-pressed', on);
  $('seenText').textContent = on ? 'Visto' : 'Marcar como visto';
}

function show(i, fromUser) {
  current = i;
  const r = RECURSOS[i];
  $('crumbPhase').textContent = `Fase ${pad(r.fase)} · ${FASES[r.fase - 1]}`;
  $('crumbNum').textContent = `Recurso ${pad(i + 1)} de ${pad(total)}`;
  titleEl.textContent = r.titulo;
  mediaEl.innerHTML = mediaHTML(r);
  document.title = `${r.titulo} · System Academy`;

  prevBtn.disabled = i === 0;
  nextBtn.disabled = i === total - 1;
  $('nextTitle').textContent = i < total - 1 ? RECURSOS[i + 1].titulo : 'Has llegado al final';

  // abrir un recurso lo marca como visto
  if (fromUser !== 'init' || location.hash) { seen.add(i); saveSeen(); }
  closed.delete(r.fase - 1);
  renderList();
  renderProgress();
  renderSeenBtn();

  [titleEl, mediaEl].forEach(el => { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); });
  if (fromUser === true) {
    mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    if (matchMedia('(max-width: 900px)').matches) scrollTo({ top: 0, behavior: 'smooth' });
  }
  // mantiene visible en el índice el recurso activo
  const act = listEl.querySelector('.item.on');
  if (act && !matchMedia('(max-width: 900px)').matches) act.scrollIntoView({ block: 'nearest' });
}

function fromHash() {
  const n = parseInt((location.hash.match(/^#r(\d+)$/) || [])[1], 10);
  return n >= 1 && n <= total ? n - 1 : 0;
}
const go = i => { location.hash = `r${pad(i + 1)}`; };

// ===== Eventos =====
prevBtn.addEventListener('click', () => current > 0 && go(current - 1));
nextBtn.addEventListener('click', () => current < total - 1 && go(current + 1));
seenBtn.addEventListener('click', () => {
  seen.has(current) ? seen.delete(current) : seen.add(current);
  saveSeen(); renderList(); renderProgress(); renderSeenBtn();
});
listEl.addEventListener('click', e => {
  const head = e.target.closest('.group-head');
  if (!head) return;
  const g = +head.dataset.g;
  closed.has(g) ? closed.delete(g) : closed.add(g);
  head.parentElement.classList.toggle('closed');
});
document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
  filter = b.dataset.f;
  document.querySelectorAll('.filters button').forEach(x => x.classList.toggle('on', x === b));
  renderList();
}));
searchEl.addEventListener('input', renderList);
searchEl.placeholder = `Buscar entre ${total} recursos`;
addEventListener('hashchange', () => show(fromHash(), true));

// Teclado: ← → para moverse entre recursos
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' && current < total - 1) go(current + 1);
  if (e.key === 'ArrowLeft' && current > 0) go(current - 1);
});

show(fromHash(), 'init');
