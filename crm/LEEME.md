# CRM de System Academy — cómo ponerlo en marcha (≈15 min)

```
Formulario de la web ──► Google Sheet (solo tú) ──► Dashboard del equipo (/crm)
                               │
                               └──► Slack: aviso al instante + recordatorio si a los 5 min nadie ha llamado
```

- **El Sheet es tuyo y solo tuyo.** Nadie más necesita acceso.
- **El equipo usa el dashboard** (`tu-web.vercel.app/crm`), entrando con su nombre y un PIN.
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
| **Callers y su PIN** | Columnas A y B | Añade o quita filas cuando quieras. El desplegable de «Caller» y el acceso al dashboard se actualizan solos. Ya vienen DAVID y MARIO con un PIN aleatorio: cámbialo y pásaselo a cada uno. |
| **Estados** | Columna D | Contactado, Volver a llamar, Seguimiento, Perdido, Nutricion, Agendado, Invalid. Puedes añadir más. |
| **Webhook de Slack** | G2 | Paso 3. |
| **URL del dashboard** | G3 | `https://TU-WEB.vercel.app/crm` (añade un botón «Abrir CRM» en Slack). |
| **Minutos para el aviso** | G4 | 5 por defecto. |
| **Mencionar al closer** | G5 | Opcional: su *ID de miembro* de Slack (perfil → ⋮ → Copiar ID de miembro). Así le suena la notificación a él. Puedes poner varios separados por comas. |

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
   - `/crm` deja de estar en modo demo y muestra tus leads reales.

> **Si cambias el código de `Code.gs` más adelante:** Implementar → Gestionar implementaciones → ✏️ → Versión: *Nueva versión* → Implementar. La URL no cambia.

## 5. Uso diario del equipo

- Entran en `tu-web.vercel.app/crm` con **nombre + PIN** (se queda guardado en su navegador hasta que pulsen «Salir»).
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
