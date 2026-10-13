/**
 * Router hash-based de la SPA.
 * Carga el HTML de pages/<vista>.html y lo inyecta en #app.
 */

export const ROUTES = {
  dashboard: { title: 'Dashboard', file: 'dashboard.html' },
  ponchado: { title: 'Ponchado', file: 'ponchado.html' },
  calculadoras: { title: 'Calculadoras', file: 'calculadoras.html' },
  planos: { title: 'Planos', file: 'planos.html' },
  inventario: { title: 'Inventario', file: 'inventario.html' },
  conexiones: { title: 'Conexiones', file: 'conexiones.html' },
  etiquetas: { title: 'Etiquetas', file: 'etiquetas.html' },
  pruebas: { title: 'Pruebas', file: 'pruebas.html' },
  estandares: { title: 'Estándares', file: 'estandares.html' },
  diagnostico: { title: 'Diagnóstico', file: 'diagnostico.html' },
  configuracion: { title: 'Configuración', file: 'configuracion.html' },
  ayuda: { title: 'Ayuda', file: 'ayuda.html' },
};

export const DEFAULT_ROUTE = 'dashboard';

const PAGES_DIR = 'pages/';
const APP_SELECTOR = '#app';

let appEl = null;

function getRouteFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return raw.split('?')[0].split('/')[0].trim().toLowerCase();
}

function resolveRoute(route) {
  return Object.prototype.hasOwnProperty.call(ROUTES, route) ? route : null;
}

function updateActiveLinks(route) {
  document.querySelectorAll('[data-route]').forEach((link) => {
    const isActive = link.dataset.route === route;
    link.classList.toggle('is-active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function renderError(route, error) {
  console.error(`[router] No se pudo cargar la vista "${route}":`, error);
  appEl.innerHTML = `
    <section class="route-error" role="alert">
      <h2>No se pudo cargar la vista</h2>
      <p>La vista <strong>${route}</strong> no está disponible.</p>
      <p>Si abriste la app con <code>file://</code>, usa un servidor local
      (por ejemplo, <code>python -m http.server</code>).</p>
    </section>
  `;
}

async function loadView(route) {
  // Recurso local del propio origen (pages/*.html): sin AbortController a
  // propósito; no hay latencia externa que acotar.
  const response = await fetch(`${PAGES_DIR}${ROUTES[route].file}`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

async function importRouteModule(route) {
  try {
    const module = await import(`./modules/${route}.js`);
    if (module && typeof module.init === 'function') {
      module.init();
    }
  } catch (error) {
    console.error(`[router] No se pudo cargar el módulo de "${route}":`, error);
  }
}

export async function navigate(route) {
  if (!appEl) {
    appEl = document.querySelector(APP_SELECTOR);
  }
  if (!appEl) {
    return;
  }

  const resolved = resolveRoute(route) || DEFAULT_ROUTE;
  const meta = ROUTES[resolved];

  appEl.setAttribute('aria-busy', 'true');

  try {
    const html = await loadView(resolved);
    appEl.innerHTML = html;
    appEl.setAttribute('aria-busy', 'false');
    document.title = `${meta.title} · Net Tools Web`;
    updateActiveLinks(resolved);
    appEl.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.dispatchEvent(
      new CustomEvent('app:route-changed', { detail: { route: resolved } })
    );
    importRouteModule(resolved);
  } catch (error) {
    appEl.setAttribute('aria-busy', 'false');
    renderError(resolved, error);
  }
}

function onHashChange() {
  navigate(getRouteFromHash());
}

export function initRouter() {
  appEl = document.querySelector(APP_SELECTOR);
  if (!appEl) {
    console.error('[router] No se encontró el contenedor #app.');
    return;
  }

  if (!window.location.hash || !resolveRoute(getRouteFromHash())) {
    window.location.replace(
      `${window.location.pathname}${window.location.search}#/${DEFAULT_ROUTE}`
    );
  }

  window.addEventListener('hashchange', onHashChange);
  navigate(getRouteFromHash());
}
