# Pruebas de estilo

La versión original (copia fiel de las referencias) está siempre en la raíz del repositorio y no se toca.
Cada carpeta de aquí es una copia completa de las 3 páginas con cambios aplicados.
Abre `index.html` de cada carpeta para recorrer el flujo completo.

## Prueba 2 (`prueba-2/`)
Cambios solo en la landing (`index.html`, `styles.css` → bloque "PRUEBA 2", `script.js`):
1. **Cinta de palabras en movimiento**: sustituye a las cifras en arco. Fila recta que se desplaza
   sola, con puntos separadores y algunas palabras con número destacado. Se pausa al pasar el ratón.
   Textos editables en el array `items` de `script.js`.
2. **Fase 2 (roadmap de 4 pasos) reestructurada**: en lugar de la línea curva con tarjetas en zigzag,
   ahora hay un índice fijo a la izquierda (01-04, con barra de progreso) y tarjetas grandes que se
   apilan unas sobre otras al hacer scroll, cada una con su icono. Mismo contenido.
Formulario y biblioteca: sin cambios respecto al original.

## Prueba 3 (`prueba-3/`)
Parte de la prueba 2 (mantiene la cinta de palabras) y cambia:
1. **Fase 2 sin bloquear el scroll**: pestañas a la izquierda (01-04) y un panel grande a la derecha.
   Cambian solas cada 6 s con una barra de progreso en la pestaña activa; se pausan con el ratón
   encima o cuando la sección no está en pantalla, y se pueden pulsar. Duración: `DURATION` en `script.js`.
2. **Biblioteca (página 3) en formato "plataforma"**, con el estilo de la landing, mismo contenido:
   - Pantalla completa en dos columnas: índice siempre visible a la izquierda (con su propio scroll)
     y el recurso abierto a la derecha. En móvil: recurso arriba y el índice justo debajo.
   - Recursos agrupados por las 4 fases del roadmap (plegables, con "vistos/total" por fase).
   - Buscador y filtros (Todos / Vídeos / Plantillas / Sin ver) siempre a mano.
   - Progreso "X de 23 vistos" arriba; cada recurso abierto se marca como visto (se guarda en el navegador).
   - Bajo el recurso: "Marcar como visto", "← Anterior" y "Siguiente: <título> →". Flechas del teclado también.
   - En `recursos.js`: `FASES` (nombres de los grupos) y `RECURSOS` (cada uno con `fase`, `titulo`, `tipo`, `loom`/`url`).
