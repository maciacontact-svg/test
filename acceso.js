// ===== Configuración (editar aquí) =====
// Enlace para compartir del vídeo de Loom (menos de 1 minuto) (https://www.loom.com/share/...)
const LOOM_URL = '';

// ===== Lógica =====
const $ = id => document.getElementById(id);
const bar = $('bar'), pct = $('pct'), player = $('player');
const step1 = $('step1'), step2 = $('step2'), state1 = $('state1');

// Barra "Tu acceso": sube hasta el 90 % al entrar y al 100 % al darle al play
function setProgress(v) {
  bar.style.width = v + '%';
  const from = parseInt(pct.textContent, 10) || 0;
  const t0 = performance.now();
  (function step(t) {
    const k = Math.min(1, (t - t0) / 1200);
    pct.textContent = Math.round(from + (v - from) * (1 - Math.pow(1 - k, 3))) + '%';
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
setTimeout(() => setProgress(90), 300);

// Vídeo
function loomEmbed(link) {
  const m = String(link || '').match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  return m ? `https://www.loom.com/embed/${m[1]}?hide_owner=true&hide_share=true&hide_title=true` : '';
}
const src = loomEmbed(LOOM_URL);
player.innerHTML = src
  ? `<iframe src="${src}" allow="autoplay; fullscreen" allowfullscreen title="Cómo usar tu biblioteca"></iframe>`
  : `<button type="button" class="player-empty" id="fakePlay"><span class="play"></span>Aquí irá tu vídeo de Loom (menos de 1 min)</button>`;

// Sin bloqueos: el botón de la biblioteca funciona siempre.
// Cuando le dan al play, el paso 1 se marca como visto y la barra llega al 100 %.
let played = false;
function markPlayed() {
  if (played) return;
  played = true;
  step1.classList.add('done');
  state1.textContent = 'Visto';
  step2.classList.add('ready');
  setProgress(100);
}

// Loom no avisa del play dentro del iframe: detectamos el clic en el vídeo por el foco
addEventListener('blur', () => { setTimeout(() => { if (document.activeElement && document.activeElement.tagName === 'IFRAME') markPlayed(); }, 0); });
const fake = $('fakePlay');
if (fake) fake.addEventListener('click', () => { markPlayed(); fake.lastChild.textContent = 'Reproduciendo… (vídeo de ejemplo)'; });
