/**
 * Módulo de Inventario.
 * CRUD de puntos de red con persistencia en localStorage (store.js),
 * filtros por estado, búsqueda y exportación/importación de JSON.
 */

import { get, set } from '../store.js';
import { buildCsv, downloadText, escapeHtml, loadConexiones, makeMessage, pluralize, todayStamp, uid } from '../utils.js';

const PAGE_SELECTOR = '[data-page="inventario"]';
const STORAGE_KEY = 'inventario';

const ESTADOS = {
  pendiente: { label: 'Pendiente' },
  tendido: { label: 'Tendido' },
  ponchado: { label: 'Ponchado' },
  probado: { label: 'Probado' },
};

function normalize(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof item.id === 'string' && item.id ? item.id : uid(),
    nombre: String(item.nombre ?? '').trim(),
    ubicacion: String(item.ubicacion ?? '').trim(),
    estado: ESTADOS[item.estado] ? item.estado : 'pendiente',
    notas: String(item.notas ?? '').trim(),
    creado: typeof item.creado === 'string' && item.creado ? item.creado : new Date().toISOString(),
  };
}

function loadList() {
  const stored = get(STORAGE_KEY, []);
  return Array.isArray(stored) ? stored.map(normalize) : [];
}

function saveList(list) {
  return set(STORAGE_KEY, list);
}

/* ---------- Arranque ---------- */
export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const form = root.querySelector('[data-inv-form]');
  const nombreInput = root.querySelector('[data-inv-nombre]');
  const ubicacionInput = root.querySelector('[data-inv-ubicacion]');
  const estadoSelect = root.querySelector('[data-inv-estado]');
  const notasInput = root.querySelector('[data-inv-notas]');
  const submitButton = root.querySelector('[data-inv-submit]');
  const cancelButton = root.querySelector('[data-inv-cancel]');
  const formError = root.querySelector('[data-inv-form-error]');
  const searchInput = root.querySelector('[data-inv-search]');
  const filterSelect = root.querySelector('[data-inv-filter]');
  const body = root.querySelector('[data-inv-body]');
  const summary = root.querySelector('[data-inv-summary]');
  const empty = root.querySelector('[data-inv-empty]');
  const message = root.querySelector('[data-inv-message]');
  const fileInput = root.querySelector('[data-inv-file]');

  let editingId = null;

  const showMessage = makeMessage(message);

  function showFormError(text) {
    if (!text) {
      formError.hidden = true;
      formError.textContent = '';
      return;
    }
    formError.hidden = false;
    formError.textContent = text;
  }

  function getVisible(list) {
    const term = searchInput.value.trim().toLowerCase();
    const estado = filterSelect.value;
    return list.filter((item) => {
      if (estado && item.estado !== estado) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        item.nombre.toLowerCase().includes(term) ||
        item.ubicacion.toLowerCase().includes(term)
      );
    });
  }

  function render() {
    const list = loadList();
    const visible = getVisible(list);

    body.innerHTML = visible
      .map((item) => {
        const notas = item.notas
          ? escapeHtml(item.notas)
          : '<span class="muted">—</span>';
        return `
          <tr>
            <td>${escapeHtml(item.nombre)}</td>
            <td>${escapeHtml(item.ubicacion) || '<span class="muted">—</span>'}</td>
            <td><span class="badge badge--${item.estado}">${escapeHtml(ESTADOS[item.estado].label)}</span></td>
            <td class="notes">${notas}</td>
            <td class="row-actions">
              <button type="button" class="btn btn--sm" data-edit="${escapeHtml(item.id)}">Editar</button>
              <button type="button" class="btn btn--sm btn--danger" data-delete="${escapeHtml(item.id)}">Eliminar</button>
            </td>
          </tr>`;
      })
      .join('');

    const counts = Object.keys(ESTADOS)
      .map((estado) => `${ESTADOS[estado].label}: ${list.filter((item) => item.estado === estado).length}`)
      .join(' · ');

    summary.textContent =
      list.length === 0
        ? ''
        : `Mostrando ${visible.length} de ${list.length} · ${counts}`;

    if (visible.length === 0) {
      empty.hidden = false;
      empty.textContent =
        list.length === 0
          ? 'No hay puntos registrados. Agrega el primero con el formulario.'
          : 'Ningún punto coincide con la búsqueda o el filtro.';
    } else {
      empty.hidden = true;
      empty.textContent = '';
    }
  }

  function resetForm() {
    editingId = null;
    form.reset();
    estadoSelect.value = 'pendiente';
    submitButton.textContent = 'Agregar punto';
    cancelButton.hidden = true;
    showFormError('');
  }

  function startEdit(id) {
    const item = loadList().find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    editingId = id;
    nombreInput.value = item.nombre;
    ubicacionInput.value = item.ubicacion;
    estadoSelect.value = item.estado;
    notasInput.value = item.notas;
    submitButton.textContent = 'Guardar cambios';
    cancelButton.hidden = false;
    showFormError('');
    nombreInput.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nombre = nombreInput.value.trim();

    if (!nombre) {
      showFormError('El nombre del punto es obligatorio.');
      nombreInput.focus();
      return;
    }
    showFormError('');

    const data = {
      nombre,
      ubicacion: ubicacionInput.value.trim(),
      estado: estadoSelect.value,
      notas: notasInput.value.trim(),
    };

    const list = loadList();

    if (editingId) {
      const index = list.findIndex((item) => item.id === editingId);
      if (index >= 0) {
        list[index] = { ...list[index], ...data };
      }
      saveList(list);
      showMessage(`Punto "${nombre}" actualizado.`, 'ok');
      resetForm();
    } else {
      list.unshift(normalize({ ...data, id: uid() }));
      saveList(list);
      showMessage(`Punto "${nombre}" agregado.`, 'ok');
      resetForm();
    }

    render();
  }

  function handleDelete(id) {
    const list = loadList();
    const item = list.find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    // Un punto puede estar referenciado por conexiones: se avisa y se eliminan
    // juntas para no dejar enlaces huérfanos apuntando a un punto inexistente.
    const conexiones = loadConexiones().filter((cxn) => String(cxn.punto ?? '') === id);
    const aviso = conexiones.length
      ? `\nTambién se eliminarán ${conexiones.length} ${pluralize(conexiones.length, 'conexión', 'conexiones')} que apuntan a este punto.`
      : '';
    if (!window.confirm(`¿Eliminar el punto "${item.nombre}"?${aviso}`)) {
      return;
    }

    if (conexiones.length) {
      set('conexiones', loadConexiones().filter((cxn) => String(cxn.punto ?? '') !== id));
    }
    saveList(list.filter((entry) => entry.id !== id));
    if (editingId === id) {
      resetForm();
    }
    render();
    showMessage(
      conexiones.length
        ? `Punto "${item.nombre}" y ${conexiones.length} ${pluralize(conexiones.length, 'conexión', 'conexiones')} eliminados.`
        : `Punto "${item.nombre}" eliminado.`,
      'ok'
    );
  }

  function exportJson() {
    const list = loadList();
    downloadText(`inventario-ntw-${todayStamp()}.json`, JSON.stringify(list, null, 2), 'application/json');
    showMessage(`${pluralize(list.length, 'Exportado', 'Exportados')} ${list.length} ${pluralize(list.length, 'punto')}.`, 'ok');
  }

  function exportCsv() {
    const list = loadList();
    if (list.length === 0) {
      showMessage('No hay puntos para exportar.', 'bad');
      return;
    }
    const header = ['Nombre', 'Ubicacion', 'Estado', 'Notas', 'Creado'];
    const dataRows = list.map((item) => [
      item.nombre,
      item.ubicacion,
      ESTADOS[item.estado].label,
      item.notas,
      item.creado.slice(0, 10),
    ]);
    downloadText(`inventario-ntw-${todayStamp()}.csv`, buildCsv(header, dataRows), 'text/csv;charset=utf-8');
    showMessage(`Exportados ${list.length} puntos a CSV.`, 'ok');
  }

  async function importJson(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error('El archivo no contiene una lista JSON.');
      }

      const list = loadList();
      const indexById = new Map(list.map((item, idx) => [item.id, idx]));
      let added = 0;
      let updated = 0;

      parsed.forEach((raw) => {
        const item = normalize(raw);
        if (indexById.has(item.id)) {
          list[indexById.get(item.id)] = item;
          updated += 1;
        } else {
          indexById.set(item.id, list.length);
          list.push(item);
          added += 1;
        }
      });

      saveList(list);
      render();
      showMessage(`Importación completa: ${added} ${pluralize(added, 'nuevo')}, ${updated} ${pluralize(updated, 'actualizado')}.`, 'ok');
    } catch (error) {
      console.error('[inventario] Error al importar:', error);
      showMessage('No se pudo importar el archivo JSON.', 'bad');
    }
  }

  /* ---------- Eventos ---------- */
  form.addEventListener('submit', handleSubmit);
  cancelButton.addEventListener('click', () => {
    resetForm();
    showMessage('Edición cancelada.', null);
  });

  body.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      startEdit(editButton.dataset.edit);
      return;
    }
    const deleteButton = event.target.closest('[data-delete]');
    if (deleteButton) {
      handleDelete(deleteButton.dataset.delete);
    }
  });

  searchInput.addEventListener('input', render);
  filterSelect.addEventListener('change', render);

  root.querySelector('[data-inv-export]').addEventListener('click', exportJson);
  root.querySelector('[data-inv-csv]').addEventListener('click', exportCsv);
  root.querySelector('[data-inv-import]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) {
      importJson(file);
    }
    fileInput.value = '';
  });

  render();
}

// Autoarranque si la vista ya está en el DOM y re-arranque en navegación SPA.
if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'inventario') {
    init();
  }
});
