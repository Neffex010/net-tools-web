/**
 * utils.js — Utilidades compartidas por los módulos de Net Tools Web.
 *
 * Helpers de propósito general: sanitización HTML, IDs únicos, lectura de
 * colecciones, descarga de archivos, generación de CSV, mensajes temporales,
 * pluralización en español y llenado de <select>.
 *
 * No depende de la interfaz salvo en downloadBlob, fillSelect y makeMessage,
 * que necesitan document/window al ser invocados.
 */

import { get } from './store.js';

/** Escapa caracteres HTML para insertar texto de forma segura en innerHTML. */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Genera un ID único. Acepta un prefijo textual opcional. */
export function uid(prefix = '') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}${window.crypto.randomUUID()}`;
  }
  return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Lee una colección de la store garantizando un arreglo. */
export function getList(name) {
  const stored = get(name, []);
  return Array.isArray(stored) ? stored : [];
}

/** Lee los puntos del Inventario (colección 'inventario'). */
export function loadPuntos() {
  return getList('inventario');
}

/** Lee las Conexiones registradas (colección 'conexiones'). */
export function loadConexiones() {
  return getList('conexiones');
}

/** Fecha de hoy como "AAAA-MM-DD" en hora local, útil para nombres de archivo. */
export function todayStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Descarga un Blob como archivo mediante un enlace temporal.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revocar de inmediato puede cancelar la descarga en algunos navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convierte texto en un archivo descargable (JSON, CSV, etc.). */
export function downloadText(filename, content, mimeType = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}

/**
 * Construye un CSV con BOM UTF-8 (compatible Excel) a partir de cabecera y filas.
 * Entrecomilla los valores que contengan el separador, comillas o saltos de línea.
 *
 * @param {string[]} header Cabecera de columnas.
 * @param {Array<Array<string|number|null|undefined>>} rows Filas de datos.
 * @param {string} [separator=';'] Separador de columnas.
 * @returns {string} Contenido CSV listo para descargar.
 */
export function buildCsv(header, rows, separator = ';') {
  const esc = (value) => {
    const text = String(value ?? '');
    return /["\r\n]/.test(text) || text.includes(separator)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };
  return `\uFEFF${[header, ...rows].map((row) => row.map(esc).join(separator)).join('\r\n')}\r\n`;
}

/**
 * Fábrica de mensajes temporales sobre un elemento.
 * Devuelve una función showMessage(texto, tipo) que limpia el mensaje tras 4 s.
 */
export function makeMessage(element) {
  let timer = null;
  return function showMessage(text, type) {
    if (timer) {
      window.clearTimeout(timer);
    }
    element.textContent = text;
    element.className = type ? `message is-${type}` : 'message';
    if (text) {
      timer = window.setTimeout(() => {
        element.textContent = '';
        element.className = 'message';
      }, 4000);
    }
  };
}

/**
 * Plural en español. Por defecto agrega "s"; acepta una forma plural explícita
 * para irregularidades: pluralize(2, 'conexión', 'conexiones') -> 'conexiones'.
 */
export function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

/**
 * Rellena un <select> con opciones desde una lista.
 *
 * @param {HTMLSelectElement} select
 * @param {Array} items
 * @param {object} [options]
 * @param {string} [options.placeholder] Texto de la primera opción (vacía).
 * @param {boolean} [options.disabledWhenEmpty] Deshabilita el select si no hay items.
 * @param {Function} [options.valueOf] (item) => valor de la opción.
 * @param {Function} [options.labelOf] (item) => texto visible de la opción.
 * @param {Function} [options.onOption] (option, item) => hook adicional por opción.
 */
export function fillSelect(select, items, options = {}) {
  const {
    placeholder = '— Seleccionar —',
    disabledWhenEmpty = false,
    valueOf = (item) => item.id,
    labelOf = (item) => String(item.nombre ?? ''),
    onOption = null,
  } = options;

  select.innerHTML = '';
  const placeholderEl = document.createElement('option');
  placeholderEl.value = '';
  placeholderEl.textContent = placeholder;
  select.appendChild(placeholderEl);
  select.disabled = disabledWhenEmpty && items.length === 0;

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = String(valueOf(item) ?? '');
    option.textContent = labelOf(item);
    if (onOption) onOption(option, item);
    select.appendChild(option);
  });
}