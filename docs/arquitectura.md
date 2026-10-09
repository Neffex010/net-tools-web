# Arquitectura

## Visión general

Aplicación de una sola página (SPA) construida con JavaScript vanilla (ES modules), HTML y CSS. Sin frameworks, sin backend y sin dependencias de runtime. Toda la persistencia es local (`localStorage`, namespace `ntw:`).

## Capas

```
index.html ── js/main.js ── js/router.js (enrutador por hash)
                 │
                 ├── js/store.js       → persistencia localStorage (ns ntw:)
                 ├── js/utils.js       → helpers compartidos
                 └── js/modules/*.js   → un módulo por página / sección
```

### Arranque y navegación

1. `index.html` carga `js/main.js` como módulo.
2. El router escucha cambios de hash (`#/seccion`) y carga la vista correspondiente de `pages/` en `#app`.
3. El módulo de la sección se autoejecuta si la vista ya está en el DOM y además escucha el evento `app:route-changed` para inicializarse al navegar.
4. Cada módulo expone `init()`, protege contra doble inicialización con `data-initialized` y opera solo dentro de su `[data-page="..."]`.

### store.js

Wrapper sobre `localStorage`: serializa a JSON con namespace `ntw:`, degrada con seguridad si el almacenamiento no está disponible y expone `get/set/remove/keys/clear`.

### utils.js (desde v1.0.1)

Helpers compartidos por los módulos: `escapeHtml`, `uid`, `getList`, `loadPuntos`, `loadConexiones`, `todayStamp`, `downloadBlob`, `downloadText`, `buildCsv` (BOM + entrecomillado), `makeMessage` (mensajes temporales con timeout), `pluralize` (español) y `fillSelect` (poblado de `<select>`).

### Esquema de datos (`ntw:*`)

- `ntw:inventario` — `[{ id, nombre, ubicacion, estado (pendiente|tendido|ponchado|probado), notas, creado }]`
- `ntw:conexiones` — `[{ id, punto (id del inventario), puntoNombre, switchId, puertoSwitch, panel, puertoPanel, cable, notas, creado }]`
- `ntw:etiquetas` — `[{ id, nombre, ubicacion }]`
- `ntw:pruebas` — `[{ id, link, mapa (OK|FAIL), longitud, atenuacion, next, retorno, resultado (PASS|FAIL), fecha }]`
- `planos` — **no persiste** en la store: el canvas vive en memoria y la exportación es PNG/JSON.

### Integraciones entre módulos

- **Conexiones → Pruebas / Etiquetas**: ambas páginas ofrecen un `<select>` alimentado con `loadConexiones()` (`data-pr-conexion` / `data-etq-conexion`). Al elegir, autocompletan el enlace (Pruebas) o nombre/ubicación (Etiquetas) con el cable y el punto de la conexión. Se deshabilitan cuando no hay conexiones guardadas.
- **Inventario → conexiones/etiquetas/pruebas/dashboard**: `fillSelect` puebla los selects de puntos; el dashboard cuenta ítems de la store.
- **Exportación**: `downloadText` + `buildCsv` generan JSON/CSV con nombre `*-ntw-AAAA-MM-DD.ext` y BOM para Excel.

## Service worker

- `APP_VERSION` da nombre a la caché: `net-tools-web-<versión>`.
- `install`: precarga lista explícita (`PRECACHE_URLS`) y hace `skipWaiting()`.
- `activate`: borra cachés que no coincidan con la versión actual y hace `clients.claim()`.
- `fetch`: `cache-first` para estáticos (`STATIC_PATTERN`), `network-first` con respaldo en caché para navegaciones; respuesta offline `503` como último recurso.
- `message`: escucha `SKIP_WAITING` para aplicar actualizaciones solicitadas desde el banner de `index.html`.
- `index.html` muestra el banner "Nueva versión disponible" cuando hay un `waiting`/`installing` con controlador previo; "Actualizar ahora" envía `SKIP_WAITING` y recarga solo si el usuario lo pidió (evita recargas en el primer instalo).

## Pruebas (v1.0.1)

`tests/` contiene una suite E2E ejecutable con `npm test`:

- `tests/server.js` — servidor HTTP estático mínimo en Node puro; también sirve la app con `npm run serve`.
- `tests/e2e.spec.cjs` — Playwright sobre un perfil limpio: verifica la instalación del SW (versión de caché, precache sin archivos vacíos, banner), siembra datos en `localStorage`, valida dashboard, vinculación de conexiones, CSVs (BOM + cabecera + contenido) y el modo offline.

## Notas de decisión

- Sin dependencias de runtime: las libs de terceros (qrcode) se cargan bajo demanda desde `js/libs/`.
- El CSV de Pruebas conserva `,` como separador (histórico); Inventario y Conexiones usan `;` para Excel es-MX.