/**
 * Módulo de Ponchado.
 * Carga los estándares T568A/T568B, dibuja los diagramas y el simulador
 * de arrastrar y soltar (HTML5 Drag and Drop API) con validación.
 */

const STANDARD_FILES = {
  a: { label: 'T568A', url: new URL('../../data/t568a.json', import.meta.url) },
  b: { label: 'T568B', url: new URL('../../data/t568b.json', import.meta.url) },
};

const STANDARD_KEY = 'nt.ponchado.standard';
const PAGE_SELECTOR = '[data-page="ponchado"]';

const state = {
  standard: 'b',
  data: {}, // { a: [...], b: [...] }
  dragKey: null,
  selectedKey: null,
};

/* ---------- Persistencia ---------- */
function getStoredStandard() {
  try {
    const stored = localStorage.getItem(STANDARD_KEY);
    if (stored && STANDARD_FILES[stored]) {
      return stored;
    }
  } catch (error) {
    /* almacenamiento no disponible */
  }
  return 'b';
}

function setStoredStandard(id) {
  try {
    localStorage.setItem(STANDARD_KEY, id);
  } catch (error) {
    /* almacenamiento no disponible */
  }
}

/* ---------- Utilidades ---------- */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function swatchStyle(color) {
  if (color.rayado && color.raya) {
    return `background:linear-gradient(135deg, ${color.base} 0 42%, ${color.raya} 42% 58%, ${color.base} 58% 100%);`;
  }
  return `background:${color.base};`;
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getChipByKey(root, key) {
  if (!key) {
    return null;
  }
  return root.querySelector(`.chip[data-key="${CSS.escape(key)}"]`);
}

/* ---------- Carga de datos ---------- */
async function loadStandard(id) {
  if (state.data[id]) {
    return state.data[id];
  }
  const response = await fetch(STANDARD_FILES[id].url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const colors = await response.json();
  state.data[id] = colors;
  return colors;
}

async function loadAll() {
  try {
    await Promise.all([loadStandard('a'), loadStandard('b')]);
  } catch (error) {
    console.error('[ponchado] No se pudieron cargar los estándares:', error);
  }
}

/* ---------- Render de diagramas ---------- */
function renderWiring(container, colors, variant) {
  const items = colors
    .map(
      (color) => `
      <li class="wire wire--${variant}" data-pin="${color.pin}">
        <span class="wire__pin">${color.pin}</span>
        <span class="wire__swatch" style="${swatchStyle(color)}"
              title="${escapeHtml(color.nombre)}" aria-hidden="true"></span>
        <span class="wire__name">${escapeHtml(color.nombre)}</span>
      </li>`
    )
    .join('');

  container.innerHTML = `<ol class="wiring wiring--${variant}" aria-label="Orden de pines">${items}</ol>`;
}

function fillWiring(container, colors, variant) {
  if (!colors) {
    container.innerHTML = '<p class="load-error">No se pudieron cargar los datos de colores.</p>';
    return;
  }
  renderWiring(container, colors, variant);
}

function renderDiagrams(root) {
  const a = root.querySelector('[data-diagram="t568a"]');
  const b = root.querySelector('[data-diagram="t568b"]');
  if (a) {
    fillWiring(a, state.data.a, 'strip');
  }
  if (b) {
    fillWiring(b, state.data.b, 'strip');
  }
}

function renderViews(root) {
  const colors = state.data[state.standard];
  ['rj45', 'keystone', 'panel'].forEach((view) => {
    const container = root.querySelector(`[data-view="${view}"]`);
    if (container) {
      fillWiring(container, colors, view);
    }
  });
}

function renderStandardSwitch(root) {
  root.querySelectorAll('[data-standard]').forEach((button) => {
    const isActive = button.dataset.standard === state.standard;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

/* ---------- Simulador ---------- */
function createChip(color) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.draggable = true;
  chip.dataset.key = color.clave;
  chip.setAttribute('aria-label', color.nombre);
  chip.innerHTML = `<span class="chip__swatch" style="${swatchStyle(color)}"></span>`;
  return chip;
}

function refreshSimSlots(root) {
  root.querySelectorAll('.sim-slot').forEach((slot) => {
    slot.classList.toggle('is-filled', Boolean(slot.querySelector('.chip')));
    slot.classList.remove('is-correct', 'is-wrong');
  });
}

function moveChip(chip, container) {
  const root = chip.closest(PAGE_SELECTOR);
  if (!root) {
    return;
  }
  clearSelection(root);
  container.appendChild(chip);
  refreshSimSlots(root);
}

function clearSelection(root) {
  root.querySelectorAll('.chip.is-selected').forEach((chip) => chip.classList.remove('is-selected'));
  state.selectedKey = null;
}

function renderSimulator(root) {
  const source = root.querySelector('[data-sim-source]');
  const target = root.querySelector('[data-sim-target]');
  if (!source || !target) {
    return;
  }

  const colors = state.data[state.standard] || [];

  target.innerHTML = '';
  for (let pin = 1; pin <= 8; pin += 1) {
    const slot = document.createElement('div');
    slot.className = 'sim-slot';
    slot.dataset.pin = String(pin);
    slot.setAttribute('role', 'listitem');
    slot.innerHTML = `<span class="sim-slot__pin">${pin}</span><span class="sim-slot__drop">Suelta aquí</span>`;
    target.appendChild(slot);
  }

  const shuffled = shuffle(colors);
  source.innerHTML = '';
  shuffled.forEach((color) => source.appendChild(createChip(color)));

  const feedback = root.querySelector('[data-sim-feedback]');
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'sim__feedback';
  }

  clearSelection(root);
  attachSimEvents(root);
}

function enableDrop(element, onDrop) {
  element.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    element.classList.add('is-over');
  });

  element.addEventListener('dragleave', () => {
    element.classList.remove('is-over');
  });

  element.addEventListener('drop', (event) => {
    event.preventDefault();
    element.classList.remove('is-over');
    const key = (event.dataTransfer && event.dataTransfer.getData('text/plain')) || state.dragKey;
    state.dragKey = key;
    onDrop();
  });
}

function attachSimEvents(root) {
  const source = root.querySelector('[data-sim-source]');
  const target = root.querySelector('[data-sim-target]');
  if (!source || !target) {
    return;
  }

  root.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('dragstart', (event) => {
      state.dragKey = chip.dataset.key;
      chip.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', chip.dataset.key);
      }
    });

    chip.addEventListener('dragend', () => {
      chip.classList.remove('is-dragging');
      root.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
    });
  });

  enableDrop(source, () => {
    const chip = getChipByKey(root, state.dragKey);
    if (chip) {
      moveChip(chip, source);
    }
  });

  target.querySelectorAll('.sim-slot').forEach((slot) => {
    enableDrop(slot, () => {
      const chip = getChipByKey(root, state.dragKey);
      if (!chip) {
        return;
      }
      const existing = slot.querySelector('.chip');
      if (existing && existing !== chip) {
        chip.parentElement.appendChild(existing);
      }
      moveChip(chip, slot);
    });
  });
}

function placeSelected(targetContainer) {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || !state.selectedKey) {
    return;
  }
  const chip = getChipByKey(root, state.selectedKey);
  if (!chip) {
    return;
  }
  if (targetContainer.classList.contains('sim-slot')) {
    const existing = targetContainer.querySelector('.chip');
    if (existing && existing !== chip) {
      chip.parentElement.appendChild(existing);
    }
  }
  moveChip(chip, targetContainer);
}

function toggleSelect(chip) {
  const root = chip.closest(PAGE_SELECTOR);
  if (!root) {
    return;
  }
  const wasSelected = chip.classList.contains('is-selected');
  clearSelection(root);
  if (!wasSelected) {
    chip.classList.add('is-selected');
    state.selectedKey = chip.dataset.key;
  }
}

/* ---------- Validación ---------- */
function validateSimulator(root) {
  const colors = state.data[state.standard] || [];
  const expected = colors.map((color) => color.clave);
  const slots = Array.from(root.querySelectorAll('.sim-slot'));
  const feedback = root.querySelector('[data-sim-feedback]');

  let filled = 0;
  let correct = 0;

  slots.forEach((slot) => {
    const chip = slot.querySelector('.chip');
    const pin = Number(slot.dataset.pin);
    slot.classList.remove('is-correct', 'is-wrong');

    if (!chip) {
      return;
    }
    filled += 1;
    const isCorrect = chip.dataset.key === expected[pin - 1];
    slot.classList.toggle('is-correct', isCorrect);
    slot.classList.toggle('is-wrong', !isCorrect);
    if (isCorrect) {
      correct += 1;
    }
  });

  if (!feedback) {
    return;
  }

  let message = '';
  let status = '';

  if (filled < 8) {
    message = `Faltan pines por completar (${filled}/8).`;
    status = 'is-warning';
  } else if (correct === 8) {
    message = '¡Correcto! El orden coincide con el estándar seleccionado.';
    status = 'is-success';
  } else {
    message = `${correct}/8 pines en la posición correcta. Revisa los marcados en rojo.`;
    status = 'is-error';
  }

  feedback.textContent = message;
  feedback.className = `sim__feedback ${status}`;
}

/* ---------- Cambio de estándar ---------- */
function changeStandard(root, id) {
  if (!STANDARD_FILES[id]) {
    return;
  }
  state.standard = id;
  setStoredStandard(id);
  renderStandardSwitch(root);
  renderViews(root);
  renderSimulator(root);
}

/* ---------- Eventos ---------- */
function bindEvents(root) {
  root.addEventListener('click', (event) => {
    const standardButton = event.target.closest('[data-standard]');
    if (standardButton) {
      changeStandard(root, standardButton.dataset.standard);
      return;
    }

    if (event.target.closest('[data-sim-check]')) {
      validateSimulator(root);
      return;
    }

    if (event.target.closest('[data-sim-reset]')) {
      renderSimulator(root);
      return;
    }

    const chip = event.target.closest('.chip');
    if (chip) {
      toggleSelect(chip);
      return;
    }

    const slot = event.target.closest('.sim-slot');
    if (slot) {
      placeSelected(slot);
      return;
    }

    if (event.target.closest('[data-sim-source]')) {
      placeSelected(root.querySelector('[data-sim-source]'));
    }
  });
}

/* ---------- Arranque ---------- */
export async function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  state.standard = getStoredStandard();

  await loadAll();
  renderStandardSwitch(root);
  renderDiagrams(root);
  renderViews(root);
  bindEvents(root);
  renderSimulator(root);
}

// Autoarranque si la vista ya está en el DOM y re-arranque en navegación SPA.
if (document.querySelector(PAGE_SELECTOR)) {
  init();
}

document.addEventListener('app:route-changed', (event) => {
  if (event.detail && event.detail.route === 'ponchado') {
    init();
  }
});
