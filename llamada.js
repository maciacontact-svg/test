// ===== Configuración (editar aquí) =====
// Tu evento de Calendly (sin ?month=… ni &date=…)
const CALENDLY_URL = 'https://calendly.com/maciacontact/proceso-de-admision-system-academy';
// Después de reservar: página con el vídeo y los pasos para confirmar la llamada
const CONFIRM_PAGE = 'confirmar.html';

// ===== Lógica (la usan llamada.html y agendar.html) =====
const $ = id => document.getElementById(id);
const leer = st => { try { return JSON.parse(st.getItem('sa-lead') || 'null'); } catch (e) { return null; } };
const lead = leer(sessionStorage) || leer(localStorage) || {};

// Setter que le pasó el enlace por Instagram (systemacademy.es/a/<código> → ?s=<código>)
let setter = new URLSearchParams(location.search).get('s') || '';
try { if (setter) localStorage.setItem('sa-setter', setter); else setter = localStorage.getItem('sa-setter') || ''; } catch (e) {}

const nombre = String(lead.nombre || '').trim().split(' ')[0];
if (nombre && $('hola')) $('hola').textContent = `Enhorabuena, ${nombre}`;

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
  await Promise.race([
    marcarAgendado((pl.event || {}).uri, (pl.invitee || {}).uri),
    new Promise(r => setTimeout(r, 5000)),
  ]);
  location.href = CONFIRM_PAGE;
});

async function marcarAgendado(evento, invitado) {
  const url = (window.SA_CONFIG || {}).API_URL;
  if (!url || (!lead.id && !invitado)) return;
  const body = JSON.stringify({ action: 'agendado', id: lead.id || '', evento: evento || '', invitado: invitado || '', setter: setter });
  // reintenta por si el lead aún no se había guardado en el Sheet
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true });
      const j = await r.json();
      if (j.ok || /no válido/.test(j.error || '')) return;
    } catch (err) { console.error(err); }
    await new Promise(r => setTimeout(r, 1500));
  }
}
