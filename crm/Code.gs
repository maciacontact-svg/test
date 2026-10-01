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
  cualifica: 19, autoagenda: 20,
};
const CABECERA = [
  'Fecha registro', 'Nombre', 'Teléfono', 'En qué punto está', 'Qué quiere conseguir', 'Correo',
  'Caller', 'Estado', 'Contacto', 'Nº intentos', 'Notas',
  'ID', 'Inversión al mes', 'Meta a 3-6 meses', 'Cuándo empieza', 'Instagram', 'Origen', 'Aviso Slack',
  'Buen form', 'Autoagendado (Calendly)',
];
const VISIBLES = 11;

const ESTADOS = ['Contactado', 'Volver a llamar', 'Seguimiento', 'Perdido', 'Nutricion', 'Agendado', 'Invalid'];
const COLORES = { // fondo, texto (los mismos tonos que tu hoja de cold calling)
  'Contactado': ['#fce8b2', '#6b4e00'], 'Volver a llamar': ['#f6c27a', '#4d2e00'],
  'Seguimiento': ['#cfe2f6', '#1b4f8a'], 'Perdido': ['#f8d0cb', '#a52714'],
  'Nutricion': ['#e4d7f3', '#5b3a8c'], 'Agendado': ['#2f6b4f', '#e2f4e6'], 'Invalid': ['#e6e6e6', '#333333'],
};
const CONTACTO = ['✅', '❌'];

// Celdas de la pestaña "Ajustes"
const AJ = { callers: 'A2:A', pins: 'B2:B', estados: 'D2:D', webhook: 'G2', crmUrl: 'G3', minutos: 'G4', mencion: 'G5', calendly: 'G6' };

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
      case 'login':  return json({ ok: true, caller: auth(b) });
      case 'list':   auth(b); return json(listar());
      case 'update': return json(actualizar(b, auth(b)));
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
    cualifica: 'No', autoagenda: '',
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

  const p = equipo().find(x => x.nombre.toUpperCase() === nombre && x.pin === pin);
  if (!nombre || !pin || !p) {
    cache.put(k, String(fallos + 1), 600);
    throw new Error('Nombre o PIN incorrectos');
  }
  cache.remove(k);
  return p.nombre;
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
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja(HOJA_LEADS);
    const fila = buscarFila(sh, id);
    if (!fila) throw new Error('Lead no encontrado (¿se ha borrado del Sheet?)');
    if (c.caller && sh.getRange(fila, COL.autoagenda).getValue())
      throw new Error('Este lead se ha agendado él solo por Calendly: no lleva caller');
    Object.keys(c).forEach(k => {
      if (!permitido[k]) return;
      sh.getRange(fila, COL[k]).setValue(permitido[k](c[k]));
    });
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
  };
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
    aj.getRange('A2:B3').setValues([['DAVID', pinAleatorio()], ['MARIO', pinAleatorio()]]);
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
