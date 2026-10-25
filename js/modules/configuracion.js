import { get, set, keys, clear } from '../store.js';

const PAGE_SELECTOR = '[data-page="configuracion"]';
const THEME_KEY = 'nt.theme';
const THEME_VALUES = ['light', 'dark', 'system'];
const META_KEYS = ['app', 'version', 'exportedAt', 'theme'];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currentTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch (error) {
    /* almacenamiento no disponible */
  }
  return 'system';
}

function applyTheme(theme) {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? 'Activar tema claro' : 'Activar tema oscuro');
  }
}

function persistTheme(theme) {
  try {
    if (theme === 'system') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, theme);
    }
  } catch (error) {
    /* almacenamiento no disponible */
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const themeRadios = Array.from(root.querySelectorAll('[data-cfg-theme]'));
  const countEl = root.querySelector('[data-cfg-count]');
  const sizeEl = root.querySelector('[data-cfg-size]');
  const keysEl = root.querySelector('[data-cfg-keys]');
  const exportButton = root.querySelector('[data-cfg-export]');
  const importButton = root.querySelector('[data-cfg-import]');
  const fileInput = root.querySelector('[data-cfg-file]');
  const clearButton = root.querySelector('[data-cfg-clear]');
  const errorEl = root.querySelector('[data-cfg-error]');
  const messageEl = root.querySelector('[data-cfg-message]');

  let messageTimer = null;

  function showMessage(text, type) {
    if (messageTimer) {
      window.clearTimeout(messageTimer);
    }
    messageEl.textContent = text;
    messageEl.className = type ? `message is-${type}` : 'message';
    if (text) {
      messageTimer = window.setTimeout(() => {
        messageEl.textContent = '';
        messageEl.className = 'message';
      }, 4000);
    }
  }

  function showError(text) {
    if (!text) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = text;
  }

  function renderThemeSelection() {
    const theme = currentTheme();
    themeRadios.forEach((radio) => {
      radio.checked = radio.value === theme;
    });
  }

  function renderStats() {
    const names = keys();
    const total = names.reduce((acc, name) => {
      try {
        // Bytes UTF-8 reales (no longitud en caracteres).
        return acc + new Blob([JSON.stringify(get(name) ?? null)]).size;
      } catch (error) {
        return acc;
      }
    }, 0);

    countEl.textContent = String(names.length);
    sizeEl.textContent = formatBytes(total);
    keysEl.innerHTML = names
      .map((name) => `<li>${escapeHtml(name)}</li>`)
      .join('');
  }

  function exportBackup() {
    const payload = {
      app: 'net-tools-web',
      version: 1,
      exportedAt: new Date().toISOString(),
      theme: currentTheme(),
      data: {},
    };
    keys().forEach((name) => {
      payload.data[name] = get(name);
    });

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `net-tools-web-respaldo-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage('Respaldo exportado.', 'ok');
  }

  async function importBackup(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('El archivo no es un respaldo válido.');
      }

      let data = parsed.data;
      if (!data || typeof data !== 'object') {
        data = {};
        Object.keys(parsed).forEach((key) => {
          if (!META_KEYS.includes(key)) {
            data[key] = parsed[key];
          }
        });
      }

      const entries = Object.entries(data);
      if (entries.length === 0) {
        throw new Error('El respaldo no contiene datos.');
      }

      if (!window.confirm(`Se reemplazarán ${entries.length} sección(es) de datos locales. ¿Continuar?`)) {
        showMessage('Importación cancelada.', null);
        return;
      }

      entries.forEach(([name, value]) => set(name, value));

      if (THEME_VALUES.includes(parsed.theme)) {
        applyTheme(parsed.theme);
        persistTheme(parsed.theme);
      }

      renderThemeSelection();
      renderStats();
      showError('');
      showMessage(`Respaldo importado: ${entries.length} sección(es).`, 'ok');
    } catch (error) {
      console.error('[configuracion] Error al importar:', error);
      showError(error.message || 'No se pudo importar el respaldo.');
    }
  }

  function clearData() {
    if (keys().length === 0) {
      showMessage('No hay datos locales para borrar.', null);
      return;
    }
    if (!window.confirm('¿Borrar TODOS los datos locales? Esta acción no se puede deshacer.')) {
      return;
    }
    clear();
    renderStats();
    showError('');
    showMessage('Datos locales borrados.', 'ok');
  }

  themeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) {
        return;
      }
      applyTheme(radio.value);
      persistTheme(radio.value);
      showMessage('Tema actualizado.', 'ok');
    });
  });

  exportButton.addEventListener('click', exportBackup);
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      importBackup(file);
    }
    fileInput.value = '';
  });
  clearButton.addEventListener('click', clearData);

  renderThemeSelection();
  renderStats();
}

if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'configuracion') {
    init();
  }
});
