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
  render();
  try {
    const r = await api('update', { id, cambios });
    Object.keys(local).forEach(k => { if (pendientes[id]) delete pendientes[id][k]; });
    if (pendientes[id] && !Object.keys(pendientes[id]).length) delete pendientes[id];
    Object.assign(l, r.lead, pendientes[id] || {});
    render();
    return true;
  } catch (err) {
    Object.assign(l, antes);
    delete pendientes[id];
    render();
    toast('No se ha guardado: ' + err.message, true);
    return false;
  }
}

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
    .filter(l => vista !== 'buen' || buenForm(l))
    .filter(l => vista !== 'rellamar' || l.rellamar)
    .filter(l => vista !== 'prio' || !cerrado(l))
    .filter(l => vista !== 'espana' || espana(l))
    .filter(l => vista !== 'llamar' || (l.contacto !== '✅' && !l.autoagenda && l.estado !== 'Agendado'))
    .filter(l => vista !== 'mios' || l.caller.toUpperCase() === S.caller.toUpperCase())
    .filter(l => vista !== 'sin' || !l.caller)
    .filter(l => !fCanal || canalDe(l) === fCanal)
    .filter(l => !fEstado || (fEstado === '__nuevo' ? !l.estado : l.estado === fEstado))
    .filter(l => !qq || n([l.nombre, l.telefono, l.correo, l.notas, l.punto, l.objetivo].join(' ')).includes(qq))
    .sort((a, b) => {
      // primero los que piden que les llamen ya (por hora), luego por fecha de registro
      if (vista === 'rellamar') return rellamarEn(a) - rellamarEn(b);
      if (vista === 'prio' && prioridad(a) !== prioridad(b)) return prioridad(a) - prioridad(b);
      const ta = tocaLlamar(a), tb = tocaLlamar(b);
      if (ta !== tb) return ta ? -1 : 1;
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
  const porLlamar = L.filter(l => l.contacto !== '✅' && !l.autoagenda && l.estado !== 'Agendado').length;
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
    k('Por llamar', porLlamar, urgentes ? `${urgentes} en la última hora sin llamar` : 'Ninguno urgente', urgentes ? 'hot' : '') +
    k('En seguimiento', seg, 'Seguimiento y volver a llamar') +
    k('Agendados', agend, auto ? `${auto} autoagendados por Calendly` : 'Llamadas con el closer') +
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
    <td data-label="Contacto"><button type="button" class="contact ${l.contacto === '✅' ? 'yes' : 'no'}" data-f="contacto" aria-label="Contactado: ${l.contacto === '✅' ? 'sí' : 'no'}">${l.contacto === '✅' ? '✅' : '❌'}</button></td>
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
    ${row('Canal', CANALES[canalDe(l)])}
    ${row('Origen', (o => o.nombre + (o.etiqueta ? ' · ' + o.etiqueta : '') + (l.setter ? ' · setter ' + l.setter : ''))(origenDe(l)))}`;
  $('drawer').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
}
// ---------- Notas llamada y grabaciones ----------
const PLANTILLA = 'Situación: \nObjetivo: \nObjeciones: \nPresupuesto: \nResultado: \nPróximo paso: ';
const audios = {};                 // archivo → URL del audio ya descargado (para no bajarlo dos veces)
let subiendo = null;               // { id, txt } mientras se sube una grabación
const puedeGrabar = l => S.rol === 'maestro' || !l.caller || l.caller.toUpperCase() === S.caller.toUpperCase();
function bloqueLlamada(l) {
  const grabs = l.grabaciones || [];
  const lista = grabs.map(g => `<li data-archivo="${esc(g.archivo)}"><span>${fecha(g.fecha)} · ${esc(g.por)}${g.mb ? ' · ' + g.mb + ' MB' : ''}</span>
    ${audios[g.archivo] ? `<audio controls preload="metadata" src="${audios[g.archivo]}"></audio>`
      : puedeGrabar(l) ? `<button type="button" class="mini" data-oir="${esc(g.archivo)}">▶ Escuchar</button>` : ''}</li>`).join('');
  const sub = subiendo && subiendo.id === l.id;
  return `<div class="kv llamada"><small>📝 Notas llamada <button type="button" class="mini" data-plantilla>Plantilla</button></small>
      <textarea data-ll="${esc(l.id)}" rows="7" placeholder="Puntos importantes de la llamada: situación, objeciones, resultado, próximo paso…">${esc(l.notasLlamada)}</textarea></div>
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

function cerrarFicha() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
$('drawer').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) return cerrarFicha();
  if (e.target.closest('[data-plantilla]')) {
    const t = $('dBody').querySelector('[data-ll]');
    if (t && !t.value.trim()) t.value = PLANTILLA;
    return t && t.focus();
  }
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
  if (l.intentos > 0) return 1;
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
function calcKpis(leads, desde) {
  const por = {};
  leads.forEach(l => {
    if (!l.caller || l.autoagenda) return;
    const f = new Date(l.asignado || l.fecha);
    if (!(f >= desde)) return;
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
  const todos = calcKpis(D.leads, desdePeriodo(periodo));
  (D.callers || []).forEach(n => { if (!todos.some(c => c.nombre.toUpperCase() === n.toUpperCase())) todos.push({ nombre: n, n: [0, 0, 0, 0, 0, 0], llamadas: 0 }); });
  const yo = todos.find(c => c.nombre.toUpperCase() === S.caller.toUpperCase()) || { nombre: S.caller, n: [0, 0, 0, 0, 0, 0], llamadas: 0 };
  const equipo = todos.reduce((t, c) => { c.n.forEach((v, i) => t.n[i] += v); t.llamadas += c.llamadas; return t; }, { nombre: 'Equipo', n: [0, 0, 0, 0, 0, 0], llamadas: 0 });
  const sel = maestro ? (todos.find(c => c.nombre === kSel) || equipo) : yo;
  const txtPer = { hoy: 'hoy', 7: 'últimos 7 días', 30: 'últimos 30 días', todo: 'desde el principio' }[periodo];

  $('kTitle').textContent = maestro ? 'KPIs del equipo' : `Tus KPIs · ${S.caller}`;
  $('kSub').textContent = maestro ? `Solo tú ves esta vista · ${txtPer}` : `Sobre los leads que te has asignado · ${txtPer}`;
  const tile = (label, val, sub, cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b>${val}</b><span>${sub}</span></div>`;
  const n = sel.n;
  const auto = maestro ? D.leads.filter(l => l.autoagenda && new Date(l.fecha) >= desdePeriodo(periodo)).length : 0;
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
}
$('periodo').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  periodo = b.dataset.p;
  $('periodo').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  pintarKpisVista();
});
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
  if (pestana === 'enlaces') pintarEnlaces();
  if (pestana === 'kpis') pintarKpisVista();
  if (pestana === 'setting') pintarSetting();
  if (pestana === 'ig') pintarIg();
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
  if (campo === 'estado' && val && val !== 'Invalid') {
    const l = D.leads.find(x => x.id === id);
    if (l && l.contacto !== '✅' && /Contactado|Seguimiento|Agendado|Perdido|Nutricion/.test(val)) cambios.contacto = '✅';
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
        notasLlamada: i === 2 ? 'Situación: trabaja en hostelería, 0 experiencia en YouTube\nObjetivo: ingreso extra en 6 meses\nObjeciones: precio, poco tiempo\nPresupuesto: 200-400 €/mes\nResultado: lo piensa\nPróximo paso: rellamar el jueves' : '',
        grabaciones: i === 2 ? [{ archivo: 'demo-a', fecha: min(40), por: 'Mario.e', mb: 18.4, tipo: 'audio/mp4' }] : [],
      })),
    };
  }
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
    r.setting = esMaestro ? { on: true, ...r.setting } : yo && yo.on ? { on: true, dias: r.setting.dias.filter(x => x.caller === yo.nombre) } : { on: false, dias: [] };
    return Promise.resolve({ ok: true, rol: esMaestro ? 'maestro' : 'caller', ...r });
  }
  if (action === 'setting') { Object.assign(diaSet(db.setting, extra.dia, S.caller), extra.cambios); return Promise.resolve({ ok: true }); }
  if (action === 'settingOn') { db.setting.callers.find(c => c.nombre === extra.para).on = extra.on; return Promise.resolve({ ok: true }); }
  if (action === 'grabacion') {
    const l = db.leads.find(x => x.id === extra.id);
    if (extra.parte * TROZO + TROZO < extra.total) return new Promise(r => setTimeout(() => r({ ok: true, sube: 'demo', sigue: true }), 300));
    const archivo = 'demo' + Date.now();
    l.grabaciones = [...(l.grabaciones || []), { archivo, fecha: new Date().toISOString(), por: S.caller, mb: Math.round(extra.total / 104857.6) / 10, tipo: extra.tipo }];
    return new Promise(r => setTimeout(() => r({ ok: true, archivo, lead: { ...l } }), 300));
  }
  if (action === 'audio') return Promise.reject(new Error('En la demo no hay audio real'));
  if (action === 'update') {
    const l = db.leads.find(x => x.id === extra.id);
    const c = { ...extra.cambios };
    if (!esMaestro && (l.fijo && 'caller' in c && c.caller !== l.caller)) return Promise.reject(new Error(`Este lead lo agendó ${l.fijo} en llamada: solo Mario puede cambiar el caller`));
    if ('autoagenda' in c) { if (c.autoagenda) Object.assign(c, { autoagenda: 'Marcado a mano', caller: '', fijo: '', estado: 'Agendado' }); else if (c.caller) Object.assign(c, { fijo: c.caller, estado: 'Agendado' }); }
    else if (esMaestro && 'caller' in c && l.fijo) c.fijo = c.caller;
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
