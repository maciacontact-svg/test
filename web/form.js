// ===== Preguntas del formulario (editar aquí) =====
const STEPS = [
  {
    id: 'punto',
    title: '¿En qué punto estás ahora mismo?',
    sub: 'Así ordenamos tu biblioteca para que empieces justo por lo que te toca.',
    type: 'choice',
    options: [
      'Empiezo desde cero y quiero aprender',
      'Tengo conocimientos básicos, pero ningún canal con resultados',
      'Ya he empezado y tengo canales funcionando',
      'Tengo canales, pero se han estancado',
    ],
    other: true,
  },
  {
    id: 'inversion',
    title: '¿Cuánto puedes invertir para montar tus canales?',
    sub: 'Herramientas de IA, voz, miniaturas… Con esto te recomendamos la ruta que encaja con tu presupuesto.',
    type: 'choice',
    // Cualificación: la academia parte de 237 €/mes → a partir de "Entre 250 y 500 €" encaja.
    options: [
      'Ahora mismo no tengo nada para invertir',
      'Menos de 150 €',
      'Entre 150 y 250 €',
      'Entre 250 y 500 €',
      'Entre 500 y 1.000 €',
      'Entre 1.000 y 3.000 €',
      'Más de 3.000 €',
    ],
  },
  {
    id: 'objetivo',
    title: '¿Qué quieres conseguir con YouTube faceless?',
    sub: 'No hay respuesta mala: cambia el orden y el ritmo de tu roadmap.',
    type: 'choice',
    options: [
      'Dejar mi empleo y dedicarme a ello por completo',
      'Un ingreso extra que no me quite mucho tiempo',
      'Empezar como extra y pasar a tiempo completo',
      'Construir un activo que me genere ingresos a largo plazo',
    ],
    other: true,
  },
  {
    id: 'meta',
    title: '¿Dónde quieres estar en 3 y 6 meses?',
    sub: 'Con tus palabras, sin mínimo. Cuanto más concreto, mejor te lo preparamos.',
    type: 'text',
    placeholder: 'Ej: generando un ingreso extra para poder permitirme mis caprichos.',
  },
  {
    id: 'cuando',
    title: 'Con tu biblioteca lista, ¿cuándo te pones en marcha?',
    sub: 'Para saber qué ritmo marcarte desde el primer día.',
    type: 'choice',
    options: [
      'Lo antes posible',
      'En las próximas semanas',
      'Por ahora solo tengo curiosidad',
    ],
  },
  {
    id: 'contacto',
    title: '¿A dónde te mandamos el acceso?',
    sub: 'Te damos el código al instante en la pantalla siguiente. El WhatsApp es para entregártelo y resolverte dudas.',
    type: 'contact',
    fields: [
      { name: 'nombre', label: 'Tu nombre', placeholder: 'Nombre y apellido', type: 'text', required: true, autocomplete: 'name' },
      { name: 'whatsapp', label: 'WhatsApp', placeholder: '+34 600 00 00 00', type: 'tel', required: true, autocomplete: 'tel' },
      { name: 'email', label: 'Email', placeholder: 'tu@email.com', type: 'email', required: true, autocomplete: 'email' },
      { name: 'instagram', label: 'Instagram', placeholder: '@tucuenta', type: 'text', required: false },
    ],
    hint: 'Para ver tu negocio antes de hablar contigo y no hacerte repetir lo que ya está ahí.',
    cta: 'Conseguir mi roadmap',
  },
];

const OTHER_LABEL = 'Otro (cuéntamelo)';
const AUTO_ADVANCE_MS = 380;
const NEXT_PAGE = 'acceso.html'; // paso 3 (después, la biblioteca)

// ===== Estado =====
const answers = {};
let step = 0;
let busy = false;

const card = document.getElementById('card');
const inner = document.getElementById('inner');
const countEl = document.getElementById('count');
const progressEl = document.getElementById('progress');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function stepHTML(s) {
  let body = '';
  if (s.type === 'choice') {
    const saved = answers[s.id];
    const opts = s.options.map((o, i) =>
      `<button type="button" class="opt${saved === o ? ' on' : ''}" style="--i:${i}" data-value="${esc(o)}">${esc(o)}</button>`);
    if (s.other) {
      const isOther = saved && !s.options.includes(saved);
      opts.push(`<button type="button" class="opt other${isOther ? ' on' : ''}" style="--i:${s.options.length}" data-other>${OTHER_LABEL}</button>`);
      opts.push(`<input class="input other-input${isOther ? ' show' : ''}" data-other-input placeholder="Cuéntanos en una línea" value="${isOther ? esc(saved) : ''}">`);
    }
    body = `<div class="opts">${opts.join('')}</div>`;
  } else if (s.type === 'text') {
    body = `<textarea class="input" name="${s.id}" placeholder="${esc(s.placeholder)}">${esc(answers[s.id] || '')}</textarea>`;
  } else if (s.type === 'contact') {
    const saved = answers[s.id] || {};
    body = s.fields.map(f => `
      <div class="field">
        <label class="lbl" for="f-${f.name}">${esc(f.label)}</label>
        <input class="input" id="f-${f.name}" name="${f.name}" type="${f.type}" placeholder="${esc(f.placeholder)}"
          ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''} ${f.required ? 'required' : ''} value="${esc(saved[f.name] || '')}">
      </div>`).join('') + `<p class="hint">${esc(s.hint)}</p>`;
  }
  return `
    <h1>${esc(s.title)}</h1>
    <p class="sub">${esc(s.sub)}</p>
    ${body}
    <div class="actions">
      <button type="button" class="back" ${step === 0 ? 'hidden' : ''}>Atrás</button>
      <button type="submit" class="next">${esc(s.cta || 'Continuar')}</button>
    </div>`;
}

function updateHeader() {
  countEl.textContent = `Paso ${step + 1} de ${STEPS.length}`;
  progressEl.style.width = `${((step + 1) / STEPS.length) * 100}%`;
}

// Cambio de paso con animación: el contenido sale, la tarjeta ajusta su altura y entra el nuevo
function render(animate = true) {
  const s = STEPS[step];
  if (!animate) {
    inner.innerHTML = stepHTML(s);
    inner.className = 'card-inner in';
    updateHeader();
    focusFirst();
    return;
  }
  busy = true;
  const from = card.offsetHeight;
  inner.classList.remove('in');
  inner.classList.add('out');
  setTimeout(() => {
    inner.innerHTML = stepHTML(s);
    inner.classList.remove('out');
    card.style.height = 'auto';
    const to = card.offsetHeight;
    card.style.height = from + 'px';
    card.offsetHeight; // fuerza reflow
    card.style.height = to + 'px';
    updateHeader();
    setTimeout(() => {
      inner.classList.add('in');
      focusFirst();
    }, 120);
    setTimeout(() => { card.style.height = 'auto'; busy = false; }, 470);
  }, 280);
}

function focusFirst() {
  const el = inner.querySelector('textarea, input.input:not(.other-input)');
  if (el && matchMedia('(hover: hover)').matches) el.focus({ preventScroll: true });
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// Valida y guarda el paso actual. Devuelve true si se puede avanzar.
function collect() {
  const s = STEPS[step];
  if (s.type === 'choice') {
    const on = inner.querySelector('.opt.on');
    if (!on) { shake(inner.querySelector('.opts')); return false; }
    if (on.hasAttribute('data-other')) {
      const inp = inner.querySelector('[data-other-input]');
      if (!inp.value.trim()) { inp.classList.add('err'); shake(inp); inp.focus(); return false; }
      answers[s.id] = inp.value.trim();
    } else {
      answers[s.id] = on.dataset.value;
    }
    return true;
  }
  if (s.type === 'text') {
    const ta = inner.querySelector('textarea');
    if (!ta.value.trim()) { ta.classList.add('err'); shake(ta); ta.focus(); return false; }
    answers[s.id] = ta.value.trim();
    return true;
  }
  if (s.type === 'contact') {
    const data = {};
    let ok = true;
    s.fields.forEach(f => {
      const inp = inner.querySelector(`[name="${f.name}"]`);
      const v = inp.value.trim();
      const bad = (f.required && !v) || (f.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v));
      inp.classList.toggle('err', bad);
      if (bad && ok) { shake(inp); inp.focus(); ok = false; }
      data[f.name] = v;
    });
    if (ok) answers[s.id] = data;
    return ok;
  }
  return true;
}

function next() {
  if (busy || !collect()) return;
  if (step < STEPS.length - 1) { step++; render(); }
  else finish();
}

function back() {
  if (busy || step === 0) return;
  step--;
  render();
}

function finish() {
  // Aquí se enviarán las respuestas (email, Google Sheets, CRM...). De momento solo se muestran en consola.
  console.log('Respuestas del formulario:', answers);
  busy = true;
  inner.classList.remove('in');
  inner.classList.add('out');
  setTimeout(() => {
    inner.innerHTML = `
      <div class="done">
        <div class="check"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1>¡Listo, ${esc((answers.contacto?.nombre || '').split(' ')[0] || 'ya está')}!</h1>
        <p class="sub">Preparando tu acceso…</p>
      </div>`;
    inner.classList.remove('out');
    inner.classList.add('in');
    setTimeout(() => { location.href = NEXT_PAGE; }, 1600);
  }, 280);
}

// ===== Eventos =====
inner.addEventListener('click', e => {
  const opt = e.target.closest('.opt');
  if (opt) {
    inner.querySelectorAll('.opt').forEach(o => o.classList.toggle('on', o === opt));
    const otherInp = inner.querySelector('[data-other-input]');
    if (opt.hasAttribute('data-other')) {
      otherInp.classList.add('show');
      otherInp.focus();
    } else {
      if (otherInp) otherInp.classList.remove('show');
      setTimeout(next, AUTO_ADVANCE_MS); // avanza solo al elegir
    }
    return;
  }
  if (e.target.closest('.back')) back();
});

inner.addEventListener('input', e => e.target.classList.remove('err'));

card.addEventListener('submit', e => { e.preventDefault(); next(); });

// Enter en el textarea avanza (Shift+Enter hace salto de línea)
inner.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA' && !e.shiftKey) { e.preventDefault(); next(); }
});

render(false);
