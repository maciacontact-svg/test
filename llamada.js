// ===== Configuración (editar aquí) =====
// Tu evento de Calendly (sin ?month=… ni &date=…)
const CALENDLY_URL = 'https://calendly.com/maciacontact/proceso-de-admision-system-academy';

// ===== Lógica =====
const $ = id => document.getElementById(id);
let lead = {};
try { lead = JSON.parse(sessionStorage.getItem('sa-lead') || '{}') || {}; } catch (e) {}

const nombre = String(lead.nombre || '').trim().split(' ')[0];
if (nombre) $('hola').textContent = `Enhorabuena, ${nombre}`;

// Calendario de Calendly dentro de la página, con nombre y email ya rellenos
let abierto = false;
function abrirCalendario() {
  $('cal').hidden = false;
  $('cal').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
$('open').addEventListener('click', abrirCalendario);

// Calendly avisa a la página cuando se reserva → el lead pasa a "Agendado" en el CRM (sin caller)
window.addEventListener('message', e => {
  if (e.origin !== 'https://calendly.com' || !e.data || e.data.event !== 'calendly.event_scheduled') return;
  const pl = e.data.payload || {};
  marcarAgendado((pl.event || {}).uri, (pl.invitee || {}).uri);
  setTimeout(() => {
    $('cal').hidden = true; $('open').hidden = true; $('skip').hidden = true;
    $('booked').hidden = false;
    $('booked').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 1800);
});

async function marcarAgendado(evento, invitado) {
  const url = (window.SA_CONFIG || {}).API_URL;
  if (!url || !lead.id) return;
  const body = JSON.stringify({ action: 'agendado', id: lead.id, evento: evento || '', invitado: invitado || '' });
  // reintenta por si el lead aún no se había guardado en el Sheet
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true });
      const j = await r.json();
      if (j.ok) return;
    } catch (err) { console.error(err); }
    await new Promise(r => setTimeout(r, 2500 * (i + 1)));
  }
}
