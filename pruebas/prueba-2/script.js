// ===== Cinta de palabras en movimiento =====
// Cada elemento: { n: 'número destacado (opcional)', t: 'texto' }
(function ticker() {
  const items = [
    { t: 'Escalamos infoproductos a +1M/año' },
    { n: "9'7", t: 'de satisfacción media' },
    { t: 'Posicionamiento y mensaje' },
    { n: "+2'5M€", t: 'generados para clientes' },
    { t: 'Ofertas que escalan' },
    { n: '+12', t: 'ofertas de +100k' },
    { t: 'Sistemas de conversión' },
    { n: '+150', t: 'personas escaladas' },
    { t: 'Producto y casos de éxito' },
    { n: '4', t: 'fases del roadmap' },
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

// ===== Fases del roadmap: tarjetas que se apilan + índice que avanza =====
(function phases() {
  const cards = [...document.querySelectorAll('.ph-card')];
  const links = [...document.querySelectorAll('#phIndex button')];
  const fill = document.getElementById('phFill');
  const wrap = document.getElementById('phCards');
  if (!cards.length) return;

  function update() {
    const vh = innerHeight;
    let active = 0;
    cards.forEach((c, i) => {
      const next = cards[i + 1];
      // cuánto ha subido la siguiente tarjeta sobre esta (0 → 1)
      let cover = 0;
      if (next) {
        const a = c.getBoundingClientRect();
        const b = next.getBoundingClientRect();
        cover = Math.min(1, Math.max(0, 1 - (b.top - a.top) / a.height));
      }
      c.style.setProperty('--cover', cover.toFixed(3));
      if (c.getBoundingClientRect().top < vh * 0.55) active = i;
    });
    links.forEach((l, i) => {
      l.classList.toggle('on', i === active);
      l.classList.toggle('done', i < active);
    });
    const r = wrap.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (vh * 0.5 - r.top) / (r.height - vh * 0.4)));
    fill.style.transform = `scaleY(${p})`;
  }

  links.forEach((l, i) => l.addEventListener('click', () => {
    // posición natural de la tarjeta (sin el efecto "sticky")
    let y = wrap.getBoundingClientRect().top + scrollY;
    for (let k = 0; k < i; k++) y += cards[k].offsetHeight + parseFloat(getComputedStyle(wrap).rowGap || 0);
    scrollTo({ top: y - 110 - i * 18, behavior: 'smooth' });
  }));

  // Aparición suave de cada tarjeta
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.2 });
  cards.forEach(c => io.observe(c));

  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
})();
