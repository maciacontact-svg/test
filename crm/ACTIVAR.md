# Activar todo: dominio, CRM, enlaces con seguimiento e Instagram

Orden: **A → B → C → D** (con eso ya funciona el seguimiento de YouTube, ManyChat, bio y setters).
**E** (Instagram automático) cuando tengas un rato con calma.

---

## A. Dominio de la web: `biblioteca.systemacademy.es` (ya está)

`systemacademy.es` lo usa la web de la clase gratuita (`/prelanding`). Esta web (formulario, agenda, biblioteca) está en
**`biblioteca.systemacademy.es`** (Vercel → proyecto `test` → Domains, «Valid Configuration»). No hay que crear nada.

Comprueba en una ventana privada:
- `biblioteca.systemacademy.es/agenda/youtube/prueba` → agenda de YouTube («Lo has visto en el vídeo. Ahora, tu caso.»)
- `biblioteca.systemacademy.es/biblio/youtube/prueba` → formulario de la biblioteca
- `biblioteca.systemacademy.es/privacidad` → política de privacidad

## B. Actualizar el Apps Script (5 min)

1. En GitHub: repo `maciacontact-svg/test` → cambia la rama a **`claude/infocapitals-structure-copy-egt7it`** → abre `crm/Code.gs` →
   botón **«Copy raw file»** (icono de copiar, arriba a la derecha del código).
2. Abre el Google Sheet → **Extensiones → Apps Script** → archivo `Code.gs` → selecciona todo (Ctrl/Cmd+A) → pega → **Guardar** (icono del disquete).
3. Arriba, en el desplegable de funciones, elige **`configurar`** → **Ejecutar**.
   Si pide permisos: Revisar permisos → tu cuenta → «Configuración avanzada» → «Ir a … (no seguro)» → **Permitir**.
   Crea las pestañas «Setting» e «Instagram», las columnas nuevas, la renovación semanal del token y los ajustes G9–G13. No borra nada.
4. **Implementar → Gestionar implementaciones** → lápiz ✏️ → Versión: **Nueva versión** → **Implementar**.
   La URL no cambia: no hay que tocar `config.js`.

## C. Ajustes del Sheet (5 min)

| Celda | Qué poner |
|---|---|
| Fila de **DAVID** (A–C) | Bórrala |
| **C** (casilla «Setting») | Marca a quien haga setting (o desde el CRM → pestaña Setting) |
| **G6** | Token de Calendly, si no está: Calendly → Integraciones → **API y webhooks** → Generar token personal. Sin él no se registran las reservas de quien no ha rellenado el formulario (p. ej. desde YouTube). |
| **G11** | Las frases exactas con las que proponéis la llamada, separadas por comas |
| **G13** | `biblioteca.systemacademy.es` (ya viene puesto) |
| **I–K** | Una fila por setter: **I** nombre (igual que en la columna A, o «Mario» para ti) · **J** su marca (emoji o coletilla, nunca su nombre; p. ej. `🙌🏼`) · **K** código del enlace (p. ej. `mario`) |

## D. Enlaces con seguimiento (ya funciona tras A, B y C)

Créalos en el CRM → pestaña **Enlaces** (solo tú la ves): fuente + a dónde lleva + etiqueta → **Copiar**.

| Dónde | Enlace |
|---|---|
| Descripción de cada vídeo de YouTube | `biblioteca.systemacademy.es/agenda/youtube/<nombre-del-video>` y `biblioteca.systemacademy.es/biblio/youtube/<nombre-del-video>` |
| ManyChat (el recurso que envía) | `biblioteca.systemacademy.es/biblio/manychat/<palabra-clave>` |
| Bio / historias de Instagram | `biblioteca.systemacademy.es/biblio/instagram` o `/agenda/instagram` |
| Setters por DM | `biblioteca.systemacademy.es/a/<código>` (agenda) y `/b/<código>` (biblioteca) |

Ejemplo de descripción de YouTube:

```
📅 Llamada gratuita para analizar tu caso: https://biblioteca.systemacademy.es/agenda/youtube/nichos-historia
📚 Biblioteca gratuita de recursos: https://biblioteca.systemacademy.es/biblio/youtube/nichos-historia
```

Qué pasa con cada lead:
- Se guarda por qué enlace entró (aunque agende días después) → en el CRM sale **▶️ YouTube** o **📸 Instagram** en cada lead,
  el filtro «Todos los canales» y la tabla **«De dónde vienen los leads»** (pestaña Enlaces).
- Quien agenda va a la página de confirmación, como siempre.

**Prueba:** abre un enlace de YouTube en ventana privada, rellena el formulario con datos de prueba → en el CRM debe salir con ▶️ YouTube.
Luego borra esa fila del Sheet.

## E. Instagram automático (20-30 min, mejor juntos)

1. **Instagram** (@aleix.ytf, cuenta profesional): Configuración → **Mensajes y respuestas a historias** → **Herramientas conectadas** →
   **Permitir acceso a mensajes** → activado.
2. **developers.facebook.com** → entra con tu Facebook → **Mis apps → Crear app** → nombre «System Academy CRM» →
   caso de uso **«Gestionar mensajes y contenido en Instagram»** → crear.
3. En la app → **Casos de uso → Instagram → Configuración de la API con inicio de sesión de Instagram**:
   - **Generar tokens de acceso → Añadir cuenta** → entra con @aleix.ytf → acepta → **Generar token** → cópialo → Sheet **G10**
     (se renueva solo cada semana; el estado sale en **G12**).
     Si Meta pide que la cuenta sea «evaluadora»: Roles de la app → Evaluadores de Instagram → añade @aleix.ytf y acepta la invitación en
     Instagram (Configuración → Apps y sitios web → Invitaciones de evaluador).
   - Apunta la **clave secreta de la app de Instagram** que aparece en esa misma página (para `IG_APP_SECRET`).
4. **Vercel** → proyecto de la **web** → **Settings → Environment Variables** → añade (Production):

   | Variable | Valor |
   |---|---|
   | `IG_APP_SECRET` | la clave secreta de la app de Instagram (paso 3) |
   | `IG_VERIFY_TOKEN` | una frase larga que te inventes, sin espacios (la usarás en el paso 5) |
   | `IG_CRM_KEY` | lo que hay en el Sheet, **G9** |
   | `CRM_API_URL` | la URL del Apps Script (la de `config.js`, termina en `/exec`) |

   Después: **Deployments** → el último → **⋯ → Redeploy**.
5. Meta, misma página → **Configurar webhooks**:
   - URL de devolución de llamada: `https://biblioteca.systemacademy.es/api/ig`
   - Token de verificación: el mismo `IG_VERIFY_TOKEN` → **Verificar y guardar**
   - Suscríbete a **messages** y **messaging_seen**, y activa la suscripción de la cuenta @aleix.ytf.
6. Meta → **Configuración de la app → Básica**:
   - URL de la política de privacidad: `https://biblioteca.systemacademy.es/privacidad`
   - URL de instrucciones de eliminación de datos: `https://biblioteca.systemacademy.es/privacidad#borrado`
   - Icono y categoría → **Guardar**.
7. **Prueba**: desde otra cuenta de Instagram escribe a @aleix.ytf; contesta desde @aleix.ytf con tu marca y una propuesta
   («🙌🏼 ¿te parecería bien tener una llamada con mi socio de admisiones?») → en 15-30 s sale en el CRM, pestaña **Instagram**
   (y en la pestaña «Instagram» del Sheet).
8. Si con la app en desarrollo **solo llegan mensajes de cuentas con rol en la app**: pásala a **Activa** (arriba en el panel) y, si lo pide,
   **Revisión de la app → acceso avanzado a `instagram_business_manage_messages`** (uso: CRM interno, solo lectura, para hacer seguimiento).
   Puede tardar unos días.

**Si no llega nada** → Vercel → proyecto web → **Logs**, filtra `/api/ig`:
- `401 Bad signature` → `IG_APP_SECRET` no es el correcto (prueba con la clave de *Configuración → Básica*).
- `CRM: Clave de Instagram incorrecta` → `IG_CRM_KEY` no coincide con **G9**.
- No aparece ninguna petición → el webhook no está suscrito o la app está en desarrollo (paso 8).

## F. Equipo

Dile a cada setter: su **marca**, que sus enlaces están en la pestaña **Instagram** del CRM y que, si tiene el setting activado,
verá la pestaña **Setting**. Cada uno solo ve lo suyo; tú lo ves todo.

## G. Pipeline de closers, informe semanal y Fathom

1. Actualiza el Apps Script (paso **B**) y ejecuta `configurar`: crea la columna **E «Closer (pipeline)»** en Ajustes,
   la celda **G16** (closer por defecto) y el activador del **informe semanal** (lunes a las 9 → Slack, canal de G2,
   y una fila en la pestaña «Informe semanal»).
2. En el CRM (como Mario) → pestaña **Closers** → «Quién tiene acceso»: activa a cada closer (hoy, Mario.e).
   Los agendados sin closer van al de **G16**; si G16 está vacío y solo hay un closer con acceso, a ese.
3. **Fathom** (opcional: rellena solo el link y 3 líneas de conclusiones):
   - Fathom → *Settings → API Access → Webhooks* → **Add webhook** con la URL `https://biblioteca.systemacademy.es/api/fathom`,
     marcando *Include summary* (y *Action items*). Copia el **secreto** que te da (`whsec_…`).
   - Vercel → proyecto web → *Settings → Environment Variables*: `FATHOM_WEBHOOK_SECRET` = ese secreto
     (`IG_CRM_KEY` y `CRM_API_URL` ya están de Instagram). **Redeploy**.
   - El lead se encuentra por el email del invitado de la reunión: tiene que ser el mismo que el de su ficha.
     Solo se rellena si el campo está vacío (lo que escriba el closer manda).
   - Si no llega: Vercel → **Logs**, filtra `/api/fathom` (`Bad signature` = el secreto no coincide; `Ningún lead con ese email`).
