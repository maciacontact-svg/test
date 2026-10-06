# Jarvis · segundo cerebro de la empresa

Le mandas una idea (texto o **audio**) y Jarvis la guarda ordenada: título, categoría (Funnel, Contenido, Ventas,
Formación, Marketing, Equipo, Tecnología, Otros), **para qué sirve**, la idea explicada, el **siguiente paso** y la prioridad.
Luego se la pides y te la explica para ejecutarla.

- **Tus ideas** → WhatsApp al número de Jarvis. Solo hace caso a tu número (`WA_MARIO`); a cualquier otro no le contesta.
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

## Por qué un número propio de WhatsApp (y no un grupo o «chat conmigo mismo»)
La única forma oficial (sin riesgo para tu WhatsApp) de que un programa lea tus mensajes es la **API de WhatsApp Cloud de Meta**,
con un número propio para Jarvis. Tu chat contigo mismo o un grupo normal no se pueden leer sin herramientas no oficiales.
En la práctica es igual: guarda el número como «Jarvis», fíjalo arriba y escríbele como si fuera tu nota.

## Activarlo (una vez)

### 1. Sheet
Copia `crm/Code.gs` en Apps Script → ejecuta `configurar` (crea la pestaña «Ideas») → Implementar › Gestionar › **Nueva versión**.

### 2. Claves en Vercel (proyecto de la web pública → Settings → Environment Variables)
| Variable | Qué es |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys (es lo que ordena y explica las ideas) |
| `TRANSCRIBE_API_KEY` | para los audios: clave de OpenAI (platform.openai.com). Más barato: Groq, y entonces también `TRANSCRIBE_URL=https://api.groq.com/openai/v1/audio/transcriptions` y `TRANSCRIBE_MODEL=whisper-large-v3-turbo` |
| `CRM_API_URL`, `IG_CRM_KEY` | ya están (Instagram). La clave es Ajustes → G9 |

### 3. WhatsApp (developers.facebook.com → tu app → añadir producto **WhatsApp**)
1. Añade un número para Jarvis (uno que **no** esté ya en la app de WhatsApp; vale una SIM/eSIM barata o un fijo virtual) y verifícalo.
2. Business Settings → Usuarios del sistema → crea uno, dale la app y la cuenta de WhatsApp y genera un **token permanente**
   con `whatsapp_business_messaging` y `whatsapp_business_management`.
3. Variables en Vercel: `WA_TOKEN` (ese token), `WA_PHONE_ID` («Phone number ID»), `WA_APP_SECRET` (Configuración → Básica →
   Clave secreta), `WA_VERIFY_TOKEN` (una palabra que te inventes), `WA_MARIO` (tu número: `34600111222`).
4. Redeploy. WhatsApp → Configuración → Webhook: URL `https://biblioteca.systemacademy.es/api/jarvis-wa`, token = `WA_VERIFY_TOKEN`
   → suscribe el campo **messages**.
5. Comprueba: `https://biblioteca.systemacademy.es/api/jarvis-wa?diag=<WA_VERIFY_TOKEN>` → todo «ok».
6. Escríbele «hola» al número de Jarvis: te contesta con la ayuda.

### 4. Slack (api.slack.com/apps → Create New App → From scratch, nombre «Jarvis»)
1. OAuth & Permissions → Bot Token Scopes: `channels:history`, `groups:history`, `chat:write`, `users:read`, `files:read` → Install to Workspace.
2. Variables en Vercel: `SLACK_BOT_TOKEN` (xoxb-…), `SLACK_SIGNING_SECRET` (Basic Information), `SLACK_IDEAS_CANAL`
   (ID del canal: clic en el nombre del canal → abajo del todo, empieza por C). Redeploy.
3. Event Subscriptions → On → Request URL `https://biblioteca.systemacademy.es/api/jarvis-slack` → Subscribe to bot events:
   `message.channels` (y `message.groups` si el canal es privado) → Save.
4. En el canal: `/invite @Jarvis`. Lo que se escriba (o se grabe como clip de audio) se guarda; las respuestas en hilos no.

## Coste aproximado
Cada mensaje = 1 llamada corta a Claude (2 si es una pregunta) + 1 transcripción si es audio. Con uso normal, pocos euros al mes.
WhatsApp: los mensajes que contestan a los tuyos en 24 h no se cobran.

## Archivos
`api/_jarvis.js` (cerebro: Claude + transcripción + Sheet) · `api/jarvis-wa.js` · `api/jarvis-slack.js` ·
`crm/Code.gs` (pestaña Ideas: acciones ideaGuardar, ideasBuscar, ideaEstado, ideas, ideaEditar) · `crm-app/` pestaña Ideas.
