// ===== Cifras en arco =====
(function arcMarquee() {
  const tp = document.getElementById('arcTextPath');
  if (!tp) return;
  const items = [
    'Escalamos infoproductos a +1M/año',
    "9'7 de satisfacción media",
    "+2'5M€ generados para clientes",
    '+12 ofertas +100k',
  ];
  const segment = items.map(t => t + '   ✦   ').join('');
  tp.textContent = segment.repeat(4);

  // Longitud de un segmento para que el bucle sea continuo
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  probe.setAttribute('class', 'arc-text');
  probe.textContent = segment;
  tp.ownerSVGElement.appendChild(probe);
  const segLen = probe.getComputedTextLength() || 900;
  probe.remove();

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let offset = 0;
  const speed = 0.35; // px por frame
  function tick() {
    offset -= speed;
    if (offset <= -segLen) offset += segLen;
    tp.setAttribute('startOffset', offset);
    if (!reduce) requestAnimationFrame(tick);
  }
  tick();
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

// ===== Roadmap: línea que se dibuja con el scroll =====
(function roadmap() {
  const section = document.getElementById('roadmap');
  const svg = section.querySelector('.road-svg');
  const bg = svg.querySelector('.road-bg');
  const fg = svg.querySelector('.road-fg');
  const steps = [...section.querySelectorAll('.step')];
  let len = 0;

  function buildPath() {
    const w = section.clientWidth;
    const h = section.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const sRect = section.getBoundingClientRect();

    const pts = [[w * 0.5, 0]];
    steps.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const left = r.left - sRect.left;
      const top = r.top - sRect.top - (el.classList.contains('in') ? 0 : 40);
      const x = left + r.width * (i % 2 ? 0.38 : 0.72);
      pts.push([x, top + r.height * 0.5]);
    });
    pts.push([w * 0.5, h]);

    // Catmull-Rom → curvas Bézier suaves
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const t = 0.5;
      const c1 = [p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3];
      const c2 = [p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3];
      d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
    }
    bg.setAttribute('d', d);
    fg.setAttribute('d', d);
    len = fg.getTotalLength();
    fg.style.strokeDasharray = len;
    update();
  }

  function update() {
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    const progress = Math.min(1, Math.max(0, (vh * 0.6 - r.top) / r.height));
    fg.style.strokeDashoffset = len * (1 - progress);
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.3 });
  steps.forEach(s => io.observe(s));

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', buildPath);
  document.fonts ? document.fonts.ready.then(buildPath) : window.addEventListener('load', buildPath);
  buildPath();
})();
