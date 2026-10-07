# System Academy · funnel + biblioteca + CRM

Negocio: formación de YouTube faceless (B2C). Fundadores: Mario y Aleix. Caller: Mario.e (DAVID ya no está).
Responder SIEMPRE en español. Ser conciso.

## Reglas fijas
- Acceso: solo Mario (maestro) ve todo. Cada caller/setter solo lo suyo en Instagram y Setting (filtrar en Code.gs, no solo en el navegador).
- Instagram: solo API oficial y solo lectura; nada que ponga en riesgo la cuenta (ni scraping, ni bots, ni envíos automáticos).
- Branding: gris #f3f3f3, negro #111, Poppins con acentos en cursiva, logo squircle con corte en S (SVG inline en cada página).
- Guardar siempre una copia del original antes de rehacer algo (`original/`, `guia/original/`).
- Enviar vista previa (captura) tras cambios visuales.
- Biblioteca sin bloqueos (nada obligatorio para entrar).
- No inventar testimonios ni resultados. No poner «Claude» en materiales para alumnos.
- Secretos (webhook de Slack, token de Calendly, PINs) solo en el Sheet → nunca en el repo.

## Despliegue
- Repo `maciacontact-svg/test`, rama `claude/infocapitals-structure-copy-egt7it`. Cada push publica solo (Vercel).
- Web pública: proyecto Vercel raíz del repo. OJO: systemacademy.es lo sirve OTRA web (prelanding de clase gratuita, no está en este repo); esta web va en biblioteca.systemacademy.es (dominio del proyecto Vercel «test»); el dominio de los enlaces se pone en Ajustes → G13 (por defecto biblioteca.systemacademy.es) (el CRM y Code.gs lo leen de ahí). `vercel.json`: cleanUrls; redirige /crm-app y /crm.
- CRM: proyecto Vercel aparte con Root Directory `crm-app/` → crmbiblio.systemacademy.es (`?demo` = datos de ejemplo).

## Embudo (web estática, sin build)
`index.html` (landing, `script.js`) → `empezar.html` (formulario, `form.js`: preguntas, validación, `CUALIFICA`, cuenta) →
si cualifica `llamada.html` (Calendly embebido, `llamada.js`) → `confirmar.html` (vídeo YouTube, confirmación) ;
si no → `acceso.html` (Loom + portada, `acceso.js`) → `recursos.html` (biblioteca, `recursos.js`; calculadora RPM; botones a `agendar.html`).
- `config.js` (y `crm-app/config.js`): URL del Apps Script.
- «Cuenta» del alumno = `localStorage['sa-lead']` {id,nombre,correo}; en otro dispositivo, acción `cuenta` por email.

## CRM
- `crm/Code.gs` = Apps Script dentro del Google Sheet (pestañas Leads y Ajustes). Acciones: lead, agendado, cuenta, login, list, update, setting, settingOn, closerOn, fathom, ig, grabacion, grabacionFin, borrarGrabacion, audio, ideaGuardar, ideasBuscar, ideaEstado, ideas, ideaEditar.
  Columnas A–K visibles (orden fijado por el cliente), L–Z ocultas (ver `COL`). Ajustes: A/B callers+PIN, C casilla Setting, D estados, G2 Slack, G3 URL CRM, G4 minutos, G5 menciones, G6 token Calendly, G7/G8 acceso maestro (Mario), G9 clave IG, G10 token IG (se renueva solo cada semana: `renovarTokenInstagram`, estado en G12), G11 frases de propuesta, G13 dominio de la web para enlaces, G15 webhook de Slack del canal de agendas (`enviarSlack(payload, 'agendas')`; G2 = leads/rellamadas; sin aviso de «X min sin llamar»), G16 closer por defecto, E (casilla) acceso al pipeline de closers, G14 estado de `conectarInstagram` (suscribe la cuenta a messages/messaging_seen), I–K setters (nombre, palabra clave, código de enlace).
- Si cambia `Code.gs`, el usuario debe: copiar el archivo (GitHub «Copy raw file») → pegar en Apps Script → ejecutar `configurar` → Implementar › Gestionar › Nueva versión. Avisarle siempre.
- `crm-app/` = dashboard (login nombre+PIN, rol caller/maestro, rellamadas desde notas, embudo por lead, KPIs por caller).
  Pestaña «Setting» (hoja Setting: día+caller → abiertos, convos, ofertas, agendas, ofertasBib, entradasBib); solo el maestro la activa por caller.
  Ficha del lead: «Notas caller» + «📝 Notas llamada» (columna notasLlamada, con plantilla) + «📼 Grabaciones» (audio subido desde el iPhone → Drive, carpeta privada «CRM · Grabaciones», resumible por trozos de 4 MB; columna grabaciones = JSON; solo el caller del lead o el maestro suben/oyen, filtrado en Code.gs).
  País por teléfono (`prefijo`/`espana`: +34 o 9 cifras por 6/7/9). Vista «🎯 Prioridad»: España buen form → España → LATAM buen form → LATAM (dentro, por llegada).
  Una ficha por teléfono (`claveTel` = 9 últimas cifras): formulario o Calendly con un número que ya está → se completa esa ficha (`combinar`; el ID nuevo va a la columna alias). `fusionarDuplicados` (lo llama `configurar`) une las que ya hay; las quitadas se copian en la pestaña «Duplicados».
  Grabaciones: el navegador sube directo a Drive (Apps Script abre la subida con Origin y `grabacionFin` la confirma); si falla, por trozos vía Apps Script. Escuchar = trozos en paralelo; tras subir se oye el archivo local.
  Enlace de caller `/c/<código>` (agendar en plena llamada; código = el de setter en K o el nombre): `agendado` con `porCaller` → Agendado, caller asignado y fijo (columna fijo, 🔒). Autoagendado y caller fijo solo los cambia el maestro (select de Caller: «📅 Auto» o un caller).
  Leads: «Todos» = sin asignar (al elegir caller pasan a «Por llamar» y «Mis leads»); agendados (estado Agendado o autoagendado) salen de la lista y van al chip «📅 Agendados» + pipeline. Columna I «Respondió» (✅/❌; estado «Contactado» = un intento, no respondió). Plantilla notas llamada: Situación, Temporalidad, Objetivo/visión, Puente, Tiempo y dinero, Oferta.
  Rellamadas desde notas (`horaEnNota`): hora, «mañana», día de la semana («llamar miércoles 18:00», sin hora → 10:00) o dd/mm; ignora líneas del CRM (📅📞📎🔁). Ese día el lead sube arriba; a la hora, Slack + aviso en el CRM.
  Pipeline de closers (pestaña «Closers»/«Mi pipeline»): columnas closer, closerEstado (`ESTADOS_CLOSER`: Sin contactar, Contactado, Respondió, Confirma, Ghost, Asiste, Cancela, Pagado, Seguimiento, Reagenda, No cierra, Plan de acción; `configurar` pasa los antiguos a los nuevos; «Confirma» ↔ botón Confirmada), closerNotas, linkLlamada, conclusiones, diaAgenda (Calendly), fuente (SETTING/COLD/YT/IG, auto por origen), confirmada (Sí/No; botón «✅ Confirmada / ⏳ No confirmada» en la celda del día: el closer la confirma por WhatsApp; si cambia la hora vuelve a «No confirmada»). Columna «Info CC» (solo lectura: caller, notas llamada y notas caller; abre la ficha) + «Notas closer» (closerNotas, también en la ficha) aparte de las del CC; las notas del CC (notas, notasLlamada) solo las cambia el caller del lead o el maestro (Code.gs). Acceso por persona en Ajustes E (acción closerOn, solo maestro); closer por defecto G16; Code.gs quita notas/link/conclusiones de leads de otros closers. Fathom: `api/fathom.js` (FATHOM_WEBHOOK_SECRET) → acción `fathom` (clave G9) rellena link y 3 líneas si están vacíos.
  KPIs: Hoy, Ayer, 7, 30, Todo y rango de fechas; tarjeta «Semana a semana». `informeSemanal` (lunes 9:00, Slack G2 + pestaña «Informe semanal»); `metricasSemana` igual en Code.gs y crm.js.
- Probar Code.gs con un mock de SpreadsheetApp en Node antes de entregar.

## Instagram (`crm/INSTAGRAM.md`)
- `api/ig.js` (Vercel, web pública): webhook de Meta (firma con IG_APP_SECRET) → Apps Script `ig` con IG_CRM_KEY. Env: IG_APP_SECRET, IG_VERIFY_TOKEN, IG_CRM_KEY, CRM_API_URL.
- Todos los setters escriben desde @aleix.ytf **como Aleix**: se distinguen por su marca (emoji/coletilla, NUNCA su nombre) y enlace propio (`/a/<código>` → agendar, `/b/<código>` → empezar, `/c/<código>` → agendar en modo caller, en `vercel.json`; `?s=` se guarda en `sa-setter`).
- Hoja «Instagram» (una fila por convo, ver `IG`). CRM: pestaña Instagram (seguimiento) y Setting = automático + correcciones a mano.

## Jarvis · segundo cerebro (`crm/JARVIS.md`)
- Ideas por Telegram de Mario (`api/jarvis-tg.js`, bot propio, solo IDs de TG_MARIO; conectar con `/api/jarvis-tg?setup=<TG_SECRET>`) → «Mario»; versión WhatsApp descartada en `original/api/jarvis-wa.js`; canal de Slack (`api/jarvis-slack.js`) → «Equipo». Gratis: GROQ_API_KEY (texto con GROQ_MODEL + audios con Whisper de Groq); si hay ANTHROPIC_API_KEY clasifica Claude (`api/_jarvis.js`): ideas / consulta / estado.
- Hoja «Ideas» (ver `IDEA` en Code.gs; clave G9): acciones ideaGuardar, ideasBuscar, ideaEstado (con clave), ideas, ideaEditar (maestro). En Slack solo salen ideas del equipo; Mario pide «mías» (defecto), «equipo» o «todas».
- CRM: pestaña «Ideas» (solo maestro). `package.json` raíz = dependencias de las funciones (@anthropic-ai/sdk, @vercel/functions).

## Origen y enlaces
- `/agenda/youtube/<vídeo>` → `youtube.html` (agenda con texto para YouTube, misma lógica que agendar). `/agenda/<fuente>/<etiqueta>` → agendar y `/biblio/<fuente>/<etiqueta>` → empezar (formulario de la biblioteca) (`vercel.json`), con utm_source/utm_content. Se guarda en `localStorage['sa-origen']` (script.js, form.js, llamada.js) y llega a Leads.origen (también en reservas sin formulario).
- CRM: `origenDe(l)` y `canalDe(l)` (▶️ YouTube / 📸 Instagram = ManyChat, bio, setter / Otros / Directo): etiqueta de canal en cada lead, filtro «Todos los canales», resumen por canal en Enlaces, pestaña «Enlaces» (solo maestro): generador, lista (localStorage) y tabla por fuente.
- `privacidad.html`: titular MASTERFORGE DIGITAL LLC, contacto maciacontact@gmail.com (enlazada en los pies de página; URL para Meta).

## Otros
- Kit de marca (solo maestro, fuera del CRM): `crm-app/kit.html` → crmbiblio.systemacademy.es/kit (botón «🎨 Marca» en la barra del CRM, solo maestro; pide nombre+PIN maestro o usa la sesión del CRM). Instagram, WhatsApp y portadas de Skool (1460×752); imágenes libres (mover, esquinas, delante/detrás, tarjeta). Recursos en `crm-app/marca/`. PNG de Skool en `skool/portadas/`. Original del artifact: `original/kit-instagram.html`.
- `guia/`: guía PDF (fuente `guia.html`, PDF de solo lectura). `historias/recortes/`: piezas PNG para stories.
- Instrucciones de instalación: `crm/LEEME.md`, `crm/PENDIENTE.md`. Activación completa paso a paso: `crm/ACTIVAR.md`.
