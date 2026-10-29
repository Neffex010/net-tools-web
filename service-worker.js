/* Service worker de Net Tools Web.
 * - Precarga (install) todas las páginas, CSS, JS, datos y plantillas.
 * - cache-first para assets estáticos (css, js, json, imágenes, fuentes, plantillas).
 * - network-first para navegaciones y el resto, con respaldo en caché sin conexión.
 */

const APP_VERSION = '1.1.1';

const CACHE_NAME = 'net-tools-web-' + APP_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/fonts.css',
  './css/reset.css',
  './css/variables.css',
  './css/themes.css',
  './css/layout.css',
  './js/main.js',
  './js/theme-boot.js',
  './js/sw-register.js',
  './js/router.js',
  './js/store.js',
  './js/utils.js',
  './js/modules/dashboard.js',
  './js/modules/ponchado.js',
  './js/modules/calculadoras.js',
  './js/modules/planos.js',
  './js/modules/inventario.js',
  './js/modules/conexiones.js',
  './js/modules/etiquetas.js',
  './js/modules/pruebas.js',
  './js/modules/estandares.js',
  './js/modules/diagnostico.js',
  './js/modules/configuracion.js',
  './js/modules/ayuda.js',
  './js/libs/qrcode.min.js',
  './pages/dashboard.html',
  './pages/ponchado.html',
  './pages/calculadoras.html',
  './pages/planos.html',
  './pages/inventario.html',
  './pages/conexiones.html',
  './pages/etiquetas.html',
  './pages/pruebas.html',
  './pages/estandares.html',
  './pages/diagnostico.html',
  './pages/configuracion.html',
  './pages/ayuda.html',
  './data/categorias-cable.json',
  './data/t568a.json',
  './data/t568b.json',
  './data/estandares.json',
  './data/glosario.json',
  './templates/etiqueta.html',
  './templates/informe-pruebas.html',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/fonts/space-grotesk-latin.woff2',
  './assets/fonts/ibm-plex-mono-400-latin.woff2',
  './assets/fonts/ibm-plex-mono-500-latin.woff2',
];

const STATIC_PATTERN = /\.(?:css|js|mjs|json|png|svg|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|map|txt|xml|webmanifest)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache
              .add(new Request(url, { cache: 'reload' }))
              .catch((error) => console.warn('[sw] No se pudo precargar', url, error))
          )
        )
      )
    // Sin skipWaiting aquí: el SW nuevo queda en espera para que la app muestre
    // el banner "Nueva versión disponible". El cambio se aplica cuando el
    // usuario pulsa el botón (mensaje SKIP_WAITING).
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

function offlineResponse() {
  return new Response(
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sin conexión</title></head><body><main style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>Sin conexión</h1><p>No hay respuesta de la red y este recurso no está en la caché.</p><p>Vuelve a conectarte y recarga la página.</p></main></body></html>',
    { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return cached || offlineResponse();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html', { ignoreSearch: true });
      if (shell) {
        return shell;
      }
    }
    return offlineResponse();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (STATIC_PATTERN.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
