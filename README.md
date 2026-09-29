# System Academy · Landing + formulario + biblioteca

Web estática (HTML, CSS y JS sin dependencias). Lista para publicar en **Vercel**:
importa el repositorio, sin comando de build y con la raíz como directorio de salida.

## Flujo
1. **Landing** – `index.html` + `styles.css` + `script.js`
2. **Formulario** – `empezar.html` + `form.css` + `form.js`
3. **Acceso** (vídeo de menos de 1 min) – `acceso.html` + `acceso.css` + `acceso.js`
4. **Biblioteca de recursos** – `recursos.html` + `recursos.css` + `recursos.js`

## Dónde se edita cada cosa
- **Cinta de palabras de la landing**: array `items` en `script.js`.
- **Preguntas del formulario**: array `STEPS` en `form.js`. Validación de nombre, email, WhatsApp e Instagram en el mismo archivo (`validateName`, `validateEmail`, `validatePhone`…).
- **Envío de respuestas**: función `finish()` en `form.js` (ahora solo las muestra en la consola; hay que conectarlo a un CRM, Sheets o email).
- **Vídeo de la página de acceso**: `LOOM_URL` en `acceso.js`.
- **Biblioteca**: `FASES` y `RECURSOS` en `recursos.js`. Tipos: `video` (YouTube o Loom en `video`), `enlace` (Drive/Notion/Docs en `url`) y `herramientas` (lista de IAs). Cada recurso lleva `desc`.
- **Botones de Calendly**: en `recursos.html`.
- **Logo**: `img/logo/` (SVG en negro y blanco). **Fotos de casos**: `img/casos/`.

## Otras carpetas
- `original/`: copia fiel de las referencias (copia de seguridad, no se publica enlazada).
- `pruebas/`: variantes de diseño que se probaron.

## Miniaturas del carrusel (landing)
- Las tarjetas de *Formación* y *Recursos* usan capturas en `img/formacion/` y `img/capturas/`, en blanco y negro por CSS.
- Para cambiar una, sustituye el archivo con el mismo nombre (o cambia el `src` en `index.html`).
