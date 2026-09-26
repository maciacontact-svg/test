// ===== Preguntas del formulario (editar aquí) =====
const STEPS = [
  {
    id: 'vende',
    title: '¿Qué vendes ahora mismo?',
    sub: 'Con esto sabemos qué parte del roadmap te sirve y cuál te sobra.',
    type: 'choice',
    options: ['Un infoproducto, curso o mentoría', 'Consultoría o servicios high ticket', 'Aún no he lanzado nada'],
    other: true,
  },
  {
    id: 'facturacion',
    title: '¿Cuánto te está entrando al mes con esto?',
    sub: 'Es el dato que más cambia tu roadmap. Sé honesto contigo, esto no lo ve nadie más.',
    type: 'choice',
    options: ['Aún no estoy vendiendo esto de forma constante', 'Entre 3.000 y 10.000 €', 'Entre 10.000 y 30.000 €', 'Entre 30.000 y 100.000 €', 'Entre 100.000 y 250.000 €', 'Más de 250.000 €'],
  },
  {
    id: 'prioridad',
    title: 'Si pudieras arreglar una sola cosa este mes, ¿cuál sería?',
    sub: 'El roadmap se reordena según esto, así que elige la que más te movería el negocio.',
    type: 'choice',
    options: ['Que entren más leads cualificados', 'Cerrar más de los que ya hablan conmigo', 'Que esto no dependa de mí para funcionar', 'Que mi contenido atraiga al cliente que quiero', 'Saber qué toca ahora y dónde se me escapa el dinero'],
    other: true,
  },
  {
    id: 'objetivo',
    title: '¿Dónde quieres estar en 12 meses?',
    sub: 'Una línea basta. Cuanto más concreto, más útil es lo que te preparamos.',
    type: 'text',
    placeholder: 'Ejemplo: llegar a 50.000 al mes sin depender de mí para vender',
  },
  {
    id: 'canal',
    title: '¿De dónde te llegan los clientes ahora?',
    sub: 'Marca lo principal. Si es una mezcla, elige lo que más te trae.',
    type: 'choice',
    options: ['Mi contenido en redes (IG, YouTube, TikTok)', 'Mensajes y DMs que mando yo', 'Publicidad de pago', 'Referidos y mi red de contactos', 'Todavía no tengo un canal que funcione'],
    other: true,
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
const NEXT_PAGE = 'recursos.html'; // paso 3

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
        <p class="sub">Te llevamos a tu biblioteca de recursos…</p>
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
