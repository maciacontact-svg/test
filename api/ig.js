// ===== System Academy · Webhook de Instagram (Meta) =====
// Meta avisa aquí de cada DM de @aleix.ytf (enviados, recibidos y vistos) → se reenvían al CRM (Apps Script, acción "ig").
// URL para Meta: https://biblioteca.systemacademy.es/api/ig
// Variables de entorno en Vercel (nunca en el repo):
//   IG_APP_SECRET    → clave secreta de la app (para comprobar que el aviso viene de Meta). Se pueden poner
//                      varias separadas por comas: la «de la app de Instagram» y la de Configuración → Básica.
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
  const secretos = String(process.env.IG_APP_SECRET || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!secretos.length || !/^sha256=[a-f0-9]{64}$/.test(firma || '')) return false;
  const recibida = Buffer.from(firma);
  return secretos.some(secreto => {
    const esperada = Buffer.from('sha256=' + crypto.createHmac('sha256', secreto).update(raw).digest('hex'));
    return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
  });
}

// Del formato de Meta a eventos simples: out (nuestro), in (suyo), seen (lo ha visto).
// Meta usa dos formatos: entry[].messaging[] / standby[] y entry[].changes[] { field, value }.
const idDe = x => { const v = x && (x.id || x.igsid || x.user_id); return /^\d{3,40}$/.test(String(v || '')) ? String(v) : ''; };
function eventos(body) {
  const out = [];
  (body.entry || []).forEach(entry => {
    const yo = String(entry.id || '');
    const items = [...(entry.messaging || []), ...(entry.standby || []),
      ...(entry.changes || []).filter(c => /messag/.test(c.field || '') && c.value).map(c => c.value)];
    items.forEach(m => {
      const ts = Number(m.timestamp) || Number(entry.time) || Date.now();
      const sender = idDe(m.sender) || idDe(m.from), recipient = idDe(m.recipient) || idDe(m.to);
      if (m.message) {
        if (m.message.is_deleted || m.message.is_unsupported) return;
        const nuestro = !!m.message.is_echo || (sender && sender === yo);
        const u = nuestro ? recipient : sender;
        if (!u || u === yo) return;
        out.push({ t: nuestro ? 'out' : 'in', u, ts, txt: String(m.message.text || '').slice(0, 1000), mid: m.message.mid || '' });
      } else if (m.read) {
        const u = sender && sender !== yo ? sender : recipient;
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
    // Diagnóstico: /api/ig?diag=<IG_VERIFY_TOKEN> → comprueba la configuración sin enseñar ninguna clave
    if (q.get('diag') && process.env.IG_VERIFY_TOKEN && q.get('diag') === process.env.IG_VERIFY_TOKEN) {
      const d = {
        IG_APP_SECRET: String(process.env.IG_APP_SECRET || '').split(',').filter(x => x.trim()).length + ' clave(s)',
        IG_VERIFY_TOKEN: 'ok',
        IG_CRM_KEY: process.env.IG_CRM_KEY ? process.env.IG_CRM_KEY.length + ' caracteres' : 'FALTA',
        CRM_API_URL: /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(process.env.CRM_API_URL || '') ? 'ok' : 'FALTA o no termina en /exec',
      };
      try {
        const r = await fetch(process.env.CRM_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ig', clave: process.env.IG_CRM_KEY || '', eventos: [] }) });
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch (e) {}
        d.apps_script = j ? (j.ok ? 'ok: la clave coincide con G9' : 'responde con error: ' + j.error)
          : 'no devuelve JSON (HTTP ' + r.status + '): ¿la implementación es «Cualquier usuario» y está en la versión nueva?';
      } catch (err) { d.apps_script = 'no se puede conectar: ' + err.message; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.statusCode = 200;
      return res.end(JSON.stringify(d, null, 2));
    }
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
  if (!firmaValida(raw, req.headers['x-hub-signature-256'])) {
    const n = String(process.env.IG_APP_SECRET || '').split(',').filter(x => x.trim()).length;
    console.error(`Firma no válida: ${n ? n + ' clave(s) en IG_APP_SECRET y ninguna coincide' : 'IG_APP_SECRET vacía'} · cuerpo ${raw.length} bytes · ` +
      (req.headers['x-hub-signature-256'] ? 'firma recibida' : 'sin firma'));
    res.statusCode = 401; return res.end('Bad signature');
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { res.statusCode = 400; return res.end(); }
  const evs = eventos(body);
  // forma de lo que manda Meta (sin textos), para diagnosticar
  console.log('Meta:', JSON.stringify((body.entry || []).map(e => ({
    id: String(e.id || '').length + 'd',
    items: [...(e.messaging || []).map(m => ['messaging', m]), ...(e.standby || []).map(m => ['standby', m]), ...(e.changes || []).map(m => ['changes', m])]
      .map(([k, m]) => k + ':' + Object.keys(m).join('+') + (m.sender ? ' sender=' + String(m.sender.id).length + 'd' : '') +
        (m.message ? ' echo=' + !!m.message.is_echo : '') + (m.field ? ' field=' + m.field : '')),
  }))));
  if (evs.length && process.env.CRM_API_URL) {
    try {
      const r = await fetch(process.env.CRM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ig', clave: process.env.IG_CRM_KEY || '', eventos: evs }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) console.error('CRM:', j.error || r.status);
      else {
        const tipos = { in: 'recibido', out: 'enviado', seen: 'visto' };
        console.log(`OK: ${evs.map(e => tipos[e.t]).join(', ') || 'nada útil'} → ${j.n} guardado(s) en el CRM` + (j.descartes ? ' · descartados: ' + j.descartes : ''));
      }
    } catch (err) { console.error('CRM:', err); }
  }
  // siempre 200: si no, Meta reintenta y acaba desactivando el webhook
  res.statusCode = 200;
  res.end('EVENT_RECEIVED');
};

module.exports.eventos = eventos;
module.exports.firmaValida = firmaValida;
