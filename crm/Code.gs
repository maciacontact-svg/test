/** @OnlyCurrentDoc */

/**
 * System Academy · CRM
 * Google Apps Script que vive dentro de tu Google Sheet (Extensiones → Apps Script).
 *
 *  - Recibe los leads del formulario de la web y los guarda en la pestaña "Leads".
 *  - Avisa por Slack al momento, y otra vez si a los X minutos nadie ha llamado.
 *  - Sirve los datos al dashboard del equipo (crm.html) con acceso por nombre + PIN.
 *    El equipo NUNCA necesita acceso al Sheet: solo tú lo tienes.
 *
 * Instalación paso a paso: crm/LEEME.md
 */

const TZ = 'Europe/Madrid';
const HOJA_LEADS = 'Leads';
const HOJA_AJUSTES = 'Ajustes';

// Columnas de "Leads". Las 11 primeras son las visibles; el resto van ocultas (datos extra del formulario).
const COL = {
  fecha: 1, nombre: 2, telefono: 3, punto: 4, objetivo: 5, correo: 6,
  caller: 7, estado: 8, contacto: 9, intentos: 10, notas: 11,
  id: 12, inversion: 13, meta: 14, cuando: 15, instagram: 16, origen: 17, aviso: 18,
  cualifica: 19, autoagenda: 20, rellamar: 21, rellamarAviso: 22, asignado: 23, embudo: 24,
};
const CABECERA = [
  'Fecha registro', 'Nombre', 'Teléfono', 'En qué punto está', 'Qué quiere conseguir', 'Correo',
  'Caller', 'Estado', 'Contacto', 'Nº intentos', 'Notas',
  'ID', 'Inversión al mes', 'Meta a 3-6 meses', 'Cuándo empieza', 'Instagram', 'Origen', 'Aviso Slack',
  'Buen form', 'Autoagendado (Calendly)', 'Volver a llamar (hora)', 'Aviso rellamada', 'Asignado el', 'Embudo',
];
const VISIBLES = 11;

const ESTADOS = ['Contactado', 'Volver a llamar', 'Seguimiento', 'Perdido', 'Nutricion', 'Agendado', 'Invalid'];
const COLORES = { // fondo, texto (los mismos tonos que tu hoja de cold calling)
  'Contactado': ['#fce8b2', '#6b4e00'], 'Volver a llamar': ['#f6c27a', '#4d2e00'],
  'Seguimiento': ['#cfe2f6', '#1b4f8a'], 'Perdido': ['#f8d0cb', '#a52714'],
  'Nutricion': ['#e4d7f3', '#5b3a8c'], 'Agendado': ['#2f6b4f', '#e2f4e6'], 'Invalid': ['#e6e6e6', '#333333'],
};
const CONTACTO = ['✅', '❌'];
const EMBUDO = ['', 'Conversación', 'Oferta llamada'];   // además de Contactado (intentos), Respondió (✅) y Agendado (estado)
const CIERRAN = ['Agendado', 'Perdido', 'Invalid'];       // estados que quitan la hora de volver a llamar

// Celdas de la pestaña "Ajustes"
const AJ = { callers: 'A2:A', pins: 'B2:B', estados: 'D2:D', webhook: 'G2', crmUrl: 'G3', minutos: 'G4', mencion: 'G5', calendly: 'G6', maestro: 'G7', maestroPin: 'G8' };

// =====================================================================
// Web app: el formulario y el dashboard hablan con estas dos funciones
// =====================================================================
function doGet() {
  return json({ ok: true, app: 'System Academy CRM' });
}

function doPost(e) {
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json({ ok: false, error: 'Petición no válida' }); }
  try {
    switch (b.action) {
      case 'lead':   return json(nuevoLead(b));
      case 'agendado': return json(autoagendado(b));
      case 'cuenta': return json(buscarCuenta(b));
      case 'login':  { const u = auth(b); return json({ ok: true, caller: u.nombre, rol: u.rol }); }
      case 'list':   { const u = auth(b); return json(Object.assign(listar(), { rol: u.rol })); }
      case 'update': return json(actualizar(b, auth(b).nombre));
    }
    return json({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// Leads nuevos (desde el formulario)
// =====================================================================
function nuevoLead(b) {
  const nombre = limpio(b.nombre, 80), telefono = limpio(b.telefono, 40);
  if (!nombre || !telefono) throw new Error('Faltan nombre o teléfono');

  const lead = {
    id: /^[a-z0-9]{8,24}$/i.test(String(b.id || '')) ? String(b.id) : Utilities.getUuid().slice(0, 8),
    fecha: new Date(),
    nombre: nombre, telefono: telefono,
    punto: limpio(b.punto, 200), objetivo: limpio(b.objetivo, 200), correo: limpio(b.correo, 120),
    caller: '', estado: '', contacto: '❌', intentos: 0, notas: '',
    inversion: limpio(b.inversion, 80), meta: limpio(b.meta, 1000), cuando: limpio(b.cuando, 80),
    instagram: limpio(b.instagram, 80), origen: limpio(b.origen, 200), aviso: '',
    cualifica: b.cualifica === true ? 'Sí' : 'No', autoagenda: '',
    rellamar: '', rellamarAviso: '', asignado: '', embudo: '',
  };

  const fila = new Array(CABECERA.length).fill('');
  Object.keys(COL).forEach(k => { fila[COL[k] - 1] = celda(lead[k]); });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { hoja(HOJA_LEADS).appendRow(fila); }
  finally { lock.releaseLock(); }

  try { avisarSlack(lead); } catch (err) { console.error('Slack: ' + err); }
  return { ok: true, id: lead.id };
}

// =====================================================================
// Autoagendado: el lead ha reservado él solo en Calendly (desde llamada.html o agendar.html)
// → Estado "Agendado", SIN caller (y el dashboard no deja ponérselo).
// =====================================================================
function autoagendado(b) {
  const id = String(b.id || '');
  const conId = /^[a-z0-9]{8,24}$/i.test(id);
  if (!conId && !b.invitado) throw new Error('Lead no válido');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let f, cuando;
  try {
    const sh = hoja(HOJA_LEADS);
    let fila = conId ? buscarFila(sh, id) : 0;
    // Sin ID (p. ej. agenda desde la biblioteca en otro dispositivo): se busca por el email de Calendly
    let inv = null;
    if (!fila) {
      inv = invitadoCalendly(b.invitado);
      if (!inv && !conId) throw new Error('Lead no válido: no se ha podido identificar (revisa el token de Calendly en Ajustes → G6)');
      if (inv && inv.correo) fila = buscarCorreo(sh, inv.correo);
      if (!fila && inv && !conId) fila = leadDesdeCalendly(sh, inv);   // nunca rellenó el formulario
    }
    if (!fila) throw new Error('Lead no encontrado');
    f = sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
    if (f[COL.autoagenda - 1]) return { ok: true, repetido: true };
    cuando = horaLlamada(b.evento);
    const marca = cuando ? 'Llamada ' + cuando : 'Reservado ' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm');
    sh.getRange(fila, COL.autoagenda).setValue(marca);
    sh.getRange(fila, COL.estado).setValue('Agendado');
    sh.getRange(fila, COL.caller).setValue('');
    const notas = String(f[COL.notas - 1] || '');
    sh.getRange(fila, COL.notas).setValue(celda('📅 Autoagendado por Calendly · ' + marca + (notas ? '\n' + notas : '')));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  try {
    enviarSlack({
      text: '📅 ' + f[COL.nombre - 1] + ' ha agendado su llamada',
      blocks: [
        { type: 'section', text: md(mencion() + '📅 *' + esc(f[COL.nombre - 1]) + '* ha agendado él solo su llamada' +
          (cuando ? ' · *' + cuando + '*' : '') + '\n' + (f[COL.telefono - 1] ? telefonoSlack(String(f[COL.telefono - 1])) : esc(f[COL.correo - 1])) +
          ' · _Autoagendado: sin caller_') },
        botonCrm(),
      ].filter(Boolean),
    });
  } catch (err) { console.error('Slack: ' + err); }
  return { ok: true };
}

// "Ya tengo cuenta": entra a la biblioteca con el email con el que rellenó el formulario (sin repetirlo)
function buscarCuenta(b) {
  const correo = limpio(b.correo, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(correo)) throw new Error('Email no válido');
  const cache = CacheService.getScriptCache();
  const k = 'cuenta_' + correo, n = Number(cache.get(k) || 0), tot = Number(cache.get('cuenta_total') || 0);
  if (n >= 8 || tot >= 300) throw new Error('Demasiados intentos. Prueba en unos minutos.');
  cache.put(k, String(n + 1), 600);
  cache.put('cuenta_total', String(tot + 1), 600);
  const sh = hoja(HOJA_LEADS);
  const fila = buscarCorreo(sh, correo);
  if (!fila) return { ok: false, error: 'No encontrado' };
  const f = sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
  return { ok: true, id: String(f[COL.id - 1]), nombre: String(f[COL.nombre - 1]).trim().split(' ')[0] };
}

function buscarCorreo(sh, correo) {
  const n = sh.getLastRow() - 1;
  if (n < 1 || !correo) return 0;
  const c = sh.getRange(2, COL.correo, n, 1).getValues();
  for (let i = n - 1; i >= 0; i--) if (String(c[i][0]).trim().toLowerCase() === correo) return i + 2;
  return 0;
}

// Lead nuevo con los datos de Calendly (agendó sin pasar por el formulario)
function leadDesdeCalendly(sh, inv) {
  const lead = {
    id: Utilities.getUuid().slice(0, 8), fecha: new Date(),
    nombre: inv.nombre || inv.correo, telefono: inv.telefono, correo: inv.correo,
    punto: '', objetivo: '', caller: '', estado: '', contacto: '❌', intentos: 0, notas: '',
    inversion: '', meta: '', cuando: '', instagram: '', origen: 'Calendly (sin formulario)', aviso: '—',
    cualifica: 'No', autoagenda: '', rellamar: '', rellamarAviso: '', asignado: '', embudo: '',
  };
  const fila = new Array(CABECERA.length).fill('');
  Object.keys(COL).forEach(k => { fila[COL[k] - 1] = celda(lead[k]); });
  sh.appendRow(fila);
  return sh.getLastRow();
}

// Datos del invitado en Calendly (necesita el token de Ajustes → G6)
function invitadoCalendly(uri) {
  const j = calendlyGet(uri, /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+\/invitees\/[A-Za-z0-9-]+$/);
  if (!j || !j.resource) return null;
  const r = j.resource;
  let tel = r.text_reminder_number || '';
  (r.questions_and_answers || []).forEach(q => {
    if (!tel && /tel[eé]fono|whatsapp|m[oó]vil|phone/i.test(q.question || '')) tel = q.answer || '';
  });
  return { nombre: limpio(r.name, 80), correo: limpio(r.email, 120).toLowerCase(), telefono: limpio(tel, 40) };
}

function calendlyGet(uri, patron) {
  const token = String(hoja(HOJA_AJUSTES).getRange(AJ.calendly).getValue()).trim();
  uri = String(uri || '');
  if (!token || token.length < 20 || !patron.test(uri)) return null;
  try {
    const r = UrlFetchApp.fetch(uri, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { console.error('Calendly respondió ' + r.getResponseCode()); return null; }
    return JSON.parse(r.getContentText());
  } catch (err) { console.error('Calendly: ' + err); return null; }
}

// Fecha y hora de la llamada (solo si has pegado tu token de Calendly en Ajustes → G6)
function horaLlamada(evento) {
  const j = calendlyGet(evento, /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+$/);
  const t = j && j.resource && j.resource.start_time;
  return t ? Utilities.formatDate(new Date(t), TZ, 'dd/MM HH:mm') : '';
}

// =====================================================================
// Dashboard: acceso, lectura y cambios
// =====================================================================
function auth(b) {
  const nombre = String(b.caller || '').trim().toUpperCase();
  const pin = String(b.pin || '').trim();
  const cache = CacheService.getScriptCache();
  const k = 'fallos_' + nombre;
  const fallos = Number(cache.get(k) || 0);
  if (fallos >= 5) throw new Error('Demasiados intentos. Espera 10 minutos.');

  const m = maestro();
  if (m.nombre && m.pin && nombre === m.nombre.toUpperCase() && pin === m.pin) {
    cache.remove(k);
    return { nombre: m.nombre, rol: 'maestro' };
  }
  const p = equipo().find(x => x.nombre.toUpperCase() === nombre && x.pin === pin);
  if (!nombre || !pin || !p) {
    cache.put(k, String(fallos + 1), 600);
    throw new Error('Nombre o PIN incorrectos');
  }
  cache.remove(k);
  return { nombre: p.nombre, rol: 'caller' };
}

// Acceso maestro (solo el fundador): Ajustes → G7 nombre, G8 PIN. Ve los KPIs de todos los callers.
function maestro() {
  const aj = hoja(HOJA_AJUSTES);
  return { nombre: String(aj.getRange(AJ.maestro).getDisplayValue()).trim(), pin: String(aj.getRange(AJ.maestroPin).getDisplayValue()).trim() };
}

function listar() {
  const sh = hoja(HOJA_LEADS);
  const n = sh.getLastRow() - 1;
  const leads = [];
  if (n > 0) {
    const rango = sh.getRange(2, 1, n, CABECERA.length);
    const datos = rango.getValues();
    let cambios = false;
    datos.forEach((f, i) => {
      if (!f[COL.nombre - 1] && !f[COL.telefono - 1]) return;          // fila vacía
      if (!f[COL.id - 1]) {                                               // fila añadida a mano: le damos ID
        f[COL.id - 1] = Utilities.getUuid().slice(0, 8);
        sh.getRange(i + 2, COL.id).setValue(f[COL.id - 1]);
        cambios = true;
      }
      leads.push(filaALead(f));
    });
    if (cambios) SpreadsheetApp.flush();
  }
  return {
    ok: true,
    ahora: new Date().toISOString(),
    callers: equipo().map(p => p.nombre),
    estados: estados(),
    minutos: minutosAviso(),
    leads: leads,
  };
}

function actualizar(b, quien) {
  const id = String(b.id || '');
  const c = b.cambios || {};
  const permitido = {
    caller: v => (v === '' || equipo().some(p => p.nombre === v)) ? v : err('Caller no válido'),
    estado: v => (v === '' || estados().indexOf(v) >= 0) ? v : err('Estado no válido'),
    contacto: v => (v === '' || CONTACTO.indexOf(v) >= 0) ? v : err('Contacto no válido'),
    intentos: v => { const x = Math.round(Number(v)); return x >= 0 && x <= 99 ? x : err('Intentos no válidos'); },
    notas: v => celda(limpio(v, 2000)),
    embudo: v => EMBUDO.indexOf(v) >= 0 ? v : err('Embudo no válido'),
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja(HOJA_LEADS);
    const fila = buscarFila(sh, id);
    if (!fila) throw new Error('Lead no encontrado (¿se ha borrado del Sheet?)');
    const antes = sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
    const ant = k => antes[COL[k] - 1];
    if (c.caller && ant('autoagenda'))
      throw new Error('Este lead se ha agendado él solo por Calendly: no lleva caller');
    Object.keys(c).forEach(k => {
      if (!permitido[k]) return;
      sh.getRange(fila, COL[k]).setValue(permitido[k](c[k]));
    });
    const ahora = new Date();
    // Asignación: guardamos cuándo se lo ha quedado el caller (para sus KPIs por día)
    if ('caller' in c && c.caller !== ant('caller')) sh.getRange(fila, COL.asignado).setValue(c.caller ? ahora : '');
    // "llamar a las 19:00", "después"… en las notas → hora de volver a llamar
    let rellamar = ant('rellamar');
    if ('notas' in c) {
      const nuevo = horaEnNota(c.notas, ahora), viejo = horaEnNota(ant('notas'), ahora);
      if (nuevo.clave !== viejo.clave) {
        rellamar = nuevo.fecha || '';
        sh.getRange(fila, COL.rellamar).setValue(rellamar);
        sh.getRange(fila, COL.rellamarAviso).setValue('');
        if (rellamar && !ant('estado') && !('estado' in c)) sh.getRange(fila, COL.estado).setValue('Volver a llamar');
      }
    }
    // Se quita al llamarle (un intento más cuando ya tocaba) o al cerrar el lead
    const llamadoYa = 'intentos' in c && Number(c.intentos) > Number(ant('intentos')) &&
      rellamar instanceof Date && rellamar.getTime() - ahora.getTime() < 15 * 60000;
    if (rellamar && (llamadoYa || CIERRAN.indexOf(c.estado) >= 0)) {
      sh.getRange(fila, COL.rellamar).setValue('');
      sh.getRange(fila, COL.rellamarAviso).setValue('');
    }
    SpreadsheetApp.flush();
    return { ok: true, lead: filaALead(sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0]), por: quien };
  } finally {
    lock.releaseLock();
  }
}

function buscarFila(sh, id) {
  if (!id || sh.getLastRow() < 2) return 0;
  const m = sh.getRange(2, COL.id, sh.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  return m ? m.getRow() : 0;
}

function filaALead(f) {
  const v = k => f[COL[k] - 1];
  const fecha = v('fecha');
  return {
    id: String(v('id')),
    fecha: fecha instanceof Date ? fecha.toISOString() : String(fecha || ''),
    nombre: String(v('nombre')), telefono: String(v('telefono')),
    punto: String(v('punto')), objetivo: String(v('objetivo')), correo: String(v('correo')),
    caller: String(v('caller')), estado: String(v('estado')), contacto: String(v('contacto')),
    intentos: Number(v('intentos')) || 0, notas: String(v('notas')),
    inversion: String(v('inversion')), meta: String(v('meta')), cuando: String(v('cuando')),
    instagram: String(v('instagram')), origen: String(v('origen')),
    cualifica: v('cualifica') === 'Sí', autoagenda: String(v('autoagenda') || ''),
    rellamar: v('rellamar') instanceof Date ? v('rellamar').toISOString() : '',
    asignado: v('asignado') instanceof Date ? v('asignado').toISOString() : '',
    embudo: String(v('embudo') || ''),
  };
}

// =====================================================================
// Notas → hora de volver a llamar
//   "19:00", "19.30", "19h", "a las 7", "mañana a las 10", "en 2 horas", "en 30 min"
//   "después", "luego", "más tarde", "en un rato" → dentro de 2 h 30 min
// Devuelve { fecha, clave }: la clave sirve para recalcular solo si cambia lo que se ha escrito.
// =====================================================================
const DESPUES_MIN = 150;

function horaEnNota(nota, ahora) {
  const t = String(nota || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ninguna = { fecha: null, clave: '' };
  if (!t.trim()) return ninguna;
  const base = new Date(ahora.getTime());

  // relativo: "en 2 horas", "en 30 min", "en una hora", "en media hora"
  let m = t.match(/\ben\s+(\d{1,3}|una|un|media)\s*(h|hr|hrs|hora|horas|min|mins|minutos)\b/);
  if (m) {
    const n = m[1] === 'media' ? 30 : (m[1] === 'una' || m[1] === 'un') ? 1 : Number(m[1]);
    const min = /^h/.test(m[2]) ? n * 60 : n;
    if (m[1] === 'media') return { fecha: new Date(base.getTime() + 30 * 60000), clave: m[0] };
    return { fecha: new Date(base.getTime() + min * 60000), clave: m[0] };
  }

  // hora concreta
  let h = -1, mi = 0, clave = '';
  if ((m = t.match(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/))) { h = +m[1]; mi = +m[2]; clave = m[0]; }
  else if ((m = t.match(/\ba\s+las?\s+([01]?\d|2[0-3])(?:\s*y\s*(media|cuarto))?\b/))) {
    h = +m[1]; mi = m[2] === 'media' ? 30 : m[2] === 'cuarto' ? 15 : 0; clave = m[0];
  }
  else if ((m = t.match(/\b([01]?\d|2[0-3])\s*(?:h|hs|horas?)\b/))) { h = +m[1]; clave = m[0]; }

  if (h >= 0) {
    const porLaManana = /\b(por|de) la manana\b/.test(t);
    const tarde = /\b(tarde|noche)\b/.test(t) && !/\bmas tarde\b/.test(t);
    const dias = /\bpasado manana\b/.test(t) ? 2 : (/\bmanana\b/.test(t) && !porLaManana) ? 1 : 0;
    if (tarde && h < 12) h += 12;
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias, h, mi);
    if (!dias && d <= base) {
      // "a las 7" a las 15:00 → las 19:00; si no, mañana a esa hora
      if (h < 12 && !porLaManana && new Date(d.getTime() + 12 * 3600e3) > base) d.setHours(h + 12);
      else d.setDate(d.getDate() + 1);
    }
    return { fecha: d, clave: clave + (dias ? '+' + dias : '') + (tarde ? 't' : '') };
  }

  // sin hora: "después", "luego", "más tarde", "en un rato", "otro momento"
  if ((m = t.match(/\b(despues|luego|mas tarde|en un rato|otro momento|ahora no puede)\b/))) {
    return { fecha: new Date(base.getTime() + DESPUES_MIN * 60000), clave: m[1] };
  }
  return ninguna;
}

// =====================================================================
// Slack
// =====================================================================
function avisarSlack(lead) {
  const min = minutosAviso();
  const limite = Utilities.formatDate(new Date(lead.fecha.getTime() + min * 60000), TZ, 'HH:mm');
  const buen = lead.cualifica === 'Sí';
  enviarSlack({
    text: (buen ? 'Buen form: ' : 'Nuevo lead: ') + lead.nombre + ' · ' + lead.telefono,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: (buen ? '⭐ Buen form: ' : '🔥 Nuevo lead: ') + lead.nombre } },
      { type: 'section', fields: [
        md('*Teléfono*\n' + telefonoSlack(lead.telefono)),
        md('*Correo*\n' + esc(lead.correo || '—')),
        md('*En qué punto está*\n' + esc(lead.punto || '—')),
        md('*Qué quiere conseguir*\n' + esc(lead.objetivo || '—')),
        md('*Inversión al mes*\n' + esc(lead.inversion || '—')),
        md('*Cuándo empieza*\n' + esc(lead.cuando || '—')),
      ] },
      lead.meta ? { type: 'section', text: md('*Meta a 3-6 meses*\n>' + esc(lead.meta).replace(/\n/g, '\n>')) } : null,
      { type: 'context', elements: [md(mencion() + (buen
        ? '📅 Encaja: se le ha ofrecido agendar llamada. Si a las *' + limite + '* no ha agendado, te aviso para llamarle.'
        : '⏱️ Llámale antes de las *' + limite + '* (' + min + ' min)'))] },
      botonCrm(),
    ].filter(Boolean),
  });
}

// Se ejecuta cada minuto (activador que crea configurar()): avisa si un lead lleva X minutos sin llamar.
function revisarAvisos() {
  const sh = hoja(HOJA_LEADS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const desde = Math.max(1, n - 300);                  // solo miramos los últimos 300 leads
  const datos = sh.getRange(desde + 1, 1, n - desde + 1, CABECERA.length).getValues();
  const min = minutosAviso(), ahora = Date.now();
  datos.forEach((f, i) => {
    // Hora de volver a llamar (de las notas)
    const rl = f[COL.rellamar - 1];
    if (rl instanceof Date && !f[COL.rellamarAviso - 1] && rl.getTime() <= ahora && ahora - rl.getTime() < 3600e3) {
      enviarSlack({
        text: '📞 Toca llamar a ' + f[COL.nombre - 1],
        blocks: [
          { type: 'section', text: md(mencion() + '📞 Toca llamar a *' + esc(f[COL.nombre - 1]) + '* (pidió las *' +
            Utilities.formatDate(rl, TZ, 'HH:mm') + '*) · ' + telefonoSlack(String(f[COL.telefono - 1])) +
            (f[COL.caller - 1] ? ' · caller: *' + esc(f[COL.caller - 1]) + '*' : '') +
            (f[COL.notas - 1] ? '\n>' + esc(String(f[COL.notas - 1]).split('\n')[0]) : '')) },
          botonCrm(),
        ].filter(Boolean),
      });
      sh.getRange(desde + 1 + i, COL.rellamarAviso).setValue(Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm'));
    }
    const fecha = f[COL.fecha - 1];
    if (f[COL.aviso - 1] || !(fecha instanceof Date)) return;
    const pasado = (ahora - fecha.getTime()) / 60000;
    if (pasado < min) return;
    const fila = desde + 1 + i;
    const llamado = f[COL.contacto - 1] === '✅' || Number(f[COL.intentos - 1]) > 0;
    if (llamado || f[COL.autoagenda - 1] || pasado > 60) { sh.getRange(fila, COL.aviso).setValue('—'); return; }
    const buen = f[COL.cualifica - 1] === 'Sí';
    enviarSlack({
      text: (buen ? '⭐ Buen form no agendado: ' : '⏰ ') + f[COL.nombre - 1] + ' lleva ' + min + ' min sin llamar',
      blocks: [
        { type: 'section', text: md(mencion() + (buen ? '⭐ *Buen form NO agendado* · *' : '⏰ *') + esc(f[COL.nombre - 1]) + '* lleva *' + Math.round(pasado) + ' min* sin ' + (buen ? 'agendar ni ' : '') + 'llamar · ' +
          telefonoSlack(String(f[COL.telefono - 1])) + (f[COL.caller - 1] ? ' · caller: *' + esc(f[COL.caller - 1]) + '*' : '')) },
        botonCrm(),
      ].filter(Boolean),
    });
    sh.getRange(fila, COL.aviso).setValue(Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm'));
  });
}

function enviarSlack(payload) {
  const url = String(hoja(HOJA_AJUSTES).getRange(AJ.webhook).getValue()).trim();
  if (!/^https:\/\/hooks\.slack\.com\//.test(url)) return;
  const r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) console.error('Slack respondió ' + r.getResponseCode() + ': ' + r.getContentText());
}

// "U0123ABCD" → "<@U0123ABCD> " para que al closer le llegue la notificación con su nombre
function mencion() {
  const ids = String(hoja(HOJA_AJUSTES).getRange(AJ.mencion).getValue()).match(/[UW][A-Z0-9]{6,}/g) || [];
  return ids.map(id => '<@' + id + '> ').join('');
}

function botonCrm() {
  const url = String(hoja(HOJA_AJUSTES).getRange(AJ.crmUrl).getValue()).trim();
  if (!/^https?:\/\//.test(url)) return null;
  return { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Abrir CRM' }, url: url, style: 'primary' }] };
}

function telefonoSlack(t) {
  let d = String(t).replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.length === 9 && /^[67]/.test(d)) d = '34' + d;
  return '<tel:+' + d + '|' + esc(t) + '> · <https://wa.me/' + d + '|WhatsApp>';
}

const md = t => ({ type: 'mrkdwn', text: t });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Prueba rápida: Ejecutar → probarSlack
function probarSlack() {
  avisarSlack({
    id: 'prueba', fecha: new Date(), nombre: 'Lead de prueba', telefono: '+34 600 11 22 33',
    correo: 'prueba@gmail.com', punto: 'Empiezo desde cero y quiero aprender',
    objetivo: 'Un ingreso extra que no me quite mucho tiempo', inversion: 'Entre 200 y 400 € al mes',
    cuando: 'Lo antes posible', meta: 'Llegar a 1.000 €/mes en 6 meses.',
  });
}

// =====================================================================
// Ajustes y utilidades
// =====================================================================
function equipo() {
  const sh = hoja(HOJA_AJUSTES);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 2).getDisplayValues()
    .map(r => ({ nombre: String(r[0]).trim(), pin: String(r[1]).trim() }))
    .filter(p => p.nombre);
}

function estados() {
  const sh = hoja(HOJA_AJUSTES);
  const n = sh.getLastRow() - 1;
  if (n < 1) return ESTADOS;
  const l = sh.getRange(2, 4, n, 1).getDisplayValues().map(r => String(r[0]).trim()).filter(Boolean);
  return l.length ? l : ESTADOS;
}

function minutosAviso() {
  const m = Number(hoja(HOJA_AJUSTES).getRange(AJ.minutos).getValue());
  return m > 0 ? m : 5;
}

function hoja(nombre) {
  const sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la pestaña "' + nombre + '". Ejecuta configurar().');
  return sh;
}

function limpio(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

// Evita que un texto que empieza por = + - @ se interprete como fórmula (y que "+34…" dé error)
function celda(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function err(m) { throw new Error(m); }

// =====================================================================
// configurar(): ejecútalo UNA vez. Crea las pestañas, el formato, los desplegables y el aviso de Slack.
// Puedes volver a ejecutarlo sin perder datos.
// =====================================================================
function configurar() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);

  // ---- Ajustes ----
  let aj = ss.getSheetByName(HOJA_AJUSTES) || ss.insertSheet(HOJA_AJUSTES);
  aj.getRange('B:B').setNumberFormat('@');
  if (!aj.getRange('A1').getValue()) {
    aj.getRange('A1:B1').setValues([['Caller', 'PIN (para entrar al dashboard)']]);
    aj.getRange('A2:B2').setValues([['MARIO', pinAleatorio()]]);
    aj.getRange('D1').setValue('Estados');
    aj.getRange(2, 4, ESTADOS.length, 1).setValues(ESTADOS.map(e => [e]));
    aj.getRange('F1:G1').setValues([['Ajuste', 'Valor']]);
    aj.getRange('F2:G5').setValues([
      ['Webhook de Slack', 'pega aquí la URL https://hooks.slack.com/…'],
      ['URL del dashboard', 'https://TU-WEB.vercel.app/crm'],
      ['Aviso si no se llama en (minutos)', 5],
      ['Mencionar en Slack (ID de miembro del closer, opcional)', ''],
    ]);
  }
  [aj.getRange('A1:B1'), aj.getRange('D1'), aj.getRange('F1:G1')].forEach(estiloCabecera);
  aj.setColumnWidth(1, 160); aj.setColumnWidth(2, 220); aj.setColumnWidth(3, 30);
  if (!aj.getRange('F6').getValue())
    aj.getRange('F6:G6').setValues([['Token de Calendly (opcional: hora de la llamada en el CRM)', '']]);
  if (!aj.getRange('F7').getValue()) {
    aj.getRange('G8').setNumberFormat('@');
    aj.getRange('F7:G8').setValues([['Acceso maestro: nombre (solo tú, ve los KPIs de todos)', 'Mario'], ['Acceso maestro: PIN', pinAleatorio()]]);
  }
  aj.setColumnWidth(4, 170); aj.setColumnWidth(5, 30); aj.setColumnWidth(6, 260); aj.setColumnWidth(7, 420);
  aj.setFrozenRows(1);

  // ---- Leads ----
  let sh = ss.getSheetByName(HOJA_LEADS);
  if (!sh) {
    const hoja1 = ss.getSheets()[0];
    sh = (hoja1.getLastRow() === 0 && hoja1.getName() !== HOJA_AJUSTES) ? hoja1.setName(HOJA_LEADS) : ss.insertSheet(HOJA_LEADS, 0);
  }
  if (sh.getMaxColumns() < CABECERA.length) sh.insertColumnsAfter(sh.getMaxColumns(), CABECERA.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, CABECERA.length).setValues([CABECERA]);
  estiloCabecera(sh.getRange(1, 1, 1, CABECERA.length));
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.getRange(1, 1, sh.getMaxRows(), CABECERA.length).setFontFamily('Poppins').setVerticalAlignment('middle');
  sh.getRange(1, 1, 1, CABECERA.length).setFontFamily('Poppins');
  sh.getRange('A2:A').setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange(2, COL.rellamar, sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm HH:mm');
  sh.getRange(2, COL.asignado, sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange('C2:C').setNumberFormat('@');
  sh.getRange('I2:J').setHorizontalAlignment('center');
  sh.getRange('K2:K').setWrap(true);
  const anchos = [135, 180, 140, 250, 250, 230, 110, 150, 90, 95, 320];
  anchos.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.hideColumns(VISIBLES + 1, CABECERA.length - VISIBLES);

  // Desplegables (se editan en la pestaña Ajustes)
  const filas = sh.getMaxRows() - 1;
  sh.getRange(2, COL.caller, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(aj.getRange(AJ.callers), true).setAllowInvalid(false).build());
  sh.getRange(2, COL.estado, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(aj.getRange(AJ.estados), true).setAllowInvalid(false).build());
  sh.getRange(2, COL.contacto, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONTACTO, true).setAllowInvalid(false).build());
  sh.getRange(2, COL.intentos, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, 99).setAllowInvalid(false).build());

  // Colores de cada estado
  const rEstado = sh.getRange(2, COL.estado, filas, 1);
  const reglas = sh.getConditionalFormatRules().filter(r => {
    const rs = r.getRanges();
    return !(rs.length === 1 && rs[0].getColumn() === COL.estado);
  });
  Object.keys(COLORES).forEach(e => {
    reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(e)
      .setBackground(COLORES[e][0]).setFontColor(COLORES[e][1]).setRanges([rEstado]).build());
  });
  sh.setConditionalFormatRules(reglas);

  // Activador: revisar cada minuto si hay leads sin llamar
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'revisarAvisos').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarAvisos').timeBased().everyMinutes(1).create();

  ss.setActiveSheet(sh);
  ss.toast('Siguiente: en "Ajustes" cambia los PIN, pega el webhook de Slack y publica como aplicación web.', 'CRM listo ✅', 15);
}

function estiloCabecera(r) {
  r.setBackground('#111111').setFontColor('#ffffff').setFontWeight('bold').setFontFamily('Poppins');
}

function pinAleatorio() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
