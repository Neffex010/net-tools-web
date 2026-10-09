/**
 * store.js — Wrapper simple sobre localStorage con namespace "ntw:".
 * Serializa a JSON automáticamente y degrada con seguridad si localStorage
 * no está disponible (modo privado, cuota excedida, etc.).
 */

export const NAMESPACE = 'ntw:';

function fullKey(name) {
  return `${NAMESPACE}${name}`;
}

/**
 * Lee y deserializa un valor. Devuelve `fallback` si no existe o es inválido.
 */
export function get(name, fallback = null) {
  try {
    const raw = localStorage.getItem(fullKey(name));
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[store] No se pudo leer "${name}":`, error);
    return fallback;
  }
}

/**
 * Serializa y guarda un valor. Devuelve true si se guardó correctamente.
 */
export function set(name, value) {
  try {
    localStorage.setItem(fullKey(name), JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`[store] No se pudo guardar "${name}":`, error);
    return false;
  }
}

/**
 * Elimina una clave. Devuelve true si la operación se completó.
 */
export function remove(name) {
  try {
    localStorage.removeItem(fullKey(name));
    return true;
  } catch (error) {
    console.error(`[store] No se pudo eliminar "${name}":`, error);
    return false;
  }
}

/**
 * Devuelve los nombres (sin namespace) de las claves almacenadas.
 */
export function keys() {
  const result = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(NAMESPACE)) {
        result.push(key.slice(NAMESPACE.length));
      }
    }
  } catch (error) {
    console.error('[store] No se pudieron listar las claves:', error);
  }
  return result;
}

/**
 * Elimina todas las claves del namespace "ntw:".
 */
export function clear() {
  try {
    keys().forEach((name) => localStorage.removeItem(fullKey(name)));
    return true;
  } catch (error) {
    console.error('[store] No se pudo limpiar el almacenamiento:', error);
    return false;
  }
}
