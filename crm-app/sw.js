// System Academy · CRM — service worker de la app instalada.
// Solo guarda la «carcasa» (HTML, CSS, JS, iconos) para que abra al instante y sin conexión.
// Los leads NUNCA se guardan aquí: siempre se piden en directo a Apps Script.
const CACHE = 'sa-crm-v1';
const CARCASA = ['/', '/crm.css', '/crm.js', '/config.js', '/manifest.webmanifest', '/img/logo/favicon.svg', '/img/app/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CARCASA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (así cada push a Vercel llega al momento); si no hay conexión, la copia guardada.
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // Apps Script, fuentes… directo
  e.respondWith(
    fetch(req)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
        return r;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('/')))
  );
});
