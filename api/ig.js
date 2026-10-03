// ===== System Academy · Webhook de Instagram (Meta) =====
// Meta avisa aquí de cada DM de @aleix.ytf (enviados, recibidos y vistos) → se reenvían al CRM (Apps Script, acción "ig").
// URL para Meta: https://go.systemacademy.es/api/ig
// Variables de entorno en Vercel (nunca en el repo):
//   IG_APP_SECRET    → «Clave secreta de la app» de Meta (para comprobar que el aviso viene de Meta)
//   IG_VERIFY_TOKEN  → una palabra que te inventas y pegas también en Meta al configurar el webhook
//   IG_CRM_KEY       → la clave de Ajustes → G9 del Sheet
//   CRM_API_URL      → la URL del Apps Script (la misma que config.js)
const crypto = require('crypto');

function cuerpo(req) {
  return new Promise((ok, ko) => {
    const partes = [];
    req.on('data', c => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', ko);
  });
}

function firmaValida(raw, firma) {
  const secreto = process.env.IG_APP_SECRET || '';
  if (!secreto || !/^sha256=[a-f0-9]{64}$/.test(firma || '')) return false;
  const esperada = Buffer.from('sha256=' + crypto.createHmac('sha256', secreto).update(raw).digest('hex'));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

// Del formato de Meta a eventos simples: out (nuestro), in (suyo), seen (lo ha visto)
function eventos(body) {
  const out = [];
  (body.entry || []).forEach(entry => {
    const yo = String(entry.id || '');
    [...(entry.messaging || []), ...(entry.standby || [])].forEach(m => {
      const ts = Number(m.timestamp) || Number(entry.time) || Date.now();
      if (m.message) {
        if (m.message.is_deleted || m.message.is_unsupported) return;
        const nuestro = !!m.message.is_echo || String(m.sender && m.sender.id) === yo;
        const u = String(nuestro ? m.recipient && m.recipient.id : m.sender && m.sender.id);
        if (!u || u === yo) return;
        out.push({ t: nuestro ? 'out' : 'in', u, ts, txt: String(m.message.text || '').slice(0, 1000), mid: m.message.mid || '' });
      } else if (m.read) {
        const u = String(m.sender && m.sender.id);
        if (u && u !== yo) out.push({ t: 'seen', u, ts });
      }
    });
  });
  return out;
}

module.exports = async (req, res) => {
  // 1) Meta comprueba la URL al configurar el webhook
  if (req.method === 'GET') {
    const q = new URL(req.url, 'https://x').searchParams;
    if (q.get('hub.mode') === 'subscribe' && process.env.IG_VERIFY_TOKEN && q.get('hub.verify_token') === process.env.IG_VERIFY_TOKEN) {
      res.statusCode = 200;
      return res.end(q.get('hub.challenge') || '');
    }
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }

  // 2) Aviso de mensajes: solo si la firma es de Meta
  const raw = await cuerpo(req);
  if (!firmaValida(raw, req.headers['x-hub-signature-256'])) { res.statusCode = 401; return res.end('Bad signature'); }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { res.statusCode = 400; return res.end(); }
  const evs = eventos(body);
  if (evs.length && process.env.CRM_API_URL) {
    try {
      const r = await fetch(process.env.CRM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ig', clave: process.env.IG_CRM_KEY || '', eventos: evs }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) console.error('CRM:', j.error || r.status);
    } catch (err) { console.error('CRM:', err); }
  }
  // siempre 200: si no, Meta reintenta y acaba desactivando el webhook
  res.statusCode = 200;
  res.end('EVENT_RECEIVED');
};

module.exports.eventos = eventos;
module.exports.firmaValida = firmaValida;
