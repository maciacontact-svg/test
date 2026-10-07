// ===== System Academy · Jarvis en Slack (canal de ideas del equipo) =====
// Lo que el equipo escribe (o graba como clip de audio) en el canal de ideas se guarda como ideas «Equipo».
// Si alguien pregunta («ideas de contenido», «explícame la 14») contesta en el hilo, SOLO con ideas del equipo:
// las de Mario no salen nunca en Slack.
// URL para Slack (Event Subscriptions → Request URL): https://biblioteca.systemacademy.es/api/jarvis-slack
// Variables de entorno en Vercel (además de las de api/_jarvis.js):
//   SLACK_SIGNING_SECRET → Basic Information → Signing Secret de la app de Slack
//   SLACK_BOT_TOKEN      → OAuth & Permissions → Bot User OAuth Token (xoxb-…)
//   SLACK_IDEAS_CANAL    → ID del canal de ideas (C0…). Varios separados por comas. Vacío = cualquier canal donde esté Jarvis.
const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const jarvis = require('./_jarvis');

function cuerpo(req) {
  return new Promise((ok, ko) => {
    const partes = [];
    req.on('data', c => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', ko);
  });
}

function firmaValida(raw, ts, firma) {
  const secreto = String(process.env.SLACK_SIGNING_SECRET || '').trim();
  if (!secreto || !/^v0=[a-f0-9]{64}$/.test(firma || '') || !/^\d+$/.test(ts || '')) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const esperada = Buffer.from('v0=' + crypto.createHmac('sha256', secreto).update(`v0:${ts}:`).update(raw).digest('hex'));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

async function slack(metodo, datos) {
  const r = await fetch('https://slack.com/api/' + metodo, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SLACK_BOT_TOKEN, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(datos),
  });
  const j = await r.json();
  if (!j.ok) throw new Error('Slack ' + metodo + ': ' + j.error);
  return j;
}

async function nombreDe(user) {
  try {
    const r = await fetch('https://slack.com/api/users.info?user=' + encodeURIComponent(user), { headers: { Authorization: 'Bearer ' + process.env.SLACK_BOT_TOKEN } });
    const j = await r.json();
    const p = (j.user && j.user.profile) || {};
    return p.display_name || p.real_name || (j.user && j.user.name) || user;
  } catch (e) { return user; }
}

// ¿Este evento es un mensaje del equipo en el canal de ideas? (ni bots, ni ediciones, ni respuestas en hilo)
// IDs de canal válidos de SLACK_IDEAS_CANAL (C… o G…). Si no hay ninguno válido, vale cualquier canal donde esté Jarvis.
const canalesIdeas = () => String(process.env.SLACK_IDEAS_CANAL || '').split(',').map(x => x.trim().replace(/^#/, '')).filter(x => /^[CG][A-Z0-9]{6,}$/.test(x));

// ¿Este evento es un mensaje del equipo en el canal de ideas? (ni bots, ni ediciones, ni respuestas en hilo)
// Devuelve '' si sí, o el motivo por el que se ignora (sale en los logs de Vercel).
function motivoIgnorar(ev) {
  if (!ev || ev.type !== 'message') return 'no es un mensaje';
  if (ev.bot_id || !ev.user) return 'lo escribe un bot';
  if (ev.subtype && ev.subtype !== 'file_share') return 'subtipo ' + ev.subtype;
  if (ev.thread_ts && ev.thread_ts !== ev.ts) return 'respuesta en un hilo';
  const canales = canalesIdeas();
  if (canales.length && !canales.includes(ev.channel)) return `canal ${ev.channel} no es SLACK_IDEAS_CANAL (${canales.join(', ')})`;
  return '';
}
const esMensaje = ev => !motivoIgnorar(ev);

const esAudio = f => /^(audio|video)\//.test(f.mimetype || '') && f.url_private_download;

async function atender(ev) {
  const responder = text => text && slack('chat.postMessage', { channel: ev.channel, thread_ts: ev.ts, text: text.slice(0, 3900) });
  try {
    let texto = String(ev.text || '').replace(/<@[A-Z0-9]+>/g, '').trim(), original = texto;
    const audios = (ev.files || []).filter(esAudio);
    for (const f of audios.slice(0, 3)) {
      const r = await fetch(f.url_private_download, { headers: { Authorization: 'Bearer ' + process.env.SLACK_BOT_TOKEN } });
      if (!r.ok) throw new Error('No puedo bajar el audio (¿falta el permiso files:read?)');
      const t = await jarvis.transcribir(Buffer.from(await r.arrayBuffer()), f.mimetype, f.name || 'audio.webm');
      texto = (texto ? texto + '\n' : '') + t;
      original = (original ? original + '\n' : '') + '🎙️ ' + t;
    }
    if (!texto) return;
    const autor = await nombreDe(ev.user);
    const r = await jarvis.procesar({ texto, quien: 'equipo', autor, canal: 'Slack', msg: `slack:${ev.channel}:${ev.ts}`, original });
    await responder(r);
  } catch (err) {
    console.error('Jarvis Slack:', err);
    await responder('⚠️ No he podido guardarlo: ' + err.message).catch(() => {});
  }
}

async function diagnostico(req, res) {
  const d = {};
  d.IA = process.env.ANTHROPIC_API_KEY ? 'ok: Claude' : process.env.GROQ_API_KEY ? 'ok: Groq (gratis)' : 'FALTA GROQ_API_KEY';
  d.SLACK_SIGNING_SECRET = /^[a-f0-9]{32}$/.test(String(process.env.SLACK_SIGNING_SECRET || '').trim()) ? 'ok'
    : process.env.SLACK_SIGNING_SECRET ? 'no parece el Signing Secret (32 letras/números de Basic Information → App Credentials)' : 'FALTA';
  const crudo = String(process.env.SLACK_IDEAS_CANAL || '').trim();
  d.SLACK_IDEAS_CANAL = canalesIdeas().length ? 'ok: ' + canalesIdeas().join(', ')
    : crudo ? `«${crudo}» no es un ID de canal (empieza por C, p. ej. C07ABC123). Mientras, Jarvis escucha en cualquier canal donde esté` : 'vacío: escucha en cualquier canal donde esté Jarvis';
  if (!process.env.SLACK_BOT_TOKEN) d.SLACK_BOT_TOKEN = 'FALTA';
  else {
    try { const j = await slack('auth.test', {}); d.SLACK_BOT_TOKEN = `ok: @${j.user} en ${j.team}`; }
    catch (err) { d.SLACK_BOT_TOKEN = String(process.env.SLACK_BOT_TOKEN).trim().startsWith('xoxb-') ? err.message : 'tiene que ser el Bot User OAuth Token (xoxb-…)'; }
  }
  try { await jarvis.crm('ideasBuscar', { quien: 'equipo', ambito: 'equipo' }); d.apps_script = 'ok'; }
  catch (err) { d.apps_script = err.message; }
  d.siguiente = 'Si todo está ok y no contesta: Event Subscriptions → Request URL «Verified», bot events message.channels (y message.groups), Save Changes y Reinstall; luego /invite @Jarvis en el canal.';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(d, null, 2));
}

module.exports = async (req, res) => {
  // Diagnóstico: /api/jarvis-slack?diag=<TG_SECRET> (la misma palabra que el setup de Telegram)
  if (req.method === 'GET') {
    const q = new URL(req.url, 'https://x').searchParams;
    if (process.env.TG_SECRET && q.get('diag') === process.env.TG_SECRET) return diagnostico(req, res);
    res.statusCode = 403; return res.end('Forbidden');
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const raw = await cuerpo(req);
  if (!firmaValida(raw, req.headers['x-slack-request-timestamp'], req.headers['x-slack-signature'])) {
    console.error('Slack: firma no válida (¿SLACK_SIGNING_SECRET bien copiado y Redeploy hecho?)');
    res.statusCode = 401; return res.end('Bad signature');
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { res.statusCode = 400; return res.end(); }

  // Slack comprueba la URL al configurarla
  if (body.type === 'url_verification') {
    res.setHeader('Content-Type', 'text/plain');
    return res.end(String(body.challenge || ''));
  }
  // Slack reintenta si no contestamos en 3 s: el primer aviso ya se está procesando
  if (!req.headers['x-slack-retry-num'] && body.type === 'event_callback') {
    const motivo = motivoIgnorar(body.event);
    if (motivo) console.log('Slack: ignorado → ' + motivo);
    else waitUntil(atender(body.event));
  }
  res.statusCode = 200;
  res.end('ok');
};

module.exports.firmaValida = firmaValida;
module.exports.esMensaje = esMensaje;
