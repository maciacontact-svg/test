// ===== Configuración (editar aquí) =====
// Tu evento de Calendly (sin ?month=… ni &date=…)
const CALENDLY_URL = 'https://calendly.com/maciacontact/proceso-de-admision-system-academy';
// Después de reservar: página con el vídeo y los pasos para confirmar la llamada
const CONFIRM_PAGE = 'confirmar.html';

// ===== Lógica (la usan llamada.html y agendar.html) =====
const $ = id => document.getElementById(id);
const leer = st => { try { return JSON.parse(st.getItem('sa-lead') || 'null'); } catch (e) { return null; } };

// Enlace de caller (<web>/c/<código> → ?c=<código>): el caller agenda al lead en plena llamada desde SU móvil/ordenador.
// No se usa nada guardado en este navegador (sería del caller, no del lead) y en el CRM queda asignado a ese caller.
const CALLER = (new URLSearchParams(location.search).get('c') || '').trim();
const lead = CALLER ? {} : (leer(sessionStorage) || leer(localStorage) || {});

// Setter que le pasó el enlace por Instagram (systemacademy.es/a/<código> → ?s=<código>)
let setter = CALLER ? '' : new URLSearchParams(location.search).get('s') || '';
try { if (CALLER) {} else if (setter) localStorage.setItem('sa-setter', setter); else setter = localStorage.getItem('sa-setter') || ''; } catch (e) {}

// ===== Origen: por qué enlace ha llegado (YouTube, ManyChat, setter…). Se recuerda en este navegador =====
const ORIGEN = (() => {
  const q = location.search.slice(1);
  if (CALLER) return q;
  try {
    if (/(^|&)(utm_source|s)=/.test(q)) localStorage.setItem('sa-origen', q);
    return /(^|&)(utm_source|s)=/.test(q) ? q : (localStorage.getItem('sa-origen') || '');
  } catch (e) { return q; }
})();

const nombre = String(lead.nombre || '').trim().split(' ')[0];
if (nombre && $('hola')) $('hola').textContent = `Enhorabuena, ${nombre}`;

if (CALLER && $('cal')) {
  const aviso = document.createElement('p');
  aviso.className = 'modo-caller';
  aviso.textContent = '📞 Modo caller: rellena los datos del lead. La llamada quedará en el CRM como agendada por ti.';
  aviso.style.cssText = 'margin:0 0 14px;padding:10px 14px;border-radius:14px;background:#111;color:#fff;font-size:13px;line-height:1.45';
  $('cal').before(aviso);
  if ($('skip')) $('skip').hidden = true;
}

// Calendario de Calendly dentro de la página, con nombre y email ya rellenos
let abierto = false;
function abrirCalendario(scroll = true) {
  $('cal').hidden = false;
  if (scroll) $('cal').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (abierto) return;
  abierto = true;
  const p = new URLSearchParams({
    embed_domain: location.hostname || 'localhost',
    embed_type: 'Inline',
    hide_gdpr_banner: '1',
    background_color: 'ffffff',
    text_color: '111111',
    primary_color: '111111',
  });
  if (lead.nombre) p.set('name', lead.nombre);
  if (lead.correo) p.set('email', lead.correo);
  if (lead.id) p.set('utm_content', lead.id);
  const o = new URLSearchParams(ORIGEN);
  if (o.get('utm_source')) p.set('utm_source', o.get('utm_source'));
  if (o.get('utm_content')) p.set('utm_campaign', o.get('utm_content'));
  $('calBody').innerHTML = `<iframe src="${CALENDLY_URL}?${p}" title="Agendar llamada" loading="lazy"></iframe>`;
}
if ($('open')) $('open').addEventListener('click', () => abrirCalendario());
if (document.body.dataset.calAbierto !== undefined) abrirCalendario(false);

// Calendly avisa a la página cuando se reserva → el lead pasa a "Agendado" en el CRM (sin caller)
// y se le manda a la página de confirmación.
let reservado = false;
window.addEventListener('message', async e => {
  if (e.origin !== 'https://calendly.com' || !e.data || e.data.event !== 'calendly.event_scheduled' || reservado) return;
  reservado = true;
  const pl = e.data.payload || {};
  $('cal').hidden = true;
  ['open', 'skip'].forEach(id => { if ($(id)) $(id).hidden = true; });
  $('booked').hidden = false;
  $('booked').scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (CALLER) {
    // el caller se queda aquí: ve si ha quedado asignado y puede agendar a otro
    const h = $('booked').querySelector('h2'), p = $('booked').querySelector('p');
    h.textContent = 'Llamada agendada';
    p.textContent = 'Guardando en el CRM…';
    const j = await marcarAgendado((pl.event || {}).uri, (pl.invitee || {}).uri);
    p.innerHTML = j && j.ok ? `✅ En el CRM como agendado por <b>${String(j.caller || '').replace(/[&<>]/g, '')}</b>.`
      : `⚠️ No se ha podido guardar en el CRM${j && j.error ? ' (' + String(j.error).replace(/[&<>]/g, '') + ')' : ''}. Avisa a Mario.`;
    const otra = document.createElement('a');
    otra.href = location.pathname + location.search; otra.className = 'skip'; otra.innerHTML = '<b>Agendar a otro lead</b> <span aria-hidden="true">→</span>';
    $('booked').after(otra);
    return;
  }
  await Promise.race([
    marcarAgendado((pl.event || {}).uri, (pl.invitee || {}).uri),
    new Promise(r => setTimeout(r, 5000)),
  ]);
  location.href = CONFIRM_PAGE;
});

async function marcarAgendado(evento, invitado) {
  const url = (window.SA_CONFIG || {}).API_URL;
  if (!url || (!lead.id && !invitado)) return null;
  const body = JSON.stringify({ action: 'agendado', id: lead.id || '', evento: evento || '', invitado: invitado || '', setter: setter, origen: ORIGEN, porCaller: CALLER });
  // reintenta por si el lead aún no se había guardado en el Sheet
  let j = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true });
      j = await r.json();
      if (j.ok || /no válido/.test(j.error || '')) return j;
    } catch (err) { console.error(err); }
    await new Promise(r => setTimeout(r, 1500));
  }
  return j;
}
