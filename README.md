# Net Tools Web

App web 100% frontend para redes, cableado, ponchado e instalación.
Sin backend, sin base de datos y sin frameworks: los datos viven en `localStorage` (claves `ntw:*`) o en archivos JSON exportados por el usuario. Incluye PWA instalable y funcionamiento sin conexión.

## Secciones

| Sección | Qué hace |
|---|---|
| Dashboard | Resumen con contadores de Inventario, Pruebas, Conexiones y Etiquetas. |
| Ponchado | Guía de colores y estándares de ponchado (T568A/T568B). |
| Calculadoras | Herramientas de cálculo para cableado e instalación. |
| Planos | Diseño de planos en canvas; exportación a PNG/JSON (en memoria, no persiste en almacenamiento). |
| Inventario | CRUD de puntos de red: filtros por estado, búsqueda, exportar/importar JSON y exportar CSV. |
| Conexiones | Vinculación punto ↔ switch/panel con cable; exportar JSON y CSV. |
| Etiquetas | Etiquetas con código QR imprimibles; se crean desde un punto del Inventario o desde una Conexión. |
| Pruebas | Certificación de enlaces con límites de referencia (longitud, atenuación, NEXT, retorno); informe imprimible y CSV. |
| Estándares | Consulta de estándares de cableado. |
| Diagnóstico | Herramienta de diagnóstico de red. |
| Configuración | Preferencias de la app. |
| Ayuda | Documentación de uso. |

## PWA

- `service-worker.js` versionado: la caché se nombra `net-tools-web-<versión>` y las cachés antiguas se eliminan al activar.
- Precarga completa de páginas, JS, CSS, datos y plantillas; `cache-first` para estáticos y `network-first` con respaldo offline para navegaciones.
- Al publicar una nueva versión aparece el banner **"Nueva versión disponible"** con botón **"Actualizar ahora"**.
- La versión se declara en `APP_VERSION` (service-worker.js) y debe coincidir con `<meta name="ntw-version">` de `index.html`.

## Ejecución

El service worker solo se registra sobre `http(s)`. Abrir `index.html` con `file://` funciona, pero sin PWA ni modo offline.

```bash
# Opción 1 (Python)
python -m http.server 8080

# Opción 2 (Node, sin dependencias)
npm run serve
```

Luego abre `http://127.0.0.1:8080`.

## Pruebas

Suite E2E con Playwright + servidor HTTP propio de Node (sin dependencias extra):

```bash
npm install   # instala Playwright (devDependency)
npm test      # corre tests/e2e.spec.cjs
```

La suite levanta el servidor en un puerto efímero, instala el service worker en un perfil limpio y verifica: precache versionado, banner de actualización, dashboard, vinculación Conexiones → Pruebas/Etiquetas, exportaciones CSV con BOM, modo offline y ausencia de errores de consola.

## Estructura

```
assets/     -> íconos, imágenes, fuentes
css/        -> estilos (reset, variables, temas, layout)
js/         -> main.js (arranque), router.js (SPA), store.js (datos), utils.js (helpers), modules/, libs/
pages/      -> vistas de la SPA
data/       -> JSON estáticos (colores, estándares, glosario)
templates/  -> plantillas para etiquetas e informes (impresión)
tests/      -> suite E2E persistente (server.js + e2e.spec.cjs)
docs/       -> documentación del proyecto
projects/   -> proyectos exportados por el usuario
```

## Notas

- Los CSV de Inventario y Conexiones usan `;` + BOM UTF-8 (abren directo en Excel es-MX). El CSV del módulo Pruebas se genera con `,`.
- Para versionar un cambio futuro: subir `APP_VERSION` en `service-worker.js` y el meta `ntw-version` en `index.html`.
- Más detalles en [docs/arquitectura.md](docs/arquitectura.md), [docs/guia-uso.md](docs/guia-uso.md) y [docs/roadmap.md](docs/roadmap.md).