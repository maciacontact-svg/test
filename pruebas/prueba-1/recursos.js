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
const listEl = document.getElementById('list');
const mainEl = document.getElementById('main');
const kickerEl = document.getElementById('kicker');
const titleEl = document.getElementById('title');
const mediaEl = document.getElementById('media');
const pagerEl = document.getElementById('pager');

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
        <div class="ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></div>
        <h4>Acceder al recurso</h4>
        <p>Se abre en una pestaña nueva.</p>
        <a class="open-btn${ok ? '' : ' disabled'}" ${ok ? `href="${esc(r.url)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>Abrir enlace <span aria-hidden="true">↗</span></a>
      </div>`;
  }
  const src = loomEmbed(r.loom);
  return `
    <div class="video">
      ${src
        ? `<iframe src="${src}" allow="fullscreen" allowfullscreen loading="lazy" title="${esc(r.titulo)}"></iframe>`
        : `<div class="video-empty"><span class="play"></span>Aquí irá el vídeo de Loom</div>`}
    </div>`;
}

function renderList() {
  listEl.innerHTML = RECURSOS.map((r, i) =>
    `<li><a class="item" href="#r${pad(i + 1)}" data-i="${i}"><span class="n">${pad(i + 1)}</span><span>${esc(r.titulo)}</span></a></li>`
  ).join('');
}

function show(i, scroll) {
  const r = RECURSOS[i];
  const total = RECURSOS.length;
  kickerEl.textContent = `Recurso ${pad(i + 1)} de ${pad(total)}`;
  titleEl.textContent = r.titulo;
  mediaEl.innerHTML = mediaHTML(r);
  document.title = `${r.titulo} · Tu Marca`;

  listEl.querySelectorAll('.item').forEach((el, j) => el.classList.toggle('on', j === i));

  const prev = i > 0 ? `<a class="pg prev" href="#r${pad(i)}"><small>← Anterior</small><span>${esc(RECURSOS[i - 1].titulo)}</span></a>` : '';
  const next = i < total - 1 ? `<a class="pg next" href="#r${pad(i + 2)}"><small>Siguiente →</small><span>${esc(RECURSOS[i + 1].titulo)}</span></a>` : '';
  pagerEl.innerHTML = prev + next;

  // animación de entrada del contenido
  mainEl.classList.remove('swap');
  void mainEl.offsetWidth;
  mainEl.classList.add('swap');

  if (scroll) {
    const y = mainEl.getBoundingClientRect().top + scrollY - 90;
    if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }
}

function fromHash() {
  const n = parseInt((location.hash.match(/^#r(\d+)$/) || [])[1], 10);
  return n >= 1 && n <= RECURSOS.length ? n - 1 : 0;
}

renderList();
show(fromHash(), false);
window.addEventListener('hashchange', () => show(fromHash(), true));
