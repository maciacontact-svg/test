// ===== Configuración (editar aquí) =====
// Enlace para compartir del vídeo de Loom de 1 minuto (https://www.loom.com/share/...)
const LOOM_URL = '';
// Segundos hasta que se activa el botón de la biblioteca (duración aproximada del vídeo)
const UNLOCK_SECONDS = 45;

// ===== Lógica =====
const $ = id => document.getElementById(id);
const bar = $('bar'), pct = $('pct'), player = $('player');
const step1 = $('step1'), step2 = $('step2'), state1 = $('state1');
const enterBtn = $('enterBtn'), enterLabel = $('enterLabel'), ring = $('ring');
const step2Text = $('step2Text'), skipLink = $('skipLink');
const RING_LEN = 100.53;

// Barra "Tu acceso": sube hasta el 90 % al entrar y al 100 % cuando se desbloquea la biblioteca
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
  : `<button type="button" class="player-empty" id="fakePlay"><span class="play"></span>Aquí irá tu vídeo de Loom (1 min)</button>`;

// Cuenta atrás: empieza cuando el vídeo está en pantalla (o al darle al play)
let left = UNLOCK_SECONDS, timer = null, unlocked = false;
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
enterLabel.textContent = fmt(left);

function tick() {
  left = Math.max(0, left - 1);
  enterLabel.textContent = fmt(left);
  ring.style.strokeDashoffset = RING_LEN * (left / UNLOCK_SECONDS);
  if (left === 0) unlock();
}
function start() {
  if (timer || unlocked) return;
  timer = setInterval(tick, 1000);
}
function unlock() {
  if (unlocked) return;
  unlocked = true;
  clearInterval(timer);
  step1.classList.add('done');
  state1.textContent = 'Visto';
  step2.classList.remove('locked');
  step2.classList.add('open');
  step2Text.textContent = 'Todo listo. Ya puedes entrar.';
  enterBtn.classList.add('ready');
  enterBtn.removeAttribute('aria-disabled');
  skipLink.classList.add('hide');
  setProgress(100);
}

// Empieza a contar cuando al menos la mitad del vídeo está visible
new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); }, { threshold: 0.5 }).observe($('video'));

// Al hacer clic en el vídeo (Loom no avisa del play dentro del iframe, así que detectamos el foco)
addEventListener('blur', () => { if (document.activeElement && document.activeElement.tagName === 'IFRAME') start(); });
const fake = $('fakePlay');
if (fake) fake.addEventListener('click', () => { start(); fake.lastChild.textContent = 'Reproduciendo… (vídeo de ejemplo)'; });
