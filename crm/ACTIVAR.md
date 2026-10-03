# Activar todo: dominio, CRM, enlaces con seguimiento e Instagram

Orden: **A → B → C → D** (con eso ya funciona el seguimiento de YouTube, ManyChat, bio y setters).
**E** (Instagram automático) cuando tengas un rato con calma.

---

## A. Dominio `go.systemacademy.es` (10 min + espera)

`systemacademy.es` lo usa la web de la clase gratuita (`/prelanding`). Esta web (formulario, agenda, biblioteca) va en un subdominio propio.

1. Entra en **vercel.com** → abre el proyecto de la **web**: el conectado al repo `maciacontact-svg/test` **sin** Root Directory
   (el del CRM es el que tiene Root Directory `crm-app`).
2. **Settings → Domains → Add** → escribe `go.systemacademy.es` → **Add**. Si pregunta por redirecciones, déjalo sin redirigir.
3. Vercel lo marca como «Invalid Configuration» y te enseña el registro DNS que necesita. Normalmente:
   - Tipo **CNAME** · Nombre **`go`** · Valor **`cname.vercel-dns.com`** (copia el valor exacto que te muestre Vercel).
4. Ve a donde gestionas el DNS de `systemacademy.es` (el mismo sitio donde creaste `crmbiblio`) → **Añadir registro**:
   - Tipo `CNAME`, Host/Nombre `go`, Destino/Valor el de Vercel, TTL automático.
   - Si es **Cloudflare**: pon la nube en **gris** (solo DNS), no naranja.
5. Espera de 5 a 30 min hasta que Vercel ponga **Valid Configuration** (el candado SSL lo pone solo).
6. Comprueba en una ventana privada:
   - `go.systemacademy.es/privacidad` → política de privacidad
   - `go.systemacademy.es/agenda/youtube/prueba` → agenda de YouTube («Lo has visto en el vídeo. Ahora, tu caso.»)
   - `go.systemacademy.es/biblio/youtube/prueba` → formulario de la biblioteca

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
| **G13** | `go.systemacademy.es` (ya viene puesto) |
| **I–K** | Una fila por setter: **I** nombre (igual que en la columna A, o «Mario» para ti) · **J** su marca (emoji o coletilla, nunca su nombre; p. ej. `🙌🏼`) · **K** código del enlace (p. ej. `mario`) |

## D. Enlaces con seguimiento (ya funciona tras A, B y C)

Créalos en el CRM → pestaña **Enlaces** (solo tú la ves): fuente + a dónde lleva + etiqueta → **Copiar**.

| Dónde | Enlace |
|---|---|
| Descripción de cada vídeo de YouTube | `go.systemacademy.es/agenda/youtube/<nombre-del-video>` y `go.systemacademy.es/biblio/youtube/<nombre-del-video>` |
| ManyChat (el recurso que envía) | `go.systemacademy.es/biblio/manychat/<palabra-clave>` |
| Bio / historias de Instagram | `go.systemacademy.es/biblio/instagram` o `/agenda/instagram` |
| Setters por DM | `go.systemacademy.es/a/<código>` (agenda) y `/b/<código>` (biblioteca) |

Ejemplo de descripción de YouTube:

```
📅 Llamada gratuita para analizar tu caso: https://go.systemacademy.es/agenda/youtube/nichos-historia
📚 Biblioteca gratuita de recursos: https://go.systemacademy.es/biblio/youtube/nichos-historia
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
   - URL de devolución de llamada: `https://go.systemacademy.es/api/ig`
   - Token de verificación: el mismo `IG_VERIFY_TOKEN` → **Verificar y guardar**
   - Suscríbete a **messages** y **messaging_seen**, y activa la suscripción de la cuenta @aleix.ytf.
6. Meta → **Configuración de la app → Básica**:
   - URL de la política de privacidad: `https://go.systemacademy.es/privacidad`
   - URL de instrucciones de eliminación de datos: `https://go.systemacademy.es/privacidad#borrado`
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
