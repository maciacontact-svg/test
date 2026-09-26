# Landing – plantilla

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
- **Recursos**: el array `RECURSOS` al principio de `recursos.js`. Cada uno es `tipo: 'video'` (pegar el enlace de Loom en `loom`) o `tipo: 'enlace'` (pegar el enlace de Drive en `url`).
- **Botones "Quiero escalar mi negocio" y "Agendar llamada gratuita"**: `href="#"` en `recursos.html`.
