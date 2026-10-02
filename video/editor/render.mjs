#!/usr/bin/env node
// Renderiza el timeline de gráficos (overlay.html) a una secuencia PNG con alfa
// y la empaqueta en un .mov (PNG codec, alfa) listo para superponer con ffmpeg.
//
// Uso: node render.mjs timeline.json salida.mov [--fps 30] [--from 0] [--to 60]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.PLAYWRIGHT_DIR || '/opt/node-tools/node_modules/playwright')); }
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [timelinePath, outPath] = positional;
if (!timelinePath || !outPath) { console.error('uso: node render.mjs timeline.json salida.mov [--fps 30] [--from s] [--to s]'); process.exit(1); }

const fps = Number(opt('fps', 30));
const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
// rutas de imágenes relativas al timeline.json → file:// absolutas
const tlDir = path.dirname(path.resolve(timelinePath));
for (const ev of timeline.events || []) {
  if (ev.src && !/^(https?|file|data):/.test(ev.src)) ev.src = 'file://' + path.resolve(tlDir, ev.src);
}
const from = Number(opt('from', 0));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'overlay.html'));
await page.evaluate(tl => window.load(tl), timeline);
const dur = Number(opt('to', await page.evaluate(() => window.duration()))) ;
const total = Math.ceil((dur - from) * fps);
console.error(`render: ${total} frames @${fps}fps (${from}s → ${dur}s)`);

// ffmpeg lee PNGs por stdin (image2pipe) → .mov con alfa
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'png', '-pix_fmt', 'rgba', outPath], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = buf => new Promise(r => ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r));

let blank = null;
let t0 = Date.now();
for (let i = 0; i < total; i++) {
  const t = from + i / fps;
  const active = await page.evaluate(([a, b]) => window.activeIn(a, b), [t - 0.5, t + 0.5]);
  let buf;
  if (!active) {
    if (!blank) { await page.evaluate(() => window.seek(-1)); blank = await page.screenshot({ omitBackground: true, type: 'png' }); }
    buf = blank;
  } else {
    await page.evaluate(tt => window.seek(tt), t);
    buf = await page.screenshot({ omitBackground: true, type: 'png' });
  }
  await write(buf);
  if (i % (fps * 5) === 0) console.error(`  ${t.toFixed(1)}s / ${dur.toFixed(1)}s  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.error('ok →', outPath);
