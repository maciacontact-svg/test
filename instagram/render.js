/* Exporta todas las piezas de index.html a PNG en instagram/png/.
   Uso: node instagram/render.js  (necesita Playwright y conexión para Poppins) */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  // Sin escala: cada lienzo a su tamaño real
  await page.addStyleTag({ content: '.marco{width:auto!important;height:auto!important;overflow:visible!important;border-radius:0!important;box-shadow:none!important}.marco>.lienzo{transform:none!important}' });
  const ids = await page.$$eval('.lienzo', ns => ns.map(n => n.dataset.id));
  for (const id of ids) {
    const dir = id.startsWith('perfil') || id.startsWith('whatsapp') ? 'logos' : id.startsWith('destacado') ? 'destacados' : 'plantillas';
    fs.mkdirSync(path.join(__dirname, 'png', dir), { recursive: true });
    await page.locator(`.lienzo[data-id="${id}"]`).screenshot({ path: path.join(__dirname, 'png', dir, `${id}.png`) });
    console.log(dir + '/' + id);
  }
  await browser.close();
})();
