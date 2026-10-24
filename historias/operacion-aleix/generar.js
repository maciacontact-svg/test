// Secuencia «Operación Aleix» (5 historias, 1080×1920).
// Uso: node historias/operacion-aleix/generar.js
// Fotos en fotos/1.jpg … fotos/5.jpg (si falta alguna, sale un hueco gris con lo que va ahí).
// Salida: png/1-hook.png … png/5-pregunta-3.png (para subir; el sticker «Cuestionario» se pone en Instagram)
// y png/vista-previa.png (las 5 juntas, con el sticker simulado para ver cómo queda).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIR = __dirname;
const FUENTE = fs.readFileSync(path.join(DIR, '../../crm-app/marca/poppins.css'), 'utf8');

const HISTORIAS = [
  {
    archivo: '1-hook', foto: 'Aleix en la camilla',
    textos: [
      { t: 'Chavales, tened mucho cuidado con cómo entrenáis en el gym', g: true },
      { t: '(me acaban de operar de una hernia por entrenar mal)', p: true },
    ],
  },
  {
    archivo: '2-contexto', foto: 'Aleix recuperándose (casa o camilla, con el móvil o el portátil)',
    textos: [
      { t: 'Esta semana estoy un poco de baja, por así decirlo.' },
      { t: 'Así que me paso un rato por aquí a ver si os puedo echar un cable con algo.' },
    ],
  },
  {
    archivo: '3-pregunta-1', foto: 'Aleix (otra foto de la recuperación)',
    textos: [{ t: 'Adivina la respuesta (1/3)' }],
    quiz: { q: '¿Hace falta salir en cámara para monetizar un canal de YouTube?', ops: ['Sí', 'No'] },
  },
  {
    archivo: '4-pregunta-2', foto: 'Aleix (otra foto de la recuperación)',
    textos: [
      { t: 'La anterior: NO. Hay canales enormes en los que nunca sale nadie.', p: true },
      { t: 'Adivina la respuesta (2/3)' },
    ],
    quiz: { q: '¿Qué necesitas para empezar a cobrar por anuncios en YouTube?', ops: ['100 suscriptores y 1.000 horas', '1.000 suscriptores y 4.000 horas', '10.000 suscriptores'] },
  },
  {
    archivo: '5-pregunta-3', foto: 'Aleix (otra foto de la recuperación)',
    textos: [
      { t: 'La anterior: 1.000 subs + 4.000 horas de visualización en 12 meses (o 10M de visitas en Shorts en 90 días).', p: true },
      { t: 'Adivina la respuesta (3/3)' },
    ],
    quiz: { q: '¿Qué es el RPM?', ops: ['Reproducciones por minuto', 'Lo que ganas tú por cada 1.000 visitas', 'Lo que paga el anunciante por cada 1.000 anuncios'] },
  },
];

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1080px; height: 1920px; font-family: "Poppins", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.h { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #2a2a2a; }
.foto { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hueco { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 190px;
  background: radial-gradient(900px 1100px at 70% 70%, #5a5a5a 0%, #3a3a3a 45%, #262626 100%); }
.hueco span { border: 4px dashed rgba(255,255,255,.35); border-radius: 30px; padding: 26px 40px; max-width: 760px; text-align: center;
  color: rgba(255,255,255,.7); font-size: 34px; line-height: 1.35; }
/* Texto como el de Instagram: cajas blancas por línea, letra negra, a la izquierda */
.textos { position: absolute; left: 56px; right: 56px; top: 300px; display: flex; flex-direction: column; gap: 46px; }
.caja { text-wrap: balance; font-size: 44px; line-height: 1.5; font-weight: 600; color: #111; letter-spacing: -0.005em; }
.caja span { background: #fff; padding: 8px 22px; border-radius: 16px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.caja.g { font-size: 54px; }
.caja.p { font-size: 36px; font-weight: 500; }
/* Sticker «Cuestionario» simulado (solo en la vista previa) */
.quiz { position: absolute; left: 50%; top: 880px; transform: translateX(-50%); width: 820px; background: #fff; border-radius: 44px; overflow: hidden;
  box-shadow: 0 40px 80px -30px rgba(0,0,0,.6); }
.quiz .q { background: #111; color: #fff; font-weight: 600; font-size: 42px; line-height: 1.28; padding: 44px 50px; text-align: center; }
.quiz .ops { padding: 30px 32px 36px; display: flex; flex-direction: column; gap: 18px; }
.quiz .op { display: flex; align-items: center; gap: 22px; border: 3px solid #e4e4e4; border-radius: 999px; padding: 18px 28px; font-size: 34px; font-weight: 500; color: #111; line-height: 1.25; }
.quiz .op i { flex: none; width: 54px; height: 54px; border-radius: 50%; border: 3px solid #cfcfcf; display: flex; align-items: center; justify-content: center;
  font-style: normal; font-size: 26px; font-weight: 600; color: #8a8a8a; }
`;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function fotoDe(i) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(DIR, 'fotos', `${i + 1}.${ext}`);
    if (fs.existsSync(f)) return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${fs.readFileSync(f).toString('base64')}`;
  }
  return null;
}

function html(h, i, conSticker) {
  const foto = fotoDe(i);
  const fondo = foto ? `<img class="foto" src="${foto}">` : `<div class="hueco"><span>FOTO: ${esc(h.foto)}</span></div>`;
  const textos = h.textos.map(x => `<p class="caja${x.g ? ' g' : ''}${x.p ? ' p' : ''}"><span>${esc(x.t)}</span></p>`).join('');
  const quiz = h.quiz && conSticker
    ? `<div class="quiz"><div class="q">${esc(h.quiz.q)}</div><div class="ops">${h.quiz.ops.map((o, k) => `<div class="op"><i>${'ABCD'[k]}</i>${esc(o)}</div>`).join('')}</div></div>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${FUENTE}${CSS}</style></head>
<body><div class="h">${fondo}<div class="textos">${textos}</div>${quiz}</div></body></html>`;
}

(async () => {
  fs.mkdirSync(path.join(DIR, 'png'), { recursive: true });
  const nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
  const previas = [];
  for (const [i, h] of HISTORIAS.entries()) {
    await pag.setContent(html(h, i, false));
    await pag.evaluate(() => document.fonts.ready);
    await pag.screenshot({ path: path.join(DIR, 'png', `${h.archivo}.png`) });
    await pag.setContent(html(h, i, true));
    await pag.evaluate(() => document.fonts.ready);
    previas.push((await pag.screenshot({ type: 'jpeg', quality: 88 })).toString('base64'));
  }
  // Vista previa: las 5 en fila
  await pag.setViewportSize({ width: 1920, height: 760 });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FUENTE}
    body { margin: 0; background: #f3f3f3; font-family: Poppins, sans-serif; display: flex; gap: 24px; padding: 40px 48px; }
    figure { margin: 0; display: flex; flex-direction: column; gap: 14px; align-items: center; }
    img { width: 342px; height: 608px; border-radius: 22px; box-shadow: 0 20px 40px -18px rgba(0,0,0,.35); }
    figcaption { font-size: 18px; font-weight: 500; color: #111; }</style></head><body>
    ${previas.map((b, k) => `<figure><img src="data:image/jpeg;base64,${b}"><figcaption>${k + 1}</figcaption></figure>`).join('')}
    </body></html>`);
  await pag.evaluate(() => document.fonts.ready);
  await pag.screenshot({ path: path.join(DIR, 'png', 'vista-previa.png') });
  await nav.close();
  console.log('Hecho:', HISTORIAS.map(h => h.archivo).join(', '), '+ vista-previa');
})();
