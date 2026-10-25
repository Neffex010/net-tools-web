import { get, set } from '../store.js';
import { buildCsv, downloadText, escapeHtml, fillSelect, loadPuntos, makeMessage, pluralize, todayStamp, uid } from '../utils.js';

const PAGE_SELECTOR = '[data-page="conexiones"]';
const STORAGE_KEY = 'conexiones';

function normalize(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof item.id === 'string' && item.id ? item.id : uid(),
    punto: String(item.punto ?? ''),
    puntoNombre: String(item.puntoNombre ?? '').trim(),
    switchId: String(item.switchId ?? '').trim(),
    puertoSwitch: String(item.puertoSwitch ?? '').trim(),
    panel: String(item.panel ?? '').trim(),
    puertoPanel: String(item.puertoPanel ?? '').trim(),
    cable: String(item.cable ?? '').trim(),
    notas: String(item.notas ?? '').trim(),
    creado: typeof item.creado === 'string' && item.creado ? item.creado : new Date().toISOString(),
  };
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const form = root.querySelector('[data-cxn-form]');
  const puntoSelect = root.querySelector('[data-cxn-punto]');
  const switchInput = root.querySelector('[data-cxn-switch]');
  const puertoSwitchInput = root.querySelector('[data-cxn-puerto-switch]');
  const panelInput = root.querySelector('[data-cxn-panel]');
  const puertoPanelInput = root.querySelector('[data-cxn-puerto-panel]');
  const cableInput = root.querySelector('[data-cxn-cable]');
  const notasInput = root.querySelector('[data-cxn-notas]');
  const submitButton = root.querySelector('[data-cxn-submit]');
  const cancelButton = root.querySelector('[data-cxn-cancel]');
  const formError = root.querySelector('[data-cxn-form-error]');
  const body = root.querySelector('[data-cxn-body]');
  const summary = root.querySelector('[data-cxn-summary]');
  const empty = root.querySelector('[data-cxn-empty]');
  const message = root.querySelector('[data-cxn-message]');
  const searchInput = root.querySelector('[data-cxn-search]');

  let list = get(STORAGE_KEY, []);
  if (!Array.isArray(list)) {
    list = [];
  }
  list = list.map(normalize);

  let editingId = null;
  let query = '';

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

  function save() {
    return set(STORAGE_KEY, list);
  }

  function fillPuntoOptions() {
    fillSelect(puntoSelect, loadPuntos(), {
      placeholder: '— Seleccionar punto de red —',
      valueOf: (punto) => punto.id,
      labelOf: (punto) => {
        const nombre = String(punto.nombre ?? '(sin nombre)').trim();
        const ubicacion = String(punto.ubicacion ?? '').trim();
        return ubicacion ? `${nombre} — ${ubicacion}` : nombre;
      },
      onOption: (option, punto) => {
        option.dataset.nombre = String(punto.nombre ?? '').trim();
      },
    });
  }

  function selectedPunto() {
    const id = puntoSelect.value;
    if (!id) {
      return null;
    }
    const punto = loadPuntos().find((item) => String(item.id ?? '') === id);
    if (punto) {
      return { id: String(punto.id), nombre: String(punto.nombre ?? '').trim() };
    }
    const option = puntoSelect.selectedOptions && puntoSelect.selectedOptions[0];
    return option && option.value
      ? { id, nombre: (option.dataset.nombre || option.textContent).trim() }
      : null;
  }

  function normalizeText(value) {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function matchesQuery(entry) {
    if (!query) {
      return true;
    }
    const haystack = normalizeText(
      [
        entry.puntoNombre,
        entry.switchId,
        entry.puertoSwitch,
        entry.panel,
        entry.puertoPanel,
        entry.cable,
        entry.notas,
      ].join(' ')
    );
    return haystack.includes(query);
  }

  function render() {
    const filtered = list.filter(matchesQuery);

    body.innerHTML = filtered
      .map((entry) => {
        const punto = entry.puntoNombre
          ? escapeHtml(entry.puntoNombre)
          : '<span class="muted">—</span>';
        const switchSrc = entry.switchId
          ? `${escapeHtml(entry.switchId)}${entry.puertoSwitch ? `/${escapeHtml(entry.puertoSwitch)}` : ''}`
          : '<span class="muted">—</span>';
        const panelSrc = entry.panel
          ? `${escapeHtml(entry.panel)}${entry.puertoPanel ? `/${escapeHtml(entry.puertoPanel)}` : ''}`
          : '<span class="muted">—</span>';
        const cable = entry.cable ? escapeHtml(entry.cable) : '<span class="muted">—</span>';
        const notas = entry.notas ? escapeHtml(entry.notas) : '<span class="muted">—</span>';
        return `<tr>
          <td>${punto}</td>
          <td>${switchSrc}</td>
          <td>${panelSrc}</td>
          <td>${cable}</td>
          <td class="notes">${notas}</td>
          <td class="row-actions">
            <button type="button" class="btn btn--sm" data-edit="${escapeHtml(entry.id)}">Editar</button>
            <button type="button" class="btn btn--sm btn--danger" data-delete="${escapeHtml(entry.id)}">Eliminar</button>
          </td>
        </tr>`;
      })
      .join('');

    if (list.length === 0) {
      empty.hidden = false;
      empty.textContent = 'No hay conexiones registradas. Agrega la primera con el formulario.';
      summary.textContent = '';
      return;
    }
    if (filtered.length === 0) {
      empty.hidden = false;
      empty.textContent = 'No hay conexiones que coincidan con la búsqueda.';
      summary.textContent = `0 de ${list.length}`;
      return;
    }
    empty.hidden = true;
    const uniquePuntos = new Set(filtered.map((entry) => entry.punto).filter(Boolean)).size;
    summary.textContent = query
      ? `Mostrando ${filtered.length} de ${list.length} ${pluralize(list.length, 'conexión', 'conexiones')} · Puntos enlazados: ${uniquePuntos}`
      : `Total: ${list.length} ${pluralize(list.length, 'conexión', 'conexiones')} · Puntos enlazados: ${uniquePuntos}`;
  }

  function resetForm() {
    editingId = null;
    form.reset();
    fillPuntoOptions();
    submitButton.textContent = 'Agregar conexión';
    cancelButton.hidden = true;
    showFormError('');
  }

  function startEdit(id) {
    const entry = list.find((item) => item.id === id);
    if (!entry) {
      return;
    }
    editingId = id;
    form.reset();
    fillPuntoOptions();
    puntoSelect.value = entry.punto;
    if (!puntoSelect.value) {
      const option = document.createElement('option');
      option.value = entry.punto;
      option.textContent = entry.puntoNombre || '(punto eliminado del inventario)';
      option.dataset.nombre = entry.puntoNombre;
      puntoSelect.appendChild(option);
      puntoSelect.value = entry.punto;
    }
    switchInput.value = entry.switchId;
    puertoSwitchInput.value = entry.puertoSwitch;
    panelInput.value = entry.panel;
    puertoPanelInput.value = entry.puertoPanel;
    cableInput.value = entry.cable;
    notasInput.value = entry.notas;
    submitButton.textContent = 'Guardar cambios';
    cancelButton.hidden = false;
    showFormError('');
    puntoSelect.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const punto = selectedPunto();
    if (!punto) {
      showFormError('Selecciona un punto de red del Inventario.');
      puntoSelect.focus();
      return;
    }
    showFormError('');

    const data = {
      punto: punto.id,
      puntoNombre: punto.nombre,
      switchId: switchInput.value.trim(),
      puertoSwitch: puertoSwitchInput.value.trim(),
      panel: panelInput.value.trim(),
      puertoPanel: puertoPanelInput.value.trim(),
      cable: cableInput.value.trim(),
      notas: notasInput.value.trim(),
    };

    if (editingId) {
      const index = list.findIndex((entry) => entry.id === editingId);
      if (index >= 0) {
        list[index] = { ...list[index], ...data };
      }
      save();
      resetForm();
      render();
      showMessage('Conexión actualizada.', 'ok');
    } else {
      list.unshift(normalize({ ...data, id: uid() }));
      save();
      resetForm();
      render();
      showMessage('Conexión agregada.', 'ok');
    }
  }

  function handleDelete(id) {
    const entry = list.find((item) => item.id === id);
    if (!entry) {
      return;
    }
    if (!window.confirm(`¿Eliminar la conexión de "${entry.puntoNombre || entry.punto}"?`)) {
      return;
    }
    list = list.filter((item) => item.id !== id);
    if (editingId === id) {
      resetForm();
    }
    save();
    render();
    showMessage('Conexión eliminada.', 'ok');
  }

  function exportJson() {
    if (list.length === 0) {
      showMessage('No hay conexiones para exportar.', 'bad');
      return;
    }
    downloadText(`conexiones-ntw-${todayStamp()}.json`, JSON.stringify(list, null, 2), 'application/json');
    showMessage(`${list.length} ${pluralize(list.length, 'conexión', 'conexiones')} ${pluralize(list.length, 'exportada', 'exportadas')}.`, 'ok');
  }

  function exportCsv() {
    if (list.length === 0) {
      showMessage('No hay conexiones para exportar.', 'bad');
      return;
    }
    const header = ['Id', 'Punto', 'Nombre punto', 'Switch', 'Puerto switch', 'Panel', 'Puerto panel', 'Cable', 'Notas', 'Creado'];
    const dataRows = list.map((entry) => [
      entry.id,
      entry.punto,
      entry.puntoNombre,
      entry.switchId,
      entry.puertoSwitch,
      entry.panel,
      entry.puertoPanel,
      entry.cable,
      entry.notas,
      entry.creado.slice(0, 10),
    ]);
    downloadText(`conexiones-ntw-${todayStamp()}.csv`, buildCsv(header, dataRows), 'text/csv;charset=utf-8');
    showMessage(`${list.length} ${pluralize(list.length, 'conexión', 'conexiones')} ${pluralize(list.length, 'exportada', 'exportadas')} a CSV.`, 'ok');
  }

  searchInput.addEventListener('input', () => {
    query = normalizeText(searchInput.value.trim());
    render();
  });

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

  root.querySelector('[data-cxn-export]').addEventListener('click', exportJson);
  root.querySelector('[data-cxn-csv]').addEventListener('click', exportCsv);
  root.querySelector('[data-cxn-clear]').addEventListener('click', () => {
    if (list.length === 0) {
      return;
    }
    if (!window.confirm('¿Vaciar todas las conexiones?')) {
      return;
    }
    list = [];
    searchInput.value = '';
    query = '';
    resetForm();
    save();
    render();
    showMessage('Conexiones vaciadas.', 'ok');
  });

  fillPuntoOptions();
  resetForm();
  render();
}

if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'conexiones') {
    init();
  }
});