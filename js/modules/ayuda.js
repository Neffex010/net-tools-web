const PAGE_SELECTOR = '[data-page="ayuda"]';
const THEME_KEY = 'nt.theme';

const ROUTES_BY_KEY = {
  d: 'dashboard',
  p: 'ponchado',
  c: 'calculadoras',
  l: 'planos',
  i: 'inventario',
  n: 'conexiones',
  e: 'etiquetas',
  r: 'pruebas',
  s: 'estandares',
  g: 'diagnostico',
  w: 'configuracion',
  h: 'ayuda',
};

function normText(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isTyping(target) {
  if (!target) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  document.documentElement.classList.toggle('dark', next === 'dark');
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (error) {
    /* almacenamiento no disponible */
  }
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(next === 'dark'));
    toggle.setAttribute('aria-label', next === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro');
  }
}

function navigateTo(route) {
  const next = `#/${route}`;
  if (window.location.hash === next) {
    return;
  }
  window.location.hash = next;
}

function handleShortcut(event) {
  if (event.repeat) {
    return;
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === 't') {
      event.preventDefault();
      toggleTheme();
      return;
    }
    if (ROUTES_BY_KEY[key]) {
      event.preventDefault();
      navigateTo(ROUTES_BY_KEY[key]);
    }
    return;
  }
  if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key === '?') {
    if (isTyping(event.target)) {
      return;
    }
    event.preventDefault();
    navigateTo('ayuda');
    window.setTimeout(() => {
      const search = document.getElementById('ayuda-search');
      if (search) {
        search.focus();
      }
    }, 60);
  }
}

if (!window.__ntwAyudaShortcuts) {
  window.__ntwAyudaShortcuts = true;
  window.addEventListener('keydown', handleShortcut);
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const search = root.querySelector('[data-ayuda-search]');
  const summary = root.querySelector('[data-ayuda-summary]');
  const empty = root.querySelector('[data-ayuda-empty]');
  const items = Array.from(root.querySelectorAll('[data-ayuda-faq]'));

  function filterFaq() {
    const term = normText(search.value.trim());
    let visible = 0;

    items.forEach((item) => {
      const matches = !term || normText(item.textContent).includes(term);
      item.hidden = !matches;
      if (matches) {
        visible += 1;
      }
    });

    summary.textContent = term ? `${visible} pregunta${visible === 1 ? '' : 's'} encontrada${visible === 1 ? '' : 's'}.` : '';
    empty.hidden = visible > 0;
    empty.textContent = visible === 0 ? 'Ninguna pregunta coincide con la búsqueda.' : '';
  }

  search.addEventListener('input', filterFaq);
}

if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'ayuda') {
    init();
  }
});
