# System Academy · funnel + biblioteca + CRM

Negocio: formación de YouTube faceless (B2C). Fundadores: Mario y Aleix. Caller: Mario.e (DAVID ya no está).
Responder SIEMPRE en español. Ser conciso.

## Reglas fijas
- Branding: gris #f3f3f3, negro #111, Poppins con acentos en cursiva, logo squircle con corte en S (SVG inline en cada página).
- Guardar siempre una copia del original antes de rehacer algo (`original/`, `guia/original/`).
- Enviar vista previa (captura) tras cambios visuales.
- Biblioteca sin bloqueos (nada obligatorio para entrar).
- No inventar testimonios ni resultados. No poner «Claude» en materiales para alumnos.
- Secretos (webhook de Slack, token de Calendly, PINs) solo en el Sheet → nunca en el repo.

## Despliegue
- Repo `maciacontact-svg/test`, rama `claude/infocapitals-structure-copy-egt7it`. Cada push publica solo (Vercel).
- Web pública: proyecto Vercel raíz del repo (dominio systemacademy.es). `vercel.json`: cleanUrls; redirige /crm-app y /crm.
- CRM: proyecto Vercel aparte con Root Directory `crm-app/` → crmbiblio.systemacademy.es (`?demo` = datos de ejemplo).

## Embudo (web estática, sin build)
`index.html` (landing, `script.js`) → `empezar.html` (formulario, `form.js`: preguntas, validación, `CUALIFICA`, cuenta) →
si cualifica `llamada.html` (Calendly embebido, `llamada.js`) → `confirmar.html` (vídeo YouTube, confirmación) ;
si no → `acceso.html` (Loom + portada, `acceso.js`) → `recursos.html` (biblioteca, `recursos.js`; calculadora RPM; botones a `agendar.html`).
- `config.js` (y `crm-app/config.js`): URL del Apps Script.
- «Cuenta» del alumno = `localStorage['sa-lead']` {id,nombre,correo}; en otro dispositivo, acción `cuenta` por email.

## CRM
- `crm/Code.gs` = Apps Script dentro del Google Sheet (pestañas Leads y Ajustes). Acciones: lead, agendado, cuenta, login, list, update.
  Columnas A–K visibles (orden fijado por el cliente), L–X ocultas (ver `COL`). Ajustes: A/B callers+PIN, D estados, G2 Slack, G3 URL CRM, G4 minutos, G5 menciones, G6 token Calendly, G7/G8 acceso maestro (Mario).
- Si cambia `Code.gs`, el usuario debe: copiar el archivo (GitHub «Copy raw file») → pegar en Apps Script → ejecutar `configurar` → Implementar › Gestionar › Nueva versión. Avisarle siempre.
- `crm-app/` = dashboard (login nombre+PIN, rol caller/maestro, rellamadas desde notas, embudo por lead, KPIs por caller).
  País por teléfono (`prefijo`/`espana`: +34 o 9 cifras por 6/7/9). Vista «🎯 Prioridad»: España buen form → España → LATAM buen form → LATAM (dentro, por llegada).
- Probar Code.gs con un mock de SpreadsheetApp en Node antes de entregar.

## Otros
- `guia/`: guía PDF (fuente `guia.html`, PDF de solo lectura). `historias/recortes/`: piezas PNG para stories.
- Instrucciones de instalación: `crm/LEEME.md`, `crm/PENDIENTE.md`.
