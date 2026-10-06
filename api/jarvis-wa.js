// ===== System Academy · Jarvis por WhatsApp (API oficial de WhatsApp Cloud, Meta) =====
// Mario escribe o manda audios al número de Jarvis → se guardan como ideas «Mario» (o contesta si pregunta).
// Solo hace caso a los números de WA_MARIO: cualquier otro mensaje se ignora sin contestar.
// URL para Meta (webhook de WhatsApp): https://biblioteca.systemacademy.es/api/jarvis-wa
// Variables de entorno en Vercel (además de las de api/_jarvis.js):
//   WA_APP_SECRET    → clave secreta de la app de Meta (comprueba que el aviso viene de Meta)
//   WA_VERIFY_TOKEN  → una palabra que te inventas y pegas también en Meta al configurar el webhook
//   WA_TOKEN         → token permanente del usuario del sistema (WhatsApp Business) para contestar y bajar audios
//   WA_PHONE_ID      → «Phone number ID» del número de Jarvis
//   WA_MARIO         → tu número con prefijo y sin «+» ni espacios (34600111222). Varios separados por comas.
const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const jarvis = require('./_jarvis');

const GRAPH = 'https://graph.facebook.com/v23.0';

function cuerpo(req) {
  return new Promise((ok, ko) => {
    const partes = [];
    req.on('data', c => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', ko);
  });
}

function firmaValida(raw, firma) {
  const secreto = String(process.env.WA_APP_SECRET || '').trim();
  if (!secreto || !/^sha256=[a-f0-9]{64}$/.test(firma || '')) return false;
  const esperada = Buffer.from('sha256=' + crypto.createHmac('sha256', secreto).update(raw).digest('hex'));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

const permitidos = () => String(process.env.WA_MARIO || '').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean);

// Del formato de Meta a mensajes simples { id, de, tipo, texto, audio }
function mensajes(body) {
  const out = [];
  (body.entry || []).forEach(e => (e.changes || []).forEach(c => {
    const v = c.value || {};
    (v.messages || []).forEach(m => out.push({
      id: m.id, de: String(m.from || ''), tipo: m.type,
      texto: m.type === 'text' ? String((m.text && m.text.body) || '') : '',
      audio: m.type === 'audio' && m.audio ? m.audio.id : '',
    }));
  }));
  return out;
}

async function graph(ruta, opciones = {}) {
  const r = await fetch(ruta.startsWith('http') ? ruta : GRAPH + ruta, {
    ...opciones, headers: { Authorization: 'Bearer ' + process.env.WA_TOKEN, ...(opciones.headers || {}) },
  });
  if (!r.ok) throw new Error('WhatsApp ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r;
}

async function bajarAudio(id) {
  const info = await (await graph('/' + id)).json();
  const buf = Buffer.from(await (await graph(info.url)).arrayBuffer());
  return { buf, mime: String(info.mime_type || 'audio/ogg').split(';')[0] };
}

async function contestar(a, texto, idOriginal) {
  if (!texto) return;
  const body = { messaging_product: 'whatsapp', to: a, type: 'text', text: { body: texto.slice(0, 4000) } };
  if (idOriginal) body.context = { message_id: idOriginal };
  await graph(`/${process.env.WA_PHONE_ID}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function atender(m) {
  try {
    // doble check azul mientras piensa
    graph(`/${process.env.WA_PHONE_ID}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: m.id }) }).catch(() => {});
    let texto = m.texto, original = '';
    if (m.audio) {
      const a = await bajarAudio(m.audio);
      texto = original = await jarvis.transcribir(a.buf, a.mime, 'audio.' + (a.mime.split('/')[1] || 'ogg'));
      original = '🎙️ ' + original;
    } else if (!texto) {
      return contestar(m.de, 'Por ahora entiendo texto y audios 🙂', m.id);
    }
    const r = await jarvis.procesar({ texto, quien: 'mario', autor: 'Mario', canal: 'WhatsApp', msg: 'wa:' + m.id, original: original || texto });
    await contestar(m.de, r, m.id);
  } catch (err) {
    console.error('Jarvis WA:', err);
    await contestar(m.de, '⚠️ No he podido guardarlo: ' + err.message + '\nVuelve a mandármelo en un rato.', m.id).catch(() => {});
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const q = new URL(req.url, 'https://x').searchParams;
    const token = process.env.WA_VERIFY_TOKEN;
    // Diagnóstico: /api/jarvis-wa?diag=<WA_VERIFY_TOKEN> → qué falta por configurar (sin enseñar claves)
    if (token && q.get('diag') === token) {
      const d = {};
      ['ANTHROPIC_API_KEY', 'TRANSCRIBE_API_KEY', 'CRM_API_URL', 'WA_APP_SECRET', 'WA_TOKEN', 'WA_PHONE_ID'].forEach(k => { d[k] = process.env[k] ? 'ok' : 'FALTA'; });
      d.WA_MARIO = permitidos().length ? permitidos().length + ' número(s)' : 'FALTA';
      d.clave_CRM = process.env.JARVIS_CRM_KEY || process.env.IG_CRM_KEY ? 'ok' : 'FALTA (JARVIS_CRM_KEY o IG_CRM_KEY = Ajustes G9)';
      try { await jarvis.crm('ideasBuscar', { quien: 'mario', ambito: 'mias' }); d.apps_script = 'ok: la pestaña Ideas responde'; }
      catch (err) { d.apps_script = err.message; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(d, null, 2));
    }
    if (q.get('hub.mode') === 'subscribe' && token && q.get('hub.verify_token') === token) {
      res.statusCode = 200;
      return res.end(q.get('hub.challenge') || '');
    }
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }

  const raw = await cuerpo(req);
  if (!firmaValida(raw, req.headers['x-hub-signature-256'])) { res.statusCode = 401; return res.end('Bad signature'); }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { res.statusCode = 400; return res.end(); }

  const ok = permitidos();
  const lista = mensajes(body).filter(m => ok.includes(m.de));
  // se contesta a Meta al momento (si no, reintenta) y el trabajo sigue en segundo plano
  if (lista.length) waitUntil(Promise.all(lista.map(atender)));
  res.statusCode = 200;
  res.end('EVENT_RECEIVED');
};

module.exports.mensajes = mensajes;
module.exports.firmaValida = firmaValida;
