import { get } from '../store.js';

const PAGE_SELECTOR = '[data-page="dashboard"]';

function countItems(name) {
  const data = get(name, []);
  if (Array.isArray(data)) {
    return data.length;
  }
  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    return data.items.length;
  }
  return 0;
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const inventarioEl = root.querySelector('[data-dash-inventario]');
  const pruebasEl = root.querySelector('[data-dash-pruebas]');
  const conexionesEl = root.querySelector('[data-dash-conexiones]');
  const etiquetasEl = root.querySelector('[data-dash-etiquetas]');

  if (inventarioEl) {
    inventarioEl.textContent = String(countItems('inventario'));
  }
  if (pruebasEl) {
    pruebasEl.textContent = String(countItems('pruebas'));
  }
  if (conexionesEl) {
    conexionesEl.textContent = String(countItems('conexiones'));
  }
  if (etiquetasEl) {
    etiquetasEl.textContent = String(countItems('etiquetas'));
  }
}

if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'dashboard') {
    init();
  }
});
