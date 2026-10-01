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
    title: '¿Cuánto podrías dedicar al mes a hacer crecer tus canales?',
    sub: 'Herramientas, IA, formación… Así te recomendamos la ruta que encaja con tu ritmo.',
    type: 'choice',
    // Cualificación: la academia parte de 237 €/mes → encaja a partir de "Entre 200 y 400 € al mes".
    options: [
      'Ahora mismo, nada',
      'Menos de 100 € al mes',
      'Entre 100 y 200 € al mes',
      'Entre 200 y 400 € al mes',
      'Entre 400 y 800 € al mes',
      'Más de 800 € al mes',
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
    sub: 'Tu acceso a la biblioteca se abre al instante en la pantalla siguiente. Por WhatsApp confirmamos que has entrado bien y te enviamos recursos adaptados a ti.',
    type: 'contact',
    fields: [
      { name: 'nombre', label: 'Tu nombre', placeholder: 'Tu nombre', type: 'text', required: true, autocomplete: 'name' },
      { name: 'whatsapp', label: 'WhatsApp', placeholder: '+34 654 32 19 87', type: 'tel', required: true, autocomplete: 'tel' },
      { name: 'email', label: 'Email', placeholder: 'tu@email.com', type: 'email', required: true, autocomplete: 'email' },
      { name: 'instagram', label: 'Instagram', placeholder: '@tucuenta', type: 'text', required: false },
    ],
    hint: 'Opcional. Si ya tienes canal o cuenta, lo revisamos para que lo que te enviemos encaje con lo que ya haces.',
    cta: 'Conseguir mi roadmap',
  },
];

const OTHER_LABEL = 'Otro (cuéntamelo)';
const AUTO_ADVANCE_MS = 380;
const NEXT_PAGE = 'acceso.html'; // paso 3 (después, la biblioteca)
const CALL_PAGE = 'llamada.html'; // si cualifica: antes del paso 3 se le ofrece agendar llamada

// ===== Cualificación (editar aquí) =====
// Cualifica quien cumple TODAS las condiciones: su respuesta tiene que estar en la lista de cada pregunta.
const CUALIFICA = {
  inversion: ['Entre 200 y 400 € al mes', 'Entre 400 y 800 € al mes', 'Más de 800 € al mes'],
  cuando: ['Lo antes posible', 'En las próximas semanas'],
};
const cualifica = () => Object.keys(CUALIFICA).every(k => CUALIFICA[k].includes(answers[k]));

// ===== Validación de datos de contacto (evita datos inventados) =====
const JUNK = ['asdf', 'qwer', 'qwerty', 'test', 'prueba', 'nombre', 'apellido', 'xxx', 'aaa', 'hola', 'fake', 'nadie', 'no tengo'];
const DISPOSABLE = ['mailinator.com', 'yopmail.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'fakeinbox.com'];
const TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.es': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cmo': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmil.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'icloud.con': 'icloud.com',
};
const onlyDigits = s => s.replace(/\D/g, '');
const allSame = s => s.length > 1 && /^(.)\1+$/.test(s);
const isSequence = d => '01234567890123456789'.includes(d) || '98765432109876543210'.includes(d);

function validateName(v) {
  const words = v.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!words.length) return 'Escribe tu nombre.';
  for (const w of words) {
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿÑñ'’-]{2,}$/.test(w)) return 'Escribe tu nombre real, solo con letras (mínimo 2).';
    const low = w.toLowerCase();
    if (allSame(low) || !/[aeiouáéíóúüy]/i.test(low)) return 'Ese nombre no parece real. Escribe tu nombre.';
  }
  const all = words.join(' ').toLowerCase();
  if (JUNK.some(x => all.includes(x))) return 'Ese nombre no parece real. Escribe tu nombre.';
  return '';
}

function validateEmail(v) {
  const e = v.trim().toLowerCase();
  if (!e) return 'Escribe tu email.';
  const m = e.match(/^([a-z0-9._%+-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})$/);
  if (!m) return 'Revisa el email: debe tener el formato nombre@gmail.com.';
  const [, local, domain] = m;
  if (TYPOS[domain]) return `¿Quisiste decir ${local}@${TYPOS[domain]}?`;
  if (DISPOSABLE.includes(domain)) return 'Usa tu email personal (los emails temporales no sirven).';
  if (local.length < 3 || allSame(onlyDigits(local) || local.replace(/[._-]/g, '')) || JUNK.some(x => local.startsWith(x)))
    return 'Ese email no parece real. Usa el que revisas a diario.';
  return '';
}

function validatePhone(v) {
  const raw = v.trim();
  let d = onlyDigits(raw);
  if (!d) return 'Escribe tu número de WhatsApp.';
  const intl = raw.startsWith('+') || raw.startsWith('00');
  if (raw.startsWith('00')) d = d.slice(2);
  // España: 9 dígitos que empiezan por 6 o 7 (con o sin +34)
  let national = d;
  if (d.startsWith('34') && d.length === 11) national = d.slice(2);
  if (!intl || d.startsWith('34')) {
    if (national.length !== 9) return 'El número debe tener 9 cifras (o añade el prefijo, p. ej. +52…).';
    if (!/^[67]/.test(national)) return 'Pon un móvil con WhatsApp (empieza por 6 o 7).';
  } else if (d.length < 8 || d.length > 15) {
    return 'Revisa el número: con el prefijo del país, entre 8 y 15 cifras.';
  }
  const body = national.slice(1);
  if (allSame(national) || allSame(body) || isSequence(national) || isSequence(body) || /(\d)\1{5,}/.test(national))
    return 'Ese número no parece real. Lo usaremos para enviarte el acceso.';
  return '';
}

function validateInstagram(v) {
  const s = v.trim();
  if (!s) return '';
  if (!/^@?(?!.*\.\.)(?!\.)[A-Za-z0-9._]{2,30}$/.test(s) || /^@?[._]+$/.test(s)) return 'Revisa tu usuario de Instagram (p. ej. @tucuenta).';
  return '';
}

function validateField(f, v) {
  if (f.name === 'nombre') return validateName(v);
  if (f.name === 'email') return validateEmail(v);
  if (f.name === 'whatsapp') return validatePhone(v);
  if (f.name === 'instagram') return validateInstagram(v);
  return f.required && !v.trim() ? 'Este campo es obligatorio.' : '';
}

function showFieldError(inp, msg) {
  inp.classList.toggle('err', !!msg);
  const p = document.getElementById('e-' + inp.name);
  if (p) p.textContent = msg || '';
}

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
        <p class="field-err" id="e-${f.name}" aria-live="polite"></p>
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
    inner.className = 'card-inner';
    updateHeader();
    focusFirst();
    return;
  }
  busy = true;
  const from = card.offsetHeight;
  inner.classList.add('out');            // 1) el contenido se desvanece
  setTimeout(() => {
    inner.innerHTML = stepHTML(s);       // 2) se cambia mientras está invisible
    card.style.height = 'auto';
    const to = card.offsetHeight;
    card.style.height = from + 'px';
    card.offsetHeight; // fuerza reflow
    card.style.height = to + 'px';       //    la tarjeta ajusta su altura
    updateHeader();
    requestAnimationFrame(() => {
      inner.classList.remove('out');     // 3) aparece todo a la vez con un único fundido
      focusFirst();
    });
    setTimeout(() => { card.style.height = 'auto'; busy = false; }, 460);
  }, 180);
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
      const msg = validateField(f, inp.value);
      showFieldError(inp, msg);
      if (msg && ok) { shake(inp); inp.focus(); ok = false; }
      data[f.name] = inp.value.trim();
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

// Envía el lead al CRM (Google Sheets + Slack). keepalive: el envío sigue aunque se cambie de página.
function sendLead(id, buenForm) {
  const url = (window.SA_CONFIG || {}).API_URL;
  const c = answers.contacto || {};
  const lead = {
    action: 'lead', id, cualifica: buenForm,
    nombre: c.nombre, telefono: c.whatsapp, correo: c.email, instagram: c.instagram || '',
    punto: answers.punto, objetivo: answers.objetivo, inversion: answers.inversion,
    meta: answers.meta, cuando: answers.cuando,
    origen: location.search.slice(1),
  };
  if (!url) { console.log('CRM sin configurar (config.js). Lead:', lead); return; }
  try {
    fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(lead) });
  } catch (e) { console.error(e); }
}

// ID aleatorio del lead: la página de llamada lo usa para marcarlo como agendado en el CRM
function nuevoId() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, b => (b % 36).toString(36)).join('');
}

function finish() {
  const id = nuevoId(), buenForm = cualifica();
  sendLead(id, buenForm);
  const c = answers.contacto || {};
  try { sessionStorage.setItem('sa-lead', JSON.stringify({ id, nombre: c.nombre, correo: c.email })); } catch (e) {}
  busy = true;
  inner.classList.add('out');
  setTimeout(() => {
    inner.innerHTML = `
      <div class="done">
        <div class="check"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1>¡Listo, ${esc((answers.contacto?.nombre || '').split(' ')[0] || 'ya está')}!</h1>
        <p class="sub">${buenForm ? 'Revisando tus respuestas…' : 'Preparando tu acceso…'}</p>
      </div>`;
    requestAnimationFrame(() => inner.classList.remove('out'));
    setTimeout(() => { location.href = buenForm ? CALL_PAGE : NEXT_PAGE; }, 1600);
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

inner.addEventListener('input', e => { if (e.target.name) showFieldError(e.target, ''); else e.target.classList.remove('err'); });
inner.addEventListener('focusout', e => {
  const s = STEPS[step];
  if (s.type !== 'contact' || !e.target.name) return;
  const f = s.fields.find(x => x.name === e.target.name);
  if (f && e.target.value.trim()) showFieldError(e.target, validateField(f, e.target.value));
});

card.addEventListener('submit', e => { e.preventDefault(); next(); });

// Enter en el textarea avanza (Shift+Enter hace salto de línea)
inner.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA' && !e.shiftKey) { e.preventDefault(); next(); }
});

render(false);
