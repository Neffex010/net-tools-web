# Roadmap

Estado al **2026-10-24** · versión actual del service worker: **1.0.3**

## ✅ Entregado

### Hito P1 — PWA versionada (v1.0.0 → v1.0.3)
- Service worker con `APP_VERSION` y caché `net-tools-web-<versión>`; limpieza de cachés antiguas en `activate`.
- Precache saneado: se eliminaron del precache los archivos vacíos o inexistentes (`css/components.css`, `js/utils.js` en su momento, `js/libs/fabric.min.js`, `js/libs/jspdf.umd.min.js`).
- Banner "Nueva versión disponible" con `SKIP_WAITING` y recarga controlada (sin recarga en el primer instalo). El service worker ya **no** se autoactiva en `install`: queda en espera hasta que el usuario confirma.
- Meta `ntw-version` sincronizada con `APP_VERSION`.

### Hito P2 — Integraciones entre módulos
- Conexiones → Pruebas y Etiquetas: selects `data-pr-conexion` / `data-etq-conexion` con autocompletado del enlace / nombre-ubicación.
- Dashboard con contadores de Conexiones y Etiquetas (además de Inventario y Pruebas).
- Exportación CSV con BOM UTF-8 para Inventario (`data-inv-csv`) y Conexiones (`data-cxn-csv`).

### Hito P3 — Utilidades compartidas
- `js/utils.js` real: `escapeHtml`, `uid`, `getList/loadPuntos/loadConexiones`, `todayStamp`, `downloadBlob/downloadText`, `buildCsv`, `makeMessage`, `pluralize`, `fillSelect`.
- Refactor de módulos (pruebas, etiquetas, inventario, conexiones) para eliminar helpers duplicados (CSV, descargas, mensajes, selects, plurales).

### Hito P4 — Suite de pruebas persistente
- `package.json` con `npm test` y `npm run serve`.
- `tests/server.js` (servidor estático Node puro) y `tests/e2e.spec.cjs` (Playwright): precache, dashboard, integraciones, CSV, búsqueda, modo offline, tema, menú móvil y ausencia de errores de consola. **35/35 PASS** con `npm test`.
- La versión del service worker se lee del propio archivo en la suite: ya no hay que actualizarla a mano en dos sitios.

### Hito P5 — Revisión de UX, lógica y accesibilidad (v1.0.3)
- Router: se descartan las respuestas de navegaciones antiguas (condición de carrera) y se espera la inicialización del módulo.
- Dashboard: las tarjetas de contadores enlazan a su módulo y aparece una guía de primer uso cuando la app está vacía.
- Inventario: al borrar un punto se avisa y se eliminan en cascada sus conexiones (sin enlaces huérfanos).
- Conexiones: búsqueda por punto, switch, puerto, panel, cable o notas.
- Planos: el historial de deshacer ya no se llena con clics de selección; el canvas se ajusta al ancho al entrar; selector de imagen propio en lugar del control nativo.
- Menú móvil: `inert`/`aria-hidden` cuando está cerrado, foco al abrir y al cerrar con `Escape`.
- Tema: sigue los cambios del sistema cuando no hay preferencia guardada.
- Utilidades: la fecha de los archivos usa hora local y la URL de descarga se revoca con retardo (evita cancelar descargas).
- Diagnóstico: las tarjetas ya no se estiran a la altura de su vecina; rejilla más equilibrada.
- Formularios de Pruebas, Conexiones y Etiquetas: máximo de 3–4 columnas en escritorio (antes 7–8 en una sola fila).
- Etiquetas: los IDs se generan a partir del mayor existente, sin reutilizar huecos.
- Configuración: el tamaño de los datos se mide en bytes UTF-8 reales.

## 🔜 Pendiente

### P6 — Publicación y pulido
- Publicar en GitHub Pages (rama `main`, raíz) y verificar el flujo de actualización en producción.
- Revisar `theme-color` por página e iconos maskable con zona segura.
- Añadir capturas al README (hecho) y mantenerlas al día.

### Funcional
- Integrar **Planos** con Inventario/Conexiones (asociar puntos a los elementos del plano) y persistencia opcional del canvas.
- Impresión/PDF de la hoja de etiquetas en tamaño real (jsPDF previsto; aún no se usa).
- Sincronización entre pestañas (`storage` event) para que el dashboard se actualice al vuelo.
- Revisión de accesibilidad pendiente: contraste en tema oscuro y recorrido completo con lector de pantalla.

### Técnica
- Migración opcional a IndexedDB para volúmenes grandes (localStorage ≈ 5 MB).
- Backend o sincronización remota opcional (fuera del alcance actual).
