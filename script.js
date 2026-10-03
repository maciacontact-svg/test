// ===== Cinta de palabras en movimiento =====
// Cada elemento: { n: 'número destacado (opcional)', t: 'texto' }
(function ticker() {
  const items = [
    { t: 'Nicho y validación' },
    { n: '+176', t: 'canales monetizados' },
    { t: 'Producción con IA' },
    { n: '+488 M', t: 'visitas generadas' },
    { t: 'Retención y crecimiento' },
    { n: '+370', t: 'personas con roadmap' },
    { t: 'Monetización por capas' },
    { n: '15 €', t: 'de RPM medio en nuestros nichos' },
  ];
  const track = document.getElementById('ticker');
  if (!track) return;
  const html = items.map(i =>
    `<span class="tk-item">${i.n ? `<b>${i.n}</b> ` : ''}${i.t}</span>`).join('');
  // Dos copias seguidas para que el bucle no tenga saltos
  track.innerHTML = `<div class="tk-group">${html}</div><div class="tk-group">${html}</div>`;
})();

// ===== Carrusel 3D =====
(function carousel() {
  const slides = [...document.querySelectorAll('.slide')];
  const dots = [...document.querySelectorAll('#dots button')];
  const n = slides.length;
  let current = 1; // empieza en "Roadmap"
  let timer;

  function render() {
    slides.forEach((s, i) => {
      s.classList.remove('is-left', 'is-center', 'is-right');
      const rel = (i - current + n) % n;
      s.classList.add(rel === 0 ? 'is-center' : rel === 1 ? 'is-right' : 'is-left');
    });
    dots.forEach((d, i) => d.classList.toggle('on', i === current));
  }
  function go(i) { current = (i + n) % n; render(); restart(); }
  function restart() { clearInterval(timer); timer = setInterval(() => go(current + 1), 5000); }

  document.querySelector('.nav-btn.prev').addEventListener('click', () => go(current - 1));
  document.querySelector('.nav-btn.next').addEventListener('click', () => go(current + 1));
  dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
  slides.forEach((s, i) => s.addEventListener('click', () => { if (i !== current) go(i); }));

  // Swipe en móvil
  let x0 = null;
  const stage = document.querySelector('.stage');
  stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  render();
  restart();
})();

// ===== Fases del roadmap: pestañas que avanzan solas (el scroll no se bloquea) =====
(function phases() {
  const wrap = document.querySelector('.pz');
  if (!wrap) return;
  const tabs = [...wrap.querySelectorAll('.pz-tab')];
  const panes = [...wrap.querySelectorAll('.pz-pane')];
  const DURATION = 6000; // ms que se queda cada fase
  wrap.style.setProperty('--pz-dur', DURATION + 'ms');
  let current = 0, timer = null, visible = false, hover = false;

  function show(i) {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach((t, k) => {
      const on = k === current;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on);
      // reinicia la barra de progreso
      const bar = t.querySelector('.pz-bar i');
      bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
    });
    panes.forEach((p, k) => p.classList.toggle('on', k === current));
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    const running = visible && !hover;
    wrap.classList.toggle('paused', !running);
    if (running) timer = setTimeout(() => show(current + 1), remaining());
  }
  // tiempo que le queda a la barra actual (para respetar pausas)
  let started = Date.now(), elapsed = 0;
  function remaining() { started = Date.now(); return Math.max(0, DURATION - elapsed); }
  function pause() { elapsed += Date.now() - started; }

  tabs.forEach((t, i) => t.addEventListener('click', () => { elapsed = 0; show(i); }));
  wrap.addEventListener('mouseenter', () => { if (!hover) { pause(); hover = true; schedule(); } });
  wrap.addEventListener('mouseleave', () => { hover = false; schedule(); });

  // cuando cambia de fase sola, el contador vuelve a 0
  const origShow = show;
  show = i => { elapsed = 0; origShow(i); };

  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) wrap.classList.add('in');
    const was = visible;
    visible = e.isIntersecting;
    if (was && !visible) pause();
    schedule();
  }, { threshold: 0.35 }).observe(wrap);
})();


// ===== Origen (utm de ManyChat, enlace de un setter…): se pasa al formulario para saber de dónde viene =====
if (location.search) document.querySelectorAll('a[href="empezar.html"]').forEach(a => { a.href = 'empezar.html' + location.search; });

// ===== Cuenta: si ya rellenó el formulario en este navegador, entra directo a la biblioteca =====
(() => {
  let c = null;
  try { c = JSON.parse(localStorage.getItem('sa-lead') || 'null'); } catch (e) {}
  if (!c || !c.nombre) return;
  document.querySelectorAll('a.cta[href^="empezar.html"]').forEach(a => {
    a.href = 'recursos.html';
    a.textContent = 'Entrar a mi biblioteca';
  });
})();
