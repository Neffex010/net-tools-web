/**
 * Módulo de Planos y rutas.
 * Canvas 2D nativo: sube un plano, dibuja rutas de cable y coloca marcadores
 * (toma, switch, AP, cámara, rack), mide longitudes, guarda/importa el proyecto
 * como JSON y exporta el canvas a PNG.
 */

const PAGE_SELECTOR = '[data-page="planos"]';

const MARKER_TYPES = {
  toma: { label: 'Toma', color: '#1f6feb' },
  switch: { label: 'Switch', color: '#8957e5' },
  ap: { label: 'AP', color: '#12b886' },
  camara: { label: 'Cámara', color: '#e8930c' },
  rack: { label: 'Rack', color: '#6b7280' },
};

const ROUTE_COLORS = ['#1f6feb', '#e8930c', '#12b886', '#8957e5', '#dc2626', '#0ea5e9'];

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 800;
const MAX_IMAGE_WIDTH = 2400;
const HISTORY_LIMIT = 50;

function uid(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function withAlpha(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return distance(p, a);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

let controller = null;

document.addEventListener('keydown', (event) => {
  if (!controller || !controller.root.isConnected) {
    return;
  }
  controller.onKey(event);
});

/* ---------- Arranque ---------- */
export function init() {
  const root = document.querySelector(PAGE_SELECTOR);
  if (!root || root.dataset.initialized === 'true') {
    return;
  }
  root.dataset.initialized = 'true';

  const canvas = root.querySelector('[data-pl-canvas]');
  const wrap = root.querySelector('[data-pl-canvas-wrap]');
  const ctx = canvas.getContext('2d');
  const hintEl = root.querySelector('[data-pl-hint]');
  const measureEl = root.querySelector('[data-pl-measure]');
  const routesList = root.querySelector('[data-pl-routes]');
  const markersList = root.querySelector('[data-pl-markers]');
  const messageEl = root.querySelector('[data-pl-message]');
  const imageInput = root.querySelector('[data-pl-image]');
  const imageName = root.querySelector('[data-pl-image-name]');
  const imageButton = root.querySelector('[data-pl-image-btn]');
  const escalaInput = root.querySelector('[data-pl-escala]');
  const projectFile = root.querySelector('[data-pl-project-file]');
  const zoomLabel = root.querySelector('[data-pl-zoom-label]');

  const state = {
    image: null,
    imageData: null,
    routes: [],
    markers: [],
    history: [],
    tool: 'select',
    markerType: 'toma',
    pxToM: 0.05,
    zoom: 1,
    drawing: null,
    cursor: null,
    selected: null,
    drag: null,
  };

  let messageTimer = null;

  function showMessage(text, type) {
    if (messageTimer) {
      window.clearTimeout(messageTimer);
    }
    messageEl.textContent = text;
    messageEl.className = type ? `message is-${type}` : 'message';
    if (text) {
      messageTimer = window.setTimeout(() => {
        messageEl.textContent = '';
        messageEl.className = 'message';
      }, 4000);
    }
  }

  function toCanvas(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  /* ---------- Historial ---------- */
  function pushHistory() {
    state.history.push(JSON.stringify({ routes: state.routes, markers: state.markers }));
    if (state.history.length > HISTORY_LIMIT) {
      state.history.shift();
    }
  }

  function undo() {
    const snapshot = state.history.pop();
    if (!snapshot) {
      return;
    }
    const data = JSON.parse(snapshot);
    state.routes = data.routes || [];
    state.markers = data.markers || [];
    state.selected = null;
    state.drawing = null;
    draw();
    renderLists();
    showMessage('Cambio deshecho.', null);
  }

  /* ---------- Dibujo ---------- */
  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvas.width, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBackground() {
    if (state.image) {
      ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();
  }

  function drawRoutes() {
    state.routes.forEach((route) => {
      if (route.points.length === 0) {
        return;
      }
      ctx.save();
      ctx.strokeStyle = route.color;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      route.points.forEach((p, i) => {
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      });
      ctx.stroke();
      ctx.fillStyle = route.color;
      route.points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    });
  }

  function drawMarkerShape(g, marker, highlight) {
    const type = MARKER_TYPES[marker.type] ? marker.type : 'toma';
    const color = MARKER_TYPES[type].color;

    g.save();
    g.translate(marker.x, marker.y);
    g.lineWidth = 2;
    g.strokeStyle = color;
    g.fillStyle = withAlpha(color, 0.22);
    g.lineJoin = 'round';

    if (type === 'toma') {
      g.beginPath();
      g.arc(0, 0, 12, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.fillRect(-4, -4, 8, 8);
    } else if (type === 'switch') {
      roundedRect(g, -16, -10, 32, 20, 3);
      g.fill();
      g.stroke();
      g.strokeStyle = withAlpha(color, 0.85);
      for (let i = -10; i <= 10; i += 5) {
        g.beginPath();
        g.moveTo(i, -10);
        g.lineTo(i, -5);
        g.stroke();
      }
    } else if (type === 'ap') {
      g.beginPath();
      g.arc(0, 0, 11, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(0, 2, 6, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
      g.beginPath();
      g.arc(0, 2, 11, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
    } else if (type === 'camara') {
      g.beginPath();
      g.moveTo(-12, -8);
      g.lineTo(12, -8);
      g.lineTo(6, 10);
      g.lineTo(-6, 10);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, 3.2, 0, Math.PI * 2);
      g.fill();
    } else if (type === 'rack') {
      roundedRect(g, -10, -16, 20, 32, 3);
      g.fill();
      g.stroke();
      g.strokeStyle = withAlpha(color, 0.85);
      for (let y = -10; y <= 10; y += 6) {
        g.beginPath();
        g.moveTo(-10, y);
        g.lineTo(10, y);
        g.stroke();
      }
    }

    if (highlight) {
      g.setLineDash([5, 4]);
      g.lineWidth = 2;
      g.strokeStyle = '#ff4d4f';
      g.beginPath();
      g.arc(0, 0, 21, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }

    g.font = '600 12px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const text = marker.label || MARKER_TYPES[type].label;
    const textWidth = g.measureText(text).width;
    g.fillStyle = 'rgba(15, 23, 42, 0.78)';
    roundedRect(g, -textWidth / 2 - 5, 20, textWidth + 10, 17, 4);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(text, 0, 23);
    g.restore();
  }

  function drawMarkers() {
    state.markers.forEach((marker) => {
      const isSelected = state.selected && state.selected.kind === 'marker' && state.selected.id === marker.id;
      drawMarkerShape(ctx, marker, isSelected);
    });
  }

  function drawSelection() {
    if (!state.selected || state.selected.kind !== 'route') {
      return;
    }
    const route = state.routes.find((r) => r.id === state.selected.id);
    if (!route) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 77, 79, 0.9)';
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.35;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    route.points.forEach((p, i) => {
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function drawPreview() {
    if (!state.drawing || state.drawing.points.length === 0) {
      return;
    }
    const points = state.drawing.points.slice();
    if (state.cursor) {
      points.push(state.cursor);
    }
    ctx.save();
    ctx.strokeStyle = ROUTE_COLORS[state.routes.length % ROUTE_COLORS.length];
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawRoutes();
    drawSelection();
    drawMarkers();
    drawPreview();
  }

  /* ---------- Medición ---------- */
  function routeLength(route) {
    let total = 0;
    for (let i = 1; i < route.points.length; i += 1) {
      total += distance(route.points[i - 1], route.points[i]);
    }
    return total;
  }

  function formatLength(px) {
    return `${px.toFixed(1)} px · ${(px * state.pxToM).toFixed(2)} m`;
  }

  /* ---------- Listas / mediciones ---------- */
  function renderLists() {
    routesList.innerHTML = state.routes
      .map((route, index) => {
        const isSelected = state.selected && state.selected.kind === 'route' && state.selected.id === route.id;
        const style = isSelected ? ' style="background-color:var(--color-active)"' : '';
        return `<li${style} data-pl-select-route="${route.id}">
          <span class="swatch" style="background-color:${route.color}"></span>
          <span class="grow">Ruta ${index + 1} — ${formatLength(routeLength(route))}</span>
          <button type="button" class="btn" data-pl-del-route="${route.id}">Quitar</button>
        </li>`;
      })
      .join('');

    if (state.routes.length === 0) {
      routesList.innerHTML = '<li class="muted">Sin rutas dibujadas.</li>';
    }

    markersList.innerHTML = state.markers
      .map((marker) => {
        const type = MARKER_TYPES[marker.type] ? marker.type : 'toma';
        const isSelected = state.selected && state.selected.kind === 'marker' && state.selected.id === marker.id;
        const style = isSelected ? ' style="background-color:var(--color-active)"' : '';
        return `<li${style} data-pl-select-marker="${marker.id}">
          <span class="swatch" style="background-color:${MARKER_TYPES[type].color}"></span>
          <span class="grow">${marker.label || MARKER_TYPES[type].label} — ${MARKER_TYPES[type].label}</span>
          <button type="button" class="btn" data-pl-del-marker="${marker.id}">Quitar</button>
        </li>`;
      })
      .join('');

    if (state.markers.length === 0) {
      markersList.innerHTML = '<li class="muted">Sin elementos colocados.</li>';
    }

    let totalPx = state.routes.reduce((sum, route) => sum + routeLength(route), 0);
    let previewPx = 0;
    if (state.drawing && state.drawing.points.length > 1) {
      previewPx = routeLength({ points: state.drawing.points });
    }
    if (state.cursor && state.drawing && state.drawing.points.length > 0) {
      previewPx += distance(state.drawing.points[state.drawing.points.length - 1], state.cursor);
    }

    const parts = [
      `Rutas: <strong>${state.routes.length}</strong>`,
      `Elementos: <strong>${state.markers.length}</strong>`,
      `Longitud total: <strong>${formatLength(totalPx)}</strong>`,
    ];
    if (previewPx > 0) {
      parts.push(`Trazando: <strong>${formatLength(previewPx)}</strong>`);
    }
    parts.push(`Escala: <strong>${state.pxToM} m/px</strong>`);
    measureEl.innerHTML = parts.join(' · ');
  }

  /* ---------- Herramientas ---------- */
  function updateToolUI() {
    root.querySelectorAll('[data-pl-tool]').forEach((btn) => {
      btn.classList.toggle('is-active', state.tool === btn.dataset.plTool);
    });
    root.querySelectorAll('[data-pl-marker]').forEach((btn) => {
      btn.classList.toggle('is-active', state.tool === 'marker' && state.markerType === btn.dataset.plMarker);
    });
    canvas.classList.toggle('is-route', state.tool === 'route');
    canvas.classList.toggle('is-marker', state.tool === 'marker');

    if (state.tool === 'route') {
      hintEl.textContent = 'Haz clic para añadir vértices. Pulsa Enter o haz doble clic para finalizar; Esc para cancelar.';
    } else if (state.tool === 'marker') {
      hintEl.textContent = `Haz clic en el plano para colocar: ${MARKER_TYPES[state.markerType].label}.`;
    } else {
      hintEl.textContent = 'Selecciona una ruta o un marcador y arrástralo para moverlo. Pulsa Suprimir para eliminarlo.';
    }
  }

  function setTool(tool, markerType) {
    if (state.drawing) {
      finishRoute();
    }
    state.tool = tool;
    if (markerType) {
      state.markerType = markerType;
    }
    updateToolUI();
    draw();
  }

  /* ---------- Mutaciones ---------- */
  function nextLabel(type) {
    const count = state.markers.filter((m) => m.type === type).length + 1;
    return `${MARKER_TYPES[type].label} ${count}`;
  }

  function addPoint(point) {
    if (!state.drawing) {
      state.drawing = { points: [] };
    }
    state.drawing.points.push(point);
    draw();
    renderLists();
  }

  function finishRoute() {
    if (!state.drawing) {
      return;
    }
    const points = state.drawing.points.filter((p, i, arr) => i === 0 || distance(p, arr[i - 1]) > 1);
    state.drawing = null;
    state.cursor = null;
    if (points.length >= 2) {
      pushHistory();
      state.routes.push({
        id: uid('route'),
        color: ROUTE_COLORS[state.routes.length % ROUTE_COLORS.length],
        points,
      });
    }
    draw();
    renderLists();
  }

  function cancelDrawing() {
    state.drawing = null;
    state.cursor = null;
    draw();
    renderLists();
  }

  function addMarker(point) {
    pushHistory();
    const type = state.markerType;
    state.markers.push({
      id: uid('marker'),
      type,
      x: point.x,
      y: point.y,
      label: nextLabel(type),
    });
    draw();
    renderLists();
  }

  function select(kind, id) {
    state.selected = kind && id ? { kind, id } : null;
    draw();
    renderLists();
  }

  function deleteRoute(id) {
    pushHistory();
    state.routes = state.routes.filter((route) => route.id !== id);
    if (state.selected && state.selected.kind === 'route' && state.selected.id === id) {
      state.selected = null;
    }
    draw();
    renderLists();
  }

  function deleteMarker(id) {
    pushHistory();
    state.markers = state.markers.filter((marker) => marker.id !== id);
    if (state.selected && state.selected.kind === 'marker' && state.selected.id === id) {
      state.selected = null;
    }
    draw();
    renderLists();
  }

  function deleteSelected() {
    if (!state.selected) {
      return;
    }
    if (state.selected.kind === 'route') {
      deleteRoute(state.selected.id);
    } else {
      deleteMarker(state.selected.id);
    }
    showMessage('Elemento eliminado.', 'ok');
  }

  function clearAll() {
    if (state.routes.length === 0 && state.markers.length === 0) {
      return;
    }
    if (!window.confirm('¿Vaciar todas las rutas y elementos del plano?')) {
      return;
    }
    pushHistory();
    state.routes = [];
    state.markers = [];
    state.drawing = null;
    state.selected = null;
    draw();
    renderLists();
    showMessage('Plano vaciado.', 'ok');
  }

  /* ---------- Interacción ---------- */
  function hitMarker(point) {
    const radius = 16 / state.zoom;
    for (let i = state.markers.length - 1; i >= 0; i -= 1) {
      if (distance(point, state.markers[i]) <= radius) {
        return state.markers[i];
      }
    }
    return null;
  }

  function hitRoute(point) {
    const threshold = 10 / state.zoom;
    for (let i = state.routes.length - 1; i >= 0; i -= 1) {
      const route = state.routes[i];
      for (let j = 1; j < route.points.length; j += 1) {
        if (pointToSegment(point, route.points[j - 1], route.points[j]) <= threshold) {
          return route;
        }
      }
    }
    return null;
  }

  function onPointerDown(event) {
    if (state.tool !== 'select') {
      return;
    }
    const point = toCanvas(event);
    const marker = hitMarker(point);
    if (marker) {
      state.selected = { kind: 'marker', id: marker.id };
      state.drag = {
        kind: 'marker',
        id: marker.id,
        start: point,
        dx: marker.x - point.x,
        dy: marker.y - point.y,
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
      draw();
      renderLists();
      return;
    }
    const route = hitRoute(point);
    if (route) {
      state.selected = { kind: 'route', id: route.id };
      state.drag = {
        kind: 'route',
        id: route.id,
        start: point,
        original: route.points.map((p) => ({ ...p })),
        moved: false,
      };
      canvas.setPointerCapture(event.pointerId);
    } else {
      state.selected = null;
    }
    draw();
    renderLists();
  }

  function onPointerMove(event) {
    const point = toCanvas(event);
    state.cursor = point;

    if (state.drag) {
      // El historial solo se guarda cuando el arrastre mueve de verdad: un clic
      // para seleccionar no debe consumir un paso de "Deshacer".
      if (!state.drag.moved) {
        const from = state.drag.start;
        if (Math.hypot(point.x - from.x, point.y - from.y) < 3) {
          return;
        }
        state.drag.moved = true;
        pushHistory();
      }
      if (state.drag.kind === 'marker') {
        const marker = state.markers.find((m) => m.id === state.drag.id);
        if (marker) {
          marker.x = point.x + state.drag.dx;
          marker.y = point.y + state.drag.dy;
        }
      } else {
        const route = state.routes.find((r) => r.id === state.drag.id);
        if (route) {
          const dx = point.x - state.drag.start.x;
          const dy = point.y - state.drag.start.y;
          route.points = state.drag.original.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        }
      }
      draw();
      renderLists();
      return;
    }

    if (state.drawing) {
      draw();
    }
  }

  function onPointerUp(event) {
    if (state.drag) {
      state.drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }
  }

  function onClick(event) {
    const point = toCanvas(event);
    if (state.tool === 'route') {
      addPoint(point);
    } else if (state.tool === 'marker') {
      addMarker(point);
    }
  }

  function onKey(event) {
    const tag = (event.target && event.target.tagName) ? event.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return;
    }
    if (event.key === 'Escape' && state.drawing) {
      cancelDrawing();
      return;
    }
    if (event.key === 'Enter' && state.drawing) {
      event.preventDefault();
      finishRoute();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
      event.preventDefault();
      deleteSelected();
    }
  }

  /* ---------- Imagen y zoom ---------- */
  function applyZoom() {
    canvas.style.width = `${canvas.width * state.zoom}px`;
    canvas.style.height = `${canvas.height * state.zoom}px`;
    zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function fitZoom() {
    const available = wrap.clientWidth || DEFAULT_WIDTH;
    state.zoom = Math.min(1, available / canvas.width);
    if (!Number.isFinite(state.zoom) || state.zoom <= 0) {
      state.zoom = 1;
    }
    applyZoom();
  }

  function zoomBy(factor) {
    state.zoom = Math.max(0.2, Math.min(4, state.zoom * factor));
    applyZoom();
  }

  function loadImage(dataUrl, done) {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      state.imageData = dataUrl;
      const scale = Math.min(1, MAX_IMAGE_WIDTH / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      fitZoom();
      draw();
      renderLists();
      if (typeof done === 'function') {
        done();
      }
    };
    image.onerror = () => showMessage('No se pudo cargar la imagen del plano.', 'bad');
    image.src = dataUrl;
  }

  /* ---------- Guardar / cargar ---------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportProject() {
    const project = {
      app: 'net-tools-web',
      kind: 'plano',
      version: 1,
      escala: state.pxToM,
      imagen: state.imageData,
      routes: state.routes,
      markers: state.markers,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `plano-ntw-${stamp}.json`);
    showMessage('Proyecto guardado como JSON.', 'ok');
  }

  function normalizeRoute(raw) {
    const points = Array.isArray(raw && raw.points)
      ? raw.points
          .filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
          .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
      : [];
    return {
      id: raw && typeof raw.id === 'string' ? raw.id : uid('route'),
      color: raw && typeof raw.color === 'string' ? raw.color : ROUTE_COLORS[0],
      points,
    };
  }

  function normalizeMarker(raw) {
    const item = raw && typeof raw === 'object' ? raw : {};
    const type = MARKER_TYPES[item.type] ? item.type : 'toma';
    return {
      id: typeof item.id === 'string' ? item.id : uid('marker'),
      type,
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
      label: typeof item.label === 'string' && item.label ? item.label : MARKER_TYPES[type].label,
    };
  }

  function importProject(file) {
    file
      .text()
      .then((text) => {
        const project = JSON.parse(text);
        if (!project || typeof project !== 'object') {
          throw new Error('Proyecto inválido.');
        }
        state.routes = Array.isArray(project.routes) ? project.routes.map(normalizeRoute).filter((r) => r.points.length > 0) : [];
        state.markers = Array.isArray(project.markers) ? project.markers.map(normalizeMarker) : [];
        state.history = [];
        state.drawing = null;
        state.selected = null;
        state.drag = null;

        const escala = Number(project.escala);
        if (Number.isFinite(escala) && escala > 0) {
          state.pxToM = escala;
          escalaInput.value = String(escala);
        }

        const finish = () => {
          if (imageName) {
            imageName.textContent = state.imageData ? 'Imagen incluida en el proyecto' : 'Sin imagen';
          }
          draw();
          renderLists();
          showMessage('Proyecto cargado.', 'ok');
        };

        if (typeof project.imagen === 'string' && project.imagen.startsWith('data:')) {
          loadImage(project.imagen, finish);
        } else {
          state.image = null;
          state.imageData = null;
          canvas.width = DEFAULT_WIDTH;
          canvas.height = DEFAULT_HEIGHT;
          fitZoom();
          finish();
        }
      })
      .catch((error) => {
        console.error('[planos] Error al importar:', error);
        showMessage('No se pudo importar el proyecto JSON.', 'bad');
      });
  }

  function exportPng() {
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const octx = offscreen.getContext('2d');

    if (state.image) {
      octx.drawImage(state.image, 0, 0, offscreen.width, offscreen.height);
    } else {
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, offscreen.width, offscreen.height);
    }
    state.routes.forEach((route) => {
      if (route.points.length < 2) {
        return;
      }
      octx.save();
      octx.strokeStyle = route.color;
      octx.lineWidth = 3;
      octx.lineJoin = 'round';
      octx.lineCap = 'round';
      octx.beginPath();
      route.points.forEach((p, i) => {
        if (i === 0) {
          octx.moveTo(p.x, p.y);
        } else {
          octx.lineTo(p.x, p.y);
        }
      });
      octx.stroke();
      octx.restore();
    });

    state.markers.forEach((marker) => {
      drawMarkerShape(octx, marker, false);
    });

    const stamp = new Date().toISOString().slice(0, 10);
    offscreen.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `plano-ntw-${stamp}.png`);
        showMessage('Canvas exportado a PNG.', 'ok');
      } else {
        showMessage('No se pudo exportar el PNG.', 'bad');
      }
    }, 'image/png');
  }

  /* ---------- Eventos ---------- */
  root.querySelectorAll('[data-pl-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.plTool));
  });
  root.querySelectorAll('[data-pl-marker]').forEach((btn) => {
    btn.addEventListener('click', () => setTool('marker', btn.dataset.plMarker));
  });

  root.querySelector('[data-pl-undo]').addEventListener('click', undo);
  root.querySelector('[data-pl-delete]').addEventListener('click', deleteSelected);
  root.querySelector('[data-pl-clear]').addEventListener('click', clearAll);
  root.querySelector('[data-pl-zoom-in]').addEventListener('click', () => zoomBy(1.2));
  root.querySelector('[data-pl-zoom-out]').addEventListener('click', () => zoomBy(1 / 1.2));

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('dblclick', () => {
    if (state.tool === 'route' && state.drawing) {
      finishRoute();
    }
  });
  canvas.addEventListener('contextmenu', (event) => {
    if (state.drawing) {
      event.preventDefault();
      finishRoute();
    }
  });

  routesList.addEventListener('click', (event) => {
    const del = event.target.closest('[data-pl-del-route]');
    if (del) {
      deleteRoute(del.dataset.plDelRoute);
      return;
    }
    const row = event.target.closest('[data-pl-select-route]');
    if (row) {
      select('route', row.dataset.plSelectRoute);
    }
  });

  markersList.addEventListener('click', (event) => {
    const del = event.target.closest('[data-pl-del-marker]');
    if (del) {
      deleteMarker(del.dataset.plDelMarker);
      return;
    }
    const row = event.target.closest('[data-pl-select-marker]');
    if (row) {
      select('marker', row.dataset.plSelectMarker);
    }
  });

  escalaInput.addEventListener('input', () => {
    const value = Number(escalaInput.value);
    if (Number.isFinite(value) && value > 0) {
      state.pxToM = value;
      renderLists();
    } else {
      escalaInput.value = String(state.pxToM);
    }
  });

  imageInput.addEventListener('change', () => {
    const file = imageInput.files && imageInput.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      loadImage(reader.result, () => {
        if (imageName) {
          imageName.textContent = file.name;
        }
        showMessage('Plano cargado.', 'ok');
      });
    reader.onerror = () => showMessage('No se pudo leer la imagen.', 'bad');
    reader.readAsDataURL(file);
    imageInput.value = '';
  });

  root.querySelector('[data-pl-export-json]').addEventListener('click', exportProject);
  root.querySelector('[data-pl-export-png]').addEventListener('click', exportPng);
  root.querySelector('[data-pl-import]').addEventListener('click', () => projectFile.click());
  if (imageButton) {
    imageButton.addEventListener('click', () => imageInput.click());
  }
  projectFile.addEventListener('change', () => {
    const file = projectFile.files && projectFile.files[0];
    if (file) {
      importProject(file);
    }
    projectFile.value = '';
  });

  controller = { root, onKey };

  state.pxToM = Number(escalaInput.value) > 0 ? Number(escalaInput.value) : 0.05;
  fitZoom();
  draw();
  renderLists();
  updateToolUI();
}
