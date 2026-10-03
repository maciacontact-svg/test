# Instagram → CRM (DMs de @aleix.ytf)

Meta avisa de cada DM (enviado, recibido y visto) a `https://systemacademy.es/api/ig` (función de Vercel, `api/ig.js`),
que comprueba que viene de Meta y lo pasa al Apps Script (acción `ig`). Es la API oficial: no pone en riesgo la cuenta.

## Qué detecta

| Qué | Cómo |
|---|---|
| **De qué setter es la convo** | Su **marca** en un mensaje, o su **enlace** (`/a/<código>` o `/b/<código>`) |
| **Mensaje abierto** | El primer mensaje con la marca o el enlace del setter |
| **Convo seguida** | El lead contesta después de eso |
| **Propuesta de llamada** | Frases de Ajustes → **G11** (p. ej. «llamada con mi socio») |
| **Enlace de agenda** | `systemacademy.es/a/<código>` (o un enlace de Calendly) |
| **Enlace de biblioteca** | `systemacademy.es/b/<código>` (el de ManyChat cuenta aparte, como «recurso automático») |
| **Visto / sin ver** | Aviso de lectura de Instagram (si el lead no lo tiene desactivado) |
| **Follow-up** | Mensaje nuestro tras una propuesta o enlace, sin respuesta y 2 h o más después del anterior |
| **Agendó / entró en la biblioteca** | Reserva o formulario que llegan con el enlace del setter (`?s=<código>`); en la pestaña Instagram se unen por el usuario de Instagram del formulario |

## 1. Ajustes del Sheet (después de pegar el nuevo Code.gs y ejecutar `configurar`)

- **G9** clave de Instagram: se genera sola. Cópiala para Vercel (paso 3).
- **G10** token de Instagram (paso 2): sirve para ver el @usuario y el nombre de cada lead.
- **G11** frases de propuesta, separadas por comas. Añade las que uséis de verdad.
- **Columnas I–K**, una fila por setter:
  - **I** nombre: el mismo que en la columna A (o «Mario» para el acceso maestro).
  - **J** marca: como todos escriben **como Aleix**, nunca su nombre. Un emoji o una coletilla natural que solo use ese setter
    en su primer mensaje, p. ej. `🙌🏼` (Mario.e) y `💯` (otro). Puede tener varias separadas por comas: `🙌🏼, de locos crack`.
    Que no la use nadie más ni ManyChat en sus flujos (si no, le asignaría convos que no son suyas).
  - **K** código del enlace: `mario` → `systemacademy.es/a/mario` (agenda) y `systemacademy.es/b/mario` (biblioteca).

## 2. App de Meta (una vez, ~20 min)

1. En Instagram (@aleix.ytf, cuenta profesional): *Ajustes › Mensajes y respuestas a historias › Herramientas conectadas › Permitir acceso a mensajes* → activado.
2. [developers.facebook.com](https://developers.facebook.com) › **Crear app** › caso de uso **«Gestionar mensajes y contenido en Instagram»**.
3. En la app: **Instagram › Configuración de la API con inicio de sesión de Instagram**:
   - **Generar token** → añade @aleix.ytf → copia el token → Sheet **G10**.
   - **Configurar webhooks**: URL `https://systemacademy.es/api/ig` · token de verificación = el `IG_VERIFY_TOKEN` del paso 3 → Verificar y guardar.
   - Suscríbete a **messages** y **messaging_seen**.
4. *Configuración de la app › Básica* → copia la **clave secreta** (para `IG_APP_SECRET`).

> Modo de la app: en «desarrollo» Meta puede enviar solo los mensajes de personas con rol en la app. Para recibir los de cualquier lead
> puede pedir pasar la app a «activa» (URL de política de privacidad) y la revisión del permiso `instagram_business_manage_messages`.
> Lo comprobamos al conectarlo enviando un DM desde una cuenta cualquiera.

## 3. Vercel (proyecto de la web, no el del CRM)

*Settings › Environment Variables* (Production) y luego **Redeploy**:

| Variable | Valor |
|---|---|
| `IG_APP_SECRET` | clave secreta de la app de Meta |
| `IG_VERIFY_TOKEN` | una palabra larga que te inventes (la misma que en Meta) |
| `IG_CRM_KEY` | la clave de Ajustes → **G9** |
| `CRM_API_URL` | la URL del Apps Script (la de `config.js`) |

## 4. Comprobar

Manda desde @aleix.ytf un DM con la marca de un setter a otra cuenta, contesta desde ella y mira la pestaña **Instagram** del CRM
(y la hoja **Instagram** del Sheet). Si no llega nada: Vercel › Logs de `/api/ig`, y en Meta › Webhooks › «Probar».

## Quién ve qué

- **Mario (acceso maestro)** ve todas las conversaciones, todos los setters y sus enlaces.
- **Cada setter** solo recibe las suyas (las que llevan su marca o su enlace) y solo su enlace. Se filtra en el Apps Script,
  así que no puede ver las de otro ni tocando el navegador. Las convos sin setter solo las ve Mario.

## Seguridad de la cuenta y normas de Meta

- Es la **API oficial** de Meta para mensajes de Instagram (la misma vía que ManyChat). No se entra con usuario y contraseña,
  no hay extensiones ni bots que lean la bandeja: eso es lo que Instagram penaliza.
- **Solo se lee**: el CRM nunca envía mensajes, no sigue ni da «me gusta». Todo lo escribe una persona desde la app.
- Llamadas a Meta mínimas: una por conversación nueva (para el @usuario), y se recuerda.
- Datos mínimos: @usuario, nombre, fechas de cada paso y un trozo del último mensaje (120 caracteres). No se guardan las conversaciones.
  Solo para el seguimiento interno: no se venden ni se ceden, ni se usan para anuncios.
- Para activar la app, Meta pide una **URL de política de privacidad** y cómo pedir el **borrado de datos**: hay que publicarla en la web
  (pendiente: titular y email de contacto).
- Si alguien pide que se borren sus datos: borra su fila en la hoja «Instagram» (y en «Leads» si está).
- Los tokens y claves solo van en el Sheet y en las variables de Vercel, nunca en el repo.

## ManyChat

Sigue funcionando igual: él responde y esta app solo escucha. Sus mensajes también llegan (cuentan como último mensaje, no para ningún setter).
Para medir los que entran solos con su recurso, pon en el enlace de ManyChat `?utm_source=manychat&utm_campaign=PALABRA`: en el CRM salen con la etiqueta 🤖 ManyChat.
