const PAGE_SELECTOR = '[data-page="diagnostico"]';
const DNS_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const GEO_ENDPOINT = 'https://ipapi.co';

const TYPE_NAMES = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  33: 'SRV',
  257: 'CAA',
};

const STATUS_TEXT = {
  0: 'Sin error',
  1: 'Formato de consulta inválido',
  2: 'Fallo del servidor DNS',
  3: 'NXDOMAIN: el dominio no existe',
  4: 'Tipo de consulta no soportado',
  5: 'Consulta rechazada',
};

/* ---------- Límites de seguridad para las consultas de red ---------- */

const FETCH_TIMEOUT_MS = 8000;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateIPv4(host) {
  const parts = host.split('.');
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    a >= 224
  );
}

function isPrivateIPv6(host) {
  const value = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!value.includes(':')) {
    return false;
  }
  if (value === '::1' || value === '::') {
    return true;
  }
  if (/^f[cd][0-9a-f]{2}:/.test(value)) {
    return true;
  }
  return /^fe[89ab][0-9a-f]:/.test(value);
}

function isBlockedHost(host) {
  const value = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!value) {
    return true;
  }
  if (BLOCKED_HOSTNAMES.has(value)) {
    return true;
  }
  if (value.endsWith('.localhost') || value.endsWith('.local') || value.endsWith('.internal')) {
    return true;
  }
  return isPrivateIPv4(value) || isPrivateIPv6(value);
}

function normalizeTargetUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { error: 'Escribe una URL para medir.' };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch (error) {
    return { error: 'La URL no es válida.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Solo se permiten URLs http(s).' };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { error: 'Por seguridad no se permiten direcciones locales, privadas ni de metadatos.' };
  }
  return { url: parsed.href };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setBusy(button, busy) {
  button.setAttribute('aria-busy', String(busy));
  button.disabled = busy;
}

function showError(el, text) {
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function showStatus(el, text) {
  el.textContent = text;
}

function typeLabel(value) {
  if (typeof value === 'number') {
    return TYPE_NAMES[value] || `TIPO ${value}`;
  }
  return String(value);
}

function classifyLatency(ms) {
  if (ms < 200) {
    return { className: 'badge--ok', label: 'Rápida' };
  }
  if (ms < 600) {
    return { className: 'badge--warn', label: 'Moderada' };
  }
  return { className: 'badge--bad', label: 'Lenta' };
}

async function resolveDns(name, type) {
  const url = `${DNS_ENDPOINT}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const response = await fetchWithTimeout(url, {
    headers: { accept: 'application/dns-json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function measureLatency(url) {
  const start = performance.now();
  try {
    const response = await fetchWithTimeout(url, { method: 'GET', mode: 'cors', cache: 'no-store' });
    return {
      ms: performance.now() - start,
      code: String(response.status),
      final: response.url || url,
    };
  } catch (corsError) {
    if (corsError && corsError.name === 'AbortError') {
      throw new Error('La solicitud excedió el tiempo límite.');
    }
    const retryStart = performance.now();
    try {
      await fetchWithTimeout(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
      return { ms: performance.now() - retryStart, code: 'opaca (sin CORS)', final: url };
    } catch (networkError) {
      if (networkError && networkError.name === 'AbortError') {
        throw new Error('La solicitud excedió el tiempo límite.');
      }
      throw new Error(networkError.message || corsError.message || 'No se pudo conectar.');
    }
  }
}

async function geolocate(ip) {
  const target = ip
    ? `${GEO_ENDPOINT}/${encodeURIComponent(ip)}/json/`
    : `${GEO_ENDPOINT}/json/`;
  const response = await fetchWithTimeout(target, { cache: 'no-store' });
  const data = await response.json().catch(() => null);

  // Plan gratuito de ipapi.co: 1000 consultas/día. Al agotarse responde 429
  // (en ocasiones con body { error: true, reason: "Rate limited" }).
  const reason = data && data.reason ? String(data.reason) : '';
  if (response.status === 429 || /rate|limit/i.test(reason)) {
    const error = new Error('rate-limited');
    error.userMessage =
      'ipapi.co alcanzó su límite gratuito (1000 consultas/día). Inténtalo de nuevo más tarde.';
    throw error;
  }
  if (!response.ok || !data || data.error) {
    throw new Error(reason || `HTTP ${response.status}`);
  }
  return data;
}

export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const dnsForm = root.querySelector('[data-diag-dns-form]');
  const dnsName = root.querySelector('[data-diag-dns-name]');
  const dnsType = root.querySelector('[data-diag-dns-type]');
  const dnsSubmit = root.querySelector('[data-diag-dns-submit]');
  const dnsError = root.querySelector('[data-diag-dns-error]');
  const dnsStatus = root.querySelector('[data-diag-dns-status]');
  const dnsResult = root.querySelector('[data-diag-dns-result]');
  const dnsAnswers = root.querySelector('[data-diag-dns-answers]');

  const latForm = root.querySelector('[data-diag-lat-form]');
  const latUrl = root.querySelector('[data-diag-lat-url]');
  const latSubmit = root.querySelector('[data-diag-lat-submit]');
  const latError = root.querySelector('[data-diag-lat-error]');
  const latStatus = root.querySelector('[data-diag-lat-status]');
  const latResult = root.querySelector('[data-diag-lat-result]');
  const latValue = root.querySelector('[data-diag-lat-value]');
  const latBadge = root.querySelector('[data-diag-lat-badge]');
  const latCode = root.querySelector('[data-diag-lat-code]');
  const latFinal = root.querySelector('[data-diag-lat-final]');

  const geoForm = root.querySelector('[data-diag-geo-form]');
  const geoIp = root.querySelector('[data-diag-geo-ip]');
  const geoSubmit = root.querySelector('[data-diag-geo-submit]');
  const geoSelf = root.querySelector('[data-diag-geo-self]');
  const geoError = root.querySelector('[data-diag-geo-error]');
  const geoStatus = root.querySelector('[data-diag-geo-status]');
  const geoResult = root.querySelector('[data-diag-geo-result]');
  const geoFields = {
    ip: root.querySelector('[data-diag-geo-value-ip]'),
    city: root.querySelector('[data-diag-geo-city]'),
    region: root.querySelector('[data-diag-geo-region]'),
    country: root.querySelector('[data-diag-geo-country]'),
    org: root.querySelector('[data-diag-geo-org]'),
    coords: root.querySelector('[data-diag-geo-coords]'),
    timezone: root.querySelector('[data-diag-geo-timezone]'),
  };

  function renderDnsAnswers(data) {
    const answers = Array.isArray(data.Answer) ? data.Answer : [];
    dnsAnswers.innerHTML = answers
      .map(
        (answer) => `
          <tr>
            <td class="mono">${escapeHtml(answer.name)}</td>
            <td>${escapeHtml(typeLabel(answer.type))}</td>
            <td class="mono">${escapeHtml(answer.TTL)}</td>
            <td class="mono">${escapeHtml(answer.data)}</td>
          </tr>`
      )
      .join('');
    dnsResult.hidden = answers.length === 0;
  }

  dnsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = dnsName.value.trim();
    const type = dnsType.value;

    if (!name) {
      showError(dnsError, 'Escribe un dominio para resolver.');
      dnsName.focus();
      return;
    }
    showError(dnsError, '');
    dnsResult.hidden = true;
    setBusy(dnsSubmit, true);
    showStatus(dnsStatus, `Consultando ${type} de ${name}…`);

    resolveDns(name, type)
      .then((data) => {
        if (data.Status !== 0) {
          showStatus(dnsStatus, `No se pudo resolver: ${STATUS_TEXT[data.Status] || `estado ${data.Status}`}.`);
          renderDnsAnswers({ Answer: [] });
          return;
        }
        renderDnsAnswers(data);
        const count = Array.isArray(data.Answer) ? data.Answer.length : 0;
        showStatus(
          dnsStatus,
          count === 0
            ? `Sin registros ${type} para ${name}.`
            : `${count} registro${count === 1 ? '' : 's'} ${type} para ${name}.`
        );
      })
      .catch((error) => {
        console.error('[diagnostico] Error en la consulta DNS:', error);
        showStatus(dnsStatus, '');
        showError(dnsError, 'No se pudo completar la consulta DNS. Verifica tu conexión a Internet.');
      })
      .finally(() => setBusy(dnsSubmit, false));
  });

  latForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const target = normalizeTargetUrl(latUrl.value);
    if (target.error) {
      showError(latError, target.error);
      latUrl.focus();
      return;
    }
    showError(latError, '');
    latResult.hidden = true;
    setBusy(latSubmit, true);
    showStatus(latStatus, 'Midiendo latencia…');

    measureLatency(target.url)
      .then((result) => {
        const ms = Math.max(0, result.ms);
        const rounded = ms >= 10 ? Math.round(ms) : Math.round(ms * 10) / 10;
        latValue.textContent = String(rounded);
        const rating = classifyLatency(ms);
        latBadge.innerHTML = `<span class="badge ${rating.className}">${rating.label}</span>`;
        latCode.textContent = result.code;
        latFinal.textContent = result.final;
        latResult.hidden = false;
        showStatus(latStatus, '');
      })
      .catch((error) => {
        console.error('[diagnostico] Error al medir latencia:', error);
        showStatus(latStatus, '');
        showError(
          latError,
          error.message === 'La solicitud excedió el tiempo límite.'
            ? error.message
            : 'No se pudo medir la latencia. Comprueba la URL y tu conexión.'
        );
      })
      .finally(() => setBusy(latSubmit, false));
  });

  function runGeo(ip) {
    showError(geoError, '');
    geoResult.hidden = true;
    setBusy(geoSubmit, true);
    showStatus(geoStatus, ip ? `Ubicando ${ip}…` : 'Ubicando tu conexión…');

    geolocate(ip)
      .then((data) => {
        geoFields.ip.textContent = data.ip || '—';
        geoFields.city.textContent = data.city || '—';
        geoFields.region.textContent = data.region || '—';
        geoFields.country.textContent = [data.country_name, data.country_code].filter(Boolean).join(' (') + (data.country_code ? ')' : '') || '—';
        geoFields.org.textContent = data.org || data.asn || '—';
        geoFields.coords.textContent =
          data.latitude != null && data.longitude != null ? `${data.latitude}, ${data.longitude}` : '—';
        geoFields.timezone.textContent = data.timezone || '—';
        geoResult.hidden = false;
        showStatus(geoStatus, '');
      })
      .catch((error) => {
        console.error('[diagnostico] Error al geolocalizar:', error);
        showStatus(geoStatus, '');
        showError(
          geoError,
          error.userMessage ||
            'No se pudo obtener la geolocalización. Revisa la IP o tu conexión.'
        );
      })
      .finally(() => setBusy(geoSubmit, false));
  }

  geoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const ip = geoIp.value.trim();
    if (ip && isBlockedHost(ip)) {
      showError(geoError, 'No se pueden geolocalizar direcciones locales o privadas.');
      geoIp.focus();
      return;
    }
    runGeo(ip);
  });

  geoSelf.addEventListener('click', () => {
    geoIp.value = '';
    runGeo('');
  });
}

if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'diagnostico') {
    init();
  }
});
