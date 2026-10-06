// ===== System Academy · Jarvis (segundo cerebro) =====
// Lo comparten api/jarvis-wa.js (WhatsApp de Mario) y api/jarvis-slack.js (canal de ideas del equipo).
// Un mensaje (texto o audio ya transcrito) → Claude decide si son ideas nuevas, una pregunta o un cambio de estado →
// se guarda / busca en la pestaña «Ideas» del Sheet (Apps Script) → se devuelve el texto de respuesta.
// (El guion bajo hace que Vercel no publique este archivo como una URL.)
// Variables de entorno en Vercel (nunca en el repo):
//   ANTHROPIC_API_KEY  → clave de la API de Claude (console.anthropic.com)
//   TRANSCRIBE_API_KEY → clave para pasar los audios a texto (OpenAI por defecto; ver TRANSCRIBE_URL)
//   TRANSCRIBE_URL     → opcional. Por defecto https://api.openai.com/v1/audio/transcriptions
//                        (Groq, más barato: https://api.groq.com/openai/v1/audio/transcriptions)
//   TRANSCRIBE_MODEL   → opcional. Por defecto whisper-1 (Groq: whisper-large-v3-turbo)
//   CRM_API_URL        → la URL del Apps Script (la misma que config.js)
//   JARVIS_CRM_KEY     → opcional: la clave de Ajustes → G9 (si no está, se usa IG_CRM_KEY, que es la misma)
const Anthropic = require('@anthropic-ai/sdk');

const MODELO = 'claude-opus-5-5';
const CATEGORIAS = ['Funnel', 'Contenido', 'Ventas', 'Formación', 'Marketing', 'Equipo', 'Tecnología', 'Otros'];
const ESTADOS = ['Nueva', 'En marcha', 'Hecha', 'Descartada'];
const EMOJI = { Funnel: '🧲', Contenido: '🎬', Ventas: '💰', 'Formación': '🎓', Marketing: '📣', Equipo: '👥', 'Tecnología': '⚙️', Otros: '🗂️' };

let cliente = null;
const claude = () => (cliente = cliente || new (Anthropic.default || Anthropic)());

const NEGOCIO = `Trabajas para System Academy: formación de YouTube faceless (B2C, España y LATAM). Fundadores: Mario y Aleix.
Piezas del negocio, para que sepas clasificar:
- Funnel: landing, formulario de cualificación, página de llamada (Calendly), vídeo de confirmación, biblioteca gratuita de recursos, enlaces con seguimiento, emails/WhatsApp de seguimiento.
- Contenido: vídeos de YouTube, reels/stories de Instagram, TikTok, guiones, hooks, miniaturas, lead magnets de ManyChat.
- Ventas: setters de Instagram, callers, closers, llamadas, guiones de venta, objeciones, precios, ofertas.
- Formación: el programa para alumnos (módulos, Skool, plantillas, comunidad, resultados de alumnos).
- Marketing: anuncios, colaboraciones, marca, lanzamientos, campañas.
- Equipo: contratar, procesos, comisiones, organización.
- Tecnología: CRM, automatizaciones, web, herramientas.
- Otros: lo que no encaje.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'ideas', 'consulta', 'estado'],
  properties: {
    tipo: { type: 'string', enum: ['ideas', 'consulta', 'estado', 'otro'] },
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'categoria', 'paraQue', 'idea', 'paso', 'prioridad'],
        properties: {
          titulo: { type: 'string' },
          categoria: { type: 'string', enum: CATEGORIAS },
          paraQue: { type: 'string' },
          idea: { type: 'string' },
          paso: { type: 'string' },
          prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        },
      },
    },
    consulta: {
      type: 'object',
      additionalProperties: false,
      required: ['ambito', 'categoria', 'pregunta'],
      properties: {
        ambito: { type: 'string', enum: ['mias', 'equipo', 'todas'] },
        categoria: { type: 'string', enum: ['', ...CATEGORIAS] },
        pregunta: { type: 'string' },
      },
    },
    estado: {
      type: 'object',
      additionalProperties: false,
      required: ['n', 'estado'],
      properties: { n: { type: 'integer' }, estado: { type: 'string', enum: ['', ...ESTADOS] } },
    },
  },
};

function sistemaEntender(quien) {
  const mario = quien === 'mario';
  return `${NEGOCIO}

Eres Jarvis, el segundo cerebro de la empresa. ${mario
    ? 'Te escribe Mario (fundador) por WhatsApp, a menudo con audios transcritos (puede haber errores de transcripción).'
    : 'Te escribe alguien del equipo en el canal de ideas de Slack.'}
Decide qué es el mensaje y rellena el JSON:
- tipo "ideas": propone o apunta una o varias ideas. Separa cada idea distinta en su propio elemento (un audio puede traer varias).
  · titulo: 3-8 palabras, claro.
  · categoria: la que mejor encaje.
  · paraQue: para qué sirve / qué objetivo del negocio mueve (1-2 frases).
  · idea: la idea explicada con SUS palabras, ordenada y completa, sin añadir cosas que no ha dicho.
  · paso: el primer paso concreto para ejecutarla (1 frase). Si no está claro, propón el más obvio.
  · prioridad: Alta si dice que es urgente/importante o mueve ventas ya; Baja si es «algún día»; si no, Media.
- tipo "consulta": pide ver, recordar, explicar o buscar ideas guardadas. consulta.pregunta = lo que quiere saber.
  consulta.ambito: ${mario
    ? '"mias" por defecto; "equipo" si pide las del equipo; "todas" si pide todas / las completas / las suyas y las del equipo.'
    : 'siempre "equipo".'}
  consulta.categoria: si se limita a una categoría, esa; si no, "".
- tipo "estado": dice que una idea (por su número) está en marcha, hecha o descartada. estado.n = el número.
- tipo "otro": saludo, prueba o algo que no es nada de lo anterior.
Rellena siempre todos los campos: los que no apliquen, vacíos ([] , "", 0).`;
}

// Lee el JSON de la respuesta (structured outputs). Si Claude declina, se avisa.
function jsonDe(r) {
  if (r.stop_reason === 'refusal') throw new Error('Claude no ha querido procesar este mensaje');
  const t = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return JSON.parse(t);
}

async function entender(texto, quien) {
  const r = await claude().beta.messages.create({
    model: MODELO,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
    system: sistemaEntender(quien),
    messages: [{ role: 'user', content: texto }],
  });
  return jsonDe(r);
}

async function responder(pregunta, ideas, ambito) {
  const r = await claude().beta.messages.create({
    model: MODELO,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: `${NEGOCIO}

Eres Jarvis, el segundo cerebro de la empresa. Contesta en español, corto y ordenado, para leer en el móvil
(WhatsApp/Slack: *negrita* con un asterisco, listas con «•», sin # ni tablas).
Usa SOLO las ideas que te paso (no inventes ideas nuevas). Cita cada una por su número (#12).
Si pide una lista, agrúpalas por categoría con el título y para qué sirve en una línea.
Si pide una idea concreta, explícala entera: qué es, para qué sirve y los pasos para ejecutarla.
${ambito === 'todas' ? 'Hay ideas de Mario y del equipo: di de quién es cada una.' : ''}`,
    messages: [{ role: 'user', content: `Pregunta: ${pregunta}\n\nIdeas guardadas (JSON):\n${JSON.stringify(ideas)}` }],
  });
  if (r.stop_reason === 'refusal') throw new Error('Claude no ha querido contestar');
  return r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

// ---------- Audio → texto ----------
async function transcribir(buf, mime, nombre) {
  const key = process.env.TRANSCRIBE_API_KEY;
  if (!key) throw new Error('Falta TRANSCRIBE_API_KEY en Vercel (para entender audios)');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime || 'audio/ogg' }), nombre || 'audio.ogg');
  form.append('model', process.env.TRANSCRIBE_MODEL || 'whisper-1');
  form.append('language', 'es');
  const r = await fetch(process.env.TRANSCRIBE_URL || 'https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Transcripción: ' + ((j.error && j.error.message) || r.status));
  return String(j.text || '').trim();
}

// ---------- Sheet (Apps Script) ----------
async function crm(action, datos) {
  if (!process.env.CRM_API_URL) throw new Error('Falta CRM_API_URL en Vercel');
  const r = await fetch(process.env.CRM_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, clave: process.env.JARVIS_CRM_KEY || process.env.IG_CRM_KEY || '', ...datos }),
  });
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('El Apps Script no responde (HTTP ' + r.status + '): ¿está publicada la versión nueva?');
  if (!j.ok) throw new Error(j.error || 'Error del CRM');
  return j;
}

// ---------- Textos de respuesta ----------
function confirmacion(ideas, repetida) {
  if (!ideas.length) return '';
  const una = x => `${EMOJI[x.categoria] || '💡'} *#${x.n} · ${x.titulo}*\n_${x.categoria} · prioridad ${String(x.prioridad).toLowerCase()}_\n` +
    `Para qué: ${x.paraQue}\nSiguiente paso: ${x.paso}`;
  const cab = repetida ? 'Esto ya lo tenía guardado:' : ideas.length > 1 ? `💡 Guardadas ${ideas.length} ideas:` : '💡 Guardada:';
  return cab + '\n\n' + ideas.map(una).join('\n\n');
}

const AYUDA = `Soy Jarvis 🧠. Mándame tus ideas por texto o audio y las guardo ordenadas.
• *Guardar*: cuéntame la idea tal cual (varias en un audio también).
• *Pedir*: «ideas del funnel», «¿qué tenía para contenido?», «explícame la 12».
• *Equipo*: «ideas del equipo» · «todas las ideas» (tuyas + equipo).
• *Estado*: «la 12 está hecha» / «empiezo la 7» / «descarta la 3».`;

// m = { texto, quien: 'mario'|'equipo', autor, canal, msg, original }
async function procesar(m) {
  const texto = String(m.texto || '').trim();
  if (!texto) return m.quien === 'mario' ? AYUDA : '';
  const r = await entender(texto, m.quien);

  if (r.tipo === 'ideas' && r.ideas.length) {
    const j = await crm('ideaGuardar', { de: m.quien, autor: m.autor, canal: m.canal, original: m.original || texto, msg: m.msg, ideas: r.ideas });
    return confirmacion(j.ideas || [], j.repetida);
  }
  if (r.tipo === 'consulta') {
    const ambito = m.quien === 'mario' ? r.consulta.ambito : 'equipo';
    const j = await crm('ideasBuscar', { quien: m.quien, ambito, categoria: r.consulta.categoria });
    const de = { mias: 'tuyas', equipo: 'del equipo', todas: '' }[j.ambito] || '';
    if (!j.ideas.length) return `No hay ideas ${de}${r.consulta.categoria ? ' de ' + r.consulta.categoria : ''} pendientes todavía.`.replace(/\s+/g, ' ');
    return await responder(r.consulta.pregunta || texto, j.ideas, j.ambito);
  }
  if (r.tipo === 'estado' && r.estado.n > 0 && r.estado.estado) {
    const j = await crm('ideaEstado', { quien: m.quien, n: r.estado.n, estado: r.estado.estado });
    const ico = { Nueva: '🆕', 'En marcha': '🚀', Hecha: '✅', Descartada: '🗑️' }[j.idea.estado] || '✔️';
    return `${ico} #${j.idea.n} · ${j.idea.titulo} → *${j.idea.estado}*`;
  }
  return m.quien === 'mario' ? AYUDA : '';
}

module.exports = { procesar, transcribir, confirmacion, entender, crm, AYUDA, ESQUEMA };
