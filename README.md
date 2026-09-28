# Landing – plantilla

## Carpetas
- **Raíz** (`index.html`, `empezar.html`, `recursos.html`…): copia fiel de las referencias. No se toca.
- **`web/`**: versión de trabajo (parte de la prueba 3). Aquí van los cambios de contenido y mejoras.
  Flujo: `index.html` (landing) → `empezar.html` (formulario) → `acceso.html` (vídeo de 1 min) → `recursos.html` (biblioteca).
  En `acceso.js`: `LOOM_URL` (enlace del vídeo). El botón de la biblioteca está siempre activo.
- **`pruebas/`**: variantes de estilo/estructura para comparar.

1. **Landing** – `index.html` + `styles.css` + `script.js`.
2. **Formulario** (al pulsar "Acceder a la plataforma") – `empezar.html` + `form.css` + `form.js`.
3. **Biblioteca de recursos** (al terminar el formulario) – `recursos.html` + `recursos.css` + `recursos.js`.
Ábrela directamente en el navegador; no necesita instalación.

## Qué hay que sustituir por contenido propio
- **Logo**: el SVG dentro de `.logo` en `index.html`.
- **Nombre**: `<title>` en `index.html`.
- **Cifras del arco**: el array `items` al principio de `script.js`.
- **Textos**: título, pasos del roadmap y cifras de "Deja de improvisar" en `index.html`.
- **Avatares**: clases `.a1`–`.a4` en `styles.css` (poner `background-image: url(...)`).
- **Preguntas del formulario**: el array `STEPS` al principio de `form.js`.
- **Envío de respuestas**: función `finish()` en `form.js` (ahora solo las muestra en la consola).
- **Logo y nombre del formulario**: cabecera y pie de `empezar.html`.
- **Recursos (web/)**: `FASES` y `RECURSOS` al principio de `web/recursos.js`. Tipos: `video` (enlace de YouTube o Loom en `video`), `enlace` (Drive/Notion/Docs en `url`) y `herramientas` (lista de IAs). Cada recurso lleva `desc` con lo que se aprende.
- **Botones "Quiero escalar mi negocio" y "Agendar llamada gratuita"**: `href="#"` en `recursos.html`.
