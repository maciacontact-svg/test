# Editor de vídeo (motion graphics + montaje) · System Academy

Motor para editar vídeos educativos al estilo de las referencias (texto cinético, listas de pasos,
datos grandes, capturas con recuadro/flecha, tarjetas de sección, punch-ins y subtítulos karaoke),
con el branding de la academia (gris #f3f3f3, negro #111, Poppins con cursiva como énfasis).

## Piezas
- `overlay.html` – motor de gráficos. Dibuja el estado exacto en un instante `t` (determinista).
- `render.mjs` – renderiza un `timeline.json` a `overlay.mov` (PNG con alfa) con Playwright.
- `compose.py` – montaje ffmpeg: cortes del bruto, punch-ins, superposición de gráficos,
  SFX sintetizados (pop/whoosh), música opcional, compresor + loudness para YouTube.
- `demo/` – ejemplo completo (`timeline.json`, `edit.json`) y vista previa.

## Flujo
```bash
cd video/editor/demo
export CHROMIUM_PATH=/opt/pw-browsers/chromium   # si Playwright no encuentra Chromium
node ../render.mjs timeline.json overlay.mov --fps 30
python3 ../compose.py edit.json              # genera edit.output
python3 ../compose.py edit.json --map 83.2   # bruto → tiempo de montaje
```

## Tipos de evento (timeline.json)
`*texto*` pone cursiva (énfasis). Todos llevan `start`/`end` en segundos del montaje.

| type | campos | uso |
|---|---|---|
| `title` | `text`, `perWord`, `size:"small"`, `pos:"center"/"bottom"` | frase clave palabra a palabra |
| `keyword` | `text`, `pos:"top"` | píldora con la palabra que se está diciendo |
| `list` | `heading`, `items[]`, `step` o `at[]`, `dim:false` | pasos/filtros que aparecen uno a uno |
| `stat` | `to`, `from`, `prefix`, `suffix`, `label`, `dur`, `decimals`, `pos:"center"` | número grande con contador |
| `card` | `kicker`, `text` | tarjeta de sección a pantalla completa |
| `image` | `src`, `w`, `h`, `caption`, `zoom`, `origin` | captura/pantalla con marco |
| `box` | `x`,`y`,`w`,`h` | recuadro resaltado sobre la captura |
| `arrow` | `x1`,`y1`,`x2`,`y2`,`id` | flecha que se dibuja |
| `caption` | `words[{text,start,end}]` | subtítulo karaoke |
| `lower` | `text`, `sub` | rótulo inferior |

## Reglas de edición (de las referencias)
- Un cambio visual cada 2–4 s: gráfico, punch-in (1.15–1.25×) o corte.
- El gráfico aparece **en el instante exacto** en que se dice la palabra; no antes.
- Un solo elemento protagonista por momento (título O lista O dato), subtítulo aparte.
- Tarjeta de sección en cada cambio de bloque; recuadro + flecha en toda captura.
- Sin inventar cifras ni testimonios: solo lo que dice el presentador.
