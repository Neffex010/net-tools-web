import { initRouter } from './router.js';

const THEME_KEY = 'nt.theme';

/* ---------- Tema ---------- */
function hasStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'dark' || stored === 'light';
  } catch (error) {
    return false;
  }
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch (error) {
    /* almacenamiento no disponible */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Activar tema claro' : 'Activar tema oscuro');
  }
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    /* almacenamiento no disponible */
  }
}

function initTheme() {
  applyTheme(getInitialTheme());

  // Sin preferencia guardada, el tema sigue al sistema en vivo.
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', (event) => {
    if (!hasStoredTheme()) {
      applyTheme(event.matches ? 'dark' : 'light');
    }
  });

  const toggle = document.getElementById('theme-toggle');
  if (!toggle) {
    return;
  }

  toggle.addEventListener('click', () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    persistTheme(next);
  });
}

/* ---------- Menú lateral ---------- */
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('menu-toggle');
  const backdrop = document.getElementById('backdrop');

  if (!sidebar || !toggle || !backdrop) {
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 1023px)');
  const isMobile = () => mobileQuery.matches;

  /* En móvil, el menú cerrado queda fuera de pantalla: se marca `inert` para
   * que el teclado y los lectores de pantalla no entren en enlaces invisibles. */
  function syncSidebarState() {
    const hidden = isMobile() && !sidebar.classList.contains('is-open');
    sidebar.toggleAttribute('inert', hidden);
    if (hidden) {
      sidebar.setAttribute('aria-hidden', 'true');
    } else {
      sidebar.removeAttribute('aria-hidden');
    }
  }

  function openSidebar() {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-visible');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Cerrar menú');
    syncSidebarState();
    const firstLink = sidebar.querySelector('a[href], button:not([disabled])');
    if (firstLink) {
      firstLink.focus();
    }
  }

  function closeSidebar() {
    if (!sidebar.classList.contains('is-open')) {
      return;
    }
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-visible');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
    syncSidebarState();
    if (isMobile()) {
      toggle.focus();
    }
  }

  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('is-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  backdrop.addEventListener('click', closeSidebar);

  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      closeSidebar();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSidebar();
    }
  });

  document.addEventListener('app:route-changed', closeSidebar);

  mobileQuery.addEventListener('change', () => {
    closeSidebar();
    syncSidebarState();
  });

  syncSidebarState();
}

/* ---------- Arranque ---------- */
function start() {
  initTheme();
  initSidebar();
  initRouter();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
