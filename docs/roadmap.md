# Roadmap

Estado al **2026-10-09** · versión actual del service worker: **1.0.1**

## ✅ Entregado

### Hito P1 — PWA versionada (v1.0.0 → v1.0.1)
- Service worker con `APP_VERSION` y caché `net-tools-web-<versión>`; limpieza de cachés antiguas en `activate`.
- Precache saneado: se eliminaron del precache los archivos vacíos o inexistentes (`css/components.css`, `js/utils.js` en su momento, `js/libs/fabric.min.js`, `js/libs/jspdf.umd.min.js`).
- Banner "Nueva versión disponible" con `SKIP_WAITING` y recarga controlada (sin recarga en primer instalo).
- Meta `ntw-version` sincronizada con `APP_VERSION`.

### Hito P2 — Integraciones entre módulos
- Conexiones → Pruebas y Etiquetas: selects `data-pr-conexion` / `data-etq-conexion` con autocompletado del enlace / nombre-ubicación.
- Dashboard con contadores de Conexiones y Etiquetas (además de Inventario y Pruebas).
- Exportación CSV con BOM UTF-8 para Inventario (`data-inv-csv`) y Conexiones (`data-cxn-csv`).

### Hito P3 — Utilidades compartidas
- `js/utils.js` real: `escapeHtml`, `uid`, `getList/loadPuntos/loadConexiones`, `todayStamp`, `downloadBlob/downloadText`, `buildCsv`, `makeMessage`, `pluralize`, `fillSelect`.
- Refactor de módulos (pruebas, etiquetas, inventario, conexiones) para eliminar helpers duplicados (CSV, descargas, mensajes, selects, plurales). Regresión E2E 22/22.

### Hito P4 — Suite de pruebas persistente
- `package.json` con `npm test` y `npm run serve`.
- `tests/server.js` (servidor estático Node puro) y `tests/e2e.spec.cjs` (Playwright): precache, dashboard, integraciones, CSV y modo offline. **22/22 PASS** con `npm test`.

## 🔜 Pendiente

### P6 — Publicación y pulido
- `git init` + commits iniciales y `.gitignore` (ya creado para `node_modules/`).
- Favicon maskable / mejor integración de instalación (ya existentes: icon-192/512) y revisar `theme-color` por página.
- Hosting estático (GitHub Pages, Netlify, etc.) y verificación del flujo de actualización en producción.

### Funcional
- Integrar **Planos** con Inventario/Conexiones (asociar puntos a los elementos del plano) y persistencia opcional del canvas.
- Impresión/PDF de la hoja de etiquetas en tamaño real (jsPDF previsto en fase 7; aún no se usa).
- Sincronización entre pestañas (`storage` event) para que el dashboard se actualice al vuelo.
- Reseña de accesibilidad: contraste, foco y lectores de pantalla en todos los módulos.

### Técnica
- Migración opcional a IndexedDB para volúmenes grandes (localStorage ≈ 5 MB).
- Backend o sincronización remota opcional (fuera del alcance actual).