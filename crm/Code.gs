// (Sin @OnlyCurrentDoc: las grabaciones de llamadas necesitan permiso de Google Drive)

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
const HOJA_SETTING = 'Setting';
const HOJA_IG = 'Instagram';

// Columnas de "Leads". Las 11 primeras son las visibles; el resto van ocultas (datos extra del formulario).
const COL = {
  fecha: 1, nombre: 2, telefono: 3, punto: 4, objetivo: 5, correo: 6,
  caller: 7, estado: 8, contacto: 9, intentos: 10, notas: 11,
  id: 12, inversion: 13, meta: 14, cuando: 15, instagram: 16, origen: 17, aviso: 18,
  cualifica: 19, autoagenda: 20, rellamar: 21, rellamarAviso: 22, asignado: 23, embudo: 24,
  setter: 25, agendadoEl: 26, notasLlamada: 27, grabaciones: 28, fijo: 29, alias: 30,
};
const CABECERA = [
  'Fecha registro', 'Nombre', 'Teléfono', 'En qué punto está', 'Qué quiere conseguir', 'Correo',
  'Caller', 'Estado', 'Contacto', 'Nº intentos', 'Notas',
  'ID', 'Inversión al mes', 'Meta a 3-6 meses', 'Cuándo empieza', 'Instagram', 'Origen', 'Aviso Slack',
  'Buen form', 'Autoagendado (Calendly)', 'Volver a llamar (hora)', 'Aviso rellamada', 'Asignado el', 'Embudo',
  'Setter (enlace IG)', 'Agendado el', 'Notas llamada', 'Grabaciones (Drive)',
  'Caller fijo (agendó en llamada)', 'IDs fusionados',
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
const AJ = { callers: 'A2:A', pins: 'B2:B', setting: 'C2:C', estados: 'D2:D', webhook: 'G2', crmUrl: 'G3', minutos: 'G4', mencion: 'G5', calendly: 'G6', maestro: 'G7', maestroPin: 'G8',
  igClave: 'G9', igToken: 'G10', igFrases: 'G11', igRenovado: 'G12', web: 'G13', webhookAgendas: 'G15', setters: 'I2:K' };

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
      case 'list':   { const u = auth(b); return json(Object.assign(listar(), { rol: u.rol, web: dominiosWeb()[0], setting: settingDe(u), setters: settersDe(u), ig: listarIg(u), enlacesCaller: enlacesCallerDe(u) })); }
      case 'update': return json(actualizar(b, auth(b)));
      case 'setting':   return json(guardarSetting(b, auth(b)));
      case 'settingOn': return json(activarSetting(b, auth(b)));
      case 'ig':        return json(eventosInstagram(b));
      case 'grabacion': return json(subirGrabacion(b, auth(b)));
      case 'grabacionFin': return json(terminarGrabacion(b, auth(b)));
      case 'borrarGrabacion': return json(borrarGrabacion(b, auth(b)));
      case 'audio':     return json(leerAudio(b, auth(b)));
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
    setter: setterDeSlug(b.setter || paramDe(b.origen, 's')), agendadoEl: '', notasLlamada: '', grabaciones: '',
    fijo: '', alias: '',
  };

  const fila = new Array(CABECERA.length).fill('');
  Object.keys(COL).forEach(k => { fila[COL[k] - 1] = celda(lead[k]); });

  // Mismo teléfono que un lead que ya está → UNA sola ficha: se completa la que había (no se crea otra)
  let antes = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja(HOJA_LEADS);
    const dup = buscarTelefono(sh, telefono);
    if (dup) {
      antes = sh.getRange(dup, 1, 1, CABECERA.length).getValues()[0];
      sh.getRange(dup, 1, 1, CABECERA.length).setValues([combinar(antes, fila).map(celda)]);
      SpreadsheetApp.flush();
    } else sh.appendRow(fila);
  }
  finally { lock.releaseLock(); }

  try {
    if (!antes) avisarSlack(lead);
    else enviarSlack({ text: '🔁 ' + nombre + ' ha vuelto a rellenar el formulario', blocks: [
      { type: 'section', text: md('🔁 *' + esc(nombre) + '* ha vuelto a rellenar el formulario (ya estaba en el CRM como *' + esc(antes[COL.nombre - 1]) + '*: se ha actualizado su ficha, no se ha creado otra) · ' +
        telefonoSlack(telefono) + (antes[COL.caller - 1] ? ' · caller: *' + esc(antes[COL.caller - 1]) + '*' : '')) },
      botonCrm(),
    ].filter(Boolean) });
  } catch (err) { console.error('Slack: ' + err); }
  return { ok: true, id: antes ? String(antes[COL.id - 1]) : lead.id };
}

// =====================================================================
// Autoagendado: el lead ha reservado él solo en Calendly (desde llamada.html o agendar.html)
// → Estado "Agendado", SIN caller (y el dashboard no deja ponérselo).
// =====================================================================
function autoagendado(b) {
  const id = String(b.id || '');
  const conId = /^[a-z0-9]{8,24}$/i.test(id);
  // Enlace de caller (<web>/c/<código>): lo ha agendado el caller en plena llamada → se le asigna a él (y queda fijo)
  const porCaller = b.porCaller ? callerDeSlug(b.porCaller) : '';
  if (b.porCaller && !porCaller) throw new Error('Enlace de caller no válido (revisa Ajustes → columna A)');
  if (!conId && !b.invitado) throw new Error('Lead no válido');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let f, cuando, inv = null;
  try {
    const sh = hoja(HOJA_LEADS);
    let fila = conId ? buscarFila(sh, id) : 0;
    // Sin ID (p. ej. agenda desde la biblioteca en otro dispositivo): se busca por el email de Calendly
    if (!fila) {
      inv = invitadoCalendly(b.invitado);
      if (!inv && !conId) throw new Error('Lead no válido: no se ha podido identificar (revisa el token de Calendly en Ajustes → G6)');
      if (inv && inv.correo) fila = buscarCorreo(sh, inv.correo);
      if (!fila && inv && inv.telefono) fila = buscarTelefono(sh, inv.telefono);           // mismo número = misma persona
      if (!fila && inv && !conId) fila = leadDesdeCalendly(sh, inv, limpio(b.origen, 200));   // nunca rellenó el formulario
      else if (fila && inv) anotarOtroNombre(sh, fila, inv);
    }
    if (!fila) throw new Error('Lead no encontrado');
    f = sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
    cuando = horaLlamada(b.evento);
    const marca = cuando ? 'Llamada ' + cuando : 'Reservado ' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm');
    if (porCaller) { const r = agendadoPorCaller(sh, fila, f, porCaller, marca, cuando, b); lock.releaseLock(); slackAgenda(f, '📞 *' + esc(porCaller) + '* ha agendado a *' + esc(f[COL.nombre - 1]) + '* en llamada', cuando, inv || invitadoCalendly(b.invitado)); return r; }
    if (f[COL.autoagenda - 1]) return { ok: true, repetido: true };
    if (f[COL.fijo - 1]) {
      // ya lo había agendado un caller en llamada (p. ej. ha cambiado la hora): sigue siendo suyo
      const nt = String(f[COL.notas - 1] || '');
      sh.getRange(fila, COL.notas).setValue(celda('📅 Ha vuelto a reservar en Calendly · ' + marca + (nt ? '\n' + nt : '')));
      sh.getRange(fila, COL.estado).setValue('Agendado');
      SpreadsheetApp.flush();
      return { ok: true, fijo: String(f[COL.fijo - 1]) };
    }
    sh.getRange(fila, COL.autoagenda).setValue(marca);
    sh.getRange(fila, COL.estado).setValue('Agendado');
    sh.getRange(fila, COL.caller).setValue('');
    sh.getRange(fila, COL.agendadoEl).setValue(new Date());
    if (b.origen && !f[COL.origen - 1]) sh.getRange(fila, COL.origen).setValue(celda(limpio(b.origen, 200)));
    const st = setterDeSlug(b.setter);
    if (st && !f[COL.setter - 1]) sh.getRange(fila, COL.setter).setValue(st);
    const notas = String(f[COL.notas - 1] || '');
    sh.getRange(fila, COL.notas).setValue(celda('📅 Autoagendado por Calendly · ' + marca + (notas ? '\n' + notas : '')));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  slackAgenda(f, '📅 *' + esc(f[COL.nombre - 1]) + '* ha agendado él solo su llamada · _autoagendado, sin caller_', cuando, inv || invitadoCalendly(b.invitado));
  return { ok: true };
}

// Aviso de agenda en el canal de AGENDAS (Ajustes → G15): quién, cuándo y todo su formulario (web + Calendly)
function slackAgenda(f, titulo, cuando, inv) {
  try {
    const v = k => String(f[COL[k] - 1] || '').trim();
    const campo = (t, x) => md('*' + t + '*\n' + esc(x || '—'));
    const o = v('origen'), fuente = paramDe(o, 'utm_source') || (o ? 'Calendly directo' : 'Directo');
    const qa = (inv && inv.qa || []).filter(q => !/tel[eé]fono|whatsapp|m[oó]vil|phone/i.test(q.p));
    const sinForm = !v('punto') && !v('objetivo') && !v('inversion');
    enviarSlack({
      text: '📅 Agenda: ' + v('nombre') + (cuando ? ' · ' + cuando : ''),
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '📅 Agenda: ' + v('nombre').slice(0, 120) + (cuando ? ' · ' + cuando : '') } },
        { type: 'section', text: md(mencion() + titulo + '\n' + (v('telefono') ? telefonoSlack(v('telefono')) : '') + (v('correo') ? ' · ' + esc(v('correo')) : '')) },
        sinForm ? { type: 'context', elements: [md('_No rellenó el formulario de la web._')] } : { type: 'section', fields: [
          campo('En qué punto está', v('punto')), campo('Qué quiere conseguir', v('objetivo')),
          campo('Inversión al mes', v('inversion')), campo('Cuándo empieza', v('cuando')),
          campo('Buen form', v('cualifica') === 'Sí' ? '⭐ Sí' : 'No'), campo('Origen', fuente + (v('setter') ? ' · setter ' + v('setter') : '')),
        ] },
        v('meta') ? { type: 'section', text: md('*Meta a 3-6 meses*\n>' + esc(v('meta')).replace(/\n/g, '\n>')) } : null,
        qa.length ? { type: 'section', text: md('*Respuestas en Calendly*\n' + qa.map(q => '• _' + esc(q.p) + '_\n' + esc(q.r)).join('\n')) } : null,
        botonCrm(),
      ].filter(Boolean),
    }, 'agendas');
  } catch (err) { console.error('Slack: ' + err); }
}

// Agendado por el caller durante la llamada (enlace /c/<código>): Agendado, con ese caller y bloqueado
// (solo el maestro puede cambiarlo). Cuenta como agenda del caller en sus KPIs.
function agendadoPorCaller(sh, fila, f, caller, marca, cuando, b) {
  const v = k => f[COL[k] - 1], set = (k, x) => sh.getRange(fila, COL[k]).setValue(x);
  const ahora = new Date();
  set('autoagenda', '');
  set('estado', 'Agendado');
  if (String(v('caller')) !== caller || !v('asignado')) set('asignado', ahora);
  set('caller', caller);
  set('fijo', caller);
  set('contacto', '✅');
  if (!(Number(v('intentos')) > 0)) set('intentos', 1);
  set('embudo', 'Oferta llamada');
  set('agendadoEl', ahora);
  set('rellamar', ''); set('rellamarAviso', '');
  if (b.origen && !v('origen')) set('origen', celda(limpio(b.origen, 200)));
  const notas = String(v('notas') || '');
  set('notas', celda('📞 Agendado en llamada por ' + caller + ' · ' + marca + (notas ? '\n' + notas : '')));
  SpreadsheetApp.flush();
  return { ok: true, caller: caller };
}

// Reservó en Calendly con otro nombre o email que el de su ficha: se apunta en las notas (para no perderlo)
function anotarOtroNombre(sh, fila, inv) {
  const f = sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
  const otroNom = inv.nombre && sinTildes(inv.nombre) !== sinTildes(f[COL.nombre - 1]) ? inv.nombre : '';
  let otroCor = inv.correo && inv.correo !== String(f[COL.correo - 1]).trim().toLowerCase() ? inv.correo : '';
  if (!f[COL.correo - 1] && otroCor) { sh.getRange(fila, COL.correo).setValue(otroCor); otroCor = ''; }
  if (!otroNom && !otroCor) return;
  const notas = String(f[COL.notas - 1] || '');
  sh.getRange(fila, COL.notas).setValue(celda(notas + (notas ? '\n' : '') + '📎 Reservó en Calendly como ' + [otroNom && '«' + otroNom + '»', otroCor].filter(Boolean).join(' · ')));
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
function leadDesdeCalendly(sh, inv, origen) {
  const lead = {
    id: Utilities.getUuid().slice(0, 8), fecha: new Date(),
    nombre: inv.nombre || inv.correo, telefono: inv.telefono, correo: inv.correo,
    punto: '', objetivo: '', caller: '', estado: '', contacto: '❌', intentos: 0, notas: '',
    inversion: '', meta: '', cuando: '', instagram: '', origen: origen ? origen + '&sin_formulario=1' : 'Calendly (sin formulario)', aviso: '—',
    cualifica: 'No', autoagenda: '', rellamar: '', rellamarAviso: '', asignado: '', embudo: '',
    setter: '', agendadoEl: '', notasLlamada: '', grabaciones: '',
    fijo: '', alias: '',
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
  const qa = (r.questions_and_answers || []).filter(q => q.answer).map(q => ({ p: limpio(q.question, 150), r: limpio(q.answer, 600) }));
  return { nombre: limpio(r.name, 80), correo: limpio(r.email, 120).toLowerCase(), telefono: limpio(tel, 40), qa: qa };
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
  return { nombre: String(ajCelda(AJ.maestro)).trim(), pin: String(ajCelda(AJ.maestroPin)).trim() };
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

function actualizar(b, u) {
  const quien = u.nombre, maestro = u.rol === 'maestro';
  const id = String(b.id || '');
  const c = Object.assign({}, b.cambios || {});
  const permitido = {
    caller: v => (v === '' || equipo().some(p => p.nombre === v)) ? v : err('Caller no válido'),
    estado: v => (v === '' || estados().indexOf(v) >= 0) ? v : err('Estado no válido'),
    contacto: v => (v === '' || CONTACTO.indexOf(v) >= 0) ? v : err('Contacto no válido'),
    intentos: v => { const x = Math.round(Number(v)); return x >= 0 && x <= 99 ? x : err('Intentos no válidos'); },
    notas: v => celda(limpio(v, 2000)),
    notasLlamada: v => celda(limpio(v, 8000)),
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
    if ('caller' in c) permitido.caller(c.caller);    // antes de tocar nada
    const ahora = new Date();
    // Autoagendado y caller fijo: solo el maestro los cambia (p. ej. un caller agendó en llamada con el enlace equivocado)
    if (!maestro) {
      if ('autoagenda' in c || 'fijo' in c) throw new Error('Solo Mario puede cambiar esto');
      if (c.caller && ant('autoagenda')) throw new Error('Este lead se ha agendado él solo por Calendly: no lleva caller (si es un error, que lo cambie Mario)');
      if ('caller' in c && ant('fijo') && c.caller !== ant('caller'))
        throw new Error('Este lead lo agendó ' + ant('fijo') + ' en llamada: solo Mario puede cambiar el caller');
    } else {
      if (c.caller && ant('autoagenda') && !('autoagenda' in c)) c.autoagenda = '';
      if (c.autoagenda) c.caller = '';
    }
    if (maestro && 'autoagenda' in c) {
      const notas = String(ant('notas') || '');
      if (!c.autoagenda && ant('autoagenda')) {
        // autoagendado → lo agendó el caller: cuenta para él y queda fijo
        sh.getRange(fila, COL.autoagenda).setValue('');
        if (c.caller) {
          sh.getRange(fila, COL.fijo).setValue(c.caller);
          sh.getRange(fila, COL.estado).setValue('Agendado');
          if (!ant('agendadoEl')) sh.getRange(fila, COL.agendadoEl).setValue(ahora);
          if (!('notas' in c)) sh.getRange(fila, COL.notas).setValue(celda(
            notas.replace(/^📅 Autoagendado por Calendly · /, '📞 Agendado en llamada por ' + c.caller + ' (corregido por ' + quien + ') · ')));
        }
      } else if (c.autoagenda && !ant('autoagenda')) {
        sh.getRange(fila, COL.autoagenda).setValue('Marcado a mano el ' + Utilities.formatDate(ahora, TZ, 'dd/MM HH:mm'));
        sh.getRange(fila, COL.fijo).setValue('');
        sh.getRange(fila, COL.estado).setValue('Agendado');
        if (!ant('agendadoEl')) sh.getRange(fila, COL.agendadoEl).setValue(ahora);
      }
      delete c.autoagenda;
    }
    // el maestro cambia el caller de un lead fijo → queda fijo al nuevo (o se suelta si se le quita)
    if (maestro && 'caller' in c && ant('fijo') && !('fijo' in c)) c.fijo = c.caller;
    if ('fijo' in c) {
      const quienFijo = c.fijo ? String('caller' in c ? c.caller : ant('caller')) : '';
      sh.getRange(fila, COL.fijo).setValue(equipo().some(p => p.nombre === quienFijo) ? quienFijo : '');
      delete c.fijo;
    }
    Object.keys(c).forEach(k => {
      if (!permitido[k]) return;
      sh.getRange(fila, COL[k]).setValue(permitido[k](c[k]));
    });
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
  if (m) return m.getRow();
  // ficha fusionada: el ID que tiene guardado su navegador puede ser el de la ficha repetida
  const a = sh.getRange(2, COL.alias, sh.getLastRow() - 1, 1).createTextFinder(id).findNext();
  return a ? a.getRow() : 0;
}

// =====================================================================
// Una ficha por persona: mismo teléfono = mismo contacto (aunque cambie el nombre o el email)
// =====================================================================
// Clave del teléfono: las 9 últimas cifras (así da igual +34, 0034, espacios o guiones)
function claveTel(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  return d.length >= 7 ? d.slice(-9) : '';
}

// Primera fila (la más antigua) con ese teléfono
function buscarTelefono(sh, tel) {
  const k = claveTel(tel), n = sh.getLastRow() - 1;
  if (!k || n < 1) return 0;
  const c = sh.getRange(2, COL.telefono, n, 1).getValues();
  for (let i = 0; i < n; i++) if (claveTel(c[i][0]) === k) return i + 2;
  return 0;
}

// Junta dos filas de la misma persona. a = la ficha que se queda (la más antigua), b = la repetida.
function combinar(a, b) {
  const r = a.slice();
  const v = (x, k) => x[COL[k] - 1], set = (k, x) => { r[COL[k] - 1] = x; };
  const vacio = x => x === '' || x == null;
  const txt = x => String(x == null ? '' : x).trim();
  // datos que faltan en la ficha
  ['telefono', 'correo', 'origen', 'setter', 'rellamar', 'rellamarAviso', 'asignado', 'agendadoEl', 'aviso', 'fijo']
    .forEach(k => { if (vacio(v(a, k)) && !vacio(v(b, k))) set(k, v(b, k)); });
  // respuestas del formulario: mandan las más recientes
  ['punto', 'objetivo', 'inversion', 'meta', 'cuando', 'instagram'].forEach(k => { if (!vacio(v(b, k))) set(k, v(b, k)); });
  if (v(b, 'cualifica') === 'Sí') set('cualifica', 'Sí');
  if (v(b, 'contacto') === '✅') set('contacto', '✅');
  set('intentos', Math.max(Number(v(a, 'intentos')) || 0, Number(v(b, 'intentos')) || 0));
  if (EMBUDO.indexOf(v(b, 'embudo')) > EMBUDO.indexOf(v(a, 'embudo'))) set('embudo', v(b, 'embudo'));
  // caller y agenda: si alguien ya lo lleva, se queda con él (y la reserva cuenta como suya, no como autoagendado)
  const caller = txt(v(a, 'caller')) || txt(v(b, 'caller'));
  set('caller', caller);
  const auto = txt(v(a, 'autoagenda')) || txt(v(b, 'autoagenda'));
  set('autoagenda', caller ? '' : auto);
  if (caller && (v(a, 'fijo') || auto)) set('fijo', caller);
  if (v(a, 'estado') === 'Agendado' || v(b, 'estado') === 'Agendado') set('estado', 'Agendado');
  else if (!txt(v(a, 'estado'))) set('estado', v(b, 'estado'));
  // notas, grabaciones e IDs: se suman
  const otros = [];
  if (txt(v(b, 'nombre')) && sinTildes(v(b, 'nombre')) !== sinTildes(v(a, 'nombre'))) otros.push('«' + txt(v(b, 'nombre')) + '»');
  if (txt(v(b, 'correo')) && txt(v(b, 'correo')).toLowerCase() !== txt(r[COL.correo - 1]).toLowerCase()) otros.push(txt(v(b, 'correo')));
  const notasB = txt(v(b, 'notas')).replace(/📅 Autoagendado por Calendly · /g, caller ? '📅 Reservó en Calendly · ' : '$&');
  const notas = [txt(v(a, 'notas')), notasB.split('\n').filter(l => txt(v(a, 'notas')).indexOf(l) < 0).join('\n'),
    otros.length ? '📎 También como ' + otros.join(' · ') + ' (ficha repetida unida el ' + Utilities.formatDate(new Date(), TZ, 'dd/MM') + ')' : '']
    .filter(Boolean).join('\n');
  set('notas', limpio(notas, 4000));
  set('notasLlamada', [txt(v(a, 'notasLlamada')), txt(v(b, 'notasLlamada'))].filter(Boolean).join('\n———\n'));
  const grabs = grabacionesDe(v(a, 'grabaciones')).concat(grabacionesDe(v(b, 'grabaciones')));
  set('grabaciones', grabs.length ? JSON.stringify(grabs) : '');
  set('alias', [txt(v(a, 'alias')), txt(v(b, 'id')), txt(v(b, 'alias'))].filter(Boolean).join(','));
  return r;
}

// Une las fichas repetidas que ya hay en el Sheet (mismo teléfono). Lo ejecuta configurar(); también se puede ejecutar solo.
// Las filas que se quitan se copian antes en la pestaña «Duplicados» (por si hay que revisar algo).
function fusionarDuplicados() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = hoja(HOJA_LEADS);
    const n = sh.getLastRow() - 1;
    if (n < 2) return 0;
    const datos = sh.getRange(2, 1, n, CABECERA.length).getValues();
    const primera = {}, quitar = [], unidas = {};
    datos.forEach((f, i) => {
      const k = claveTel(f[COL.telefono - 1]);
      if (!k) return;
      if (primera[k] == null) { primera[k] = i; return; }
      datos[primera[k]] = combinar(datos[primera[k]], f);
      unidas[primera[k]] = true;
      quitar.push(i);
    });
    if (!quitar.length) return 0;
    let dup = ss.getSheetByName('Duplicados');
    if (!dup) {
      dup = ss.insertSheet('Duplicados');
      dup.getRange(1, 1, 1, CABECERA.length + 1).setValues([['Unido el'].concat(CABECERA)]);
      estiloCabecera(dup.getRange(1, 1, 1, CABECERA.length + 1));
      dup.setFrozenRows(1);
    }
    const copia = quitar.map(i => [new Date()].concat(datos[i].map(celda)));
    dup.getRange(dup.getLastRow() + 1, 1, copia.length, CABECERA.length + 1).setValues(copia);
    Object.keys(unidas).forEach(i => { sh.getRange(Number(i) + 2, 1, 1, CABECERA.length).setValues([datos[i].map(celda)]); });
    quitar.slice().reverse().forEach(i => sh.deleteRow(i + 2));
    SpreadsheetApp.flush();
    return quitar.length;
  } finally {
    lock.releaseLock();
  }
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
    setter: String(v('setter') || ''),
    agendadoEl: v('agendadoEl') instanceof Date ? v('agendadoEl').toISOString() : '',
    fijo: String(v('fijo') || ''),
    notasLlamada: String(v('notasLlamada') || ''),
    grabaciones: grabacionesDe(v('grabaciones')).map(g => ({ archivo: g.archivo, fecha: g.fecha, por: g.por, mb: g.mb })),   // lo justo: la lista se pide cada 15 s
  };
}

// =====================================================================
// Grabaciones de llamadas (audio que el caller sube desde el iPhone)
// Van a tu Google Drive, carpeta privada «CRM · Grabaciones»: nadie las ve fuera del CRM.
// Solo pueden subirlas y oírlas el caller del lead y el maestro.
// =====================================================================
const CARPETA_GRAB = 'CRM · Grabaciones';
const TROZO = 4 * 1024 * 1024;           // el navegador las manda en trozos de 4 MB (múltiplo de 256 KB)
const MAX_GRAB = 150 * 1024 * 1024;

function grabacionesDe(x) {
  try { const l = JSON.parse(String(x || '[]')); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}

// Lead + permiso: el maestro siempre; un caller solo si el lead es suyo (o aún no tiene caller)
function leadConPermiso(sh, id, u) {
  const fila = buscarFila(sh, String(id || ''));
  if (!fila) throw new Error('Lead no encontrado');
  const f = sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
  const caller = String(f[COL.caller - 1] || '');
  if (u.rol !== 'maestro' && caller && caller.toUpperCase() !== u.nombre.toUpperCase())
    throw new Error('Solo el caller de este lead puede ver o subir sus grabaciones');
  return { fila: fila, f: f };
}

function carpetaGrab() {
  const it = DriveApp.getFoldersByName(CARPETA_GRAB);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA_GRAB);
}

// Abre en Drive una subida reanudable (en tu carpeta, con tu cuenta). Con «origen», Drive deja que el navegador
// suba el archivo DIRECTAMENTE a esa dirección (mucho más rápido que pasar los trozos por aquí).
function abrirSubida(nombre, tipo, total, origen) {
  const hd = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': tipo, 'X-Upload-Content-Length': String(total) };
  if (origen) hd.Origin = origen;
  const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true, headers: hd,
    payload: JSON.stringify({ name: nombre, mimeType: tipo, parents: [carpetaGrab().getId()] }),
  });
  const loc = r.getHeaders().Location || r.getHeaders().location;
  if (r.getResponseCode() !== 200 || !loc) throw new Error('Drive no ha aceptado la subida (' + r.getResponseCode() + ')');
  return loc;
}

// Apunta la grabación (ya en Drive) en la ficha del lead
function apuntarGrabacion(id, u, archivoId, ses) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja(HOJA_LEADS);
    const l = leadConPermiso(sh, id, u);
    const lista = grabacionesDe(l.f[COL.grabaciones - 1]);
    if (!lista.some(g => g.archivo === archivoId))
      lista.push({ archivo: archivoId, fecha: new Date().toISOString(), por: u.nombre, mb: Math.round(ses.total / 1048576 * 10) / 10, tipo: ses.tipo, nombre: ses.nombre });
    sh.getRange(l.fila, COL.grabaciones).setValue(JSON.stringify(lista));
    SpreadsheetApp.flush();
    return { ok: true, archivo: archivoId, lead: filaALead(sh.getRange(l.fila, 1, 1, CABECERA.length).getValues()[0]) };
  } finally {
    lock.releaseLock();
  }
}

// Subida directa terminada (o cortada): se pregunta a Drive cómo va y, si está completa, se apunta en la ficha.
// b: { id (lead), sube }
function terminarGrabacion(b, u) {
  const ses = JSON.parse(CacheService.getScriptCache().get('sube_' + String(b.sube || '').slice(0, 40)) || 'null');
  if (!ses || ses.id !== String(b.id) || ses.quien !== u.nombre) throw new Error('La subida ha caducado: vuelve a intentarlo');
  const r = UrlFetchApp.fetch(ses.url, { method: 'put', muteHttpExceptions: true, followRedirects: false, payload: '',
    headers: { 'Content-Range': 'bytes */' + ses.total } });
  const code = r.getResponseCode();
  if (code !== 200 && code !== 201) return { ok: true, completa: false };
  const archivo = JSON.parse(r.getContentText());
  CacheService.getScriptCache().remove('sube_' + b.sube);
  return Object.assign(apuntarGrabacion(b.id, u, archivo.id, ses), { completa: true });
}

// Subida por trozos: el primer trozo abre una subida reanudable en Drive y los siguientes la continúan.
// b: { id (lead), parte (0…), total (bytes), nombre, tipo, sube (lo devuelve el primer trozo), datos (base64) }
// Con b.directo (y b.origen = web del CRM) solo se abre la subida y se devuelve su dirección: el navegador sube el archivo.
function subirGrabacion(b, u) {
  const total = Math.round(Number(b.total)), parte = Math.round(Number(b.parte));
  if (!(total > 0 && total <= MAX_GRAB)) throw new Error('La grabación pesa demasiado (máx. ' + (MAX_GRAB >> 20) + ' MB)');
  if (!(parte >= 0 && parte * TROZO < total)) throw new Error('Trozo no válido');
  const tipo = /^audio\/[\w.+-]{1,40}$/.test(String(b.tipo || '')) ? String(b.tipo) : 'audio/mp4';
  const cache = CacheService.getScriptCache();
  let ses;
  if (parte === 0) {
    const l = leadConPermiso(hoja(HOJA_LEADS), b.id, u);
    const ext = (String(b.nombre || '').match(/\.(m4a|mp3|wav|aac|caf|ogg|opus|webm|mp4|amr|3gp)$/i) || ['', 'm4a'])[1].toLowerCase();
    const nombre = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH.mm') + ' · ' +
      limpio(l.f[COL.nombre - 1], 60).replace(/[\\/:*?"<>|]/g, '') + ' · ' + u.nombre + '.' + ext;
    const origen = b.directo && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(b.origen || '')) ? String(b.origen) : '';
    ses = { url: abrirSubida(nombre, tipo, total, origen), id: String(b.id), quien: u.nombre, total: total, nombre: nombre, tipo: tipo };
    b.sube = Utilities.getUuid();
    if (b.directo) {
      cache.put('sube_' + b.sube, JSON.stringify(ses), 21600);
      return { ok: true, sube: b.sube, url: ses.url };
    }
  } else {
    ses = JSON.parse(cache.get('sube_' + String(b.sube || '').slice(0, 40)) || 'null');
    if (!ses || ses.id !== String(b.id) || ses.quien !== u.nombre || ses.total !== total) throw new Error('La subida ha caducado: vuelve a intentarlo');
  }
  const bytes = Utilities.base64Decode(String(b.datos || ''));
  const desde = parte * TROZO, hasta = desde + bytes.length - 1;
  const ultimo = hasta + 1 >= total;
  if (!bytes.length || (!ultimo && bytes.length !== TROZO) || hasta >= total) throw new Error('Trozo con tamaño incorrecto');
  const r = UrlFetchApp.fetch(ses.url, {
    method: 'put', contentType: 'application/octet-stream', payload: bytes, muteHttpExceptions: true, followRedirects: false,
    headers: { 'Content-Range': 'bytes ' + desde + '-' + hasta + '/' + total },
  });
  const code = r.getResponseCode();
  if (!ultimo) {
    if (code !== 308) throw new Error('Drive ha cortado la subida (' + code + ')');
    cache.put('sube_' + b.sube, JSON.stringify(ses), 21600);
    return { ok: true, sube: b.sube, sigue: true };
  }
  if (code !== 200 && code !== 201) throw new Error('Drive no ha terminado la subida (' + code + ')');
  cache.remove('sube_' + b.sube);
  const archivo = JSON.parse(r.getContentText());
  return apuntarGrabacion(b.id, u, archivo.id, Object.assign({ tipo: tipo }, ses));
}

// Quitar una grabación (p. ej. se subió a otro lead): sale de la ficha y el archivo va a la papelera de Drive
// (se puede recuperar 30 días). Pueden el caller del lead, quien la subió y el maestro.
function borrarGrabacion(b, u) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hoja(HOJA_LEADS);
    const fila = buscarFila(sh, String(b.id || ''));
    if (!fila) throw new Error('Lead no encontrado');
    const f = sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0];
    const lista = grabacionesDe(f[COL.grabaciones - 1]);
    const g = lista.find(x => x.archivo === String(b.archivo || ''));
    if (!g) throw new Error('Grabación no encontrada');
    const caller = String(f[COL.caller - 1] || '');
    const suya = String(g.por || '').toUpperCase() === u.nombre.toUpperCase();
    if (u.rol !== 'maestro' && !suya && caller && caller.toUpperCase() !== u.nombre.toUpperCase())
      throw new Error('Solo quien la subió, el caller del lead o Mario pueden quitarla');
    const resto = lista.filter(x => x !== g);
    sh.getRange(fila, COL.grabaciones).setValue(resto.length ? JSON.stringify(resto) : '');
    SpreadsheetApp.flush();
    try { DriveApp.getFileById(g.archivo).setTrashed(true); } catch (e) { console.error('Drive papelera: ' + e); }
    return { ok: true, lead: filaALead(sh.getRange(fila, 1, 1, CABECERA.length).getValues()[0]) };
  } finally {
    lock.releaseLock();
  }
}

// Escuchar: el navegador pide el audio en trozos de 4 MB (solo grabaciones de ese lead y con permiso)
// b: { id (lead), archivo (ID de Drive), parte }
function leerAudio(b, u) {
  const l = leadConPermiso(hoja(HOJA_LEADS), b.id, u);
  const g = grabacionesDe(l.f[COL.grabaciones - 1]).find(x => x.archivo === String(b.archivo || ''));
  if (!g) throw new Error('Grabación no encontrada');
  const parte = Math.max(0, Math.round(Number(b.parte) || 0));
  const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(g.archivo) + '?alt=media', {
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), Range: 'bytes=' + (parte * TROZO) + '-' + ((parte + 1) * TROZO - 1) },
  });
  const code = r.getResponseCode();
  if (code === 416) return { ok: true, datos: '', fin: true };
  if (code !== 200 && code !== 206) throw new Error('No se ha podido leer la grabación (' + code + '). ¿Se ha borrado de Drive?');
  const total = Number(String((r.getHeaders()['Content-Range'] || r.getHeaders()['content-range'] || '')).split('/')[1]) || 0;
  const bytes = r.getContent();
  return { ok: true, datos: Utilities.base64Encode(bytes), tipo: g.tipo || 'audio/mp4', total: total,
    fin: code === 200 || !total || (parte + 1) * TROZO >= total };
}

// =====================================================================
// KPIs de setting (mensajes por Instagram/WhatsApp). Cada caller apunta sus números del día.
// Solo el acceso maestro activa o desactiva el setting de cada caller (Ajustes → columna C).
// Pestaña "Setting": una fila por caller y día.
// =====================================================================
const SET_CAMPOS = ['abiertos', 'convos', 'ofertas', 'agendas', 'ofertasBib', 'entradasBib'];
const SET_CABECERA = ['Día', 'Caller', 'Mensajes abiertos', 'Convos seguidas', 'Ofertas de llamada', 'Agendas',
  'Ofertas a biblioteca', 'Entradas a biblioteca', 'Actualizado'];

function hojaSetting() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(HOJA_SETTING);
  if (!sh) {
    sh = ss.insertSheet(HOJA_SETTING);
    sh.getRange(1, 1, 1, SET_CABECERA.length).setValues([SET_CABECERA]);
    estiloCabecera(sh.getRange(1, 1, 1, SET_CABECERA.length));
    sh.setFrozenRows(1);
    sh.getRange('A2:A').setNumberFormat('@');
  }
  return sh;
}

function filasSetting() {
  const sh = hojaSetting();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 2 + SET_CAMPOS.length).getDisplayValues().map((f, i) => {
    const o = { fila: i + 2, dia: String(f[0]).trim(), caller: String(f[1]).trim() };
    SET_CAMPOS.forEach((k, j) => { o[k] = Number(f[2 + j]) || 0; });
    return o;
  }).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.dia) && o.caller);
}

// Lo que recibe el dashboard: el caller, si tiene setting y sus días; el maestro, quién lo tiene y los días de todos
function settingDe(u) {
  const eq = equipo();
  const quita = o => { const c = Object.assign({}, o); delete c.fila; return c; };
  if (u.rol === 'maestro') {
    return { on: true, callers: eq.map(p => ({ nombre: p.nombre, on: p.setting })), dias: filasSetting().map(quita) };
  }
  const yo = eq.find(p => p.nombre === u.nombre);
  if (!yo || !yo.setting) return { on: false, dias: [] };
  return { on: true, dias: filasSetting().filter(o => o.caller.toUpperCase() === u.nombre.toUpperCase()).map(quita) };
}

function guardarSetting(b, u) {
  if (u.rol === 'maestro') throw new Error('El setting lo apunta cada caller desde su acceso');
  const yo = equipo().find(p => p.nombre === u.nombre);
  if (!yo || !yo.setting) throw new Error('No tienes el setting activado (lo activa Mario)');
  const dia = String(b.dia || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('Día no válido');
  const hace7 = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), TZ, 'yyyy-MM-dd');
  const manana = Utilities.formatDate(new Date(Date.now() + 864e5), TZ, 'yyyy-MM-dd');
  if (dia < hace7 || dia > manana) throw new Error('Solo puedes apuntar los últimos 7 días');
  const c = b.cambios || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = hojaSetting();
    let o = filasSetting().find(x => x.dia === dia && x.caller.toUpperCase() === u.nombre.toUpperCase());
    if (!o) {
      o = { fila: Math.max(sh.getLastRow(), 1) + 1, dia: dia, caller: u.nombre };
      SET_CAMPOS.forEach(k => { o[k] = 0; });
    }
    SET_CAMPOS.forEach(k => {
      if (!(k in c)) return;
      const x = Math.round(Number(c[k]));
      if (!(x >= 0 && x <= 9999)) throw new Error('Número no válido');
      o[k] = x;
    });
    sh.getRange(o.fila, 1, 1, SET_CABECERA.length)
      .setValues([[dia, u.nombre].concat(SET_CAMPOS.map(k => o[k])).concat([new Date()])]);
    SpreadsheetApp.flush();
    delete o.fila;
    return { ok: true, dia: o };
  } finally {
    lock.releaseLock();
  }
}

function activarSetting(b, u) {
  if (u.rol !== 'maestro') throw new Error('Solo el acceso maestro puede activar el setting');
  const p = equipo().find(x => x.nombre === String(b.para || ''));
  if (!p) throw new Error('Caller no encontrado');
  hoja(HOJA_AJUSTES).getRange(p.fila, 3).setValue(!!b.on);
  AJM = null;
  SpreadsheetApp.flush();
  return { ok: true, nombre: p.nombre, on: !!b.on };
}

// =====================================================================
// Instagram (DMs de @aleix.ytf): la función de Vercel /api/ig recibe los avisos de Meta y los reenvía aquí.
//  - Todos escriben como Aleix: cada setter se reconoce por su marca (emoji o coletilla, nunca su nombre) o por su enlace
//    (<dominio de G13>/a/<código> y /b/<código>). Ajustes → I: nombre (igual que en la columna A, o «Mario» para el maestro),
//    J: marca (varias separadas por comas), K: código del enlace.
//  - Solo se LEE: nunca se envía nada a Instagram desde aquí.
//  - Propuesta de llamada: frases de Ajustes → G11 (separadas por comas).
//  - Pestaña "Instagram": una fila por conversación.
// =====================================================================
const IG = {
  igsid: 1, usuario: 2, nombre: 3, setter: 4, inicio: 5, asignado: 6, respondio: 7, propuesta: 8,
  enlaceAgenda: 9, enlaceBiblio: 10, recurso: 11, ultimoOut: 12, ultimoIn: 13, visto: 14,
  followups: 15, ultimoFollow: 16, ultimo: 17,
};
const IG_CABECERA = ['ID Instagram', 'Usuario', 'Nombre', 'Setter', 'Primer mensaje', 'Setter desde', 'Respondió al setter',
  'Propuesta de llamada', 'Enlace de agenda', 'Enlace de biblioteca', 'Recurso automático', 'Último mensaje nuestro',
  'Último mensaje suyo', 'Visto', 'Follow-ups', 'Último follow-up', 'Último mensaje'];
const FRASES_DEF = 'llamada con mi socio, socio de admisiones, tener una llamada, hacer una llamada, una llamadita';
const FOLLOW_MIN = 120;     // un mensaje nuestro cuenta como follow-up si van 2 h sin respuesta desde el anterior

const sinTildes = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slugDe = t => sinTildes(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function setters() {
  return ajM().d.slice(1).map(r => [r[8], r[9], r[10]])
    .map(r => ({ nombre: String(r[0]).trim(), clave: String(r[1]).trim(), slug: slugDe(r[2] || r[0]),
      claves: String(r[1]).split(',').map(x => sinTildes(x).trim()).filter(Boolean) }))
    .filter(x => x.nombre);
}
// Cada caller solo ve lo suyo; el maestro (Mario) lo ve todo
const deUsuario = (u, nombre) => u.rol === 'maestro' || String(nombre).toUpperCase() === String(u.nombre).toUpperCase();
function settersDe(u) {
  return setters().filter(x => deUsuario(u, x.nombre)).map(x => ({ nombre: x.nombre, clave: x.clave, slug: x.slug }));
}
function setterDeSlug(v) {
  const s = slugDe(v);
  if (!s) return '';
  const x = setters().find(y => y.slug === s);
  return x ? x.nombre : '';
}
// Enlace de agenda de cada caller para cuando agenda él en plena llamada: <web>/c/<código>.
// Código = el de su enlace de setter (Ajustes → K) si también es setter; si no, su nombre (Mario.e → mario-e).
function codigoCaller(nombre) {
  const st = setters().find(y => y.nombre.toUpperCase() === nombre.toUpperCase());
  return st ? st.slug : slugDe(nombre);
}
function callerDeSlug(v) {
  const s = slugDe(v);
  if (!s) return '';
  const p = equipo().find(x => codigoCaller(x.nombre) === s || slugDe(x.nombre) === s);
  return p ? p.nombre : '';
}
function enlacesCallerDe(u) {
  return equipo().filter(p => deUsuario(u, p.nombre)).map(p => ({ nombre: p.nombre, slug: codigoCaller(p.nombre) }));
}
function paramDe(qs, k) {
  const m = String(qs || '').match(new RegExp('(?:^|[?&])' + k + '=([^&]*)'));
  try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; }
}

// Quién ha escrito el mensaje: su palabra clave o su enlace
function setterEnTexto(texto, lista) {
  const t = sinTildes(texto);
  const l = t.match(new RegExp(webRe() + '\\/[ab]\\/([a-z0-9-]+)'));
  if (l) { const x = lista.find(y => y.slug === l[1]); if (x) return x.nombre; }
  const tiene = c => new RegExp('(^|[^a-z0-9])' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(t);
  const x = lista.find(y => y.claves.some(tiene));
  return x ? x.nombre : '';
}
function esPropuesta(texto) {
  const t = sinTildes(texto);
  const fr = String(ajCelda(AJ.igFrases) || FRASES_DEF).split(',').map(x => sinTildes(x).trim()).filter(Boolean);
  return fr.some(f => t.indexOf(f) >= 0);
}
// Dominio(s) donde está publicada la web (Ajustes → G13, separados por comas). Los enlaces se reconocen en cualquiera de ellos.
let WEB_RE = null;
function dominiosWeb() {
  const v = String(ajCelda(AJ.web) || 'biblioteca.systemacademy.es');
  const l = v.split(',').map(x => x.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
  return l.length ? l : ['biblioteca.systemacademy.es'];
}
function webRe() {
  if (!WEB_RE) WEB_RE = '(?:' + dominiosWeb().map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
  return WEB_RE;
}
const esEnlaceAgenda = t => new RegExp(webRe() + '\\/(a\\/|agenda\\/|agendar)|calendly\\.com', 'i').test(t);
const esEnlaceBiblio = t => new RegExp(webRe() + '\\/b\\/', 'i').test(t);
const esRecurso = t => new RegExp(webRe(), 'i').test(t) && !esEnlaceAgenda(t) && !esEnlaceBiblio(t);

function hojaIg() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(HOJA_IG);
  if (!sh) {
    sh = ss.insertSheet(HOJA_IG);
    sh.getRange(1, 1, 1, IG_CABECERA.length).setValues([IG_CABECERA]);
    estiloCabecera(sh.getRange(1, 1, 1, IG_CABECERA.length));
    sh.setFrozenRows(1);
    sh.getRange('A2:A').setNumberFormat('@');
  }
  return sh;
}

// b = { action: 'ig', clave, eventos: [{ t: 'out'|'in'|'seen', u: IGSID, ts: ms, txt, mid }] }
function eventosInstagram(b) {
  const clave = String(ajCelda(AJ.igClave)).trim();
  if (clave.length < 16 || String(b.clave || '') !== clave) throw new Error('Clave de Instagram incorrecta');
  const todos = (Array.isArray(b.eventos) ? b.eventos : []).slice(0, 200);
  const motivo = e => !e ? 'vacío' : !/^(out|in|seen)$/.test(e.t) ? 'tipo ' + e.t
    : !/^\d{3,40}$/.test(String(e.u || '')) ? 'sin id de usuario (' + String(e.u || '').slice(0, 12) + ')'
    : !(Number(e.ts) > 0) ? 'sin fecha' : '';
  const descartes = todos.map(motivo).filter(Boolean);
  const evs = todos.filter(e => !motivo(e)).map(e => Object.assign({}, e, { ts: Number(e.ts) < 1e11 ? Number(e.ts) * 1000 : Number(e.ts) }))
    .sort((x, y) => x.ts - y.ts);
  if (!evs.length) return { ok: true, n: 0, descartes: descartes.join(', ') };
  const cache = CacheService.getScriptCache();
  const lista = setters();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let n = 0;
  try {
    const sh = hojaIg();
    const filas = {};      // igsid → { fila, f }
    evs.forEach(e => {
      if (e.mid) { const k = 'mid_' + String(e.mid).slice(-60); if (cache.get(k)) { descartes.push('repetido'); return; } cache.put(k, '1', 21600); }
      const u = String(e.u);
      let c = filas[u];
      if (!c) {
        const m = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(u).matchEntireCell(true).findNext() : null;
        c = filas[u] = m ? { fila: m.getRow(), f: sh.getRange(m.getRow(), 1, 1, IG_CABECERA.length).getValues()[0] }
          : { fila: 0, f: new Array(IG_CABECERA.length).fill('') };
        if (!m) { c.f[IG.igsid - 1] = u; c.f[IG.inicio - 1] = new Date(Number(e.ts)); c.f[IG.followups - 1] = 0; }
      }
      aplicarEvento(c.f, e, lista);
      n++;
    });
    Object.keys(filas).forEach(u => {
      const c = filas[u];
      if (!c.f[IG.usuario - 1]) perfilIg(c.f, cache);
      const fila = c.fila || Math.max(sh.getLastRow(), 1) + 1;
      sh.getRange(fila, 1, 1, IG_CABECERA.length).setValues([c.f.map(celda)]);
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, n: n, descartes: descartes.join(', ') };
}

function aplicarEvento(f, e, lista) {
  const v = k => f[IG[k] - 1], set = (k, x) => { f[IG[k] - 1] = x; };
  const ts = new Date(Number(e.ts));
  const txt = String(e.txt || '').slice(0, 1000);
  const t = x => (x instanceof Date ? x.getTime() : 0);
  if (e.t === 'seen') { if (ts > t(v('visto'))) set('visto', ts); return; }
  if (e.t === 'in') {
    set('ultimoIn', ts);
    if (v('setter') && v('asignado') && !v('respondio') && ts >= v('asignado')) set('respondio', ts);
    set('ultimo', '👤 ' + (txt || '[adjunto]').slice(0, 120));
    return;
  }
  // mensaje nuestro (escrito en la app de Instagram, por ManyChat…)
  const st = setterEnTexto(txt, lista);
  if (st) { if (!v('asignado')) set('asignado', ts); set('setter', st); }
  let marca = false;
  if (txt && esPropuesta(txt) && !v('propuesta')) { set('propuesta', ts); marca = true; }
  if (txt && esEnlaceAgenda(txt) && !v('enlaceAgenda')) { set('enlaceAgenda', ts); marca = true; }
  if (txt && esEnlaceBiblio(txt) && !v('enlaceBiblio')) { set('enlaceBiblio', ts); marca = true; }
  if (txt && esRecurso(txt) && !v('recurso')) set('recurso', ts);
  // follow-up: ya se le había propuesto algo, no ha contestado y han pasado 2 h desde nuestro último mensaje
  const sinRespuesta = t(v('ultimoOut')) > t(v('ultimoIn'));
  if (!marca && (v('propuesta') || v('enlaceAgenda') || v('enlaceBiblio')) && sinRespuesta && ts - t(v('ultimoOut')) >= FOLLOW_MIN * 60000) {
    set('followups', (Number(v('followups')) || 0) + 1);
    set('ultimoFollow', ts);
  }
  set('ultimoOut', ts);
  set('ultimo', '💬 ' + (txt || '[adjunto]').slice(0, 120));
}

// @usuario y nombre (con el token de Ajustes → G10). Si falla, se reintenta como mucho una vez por hora.
function perfilIg(f, cache) {
  const token = String(hoja(HOJA_AJUSTES).getRange(AJ.igToken).getDisplayValue()).trim();
  const id = String(f[IG.igsid - 1]);
  if (token.length < 20 || cache.get('perfil_' + id)) return;
  cache.put('perfil_' + id, '1', 3600);
  try {
    const r = UrlFetchApp.fetch('https://graph.instagram.com/v21.0/' + id + '?fields=name,username&access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { console.error('Instagram perfil ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200)); return; }
    const j = JSON.parse(r.getContentText());
    f[IG.usuario - 1] = limpio(j.username, 60);
    f[IG.nombre - 1] = limpio(j.name, 80);
  } catch (err) { console.error('Instagram perfil: ' + err); }
}

// El token de Instagram dura 60 días: se renueva solo cada semana (activador creado por configurar).
// Ejecuta → renovarTokenInstagram para probarlo a mano.
function renovarTokenInstagram() {
  const aj = hoja(HOJA_AJUSTES);
  const token = String(aj.getRange(AJ.igToken).getDisplayValue()).trim();
  if (token.length < 20) return;
  const r = UrlFetchApp.fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() === 200 && j.access_token) {
    aj.getRange(AJ.igToken).setValue(j.access_token);
    const caduca = new Date(Date.now() + (Number(j.expires_in) || 5184000) * 1000);
    aj.getRange(AJ.igRenovado).setValue('Renovado ' + Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy') + ' · caduca ' + Utilities.formatDate(caduca, TZ, 'dd/MM/yyyy'));
    return;
  }
  const msg = (j.error && j.error.message) || ('HTTP ' + r.getResponseCode());
  aj.getRange(AJ.igRenovado).setValue('❌ No se pudo renovar (' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + '): ' + msg);
  console.error('Token Instagram: ' + msg);
  try { enviarSlack({ text: '⚠️ No se ha podido renovar el token de Instagram (Ajustes → G10): ' + msg + '. Genera uno nuevo en Meta y pégalo en G10.' }); } catch (e) {}
}

// Suscribe la cuenta de Instagram (la del token de G10) a los avisos de mensajes y vistos.
// Ejecuta → conectarInstagram una vez después de configurar el webhook en Meta. El resultado sale en Ajustes → G14.
function conectarInstagram() {
  const aj = hoja(HOJA_AJUSTES);
  const token = String(aj.getRange(AJ.igToken).getDisplayValue()).trim();
  if (!aj.getRange('F14').getValue()) aj.getRange('F14').setValue('Instagram: conexión de avisos (conectarInstagram)');
  const marca = t => aj.getRange('G14').setValue(Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm') + ' · ' + t);
  if (token.length < 20) return marca('❌ Falta el token en G10');
  const base = 'https://graph.instagram.com/v21.0/me/subscribed_apps';
  const r = UrlFetchApp.fetch(base + '?subscribed_fields=messages,messaging_seen&access_token=' + encodeURIComponent(token), { method: 'post', muteHttpExceptions: true });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200 || !j.success) return marca('❌ ' + ((j.error && j.error.message) || ('HTTP ' + r.getResponseCode())));
  const g = UrlFetchApp.fetch(base + '?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  let campos = '';
  try { campos = (JSON.parse(g.getContentText()).data || []).map(x => (x.subscribed_fields || []).join(', ')).join(' | '); } catch (e) {}
  marca('✅ Conectada' + (campos ? ' (' + campos + ')' : ''));
}

// Para el dashboard: solo las conversaciones con setter, propuesta o enlace (las de ManyChat solas no).
// Cada setter recibe SOLO las suyas (se filtra aquí, no en el navegador); el maestro, todas.
function listarIg(u) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(HOJA_IG);
  if (!sh || sh.getLastRow() < 2) return [];
  const iso = x => x instanceof Date ? x.toISOString() : '';
  return sh.getRange(2, 1, sh.getLastRow() - 1, IG_CABECERA.length).getValues()
    .filter(f => f[0] && (f[IG.setter - 1] || f[IG.propuesta - 1] || f[IG.enlaceAgenda - 1] || f[IG.enlaceBiblio - 1]))
    .filter(f => u.rol === 'maestro' || (f[IG.setter - 1] && deUsuario(u, f[IG.setter - 1])))
    .map(f => {
      const o = {};
      Object.keys(IG).forEach(k => { const x = f[IG[k] - 1]; o[k] = x instanceof Date ? iso(x) : k === 'followups' ? Number(x) || 0 : String(x); });
      return o;
    });
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
        ? '📅 Encaja: se le ha ofrecido agendar llamada (si agenda, llegará al canal de agendas).'
        : '📞 Por llamar'))] },
      botonCrm(),
    ].filter(Boolean),
  });
}

// Se ejecuta cada minuto (activador que crea configurar()): avisa cuando toca volver a llamar (hora de las notas).
// (El aviso de «lleva X min sin llamar» se ha quitado.)
function revisarAvisos() {
  const sh = hoja(HOJA_LEADS);
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const desde = Math.max(1, n - 300);                  // solo miramos los últimos 300 leads
  const datos = sh.getRange(desde + 1, 1, n - desde + 1, CABECERA.length).getValues();
  const ahora = Date.now();
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
  });
}

// canal: 'leads' (G2: leads por llamar, rellamadas…) o 'agendas' (G15; si está vacío, también va a G2)
function enviarSlack(payload, canal) {
  const aj = hoja(HOJA_AJUSTES);
  const deAgendas = canal === 'agendas' ? String(aj.getRange(AJ.webhookAgendas).getValue()).trim() : '';
  const url = /^https:\/\/hooks\.slack\.com\//.test(deAgendas) ? deAgendas : String(aj.getRange(AJ.webhook).getValue()).trim();
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
// La pestaña Ajustes se lee UNA vez por petición (antes, ~15 lecturas por cada carga del CRM)
let AJM = null;
function ajM() {
  if (!AJM) {
    const sh = hoja(HOJA_AJUSTES);
    const r = sh.getRange(1, 1, Math.max(sh.getLastRow(), 15), 11);
    AJM = { v: r.getValues(), d: r.getDisplayValues() };
  }
  return AJM;
}
// Valor de una celda de Ajustes ('G9'…), del mismo bloque leído
function ajCelda(a1, valor) {
  const m = String(a1).match(/^([A-K])(\d+)$/);
  const f = (valor ? ajM().v : ajM().d)[Number(m[2]) - 1] || [];
  const x = f[m[1].charCodeAt(0) - 65];
  return x == null ? '' : x;
}

function equipo() {
  return ajM().d.slice(1)
    .map((r, i) => ({ nombre: String(r[0]).trim(), pin: String(r[1]).trim(), fila: i + 2, setting: activo(ajM().v[i + 1][2]) }))
    .filter(p => p.nombre);
}
const activo = v => v === true || /^(s[ií]|true|verdadero|x|1)$/i.test(String(v).trim());

function estados() {
  const l = ajM().d.slice(1).map(r => String(r[3]).trim()).filter(Boolean);
  return l.length ? l : ESTADOS;
}

function minutosAviso() {
  const m = Number(ajCelda(AJ.minutos, true));
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
  aj.getRange('C1').setValue('Setting (KPIs)');
  aj.getRange(2, 3, Math.max(aj.getMaxRows() - 1, 1), 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  [aj.getRange('A1:D1'), aj.getRange('F1:G1')].forEach(estiloCabecera);
  aj.setColumnWidth(1, 160); aj.setColumnWidth(2, 220); aj.setColumnWidth(3, 110);
  if (!aj.getRange('F6').getValue())
    aj.getRange('F6:G6').setValues([['Token de Calendly (opcional: hora de la llamada en el CRM)', '']]);
  if (!aj.getRange('F7').getValue()) {
    aj.getRange('G8').setNumberFormat('@');
    aj.getRange('F7:G8').setValues([['Acceso maestro: nombre (solo tú, ve los KPIs de todos)', 'Mario'], ['Acceso maestro: PIN', pinAleatorio()]]);
  }
  if (!aj.getRange('F9').getValue()) {
    aj.getRange('F9:G11').setValues([
      ['Instagram: clave (la misma que IG_CRM_KEY en Vercel)', Utilities.getUuid().replace(/-/g, '')],
      ['Instagram: token (para ver @usuario y nombre)', ''],
      ['Instagram: frases de propuesta de llamada (separadas por comas)', FRASES_DEF],
    ]);
  }
  if (!aj.getRange('F12').getValue()) aj.getRange('F12').setValue('Instagram: estado del token (se renueva solo cada semana)');
  if (!aj.getRange('F15').getValue()) aj.getRange('F15:G15').setValues([['Webhook de Slack para AGENDAS (otro canal; vacío = al de G2)', '']]);
  if (!aj.getRange('F13').getValue()) aj.getRange('F13:G13').setValues([['Dominio de la web para los enlaces (sin https; varios con comas)', 'biblioteca.systemacademy.es']]);
  if (!aj.getRange('I1').getValue()) {
    aj.getRange('I1:K1').setValues([['Setter (nombre del CRM)', 'Marca en sus mensajes (emoji o coletilla, NO su nombre; varias con comas)', 'Código de su enlace']]);
    aj.getRange('I2:K2').setValues([['Mario.e', '', 'mario']]);
  }
  estiloCabecera(aj.getRange('I1:K1'));
  aj.setColumnWidth(8, 30); aj.setColumnWidth(9, 180); aj.setColumnWidth(10, 220); aj.setColumnWidth(11, 170);
  aj.setColumnWidth(4, 170); aj.setColumnWidth(5, 30); aj.setColumnWidth(6, 260); aj.setColumnWidth(7, 420);
  aj.setFrozenRows(1);

  hojaSetting();
  hojaIg();

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
  sh.getRange(2, COL.agendadoEl, sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  sh.getRange('C2:C').setNumberFormat('@');
  sh.getRange('I2:J').setHorizontalAlignment('center');
  sh.getRange('K2:K').setWrap(true);
  // Pide permiso de Drive (grabaciones de llamadas). Si Drive falla, el resto del CRM se configura igual.
  let avisoDrive = '';
  try { carpetaGrab(); } catch (e) { avisoDrive = 'Grabaciones: ' + e.message; console.error(avisoDrive); }
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
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'renovarTokenInstagram').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('renovarTokenInstagram').timeBased().everyDays(7).atHour(4).create();
  ScriptApp.newTrigger('revisarAvisos').timeBased().everyMinutes(1).create();

  // Fichas repetidas (mismo teléfono) → una sola. Las quitadas quedan copiadas en la pestaña «Duplicados».
  let unidas = 0;
  try { unidas = fusionarDuplicados(); } catch (e) { console.error('Duplicados: ' + e); }

  ss.setActiveSheet(sh);
  if (unidas) ss.toast(unidas + ' ficha(s) repetida(s) unidas por teléfono (copia en la pestaña «Duplicados»).', 'CRM listo ✅', 20);
  else if (avisoDrive) ss.toast(avisoDrive + ' (mira crm/LEEME.md → Grabaciones)', 'CRM listo, pero sin grabaciones ⚠️', 30);
  else ss.toast('Siguiente: en "Ajustes" cambia los PIN, pega el webhook de Slack y publica como aplicación web.', 'CRM listo ✅', 15);
}

function estiloCabecera(r) {
  r.setBackground('#111111').setFontColor('#ffffff').setFontWeight('bold').setFontFamily('Poppins');
}

function pinAleatorio() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
