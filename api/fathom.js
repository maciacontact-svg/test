// ===== System Academy · Webhook de Fathom (llamadas de los closers) =====
// Cuando Fathom termina de procesar una llamada, avisa aquí → se reenvía al CRM (Apps Script, acción "fathom"):
// se busca el lead por el email del invitado y se rellenan «Link de llamada» y «Conclusiones» (3 líneas del resumen).
// URL para Fathom (Settings → API Access → Webhooks): https://biblioteca.systemacademy.es/api/fathom
//   Marca «Include summary» (y si quieres «Action items»).
// Variables de entorno en Vercel (nunca en el repo):
//   FATHOM_WEBHOOK_SECRET → el secreto que da Fathom al crear el webhook (empieza por whsec_)
//   IG_CRM_KEY            → la clave de Ajustes → G9 del Sheet (la misma que usa Instagram)
//   CRM_API_URL           → la URL del Apps Script (la misma que config.js)
const crypto = require('crypto');

function cuerpo(req) {
  return new Promise((ok, ko) => {
    const partes = [];
    req.on('data', c => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', ko);
  });
}

// Firma estándar de webhooks: HMAC-SHA256 de "<webhook-id>.<webhook-timestamp>.<cuerpo>" en base64,
// cabecera webhook-signature = "v1,<firma> v1,<otra>…". La clave es lo que va tras "whsec_" (en base64).
function firmaValida(raw, h) {
  const secreto = String(process.env.FATHOM_WEBHOOK_SECRET || '').trim();
  const id = h['webhook-id'], ts = h['webhook-timestamp'], firmas = String(h['webhook-signature'] || '');
  if (!secreto || !id || !ts || !firmas) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;          // avisos de hace más de 10 min: fuera
  const s = secreto.replace(/^whsec_/, '');
  const claves = [Buffer.from(s, 'base64'), Buffer.from(secreto)];
  const datos = `${id}.${ts}.${raw.toString('utf8')}`;
  return claves.some(k => {
    const esperada = Buffer.from(crypto.createHmac('sha256', k).update(datos).digest('base64'));
    return firmas.split(' ').some(f => {
      const r = Buffer.from(f.replace(/^v1,/, ''));
      return r.length === esperada.length && crypto.timingSafeEqual(r, esperada);
    });
  });
}

// Del resumen de Fathom (markdown) a 3 líneas cortas: lo que pasa con el lead ahora
function resumen(m) {
  const md = String((m.default_summary && (m.default_summary.markdown_formatted || m.default_summary.text)) || m.summary || '');
  const lineas = md.split('\n')
    .map(l => l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]/g, '').replace(/^\s*[-•\d.]+\s*/, '').trim())
    .filter(l => l.length > 15 && !/:$/.test(l));
  const acciones = (m.action_items || []).map(a => String((a && (a.description || a.text)) || '').trim()).filter(Boolean);
  const out = lineas.slice(0, 3).map(l => l.length > 220 ? l.slice(0, 217) + '…' : l);
  if (acciones.length && out.length < 3) out.push('Próximo paso: ' + acciones[0].slice(0, 200));
  return out.join('\n');
}

function reunion(m) {
  const inv = (m.calendar_invitees || m.invitees || []);
  const ext = inv.filter(x => x && x.email && x.is_external !== false);
  return {
    url: String(m.share_url || m.url || ''),
    titulo: String(m.title || m.meeting_title || '').slice(0, 200),
    invitados: (ext.length ? ext : inv.filter(x => x && x.email)).map(x => String(x.email).toLowerCase()),
    resumen: resumen(m),
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const raw = await cuerpo(req);
  if (!firmaValida(raw, req.headers)) {
    console.error('Fathom: firma no válida' + (process.env.FATHOM_WEBHOOK_SECRET ? '' : ' (falta FATHOM_WEBHOOK_SECRET en Vercel)'));
    res.statusCode = 401; return res.end('Bad signature');
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { res.statusCode = 400; return res.end(); }
  const m = body.meeting || body.data || body;
  const r = reunion(m);
  if (r.invitados.length && process.env.CRM_API_URL) {
    try {
      const x = await fetch(process.env.CRM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'fathom', clave: process.env.IG_CRM_KEY || '', reunion: r }),
      });
      const j = await x.json().catch(() => ({}));
      console.log(j.ok ? (j.encontrado ? `OK: llamada apuntada en el lead ${j.id}` : 'Ningún lead con ese email') : 'CRM: ' + (j.error || x.status));
    } catch (err) { console.error('CRM:', err); }
  }
  res.statusCode = 200;
  res.end('ok');
};

module.exports.firmaValida = firmaValida;
module.exports.reunion = reunion;
