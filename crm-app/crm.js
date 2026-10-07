// ===== System Academy · CRM (dashboard del equipo) =====
// Lee y escribe en tu Google Sheet a través de Apps Script (crm/Code.gs).
// El equipo entra con nombre + PIN (pestaña "Ajustes" del Sheet); nadie más que tú necesita acceso al Sheet.

const API = ((window.SA_CONFIG || {}).API_URL || '').trim();
// ?demo en la URL → datos de ejemplo (para enseñar el CRM sin tocar el Sheet). Entra como «Mario» para ver el acceso maestro.
const DEMO = !API || /[?&]demo\b/.test(location.search);
const REFRESCO = 15000;            // cada cuánto se buscan leads nuevos (ms)
const SESION = DEMO ? 'sa-crm-demo' : 'sa-crm-sesion';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');

let S = null;                      // sesión { caller, pin }
let D = { leads: [], callers: [], estados: [], minutos: 5, setting: { on: false, dias: [] } };
let vista = 'todos', fEstado = '', fCanal = '', q = '';
let pestana = 'leads', periodo = 'hoy', kSel = '';   // KPIs: periodo y caller seleccionado (maestro)
let conocidos = null;              // ids ya vistos (para avisar de leads nuevos)
let ultimo = 0, timer = 0, pendienteRender = false;
const pendientes = {};             // id → { campo: valor } mientras se guarda
let sPer = 'hoy', sSel = '', sDia = '';            // Setting: periodo, caller seleccionado (maestro) y día que se apunta
const pendSet = {}, timersSet = {};                // día → números del setting que aún se están guardando

// ---------- API ----------
async function api(action, extra = {}) {
  if (DEMO) return demoApi(action, extra);
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, caller: S?.caller, pin: S?.pin, ...extra }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Error del servidor');
  return j;
}

// ---------- Acceso ----------
function leerSesion() { try { return JSON.parse(localStorage.getItem(SESION) || 'null'); } catch (e) { return null; } }
function guardarSesion(s) { try { s ? localStorage.setItem(SESION, JSON.stringify(s)) : localStorage.removeItem(SESION); } catch (e) {} }

function mostrarLogin(msg = '') {
  $('app').hidden = true;
  $('login').hidden = false;
  $('lgErr').textContent = msg;
  setTimeout(() => (S?.caller ? $('lgPin') : $('lgName')).focus(), 50);
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const caller = $('lgName').value.trim(), pin = $('lgPin').value.trim();
  $('lgBtn').disabled = true; $('lgErr').textContent = '';
  try {
    S = { caller, pin };
    const r = await api('login');
    S.caller = r.caller;
    S.rol = r.rol || 'caller';
    guardarSesion(S);
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
    $('lgPin').value = '';
    entrar();
  } catch (err) {
    S = null;
    $('lgErr').textContent = err.message;
  } finally { $('lgBtn').disabled = false; }
});

$('logout').addEventListener('click', () => {
  borrarCache(); guardarSesion(null); S = null; clearInterval(timer); conocidos = null;
  mostrarLogin();
});

async function entrar() {
  $('login').hidden = true;
  $('app').hidden = false;
  $('demo').hidden = !DEMO;
  const maestro = S.rol === 'maestro';
  $('me').textContent = maestro ? `${S.caller} · Maestro` : S.caller;
  $('kitLink').hidden = !maestro;
  $('agLink').hidden = true;
  $('tabKpis').textContent = maestro ? 'KPIs del equipo' : 'Mis KPIs';
  document.querySelector('#views [data-v="mios"]').hidden = maestro;
  $('vAsig').hidden = !maestro;
  // se abre al momento con lo último que se vio en este dispositivo; los datos frescos llegan por detrás
  const c = leerCache();
  if (c && !D.leads.length) { pintarDatos(c); $('liveText').textContent = 'Actualizando…'; }
  await cargar();
  clearInterval(timer);
  timer = setInterval(cargar, REFRESCO);
}

// ---------- Datos ----------
// Copia local de la última carga (solo en el dispositivo de quien ha entrado; se borra al salir)
const CACHE = () => 'sa-crm-cache-' + (DEMO ? 'demo-' : '') + String(S?.caller || '').toUpperCase();
function leerCache() { try { return JSON.parse(localStorage.getItem(CACHE()) || 'null'); } catch (e) { return null; } }
function guardarCache(r) { try { localStorage.setItem(CACHE(), JSON.stringify(r)); } catch (e) {} }
function borrarCache() { try { Object.keys(localStorage).filter(k => k.startsWith('sa-crm-cache-')).forEach(k => localStorage.removeItem(k)); } catch (e) {} }
function pintarDatos(r) {
  r.setting = r.setting || { on: false, dias: [] };
  r.ig = r.ig || []; r.setters = r.setters || [];
  r.pipeline = r.pipeline || { on: false, estados: [], fuentes: [], closers: [] };
  D = r;
  // enlace para agendar al lead en plena llamada (queda asignado a quien lo usa)
  const mio = (D.enlacesCaller || []).find(x => mismo(x.nombre, S.caller));
  $('agLink').hidden = !mio;
  if (mio) $('agLink').href = `https://${web()}/c/${mio.slug}`;
  if (!$('fEstado').dataset.ok || $('fEstado').options.length !== D.estados.length + 2) pintarFiltroEstado();
  render();
  pintarTabSetting();
  if (pestana === 'kpis') pintarKpisVista();
  if (pestana === 'setting') pintarSetting();
  if (pestana === 'ig') pintarIg();
  if (pestana === 'enlaces') pintarEnlaces();
  if (pestana === 'pipe') pintarPipe();
  if (pestana === 'ideas') cargarIdeas(true);
  avisarRellamadas();
}

let cargando = false;
async function cargar() {
  if (cargando) return;          // si la anterior aún no ha vuelto, no se apilan peticiones
  cargando = true;
  try {
    const r = await api('list');
    // lo que se está guardando manda sobre lo que llega del servidor
    r.leads.forEach(l => Object.assign(l, pendientes[l.id] || {}));
    r.setting = r.setting || { on: false, dias: [] };
    r.ig = r.ig || []; r.setters = r.setters || [];
    Object.keys(pendSet).forEach(dia => Object.assign(diaSet(r.setting, dia), pendSet[dia]));
    const nuevos = conocidos ? r.leads.filter(l => !conocidos.has(l.id)) : [];
    conocidos = new Set(r.leads.map(l => l.id));
    if (r.rol && S.rol !== r.rol) { S.rol = r.rol; guardarSesion(S); }
    ultimo = Date.now();
    pintarDatos(r);
    guardarCache(r);
    if (nuevos.length) {
      nuevos.forEach(l => document.querySelector(`tr[data-id="${CSS.escape(l.id)}"]`)?.classList.add('flash'));
      toast(nuevos.length === 1 ? `🔥 Nuevo lead: ${nuevos[0].nombre}` : `🔥 ${nuevos.length} leads nuevos`);
      if (document.hidden) document.title = `(${nuevos.length}) Nuevo lead · CRM`;
    }
    live(true);
  } catch (err) {
    if (/PIN|intentos/i.test(err.message)) { borrarCache(); guardarSesion(null); clearInterval(timer); return mostrarLogin(err.message); }
    live(false, err.message);
  } finally { cargando = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'CRM · System Academy'; });

async function guardar(id, cambios) {
  const l = D.leads.find(x => x.id === id);
  if (!l) return;
  const antes = {};
  const local = { ...cambios };
  if (local.autoagenda) { local.caller = ''; local.fijo = ''; local.estado = 'Agendado'; }
  Object.keys(local).forEach(k => { antes[k] = l[k]; });
  Object.assign(l, local);
  pendientes[id] = { ...(pendientes[id] || {}), ...local };
  repintar();
  try {
    const r = await api('update', { id, cambios });
    Object.keys(local).forEach(k => { if (pendientes[id]) delete pendientes[id][k]; });
    if (pendientes[id] && !Object.keys(pendientes[id]).length) delete pendientes[id];
    Object.assign(l, r.lead, pendientes[id] || {});
    repintar();
    return true;
  } catch (err) {
    Object.assign(l, antes);
    delete pendientes[id];
    repintar();
    toast('No se ha guardado: ' + err.message, true);
    return false;
  }
}

function repintar() { render(); if (pestana === 'pipe') pintarPipe(); }

// ---------- Tiempo ----------
function hace(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (!iso || isNaN(m)) return '';
  if (m < 1) return 'ahora mismo';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
function fecha(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
const llamado = l => l.contacto === '✅' || l.intentos > 0;
const hhmm = d => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
// Hora de volver a llamar (sale de las notas: "19:00", "a las 7", "después"…)
const rellamarEn = l => l.rellamar ? new Date(l.rellamar) : null;
const tocaLlamar = l => { const d = rellamarEn(l); return !!d && d <= Date.now(); };
const rellamarHoy = l => { const d = rellamarEn(l); return !!d && d.toDateString() === new Date().toDateString(); };
// Aviso dentro del CRM cuando llega la hora de una rellamada (además del aviso de Slack)
const avisadas = new Set();
function avisarRellamadas() {
  const mios = l => S.rol === 'maestro' || !l.caller || mismo(l.caller, S.caller);
  D.leads.filter(l => tocaLlamar(l) && mios(l) && Date.now() - rellamarEn(l) < 3600e3).forEach(l => {
    const k = l.id + l.rellamar;
    if (avisadas.has(k)) return;
    avisadas.add(k);
    toast(`📞 Toca llamar a ${l.nombre} (${hhmm(rellamarEn(l))})`);
    try { if (window.Notification && Notification.permission === 'granted') new Notification('Toca llamar a ' + l.nombre, { body: String(l.notas || '').split('\n')[0], icon: 'img/app/icon-180.png' }); } catch (e) {}
  });
}
function chipRellamar(l) {
  const d = rellamarEn(l);
  if (!d || isNaN(d)) return '';
  const hoy = d.toDateString() === new Date().toDateString();
  const cuando = hoy ? hhmm(d) : d.toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d <= Date.now()
    ? `<span class="urge call" title="Pidió que le llamaras: ${cuando}">📞 Llamar ya · ${cuando}</span>`
    : `<span class="urge plan" title="Pidió que le llamaras: ${cuando}">⏰ ${hoy ? 'A las ' : ''}${cuando}</span>`;
}
// "Buen form no agendado": cualificó en el formulario, no reservó en Calendly y aún no está cerrado → prioridad
const buenForm = l => l.cualifica && !l.autoagenda && !['Agendado', 'Perdido', 'Invalid'].includes(l.estado);

// ---------- Origen del lead (por qué enlace entró) ----------
const FUENTES = { youtube: '▶️ YouTube', manychat: '🤖 ManyChat', instagram: '📸 Instagram', ig_dm: '📸 DM Instagram', tiktok: '🎵 TikTok', llamada: '📞 Agendado en llamada' };
function origenDe(l) {
  const o = String(l.origen || '');
  if (!o.includes('=')) return { fuente: o ? 'calendly' : 'directo', nombre: o ? '📅 Calendly directo' : 'Directo / sin enlace', etiqueta: '' };
  const p = new URLSearchParams(o);
  const f = (p.get('utm_source') || (p.get('s') ? 'ig_dm' : '')).toLowerCase();
  return { fuente: f || 'directo', nombre: FUENTES[f] || f || 'Directo / sin enlace', etiqueta: p.get('utm_content') || p.get('utm_campaign') || '' };
}

// Canal: YouTube (suelen venir más nutridos) / Instagram (ManyChat, bio, DMs de setters) / otros
const CANALES = { youtube: '▶️ YouTube', instagram: '📸 Instagram', otros: '🔗 Otros', directo: 'Directo / sin enlace' };
function canalDe(l) {
  const f = origenDe(l).fuente;
  if (f === 'youtube') return 'youtube';
  if (l.setter || ['manychat', 'instagram', 'ig_dm'].includes(f)) return 'instagram';
  return ['directo', 'calendly'].includes(f) ? 'directo' : 'otros';
}
function tagCanal(l) {
  const c = canalDe(l), o = origenDe(l);
  if (c === 'directo') return '';
  const det = l.setter ? 'setter ' + l.setter : o.fuente === 'manychat' ? 'ManyChat' + (o.etiqueta ? ' · ' + o.etiqueta : '') : o.etiqueta;
  const nom = c === 'otros' ? o.nombre : CANALES[c];
  return `<span class="tag canal ${c}" title="Entró por ${esc(nom)}${det ? ' · ' + esc(det) : ''}">${esc(nom)}</span>`;
}

// ---------- España / LATAM ----------
// España: +34 / 0034, o 9 cifras sin prefijo que empiezan por 6, 7 (móvil) o 9 (fijo). El resto (+52, +57…) = LATAM/otros.
const PREFIJOS = ['1', '51', '52', '53', '54', '55', '56', '57', '58', '591', '593', '595', '598', '502', '503', '504', '505', '506', '507', '509',
  '351', '33', '39', '44', '49', '41', '32', '31', '212', '240'];
function prefijo(t) {
  const raw = String(t || '').trim();
  let d = raw.replace(/\D/g, '');
  const intl = raw.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  if (!intl && d.length === 9 && /^[679]/.test(d)) return '34';
  if (/^34[679]\d{8}$/.test(d)) return '34';
  if (!intl) return '';
  return PREFIJOS.filter(p => d.startsWith(p)).sort((x, y) => y.length - x.length)[0] || '';
}
const espana = l => prefijo(l.telefono) === '34';
// Orden para llamar: 1 España + buen form · 2 España · 3 LATAM + buen form · 4 LATAM resto
const PRIOS = ['', '🇪🇸 España · buen form', '🇪🇸 España', '🌎 LATAM · buen form', '🌎 LATAM'];
const prioridad = l => (espana(l) ? 1 : 3) + (l.cualifica ? 0 : 1);
const cerrado = l => l.autoagenda || ['Agendado', 'Perdido', 'Invalid'].includes(l.estado);
// Agendado (por caller o él solo) → sale de la lista de leads y pasa al pipeline de closers
const enPipeline = l => l.estado === 'Agendado' || !!l.autoagenda;
const esMio = l => mismo(l.caller, S.caller);
const porLlamar = l => !!l.caller && (S.rol === 'maestro' || esMio(l)) && !cerrado(l) && (l.contacto !== '✅' || !!l.rellamar);

// Aviso de "llámale ya": cuenta atrás de los minutos configurados y luego "tarde"
function urgencia(l) {
  const rl = chipRellamar(l);
  if (rl) return rl;
  if (llamado(l) || l.autoagenda || !l.fecha) return '';
  const s = (Date.now() - new Date(l.fecha)) / 1000, lim = D.minutos * 60;
  if (s > 3600) return '';
  if (s < lim) {
    const r = Math.max(0, Math.round(lim - s));
    return `<span class="urge now">Llamar ya · ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}</span>`;
  }
  return `<span class="urge late">Tarde · +${Math.round((s - lim) / 60)} min</span>`;
}

// ---------- Pintar ----------
function filtrados() {
  const n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qq = n(q);
  return D.leads
    // al buscar se busca en todos; si no, los agendados solo salen en «📅 Agendados»
    .filter(l => qq || (vista === 'agendados' ? enPipeline(l) : !enPipeline(l)))
    .filter(l => qq || vista !== 'todos' || !l.caller)
    .filter(l => qq || vista !== 'asignados' || l.caller)
    .filter(l => vista !== 'buen' || buenForm(l))
    .filter(l => vista !== 'rellamar' || l.rellamar)
    .filter(l => vista !== 'prio' || !cerrado(l))
    .filter(l => vista !== 'espana' || espana(l))
    .filter(l => qq || vista !== 'llamar' || porLlamar(l))
    .filter(l => qq || vista !== 'mios' || esMio(l))
    .filter(l => !fCanal || canalDe(l) === fCanal)
    .filter(l => !fEstado || (fEstado === '__nuevo' ? !l.estado : l.estado === fEstado))
    .filter(l => !qq || n([l.nombre, l.telefono, l.correo, l.notas, l.punto, l.objetivo].join(' ')).includes(qq))
    .sort((a, b) => {
      // primero los que piden que les llamen ya (por hora), luego por fecha de registro
      if (vista === 'rellamar') return rellamarEn(a) - rellamarEn(b);
      if (vista === 'prio' && prioridad(a) !== prioridad(b)) return prioridad(a) - prioridad(b);
      // el día de la rellamada el lead sube arriba: primero los que ya tocan y luego los de más tarde hoy
      const ta = tocaLlamar(a) ? 2 : rellamarHoy(a) ? 1 : 0, tb = tocaLlamar(b) ? 2 : rellamarHoy(b) ? 1 : 0;
      if (ta !== tb) return tb - ta;
      if (ta && tb) return rellamarEn(a) - rellamarEn(b);
      return new Date(b.fecha) - new Date(a.fecha);
    });
}

function render() {
  // si alguien está escribiendo o eligiendo en la tabla, esperamos a que termine
  const act = document.activeElement;
  if (act && $('rows').contains(act) && /TEXTAREA|SELECT/.test(act.tagName)) { pendienteRender = true; return; }
  pendienteRender = false;
  pintarKpis();
  const ls = filtrados();
  // en «Prioridad», un separador por grupo (España buen form → España → LATAM buen form → LATAM)
  const cuenta = {}; ls.forEach(l => { const p = prioridad(l); cuenta[p] = (cuenta[p] || 0) + 1; });
  let g = 0;
  $('rows').innerHTML = ls.map(l => {
    if (vista !== 'prio' || prioridad(l) === g) return fila(l);
    g = prioridad(l);
    return `<tr class="grupo g${g}"><td colspan="11"><b>${g}</b>${PRIOS[g]} <small>${cuenta[g]}</small></td></tr>` + fila(l);
  }).join('');
  $('empty').hidden = ls.length > 0;
  document.querySelectorAll('#rows textarea').forEach(autoalto);
}

function pintarKpis() {
  const hoy = new Date().toDateString();
  const L = D.leads;
  const deHoy = L.filter(l => new Date(l.fecha).toDateString() === hoy).length;
  const ultimaHora = L.filter(l => Date.now() - new Date(l.fecha) < 3600e3).length;
  const espHoy = L.filter(l => new Date(l.fecha).toDateString() === hoy && espana(l)).length;
  const ytHoy = L.filter(l => new Date(l.fecha).toDateString() === hoy && canalDe(l) === 'youtube').length;
  const igHoy = L.filter(l => new Date(l.fecha).toDateString() === hoy && canalDe(l) === 'instagram').length;
  const nLlamar = L.filter(porLlamar).length;
  const nT = $('nTodos'); if (nT) nT.textContent = L.filter(l => !l.caller && !enPipeline(l)).length || '';
  const nL = $('nLlamar'); if (nL) nL.textContent = nLlamar || '';
  const nA = $('nAg'); if (nA) nA.textContent = L.filter(enPipeline).length || '';
  const buenos = L.filter(buenForm).length;
  const buenosSin = L.filter(l => buenForm(l) && !llamado(l)).length;
  const auto = L.filter(l => l.autoagenda).length;
  const urgentes = L.filter(l => urgencia(l)).length;
  const seg = L.filter(l => l.estado === 'Seguimiento' || l.estado === 'Volver a llamar').length;
  const agend = L.filter(l => l.estado === 'Agendado').length;
  // Tasa de contacto: la del caller sobre SUS leads asignados (el maestro ve la del equipo)
  const mis = S.rol === 'maestro' ? L.filter(l => l.caller) : L.filter(l => l.caller.toUpperCase() === S.caller.toUpperCase());
  const contactados = mis.filter(l => etapa(l) >= 2).length;
  const tasa = mis.length ? Math.round(contactados / mis.length * 100) : 0;
  const nR = $('nRell'); if (nR) nR.textContent = L.filter(tocaLlamar).length || '';
  const k = (label, val, sub, cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;
  const n = $('nBuen'); if (n) n.textContent = buenos || '';
  const nP = $('nPrio'); if (nP) nP.textContent = L.filter(l => !cerrado(l) && prioridad(l) === 1).length || '';
  const nE = $('nEsp'); if (nE) nE.textContent = L.filter(espana).length || '';
  $('kpis').innerHTML =
    k('Leads hoy', deHoy, `▶️ ${ytHoy} YouTube · 📸 ${igHoy} Instagram · 🇪🇸 ${espHoy} España`) +
    k('⭐ Buen form no agendado', buenos, buenosSin ? `${buenosSin} sin llamar todavía` : 'Todos llamados', buenosSin ? 'hot' : '') +
    k(S.rol === 'maestro' ? 'Por llamar (asignados)' : 'Tus leads por llamar', nLlamar, urgentes ? `${urgentes} en la última hora sin llamar` : 'Ninguno urgente', urgentes ? 'hot' : '') +
    k('En seguimiento', seg, 'Seguimiento y volver a llamar') +
    k('Agendados', agend, (auto ? `${auto} autoagendados · ` : '') + 'en el pipeline de closers') +
    k(S.rol === 'maestro' ? 'Tasa de contacto (equipo)' : 'Tu tasa de contacto', `${tasa} %`, `${contactados} de ${mis.length} asignados respondieron`);
}

function telLinks(t) {
  let d = String(t).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && /^[67]/.test(d)) d = '34' + d;
  return `<a class="tel" href="tel:+${d}">${esc(t)}</a>
    <a class="wa" href="https://wa.me/${d}" target="_blank" rel="noopener" title="Abrir WhatsApp" aria-label="WhatsApp">
      <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z"/></svg></a>`;
}

function opciones(lista, actual, vacio) {
  const l = actual && !lista.includes(actual) ? [actual, ...lista] : lista;
  return `<option value="">${vacio}</option>` + l.map(v => `<option${v === actual ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

function fila(l) {
  const id = esc(l.id);
  const e = etapa(l);
  const pf = prefijo(l.telefono);
  const tags = tagCanal(l) +
    (pf === '34' ? '<span class="tag es">🇪🇸 España</span>' : `<span class="tag latam" title="Fuera de España">🌎 ${pf ? '+' + pf : 'LATAM'}</span>`) +
    (l.autoagenda ? '<span class="tag auto">📅 Autoagendado</span>' : '') +
    (buenForm(l) ? '<span class="tag buen">⭐ Buen form</span>' : '') +
    (!l.autoagenda && e === 3 ? '<span class="tag etapa">💬 Conversación</span>' : '') +
    (!l.autoagenda && e === 4 ? '<span class="tag etapa">📞 Oferta de llamada</span>' : '');
  return `<tr data-id="${id}" class="${llamado(l) ? '' : 'fresh'}${buenForm(l) ? ' buen' : ''}${tocaLlamar(l) ? ' due' : ''}">
    <td data-label="Fecha registro" class="when"><b>${hace(l.fecha)}</b><small>${fecha(l.fecha)}</small>${urgencia(l)}</td>
    <td data-label="Nombre" class="name"><button type="button" class="link" data-ficha="${id}">${esc(l.nombre)}</button>${l.inversion ? `<small>${esc(l.inversion)}</small>` : ''}${tags}</td>
    <td data-label="Teléfono" class="phone">${telLinks(l.telefono)}</td>
    <td data-label="En qué punto está" class="txt"><span title="${esc(l.punto)}">${esc(l.punto) || '—'}</span></td>
    <td data-label="Qué quiere conseguir" class="txt"><span title="${esc(l.objetivo)}">${esc(l.objetivo) || '—'}</span></td>
    <td data-label="Correo" class="mail">${l.correo ? `<a href="mailto:${esc(l.correo)}" title="${esc(l.correo)}">${esc(l.correo)}</a>` : '—'}</td>
    <td data-label="Caller">${celdaCaller(l)}</td>
    <td data-label="Estado"><select class="pill estado" data-e="${slug(l.estado) || 'nuevo'}" data-f="estado" aria-label="Estado">${opciones(D.estados, l.estado, 'Nuevo')}</select></td>
    <td data-label="Respondió"><button type="button" class="contact ${l.contacto === '✅' ? 'yes' : 'no'}" data-f="contacto" title="${l.contacto === '✅' ? 'Ha respondido' : 'Aún no ha respondido: suma intentos y cámbialo cuando conteste'}" aria-label="Respondió: ${l.contacto === '✅' ? 'sí' : 'no'}">${l.contacto === '✅' ? '✅' : '❌'}</button></td>
    <td data-label="Nº intentos"><div class="step"><button type="button" data-f="intentos" data-d="-1" aria-label="Menos">−</button><b>${l.intentos}</b><button type="button" data-f="intentos" data-d="1" aria-label="Más">+</button></div></td>
    <td data-label="Notas" class="notes"><textarea data-f="notas" rows="1" placeholder="Añadir nota…">${esc(l.notas)}</textarea></td>
  </tr>`;
}

// Caller: los autoagendados y los agendados por un caller en llamada (🔒) solo los cambia el maestro
function celdaCaller(l) {
  const m = S.rol === 'maestro';
  if (!m && l.autoagenda) return `<span class="pill locked" title="Se agendó él solo por Calendly: no lleva caller (si es un error, Mario lo cambia)">Autoagendado</span>`;
  if (!m && l.fijo) return `<span class="pill locked fijo" title="Lo agendó ${esc(l.fijo)} en llamada: solo Mario puede cambiar el caller">🔒 ${esc(l.fijo)}</span>`;
  const lista = l.caller && !D.callers.includes(l.caller) ? [l.caller, ...D.callers] : D.callers;
  const actual = l.autoagenda ? '__auto' : l.caller;
  const op = (v, t) => `<option value="${esc(v)}"${v === actual ? ' selected' : ''}>${esc(t)}</option>`;
  const tit = l.autoagenda ? 'Autoagendado. Elige un caller si en realidad lo agendó él en llamada' : l.fijo ? `🔒 Fijo: lo agendó ${l.fijo} en llamada (solo tú puedes cambiarlo)` : 'Caller';
  return `<select class="pill caller${l.autoagenda ? ' auto' : ''}${l.fijo ? ' fijo' : ''}" data-f="caller" aria-label="Caller" title="${esc(tit)}">` +
    op('', '—') + (m ? op('__auto', '📅 Auto') : '') + lista.map(v => op(v, (l.fijo && v === l.caller ? '🔒 ' : '') + v)).join('') + '</select>';
}

function autoalto(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }

function pintarFiltroEstado() {
  const sel = $('fEstado'), v = sel.value;
  sel.innerHTML = '<option value="">Todos los estados</option><option value="__nuevo">Nuevo (sin estado)</option>' +
    D.estados.map(e => `<option>${esc(e)}</option>`).join('');
  sel.value = v; sel.dataset.ok = 1;
}

// ---------- Ficha ----------
function abrirFicha(id) {
  const l = D.leads.find(x => x.id === id);
  if (!l) return;
  const row = (k, v) => v ? `<div class="kv"><small>${k}</small><p>${esc(v)}</p></div>` : '';
  const e = etapa(l);
  const pasos = ETAPAS.slice(1).map((n, i) => `<button type="button" class="${i + 1 <= e ? 'on' : ''}" data-etapa="${i + 1}"
    ${l.autoagenda ? 'disabled' : ''}><b>${i + 1}</b>${n}</button>`).join('');
  $('dBody').innerHTML = `
    <small class="d-when">${fecha(l.fecha)} · ${hace(l.fecha)}</small>
    <h2 id="dName">${esc(l.nombre)}</h2>
    <div class="d-actions">${telLinks(l.telefono)}${l.correo ? `<a class="mailbtn" href="mailto:${esc(l.correo)}">${esc(l.correo)}</a>` : ''}</div>
    ${enlaceAgendarLead(l)}
    ${chipRellamar(l) ? `<div class="d-rell">${chipRellamar(l)}</div>` : ''}
    <div class="kv embudo-kv"><small>Hasta dónde ha llegado ${l.autoagenda ? '(autoagendado: no cuenta para ningún caller)' : ''}</small>
      <div class="pasos" data-id="${esc(l.id)}">${pasos}</div></div>
    ${row('En qué punto está', l.punto)}${row('Qué quiere conseguir', l.objetivo)}
    ${row('Inversión al mes', l.inversion)}${row('Dónde quiere estar en 3-6 meses', l.meta)}
    ${row('Cuándo se pone en marcha', l.cuando)}${row('Instagram', l.instagram)}
    ${row('País (por el teléfono)', espana(l) ? '🇪🇸 España' : `🌎 Fuera de España${prefijo(l.telefono) ? ' (+' + prefijo(l.telefono) + ')' : ''}`)}
    ${row('Prioridad para llamar', `${prioridad(l)} de 4 · ${PRIOS[prioridad(l)]}`)}
    ${row('Buen form', l.cualifica ? 'Sí: encaja con el perfil (se le ofreció agendar)' : '')}
    ${row('Autoagendado por Calendly', l.autoagenda)}
    ${row('Caller', l.autoagenda ? 'Ninguno (autoagendado)' + (S.rol === 'maestro' ? ' · si lo agendó un caller en llamada, cámbialo en la columna Caller' : '') : l.caller + (l.fijo ? ' · 🔒 lo agendó en llamada' : ''))}${row('Estado', l.estado || 'Nuevo')}${row('Notas caller', l.notas)}
    ${bloqueLlamada(l)}
    ${enPipeline(l) ? `<div class="kv pipe-kv"><small>🎯 Pipeline de closer</small><p>${esc([l.closer ? 'Closer: ' + l.closer : 'Sin closer',
      diaAgendaDe(l) ? 'Llamada: ' + fecha(diaAgendaDe(l).toISOString()) : '', 'Estado: ' + (l.closerEstado || 'Sin contactar')].filter(Boolean).join(' · '))}</p>
      ${l.conclusiones ? `<p>${esc(l.conclusiones)}</p>` : ''}${/^https:\/\//.test(l.linkLlamada) ? `<p><a href="${esc(l.linkLlamada)}" target="_blank" rel="noopener">▶ Ver la llamada (Fathom)</a></p>` : ''}</div>` : ''}
    ${row('Canal', CANALES[canalDe(l)])}
    ${row('Origen', (o => o.nombre + (o.etiqueta ? ' · ' + o.etiqueta : '') + (l.setter ? ' · setter ' + l.setter : ''))(origenDe(l)))}`;
  $('drawer').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
}
// ---------- Notas llamada y grabaciones ----------
const PLANTILLA = 'Situación: \nTemporalidad: \nObjetivo / visión: \nPuente: \nTiempo y dinero: \nOferta: ';
const audios = {};                 // archivo → URL del audio ya descargado (para no bajarlo dos veces)
let subiendo = null;               // { id, txt } mientras se sube una grabación
const puedeGrabar = l => S.rol === 'maestro' || !l.caller || l.caller.toUpperCase() === S.caller.toUpperCase();
function bloqueLlamada(l) {
  const grabs = l.grabaciones || [];
  const quitar = g => S.rol === 'maestro' || puedeGrabar(l) || mismo(g.por, S.caller);
  const lista = grabs.map(g => `<li data-archivo="${esc(g.archivo)}"><span>${fecha(g.fecha)} · ${esc(g.por)}${g.mb ? ' · ' + g.mb + ' MB' : ''}${quitar(g)
      ? ` <button type="button" class="mini quitar" data-quitar="${esc(g.archivo)}" title="Quitar esta grabación">🗑 Quitar</button>` : ''}</span>
    ${audios[g.archivo] ? `<audio controls preload="metadata" src="${audios[g.archivo]}"></audio>`
      : puedeGrabar(l) ? `<button type="button" class="mini" data-oir="${esc(g.archivo)}">▶ Escuchar</button>` : ''}</li>`).join('');
  const sub = subiendo && subiendo.id === l.id;
  return `<div class="kv llamada"><small>📝 Notas llamada <button type="button" class="mini" data-plantilla>Plantilla</button></small>
      <textarea data-ll="${esc(l.id)}" rows="7" placeholder="Situación, temporalidad, objetivo / visión, puente, tiempo y dinero, oferta…">${esc(l.notasLlamada)}</textarea></div>
    <div class="kv grab"><small>📼 Grabaciones${grabs.length ? ` (${grabs.length})` : ''}</small>
      ${lista || sub ? `<ul>${lista}${sub ? `<li><span>Subiendo ahora · ya puedes escucharla</span><audio controls preload="metadata" src="${subiendo.url}"></audio></li>` : ''}</ul>` : ''}
      ${puedeGrabar(l) ? `<label class="subir${sub ? ' on' : ''}"><input type="file" accept="audio/*,.m4a,.mp3,.wav,.aac" data-subir="${esc(l.id)}" hidden ${sub ? 'disabled' : ''}>
        <span class="subir-txt">${sub ? esc(subiendo.txt) : '📼 Subir grabación'}</span></label>
        <p class="nota">iPhone: graba la llamada con el botón de grabar de la propia llamada → Notas → la grabación → ⋯ → «Guardar audio en Archivos» → súbela aquí.</p>`
      : '<p class="nota">Solo el caller de este lead puede subir y escuchar sus grabaciones.</p>'}</div>`;
}
const aB64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const TROZO = 4 * 1024 * 1024;     // igual que en Code.gs
// 1) Directa: el navegador sube el archivo de una vez a Drive (Apps Script solo abre la subida) → rápido.
// 2) Si el navegador no puede (red, permisos), por trozos de 4 MB a través de Apps Script, como antes.
async function subirGrabacion(id, file) {
  if (!file) return;
  if (file.size > 150 * 1024 * 1024) return toast('La grabación pesa demasiado (máx. 150 MB)', true);
  const tipo = /^audio\//.test(file.type) ? file.type : 'audio/mp4';
  const pinta = () => { if ($('drawer').classList.contains('open')) abrirFicha(id); };
  // el % se cambia sin repintar la ficha (para no cortar el audio si lo están escuchando)
  const pc = n => { subiendo.txt = `Subiendo… ${Math.min(100, Math.round(n * 100))} %`; const t = $('dBody').querySelector('.subir-txt'); if (t) t.textContent = subiendo.txt; };
  // mientras sube, ya se puede escuchar el archivo elegido (sale del propio móvil)
  subiendo = { id, txt: 'Subiendo… 0 %', url: URL.createObjectURL(file) }; pinta();
  try {
    let r = null;
    try { r = await subirDirecto(id, file, tipo, pc); } catch (err) { console.warn('Subida directa no disponible:', err); }
    if (!r) { pc(0); r = await subirPorTrozos(id, file, tipo, pc); }
    // la vista previa sale del propio archivo: no hace falta volver a bajarlo de Drive
    if (r.archivo) audios[r.archivo] = subiendo.url;
    const l = D.leads.find(x => x.id === id);
    if (l && r.lead) Object.assign(l, r.lead);
    toast('Grabación guardada');
  } catch (err) {
    toast('No se ha subido: ' + err.message, true);
  } finally {
    subiendo = null; pinta();
  }
}
async function subirDirecto(id, file, tipo, pc) {
  if (DEMO) return null;
  const s0 = await api('grabacion', { id, directo: true, parte: 0, total: file.size, nombre: file.name, tipo, origen: location.origin });
  if (!s0.url) return null;
  const subido = await new Promise(ok => {
    const x = new XMLHttpRequest();
    x.open('PUT', s0.url);
    x.setRequestHeader('Content-Type', tipo);
    x.upload.onprogress = e => e.lengthComputable && pc(e.loaded / e.total * .97);
    x.onload = () => ok(x.status === 200 || x.status === 201);
    x.onerror = x.onabort = x.ontimeout = () => ok(false);
    x.send(file);
  });
  // se le pregunta a Drive (desde Apps Script) si el archivo ha llegado entero; si no, se sube por trozos
  const r = await api('grabacionFin', { id, sube: s0.sube });
  if (!r.completa) { if (subido) console.warn('Drive no confirma la subida directa'); return null; }
  return r;
}
async function subirPorTrozos(id, file, tipo, pc) {
  const partes = Math.ceil(file.size / TROZO);
  let sube = '', r;
  for (let i = 0; i < partes; i++) {
    const datos = aB64(await file.slice(i * TROZO, (i + 1) * TROZO).arrayBuffer());
    r = await api('grabacion', { id, parte: i, total: file.size, nombre: file.name, tipo, sube, datos });
    sube = r.sube || sube;
    pc((i + 1) / partes);
  }
  return r;
}
// Escuchar: se pide el primer trozo y luego el resto a la vez (4 en paralelo), no uno detrás de otro
async function quitarGrabacion(id, archivo, btn) {
  if (!confirm('¿Quitar esta grabación del CRM? Se borra de la ficha y el archivo va a la papelera de Drive (30 días para recuperarlo).')) return;
  btn.disabled = true; btn.textContent = 'Quitando…';
  try {
    const r = await api('borrarGrabacion', { id, archivo });
    const l = D.leads.find(x => x.id === id);
    if (l && r.lead) Object.assign(l, r.lead);
    delete audios[archivo];
    toast('Grabación quitada');
    abrirFicha(id);
  } catch (err) {
    btn.disabled = false; btn.textContent = '🗑 Quitar';
    toast('No se ha quitado: ' + err.message, true);
  }
}
async function oirGrabacion(id, archivo, btn) {
  btn.disabled = true; btn.textContent = 'Cargando…';
  try {
    const r0 = await api('audio', { id, archivo, parte: 0 });
    const tipo = r0.tipo || 'audio/mp4';
    const n = r0.fin || !r0.total ? 1 : Math.ceil(r0.total / TROZO);
    const trozos = [r0.datos ? deB64(r0.datos) : new Uint8Array()];
    let hechos = 1;
    const pinta = () => { btn.textContent = `Cargando… ${Math.round(hechos / n * 100)} %`; };
    pinta();
    let sig = 1;
    const obrero = async () => {
      while (sig < n) {
        const i = sig++;
        const r = await api('audio', { id, archivo, parte: i });
        trozos[i] = r.datos ? deB64(r.datos) : new Uint8Array();
        hechos++; pinta();
      }
    };
    await Promise.all([...Array(Math.min(4, Math.max(0, n - 1)))].map(obrero));
    audios[archivo] = URL.createObjectURL(new Blob(trozos, { type: tipo }));
    abrirFicha(id);
  } catch (err) {
    btn.disabled = false; btn.textContent = '▶ Escuchar';
    toast('No se ha podido cargar: ' + err.message, true);
  }
}
$('drawer').addEventListener('change', e => {
  const i = e.target.closest('[data-subir]');
  if (i) subirGrabacion(i.dataset.subir, i.files[0]);
});
$('drawer').addEventListener('focusout', e => {
  const t = e.target.closest('[data-ll]');
  if (!t) return;
  const l = D.leads.find(x => x.id === t.dataset.ll);
  if (l && t.value.trim() !== (l.notasLlamada || '')) guardar(l.id, { notasLlamada: t.value.trim() }).then(ok => ok && toast('Notas de la llamada guardadas'));
});

// Botón «Agendar llamada» en la ficha: abre la agenda en modo caller con su nombre y email ya puestos
// (queda asignado a quien la usa, 🔒). Solo para quien tiene enlace de caller.
function enlaceAgendarLead(l) {
  const mio = (D.enlacesCaller || []).find(x => mismo(x.nombre, S.caller));
  if (!mio) return '';
  const p = new URLSearchParams({ c: mio.slug, utm_source: 'llamada', l: l.id });
  if (l.nombre) p.set('n', l.nombre);
  if (l.correo) p.set('e', l.correo);
  return `<a class="agendar-btn" href="https://${esc(web())}/agendar?${esc(p.toString())}" target="_blank" rel="noopener">📞 Agendar llamada con ${esc(String(l.nombre).split(' ')[0] || 'este lead')}</a>`;
}
function cerrarFicha() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
$('drawer').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) return cerrarFicha();
  if (e.target.closest('[data-plantilla]')) {
    const t = $('dBody').querySelector('[data-ll]');
    if (t && !t.value.trim()) t.value = PLANTILLA;
    return t && t.focus();
  }
  const qt = e.target.closest('[data-quitar]');
  if (qt) return quitarGrabacion($('dBody').querySelector('[data-ll]').dataset.ll, qt.dataset.quitar, qt);
  const oir = e.target.closest('[data-oir]');
  if (oir) return oirGrabacion($('dBody').querySelector('[data-ll]').dataset.ll, oir.dataset.oir, oir);
  const b = e.target.closest('[data-etapa]');
  if (!b || b.disabled) return;
  const id = b.closest('.pasos').dataset.id;
  const l = D.leads.find(x => x.id === id);
  if (!l) return;
  const n = Number(b.dataset.etapa);
  // pulsar la etapa en la que ya está la deshace (vuelve a la anterior)
  // se marca al instante (guardar actualiza el lead antes de esperar al servidor) y se confirma al volver
  const p = guardar(id, cambiosEtapa(l, n === etapa(l) ? n - 1 : n));
  abrirFicha(id);
  p.then(ok => { if ($('drawer').classList.contains('open')) abrirFicha(id); if (ok) toast('Guardado'); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarFicha(); });

// ---------- Embudo de cada lead ----------
// 0 Asignado · 1 Contactado (algún intento) · 2 Respondió (✅) · 3 Conversación · 4 Oferta de llamada · 5 Agendado
const ETAPAS = ['Asignado', 'Contactado', 'Respondió', 'Conversación', 'Oferta de llamada', 'Agendado'];
function etapa(l) {
  if (l.estado === 'Agendado' && !l.autoagenda) return 5;
  if (l.embudo === 'Oferta llamada') return 4;
  if (l.embudo === 'Conversación') return 3;
  if (l.contacto === '✅') return 2;
  if (l.intentos > 0 || l.estado === 'Contactado') return 1;
  return 0;
}
// Pasar un lead a la etapa n (marca también las anteriores)
function cambiosEtapa(l, n) {
  const c = {};
  if (n >= 1 && l.intentos < 1) c.intentos = 1;
  if (n >= 2 && l.contacto !== '✅') c.contacto = '✅';
  if (n < 2 && l.contacto === '✅') c.contacto = '❌';
  const emb = n >= 4 ? 'Oferta llamada' : n === 3 ? 'Conversación' : '';
  if (emb !== l.embudo) c.embudo = emb;
  if (n === 5 && l.estado !== 'Agendado') c.estado = 'Agendado';
  if (n < 5 && l.estado === 'Agendado') c.estado = 'Seguimiento';
  return c;
}

// ---------- KPIs ----------
function desdePeriodo(p) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === 'hoy') return d;
  if (p === 'todo') return new Date(0);
  d.setDate(d.getDate() - Number(p) + 1);
  return d;
}
// KPIs: Hoy, Ayer, 7 días, 30 días, Todo o 📅 un día / de tal fecha a tal fecha → [desde, hasta)
const deInput = v => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const fmtDia = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
function rangoKpis() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = 864e5, inf = new Date(8.64e15);
  if (periodo === 'ayer') return { desde: new Date(hoy - dia), hasta: hoy, txt: 'ayer' };
  if (periodo === 'rango') {
    const d = deInput($('kDesde').value) || hoy, h0 = deInput($('kHasta').value);
    const h = h0 && h0 >= d ? h0 : d;
    return { desde: d, hasta: new Date(h.getTime() + dia), txt: +h === +d ? fmtDia(d) : `del ${fmtDia(d)} al ${fmtDia(h)}` };
  }
  return { desde: desdePeriodo(periodo), hasta: inf, txt: { hoy: 'hoy', 7: 'últimos 7 días', 30: 'últimos 30 días', todo: 'desde el principio' }[periodo] };
}
function calcKpis(leads, desde, hasta = new Date(8.64e15)) {
  const por = {};
  leads.forEach(l => {
    if (!l.caller || l.autoagenda) return;
    const f = new Date(l.asignado || l.fecha);
    if (!(f >= desde && f < hasta)) return;
    const k = l.caller.toUpperCase();
    const c = por[k] || (por[k] = { nombre: l.caller, n: [0, 0, 0, 0, 0, 0], llamadas: 0 });
    const e = etapa(l);
    for (let i = 0; i <= e; i++) c.n[i]++;
    c.llamadas += l.intentos || 0;
  });
  return Object.values(por);
}
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

function pintarKpisVista() {
  const maestro = S.rol === 'maestro';
  const rg = rangoKpis();
  const todos = calcKpis(D.leads, rg.desde, rg.hasta);
  (D.callers || []).forEach(n => { if (!todos.some(c => c.nombre.toUpperCase() === n.toUpperCase())) todos.push({ nombre: n, n: [0, 0, 0, 0, 0, 0], llamadas: 0 }); });
  const yo = todos.find(c => c.nombre.toUpperCase() === S.caller.toUpperCase()) || { nombre: S.caller, n: [0, 0, 0, 0, 0, 0], llamadas: 0 };
  const equipo = todos.reduce((t, c) => { c.n.forEach((v, i) => t.n[i] += v); t.llamadas += c.llamadas; return t; }, { nombre: 'Equipo', n: [0, 0, 0, 0, 0, 0], llamadas: 0 });
  const sel = maestro ? (todos.find(c => c.nombre === kSel) || equipo) : yo;
  const txtPer = rg.txt;

  $('kTitle').textContent = maestro ? 'KPIs del equipo' : `Tus KPIs · ${S.caller}`;
  $('kSub').textContent = maestro ? `Solo tú ves esta vista · ${txtPer}` : `Sobre los leads que te has asignado · ${txtPer}`;
  const tile = (label, val, sub, cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;
  const n = sel.n;
  const auto = maestro ? D.leads.filter(l => { const f = new Date(l.agendadoEl || l.fecha); return l.autoagenda && f >= rg.desde && f < rg.hasta; }).length : 0;
  $('kTiles').innerHTML =
    tile('Asignados', n[0], maestro && sel === equipo ? 'Entre todos los callers' : 'Leads que se ha quedado') +
    tile('Tasa de contacto', `${pct(n[2], n[0])} %`, `${n[2]} de ${n[0]} respondieron`, 'hot') +
    tile('Conversaciones', n[3], `${pct(n[3], n[2])} % de los que respondieron`) +
    tile('Ofertas de llamada', n[4], `${pct(n[4], n[3])} % de las conversaciones`) +
    tile('Agendados', n[5], `${pct(n[5], n[0])} % de sus asignados`) +
    tile(maestro ? 'Autoagendados' : 'Llamadas hechas', maestro ? auto : sel.llamadas, maestro ? 'Por Calendly, sin caller' : 'Suma de intentos');

  $('kFunnelTitle').textContent = maestro ? `Embudo · ${sel === equipo ? 'todo el equipo' : sel.nombre}` : 'Tu embudo';
  $('kFunnel').innerHTML = ETAPAS.map((et, i) => {
    const w = n[0] ? Math.max(n[i] / n[0] * 100, n[i] ? 2 : 0) : 0;
    const paso = i ? `${pct(n[i], n[i - 1])} % de ${ETAPAS[i - 1].toLowerCase()}` : '100 %';
    return `<div class="f-row" title="${et}: ${n[i]} (${pct(n[i], n[0])} % de asignados)">
      <span class="f-lbl">${et === 'Asignado' ? 'Asignados' : et}</span>
      <span class="f-bar"><i style="width:${w}%"></i></span>
      <b>${n[i]}</b><small>${paso}</small></div>`;
  }).join('');

  $('kRankCard').hidden = !maestro;
  if (maestro) {
    const filas = todos.slice().sort((a, b) => b.n[5] - a.n[5] || pct(b.n[5], b.n[0]) - pct(a.n[5], a.n[0]) || pct(b.n[2], b.n[0]) - pct(a.n[2], a.n[0]));
    $('kRank').innerHTML = `<thead><tr><th>Caller</th><th>Asignados</th><th>Contactados</th><th>Respondieron</th><th>Conversación</th><th>Oferta</th><th>Agendados</th><th>Tasa contacto</th><th>% agenda</th><th>Llamadas</th></tr></thead><tbody>` +
      filas.map((c, i) => `<tr data-c="${esc(c.nombre)}" class="${c.nombre === kSel ? 'on' : ''}">
        <td><b>${i === 0 && c.n[5] ? '🏆 ' : ''}${esc(c.nombre)}</b></td>${c.n.map(v => `<td>${v}</td>`).join('')}
        <td><b>${pct(c.n[2], c.n[0])} %</b></td><td><b>${pct(c.n[5], c.n[0])} %</b></td><td>${c.llamadas}</td></tr>`).join('') +
      `<tr class="tot" data-c=""><td>Equipo</td>${equipo.n.map(v => `<td>${v}</td>`).join('')}<td>${pct(equipo.n[2], equipo.n[0])} %</td><td>${pct(equipo.n[5], equipo.n[0])} %</td><td>${equipo.llamadas}</td></tr></tbody>`;
  }
  pintarSemana();
}

// ---------- Semana a semana (mismas cuentas que el informe de Slack de los lunes: Code.gs → metricasSemana) ----------
const INF = [
  ['leads', 'Leads nuevos', 1], ['buen', '⭐ Buen form', 1], ['asignados', 'Asignados a caller'], ['contactados', 'Contactados (algún intento)'],
  ['respondieron', 'Respondieron'], ['ofertas', 'Ofertas de llamada'], ['agCaller', 'Agendados por caller'], ['auto', 'Autoagendados', 1],
  ['agendas', 'Agendas totales', 1], ['llamadas', 'Llamadas de closer', 1], ['noShow', 'Ghost (no show)', 1], ['pagados', 'Pagados', 1],
];
const INF_PCT = [
  ['pContacto', '% contacto (respondieron / asignados)'], ['pLlamadaAgenda', '% llamada → agenda (agendados / respondieron)'],
  ['pLeadAgenda', '% lead → agenda (agendas / leads)', 1], ['pCierre', '% cierre (pagados / llamadas hechas)', 1],
];
function metricasSemana(L, desde, hasta) {
  const en = iso => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= desde && t < hasta; };
  const m = Object.fromEntries(INF.map(x => [x[0], 0]));
  let hechas = 0;
  L.forEach(l => {
    if (en(l.fecha)) { m.leads++; if (l.cualifica) m.buen++; }
    if (l.autoagenda && en(l.agendadoEl || l.fecha)) m.auto++;
    if (enPipeline(l) && en(l.agendadoEl || (l.autoagenda ? l.fecha : ''))) m.agendas++;
    if (l.caller && !l.autoagenda && en(l.asignado || l.fecha)) {
      const e = etapa(l);
      m.asignados++;
      if (e >= 1) m.contactados++;
      if (e >= 2) m.respondieron++;
      if (e >= 4) m.ofertas++;
      if (e >= 5) m.agCaller++;
    }
    const dA = diaAgendaDe(l);
    if (enPipeline(l) && dA && en(dA.toISOString())) {
      m.llamadas++;
      if (NO_SHOW.includes(l.closerEstado)) m.noShow++;
      if (l.closerEstado === 'Pagado') m.pagados++;
      if (LLAMADA_HECHA.includes(l.closerEstado)) hechas++;
    }
  });
  m.pContacto = pct(m.respondieron, m.asignados);
  m.pLlamadaAgenda = pct(m.agCaller, m.respondieron);
  m.pLeadAgenda = pct(m.agendas, m.leads);
  m.pCierre = pct(m.pagados, hechas);
  return m;
}
function pintarSemana() {
  const maestro = S.rol === 'maestro';
  const L = maestro ? (kSel ? D.leads.filter(l => mismo(l.caller, kSel)) : D.leads) : D.leads.filter(esMio);
  const lunes = new Date(); lunes.setHours(0, 0, 0, 0); lunes.setDate(lunes.getDate() - (lunes.getDay() + 6) % 7);
  const sem = n => { const d = new Date(lunes); d.setDate(d.getDate() - 7 * n); return d; };
  const [a, b, c] = [0, 1, 2].map(n => metricasSemana(L, +sem(n), n ? +sem(n - 1) : 8.64e15));
  const solo = maestro && !kSel;               // las filas de equipo (leads, autoagendados, closer) solo en la vista de todo el equipo
  const fil = x => solo || !x[2];
  const dif = (x, y, pc) => { const d = x - y; return `<span class="dif ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= '}${d ? d : ''}${d && pc ? ' pts' : ''}</span>`; };
  const fila = (x, pc, sep) => `<tr${sep ? ' class="sep"' : ''}><td>${esc(x[1])}</td><td>${a[x[0]]}${pc ? ' %' : ''}</td><td><b>${b[x[0]]}${pc ? ' %' : ''}</b></td><td>${c[x[0]]}${pc ? ' %' : ''}</td><td>${dif(b[x[0]], c[x[0]], pc)}</td></tr>`;
  const f = d => d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  const fin = n => { const d = sem(n - 1); d.setDate(d.getDate() - 1); return d; };
  $('kSem').innerHTML = `<thead><tr><th>${maestro ? (kSel ? esc(kSel) : 'Equipo') : 'Tú'}</th><th>Esta semana<small>en curso · desde ${f(sem(0))}</small></th>
    <th>Semana pasada<small>${f(sem(1))}–${f(fin(1))}</small></th><th>La anterior<small>${f(sem(2))}–${f(fin(2))}</small></th><th>Cambio</th></tr></thead><tbody>` +
    INF_PCT.filter(fil).map((x, i, l) => fila(x, true, i === l.length - 1)).join('') + INF.filter(fil).map(x => fila(x, false)).join('') + '</tbody>';
}
$('periodo').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  periodo = b.dataset.p;
  $('periodo').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('kRango').hidden = periodo !== 'rango';
  if (periodo === 'rango' && !$('kDesde').value) $('kDesde').value = diaKey(new Date());
  pintarKpisVista();
});
['kDesde', 'kHasta'].forEach(id => $(id).addEventListener('change', pintarKpisVista));
$('kRank').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-c]'); if (!tr) return;
  kSel = tr.dataset.c === kSel ? '' : tr.dataset.c;
  pintarKpisVista();
});
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  pestana = b.dataset.t;
  $('tabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('vLeads').hidden = pestana !== 'leads';
  $('vKpis').hidden = pestana !== 'kpis';
  $('vSet').hidden = pestana !== 'setting';
  $('vIg').hidden = pestana !== 'ig';
  $('vEnl').hidden = pestana !== 'enlaces';
  $('vPipe').hidden = pestana !== 'pipe';
  $('vIdeas').hidden = pestana !== 'ideas';
  if (pestana === 'ideas') cargarIdeas();
  if (pestana === 'pipe') pintarPipe();
  if (pestana === 'enlaces') pintarEnlaces();
  if (pestana === 'kpis') pintarKpisVista();
  if (pestana === 'setting') pintarSetting();
  if (pestana === 'ig') pintarIg();
});

// ---------- Ideas (segundo cerebro · solo maestro) ----------
// Jarvis (api/jarvis-tg.js y api/jarvis-slack.js) las guarda ya clasificadas en la pestaña «Ideas» del Sheet.
let I = { ideas: [], categorias: [], estados: [], prioridades: [] }, iDe = 'Mario', iCat = '', iEst = 'abiertas', iQ = '', iCargando = false, iVisto = 0;
const I_EMOJI = { Funnel: '🧲', Contenido: '🎬', Ventas: '💰', 'Formación': '🎓', Marketing: '📣', Equipo: '👥', 'Tecnología': '⚙️', Otros: '🗂️' };
async function cargarIdeas(fondo) {
  if (S.rol !== 'maestro' || iCargando || (fondo && Date.now() - iVisto < 60000)) return;
  iCargando = true;
  try { I = await api('ideas'); iVisto = Date.now(); pintarIdeas(); }
  catch (err) { if (!fondo) { $('iList').innerHTML = ''; $('iEmpty').hidden = false; $('iEmpty').textContent = 'No se han podido cargar las ideas: ' + err.message; } }
  finally { iCargando = false; }
}
function pintarIdeas() {
  const sel = $('iCat');
  if (sel.options.length !== I.categorias.length + 1) sel.innerHTML = '<option value="">Todas las categorías</option>' + I.categorias.map(c => `<option value="${esc(c)}">${I_EMOJI[c] || ''} ${esc(c)}</option>`).join('');
  sel.value = iCat;
  const abierta = x => x.estado === 'Nueva' || x.estado === 'En marcha';
  $('nMias').textContent = I.ideas.filter(x => x.de === 'Mario' && abierta(x)).length || '';
  $('nEquipo').textContent = I.ideas.filter(x => x.de === 'Equipo' && abierta(x)).length || '';
  const n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qq = n(iQ);
  const peso = { Alta: 0, Media: 1, Baja: 2 };
  const ls = I.ideas
    .filter(x => !iDe || x.de === iDe)
    .filter(x => !iCat || x.categoria === iCat)
    .filter(x => iEst === 'abiertas' ? abierta(x) : !iEst || x.estado === iEst)
    .filter(x => !qq || n([x.titulo, x.paraQue, x.idea, x.paso, x.autor, x.original, '#' + x.n].join(' ')).includes(qq));
  // por categoría (en el orden de Ajustes) y dentro: prioridad, luego la más nueva
  const grupos = I.categorias.map(c => [c, ls.filter(x => x.categoria === c).sort((a, b) => (peso[a.prioridad] ?? 1) - (peso[b.prioridad] ?? 1) || b.n - a.n)]).filter(g => g[1].length);
  const opts = (lista, v) => lista.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
  $('iList').innerHTML = grupos.map(([c, xs]) => `<h3 class="i-cat">${I_EMOJI[c] || ''} ${esc(c)} <small>${xs.length}</small></h3>` + xs.map(x => `
    <article class="i-card ${x.estado === 'Hecha' ? 'hecha' : x.estado === 'Descartada' ? 'desc' : ''}" data-n="${x.n}">
      <div class="i-top">
        <div><b>#${x.n} · ${esc(x.titulo)}</b>
          <div class="i-meta"><span class="tag prio-${esc(x.prioridad).toLowerCase()}">${esc(x.prioridad)}</span>
            <span class="tag ${x.de === 'Equipo' ? 'eq' : 'yo'}">${x.de === 'Equipo' ? '👥 ' + esc(x.autor || 'Equipo') : '🧠 Mía'}</span>
            <span class="tag src">${x.canal === 'Slack' ? '# Slack' : x.canal === 'Telegram' ? '✈️ Telegram' : esc(x.canal)}</span><small title="${fecha(x.fecha)}">${hace(x.fecha)}</small></div></div>
        <div class="i-ctl">
          <select class="pill" data-k="estado" aria-label="Estado">${opts(I.estados, x.estado)}</select>
          <select class="pill" data-k="prioridad" aria-label="Prioridad">${opts(I.prioridades, x.prioridad)}</select>
          <select class="pill" data-k="categoria" aria-label="Categoría">${opts(I.categorias, x.categoria)}</select>
        </div>
      </div>
      ${x.paraQue ? `<p class="i-para"><b>Para qué:</b> ${esc(x.paraQue)}</p>` : ''}
      <p class="i-idea">${esc(x.idea)}</p>
      ${x.paso ? `<p class="i-paso">👉 <b>Siguiente paso:</b> ${esc(x.paso)}</p>` : ''}
      ${x.original ? `<details><summary>Lo que dijo${x.original.startsWith('🎙️') ? ' (audio)' : ''}</summary><p>${esc(x.original)}</p></details>` : ''}
    </article>`).join('')).join('');
  $('iEmpty').hidden = ls.length > 0;
  $('iEmpty').textContent = I.ideas.length ? 'No hay ideas que coincidan.' : 'Aún no hay ideas. Mándale una a Jarvis por Telegram o escríbela en el canal de ideas de Slack (crm/JARVIS.md).';
}
$('iDe').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  iDe = b.dataset.d;
  $('iDe').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  pintarIdeas();
});
$('iCat').addEventListener('change', e => { iCat = e.target.value; pintarIdeas(); });
$('iEstado').addEventListener('change', e => { iEst = e.target.value; pintarIdeas(); });
$('iQ').addEventListener('input', e => { iQ = e.target.value; pintarIdeas(); });
$('iList').addEventListener('change', async e => {
  const s = e.target.closest('select[data-k]'); if (!s) return;
  const n = Number(s.closest('[data-n]').dataset.n), x = I.ideas.find(i => i.n === n);
  const antes = x[s.dataset.k];
  x[s.dataset.k] = s.value; s.disabled = true;
  try { await api('ideaEditar', { n, [s.dataset.k]: s.value }); }
  catch (err) { x[s.dataset.k] = antes; alert('No se ha guardado: ' + err.message); }
  pintarIdeas();
});

// ---------- Pipeline de closers ----------
// Los agendados (por un caller o él solo) salen de «Leads» y llegan aquí. El closer rellena estado, notas, link de Fathom
// y conclusiones (Fathom las rellena solo si está conectado: api/fathom.js). Cada closer ve los suyos; el maestro, todos.
let pVista = 'proximas', pQ = '', pEst = '', pClo = '', pendientePipe = false;
const FINALES = ['Pagado', 'No cierra', 'Cancela', 'Cancelado'];
const ANTES_LLAMADA = ['', 'Sin contactar', 'Contactado', 'Respondió', 'Confirma', 'Pendiente'];   // aún no ha tocado la llamada
const LLAMADA_HECHA = ['Asiste', 'Pagado', 'No cierra', 'Seguimiento', 'Plan de acción', 'Se lo piensa'];
const NO_SHOW = ['Ghost', 'No show'];
const COLOR_FUENTE = { SETTING: 'setting', COLD: 'cold', YT: 'yt', IG: 'ig' };
// Día de la agenda: el de Calendly; si es un lead antiguo, se saca de «Llamada 03/10 18:00» (autoagendado o notas)
function diaAgendaDe(l) {
  if (l.diaAgenda) return new Date(l.diaAgenda);
  const m = String((l.autoagenda || '') + '\n' + (l.notas || '')).match(/Llamada (\d{2})\/(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return null;
  const ref = new Date(l.agendadoEl || l.fecha || Date.now());
  const d = new Date(ref.getFullYear(), +m[2] - 1, +m[1], +m[3], +m[4]);
  if (d < ref - 60 * 864e5) d.setFullYear(d.getFullYear() + 1);
  return d;
}
// UTM source del pipeline: el que elija el closer o, si no, el que sale del origen del lead
function fuenteAuto(l) {
  if (l.setter) return 'SETTING';
  const c = canalDe(l);
  if (c === 'youtube') return 'YT';
  if (c === 'instagram') return 'IG';
  return l.autoagenda ? '' : 'COLD';
}
const puedeCerrar = l => S.rol === 'maestro' || (D.pipeline.on && mismo(l.closer, S.caller));
const apellidos = n => String(n || '').trim().split(/\s+/).slice(1).join(' ');
const localDT = d => d ? `${diaKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
function pipeLeads() {
  const m = S.rol === 'maestro';
  return D.leads.filter(enPipeline).filter(l => m ? (!pClo || (pClo === '__sin' ? !l.closer : mismo(l.closer, pClo))) : mismo(l.closer, S.caller));
}
function pintarPipe() {
  const act = document.activeElement;
  if (act && $('pRows').contains(act) && /TEXTAREA|SELECT|INPUT/.test(act.tagName)) { pendientePipe = true; return; }
  pendientePipe = false;
  const m = S.rol === 'maestro', P = D.pipeline;
  $('pTitle').innerHTML = m ? 'Pipeline <em>de closers</em>' : `Tu pipeline <em>· ${esc(S.caller)}</em>`;
  $('pSub').textContent = m ? 'Todos los agendados. Solo tú ves los de todos los closers.' : 'Tus llamadas agendadas. Rellena el estado después de cada llamada.';
  $('pAcceso').hidden = !m;
  if (m) {
    $('pDef').textContent = P.porDefecto || 'nadie (elige closer a mano)';
    $('pToggles').innerHTML = (P.acceso || []).map(c =>
      `<button type="button" class="s-toggle ${c.on ? 'on' : ''}" data-c="${esc(c.nombre)}" aria-pressed="${c.on}">${esc(c.nombre)}<i></i></button>`).join('') ||
      '<p class="k-note">Añade personas en la pestaña Ajustes del Sheet (columna A).</p>';
  }
  const selE = $('pEstado');
  if (!selE.dataset.ok) { selE.innerHTML = '<option value="">Todos los estados</option>' + (P.estados || []).map(e => `<option>${esc(e)}</option>`).join(''); selE.dataset.ok = 1; }
  $('pCloser').hidden = !m;
  if (m) { $('pCloser').innerHTML = '<option value="">Todos los closers</option><option value="__sin">Sin closer</option>' + (P.closers || []).map(c => `<option${c === pClo ? ' selected' : ''}>${esc(c)}</option>`).join(''); $('pCloser').value = pClo; }

  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
  const manana = new Date(+hoy0 + 864e5);
  const todos = pipeLeads();
  const esHoy = l => { const d = diaAgendaDe(l); return d && d >= hoy0 && d < manana; };
  const proxima = l => { const d = diaAgendaDe(l); return !FINALES.includes(l.closerEstado) && (!d || d >= hoy0); };
  const pend = l => { const d = diaAgendaDe(l); return ANTES_LLAMADA.includes(l.closerEstado || '') && d && d < Date.now(); };
  $('nProx').textContent = todos.filter(proxima).length || '';
  $('nHoyP').textContent = todos.filter(esHoy).length || '';
  $('nPend').textContent = todos.filter(pend).length || '';
  const n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qq = n(pQ);
  const t = (l, sin) => { const d = diaAgendaDe(l); return d ? +d : sin; };
  const ls = todos
    .filter(l => pVista === 'todas' || (pVista === 'hoy' ? esHoy(l) : pVista === 'pend' ? pend(l) : proxima(l)))
    .filter(l => !pEst || (pEst === 'Sin contactar' ? ['', 'Sin contactar', 'Pendiente'].includes(l.closerEstado || '') : l.closerEstado === pEst))
    .filter(l => !qq || n([l.nombre, l.correo, l.telefono, l.id].join(' ')).includes(qq))
    .sort((a, b) => pVista === 'todas' ? t(b, 0) - t(a, 0) : t(a, 9e15) - t(b, 9e15));   // próximas: la más cercana arriba; todas: la más reciente

  // resumen
  const hechas = todos.filter(l => LLAMADA_HECHA.includes(l.closerEstado)).length;
  const pag = todos.filter(l => l.closerEstado === 'Pagado').length, ns = todos.filter(l => NO_SHOW.includes(l.closerEstado)).length;
  const k = (label, val, sub, cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;
  const sinConf = todos.filter(l => proxima(l) && diaAgendaDe(l) && l.confirmada !== 'Sí').length;
  $('pKpis').innerHTML = k('Hoy', todos.filter(esHoy).length, 'Llamadas agendadas para hoy', 'hot') +
    k('Próximas', todos.filter(proxima).length, sinConf ? `${sinConf} sin confirmar por WhatsApp` : 'Todas confirmadas') +
    k('Sin estado', todos.filter(pend).length, 'Ya pasaron: rellena cómo fue') +
    k('Pagados', pag, `${pct(pag, hechas)} % de las llamadas hechas`) +
    k('Ghost', ns, `${pct(ns, ns + hechas)} % de las que tocaban`) +
    k('Total agendados', todos.length, 'En este pipeline');

  $('pRows').innerHTML = ls.map(filaPipe).join('');
  $('pEmpty').hidden = ls.length > 0;
  document.querySelectorAll('#pRows textarea').forEach(autoalto);
}
function filaPipe(l) {
  const ed = puedeCerrar(l), dis = ed ? '' : ' disabled';
  const d = diaAgendaDe(l);
  const fu = l.fuente || fuenteAuto(l);
  const prop = l.autoagenda ? '<span class="pill prop auto" title="Se agendó él solo por Calendly">📅 Autoagendado</span>'
    : `<span class="pill prop" title="Lo agendó en llamada">${esc(l.fijo || l.caller || '—')}</span>`;
  const sel = (campo, lista, actual, vacio, cls = '') => `<select class="pill ${cls}" data-p="${campo}"${dis}>` +
    `<option value="">${vacio}</option>` + (actual && !lista.includes(actual) ? [actual, ...lista] : lista).map(v => `<option${v === actual ? ' selected' : ''}>${esc(v)}</option>`).join('') + '</select>';
  const cuando = d ? (d.toDateString() === new Date().toDateString() ? `<span class="urge call">Hoy ${hhmm(d)}</span>` : d < Date.now() ? `<small>${hace(d.toISOString())}</small>` : '') : '<small>Sin fecha</small>';
  const si = l.confirmada === 'Sí';
  const conf = `<button type="button" class="conf ${si ? 'si' : 'no'}" data-conf="${si ? 'No' : 'Sí'}" aria-pressed="${si}" title="${si ? 'Confirmada por WhatsApp · toca para marcarla sin confirmar' : 'Toca cuando la confirme por WhatsApp'}"${dis}>${si ? '✅ Confirmada' : '⏳ No confirmada'}</button>`;
  return `<tr data-id="${esc(l.id)}" class="${d && d.toDateString() === new Date().toDateString() ? 'due' : ''}">
    <td data-label="Lead ID" class="pid">${esc(l.id)}</td>
    <td data-label="Fecha registro" class="when"><small>${fecha(l.fecha)}</small></td>
    <td data-label="Nombre" class="name"><button type="button" class="link" data-ficha="${esc(l.id)}">${esc(String(l.nombre).trim().split(/\s+/)[0] || l.nombre)}</button></td>
    <td data-label="Apellidos">${esc(apellidos(l.nombre)) || '—'}</td>
    <td data-label="Email" class="mail">${l.correo ? `<a href="mailto:${esc(l.correo)}" title="${esc(l.correo)}">${esc(l.correo)}</a>` : '—'}</td>
    <td data-label="Teléfono" class="phone">${telLinks(l.telefono)}</td>
    <td data-label="Día de la agenda" class="dia"><input type="datetime-local" data-p="diaAgenda" value="${localDT(d)}"${dis}>${cuando}${conf}</td>
    <td data-label="UTM source">${sel('fuente', D.pipeline.fuentes || [], fu, '—', 'fuente f-' + (COLOR_FUENTE[fu] || 'x'))}${!l.fuente && fu ? '<small class="auto-tag">auto</small>' : ''}</td>
    <td data-label="Propietario">${prop}</td>
    <td data-label="Estado">${sel('closerEstado', (D.pipeline.estados || []).filter(e => e !== 'Sin contactar'), l.closerEstado === 'Sin contactar' ? '' : l.closerEstado, 'Sin contactar', 'estado c-' + slug(l.closerEstado || 'sin contactar'))}</td>
    <td data-label="Closer">${S.rol === 'maestro' || ed ? sel('closer', D.pipeline.closers || [], l.closer, '— Sin closer', 'closer') : `<span class="pill prop">${esc(l.closer || '—')}</span>`}</td>
    <td data-label="Notas" class="notes"><textarea data-p="closerNotas" rows="1" placeholder="Notas…"${dis}>${esc(l.closerNotas)}</textarea></td>
    <td data-label="Link de llamada" class="link-ll"><input type="url" data-p="linkLlamada" value="${esc(l.linkLlamada)}" placeholder="https://fathom.video/…"${dis}>${/^https:\/\//.test(l.linkLlamada) ? `<a href="${esc(l.linkLlamada)}" target="_blank" rel="noopener">Abrir ↗</a>` : ''}</td>
    <td data-label="Conclusiones" class="notes"><textarea data-p="conclusiones" rows="1" placeholder="Qué pasa ahora: pagado, reagenda, se lo piensa…"${dis}>${esc(l.conclusiones)}</textarea></td>
  </tr>`;
}
function guardarPipe(el) {
  const id = el.closest('tr')?.dataset.id, campo = el.dataset.p;
  const l = D.leads.find(x => x.id === id);
  if (!l || !campo) return;
  let v = el.value.trim();
  if (campo === 'diaAgenda') v = v ? new Date(v).toISOString() : '';
  const actual = campo === 'diaAgenda' ? (diaAgendaDe(l) ? diaAgendaDe(l).toISOString() : '') : campo === 'fuente' ? (l.fuente || fuenteAuto(l)) : (l[campo] || '');
  if (v === actual && !(campo === 'fuente' && !l.fuente)) return;
  if (campo === 'linkLlamada' && v && !/^https:\/\//.test(v)) { toast('El link tiene que empezar por https://', true); el.value = l.linkLlamada || ''; return; }
  if (campo === 'closer' && !confirm(v ? `¿Pasar a ${l.nombre} al closer ${v}?` : `¿Quitar el closer de ${l.nombre}?`)) { el.value = l.closer; return; }
  guardar(id, { [campo]: v }).then(ok => ok && /Notas|conclusiones/.test(campo) && toast('Guardado'));
}
$('pRows').addEventListener('change', e => { if (/SELECT|INPUT/.test(e.target.tagName)) { guardarPipe(e.target); e.target.blur(); } });
$('pRows').addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA') autoalto(e.target); });
$('pRows').addEventListener('focusout', e => {
  if (e.target.tagName === 'TEXTAREA') guardarPipe(e.target);
  setTimeout(() => { if (pendientePipe && !$('pRows').contains(document.activeElement)) pintarPipe(); }, 0);
});
$('pRows').addEventListener('click', e => {
  const b = e.target.closest('[data-ficha]'); if (b) return abrirFicha(b.dataset.ficha);
  const c = e.target.closest('[data-conf]'); if (!c || c.disabled) return;
  const id = c.closest('tr')?.dataset.id;
  guardar(id, { confirmada: c.dataset.conf }).then(ok => ok && toast(c.dataset.conf === 'Sí' ? 'Llamada confirmada' : 'Marcada sin confirmar'));
});
$('pVistas').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  pVista = b.dataset.v;
  $('pVistas').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  pintarPipe();
});
$('pQ').addEventListener('input', e => { pQ = e.target.value.trim(); pintarPipe(); });
$('pEstado').addEventListener('change', e => { pEst = e.target.value; pintarPipe(); });
$('pCloser').addEventListener('change', e => { pClo = e.target.value; pintarPipe(); });
$('pToggles').addEventListener('click', async e => {
  const b = e.target.closest('.s-toggle'); if (!b) return;
  const c = (D.pipeline.acceso || []).find(x => x.nombre === b.dataset.c); if (!c) return;
  c.on = !c.on; pintarPipe();
  try {
    await api('closerOn', { para: c.nombre, on: c.on });
    toast(`Pipeline ${c.on ? 'activado' : 'desactivado'} para ${c.nombre}`);
  } catch (err) { c.on = !c.on; pintarPipe(); toast('No se ha guardado: ' + err.message, true); }
});

// ---------- Setting (mensajes) ----------
// Mensajes abiertos → convos seguidas → [ofertas de llamada → agendas] y [ofertas a biblioteca → entradas a biblioteca]
const SET = [
  ['abiertos', 'Mensajes abiertos'], ['convos', 'Convos seguidas'],
  ['ofertas', 'Propuestas de llamada'], ['agendas', 'Agendas'],
  ['ofertasBib', 'Ofertas a biblioteca'], ['entradasBib', 'Entradas a biblioteca'],
];
const diaKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cero = () => Object.fromEntries(SET.map(([k]) => [k, 0]));
function diaSet(st, dia, caller = S.caller) {
  let o = st.dias.find(x => x.dia === dia && x.caller.toUpperCase() === caller.toUpperCase());
  if (!o) { o = { dia, caller, ...cero() }; st.dias.push(o); }
  return o;
}
function sumaSet(dias) { const t = cero(); dias.forEach(d => SET.forEach(([k]) => { t[k] += Number(d[k]) || 0; })); return t; }

function pintarTabSetting() {
  const ver = S.rol === 'maestro' || D.setting.on;
  const verIg = ver || esSetter(S.caller);
  $('tabSet').hidden = !ver;
  $('tabIg').hidden = !verIg;
  $('tabEnl').hidden = S.rol !== 'maestro';
  $('tabIdeas').hidden = S.rol !== 'maestro';
  if (S.rol !== 'maestro' && pestana === 'ideas') $('tabs').querySelector('[data-t="leads"]').click();
  const verPipe = S.rol === 'maestro' || D.pipeline.on;
  $('tabPipe').hidden = !verPipe;
  $('tabPipe').textContent = S.rol === 'maestro' ? 'Closers' : 'Mi pipeline';
  if (!verPipe && pestana === 'pipe') $('tabs').querySelector('[data-t="leads"]').click();
  if (S.rol !== 'maestro' && pestana === 'enlaces') $('tabs').querySelector('[data-t="leads"]').click();
  if ((!ver && pestana === 'setting') || (!verIg && pestana === 'ig')) $('tabs').querySelector('[data-t="leads"]').click();
}
const mismo = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();
const esSetter = n => D.setters.some(x => mismo(x.nombre, n));

// Lo que llega solo (Instagram + enlaces de cada setter), por día, para un setter (o todos si no se indica)
const diaDe = iso => iso ? diaKey(new Date(iso)) : '';
function autoSet(nombre, desde) {
  const t = { ...cero(), enlaces: 0 };
  const suyo = x => x.setter && (!nombre || mismo(x.setter, nombre));
  const en = iso => iso && diaDe(iso) >= desde;
  D.ig.filter(suyo).forEach(c => {
    if (en(c.asignado)) t.abiertos++;
    if (en(c.respondio)) t.convos++;
    if (en(c.propuesta)) t.ofertas++;
    if (en(c.enlaceAgenda)) t.enlaces++;
    if (en(c.enlaceBiblio)) t.ofertasBib++;
  });
  D.leads.filter(suyo).forEach(l => {
    if (l.autoagenda && en(l.agendadoEl || l.fecha)) t.agendas++;
    if (/(^|&)s=/.test(l.origen) && en(l.fecha)) t.entradasBib++;
  });
  return t;
}
const sumar = (a, b) => { const t = { ...a }; Object.keys(b).forEach(k => { t[k] = (t[k] || 0) + (b[k] || 0); }); return t; };

function pintarSetting() {
  const maestro = S.rol === 'maestro', st = D.setting;
  const desde = diaKey(desdePeriodo(sPer));
  const txtPer = { hoy: 'hoy', 7: 'últimos 7 días', 30: 'últimos 30 días', todo: 'desde el principio' }[sPer];
  $('sTitle').textContent = maestro ? 'Setting del equipo' : `Tu setting · ${S.caller}`;
  $('sSub').textContent = maestro ? `Solo tú ves esta vista · ${txtPer}` : `Lo que apuntas cada día · ${txtPer}`;

  // Maestro: activar / desactivar por caller
  $('sCallers').hidden = !maestro;
  if (maestro) $('sToggles').innerHTML = (st.callers || []).map(c =>
    `<button type="button" class="s-toggle ${c.on ? 'on' : ''}" data-c="${esc(c.nombre)}" aria-pressed="${c.on}">${esc(c.nombre)}<i></i></button>`).join('') ||
    '<p class="k-note">Añade callers en la pestaña Ajustes del Sheet.</p>';

  // Caller: apuntar los números del día
  $('sApuntar').hidden = maestro;
  if (!maestro) {
    const hoy = new Date();
    if (!sDia) sDia = diaKey(hoy);
    const dias = [...Array(8)].map((_, i) => { const d = new Date(hoy); d.setDate(d.getDate() - i); return d; });
    const sel = document.activeElement?.id === 'sDiaSel';
    if (!sel) $('sDia').innerHTML = `<select id="sDiaSel" aria-label="Día">${dias.map((d, i) => {
      const k = diaKey(d), t = i === 0 ? 'Hoy' : i === 1 ? 'Ayer' : d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' });
      return `<option value="${k}"${k === sDia ? ' selected' : ''}>${t}</option>`;
    }).join('')}</select>`;
    const o = st.dias.find(x => x.dia === sDia && x.caller.toUpperCase() === S.caller.toUpperCase()) || { ...cero() };
    const au = autoSet(S.caller, sDia), auHasta = autoSet(S.caller, diaKey(new Date(new Date(sDia).getTime() + 864e5 * 1.5)));
    Object.keys(au).forEach(k => { au[k] -= auHasta[k]; });   // solo ese día
    const escribiendo = $('sCounters').contains(document.activeElement);
    if (!escribiendo) $('sCounters').innerHTML = SET.map(([k, label], i) => `
      <div class="s-counter${i < 2 ? ' full' : ''}" data-k="${k}">
        <small>${i < 2 ? '' : i < 4 ? '📞 ' : '📚 '}<b>${label}</b> · <span class="auto">automático: ${au[k]}</span></small>
        <input type="number" inputmode="numeric" min="0" max="9999" value="${o[k] || 0}" aria-label="${label}">
        <div class="step"><button type="button" data-d="-1" aria-label="Menos">−</button><button type="button" data-d="1" aria-label="Más">+</button></div>
      </div>`).join('');
  }

  // Embudo del periodo
  const mias = st.dias.filter(d => d.dia >= desde && (maestro ? (!sSel || d.caller === sSel) : d.caller.toUpperCase() === S.caller.toUpperCase()));
  const t = sumar(sumaSet(mias), autoSet(maestro ? sSel : S.caller, desde));
  $('sFunnelTitle').textContent = maestro ? `Embudo de setting · ${sSel || 'todo el equipo'}` : 'Tu embudo de setting';
  const paso = (label, v, base, txt) => `<div class="s-step"><span>${label}</span><b>${v}</b>
    <span class="f-bar"><i style="width:${base ? Math.min(100, v / base * 100) : 0}%"></i></span><small>${txt}</small></div>`;
  $('sFunnel').innerHTML = `<div class="s-flow">
    <div class="s-top">
      <div class="s-rama">${paso('Mensajes abiertos', t.abiertos, t.abiertos, maestro ? 'Conversaciones abiertas' : 'Conversaciones que has abierto')}</div>
      <div class="s-rama">${paso('Convos seguidas', t.convos, t.abiertos, `${pct(t.convos, t.abiertos)} % de los mensajes abiertos`)}</div>
    </div>
    <div class="s-ramas">
      <div class="s-rama"><h4>📞 Llamada</h4>
        ${paso('Propuestas de llamada', t.ofertas, t.convos, `${pct(t.ofertas, t.convos)} % de las convos`)}
        ${paso('Enlaces de agenda', t.enlaces, t.ofertas, `${pct(t.enlaces, t.ofertas)} % de las propuestas`)}
        ${paso('Agendas', t.agendas, t.ofertas, `${pct(t.agendas, t.ofertas)} % de las propuestas · ${pct(t.agendas, t.abiertos)} % de los abiertos`)}</div>
      <div class="s-rama"><h4>📚 Biblioteca</h4>
        ${paso('Ofertas a biblioteca', t.ofertasBib, t.convos, `${pct(t.ofertasBib, t.convos)} % de las convos`)}
        ${paso('Entradas a biblioteca', t.entradasBib, t.ofertasBib, `${pct(t.entradasBib, t.ofertasBib)} % de las ofertas a biblioteca`)}</div>
    </div></div>`;

  // Maestro: tabla por caller
  $('sRankCard').hidden = !maestro;
  if (maestro) {
    const nombres = [...new Set([...(st.callers || []).filter(c => c.on).map(c => c.nombre), ...D.setters.map(x => x.nombre), ...st.dias.filter(d => d.dia >= desde).map(d => d.caller)])];
    const filas = nombres.map(n => ({ n, t: sumar(sumaSet(st.dias.filter(d => d.dia >= desde && d.caller === n)), autoSet(n, desde)) })).sort((a, b) => b.t.agendas - a.t.agendas || b.t.entradasBib - a.t.entradasBib);
    const eq = sumar(sumaSet(st.dias.filter(d => d.dia >= desde)), autoSet('', desde));
    const celdas = x => `<td>${x.abiertos}</td><td>${x.convos}</td><td>${x.ofertas}</td><td>${x.agendas}</td><td>${x.ofertasBib}</td><td>${x.entradasBib}</td>
      <td><b>${pct(x.convos, x.abiertos)} %</b></td><td><b>${pct(x.agendas, x.ofertas)} %</b></td><td><b>${pct(x.entradasBib, x.ofertasBib)} %</b></td>`;
    $('sRank').innerHTML = `<thead><tr><th>Caller</th><th>Abiertos</th><th>Convos</th><th>Propuestas</th><th>Agendas</th><th>Ofertas biblio.</th><th>Entradas biblio.</th><th>% convo</th><th>% agenda</th><th>% biblio.</th></tr></thead><tbody>` +
      filas.map(f => `<tr data-c="${esc(f.n)}" class="${f.n === sSel ? 'on' : ''}"><td><b>${esc(f.n)}</b></td>${celdas(f.t)}</tr>`).join('') +
      `<tr class="tot" data-c=""><td>Equipo</td>${celdas(eq)}</tr></tbody>`;
  }
}

function apuntarSet(k, v) {
  const o = diaSet(D.setting, sDia);
  o[k] = Math.max(0, Math.min(9999, Math.round(Number(v)) || 0));
  const dia = sDia;
  pendSet[dia] = { ...(pendSet[dia] || {}), [k]: o[k] };
  clearTimeout(timersSet[dia]);
  timersSet[dia] = setTimeout(async () => {
    const cambios = pendSet[dia];
    try {
      await api('setting', { dia, cambios });
      if (pendSet[dia] === cambios) delete pendSet[dia];
    } catch (err) { toast('No se ha guardado: ' + err.message, true); }
  }, 700);
  return o[k];
}
$('sCounters').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]'); if (!b) return;
  const box = b.closest('.s-counter'), inp = box.querySelector('input');
  inp.value = apuntarSet(box.dataset.k, Number(inp.value) + Number(b.dataset.d));
  pintarSetting();
});
$('sCounters').addEventListener('change', e => {
  const box = e.target.closest('.s-counter'); if (!box) return;
  e.target.value = apuntarSet(box.dataset.k, e.target.value);
  e.target.blur(); pintarSetting();
});
$('sDia').addEventListener('change', e => { sDia = e.target.value; e.target.blur(); pintarSetting(); });
$('sPeriodo').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  sPer = b.dataset.p;
  $('sPeriodo').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  pintarSetting();
});
$('sRank').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-c]'); if (!tr) return;
  sSel = tr.dataset.c === sSel ? '' : tr.dataset.c;
  pintarSetting();
});
$('sToggles').addEventListener('click', async e => {
  const b = e.target.closest('.s-toggle'); if (!b) return;
  const c = D.setting.callers.find(x => x.nombre === b.dataset.c); if (!c) return;
  c.on = !c.on; pintarSetting();
  try {
    await api('settingOn', { para: c.nombre, on: c.on });
    toast(`Setting ${c.on ? 'activado' : 'desactivado'} para ${c.nombre}`);
  } catch (err) { c.on = !c.on; pintarSetting(); toast('No se ha guardado: ' + err.message, true); }
});

// ---------- Enlaces con seguimiento (solo maestro) ----------
let ePer = '30';
const web = () => D.web || 'biblioteca.systemacademy.es';   // dominio de la web: Ajustes → G13
const enlace = (destino, fuente, etiqueta) => `${web()}/${destino}/${slugUrl(fuente)}${etiqueta ? '/' + slugUrl(etiqueta) : ''}`;
const slugUrl = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
function misEnlaces() { try { return JSON.parse(localStorage.getItem('sa-crm-enlaces') || '[]'); } catch (e) { return []; } }
function guardarEnlaces(l) { try { localStorage.setItem('sa-crm-enlaces', JSON.stringify(l)); } catch (e) {} }
function enlaceActual() {
  const f = $('eFuente').value === 'otra' ? $('eOtra').value : $('eFuente').value;
  return { destino: $('eDestino').value, fuente: slugUrl(f) || 'otra', etiqueta: slugUrl($('eEtiqueta').value) };
}
function pintarGenerador() {
  $('eOtraF').hidden = $('eFuente').value !== 'otra';
  const e = enlaceActual();
  $('eLink').textContent = enlace(e.destino, e.fuente, e.etiqueta);
}
function pintarEnlaces() {
  pintarGenerador();
  const item = (titulo, sub, url) => `<div class="e-item"><div><b>${esc(titulo)}</b><small>${esc(sub)}</small></div>
    <span class="ig-copy"><span>${esc(url)}</span><button type="button" data-copy="https://${esc(url)}">Copiar</button></span>`;
  const fijos = [
    ['▶️ YouTube · agenda', 'Descripción de los vídeos', enlace('agenda', 'youtube')],
    ['▶️ YouTube · biblioteca', 'Descripción de los vídeos', enlace('biblio', 'youtube')],
    ['📸 Instagram · agenda', 'Bio o historias', enlace('agenda', 'instagram')],
    ['📸 Instagram · biblioteca', 'Bio o historias', enlace('biblio', 'instagram')],
  ];
  $('eLista').innerHTML =
    fijos.map(f => item(...f) + '<span></span></div>').join('') +
    misEnlaces().map((e, i) => item(`${FUENTES[e.fuente] || e.fuente} · ${e.destino === 'agenda' ? 'agenda' : 'biblioteca'}`, e.etiqueta || 'sin etiqueta', enlace(e.destino, e.fuente, e.etiqueta)) +
      `<button type="button" class="ghost e-del" data-del="${i}">Quitar</button></div>`).join('') +
    D.setters.map(x => item(`🧑‍💻 ${x.nombre} · agenda`, 'Setter (DM de Instagram)', `${web()}/a/${x.slug}`) + '<span></span></div>' +
      item(`🧑‍💻 ${x.nombre} · biblioteca`, 'Setter (DM de Instagram)', `${web()}/b/${x.slug}`) + '<span></span></div>').join('') +
    (D.enlacesCaller || []).map(x => item(`📞 ${x.nombre} · agendar en llamada`, 'Solo para el caller: queda asignado a él (🔒)', `${web()}/c/${x.slug}`) + '<span></span></div>').join('');
  // De dónde vienen
  const desde = desdePeriodo(ePer);
  const g = {};
  D.leads.filter(l => new Date(l.fecha) >= desde).forEach(l => {
    const o = origenDe(l);
    const k = (l.setter ? 'setter:' + l.setter : o.fuente + '|' + o.etiqueta);
    const r = g[k] || (g[k] = { nombre: l.setter ? '🧑‍💻 Setter ' + l.setter : o.nombre, etiqueta: l.setter ? '' : o.etiqueta, n: 0, buen: 0, agenda: 0, es: 0 });
    r.n++; if (l.cualifica) r.buen++; if (l.autoagenda || l.estado === 'Agendado') r.agenda++; if (espana(l)) r.es++;
  });
  const filas = Object.values(g).sort((a, b) => b.agenda - a.agenda || b.n - a.n);
  const pc = {};
  D.leads.filter(l => new Date(l.fecha) >= desde).forEach(l => {
    const c = canalDe(l), r = pc[c] || (pc[c] = { n: 0, buen: 0, agenda: 0, es: 0 });
    r.n++; if (l.cualifica) r.buen++; if (l.autoagenda || l.estado === 'Agendado') r.agenda++; if (espana(l)) r.es++;
  });
  $('eCanales').innerHTML = Object.keys(CANALES).map(c => { const r = pc[c] || { n: 0, buen: 0, agenda: 0, es: 0 };
    return `<div class="kpi ${c === 'youtube' ? 'hot' : ''}"><small>${CANALES[c]}</small><b>${r.n}</b><span>${r.agenda} agendados (${pct(r.agenda, r.n)} %) · ${r.buen} buen form · ${r.es} España</span></div>`; }).join('');
  const tot = filas.reduce((t, r) => ({ n: t.n + r.n, buen: t.buen + r.buen, agenda: t.agenda + r.agenda, es: t.es + r.es }), { n: 0, buen: 0, agenda: 0, es: 0 });
  $('eTabla').innerHTML = `<thead><tr><th>Fuente</th><th>Etiqueta</th><th>Leads</th><th>🇪🇸 España</th><th>⭐ Buen form</th><th>📅 Agendados</th><th>% agenda</th></tr></thead><tbody>` +
    (filas.length ? filas.map(r => `<tr><td><b>${esc(r.nombre)}</b></td><td>${esc(r.etiqueta) || '—'}</td><td>${r.n}</td><td>${r.es}</td><td>${r.buen}</td><td>${r.agenda}</td><td><b>${pct(r.agenda, r.n)} %</b></td></tr>`).join('')
      : '<tr><td colspan="7">Aún no hay leads en este periodo.</td></tr>') +
    `<tr class="tot"><td>Total</td><td></td><td>${tot.n}</td><td>${tot.es}</td><td>${tot.buen}</td><td>${tot.agenda}</td><td>${pct(tot.agenda, tot.n)} %</td></tr></tbody>`;
}
['eFuente', 'eDestino'].forEach(id => $(id).addEventListener('change', pintarGenerador));
['eOtra', 'eEtiqueta'].forEach(id => $(id).addEventListener('input', pintarGenerador));
$('eCopiar').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('https://' + $('eLink').textContent); toast('Enlace copiado'); } catch (e) { toast($('eLink').textContent); }
});
$('eGuardar').addEventListener('click', () => {
  const e = enlaceActual(), l = misEnlaces();
  if (!l.some(x => x.destino === e.destino && x.fuente === e.fuente && x.etiqueta === e.etiqueta)) { l.unshift(e); guardarEnlaces(l); }
  toast('Guardado en tu lista'); pintarEnlaces();
});
$('vEnl').addEventListener('click', async e => {
  const c = e.target.closest('[data-copy]');
  if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast('Enlace copiado'); } catch (err) { toast(c.dataset.copy); } return; }
  const d = e.target.closest('[data-del]');
  if (d) { const l = misEnlaces(); l.splice(Number(d.dataset.del), 1); guardarEnlaces(l); pintarEnlaces(); }
});
$('ePeriodo').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ePer = b.dataset.p;
  $('ePeriodo').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  pintarEnlaces();
});

// ---------- Instagram (seguimiento de DMs) ----------
let igVista = 'todas', igQ = '', igSetter = null;
const ms = iso => iso ? new Date(iso).getTime() : 0;
const igNorm = u => String(u || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase();
function igEstado(c, lead) {
  if (lead && lead.autoagenda) return { k: 'agendo', t: '✅ Agendó' };
  if (ms(c.ultimoIn) > ms(c.ultimoOut)) return { k: 'toca', t: `🔥 Te ha respondido · ${hace(c.ultimoIn)}` };
  if (ms(c.visto) >= ms(c.ultimoOut) && c.ultimoOut) return { k: 'visto', t: `👀 Visto sin responder · ${hace(c.ultimoOut)}` };
  return { k: 'espera', t: `📭 Sin ver · ${hace(c.ultimoOut)}` };
}
function igDatos() {
  const porIg = {};
  D.leads.forEach(l => { const u = igNorm(l.instagram); if (u) porIg[u] = l; });
  return D.ig.map(c => {
    const lead = porIg[igNorm(c.usuario)];
    const e = igEstado(c, lead);
    const follow = (e.k === 'visto' || e.k === 'espera') && Date.now() - ms(c.ultimoOut) > 24 * 3600e3;
    return { c, lead, e, follow, act: Math.max(ms(c.ultimoIn), ms(c.ultimoOut)) };
  });
}
function pintarIg() {
  const maestro = S.rol === 'maestro';
  // cada setter solo ve las suyas (el servidor ya solo le manda esas); el maestro ve todas y puede filtrar
  if (!maestro) igSetter = ''; else if (igSetter === null) igSetter = '';
  $('igSetter').hidden = !maestro;
  $('igSub').textContent = maestro ? 'Todas las conversaciones de @aleix.ytf con setter, propuesta o enlace. Solo tú ves las de todos.'
    : 'Tus conversaciones de @aleix.ytf (las que llevan tu marca o tu enlace). Se actualizan solas.';
  // enlaces y palabra clave
  const yo = D.setters.filter(x => maestro || mismo(x.nombre, S.caller));
  const base = web();
  const copia = url => `<span class="ig-copy"><span>${esc(url)}</span><button type="button" data-copy="https://${esc(url)}">Copiar</button></span>`;
  $('igLinks').innerHTML = `<h3>${maestro ? 'Enlaces y marcas de cada setter' : 'Tus enlaces y tu marca'}</h3>` + (yo.length ? yo.map(x => `
    <div class="ig-set"><div><b>${esc(x.nombre)}</b><small>Tu marca en los mensajes: ${x.clave ? `«${esc(x.clave)}»` : '— (Mario la pone en Ajustes, columna J)'}</small></div>
      <div><small>📅 Agenda</small>${copia(`${base}/a/${x.slug}`)}</div><div><small>📚 Biblioteca</small>${copia(`${base}/b/${x.slug}`)}</div></div>`).join('')
    : '<p class="k-note">Aún no tienes enlace: pídele a Mario que te añada en Ajustes (columnas I–K).</p>');
  // filtro de setter
  const sel = $('igSetter');
  sel.innerHTML = '<option value="">Todos los setters</option><option value="__sin">Sin setter</option>' + D.setters.map(x => `<option${x.nombre === igSetter ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('');
  sel.value = igSetter;

  const n = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qq = n(igQ);
  const todos = igDatos().filter(x => !igSetter || (igSetter === '__sin' ? !x.c.setter : mismo(x.c.setter, igSetter)));
  $('nToca').textContent = todos.filter(x => x.e.k === 'toca').length || '';
  $('nFollow').textContent = todos.filter(x => x.follow).length || '';
  const ls = todos
    .filter(x => igVista === 'todas' || (igVista === 'follow' ? x.follow : igVista === 'enlace' ? x.c.enlaceAgenda && x.e.k !== 'agendo' : x.e.k === igVista))
    .filter(x => !qq || n([x.c.usuario, x.c.nombre, x.lead && x.lead.nombre].join(' ')).includes(qq))
    .sort((a, b) => igVista === 'follow' ? ms(a.c.ultimoOut) - ms(b.c.ultimoOut) : b.act - a.act);
  const paso = (iso, txt) => iso ? `<span title="${fecha(iso)}">${txt} · ${hace(iso)}</span>` : `<span class="no">${txt}</span>`;
  $('igList').innerHTML = ls.map(({ c, lead, e }) => {
    const u = igNorm(c.usuario);
    return `<article class="ig-card ${e.k}">
      <div class="ig-who"><b>${u ? '@' + esc(u) : 'Sin usuario'}</b><span>${esc(c.nombre)}</span>${c.setter ? `<span class="tag etapa">${esc(c.setter)}</span>` : ''}
        <div style="margin-top:6px"><span class="st ${e.k}">${e.t}</span>${lead && !lead.autoagenda ? ' <span class="st biblio">📚 En la biblioteca</span>' : ''}</div></div>
      <a class="ig-open" href="${u ? 'https://ig.me/m/' + encodeURIComponent(u) : 'https://www.instagram.com/direct/inbox/'}" target="_blank" rel="noopener">Abrir chat</a>
      <div class="ig-pasos">${paso(c.propuesta, '📞 Propuesta')}${paso(c.enlaceAgenda, '📅 Enlace agenda')}${paso(c.enlaceBiblio, '📚 Enlace biblioteca')}
        <span class="${c.followups ? '' : 'no'}">🔁 ${c.followups} follow-up${c.followups === 1 ? '' : 's'}${c.ultimoFollow ? ' · último ' + hace(c.ultimoFollow) : ''}</span></div>
      <div class="ig-last">${esc(c.ultimo)}<small>${hace(Math.max(ms(c.ultimoIn), ms(c.ultimoOut)) ? new Date(Math.max(ms(c.ultimoIn), ms(c.ultimoOut))).toISOString() : '')}</small></div>
    </article>`;
  }).join('');
  $('igEmpty').hidden = ls.length > 0;
  $('igEmpty').textContent = D.ig.length ? 'No hay conversaciones que coincidan.' : 'Aún no ha llegado ninguna conversación de Instagram (ver crm/INSTAGRAM.md para conectarlo).';
}
$('igViews').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  igVista = b.dataset.v;
  $('igViews').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  pintarIg();
});
$('igQ').addEventListener('input', e => { igQ = e.target.value.trim(); pintarIg(); });
$('igSetter').addEventListener('change', e => { igSetter = e.target.value; pintarIg(); });
$('igLinks').addEventListener('click', async e => {
  const b = e.target.closest('[data-copy]'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast('Enlace copiado'); } catch (err) { toast(b.dataset.copy); }
});

// ---------- Eventos de la tabla ----------
const idDe = el => el.closest('tr')?.dataset.id;

$('rows').addEventListener('change', e => {
  const el = e.target;
  if (el.tagName !== 'SELECT') return;
  const id = idDe(el), campo = el.dataset.f, val = el.value;
  el.blur();
  let cambios = { [campo]: val };
  if (campo === 'caller') {
    const l = D.leads.find(x => x.id === id);
    if (!l) return;
    // maestro: corregir un autoagendado (lo agendó un caller en llamada) o marcarlo como autoagendado
    if (val === '__auto') {
      if (!confirm(`¿Marcar a ${l.nombre} como autoagendado? Se le quita el caller y no contará para nadie.`)) return render();
      cambios = { autoagenda: 'Sí' };
    } else if (l.autoagenda && val) {
      if (!confirm(`¿${l.nombre} lo agendó ${val} en llamada? Dejará de ser autoagendado, contará como agenda de ${val} y quedará fijo (🔒).`)) return render();
      cambios = { caller: val, autoagenda: '', fijo: val };
    } else if (l.fijo && val !== l.caller && !confirm(val ? `Este lead lo agendó ${l.fijo} en llamada. ¿Pasárselo a ${val}?` : `¿Quitar el caller (${l.fijo}) a este lead agendado en llamada?`)) return render();
  }
  // al elegir estado, si nadie lo había marcado como contactado, se marca solo
  // «Contactado» = le has llamado (cuenta un intento), NO que haya respondido: eso es la columna Respondió (✅)
  if (campo === 'estado' && val && val !== 'Invalid') {
    const l = D.leads.find(x => x.id === id);
    if (l && val === 'Contactado' && l.intentos < 1) cambios.intentos = 1;
    if (l && l.contacto !== '✅' && /Seguimiento|Agendado|Nutricion/.test(val)) cambios.contacto = '✅';
  }
  guardar(id, cambios);
});

$('rows').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ficha) return abrirFicha(b.dataset.ficha);
  const id = idDe(b), l = D.leads.find(x => x.id === id);
  if (!l) return;
  if (b.dataset.f === 'contacto') guardar(id, { contacto: l.contacto === '✅' ? '❌' : '✅' });
  if (b.dataset.f === 'intentos') guardar(id, { intentos: Math.max(0, Math.min(99, l.intentos + Number(b.dataset.d))) });
});

$('rows').addEventListener('input', e => { if (e.target.tagName === 'TEXTAREA') autoalto(e.target); });
$('rows').addEventListener('focusout', e => {
  const t = e.target;
  if (t.tagName === 'TEXTAREA') {
    const id = idDe(t), l = D.leads.find(x => x.id === id);
    if (l && t.value.trim() !== l.notas) guardar(id, { notas: t.value.trim() }).then(ok => ok && toast('Nota guardada'));
  }
  setTimeout(() => { if (pendienteRender) render(); }, 0);
});
$('rows').addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.target.blur();
});

// ---------- Filtros ----------
$('q').addEventListener('input', e => { q = e.target.value.trim(); render(); });
$('fEstado').addEventListener('change', e => { fEstado = e.target.value; render(); });
$('fCanal').addEventListener('change', e => { fCanal = e.target.value; render(); });
$('views').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  vista = b.dataset.v;
  $('views').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  render();
});

// ---------- Estado de conexión y avisos ----------
function live(ok, msg) {
  $('live').classList.toggle('off', !ok);
  $('liveText').textContent = ok ? (DEMO ? 'Demo' : 'En directo') : 'Sin conexión';
  $('live').title = ok ? '' : msg || '';
}
let tt;
function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 3200);
}

// cada segundo: cuentas atrás y "hace X min" sin repintar toda la tabla
setInterval(() => {
  if ($('app').hidden) return;
  document.querySelectorAll('#rows tr').forEach(tr => {
    const l = D.leads.find(x => x.id === tr.dataset.id);
    const td = tr.querySelector('.when');
    if (!l || !td) return;
    const html = `<b>${hace(l.fecha)}</b><small>${fecha(l.fecha)}</small>${urgencia(l)}`;
    if (td.innerHTML !== html) td.innerHTML = html;
  });
  if (!DEMO && ultimo) $('liveText').textContent = `En directo · ${Math.round((Date.now() - ultimo) / 1000)} s`;
}, 1000);

// ---------- Modo demostración (sin API_URL) ----------
function demoApi(action, extra) {
  const min = m => new Date(Date.now() - m * 60000).toISOString();
  if (!window.__demo) {
    const P = ['Empiezo desde cero y quiero aprender', 'Tengo conocimientos básicos, pero ningún canal con resultados', 'Ya he empezado y tengo canales funcionando', 'Tengo canales, pero se han estancado'];
    const O = ['Dejar mi empleo y vivir de YouTube', 'Un ingreso extra que no me quite mucho tiempo', 'Empezar como extra y pasar a tiempo completo', 'Construir un activo que genere ingresos pasivos'];
    const I = ['Entre 200 y 400 € al mes', 'Menos de 100 € al mes', 'Entre 400 y 800 € al mes', 'Entre 100 y 200 € al mes', 'Más de 800 € al mes'];
    const base = [
      ['Laura Gómez', '+34 634 21 88 90', 'laura.gomez@gmail.com', 1.5, '', '', '❌', 0, ''],
      ['Iván Castro', '612 448 301', 'ivancastro@hotmail.com', 9, '', '', '❌', 0, ''],
      ['Brayan Ruiz', '+57 312 290 1250', 'colombiaa0220@gmail.com', 45, 'Mario.e', 'Seguimiento', '✅', 1, 'Contactar 24/08. Le interesa el nicho de historia.'],
      ['Alain Martin', '695300210', 'amartin990@gmail.com', 180, '', 'Agendado', '❌', 0, '📅 Autoagendado por Calendly · Llamada 03/10 18:00'],
      ['Sara Cortés', '611491664', 'saracortesochoa07@gmail.com', 300, 'Mario.e', 'Volver a llamar', '✅', 1, 'Ahora no puede, llamar a las 19:00'],
      ['Juan David Ospina', '+52 55 4260 5004', 'juan.ospina.ruda@gmail.com', 1500, 'Mario.e', 'Perdido', '✅', 1, 'No tiene dinero'],
      ['Mikel Portera', '+34 603 31 19 51', 'porteraso44@gmail.com', 2000, 'Mario.e', 'Volver a llamar', '✅', 1, 'Me dice que le llame después'],
      ['Ignacio Benjumea', '+34 608 17 36 57', 'nbenjumealozano@gmail.com', 300, 'Mario.e', 'Agendado', '✅', 2, 'Llamada con el closer el jueves'],
      ['Amparo Malo', '622918365', 'amparomalo1965@gmail.com', 4400, 'Mario.e', 'Contactado', '❌', 2, ''],
    ];
    window.__demo = {
      callers: ['Mario.e'],
      estados: ['Contactado', 'Volver a llamar', 'Seguimiento', 'Perdido', 'Nutricion', 'Agendado', 'Invalid'],
      minutos: 5,
      leads: base.map((b, i) => ({
        id: 'demo' + i, nombre: b[0], telefono: b[1], correo: b[2], fecha: min(b[3]),
        caller: b[4], estado: b[5], contacto: b[6], intentos: b[7], notas: b[8],
        punto: P[i % 4], objetivo: O[i % 4], inversion: I[i % 5],
        meta: 'Generar un ingreso extra para poder dejar horas del trabajo.', cuando: i % 3 ? 'En las próximas semanas' : 'Lo antes posible',
        instagram: i % 2 ? '' : '@' + b[0].split(' ')[0].toLowerCase(),
        origen: ['utm_source=youtube&utm_content=video-nichos-historia', 'utm_source=youtube', 'utm_source=manychat&utm_campaign=GUIA', 'utm_source=youtube&utm_content=video-nichos-historia', '', 'utm_source=instagram', 'utm_source=youtube&utm_content=rpm-alto', 's=mario&utm_source=ig_dm', 'utm_source=manychat&utm_campaign=GUIA'][i],
        cualifica: i === 0 || i === 2 || i === 3, autoagenda: i === 3 ? 'Llamada 03/10 18:00' : '',
        asignado: b[4] ? min(b[3] - 1) : '',
        embudo: ['', '', 'Conversación', '', 'Conversación', '', 'Oferta llamada', 'Oferta llamada', 'Conversación'][i],
        rellamar: i === 4 ? min(5) : i === 6 ? new Date(Date.now() + 150 * 60000).toISOString() : '',
        notasLlamada: i === 2 ? 'Situación: trabaja en hostelería, 0 experiencia en YouTube\nTemporalidad: quiere empezar este mes\nObjetivo / visión: ingreso extra en 6 meses y dejar turnos de noche\nPuente: le falta método y constancia\nTiempo y dinero: 1 h al día · 200-400 €/mes\nOferta: le encaja, lo habla con su pareja' : '',
        closer: [3, 7].includes(i) ? 'Mario.e' : '', closerEstado: i === 7 ? 'Seguimiento' : i === 3 ? 'Confirma' : '',
        closerNotas: i === 7 ? 'Muy interesado, duda por el precio' : '', linkLlamada: i === 7 ? 'https://fathom.video/share/demo' : '',
        conclusiones: i === 7 ? '🤖 Fathom: Quiere empezar en noviembre.\nLe preocupa el tiempo que necesita a la semana.\nSe lo piensa: rellamar el viernes.' : '',
        diaAgenda: i === 3 ? new Date(Date.now() + 26 * 3600e3).toISOString() : i === 7 ? min(1440) : '', fuente: '', confirmada: i === 3 ? 'Sí' : '',
        grabaciones: i === 2 ? [{ archivo: 'demo-a', fecha: min(40), por: 'Mario.e', mb: 18.4, tipo: 'audio/mp4' }] : [],
      })),
    };
  }
  if (!window.__demo.pipeline) window.__demo.pipeline = { estados: ['Sin contactar', 'Contactado', 'Respondió', 'Confirma', 'Ghost', 'Asiste', 'Cancela', 'Pagado', 'Seguimiento', 'Reagenda', 'No cierra', 'Plan de acción'],
    fuentes: ['SETTING', 'COLD', 'YT', 'IG'], closers: ['Mario.e'], acceso: [{ nombre: 'Mario.e', on: true }], porDefecto: 'Mario.e' };
  if (!window.__demo.setting) {
    const d = i => { const x = new Date(); x.setDate(x.getDate() - i); return diaKey(x); };
    window.__demo.setting = { callers: [{ nombre: 'Mario.e', on: true }], dias: [
      [0, 18, 9, 3, 1, 4, 2], [1, 32, 14, 5, 2, 6, 3], [2, 25, 11, 4, 1, 5, 3], [4, 40, 17, 6, 3, 7, 4],
    ].map(r => ({ dia: d(r[0]), caller: 'Mario.e', abiertos: r[1], convos: r[2], ofertas: r[3], agendas: r[4], ofertasBib: r[5], entradasBib: r[6] })) };
  }
  if (!window.__demo.ig) {
    const h = x => new Date(Date.now() - x * 3600e3).toISOString();
    window.__demo.setters = [{ nombre: 'Mario.e', clave: '🙌🏼', slug: 'mario' }];
    window.__demo.enlacesCaller = [{ nombre: 'Mario.e', slug: 'mario' }];
    window.__demo.leads[7].fijo = 'Mario.e';
    window.__demo.leads[0].instagram = '@laura.gz';
    window.__demo.leads[3].instagram = 'alainmartin'; window.__demo.leads[3].setter = 'Mario.e'; window.__demo.leads[3].agendadoEl = h(2);
    window.__demo.ig = [
      { igsid: '1', usuario: 'laura.gz', nombre: 'Laura Gómez', setter: 'Mario.e', asignado: h(30), respondio: h(29), propuesta: h(26), enlaceAgenda: '', enlaceBiblio: h(26), ultimoOut: h(26), ultimoIn: h(0.2), visto: h(0.2), followups: 0, ultimoFollow: '', ultimo: '👤 Vale, ya he entrado. ¿Y la llamada cuándo sería?' },
      { igsid: '2', usuario: 'ivan_c.yt', nombre: 'Iván', setter: 'Mario.e', asignado: h(50), respondio: h(49), propuesta: h(47), enlaceAgenda: h(46), enlaceBiblio: '', ultimoOut: h(30), ultimoIn: h(46), visto: h(29), followups: 1, ultimoFollow: h(30), ultimo: '💬 ¿Has podido agendar la llamada? Te dejo el enlace otra vez' },
      { igsid: '3', usuario: 'carla.faceless', nombre: 'Carla', setter: 'Mario.e', asignado: h(6), respondio: h(5), propuesta: h(4), enlaceAgenda: '', enlaceBiblio: '', ultimoOut: h(4), ultimoIn: h(5), visto: '', followups: 0, ultimoFollow: '', ultimo: '💬 Genial 🙌🏼 ¿Te parecería bien tener una llamada con mi socio de admisiones?' },
      { igsid: '4', usuario: 'alainmartin', nombre: 'Alain Martin', setter: 'Mario.e', asignado: h(20), respondio: h(19), propuesta: h(18), enlaceAgenda: h(17), enlaceBiblio: '', ultimoOut: h(17), ultimoIn: h(3), visto: h(3), followups: 0, ultimoFollow: '', ultimo: '👤 Hecho, el jueves a las 18:00' },
    ];
  }
  const db = window.__demo;
  const esMaestro = /^mario$/i.test(S.caller || '');
  if (action === 'login') return Promise.resolve({ ok: true, caller: esMaestro ? 'Mario' : (db.callers.find(c => c.toUpperCase() === (S.caller || '').toUpperCase()) || 'Mario.e'), rol: esMaestro ? 'maestro' : 'caller' });
  if (action === 'list') {
    const r = JSON.parse(JSON.stringify(db));
    const yo = db.setting.callers.find(c => c.nombre.toUpperCase() === (S.caller || '').toUpperCase());
    if (!esMaestro) { r.setters = r.setters.filter(x => mismo(x.nombre, S.caller)); r.ig = r.ig.filter(c => mismo(c.setter, S.caller)); r.enlacesCaller = r.enlacesCaller.filter(x => mismo(x.nombre, S.caller)); }
    const pa = db.pipeline.acceso.find(c => mismo(c.nombre, S.caller));
    r.pipeline = esMaestro ? { on: true, ...r.pipeline } : { ...r.pipeline, acceso: undefined, on: !!(pa && pa.on) };
    if (!esMaestro) r.leads.forEach(l => { if (!mismo(l.closer, S.caller)) Object.assign(l, { closerNotas: '', conclusiones: '', linkLlamada: '' }); });
    r.setting = esMaestro ? { on: true, ...r.setting } : yo && yo.on ? { on: true, dias: r.setting.dias.filter(x => x.caller === yo.nombre) } : { on: false, dias: [] };
    return Promise.resolve({ ok: true, rol: esMaestro ? 'maestro' : 'caller', ...r });
  }
  if (action === 'ideas') {
    if (!window.__demo.ideas) {
      const h = x => new Date(Date.now() - x * 3600e3).toISOString();
      window.__demo.ideas = [
        { n: 1, fecha: h(70), de: 'Mario', autor: 'Mario', canal: 'Telegram', categoria: 'Funnel', titulo: 'Quiz antes del formulario', paraQue: 'Cualificar mejor y que lleguen a la llamada con el problema claro.', idea: 'Antes del formulario, 4 preguntas tipo test que le digan en qué punto está y qué nicho le encaja. Al final, el formulario de siempre.', paso: 'Escribir las 4 preguntas y los 3 resultados posibles.', prioridad: 'Alta', estado: 'Nueva', original: '🎙️ Oye, se me ha ocurrido poner un quiz antes del formulario…' },
        { n: 2, fecha: h(30), de: 'Mario', autor: 'Mario', canal: 'Telegram', categoria: 'Contenido', titulo: 'Reel: «no tengo tiempo»', paraQue: 'Atacar la objeción más repetida en las llamadas y traer leads de Instagram.', idea: 'Reel enseñando la semana real de alguien que lo hace con 1 hora al día, con palabra clave de ManyChat para la guía.', paso: 'Guion de 70 s con el formato de dolor → solución.', prioridad: 'Media', estado: 'En marcha', original: 'Reel sobre la objeción del tiempo' },
        { n: 3, fecha: h(5), de: 'Mario', autor: 'Mario', canal: 'Telegram', categoria: 'Ventas', titulo: 'Recordatorio WhatsApp 1 h antes', paraQue: 'Bajar los no-shows de las llamadas.', idea: 'Mensaje del caller una hora antes de la llamada con el enlace y una pregunta para que conteste.', paso: 'Redactar el mensaje y probarlo una semana.', prioridad: 'Alta', estado: 'Nueva', original: 'Mandar recordatorio por WhatsApp una hora antes' },
        { n: 4, fecha: h(20), de: 'Equipo', autor: 'Aleix', canal: 'Slack', categoria: 'Formación', titulo: 'Plantilla de guion en Skool', paraQue: 'Que los alumnos publiquen antes su primer vídeo.', idea: 'Una plantilla de guion rellenable dentro del módulo 2.', paso: 'Pasar la plantilla que usamos nosotros a Skool.', prioridad: 'Media', estado: 'Nueva', original: 'Subir la plantilla de guion a Skool' },
        { n: 5, fecha: h(90), de: 'Equipo', autor: 'Mario.e', canal: 'Slack', categoria: 'Ventas', titulo: 'Guion para la objeción del precio', paraQue: 'Cerrar más llamadas que se quedan en «me lo pienso».', idea: 'Tres respuestas cortas a «es mucho dinero» con ejemplos del propio lead.', paso: 'Escribirlas y probarlas en las llamadas de esta semana.', prioridad: 'Baja', estado: 'Hecha', original: '' },
      ];
    }
    return Promise.resolve({ ok: true, ideas: JSON.parse(JSON.stringify(window.__demo.ideas)), categorias: ['Funnel', 'Contenido', 'Ventas', 'Formación', 'Marketing', 'Equipo', 'Tecnología', 'Otros'], estados: ['Nueva', 'En marcha', 'Hecha', 'Descartada'], prioridades: ['Alta', 'Media', 'Baja'] });
  }
  if (action === 'ideaEditar') { const x = window.__demo.ideas.find(i => i.n === extra.n); ['estado', 'prioridad', 'categoria'].forEach(k => { if (extra[k]) x[k] = extra[k]; }); return Promise.resolve({ ok: true, idea: x }); }
  if (action === 'setting') { Object.assign(diaSet(db.setting, extra.dia, S.caller), extra.cambios); return Promise.resolve({ ok: true }); }
  if (action === 'closerOn') { db.pipeline.acceso.find(c => c.nombre === extra.para).on = extra.on; return Promise.resolve({ ok: true }); }
  if (action === 'settingOn') { db.setting.callers.find(c => c.nombre === extra.para).on = extra.on; return Promise.resolve({ ok: true }); }
  if (action === 'grabacion') {
    const l = db.leads.find(x => x.id === extra.id);
    if (extra.parte * TROZO + TROZO < extra.total) return new Promise(r => setTimeout(() => r({ ok: true, sube: 'demo', sigue: true }), 300));
    const archivo = 'demo' + Date.now();
    l.grabaciones = [...(l.grabaciones || []), { archivo, fecha: new Date().toISOString(), por: S.caller, mb: Math.round(extra.total / 104857.6) / 10, tipo: extra.tipo }];
    return new Promise(r => setTimeout(() => r({ ok: true, archivo, lead: { ...l } }), 300));
  }
  if (action === 'borrarGrabacion') {
    const l = db.leads.find(x => x.id === extra.id);
    l.grabaciones = (l.grabaciones || []).filter(g => g.archivo !== extra.archivo);
    return new Promise(r => setTimeout(() => r({ ok: true, lead: { ...l } }), 250));
  }
  if (action === 'audio') return Promise.reject(new Error('En la demo no hay audio real'));
  if (action === 'update') {
    const l = db.leads.find(x => x.id === extra.id);
    const c = { ...extra.cambios };
    if (!esMaestro && (l.fijo && 'caller' in c && c.caller !== l.caller)) return Promise.reject(new Error(`Este lead lo agendó ${l.fijo} en llamada: solo Mario puede cambiar el caller`));
    if ('autoagenda' in c) { if (c.autoagenda) Object.assign(c, { autoagenda: 'Marcado a mano', caller: '', fijo: '', estado: 'Agendado' }); else if (c.caller) Object.assign(c, { fijo: c.caller, estado: 'Agendado' }); }
    else if (esMaestro && 'caller' in c && l.fijo) c.fijo = c.caller;
    if (c.closerEstado === 'Confirma' && !('confirmada' in c)) c.confirmada = 'Sí';
    if (c.confirmada === 'Sí' && !('closerEstado' in c) && ANTES_LLAMADA.includes(l.closerEstado || '')) c.closerEstado = 'Confirma';
    if ('diaAgenda' in c && !('confirmada' in c) && c.diaAgenda !== l.diaAgenda) c.confirmada = '';
    Object.assign(l, c);
    return new Promise(r => setTimeout(() => r({ ok: true, lead: { ...l } }), 250));
  }
  return Promise.reject(new Error('Acción desconocida'));
}

// ---------- Arranque ----------
S = leerSesion();
if (DEMO && !S) S = { caller: 'Mario.e', pin: 'demo' };
if (S) entrar(); else mostrarLogin();

// ---------- App instalable (PWA) ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Al volver a la app (el iPhone congela los temporizadores en segundo plano) → datos frescos al momento
document.addEventListener('visibilitychange', () => { if (!document.hidden && S && !$('app').hidden && Date.now() - ultimo > 5000) cargar(); });

// En Safari del iPhone/iPad, explicar cómo añadirla a la pantalla de inicio (una vez cerrado, no vuelve a salir)
(() => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const app = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let visto = false;
  try { visto = localStorage.getItem('sa-crm-instalar') === '1'; } catch (e) {}
  if (!ios || app || visto) return;
  $('instalar').hidden = false;
  $('instalarX').addEventListener('click', () => {
    $('instalar').hidden = true;
    try { localStorage.setItem('sa-crm-instalar', '1'); } catch (e) {}
  });
})();
