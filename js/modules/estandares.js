const PAGE_SELECTOR = '[data-page="estandares"]';
const ESTANDARES_URL = new URL('../../data/estandares.json', import.meta.url).href;
const GLOSARIO_URL = new URL('../../data/glosario.json', import.meta.url).href;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normText(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function fetchJson(url) {
  // Recurso local del propio origen (data/*.json): sin AbortController a
  // propósito; no hay latencia externa que acotar.
  return fetch(url, { cache: 'no-cache' }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} en ${url}`);
    }
    return response.json();
  });
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const resumenEl = root.querySelector('[data-est-resumen]');
  const errorEl = root.querySelector('[data-est-error]');
  const statusEl = root.querySelector('[data-est-status]');
  const normasEl = root.querySelector('[data-est-normas]');
  const categoriasEl = root.querySelector('[data-est-categorias]');
  const distanciasEl = root.querySelector('[data-est-distancias]');
  const glosarioEl = root.querySelector('[data-est-glosario]');
  const glosarioSearch = root.querySelector('[data-est-glosario-search]');
  const glosarioSummary = root.querySelector('[data-est-glosario-summary]');
  const glosarioEmpty = root.querySelector('[data-est-glosario-empty]');

  let glosario = [];
  let messageTimer = null;

  function showError(text) {
    if (!text) {
      errorEl.hidden = true;
      errorEl.textContent = '';
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = text;
  }

  function showStatus(text) {
    if (messageTimer) {
      window.clearTimeout(messageTimer);
    }
    statusEl.textContent = text;
    if (text) {
      messageTimer = window.setTimeout(() => {
        statusEl.textContent = '';
      }, 3000);
    }
  }

  function renderNormas(normas) {
    normasEl.innerHTML = normas
      .map(
        (norma) => `
          <li class="norma">
            <div class="norma__head">
              <span class="norma__code">${escapeHtml(norma.codigo)}</span>
              <span class="badge badge--vigente">${escapeHtml(norma.estado || 'Vigente')}</span>
            </div>
            <span class="norma__name">${escapeHtml(norma.nombre)}</span>
            <span class="norma__scope">${escapeHtml(norma.alcance)}</span>
          </li>`
      )
      .join('');
  }

  function renderCategorias(categorias) {
    categoriasEl.innerHTML = categorias
      .map(
        (cat) => `
          <tr>
            <td>${escapeHtml(cat.nombre)}</td>
            <td>${escapeHtml(cat.clase) || '<span class="muted">—</span>'}</td>
            <td>${escapeHtml(cat.anchoBanda)}</td>
            <td class="mono">${escapeHtml(cat.frecuencia)}</td>
            <td>${escapeHtml(cat.distancia)}</td>
            <td>${escapeHtml(cat.uso)}</td>
          </tr>`
      )
      .join('');
  }

  function renderDistancias(distancias) {
    distanciasEl.innerHTML = distancias
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.tipo)}</td>
            <td class="mono">${escapeHtml(item.maximo)}</td>
            <td>${escapeHtml(item.detalle)}</td>
          </tr>`
      )
      .join('');
  }

  function renderGlosario() {
    const term = normText(glosarioSearch.value.trim());
    const grupos = glosario
      .map((grupo) => {
        const terminos = (grupo.terminos || []).filter((item) => {
          if (!term) {
            return true;
          }
          return normText(item.termino).includes(term) || normText(item.definicion).includes(term);
        });
        return { nombre: grupo.nombre, terminos };
      })
      .filter((grupo) => grupo.terminos.length > 0);

    const total = grupos.reduce((acc, grupo) => acc + grupo.terminos.length, 0);

    glosarioEl.innerHTML = grupos
      .map(
        (grupo) => `
          <div class="glosario__grupo">
            <h3>${escapeHtml(grupo.nombre)}</h3>
            <ul class="glosario__lista">
              ${grupo.terminos
                .map(
                  (item) => `
                    <li class="glosario__item">
                      <div class="glosario__term">${escapeHtml(item.termino)}</div>
                      <p class="glosario__def">${escapeHtml(item.definicion)}</p>
                    </li>`
                )
                .join('')}
            </ul>
          </div>`
      )
      .join('');

    glosarioSummary.textContent = term ? `${total} término${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}.` : '';

    if (total === 0) {
      glosarioEmpty.hidden = false;
      glosarioEmpty.textContent = 'Ningún término coincide con la búsqueda.';
    } else {
      glosarioEmpty.hidden = true;
      glosarioEmpty.textContent = '';
    }
  }

  glosarioSearch.addEventListener('input', renderGlosario);

  Promise.all([fetchJson(ESTANDARES_URL), fetchJson(GLOSARIO_URL)])
    .then(([estandares, glos]) => {
      if (estandares.resumen) {
        resumenEl.textContent = estandares.resumen;
      }
      renderNormas(estandares.normas || []);
      renderCategorias(estandares.categorias || []);
      renderDistancias(estandares.distancias || []);
      glosario = glos.categorias || [];
      renderGlosario();
      showError('');
      showStatus('Estándares y glosario cargados.');
    })
    .catch((error) => {
      console.error('[estandares] No se pudieron cargar los datos:', error);
      showError('No se pudieron cargar los estándares. Comprueba la conexión o usa un servidor local.');
    });
}

if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'estandares') {
    init();
  }
});
