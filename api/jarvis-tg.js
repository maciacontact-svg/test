// ===== System Academy · Jarvis por Telegram =====
// Mario escribe o manda notas de voz al bot de Jarvis → se guardan como ideas «Mario» (o contesta si pregunta).
// Solo hace caso a los IDs de TG_MARIO. Si TG_MARIO está vacío, el bot solo contesta «tu ID es …» para poder configurarlo.
// Conectar (una vez, tras poner las variables y hacer Redeploy): abrir
//   https://biblioteca.systemacademy.es/api/jarvis-tg?setup=<TG_SECRET>
// Variables de entorno en Vercel (además de las de api/_jarvis.js):
//   TG_TOKEN   → el token que da @BotFather al crear el bot (123456:ABC…)
//   TG_SECRET  → una palabra que te inventas (solo letras, números, - y _). Telegram la manda en cada aviso.
//   TG_MARIO   → tu ID de usuario de Telegram (números). Varios separados por comas.
const { waitUntil } = require('@vercel/functions');
const jarvis = require('./_jarvis');

const api = m => `https://api.telegram.org/bot${process.env.TG_TOKEN}/${m}`;
const permitidos = () => String(process.env.TG_MARIO || '').split(',').map(x => x.replace(/\D/g, '')).filter(Boolean);

function cuerpo(req) {
  return new Promise((ok, ko) => {
    const partes = [];
    req.on('data', c => partes.push(c));
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', ko);
  });
}

async function tg(metodo, datos) {
  const r = await fetch(api(metodo), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Telegram ' + metodo + ': ' + (j.description || r.status));
  return j.result;
}

// *negrita* y _cursiva_ con el Markdown de Telegram; si algún título trae símbolos raros, se manda sin formato
async function contestar(chat, texto, idOriginal) {
  if (!texto) return;
  const base = { chat_id: chat, text: texto.slice(0, 4000), reply_parameters: idOriginal ? { message_id: idOriginal, allow_sending_without_reply: true } : undefined };
  try { await tg('sendMessage', { ...base, parse_mode: 'Markdown' }); }
  catch (e) { await tg('sendMessage', base); }
}

async function bajarAudio(fileId) {
  const f = await tg('getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.TG_TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error('No puedo bajar el audio (' + r.status + ')');
  return { buf: Buffer.from(await r.arrayBuffer()), nombre: String(f.file_path).split('/').pop() || 'audio.ogg' };
}

async function atender(m) {
  const chat = m.chat.id;
  try {
    tg('sendChatAction', { chat_id: chat, action: 'typing' }).catch(() => {});
    let texto = String(m.text || m.caption || '').trim(), original = texto;
    const audio = m.voice || m.audio || (m.video_note ? { ...m.video_note, mime_type: 'video/mp4' } : null);
    if (audio) {
      if (audio.file_size > 20e6) return contestar(chat, 'El audio es muy largo (máx. 20 MB). Mándamelo en dos partes 🙏', m.message_id);
      const a = await bajarAudio(audio.file_id);
      const t = await jarvis.transcribir(a.buf, audio.mime_type || 'audio/ogg', a.nombre);
      texto = (texto ? texto + '\n' : '') + t;
      original = (original ? original + '\n' : '') + '🎙️ ' + t;
    } else if (!texto) {
      return contestar(chat, 'Por ahora entiendo texto y notas de voz 🙂', m.message_id);
    }
    if (/^\/(start|ayuda|help)\b/i.test(texto)) return contestar(chat, jarvis.AYUDA);
    const r = await jarvis.procesar({ texto, quien: 'mario', autor: 'Mario', canal: 'Telegram', msg: `tg:${chat}:${m.message_id}`, original });
    await contestar(chat, r, m.message_id);
  } catch (err) {
    console.error('Jarvis Telegram:', err);
    await contestar(chat, '⚠️ No he podido guardarlo: ' + err.message + '\nVuelve a mandármelo en un rato.', m.message_id).catch(() => {});
  }
}

module.exports = async (req, res) => {
  const secreto = String(process.env.TG_SECRET || '');
  if (req.method === 'GET') {
    const q = new URL(req.url, 'https://x').searchParams;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!secreto || q.get('setup') !== secreto) { res.statusCode = 403; return res.end('{"error":"Forbidden"}'); }
    // Conecta el bot con esta URL y dice qué falta por configurar (sin enseñar claves)
    const d = {};
    d.IA = process.env.ANTHROPIC_API_KEY ? 'ok: Claude' : process.env.GROQ_API_KEY ? 'ok: Groq (gratis)' : 'FALTA GROQ_API_KEY (gratis en console.groq.com)';
    ['CRM_API_URL', 'TG_TOKEN'].forEach(k => { d[k] = process.env[k] ? 'ok' : 'FALTA'; });
    d.TG_SECRET = /^[A-Za-z0-9_-]{1,256}$/.test(secreto) ? 'ok' : 'solo letras, números, - y _';
    d.TG_MARIO = permitidos().length ? permitidos().length + ' ID(s)' : 'FALTA: escribe al bot y te dirá tu ID';
    d.clave_CRM = process.env.JARVIS_CRM_KEY || process.env.IG_CRM_KEY ? 'ok' : 'FALTA (JARVIS_CRM_KEY o IG_CRM_KEY = Ajustes G9)';
    try {
      const url = `https://${req.headers['x-forwarded-host'] || req.headers.host}/api/jarvis-tg`;
      await tg('setWebhook', { url, secret_token: secreto, allowed_updates: ['message'], drop_pending_updates: true });
      const bot = await tg('getMe', {});
      d.bot = `ok: @${bot.username} conectado a ${url}`;
    } catch (err) { d.bot = err.message; }
    try { await jarvis.crm('ideasBuscar', { quien: 'mario', ambito: 'mias' }); d.apps_script = 'ok: la pestaña Ideas responde'; }
    catch (err) { d.apps_script = err.message; }
    return res.end(JSON.stringify(d, null, 2));
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  if (!secreto || req.headers['x-telegram-bot-api-secret-token'] !== secreto) { res.statusCode = 401; return res.end('Bad secret'); }

  let body;
  try { body = JSON.parse((await cuerpo(req)).toString('utf8')); } catch (e) { res.statusCode = 400; return res.end(); }
  const m = body.message;
  // solo chats privados con el bot (en grupos no lee nada)
  if (m && m.chat && m.chat.type === 'private' && m.from && !m.from.is_bot) {
    const ok = permitidos();
    if (ok.includes(String(m.from.id))) waitUntil(atender(m));
    else if (!ok.length) waitUntil(contestar(m.chat.id, `Tu ID de Telegram es ${m.from.id}. Ponlo en Vercel como TG_MARIO y haz Redeploy.`).catch(() => {}));
  }
  // siempre 200: si no, Telegram reintenta el mismo mensaje
  res.statusCode = 200;
  res.end('ok');
};
