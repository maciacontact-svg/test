# CRM de System Academy — cómo ponerlo en marcha (≈15 min)

```
Formulario de la web ──► Google Sheet (solo tú) ──► Dashboard del equipo (web aparte del CRM)
                               │
                               └──► Slack: aviso al instante + recordatorio si a los 5 min nadie ha llamado
```

- **El Sheet es tuyo y solo tuyo.** Nadie más necesita acceso.
- **El equipo usa el dashboard** (una web aparte, por ejemplo `crm-system-academy.vercel.app`; ver «Publicar el dashboard»), entrando con su nombre y un PIN.
- Todo lo que cambian en el dashboard (caller, estado, contacto, intentos, notas) se guarda en tu Sheet al momento, y lo que tú cambies en el Sheet aparece en el dashboard en unos 15 segundos.

---

## 1. Crea el Google Sheet

1. Entra en [sheets.new](https://sheets.new) con tu cuenta de Google y llámalo, por ejemplo, **CRM System Academy**.
2. Menú **Extensiones → Apps Script**.
3. Borra lo que haya en `Código.gs` y pega **todo** el contenido de [`crm/Code.gs`](Code.gs). Guarda (icono del disquete).
4. Arriba, en el desplegable de funciones, elige **`configurar`** y pulsa **Ejecutar**.
   - Google te pedirá permisos: *Revisar permisos → tu cuenta → Configuración avanzada → Ir a (no seguro) → Permitir*. Es normal: el script es tuyo.
5. Vuelve al Sheet. Tendrás dos pestañas:
   - **Leads**: las columnas en tu orden (Fecha registro, Nombre, Teléfono, En qué punto está, Qué quiere conseguir, Correo, Caller, Estado, Contacto, Nº intentos, Notas), con los desplegables y colores.
     A la derecha hay columnas **ocultas** con el resto del formulario (inversión, meta a 3-6 meses, cuándo empieza, Instagram…). El equipo las ve en la ficha de cada lead en el dashboard.
   - **Ajustes**: aquí controlas todo sin tocar código.

## 2. Pestaña «Ajustes»

| Qué | Dónde | Notas |
|---|---|---|
| **Callers y su PIN** | Columnas A y B | Añade o quita filas cuando quieras. El desplegable de «Caller» y el acceso al dashboard se actualizan solos. Ya viene MARIO con un PIN aleatorio: cámbialo y pásaselo a cada uno. |
| **Estados** | Columna D | Contactado, Volver a llamar, Seguimiento, Perdido, Nutricion, Agendado, Invalid. Puedes añadir más. |
| **Webhook de Slack** | G2 | Paso 3. |
| **URL del dashboard** | G3 | la URL del dashboard, por ejemplo `https://crm-system-academy.vercel.app` (añade un botón «Abrir CRM» en Slack). |
| **Minutos para el aviso** | G4 | 5 por defecto. |
| **Mencionar al closer** | G5 | Opcional: su *ID de miembro* de Slack (perfil → ⋮ → Copiar ID de miembro). Así le suena la notificación a él. Puedes poner varios separados por comas. |
| **Token de Calendly** | G6 | Calendly → *Integraciones* → *API y webhooks* → *Personal access tokens*. Para la hora de la llamada y las reservas desde la biblioteca. |
| **Acceso maestro** | G7 / G8 | Nombre y PIN del fundador. Ve los KPIs de todos. |

## 3. Slack

1. Ve a [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From scratch** → nombre «CRM System Academy» → tu workspace.
2. En el menú izquierdo, **Incoming Webhooks** → actívalo → **Add New Webhook to Workspace** → elige el canal (por ejemplo `#leads`) → **Permitir**.
3. Copia la URL (`https://hooks.slack.com/services/…`) y pégala en **Ajustes → G2**.
4. En Apps Script, ejecuta **`probarSlack`**: debería llegar un lead de prueba al canal.

Qué llega a Slack:
- **Al instante**: 🔥 Nuevo lead con nombre, teléfono (clic para llamar), WhatsApp, correo, en qué punto está, qué quiere conseguir, inversión, cuándo empieza y su meta, más «Llámale antes de las HH:MM».
- **A los 5 minutos**, si nadie ha marcado ✅ ni ha sumado un intento: ⏰ «Fulano lleva 5 min sin llamar».

## 4. Publica el script (para que la web pueda hablar con él)

1. En Apps Script: **Implementar → Nueva implementación**.
2. Tipo (rueda dentada): **Aplicación web**.
3. **Ejecutar como: Yo**. **Quién tiene acceso: Cualquier usuario**.
   (Es necesario para que el formulario pueda guardar leads. Leer o cambiar datos exige nombre + PIN, y tras 5 PIN fallidos se bloquea 10 minutos.)
4. **Implementar** → copia la **URL de la aplicación web** (termina en `/exec`).
5. Pásame esa URL (o pégala tú en `config.js`, en `API_URL: '…'`) y súbelo. A partir de ahí:
   - el formulario manda cada lead al Sheet y a Slack;
   - el dashboard deja de estar en modo demo y muestra tus leads reales.

> **Si cambias el código de `Code.gs` más adelante:** Implementar → Gestionar implementaciones → ✏️ → Versión: *Nueva versión* → Implementar. La URL no cambia.

## 5. Publicar el dashboard (URL separada de la web)

El dashboard vive en la carpeta `crm-app/` y se publica como **otro proyecto de Vercel** con su propia URL. La web pública (landing, formulario, acceso, biblioteca) no lo incluye.

1. Vercel → **Add New → Project** → importa este mismo repositorio.
2. **Root Directory → Edit → `crm-app`**. Framework: *Other*. **Deploy**.
3. **Settings → Git → Production Branch**: la misma rama que usa la web.
4. Opcional: **Settings → General → Project Name** `crm-system-academy` → la URL queda `crm-system-academy.vercel.app`.
5. Pega esa URL en **Ajustes → G3** del Sheet.

> Si cambias la URL del Apps Script, cámbiala en `config.js` **y** en `crm-app/config.js`.

## 6. Buen form y autoagendados

- **Quién cualifica** se decide en `form.js` (`CUALIFICA`): inversión de 200 € al mes o más **y** empezar «Lo antes posible» o «En las próximas semanas».
- Quien cualifica pasa por `llamada.html` antes del acceso: se le ofrece agendar con Calendly (nombre y email ya rellenos) y puede saltarlo.
- Al reservar va a `confirmar.html`: «ATENCIÓN: tu llamada no está confirmada», confirmación obligatoria por WhatsApp, vídeo del proceso de admisión y botón a la biblioteca.
- Los botones de la biblioteca llevan a `agendar.html` (mismo calendario) para que la reserva también llegue al CRM. Sin ID (otro dispositivo) se busca por el email de Calendly; si nunca rellenó el formulario, se crea el lead. Necesita el **token de Calendly (G6)**.
- **Si agenda**: **Agendado**, **sin caller** (no se puede poner) y aviso en Slack. **Si no agenda**: pestaña **⭐ Buen form no agendado** y aviso en Slack a los minutos de G4.

## 7. Volver a llamar, embudo y KPIs

- **Volver a llamar desde las notas.** Si el caller escribe una hora en las notas, el lead sube arriba a esa hora («📞 Llamar ya») y Slack avisa:
  `19:00`, `19.30`, `19h`, `a las 7` (si ya ha pasado, entiende las 19:00), `mañana a las 10`, `en 2 horas`, `en media hora`.
  Sin hora (`después`, `luego`, `más tarde`, `en un rato`) → dentro de 2 h 30 min.
  Se quita sola cuando suma un intento a esa hora o cierra el lead (Agendado, Perdido, Invalid). Pestaña **📞 Rellamadas**.
- **Embudo de cada lead** (en su ficha): Contactado → Respondió → Conversación → Oferta de llamada → Agendado.
- **KPIs**: cada caller ve **solo los suyos**, sobre los leads que **se ha asignado**. Periodo: hoy, 7 días, 30 días o todo.
- **Acceso maestro** (solo Mario, fundador): Ajustes → **G7** nombre (viene «Mario») y **G8** PIN. Ve los KPIs de todo el equipo y el ranking. No es un caller (el caller es «Mario.e»).

## 8. País, prioridad y setting

- **País por el teléfono**: +34 / 0034, o 9 cifras sin prefijo que empiezan por 6, 7 o 9 → 🇪🇸 España; con otro prefijo → 🌎 LATAM.
- **🎯 Prioridad** (filtro de la lista): los leads sin cerrar en este orden: España buen form → España → LATAM buen form → LATAM. Dentro de cada grupo, por orden de llegada.
- **Setting** (mensajes por Instagram/WhatsApp): en Ajustes, columna **C «Setting (KPIs)»** hay una casilla por caller. Mario la activa o desactiva desde el CRM (acceso maestro › pestaña Setting) o marcándola en el Sheet.
  Quien lo tenga activado ve la pestaña **Setting** y apunta cada día: mensajes abiertos, convos seguidas, y en dos secciones **📞 ofertas de llamada → agendas** y **📚 ofertas a biblioteca → entradas a biblioteca**. Puede corregir los últimos 7 días.
  Se guarda en la pestaña **«Setting»** del Sheet (una fila por caller y día). Mario ve el embudo de todo el equipo y la tabla por caller.

- **Instagram** (automático): ver `crm/INSTAGRAM.md`. Pestaña **Instagram** del CRM con cada convo con propuesta o enlace (visto, follow-ups, agendó…) y el Setting se rellena solo; las tarjetas − / + quedan para correcciones.

- **Enlaces con seguimiento** (pestaña **Enlaces**, solo Mario): `systemacademy.es/agenda/<fuente>/<etiqueta>` (llamada) y
  `systemacademy.es/biblio/<fuente>/<etiqueta>` (biblioteca), p. ej. `/agenda/youtube/video-nichos-historia`. El origen se guarda en el lead
  (columna oculta «Origen») aunque agende más tarde, y la tabla «De dónde vienen los leads» cuenta leads, buen form y agendados por enlace.
  Para que se registren las reservas de quien no rellenó el formulario hace falta el token de Calendly (G6).

## 9. Uso diario del equipo

- Entran en la URL del dashboard con **nombre + PIN** (se queda guardado en su navegador hasta que pulsen «Salir»).
- Arriba: leads de hoy, por llamar, en seguimiento, agendados y tasa de contacto.
- Filtros: *Por llamar*, *Mis leads*, *Sin caller* y por estado, más un buscador.
- Cada lead nuevo sale con **«Llamar ya · 4:59»** en cuenta atrás; si pasa el tiempo, **«Tarde · +2 min»**.
- Clic en el nombre → ficha completa (todas las respuestas del formulario).
- Al elegir un estado como «Contactado», «Seguimiento»… se marca ✅ solo.
- Las notas se guardan al salir del cuadro de texto (o con Ctrl/Cmd + Enter).

## Preguntas rápidas

- **¿Puedo seguir editando en el Sheet?** Sí. El dashboard lo recoge en la siguiente actualización (15 s). No borres ni reordenes las columnas; ordenar filas o filtrar sí se puede.
- **¿Añadir un lead a mano?** Escríbelo en una fila nueva del Sheet; el dashboard le asigna su ID solo.
- **¿Quitar a un caller?** Borra su fila en Ajustes: deja de poder entrar al momento.
- **Límites de Google:** de sobra para cientos de leads al día.
