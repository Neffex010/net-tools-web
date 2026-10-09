import { get, set } from '../store.js';
import { escapeHtml, fillSelect, loadConexiones, loadPuntos, makeMessage, pluralize } from '../utils.js';

const PAGE_SELECTOR = '[data-page="etiquetas"]';
const STORAGE_KEY = 'etiquetas';
const LIB_URL = new URL('../libs/qrcode.min.js', import.meta.url).href;
const TEMPLATE_URL = new URL('../../templates/etiqueta.html', import.meta.url).href;

let qrLibPromise = null;
let templatePromise = null;

function loadQrLib() {
  if (window.qrcode) {
    return Promise.resolve(window.qrcode);
  }
  if (qrLibPromise) {
    return qrLibPromise;
  }
  qrLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIB_URL;
    script.onload = () => {
      if (window.qrcode) {
        resolve(window.qrcode);
      } else {
        reject(new Error('La librería QR no expuso window.qrcode.'));
      }
    };
    script.onerror = () => reject(new Error('No se pudo cargar qrcode.min.js.'));
    document.head.appendChild(script);
  });
  return qrLibPromise;
}

function loadTemplate() {
  if (templatePromise) {
    return templatePromise;
  }
  templatePromise = fetch(TEMPLATE_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error('No se pudo cargar la plantilla de etiqueta.');
      }
      return response.text();
    })
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const template = doc.getElementById('etiqueta-template');
      const style = doc.getElementById('etiqueta-styles');
      if (!template) {
        throw new Error('La plantilla no contiene #etiqueta-template.');
      }
      return { template, style };
    });
  return templatePromise;
}

function qrDataUrl(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(8, 2);
}

function normalize(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: String(item.id ?? '').trim(),
    nombre: String(item.nombre ?? '').trim(),
    ubicacion: String(item.ubicacion ?? '').trim(),
  };
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const form = root.querySelector('[data-etq-form]');
  const nombreInput = root.querySelector('[data-etq-nombre]');
  const ubicacionInput = root.querySelector('[data-etq-ubicacion]');
  const idInput = root.querySelector('[data-etq-id]');
  const listEl = root.querySelector('[data-etq-list]');
  const countEl = root.querySelector('[data-etq-count]');
  const colsSelect = root.querySelector('[data-etq-cols]');
  const sheet = root.querySelector('[data-etq-sheet]');
  const messageEl = root.querySelector('[data-etq-message]');

  let labels = get(STORAGE_KEY, []);
  if (!Array.isArray(labels)) {
    labels = [];
  }
  labels = labels.map(normalize);

  let template = null;
  let ready = false;

  const puntoField = document.createElement('div');
  puntoField.className = 'field';
  const puntoLabel = document.createElement('label');
  puntoLabel.setAttribute('for', 'etq-punto');
  puntoLabel.textContent = 'Usar un punto del Inventario';
  const puntoSelect = document.createElement('select');
  puntoSelect.id = 'etq-punto';
  puntoSelect.setAttribute('data-etq-punto', '');
  puntoField.appendChild(puntoLabel);
  puntoField.appendChild(puntoSelect);
  const formGrid = form.querySelector('.grid');
  if (formGrid) {
    formGrid.insertBefore(puntoField, formGrid.firstChild);
  }

  function fillPuntoOptions() {
    fillSelect(puntoSelect, loadPuntos(), {
      placeholder: '— Elegir un punto del inventario —',
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
    nombreInput.value = String(punto.nombre ?? '');
    ubicacionInput.value = String(punto.ubicacion ?? '');
    showMessage(`Punto "${punto.nombre}" cargado en el formulario.`, 'ok');
    nombreInput.focus();
  });

  fillPuntoOptions();

  const conexionField = document.createElement('div');
  conexionField.className = 'field';
  const conexionLabel = document.createElement('label');
  conexionLabel.setAttribute('for', 'etq-conexion');
  conexionLabel.textContent = 'O etiquetar el cable de una Conexión';
  const conexionSelect = document.createElement('select');
  conexionSelect.id = 'etq-conexion';
  conexionSelect.setAttribute('data-etq-conexion', '');
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
    nombreInput.value = cable || puntoNombre || punto || '';
    ubicacionInput.value = puntoNombre || punto || '';
    showMessage(`Conexión "${cable || puntoNombre || punto || id}" cargada en el formulario.`, 'ok');
    nombreInput.focus();
  });

  fillConexionOptions();

  const showMessage = makeMessage(messageEl);

  function save() {
    set(STORAGE_KEY, labels);
  }

  function nextId() {
    const taken = new Set(labels.map((label) => label.id));
    let index = labels.length + 1;
    let id = `P-${String(index).padStart(3, '0')}`;
    while (taken.has(id)) {
      index += 1;
      id = `P-${String(index).padStart(3, '0')}`;
    }
    return id;
  }

  function qrText(label) {
    return JSON.stringify({ id: label.id, nombre: label.nombre, ubicacion: label.ubicacion });
  }

  function renderList() {
    countEl.textContent = `${labels.length} ${pluralize(labels.length, 'etiqueta')}`;
    if (labels.length === 0) {
      listEl.innerHTML = '<li class="muted">Sin etiquetas. Agrega la primera con el formulario.</li>';
      return;
    }
    listEl.innerHTML = labels
      .map((label) => {
        const ubicacion = label.ubicacion ? ` · ${escapeHtml(label.ubicacion)}` : '';
        return `<li>
          <span class="grow"><strong>${escapeHtml(label.nombre || '(sin nombre)')}</strong> — ${escapeHtml(label.id)}${ubicacion}</span>
          <button type="button" class="btn" data-etq-remove="${escapeHtml(label.id)}">Quitar</button>
        </li>`;
      })
      .join('');
  }

  function renderSheet() {
    sheet.innerHTML = '';
    if (labels.length === 0) {
      const note = document.createElement('p');
      note.className = 'etq-empty';
      note.textContent = 'Agrega puntos para previsualizar las etiquetas.';
      sheet.appendChild(note);
      return;
    }
    if (!ready || !template) {
      const note = document.createElement('p');
      note.className = 'etq-empty';
      note.textContent = 'Generando códigos QR...';
      sheet.appendChild(note);
      return;
    }
    labels.forEach((label) => {
      const node = template.content.cloneNode(true);
      const img = node.querySelector('[data-etq-qr]');
      try {
        img.src = qrDataUrl(qrText(label));
        img.alt = `QR ${label.id}`;
      } catch (error) {
        console.error('[etiquetas] Error al generar el QR:', error);
      }
      node.querySelector('[data-etq-nombre]').textContent = label.nombre || '(sin nombre)';
      node.querySelector('[data-etq-ubicacion]').textContent = label.ubicacion;
      node.querySelector('[data-etq-id]').textContent = label.id;
      sheet.appendChild(node);
    });
  }

  function render() {
    renderList();
    renderSheet();
  }

  function applyCols() {
    sheet.style.setProperty('--etq-cols', colsSelect.value || '3');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const nombre = nombreInput.value.trim();
    if (!nombre) {
      showMessage('El nombre del punto es obligatorio.', 'bad');
      nombreInput.focus();
      return;
    }
    const id = idInput.value.trim() || nextId();
    if (labels.some((label) => label.id === id)) {
      showMessage(`El ID "${id}" ya existe.`, 'bad');
      idInput.focus();
      return;
    }
    labels.push({ id, nombre, ubicacion: ubicacionInput.value.trim() });
    save();
    form.reset();
    render();
    nombreInput.focus();
    showMessage(`Etiqueta "${nombre}" agregada.`, 'ok');
  });

  listEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-etq-remove]');
    if (!button) {
      return;
    }
    labels = labels.filter((label) => label.id !== button.dataset.etqRemove);
    save();
    render();
    showMessage('Etiqueta eliminada.', 'ok');
  });

  colsSelect.addEventListener('change', applyCols);

  root.querySelector('[data-etq-clear]').addEventListener('click', () => {
    if (labels.length === 0) {
      return;
    }
    if (!window.confirm('¿Vaciar todas las etiquetas?')) {
      return;
    }
    labels = [];
    save();
    render();
    showMessage('Etiquetas vaciadas.', 'ok');
  });

  root.querySelector('[data-etq-print]').addEventListener('click', () => {
    if (labels.length === 0) {
      showMessage('No hay etiquetas para imprimir.', 'bad');
      return;
    }
    window.print();
  });

  applyCols();
  render();

  Promise.all([loadQrLib(), loadTemplate()])
    .then(([, tpl]) => {
      if (tpl.style && !document.getElementById('etiqueta-styles')) {
        document.head.appendChild(tpl.style);
      }
      template = tpl.template;
      ready = true;
      renderSheet();
    })
    .catch((error) => {
      console.error('[etiquetas] No se pudo preparar el generador de QR:', error);
      showMessage('No se pudo cargar el generador de QR.', 'bad');
      renderSheet();
    });
}
