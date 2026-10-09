import { get, set } from '../store.js';
import { buildCsv, downloadText, escapeHtml, fillSelect, loadConexiones, loadPuntos, makeMessage, todayStamp, uid } from '../utils.js';

const PAGE_SELECTOR = '[data-page="pruebas"]';
const STORAGE_KEY = 'pruebas';
const TEMPLATE_URL = new URL('../../templates/informe-pruebas.html', import.meta.url).href;

const LIMITES = { longitud: 100, atenuacion: 24, next: 30, retorno: 15 };

let templatePromise = null;

function loadTemplate() {
  if (templatePromise) {
    return templatePromise;
  }
  templatePromise = fetch(TEMPLATE_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error('No se pudo cargar la plantilla del informe.');
      }
      return response.text();
    })
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const informe = doc.getElementById('informe-template');
      const fila = doc.getElementById('informe-fila');
      const style = doc.getElementById('informe-styles');
      if (!informe || !fila) {
        throw new Error('La plantilla del informe está incompleta.');
      }
      return { informe, fila, style };
    });
  return templatePromise;
}

function toNumber(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  if (text === '') {
    return null;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function fmt(value, decimals = 1) {
  return value == null ? '' : Number(value).toFixed(decimals);
}

function normalize(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof item.id === 'string' && item.id ? item.id : uid(),
    link: String(item.link ?? '').trim(),
    mapa: item.mapa === 'FAIL' ? 'FAIL' : 'OK',
    longitud: toNumber(item.longitud),
    atenuacion: toNumber(item.atenuacion),
    next: toNumber(item.next),
    retorno: toNumber(item.retorno),
    resultado: item.resultado === 'FAIL' ? 'FAIL' : 'PASS',
    fecha: typeof item.fecha === 'string' && item.fecha ? item.fecha : new Date().toISOString(),
  };
}

function evaluar(entry) {
  const fallos = [];
  if (entry.mapa === 'FAIL') {
    fallos.push('mapa');
  }
  if (entry.longitud != null && entry.longitud > LIMITES.longitud) {
    fallos.push('longitud');
  }
  if (entry.atenuacion != null && entry.atenuacion > LIMITES.atenuacion) {
    fallos.push('atenuación');
  }
  if (entry.next != null && entry.next < LIMITES.next) {
    fallos.push('NEXT');
  }
  if (entry.retorno != null && entry.retorno < LIMITES.retorno) {
    fallos.push('retorno');
  }
  return { pass: fallos.length === 0, fallos };
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const formEl = root.querySelector('[data-pr-form]');
  const linkInput = root.querySelector('[data-pr-link]');
  const mapaSelect = root.querySelector('[data-pr-mapa]');
  const longitudInput = root.querySelector('[data-pr-longitud]');
  const atenuacionInput = root.querySelector('[data-pr-atenuacion]');
  const nextInput = root.querySelector('[data-pr-next]');
  const retornoInput = root.querySelector('[data-pr-retorno]');
  const resultadoSelect = root.querySelector('[data-pr-resultado]');
  const hintEl = root.querySelector('[data-pr-hint]');
  const formError = root.querySelector('[data-pr-form-error]');
  const submitButton = root.querySelector('[data-pr-submit]');
  const cancelButton = root.querySelector('[data-pr-cancel]');
  const searchInput = root.querySelector('[data-pr-search]');
  const filterResultado = root.querySelector('[data-pr-filter-resultado]');
  const filterMapa = root.querySelector('[data-pr-filter-mapa]');
  const body = root.querySelector('[data-pr-body]');
  const emptyEl = root.querySelector('[data-pr-empty]');
  const summaryEl = root.querySelector('[data-pr-summary]');
  const reportHost = root.querySelector('[data-pr-report-host]');
  const messageEl = root.querySelector('[data-pr-message]');

  let rows = get(STORAGE_KEY, []);
  if (!Array.isArray(rows)) {
    rows = [];
  }
  rows = rows.map(normalize);

  let editingId = null;

  const puntoField = document.createElement('div');
  puntoField.className = 'field';
  const puntoLabel = document.createElement('label');
  puntoLabel.setAttribute('for', 'pr-punto');
  puntoLabel.textContent = 'Punto de red a probar';
  const puntoSelect = document.createElement('select');
  puntoSelect.id = 'pr-punto';
  puntoSelect.setAttribute('data-pr-punto', '');
  puntoField.appendChild(puntoLabel);
  puntoField.appendChild(puntoSelect);
  const formGrid = formEl.querySelector('.grid');
  if (formGrid) {
    formGrid.insertBefore(puntoField, formGrid.firstChild);
  }

  function fillPuntoOptions() {
    fillSelect(puntoSelect, loadPuntos(), {
      placeholder: '— Elegir un punto o escribir el enlace —',
      valueOf: (punto) => punto.id,
      labelOf: (punto) => {
        const nombre = String(punto.nombre ?? '(sin nombre)').trim();
        const ubicacion = String(punto.ubicacion ?? '').trim();
        return ubicacion ? `${nombre} — ${ubicacion}` : nombre;
      },
    });
  }

  puntoSelect.addEventListener('change', () => {
    const id = puntoSelect.value;
    if (!id) {
      return;
    }
    const punto = loadPuntos().find((item) => String(item.id ?? '') === id);
    if (!punto) {
      return;
    }
    const nombre = String(punto.nombre ?? '').trim();
    linkInput.value = nombre || String(punto.id ?? '');
    showMessage(`Punto "${nombre || id}" cargado como enlace.`, 'ok');
    updateHint();
    linkInput.focus();
  });

  fillPuntoOptions();

  const conexionField = document.createElement('div');
  conexionField.className = 'field';
  const conexionLabel = document.createElement('label');
  conexionLabel.setAttribute('for', 'pr-conexion');
  conexionLabel.textContent = 'O vincular una Conexión registrada';
  const conexionSelect = document.createElement('select');
  conexionSelect.id = 'pr-conexion';
  conexionSelect.setAttribute('data-pr-conexion', '');
  conexionField.appendChild(conexionLabel);
  conexionField.appendChild(conexionSelect);
  if (formGrid) {
    formGrid.insertBefore(conexionField, puntoField.nextSibling);
  }

  function fillConexionOptions() {
    const conexiones = loadConexiones();
    fillSelect(conexionSelect, conexiones, {
      placeholder: conexiones.length === 0 ? 'No hay conexiones guardadas' : '— Elegir una conexión (opcional) —',
      disabledWhenEmpty: true,
      valueOf: (cxn) => cxn.id,
      labelOf: (cxn) => {
        const cable = String(cxn.cable ?? '').trim();
        const puntoNombre = String(cxn.puntoNombre ?? '').trim();
        const punto = String(cxn.punto ?? '').trim();
        return cable ? `${cable} — ${puntoNombre || punto}` : puntoNombre || punto || 'Conexión';
      },
    });
  }

  conexionSelect.addEventListener('change', () => {
    const id = conexionSelect.value;
    if (!id) {
      return;
    }
    const cxn = loadConexiones().find((item) => String(item.id ?? '') === id);
    if (!cxn) {
      return;
    }
    const cable = String(cxn.cable ?? '').trim();
    const puntoNombre = String(cxn.puntoNombre ?? '').trim();
    const punto = String(cxn.punto ?? '').trim();
    linkInput.value = cable || puntoNombre || punto || '';
    showMessage(`Conexión "${cable || puntoNombre || punto || id}" cargada como enlace.`, 'ok');
    updateHint();
    linkInput.focus();
  });

  fillConexionOptions();

  const showMessage = makeMessage(messageEl);

  function showError(text) {
    if (!text) {
      formError.hidden = true;
      formError.textContent = '';
      return;
    }
    formError.hidden = false;
    formError.textContent = text;
  }

  function save() {
    set(STORAGE_KEY, rows);
  }

  function readForm() {
    return {
      link: linkInput.value.trim(),
      mapa: mapaSelect.value,
      longitud: toNumber(longitudInput.value),
      atenuacion: toNumber(atenuacionInput.value),
      next: toNumber(nextInput.value),
      retorno: toNumber(retornoInput.value),
      resultado: resultadoSelect.value,
    };
  }

  function updateHint() {
    const data = readForm();
    const hasAny =
      data.mapa === 'FAIL' ||
      data.longitud != null ||
      data.atenuacion != null ||
      data.next != null ||
      data.retorno != null;
    if (!hasAny) {
      hintEl.innerHTML = 'Límites de referencia: 100 m · atenuación ≤ 24 dB · NEXT ≥ 30 dB · retorno ≥ 15 dB.';
      return;
    }
    const evaluation = evaluar(data);
    hintEl.innerHTML = evaluation.pass
      ? 'Sugerido por límites: <strong>PASS</strong>.'
      : `Sugerido por límites: <strong>FAIL</strong> (${evaluation.fallos.map(escapeHtml).join(', ')}).`;
  }

  function getVisible() {
    const term = searchInput.value.trim().toLowerCase();
    const resultado = filterResultado.value;
    const mapa = filterMapa.value;
    return rows.filter((entry) => {
      if (resultado && entry.resultado !== resultado) {
        return false;
      }
      if (mapa && entry.mapa !== mapa) {
        return false;
      }
      if (term && !entry.link.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }

  function render() {
    const visible = getVisible();

    body.innerHTML = visible
      .map((entry) => {
        const mapaClass = entry.mapa === 'OK' ? 'pass' : 'fail';
        const resultClass = entry.resultado === 'PASS' ? 'pass' : 'fail';
        const cell = (value) => (value == null ? '<span class="muted">—</span>' : fmt(value, 1));
        return `<tr>
          <td>${escapeHtml(entry.link)}</td>
          <td><span class="badge badge--${mapaClass}">${entry.mapa}</span></td>
          <td>${cell(entry.longitud)}</td>
          <td>${cell(entry.atenuacion)}</td>
          <td>${cell(entry.next)}</td>
          <td>${cell(entry.retorno)}</td>
          <td><span class="badge badge--${resultClass}">${entry.resultado}</span></td>
          <td>${escapeHtml(entry.fecha.slice(0, 10))}</td>
          <td class="row-actions">
            <button type="button" class="btn btn--sm" data-edit="${escapeHtml(entry.id)}">Editar</button>
            <button type="button" class="btn btn--sm" data-delete="${escapeHtml(entry.id)}">Eliminar</button>
          </td>
        </tr>`;
      })
      .join('');

    const pass = rows.filter((entry) => entry.resultado === 'PASS').length;
    summaryEl.textContent =
      rows.length === 0 ? '' : `Mostrando ${visible.length} de ${rows.length} · PASS: ${pass} · FAIL: ${rows.length - pass}`;

    if (visible.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent =
        rows.length === 0 ? 'No hay pruebas registradas. Agrega la primera con el formulario.' : 'Ninguna prueba coincide con los filtros.';
    } else {
      emptyEl.hidden = true;
      emptyEl.textContent = '';
    }
  }

  function resetForm() {
    editingId = null;
    formEl.reset();
    mapaSelect.value = 'OK';
    resultadoSelect.value = 'PASS';
    submitButton.textContent = 'Agregar prueba';
    cancelButton.hidden = true;
    showError('');
    updateHint();
  }

  function startEdit(id) {
    const entry = rows.find((item) => item.id === id);
    if (!entry) {
      return;
    }
    editingId = id;
    linkInput.value = entry.link;
    mapaSelect.value = entry.mapa;
    longitudInput.value = entry.longitud == null ? '' : String(entry.longitud);
    atenuacionInput.value = entry.atenuacion == null ? '' : String(entry.atenuacion);
    nextInput.value = entry.next == null ? '' : String(entry.next);
    retornoInput.value = entry.retorno == null ? '' : String(entry.retorno);
    resultadoSelect.value = entry.resultado;
    submitButton.textContent = 'Guardar cambios';
    cancelButton.hidden = false;
    showError('');
    updateHint();
    linkInput.focus();
    formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const data = readForm();

    if (!data.link) {
      showError('El enlace (ID) es obligatorio.');
      linkInput.focus();
      return;
    }

    const numericFields = [
      [longitudInput, 'longitud'],
      [atenuacionInput, 'atenuación'],
      [nextInput, 'NEXT'],
      [retornoInput, 'pérdida de retorno'],
    ];
    for (const [input, label] of numericFields) {
      if (input.value.trim() !== '' && toNumber(input.value) == null) {
        showError(`El valor de ${label} debe ser numérico.`);
        input.focus();
        return;
      }
    }

    const duplicate = rows.find(
      (entry) => entry.link.toLowerCase() === data.link.toLowerCase() && entry.id !== editingId
    );
    if (duplicate) {
      showError(`Ya existe una prueba para el enlace "${data.link}".`);
      linkInput.focus();
      return;
    }

    showError('');

    if (editingId) {
      const index = rows.findIndex((entry) => entry.id === editingId);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...data };
      }
      save();
      resetForm();
      render();
      showMessage(`Prueba "${data.link}" actualizada.`, 'ok');
    } else {
      rows.unshift(normalize({ ...data, id: uid() }));
      save();
      resetForm();
      render();
      showMessage(`Prueba "${data.link}" agregada.`, 'ok');
    }
  }

  function handleDelete(id) {
    const entry = rows.find((item) => item.id === id);
    if (!entry) {
      return;
    }
    if (!window.confirm(`¿Eliminar la prueba del enlace "${entry.link}"?`)) {
      return;
    }
    rows = rows.filter((item) => item.id !== id);
    if (editingId === id) {
      resetForm();
    }
    save();
    render();
    showMessage(`Prueba "${entry.link}" eliminada.`, 'ok');
  }

  function exportCsv() {
    const visible = getVisible();
    if (visible.length === 0) {
      showMessage('No hay pruebas para exportar.', 'bad');
      return;
    }
    const header = ['Enlace', 'Mapa', 'Longitud (m)', 'Atenuacion (dB)', 'NEXT (dB)', 'Perdida retorno (dB)', 'Resultado', 'Fecha'];
    const dataRows = visible.map((entry) => [
      entry.link,
      entry.mapa,
      fmt(entry.longitud, 1),
      fmt(entry.atenuacion, 1),
      fmt(entry.next, 1),
      fmt(entry.retorno, 1),
      entry.resultado,
      entry.fecha.slice(0, 10),
    ]);
    const csv = buildCsv(header, dataRows, ',');
    downloadText(`pruebas-ntw-${todayStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    showMessage(`Exportadas ${visible.length} pruebas a CSV.`, 'ok');
  }

  function generateReport() {
    const visible = getVisible();
    if (visible.length === 0) {
      showMessage('No hay pruebas para el informe.', 'bad');
      return;
    }
    loadTemplate()
      .then((tpl) => {
        if (tpl.style && !document.getElementById('informe-styles')) {
          document.head.appendChild(tpl.style);
        }
        const fragment = tpl.informe.content.cloneNode(true);
        const generated = new Date().toLocaleString('es-MX');
        fragment.querySelector('[data-informe-meta]').textContent = `Generado: ${generated} · Pruebas incluidas: ${visible.length}`;
        const pass = visible.filter((entry) => entry.resultado === 'PASS').length;
        fragment.querySelector('[data-informe-resumen]').textContent =
          `Total: ${visible.length} · Aprobadas (PASS): ${pass} · Fallidas (FAIL): ${visible.length - pass}`;

        const tbody = fragment.querySelector('[data-informe-filas]');
        visible.forEach((entry) => {
          const row = tpl.fila.content.cloneNode(true);
          row.querySelector('[data-inf-link]').textContent = entry.link;
          row.querySelector('[data-inf-mapa]').textContent = entry.mapa;
          row.querySelector('[data-inf-long]').textContent = entry.longitud == null ? '—' : fmt(entry.longitud, 1);
          row.querySelector('[data-inf-aten]').textContent = entry.atenuacion == null ? '—' : fmt(entry.atenuacion, 1);
          row.querySelector('[data-inf-next]').textContent = entry.next == null ? '—' : fmt(entry.next, 1);
          row.querySelector('[data-inf-retorno]').textContent = entry.retorno == null ? '—' : fmt(entry.retorno, 1);
          const resultado = row.querySelector('[data-inf-resultado]');
          resultado.textContent = entry.resultado;
          resultado.className = `informe__badge ${entry.resultado === 'PASS' ? 'is-pass' : 'is-fail'}`;
          row.querySelector('[data-inf-fecha]').textContent = entry.fecha.slice(0, 10);
          tbody.appendChild(row);
        });

        fragment.querySelector('[data-informe-pie]').textContent =
          'Net Tools Web · Informe de certificación de enlaces · Documento generado automáticamente.';

        reportHost.innerHTML = '';
        reportHost.appendChild(fragment);
        showMessage('Informe generado.', 'ok');
        window.print();
      })
      .catch((error) => {
        console.error('[pruebas] No se pudo generar el informe:', error);
        showMessage('No se pudo generar el informe.', 'bad');
      });
  }

  formEl.addEventListener('submit', handleSubmit);
  formEl.addEventListener('input', updateHint);
  formEl.addEventListener('change', updateHint);

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
  filterResultado.addEventListener('change', render);
  filterMapa.addEventListener('change', render);

  root.querySelector('[data-pr-csv]').addEventListener('click', exportCsv);
  root.querySelector('[data-pr-report]').addEventListener('click', generateReport);
  root.querySelector('[data-pr-clear]').addEventListener('click', () => {
    if (rows.length === 0) {
      return;
    }
    if (!window.confirm('¿Vaciar todas las pruebas registradas?')) {
      return;
    }
    rows = [];
    resetForm();
    save();
    render();
    showMessage('Pruebas vaciadas.', 'ok');
  });

  loadTemplate().catch(() => {});

  resetForm();
  render();
}
