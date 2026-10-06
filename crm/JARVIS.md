# Jarvis · segundo cerebro de la empresa

Le mandas una idea (texto o **audio**) y Jarvis la guarda ordenada: título, categoría (Funnel, Contenido, Ventas,
Formación, Marketing, Equipo, Tecnología, Otros), **para qué sirve**, la idea explicada, el **siguiente paso** y la prioridad.
Luego se la pides y te la explica para ejecutarla.

- **Tus ideas** → chat privado con el bot de Jarvis en **Telegram** (texto o notas de voz). Solo hace caso a tu ID (`TG_MARIO`); a nadie más le contesta.
- **Ideas del equipo** → el canal de ideas de Slack. Contesta en el hilo.
- **Separadas**: por defecto te devuelve las tuyas. «Ideas del equipo» → las del equipo. «Todas las ideas» → las dos.
  En Slack solo salen las del equipo: las tuyas no se ven nunca allí.
- Todo queda en la pestaña **Ideas** del Sheet y en el CRM → pestaña **Ideas** (solo maestro), con filtros y estado.

## Qué le puedes decir

| Para… | Ejemplo |
|---|---|
| Guardar | (audio) «Se me ha ocurrido poner un quiz antes del formulario…» — varias ideas en un audio también |
| Pedir | «ideas del funnel» · «¿qué tenía para contenido?» · «explícame la 12» · «¿qué es lo más urgente?» |
| Equipo / todas | «ideas del equipo» · «todas las ideas» · «todas las de ventas» |
| Estado | «la 12 está hecha» · «empiezo la 7» · «descarta la 3» |

Cada idea lleva un número (#12) para pedirla o cambiarle el estado. Las hechas y descartadas dejan de salir al pedir ideas.

## Por qué Telegram
Un bot de Telegram es gratis, no necesita número de teléfono ni aprobación de Meta y admite notas de voz.
(La versión de WhatsApp quedó guardada en `original/api/jarvis-wa.js` por si algún día se quiere.)

## Activarlo (una vez)

### 1. Sheet
Copia `crm/Code.gs` en Apps Script → ejecuta `configurar` (crea la pestaña «Ideas») → Implementar › Gestionar › **Nueva versión**.

### 2. Claves en Vercel (proyecto de la web pública → Settings → Environment Variables)
| Variable | Qué es |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (es lo que ordena y explica las ideas) |
| `TRANSCRIBE_API_KEY` | para los audios: clave de OpenAI (platform.openai.com). Más barato: Groq, y entonces también `TRANSCRIBE_URL=https://api.groq.com/openai/v1/audio/transcriptions` y `TRANSCRIBE_MODEL=whisper-large-v3-turbo` |
| `CRM_API_URL`, `IG_CRM_KEY` | ya están (Instagram). La clave es Ajustes → G9 |

### 3. Telegram (5 minutos)
1. En Telegram abre **@BotFather** → `/newbot` → nombre «Jarvis» → usuario acabado en `bot` (p. ej. `jarvis_systemacademy_bot`).
   Te da un **token** (`123456789:AA…`).
2. Variables en Vercel: `TG_TOKEN` (ese token) y `TG_SECRET` (una palabra inventada, solo letras, números, - y _). Redeploy.
3. Abre `https://biblioteca.systemacademy.es/api/jarvis-tg?setup=<TG_SECRET>` → conecta el bot y dice qué falta (todo «ok» menos TG_MARIO).
4. Escribe «hola» a tu bot: te contesta **«Tu ID de Telegram es …»**. Ponlo en Vercel como `TG_MARIO` → Redeploy.
5. Vuelve a escribirle: ya es tu Jarvis. A partir de ahí no contesta a nadie más.
   Fíjalo arriba en Telegram y, si quieres, en @BotFather → `/setuserpic` ponle el logo.

### 4. Slack (api.slack.com/apps → Create New App → From scratch, nombre «Jarvis»)
1. OAuth & Permissions → Bot Token Scopes: `channels:history`, `groups:history`, `chat:write`, `users:read`, `files:read` → Install to Workspace.
2. Variables en Vercel: `SLACK_BOT_TOKEN` (xoxb-…), `SLACK_SIGNING_SECRET` (Basic Information), `SLACK_IDEAS_CANAL`
   (ID del canal: clic en el nombre del canal → abajo del todo, empieza por C). Redeploy.
3. Event Subscriptions → On → Request URL `https://biblioteca.systemacademy.es/api/jarvis-slack` → Subscribe to bot events:
   `message.channels` (y `message.groups` si el canal es privado) → Save.
4. En el canal: `/invite @Jarvis`. Lo que se escriba (o se grabe como clip de audio) se guarda; las respuestas en hilos no.

## Coste aproximado
Cada mensaje = 1 llamada corta a Claude (2 si es una pregunta) + 1 transcripción si es audio. Con uso normal, pocos euros al mes.
Telegram: gratis.

## Archivos
`api/_jarvis.js` (cerebro: Claude + transcripción + Sheet) · `api/jarvis-tg.js` · `api/jarvis-slack.js` ·
`crm/Code.gs` (pestaña Ideas: acciones ideaGuardar, ideasBuscar, ideaEstado, ideas, ideaEditar) · `crm-app/` pestaña Ideas.
