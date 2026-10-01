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
let D = { leads: [], callers: [], estados: [], minutos: 5 };
let vista = 'todos', fEstado = '', q = '';
let pestana = 'leads', periodo = 'hoy', kSel = '';   // KPIs: periodo y caller seleccionado (maestro)
let conocidos = null;              // ids ya vistos (para avisar de leads nuevos)
let ultimo = 0, timer = 0, pendienteRender = false;
const pendientes = {};             // id → { campo: valor } mientras se guarda

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
  guardarSesion(null); S = null; clearInterval(timer); conocidos = null;
  mostrarLogin();
});

async function entrar() {
  $('login').hidden = true;
  $('app').hidden = false;
  $('demo').hidden = !DEMO;
  const maestro = S.rol === 'maestro';
  $('me').textContent = maestro ? `${S.caller} · Maestro` : S.caller;
  $('tabKpis').textContent = maestro ? 'KPIs del equipo' : 'Mis KPIs';
  document.querySelector('#views [data-v="mios"]').hidden = maestro;
  await cargar();
  clearInterval(timer);
  timer = setInterval(cargar, REFRESCO);
}

// ---------- Datos ----------
async function cargar() {
  try {
    const r = await api('list');
    // lo que se está guardando manda sobre lo que llega del servidor
    r.leads.forEach(l => Object.assign(l, pendientes[l.id] || {}));
    const nuevos = conocidos ? r.leads.filter(l => !conocidos.has(l.id)) : [];
    conocidos = new Set(r.leads.map(l => l.id));
    D = r;
    if (r.rol && S.rol !== r.rol) { S.rol = r.rol; guardarSesion(S); }
    ultimo = Date.now();
    if (!$('fEstado').dataset.ok || $('fEstado').options.length !== D.estados.length + 1) pintarFiltroEstado();
    render();
    if (pestana === 'kpis') pintarKpisVista();
    if (nuevos.length) {
      nuevos.forEach(l => document.querySelector(`tr[data-id="${CSS.escape(l.id)}"]`)?.classList.add('flash'));
      toast(nuevos.length === 1 ? `🔥 Nuevo lead: ${nuevos[0].nombre}` : `🔥 ${nuevos.length} leads nuevos`);
      if (document.hidden) document.title = `(${nuevos.length}) Nuevo lead · CRM`;
    }
    live(true);
  } catch (err) {
    if (/PIN|intentos/i.test(err.message)) { guardarSesion(null); clearInterval(timer); return mostrarLogin(err.message); }
    live(false, err.message);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'CRM · System Academy'; });

async function guardar(id, cambios) {
  const l = D.leads.find(x => x.id === id);
  if (!l) return;
  const antes = {};
  Object.keys(cambios).forEach(k => { antes[k] = l[k]; });
  Object.assign(l, cambios);
  pendientes[id] = { ...(pendientes[id] || {}), ...cambios };
  render();
  try {
    const r = await api('update', { id, cambios });
    Object.keys(cambios).forEach(k => { if (pendientes[id]) delete pendientes[id][k]; });
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
    .filter(l => vista !== 'llamar' || (l.contacto !== '✅' && !l.autoagenda && l.estado !== 'Agendado'))
    .filter(l => vista !== 'mios' || l.caller.toUpperCase() === S.caller.toUpperCase())
    .filter(l => vista !== 'sin' || !l.caller)
    .filter(l => !fEstado || (fEstado === '__nuevo' ? !l.estado : l.estado === fEstado))
    .filter(l => !qq || n([l.nombre, l.telefono, l.correo, l.notas, l.punto, l.objetivo].join(' ')).includes(qq))
    .sort((a, b) => {
      // primero los que piden que les llamen ya (por hora), luego por fecha de registro
      if (vista === 'rellamar') return rellamarEn(a) - rellamarEn(b);
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
  $('rows').innerHTML = ls.map(fila).join('');
  $('empty').hidden = ls.length > 0;
  document.querySelectorAll('#rows textarea').forEach(autoalto);
}

function pintarKpis() {
  const hoy = new Date().toDateString();
  const L = D.leads;
  const deHoy = L.filter(l => new Date(l.fecha).toDateString() === hoy).length;
  const ultimaHora = L.filter(l => Date.now() - new Date(l.fecha) < 3600e3).length;
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
  $('kpis').innerHTML =
    k('Leads hoy', deHoy, `${ultimaHora} en la última hora`) +
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
  const tags = (l.autoagenda ? '<span class="tag auto">📅 Autoagendado</span>' : '') +
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
    <td data-label="Caller">${l.autoagenda
      ? `<span class="pill locked" title="Se agendó él solo por Calendly: no lleva caller">Autoagendado</span>`
      : `<select class="pill caller" data-f="caller" aria-label="Caller">${opciones(D.callers, l.caller, '—')}</select>`}</td>
    <td data-label="Estado"><select class="pill estado" data-e="${slug(l.estado) || 'nuevo'}" data-f="estado" aria-label="Estado">${opciones(D.estados, l.estado, 'Nuevo')}</select></td>
    <td data-label="Contacto"><button type="button" class="contact ${l.contacto === '✅' ? 'yes' : 'no'}" data-f="contacto" aria-label="Contactado: ${l.contacto === '✅' ? 'sí' : 'no'}">${l.contacto === '✅' ? '✅' : '❌'}</button></td>
    <td data-label="Nº intentos"><div class="step"><button type="button" data-f="intentos" data-d="-1" aria-label="Menos">−</button><b>${l.intentos}</b><button type="button" data-f="intentos" data-d="1" aria-label="Más">+</button></div></td>
    <td data-label="Notas" class="notes"><textarea data-f="notas" rows="1" placeholder="Añadir nota…">${esc(l.notas)}</textarea></td>
  </tr>`;
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
    ${row('Buen form', l.cualifica ? 'Sí: encaja con el perfil (se le ofreció agendar)' : '')}
    ${row('Autoagendado por Calendly', l.autoagenda)}
    ${row('Caller', l.autoagenda ? 'Ninguno (autoagendado)' : l.caller)}${row('Estado', l.estado || 'Nuevo')}${row('Notas', l.notas)}
    ${row('Origen', l.origen)}`;
  $('drawer').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
}
function cerrarFicha() { $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); }
$('drawer').addEventListener('click', e => {
  if (e.target.closest('[data-close]')) return cerrarFicha();
  const b = e.target.closest('[data-etapa]');
  if (!b || b.disabled) return;
  const id = b.closest('.pasos').dataset.id;
  const l = D.leads.find(x => x.id === id);
  if (!l) return;
  const n = Number(b.dataset.etapa);
  // pulsar la etapa en la que ya está la deshace (vuelve a la anterior)
  guardar(id, cambiosEtapa(l, n === etapa(l) ? n - 1 : n)).then(() => abrirFicha(id));
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
  if (pestana === 'kpis') pintarKpisVista();
});

// ---------- Eventos de la tabla ----------
const idDe = el => el.closest('tr')?.dataset.id;

$('rows').addEventListener('change', e => {
  const el = e.target;
  if (el.tagName !== 'SELECT') return;
  const id = idDe(el), campo = el.dataset.f, val = el.value;
  el.blur();
  const cambios = { [campo]: val };
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
      ['Brayan Ruiz', '612290125', 'colombiaa0220@gmail.com', 45, 'DAVID', 'Seguimiento', '✅', 1, 'Contactar 24/08. Le interesa el nicho de historia.'],
      ['Alain Martin', '695300210', 'amartin990@gmail.com', 180, '', 'Agendado', '❌', 0, '📅 Autoagendado por Calendly · Llamada 03/10 18:00'],
      ['Sara Cortés', '611491664', 'saracortesochoa07@gmail.com', 300, 'Mario.e', 'Volver a llamar', '✅', 1, 'Ahora no puede, llamar a las 19:00'],
      ['Juan David Ospina', '642605004', 'juan.ospina.ruda@gmail.com', 1500, 'DAVID', 'Perdido', '✅', 1, 'No tiene dinero'],
      ['Mikel Portera', '+34 603 31 19 51', 'porteraso44@gmail.com', 2000, 'Mario.e', 'Volver a llamar', '✅', 1, 'Me dice que le llame después'],
      ['Ignacio Benjumea', '+34 608 17 36 57', 'nbenjumealozano@gmail.com', 300, 'Mario.e', 'Agendado', '✅', 2, 'Llamada con el closer el jueves'],
      ['Amparo Malo', '622918365', 'amparomalo1965@gmail.com', 4400, 'DAVID', 'Contactado', '❌', 2, ''],
    ];
    window.__demo = {
      callers: ['DAVID', 'Mario.e'],
      estados: ['Contactado', 'Volver a llamar', 'Seguimiento', 'Perdido', 'Nutricion', 'Agendado', 'Invalid'],
      minutos: 5,
      leads: base.map((b, i) => ({
        id: 'demo' + i, nombre: b[0], telefono: b[1], correo: b[2], fecha: min(b[3]),
        caller: b[4], estado: b[5], contacto: b[6], intentos: b[7], notas: b[8],
        punto: P[i % 4], objetivo: O[i % 4], inversion: I[i % 5],
        meta: 'Generar un ingreso extra para poder dejar horas del trabajo.', cuando: i % 3 ? 'En las próximas semanas' : 'Lo antes posible',
        instagram: i % 2 ? '' : '@' + b[0].split(' ')[0].toLowerCase(), origen: 'utm_source=instagram',
        cualifica: i === 0 || i === 2 || i === 3, autoagenda: i === 3 ? 'Llamada 03/10 18:00' : '',
        asignado: b[4] ? min(b[3] - 1) : '',
        embudo: ['', '', 'Conversación', '', 'Conversación', '', 'Oferta llamada', 'Oferta llamada', 'Conversación'][i],
        rellamar: i === 4 ? min(5) : i === 6 ? new Date(Date.now() + 150 * 60000).toISOString() : '',
      })),
    };
  }
  const db = window.__demo;
  const esMaestro = /^mario$/i.test(S.caller || '');
  if (action === 'login') return Promise.resolve({ ok: true, caller: esMaestro ? 'Mario' : (db.callers.find(c => c.toUpperCase() === (S.caller || '').toUpperCase()) || 'DAVID'), rol: esMaestro ? 'maestro' : 'caller' });
  if (action === 'list') return Promise.resolve({ ok: true, rol: esMaestro ? 'maestro' : 'caller', ...JSON.parse(JSON.stringify(db)) });
  if (action === 'update') {
    const l = db.leads.find(x => x.id === extra.id);
    Object.assign(l, extra.cambios);
    return new Promise(r => setTimeout(() => r({ ok: true, lead: { ...l } }), 250));
  }
  return Promise.reject(new Error('Acción desconocida'));
}

// ---------- Arranque ----------
S = leerSesion();
if (DEMO && !S) S = { caller: 'DAVID', pin: 'demo' };
if (S) entrar(); else mostrarLogin();
