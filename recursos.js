// ===== Grupos del índice (en orden del proceso) =====
const FASES = [
  'Empieza aquí',
  'Nicho y validación',
  'Producción con IA',
  'Retención y crecimiento',
  'Monetización y escala',
  'Prompts',
  'IAs por tarea',
];

// ===== Lista de recursos (editar aquí) =====
// fase:  número del grupo (1 = Empieza aquí … 7 = IAs por tarea)
// desc:  una línea con lo que se aprende (aparece bajo el título)
// tipo:  'video'        → vídeo incrustado. Pega en `video` un enlace de YouTube o de Loom.
//        'enlace'       → caja "Acceder al recurso" (Drive, Notion, Docs…). Pega el enlace en `url`.
//        'herramientas' → lista de IAs con para qué sirve cada una y su enlace.
//        'calculadora'  → calculadora de beneficio (los RPM se editan en RPM_IDIOMA, más abajo).
// Si un enlace está vacío, se muestra un hueco provisional.
const YT = id => `https://www.youtube.com/watch?v=${id}`;
const RECURSOS = [
  // ---------- 1 · Empieza aquí ----------
  { fase: 1, tipo: 'enlace', titulo: 'Guía completa: YouTube Faceless desde 0 (PDF)',
    desc: 'Si partes de cero: cómo funciona el negocio y qué se hace en cada paso, de principio a fin.',
    url: 'https://drive.google.com/file/d/1mz1sTLMKH-FU9dsooVAbk-m93zzREIZU/view?usp=sharing', boton: 'Abrir guía' },
  { fase: 1, tipo: 'video', titulo: 'Qué es YouTube Faceless y por qué funciona en 2026',
    desc: 'El modelo en 3 pasos (nicho, ideas ganadoras y producción con IA), para quién encaja y cómo se escala a una red de canales.',
    video: YT('VdA3kkwUS9s') },
  { fase: 1, tipo: 'video', titulo: 'El proceso completo: de canal nuevo a monetizado con IA',
    desc: 'Optimización del canal, búsqueda de nicho con Claude + NexLev, ideación, guion, voz y edición. Todo el sistema en 20 minutos.',
    video: YT('Tcycc4jeaF0') },

  // ---------- 2 · Nicho y validación ----------
  { fase: 2, tipo: 'video', titulo: 'Cómo validar un nicho: demanda, competencia en español y RPM',
    desc: 'Más visitas que suscriptores, comprobar que nadie lo hace en español y por qué una audiencia mayor paga más.',
    video: YT('1vxIkF00OGY') },
  { fase: 2, tipo: 'video', titulo: '15 nichos faceless sin competencia en español',
    desc: 'Nichos en inglés y ruso que nadie replica aún, qué formato les funciona y cómo adaptarlos.',
    video: YT('_DbyIBDn1_c') },
  { fase: 2, tipo: 'video', titulo: '15 nichos que ya desmonetizan (y la regla para evitarlos)',
    desc: 'Política, guerras, historias para dormir, contenido repetitivo… y la regla de una frase para detectar un nicho peligroso.',
    video: YT('MGXbF76AnaM') },

  // ---------- 3 · Producción con IA ----------
  { fase: 3, tipo: 'video', titulo: 'De cero a monetizado en 5 días: cuenta, guion, voz e imágenes',
    desc: 'Cómo crear la cuenta sin riesgo (Gmail antiguo, calentar, vídeo de presentación) y producir un vídeo en 30 minutos.',
    video: YT('5Mf70MOwy0w') },
  { fase: 3, tipo: 'video', titulo: 'ChatGPT vs Claude: crear un canal faceless de principio a fin',
    desc: 'Comparativa real buscando nicho, analizando el canal, escribiendo el guion y haciendo la miniatura. Cuándo usar cada una.',
    video: YT('Zda6lKtwTvs') },
  { fase: 3, tipo: 'video', titulo: 'IA para miniaturas casi sin censura',
    desc: 'La herramienta para hacer miniaturas de nichos donde otras IAs bloquean la imagen.',
    video: 'https://www.loom.com/share/951e2cbad74d452595152f271c1dcd79' },
  { fase: 3, tipo: 'enlace', titulo: 'Plantilla de Notion: workflow para producir y delegar',
    desc: 'El flujo completo de cada vídeo listo para pasárselo a un equipo. En "Equipo" pon los Looms para formarlo; en "Estrategias", tus canales de referencia y competencia; en "Competencia en español", las ideas y la monetización externa.',
    url: 'https://nebulous-ring-926.notion.site/PLANTILLA-e46c374b02cb830194aa8181ee0a4798?source=copy_link',
    boton: 'Duplicar plantilla' },
  { fase: 3, tipo: 'video', titulo: 'Tutorial: cómo usar la plantilla de Notion',
    desc: 'Paso a paso para duplicar la plantilla y organizar en ella tus vídeos, tu equipo y tus canales de referencia.',
    video: 'https://www.loom.com/share/50eedd22adc14a839ada72468d6f522e' },

  // ---------- 4 · Retención y crecimiento ----------
  { fase: 4, tipo: 'video', titulo: 'El algoritmo en 4 minutos: confianza, CTR y retención',
    desc: 'La fase de entrada al algoritmo y los números mínimos: CTR del 5 % (evergreen) al 15 % (tendencia) y retención del 30 %.',
    video: YT('rop7gxYTHnQ') },
  { fase: 4, tipo: 'video', titulo: 'Cómo decide el algoritmo y el filtro de 3 capas para validar ideas',
    desc: 'Oleadas de impresiones, los 3 pilares de un canal nuevo y cómo elegir outliers recientes con más visitas que suscriptores.',
    video: YT('nerv3g0JipU') },
  { fase: 4, tipo: 'video', titulo: 'Por qué caen las visitas (5 causas) y cómo diagnosticar tu canal',
    desc: 'Índice de confianza, análisis con Gemini, contenido copiado, shorts en canal largo… y qué mirar: impresiones, CTR o retención.',
    video: YT('h1CBfyW8DFk') },

  // ---------- 5 · Monetización y escala ----------
  { fase: 5, tipo: 'calculadora', titulo: 'Calculadora de beneficio del canal (RPM por idioma)',
    desc: 'Elige el idioma del canal, tus visitas al mes y cuántos canales tienes, y te sale una estimación de lo que puedes ganar. Si parte de tu audiencia está en EE. UU., indícalo: allí se paga bastante más.' },
  { fase: 5, tipo: 'video', titulo: 'Contenido inauténtico: por qué no apelar y cómo proteger tu red',
    desc: 'Cómo YouTube relaciona tus canales (Gmail, IP, AdSense, verificación, recuperación) y el sistema para aislarlos.',
    video: YT('nI9xdP2u2Ns') },
  { fase: 5, tipo: 'video', titulo: 'Bilibili, el "YouTube chino": ¿merece la pena? RPM por idioma',
    desc: 'Qué paga de verdad, por qué no compensa empezar ahí y por qué traducir a alemán o inglés dentro de YouTube paga más.',
    video: YT('kyYKQEJDxbw') },

  // ---------- 6 · Prompts ----------
  { fase: 6, tipo: 'enlace', titulo: 'Prompt: buscar nichos rentables en inglés',
    desc: 'Con Claude + NexLev conectado: te devuelve canales de referencia que pasan todos los filtros de un nicho potencial.',
    url: 'https://docs.google.com/document/d/10fD6d4XAOdXnJ1HHlQNjtHLVOoky_KfwPyrCBusL0WE/edit?usp=sharing', boton: 'Abrir prompt' },
  { fase: 6, tipo: 'enlace', titulo: 'Prompt: analizar canales y sacar ideas ganadoras',
    desc: 'Saca los patrones virales de un canal de referencia y te propone un ranking de ideas nuevas para tu nicho.',
    url: 'https://docs.google.com/document/d/1XubNFRSNKhCLGNzPSqYxBeVrFChLtSTVNcMbwbYH2IE/edit?usp=sharing', boton: 'Abrir prompt' },
  { fase: 6, tipo: 'enlace', titulo: 'Prompt: crear guiones que retienen',
    desc: 'Escribe guiones nuevos con los patrones virales del nicho, pensados para maximizar la retención.',
    url: 'https://docs.google.com/document/d/13dCaCNTWy9zPHMQKyNnDl8sI9sdgfYH6xYnqFl0hbbU/edit?usp=sharing', boton: 'Abrir prompt' },

  // ---------- 7 · IAs por tarea ----------
  { fase: 7, tipo: 'herramientas', titulo: 'IAs para analizar canales y buscar nichos',
    desc: 'Para encontrar canales de referencia, outliers y nichos con datos reales.',
    herramientas: [
      { nombre: 'NexLev', para: 'Base de datos de canales: nichos, RPM, outliers y canales terminados. Conéctalo a Claude o ChatGPT.', url: 'https://www.nexlev.io' },
      { nombre: 'Claude', para: 'Con NexLev conectado y nuestros prompts: busca nichos y analiza canales enteros.', url: 'https://claude.ai' },
      { nombre: 'vidIQ', para: 'Ver las palabras clave y etiquetas de los canales de la competencia.', url: 'https://vidiq.com' },
    ] },
  { fase: 7, tipo: 'herramientas', titulo: 'IAs para comprobar ideas potenciales',
    desc: 'Antes de producir: que la idea sea un outlier, reciente y con más visitas que suscriptores.',
    herramientas: [
      { nombre: 'NexLev', para: 'Detectar outliers recientes del nicho y compararlos con la media del canal.', url: 'https://www.nexlev.io' },
      { nombre: 'Claude', para: 'Pasarle el outlier y el prompt de análisis para validar la idea y adaptarla sin copiar.', url: 'https://claude.ai' },
    ] },
  { fase: 7, tipo: 'herramientas', titulo: 'IAs para guiones',
    desc: 'Guiones originales a partir de las ideas ganadoras del nicho.',
    herramientas: [
      { nombre: 'Claude', para: 'La mejor para guiones largos. Úsala con el prompt de guiones.', url: 'https://claude.ai' },
      { nombre: 'ChatGPT', para: 'Alternativa para guiones e ideas; también genera miniaturas.', url: 'https://chatgpt.com' },
    ] },
  { fase: 7, tipo: 'herramientas', titulo: 'IAs para voces',
    desc: 'Locución natural. Mejor voz masculina y sin subir la exageración.',
    herramientas: [
      { nombre: 'ElevenLabs', para: 'La referencia en calidad de voz con IA.', url: 'https://elevenlabs.io' },
      { nombre: 'GenAI Pro', para: 'Las mismas voces que ElevenLabs por mucho menos (lo verás en el vídeo "De cero a monetizado en 5 días").', url: 'https://genaipro.io/' },
    ] },
  { fase: 7, tipo: 'herramientas', titulo: 'IAs para miniaturas e imágenes',
    desc: 'Miniaturas e imágenes para acompañar la narración.',
    herramientas: [
      { nombre: 'Nano Banana (Gemini)', para: 'Imágenes de gran calidad para el vídeo y las miniaturas.', url: 'https://gemini.google.com' },
      { nombre: 'ChatGPT', para: 'Miniaturas a partir de la idea; los últimos retoques, en Canva.', url: 'https://chatgpt.com' },
      { nombre: 'getimg.ai (Flux)', para: 'Modelo casi sin censura para miniaturas de nichos donde otras IAs bloquean la imagen. Mira el vídeo en "Producción con IA".', url: 'https://getimg.ai/blog/flux-1-dev-now-supports-image-to-image-restyle-any-photo-in-seconds' },
      { nombre: 'Canva', para: 'Retoques finales de la miniatura (texto, sello 4K…).', url: 'https://www.canva.com' },
    ] },
  { fase: 7, tipo: 'herramientas', titulo: 'IAs para crear y editar vídeos',
    desc: 'Montaje del vídeo. Mezcla siempre IA con vídeos e imágenes de stock para evitar desmonetizaciones.',
    herramientas: [
      { nombre: 'EasyTubers', para: 'Genera el vídeo entero (guion, voz, imágenes y música) y puede subirlo a tu canal.', url: 'https://easytubers.com/' },
      { nombre: 'CapCut', para: 'Edición manual del vídeo con la locución y las imágenes.', url: 'https://www.capcut.com' },
      { nombre: 'Pixabay', para: 'Vídeos e imágenes de stock gratis y sin copyright.', url: 'https://pixabay.com' },
    ] },
];

// ===== Lógica =====
const $ = id => document.getElementById(id);
const listEl = $('list'), mainEl = $('main'), titleEl = $('title'), mediaEl = $('media');
const searchEl = $('search'), prevBtn = $('prevBtn'), nextBtn = $('nextBtn'), seenBtn = $('seenBtn');
const total = RECURSOS.length;
const STORE = 'biblioteca-vistos-v2';
let current = 0, filter = 'todos';
const closed = new Set();

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Recursos vistos: se guardan en este navegador
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch (e) {}
function saveSeen() { try { localStorage.setItem(STORE, JSON.stringify([...seen])); } catch (e) {} }

const TIPO_LABEL = { video: 'Vídeo', enlace: 'Documento', herramientas: 'Herramientas', calculadora: 'Calculadora' };

// ---------- Calculadora ----------
// RPM medio en dólares por cada 1.000 visitas, según el idioma del canal. Siempre hay excepciones
// (nicho, época del año, tipo de contenido): es una estimación.
const RPM_IDIOMA = [
  ['Inglés', 10, 10], ['Español', 2, 3], ['Francés', 3, 5], ['Alemán', 7, 9],
  ['Italiano', 4, 6], ['Portugués', 2, 3], ['Polaco', 3, 4], ['Griego', 4, 5],
  ['Húngaro', 3, 4], ['Checo', 3, 4], ['Rumano', 3, 4], ['Turco', 2, 4],
  ['Tagalo', 2, 4], ['Ruso', 2, 4], ['Coreano', 6, 8], ['Japonés', 8, 11], ['Chino', 2, 3],
];
const RPM_EEUU = [15, 30];     // audiencia que ve el canal desde EE. UU.
const EUR_POR_USD = 0.86;      // cambio aproximado para mostrar el resultado en euros
const OBJETIVO_EUR = 3000;     // objetivo de la marca: 3.000-4.000 €/mes

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const rango = (a, b, f = nf, u = ' €') => f.format(a) === f.format(b) ? `${f.format(a)}${u}` : `${f.format(a)} – ${f.format(b)}${u}`;

function calcHTML() {
  return `
    <div class="calc">
      <div class="calc-in">
        <label class="fld"><span>Idioma del canal</span>
          <select id="cLang">${RPM_IDIOMA.map(([n, a, b], i) =>
            `<option value="${i}"${n === 'Español' ? ' selected' : ''}>${n} · ${a === b ? a : a + '-' + b} $</option>`).join('')}</select>
        </label>
        <label class="fld"><span>Visitas al mes (por canal)</span>
          <input id="cViews" type="text" inputmode="numeric" value="250.000" autocomplete="off">
        </label>
        <div class="fld"><span>Número de canales</span>
          <div class="stepper"><button type="button" data-d="-1" aria-label="Menos">−</button><b id="cCh">1</b><button type="button" data-d="1" aria-label="Más">+</button></div>
        </div>
        <label class="fld full"><span>Visitas desde EE. UU. <output id="cUsOut">0 %</output></span>
          <input id="cUs" type="range" min="0" max="100" step="5" value="0">
          <small>En EE. UU. se paga 15-30 $ de RPM, también en canales en español.</small>
        </label>
      </div>
      <div class="calc-out">
        <div class="kpi"><small>RPM estimado</small><b id="oRpm"></b></div>
        <div class="kpi hero"><small>Beneficio al mes</small><b id="oMes"></b></div>
        <div class="kpi"><small>En 6 meses</small><b id="o6"></b></div>
        <div class="kpi"><small>En 12 meses</small><b id="o12"></b></div>
      </div>
      <p class="calc-goal" id="oGoal"></p>
      <p class="calc-note">Estimación orientativa, en euros (1 $ ≈ ${EUR_POR_USD.toLocaleString("es-ES")} €). El RPM cambia según el nicho, la época del año (en el último trimestre sube) y el tipo de contenido. Siempre hay excepciones.</p>
    </div>`;
}

function initCalc(root) {
  const q = id => root.querySelector('#' + id);
  let canales = 1;
  const views = () => Number(q('cViews').value.replace(/\D/g, '')) || 0;
  function update() {
    const [, a, b] = RPM_IDIOMA[q('cLang').value];
    const us = q('cUs').value / 100;
    q('cUsOut').textContent = `${q('cUs').value} %`;
    const lo = a * (1 - us) + RPM_EEUU[0] * us, hi = b * (1 - us) + RPM_EEUU[1] * us;
    const k = views() / 1000 * canales * EUR_POR_USD;
    q('oRpm').textContent = rango(lo, hi, nf1, ' $');
    q('oMes').textContent = rango(k * lo, k * hi);
    q('o6').textContent = rango(k * lo * 6, k * hi * 6);
    q('o12').textContent = rango(k * lo * 12, k * hi * 12);
    const need = OBJETIVO_EUR / EUR_POR_USD / ((lo + hi) / 2) * 1000;
    q('oGoal').innerHTML = `Para llegar a <b>${nf.format(OBJETIVO_EUR)} €/mes</b> con este RPM necesitas unas <b>${nf.format(Math.round(need / 1000) * 1000)} visitas al mes</b> entre todos tus canales.`;
  }
  q('cViews').addEventListener('input', update);
  q('cViews').addEventListener('blur', () => { q('cViews').value = nf.format(views()); });
  q('cLang').addEventListener('change', update);
  q('cUs').addEventListener('input', update);
  root.querySelectorAll('.stepper button').forEach(bt => bt.addEventListener('click', () => {
    canales = Math.min(20, Math.max(1, canales + Number(bt.dataset.d)));
    q('cCh').textContent = canales;
    update();
  }));
  update();
}
const ICON = {
  calculadora: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/></svg>',
  herramientas: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  video: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2v8l-4-2"/></svg>',
  enlace: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" width="12" height="12"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Convierte enlaces de YouTube o Loom en su versión para incrustar
function videoEmbed(link) {
  const s = String(link || '');
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const lm = s.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (lm) return `https://www.loom.com/embed/${lm[1]}`;
  return '';
}

function mediaHTML(r) {
  if (r.tipo === 'calculadora') return calcHTML();
  if (r.tipo === 'herramientas') {
    return `<div class="tools">${r.herramientas.map(h => `
      <${h.url ? `a href="${esc(h.url)}" target="_blank" rel="noopener"` : 'div'} class="tool${h.url ? '' : ' nolink'}">
        <span class="tool-name">${esc(h.nombre)}</span>
        <span class="tool-for">${esc(h.para)}</span>
        <span class="tool-go" aria-hidden="true">${h.url ? '↗' : ''}</span>
      </${h.url ? 'a' : 'div'}>`).join('')}</div>`;
  }
  if (r.tipo === 'enlace') {
    const ok = !!r.url;
    return `
      <div class="linkbox">
        <div class="ico">${ICON.enlace.replace('width="15" height="15"', 'width="24" height="24"')}</div>
        <h4>Acceder al recurso</h4>
        <p>${ok ? 'Se abre en una pestaña nueva.' : 'Enlace pendiente de añadir.'}</p>
        <a class="pill${ok ? '' : ' disabled'}" ${ok ? `href="${esc(r.url)}" target="_blank" rel="noopener"` : 'aria-disabled="true"'}>${esc(r.boton || 'Abrir enlace')} <span aria-hidden="true">↗</span></a>
      </div>`;
  }
  const src = videoEmbed(r.video || r.loom);
  return `<div class="video">${src
    ? `<iframe src="${src}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" title="${esc(r.titulo)}"></iframe>`
    : `<div class="video-empty"><span class="play"></span>Vídeo pendiente de añadir</div>`}</div>`;
}

function renderList() {
  const q = norm(searchEl.value.trim());
  const match = (r, i) =>
    (filter === 'todos' || filter === r.tipo || (filter === 'pendientes' && !seen.has(i))) &&
    (!q || norm([r.titulo, r.desc, ...(r.herramientas || []).map(h => h.nombre + ' ' + h.para)].join(' ')).includes(q));
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
            <span class="k" title="${seen.has(i) ? 'Visto' : TIPO_LABEL[r.tipo]}">${seen.has(i) ? ICON.check : ICON[r.tipo]}</span>
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
  $('crumbPhase').textContent = `${pad(r.fase)} · ${FASES[r.fase - 1]}`;
  $('desc').textContent = r.desc || '';
  $('crumbNum').textContent = `Recurso ${pad(i + 1)} de ${pad(total)}`;
  titleEl.textContent = r.titulo;
  mediaEl.innerHTML = mediaHTML(r);
  if (r.tipo === 'calculadora') initCalc(mediaEl);
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
// Navegación libre: cualquier recurso se puede abrir en cualquier momento desde el índice.
// "Visto" solo sirve para que cada persona vea su progreso; nunca bloquea nada.
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

// Cuenta: saludo con su nombre (se guardó al rellenar el formulario)
(() => {
  let c = null;
  try { c = JSON.parse(localStorage.getItem('sa-lead') || 'null'); } catch (e) {}
  const el = document.getElementById('cuenta');
  const n = c && String(c.nombre || '').trim().split(' ')[0];
  if (!el || !n) return;
  el.textContent = n;
  el.title = 'Tu cuenta: ' + (c.correo || n);
  el.hidden = false;
})();
