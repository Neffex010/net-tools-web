/**
 * Módulo de Calculadoras.
 * CIDR/subredes, conversión metros-pies, longitud de canal (90 + 10 m),
 * estimación de materiales y comparación/conversión entre categorías de cable.
 */

const PAGE_SELECTOR = '[data-page="calculadoras"]';
const CATEGORIAS_URL = new URL('../../data/categorias-cable.json', import.meta.url);

const FEET_PER_METER = 3.280839895;
const METERS_PER_FOOT = 0.3048;

const numberFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

let cacheCategorias = null;

/* ---------- Utilidades ---------- */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function fmt(value) {
  return numberFmt.format(value);
}

function renderRows(container, rows) {
  container.innerHTML = rows
    .map((row) => {
      const statusClass = row.status ? ` is-${row.status}` : '';
      return `
        <div class="result__row">
          <span class="result__label">${escapeHtml(row.label)}</span>
          <span class="result__value${statusClass}">${escapeHtml(row.value)}</span>
        </div>`;
    })
    .join('');
}

/* ---------- CIDR ---------- */
function ipToInt(ip) {
  const parts = String(ip).trim().split('.');
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function intToIp(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function prefixToMask(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function maskToPrefix(mask) {
  let bits = 0;
  let seenZero = false;
  for (let i = 31; i >= 0; i -= 1) {
    const bit = (mask >>> i) & 1;
    if (bit === 1) {
      if (seenZero) {
        return null;
      }
      bits += 1;
    } else {
      seenZero = true;
    }
  }
  return bits;
}

function parseMask(input) {
  const raw = String(input).trim().replace(/^\//, '');
  if (raw === '') {
    return null;
  }
  if (/^\d{1,2}$/.test(raw)) {
    const prefix = Number(raw);
    return prefix >= 0 && prefix <= 32 ? prefix : null;
  }
  const mask = ipToInt(raw);
  if (mask === null) {
    return null;
  }
  return maskToPrefix(mask);
}

function computeCidr(ipInput, maskInput) {
  const ip = ipToInt(ipInput);
  if (ip === null) {
    return { error: 'Dirección IP inválida. Usa el formato 192.168.1.10.' };
  }
  const prefix = parseMask(maskInput);
  if (prefix === null) {
    return { error: 'Máscara inválida. Usa un prefijo (24) o una máscara (255.255.255.0).' };
  }

  const mask = prefixToMask(prefix);
  const wildcard = ~mask >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const total = 2 ** (32 - prefix);

  let hosts;
  let first;
  let last;
  if (prefix === 32) {
    hosts = 1;
    first = network;
    last = network;
  } else if (prefix === 31) {
    hosts = 2;
    first = network;
    last = broadcast;
  } else {
    hosts = total - 2;
    first = (network + 1) >>> 0;
    last = (broadcast - 1) >>> 0;
  }

  return { prefix, mask, wildcard, network, broadcast, total, hosts, first, last };
}

function renderCidr(root) {
  const container = root.querySelector('[data-cidr-result]');
  if (!container) {
    return;
  }
  const ip = root.querySelector('[data-cidr-ip]').value;
  const mask = root.querySelector('[data-cidr-mask]').value;
  const data = computeCidr(ip, mask);

  if (data.error) {
    container.innerHTML = `<p class="error">${escapeHtml(data.error)}</p>`;
    return;
  }

  renderRows(container, [
    { label: 'Notación CIDR', value: `${intToIp(data.network)}/${data.prefix}` },
    { label: 'Máscara de subred', value: intToIp(data.mask) },
    { label: 'Máscara wildcard', value: intToIp(data.wildcard) },
    { label: 'Dirección de red', value: intToIp(data.network) },
    { label: 'Dirección de broadcast', value: intToIp(data.broadcast) },
    { label: 'Primer host usable', value: intToIp(data.first) },
    { label: 'Último host usable', value: intToIp(data.last) },
    { label: 'Hosts usables', value: fmt(data.hosts) },
    { label: 'Direcciones totales', value: fmt(data.total) },
  ]);
}

/* ---------- Metros / pies ---------- */
function renderPies(root) {
  const container = root.querySelector('[data-pies-result]');
  if (!container) {
    return;
  }
  const value = toNumber(root.querySelector('[data-pies-valor]').value);
  const unit = root.querySelector('[data-pies-unidad]').value;

  const meters = unit === 'm' ? value : value * METERS_PER_FOOT;
  const feet = unit === 'm' ? value * FEET_PER_METER : value;

  renderRows(container, [
    { label: 'Metros', value: `${fmt(meters)} m` },
    { label: 'Pies', value: `${fmt(feet)} ft` },
    { label: 'Conversión usada', value: unit === 'm' ? '1 m = 3.28084 ft' : '1 ft = 0.3048 m' },
  ]);
}

/* ---------- Longitud máxima ---------- */
function renderLongitud(root) {
  const result = root.querySelector('[data-long-result]');
  const status = root.querySelector('[data-long-status]');
  if (!result || !status) {
    return;
  }
  const perm = toNumber(root.querySelector('[data-long-perm]').value);
  const patch = toNumber(root.querySelector('[data-long-patch]').value);
  const total = perm + patch;
  const remaining = Math.max(0, 100 - total);

  renderRows(result, [
    { label: 'Cableado permanente', value: `${fmt(perm)} m`, status: perm > 90 ? 'bad' : 'ok' },
    { label: 'Latiguillos', value: `${fmt(patch)} m`, status: patch > 10 ? 'warn' : 'ok' },
    { label: 'Canal total', value: `${fmt(total)} m`, status: total > 100 ? 'bad' : 'ok' },
    { label: 'Margen restante del canal', value: `${fmt(remaining)} m` },
  ]);

  let message = '';
  let kind = 'is-ok';
  if (perm > 90) {
    message = 'El cableado horizontal permanente supera los 90 m permitidos.';
    kind = 'is-bad';
  } else if (total > 100) {
    message = 'El canal supera los 100 m. Acorta el cableado o los latiguillos.';
    kind = 'is-bad';
  } else if (patch > 10) {
    message = 'El canal cumple, pero los latiguillos superan los 10 m recomendados.';
    kind = 'is-warn';
  } else {
    message = 'Configuración válida: dentro de la regla de 90 m + 10 m (canal de 100 m).';
  }
  status.textContent = message;
  status.className = `status ${kind}`;
}

/* ---------- Materiales ---------- */
function renderMateriales(root) {
  const container = root.querySelector('[data-mat-result]');
  if (!container) {
    return;
  }
  const puntos = toInt(root.querySelector('[data-mat-puntos]').value);
  const porPunto = toNumber(root.querySelector('[data-mat-metros]').value);
  const margen = toNumber(root.querySelector('[data-mat-margen]').value);
  const puertosPP = toInt(root.querySelector('[data-mat-puertos]').value, 24) || 24;

  const bruto = puntos * porPunto * (1 + margen / 100);
  const metros = puntos > 0 ? Math.ceil(Number(bruto.toFixed(6))) : 0;
  const cajas = metros > 0 ? Math.ceil(metros / 305) : 0;
  const patchPanels = puntos > 0 ? Math.ceil(puntos / puertosPP) : 0;

  renderRows(container, [
    { label: 'Cable UTP (con margen)', value: `${fmt(metros)} m` },
    { label: 'Cajas de 305 m (1000 ft)', value: fmt(cajas) },
    { label: 'Jacks RJ45 (keystone)', value: fmt(puntos) },
    { label: 'Faceplates', value: fmt(puntos) },
    { label: `Patch panels de ${puertosPP} puertos`, value: fmt(patchPanels) },
    { label: 'Puertos de patch panel usados', value: fmt(puntos) },
    { label: 'Latiguillos (área de trabajo + panel)', value: fmt(puntos * 2) },
  ]);
}

/* ---------- Categorías ---------- */
async function loadCategorias() {
  if (cacheCategorias) {
    return cacheCategorias;
  }
  const response = await fetch(CATEGORIAS_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  cacheCategorias = await response.json();
  return cacheCategorias;
}

function distanceFor(categoria, gbps) {
  const entry = (categoria.soporta || []).find((item) => item.gbps === gbps);
  return entry ? entry.distanciaM : null;
}

function renderCatSpecs(root, categoria) {
  const container = root.querySelector('[data-cat-specs]');
  if (!container || !categoria) {
    return;
  }
  const rows = (categoria.soporta || [])
    .map((item) => {
      const velocidad = (cacheCategorias && cacheCategorias.velocidades
        ? cacheCategorias.velocidades.find((v) => v.gbps === item.gbps)
        : null);
      const nombre = velocidad ? velocidad.nombre : `${item.gbps} Gbps`;
      const distancia = item.distanciaM === null ? 'No soportado' : `${fmt(item.distanciaM)} m`;
      return `<tr><td>${escapeHtml(nombre)}</td><td>${escapeHtml(distancia)}</td></tr>`;
    })
    .join('');

  container.innerHTML = `
    <div class="result__row">
      <span class="result__label">Frecuencia</span>
      <span class="result__value">${fmt(categoria.frecuenciaMHz)} MHz</span>
    </div>
    <p class="hint">${escapeHtml(categoria.descripcion || '')}</p>
    <p class="hint">Norma: ${escapeHtml(categoria.norma || '')}</p>
    <table class="table">
      <thead><tr><th>Velocidad</th><th>Distancia máx.</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderCatResult(root) {
  const container = root.querySelector('[data-cat-result]');
  const status = root.querySelector('[data-cat-status]');
  if (!container || !status || !cacheCategorias) {
    return;
  }

  const categoriaId = root.querySelector('[data-cat-categoria]').value;
  const gbps = Number.parseFloat(root.querySelector('[data-cat-velocidad]').value);
  const distancia = toNumber(root.querySelector('[data-cat-distancia]').value);

  const categoria = cacheCategorias.categorias.find((item) => item.id === categoriaId);
  renderCatSpecs(root, categoria);

  const rows = [];
  let recommended = null;

  cacheCategorias.categorias.forEach((item) => {
    const max = distanceFor(item, gbps);
    const ok = max !== null && max >= distancia;
    if (ok && !recommended) {
      recommended = item;
    }
    rows.push({
      label: item.nombre,
      value: max === null ? 'No soportado' : `${fmt(max)} m — ${ok ? 'cumple' : 'no alcanza'}`,
      status: ok ? 'ok' : 'bad',
    });
  });

  renderRows(container, rows);

  if (recommended) {
    status.textContent = `Categoría mínima recomendada: ${recommended.nombre}.`;
    status.className = 'status is-ok';
  } else {
    status.textContent = 'Ninguna categoría cumple ese requisito. Revisa velocidad o distancia.';
    status.className = 'status is-bad';
  }
}

function populateCatSelects(root) {
  const catSelect = root.querySelector('[data-cat-categoria]');
  const velSelect = root.querySelector('[data-cat-velocidad]');
  if (!catSelect || !velSelect || !cacheCategorias) {
    return;
  }

  catSelect.innerHTML = cacheCategorias.categorias
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nombre)}</option>`)
    .join('');

  velSelect.innerHTML = cacheCategorias.velocidades
    .map((v) => `<option value="${v.gbps}">${escapeHtml(v.nombre)}</option>`)
    .join('');

  catSelect.value = cacheCategorias.categorias[0] ? cacheCategorias.categorias[0].id : '';
  const defaultSpeed = cacheCategorias.velocidades.find((v) => v.gbps === 1);
  velSelect.value = defaultSpeed ? String(defaultSpeed.gbps) : String(cacheCategorias.velocidades[0].gbps);
}

/* ---------- Enlace de eventos ---------- */
function bindInputs(root, selector, handler) {
  root.querySelectorAll(selector).forEach((input) => {
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });
}

function bindEvents(root) {
  bindInputs(root, '[data-cidr-ip], [data-cidr-mask]', () => renderCidr(root));
  bindInputs(root, '[data-pies-valor], [data-pies-unidad]', () => renderPies(root));
  bindInputs(root, '[data-long-perm], [data-long-patch]', () => renderLongitud(root));
  bindInputs(
    root,
    '[data-mat-puntos], [data-mat-metros], [data-mat-margen], [data-mat-puertos]',
    () => renderMateriales(root)
  );
  bindInputs(
    root,
    '[data-cat-categoria], [data-cat-velocidad], [data-cat-distancia]',
    () => renderCatResult(root)
  );
}

/* ---------- Arranque ---------- */
export async function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  renderCidr(root);
  renderPies(root);
  renderLongitud(root);
  renderMateriales(root);
  bindEvents(root);

  const catStatus = root.querySelector('[data-cat-status]');
  try {
    await loadCategorias();
    populateCatSelects(root);
    renderCatResult(root);
  } catch (error) {
    console.error('[calculadoras] No se pudieron cargar las categorías:', error);
    if (catStatus) {
      catStatus.textContent = 'No se pudieron cargar los datos de categorías.';
      catStatus.className = 'status is-bad';
    }
  }
}

// Autoarranque si la vista ya está en el DOM y re-arranque en navegación SPA.
if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'calculadoras') {
    init();
  }
});
