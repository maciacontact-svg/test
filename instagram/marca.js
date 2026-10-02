/* System Academy · kit de Instagram y WhatsApp
   Todas las piezas se generan aquí. Para añadir una, copia una entrada de PIEZAS.
   render.js (Node + Playwright) usa esta misma página para sacar los PNG de instagram/png/. */

const HANDLE = '@systemacademy';   // ← cambia aquí tu @ de Instagram
const WEB = 'systemacademy.es';

/* Logo: squircle con triángulo y corte en S. sinFondo = solo el triángulo.
   El corte se pinta como trazo del color de fondo (sin <mask>: así sale igual al descargar PNG). */
function logo({ fondo = '#111', marca = '#fff', sinFondo = false, corte = fondo, size = 100 } = {}) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    ${sinFondo ? '' : `<rect width="100" height="100" rx="26" fill="${fondo}"/>`}
    <path d="M37 27 L77 50 L37 73 Z" fill="${marca}" stroke="${marca}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M27 41 C 40 37, 45 50, 52 51 S 65 61, 79 57" fill="none" stroke="${corte}" stroke-width="5.5" stroke-linecap="round"/>
  </svg>`;
}

/* Iconos de línea (destacados) */
const ICO = {
  wins: '<path d="M32 18h36v18a18 18 0 0 1-36 0z"/><path d="M32 24H20v6a12 12 0 0 0 12 12M68 24h12v6a12 12 0 0 1-12 12"/><path d="M50 54v14M38 82h24M42 82v-8h16v8"/>',
  clases: '<rect x="14" y="22" width="72" height="50" rx="10"/><path d="M44 37l15 10-15 10z"/><path d="M34 84h32"/>',
  dudas: '<path d="M20 26a10 10 0 0 1 10-10h40a10 10 0 0 1 10 10v30a10 10 0 0 1-10 10H44L28 80V66h0a10 10 0 0 1-8-10z"/><path d="M42 34a8 8 0 1 1 11 7.5c-2 1-3 2.5-3 4.5v1"/><circle cx="50" cy="55" r=".5"/>',
  llamada: '<path d="M30 16h10l6 16-8 5a40 40 0 0 0 25 25l5-8 16 6v10a8 8 0 0 1-8 8A62 62 0 0 1 22 24a8 8 0 0 1 8-8z"/>',
  comunidad: '<circle cx="38" cy="36" r="12"/><path d="M16 80c0-14 10-24 22-24s22 10 22 24"/><circle cx="68" cy="40" r="9"/><path d="M64 58c12 0 20 8 20 20"/>',
  recursos: '<path d="M14 30a8 8 0 0 1 8-8h18l8 8h30a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z"/><path d="M50 44v22M40 56l10 10 10-10"/>',
};
const icono = (k, color = '#fff') => `<svg class="ico" viewBox="0 0 100 100" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg>`;
const subir = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>`;

const E = 'contenteditable spellcheck="false"';
const fondo = (tema) => `<div class="rej"></div><div class="marco-fino"></div>`;

/* ---------- Plantillas ---------- */
function win({ tema = 'claro', story = false }) {
  const osc = tema === 'oscuro';
  const capTop = story ? 680 : 560, capH = story ? 1000 : 640, capW = story ? 760 : 620;
  return `
    ${fondo(tema)}
    <div class="cab">${logo(osc ? { fondo: '#fff', marca: '#111' } : {})}
      <div><div class="t" ${E}>System Academy <em>Win</em></div><div class="h" ${E}>${HANDLE}</div></div>
    </div>
    <p class="desc" ${E}><b>[Nombre]</b> celebra [la win: primer vídeo viral, primeros ingresos, monetización…]. Escribe aquí el contexto con los datos reales de la captura.</p>
    <div class="cap" style="top:${capTop}px;width:${capW}px;height:${capH}px" title="Haz clic para subir la captura">
      <div class="vacio">${subir}<span>Haz clic y sube<br>la captura de la win</span></div>
    </div>
    ${story ? `<div class="firma"><span ${E}>${WEB}</span><span class="pill" ${E}>Alumno de System Academy</span></div>` : ''}`;
}

function portada({ tema = 'claro' }) {
  return `
    ${fondo(tema)}
    <div class="car-logo">${logo(tema === 'oscuro' ? { fondo: '#fff', marca: '#111' } : {})}<span>System Academy</span></div>
    <div class="car-tag" ${E}>YouTube faceless</div>
    <h2 class="car-titulo" ${E}>Cómo encontrar un <em>nicho</em> faceless en 10 minutos</h2>
    <p class="car-sub" ${E}>El método paso a paso que usamos con los alumnos.</p>
    <div class="desliza"><span ${E}>Desliza</span><span>→</span></div>`;
}

function interior({ tema = 'claro', n = '01', activo = 1 }) {
  return `
    ${fondo(tema)}
    <div class="car-logo">${logo(tema === 'oscuro' ? { fondo: '#fff', marca: '#111' } : {})}<span>System Academy</span></div>
    <div class="num" ${E}>${n}</div>
    <h3 class="int-titulo" ${E}>Busca canales <em>outlier</em> de tu temática</h3>
    <p class="int-texto" ${E}>Explica aquí el paso en 2–3 frases cortas. Una idea por diapositiva, sin relleno.</p>
    <div class="puntos">${[0, 1, 2, 3, 4].map(i => `<i class="${i === activo ? 'on' : ''}"></i>`).join('')}</div>
    <div class="handle-b" ${E}>${HANDLE}</div>`;
}

function frase({ tema = 'oscuro' }) {
  return `
    ${fondo(tema)}
    <div class="car-logo">${logo(tema === 'oscuro' ? { fondo: '#fff', marca: '#111' } : {})}<span>System Academy</span></div>
    <div class="frase"><span class="comillas">“</span><span ${E}>No necesitas <em>enseñar la cara</em>. Necesitas un sistema.</span></div>
    <div class="handle-b" ${E}>${HANDLE}</div>`;
}

function storyCta({ tema = 'claro' }) {
  return `
    ${fondo(tema)}
    <div class="car-logo" style="top:200px">${logo(tema === 'oscuro' ? { fondo: '#fff', marca: '#111' } : {})}<span>System Academy</span></div>
    <h2 class="car-titulo" style="top:560px;font-size:118px" ${E}>¿Quieres tu <em>roadmap</em> de YouTube faceless?</h2>
    <p class="car-sub" style="top:1100px" ${E}>Responde 6 preguntas y te decimos por dónde empezar.</p>
    <div class="desliza" style="left:96px;right:96px;bottom:300px;justify-content:center;font-size:40px;padding:34px"><span ${E}>${WEB}</span><span>→</span></div>`;
}

/* ---------- Piezas ---------- */
const PIEZAS = [
  { grupo: 'Plantillas de feed (1080×1350)', items: [
    { id: 'win-claro', w: 1080, h: 1350, clase: 'claro', html: () => win({ tema: 'claro' }) },
    { id: 'win-oscuro', w: 1080, h: 1350, clase: 'oscuro', html: () => win({ tema: 'oscuro' }) },
    { id: 'carrusel-portada', w: 1080, h: 1350, clase: 'claro', html: () => portada({ tema: 'claro' }) },
    { id: 'carrusel-interior', w: 1080, h: 1350, clase: 'claro', html: () => interior({ tema: 'claro' }) },
    { id: 'carrusel-portada-oscuro', w: 1080, h: 1350, clase: 'oscuro', html: () => portada({ tema: 'oscuro' }) },
    { id: 'carrusel-interior-oscuro', w: 1080, h: 1350, clase: 'oscuro', html: () => interior({ tema: 'oscuro', n: '02', activo: 2 }) },
    { id: 'frase', w: 1080, h: 1350, clase: 'oscuro', html: () => frase({ tema: 'oscuro' }) },
  ]},
  { grupo: 'Stories (1080×1920)', items: [
    { id: 'story-win', w: 1080, h: 1920, clase: 'oscuro st', html: () => win({ tema: 'oscuro', story: true }) },
    { id: 'story-win-claro', w: 1080, h: 1920, clase: 'claro st', html: () => win({ tema: 'claro', story: true }) },
    { id: 'story-cta', w: 1080, h: 1920, clase: 'claro', html: () => storyCta({ tema: 'claro' }) },
  ]},
  { grupo: 'Portadas de destacados (1080×1080)', items:
    [['wins', 'Wins'], ['clases', 'Clases'], ['recursos', 'Recursos'], ['dudas', 'Dudas'], ['llamada', 'Llamada'], ['comunidad', 'Comunidad']]
      .map(([k, t]) => ({ id: 'destacado-' + k, w: 1080, h: 1080, clase: 'oscuro dest', html: () => `${icono(k)}<div class="lbl" ${E}>${t}</div>` })),
  },
  { grupo: 'Foto de perfil (1080×1080)', items: [
    { id: 'perfil-negro', w: 1080, h: 1080, clase: 'perfil', estilo: 'background:#111', html: () => logo({ sinFondo: true, marca: '#fff', corte: '#111', size: 620 }) },
    { id: 'perfil-gris', w: 1080, h: 1080, clase: 'perfil', estilo: 'background:#f3f3f3', html: () => logo({ size: 560 }) },
    { id: 'perfil-blanco', w: 1080, h: 1080, clase: 'perfil', estilo: 'background:#fff', html: () => logo({ sinFondo: true, marca: '#111', corte: '#fff', size: 620 }) },
    { id: 'perfil-squircle-negro', w: 1080, h: 1080, clase: 'perfil', estilo: 'background:#111', html: () => logo({ fondo: '#fff', marca: '#111', size: 560 }) },
  ]},
  { grupo: 'Grupos de WhatsApp (640×640)', items: [
    { id: 'whatsapp-logo', w: 640, h: 640, clase: 'perfil', estilo: 'background:#111', html: () => logo({ sinFondo: true, marca: '#fff', corte: '#111', size: 380 }) },
    ...[['comunidad', 'Comunidad'], ['wins', '<em>Wins</em>'], ['avisos', 'Avisos'], ['alumnos', 'Alumnos'], ['soporte', 'Soporte']]
      .map(([k, t]) => ({ id: 'whatsapp-' + k, w: 640, h: 640, clase: 'wa', estilo: 'background:#111;color:#fff',
        html: () => `${logo({ sinFondo: true, marca: '#fff', corte: '#111', size: 240 })}<div class="lbl" ${E}>${t}</div>` })),
  ]},
];

/* ---------- Pintar ---------- */
const kit = document.getElementById('kit');
const zoom = (w) => (window.innerWidth < 640 ? Math.min(1, (window.innerWidth - 32) / w) : (w === 640 ? 0.4 : 0.32));

PIEZAS.forEach(g => {
  kit.insertAdjacentHTML('beforeend', `<h2 class="seccion">${g.grupo}</h2>`);
  const rej = document.createElement('div');
  rej.className = 'rejilla';
  g.items.forEach(p => {
    const z = zoom(p.w);
    rej.insertAdjacentHTML('beforeend', `
      <div class="pieza">
        <div class="marco" style="--w:${p.w};--h:${p.h};--z:${z}">
          <div class="lienzo ${p.clase}" data-id="${p.id}" style="--w:${p.w};--h:${p.h};${p.estilo || ''}">${p.html()}</div>
        </div>
        <div class="pie"><span>${p.id}</span><button data-dl="${p.id}">Descargar PNG</button></div>
      </div>`);
  });
  kit.appendChild(rej);
});

/* Subir captura */
const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
document.body.appendChild(input);
let destino = null;
kit.addEventListener('click', e => {
  const cap = e.target.closest('.cap');
  if (cap) { destino = cap; input.value = ''; input.click(); }
});
input.addEventListener('change', () => {
  const f = input.files[0];
  if (!f || !destino) return;
  const r = new FileReader();
  r.onload = () => { destino.innerHTML = `<img src="${r.result}" alt="">`; };
  r.readAsDataURL(f);
});

/* Descargar */
kit.addEventListener('click', async e => {
  const b = e.target.closest('[data-dl]');
  if (!b) return;
  const nodo = kit.querySelector(`.lienzo[data-id="${b.dataset.dl}"]`);
  b.disabled = true; b.textContent = 'Generando…';
  try {
    document.activeElement && document.activeElement.blur();
    const url = await htmlToImage.toPng(nodo, { pixelRatio: 1, cacheBust: true, style: { transform: 'none' } });
    Object.assign(document.createElement('a'), { href: url, download: `system-academy-${b.dataset.dl}.png` }).click();
    mostrar(url);
  } catch (err) {
    mostrar(null);
    console.error(err);
  }
  b.disabled = false; b.textContent = 'Descargar PNG';
});

/* Visor: por si el navegador no deja descargar, la imagen se guarda con clic derecho o pulsación larga */
const visor = document.createElement('div');
visor.className = 'visor';
visor.hidden = true;
visor.innerHTML = '<div class="visor-caja"><p></p><img alt="PNG generado"><button type="button">Cerrar</button></div>';
document.body.appendChild(visor);
visor.addEventListener('click', e => { if (e.target === visor || e.target.tagName === 'BUTTON') visor.hidden = true; });
function mostrar(url) {
  const img = visor.querySelector('img');
  visor.querySelector('p').textContent = url
    ? 'Si no se ha descargado solo: clic derecho → «Guardar imagen como…» (en el móvil, mantén pulsada la imagen).'
    : 'No se pudo generar el PNG. Prueba en Chrome de ordenador.';
  img.hidden = !url;
  if (url) img.src = url;
  visor.hidden = false;
}
