# Guía de uso

## Abrir la app

El service worker (PWA) solo se registra sobre `http(s)`. Si abres `index.html` con doble clic (`file://`) la app funciona, pero **no** se instala ni tiene modo offline.

Opción 1 — Python:
```bash
python -m http.server 8080
```

Opción 2 — Node (sin instalar nada):
```bash
npm run serve
```

Luego abre `http://127.0.0.1:8080` en el navegador.

## Instalar como app (PWA)

- Chrome/Edge: icono **Instalar** en la barra de direcciones (o menú → "Instalar Net Tools Web").
- Una vez instalada, abre como ventana propia y funciona **sin conexión** (las páginas, scripts y datos usados quedan en caché).
- Los datos nuevos se guardan igual en `localStorage` y persisten entre usos.

## Flujo recomendado

1. **Inventario** — Registra los puntos de red (nombre, ubicación, estado). Úsalo para respaldar e importar datos en JSON.
2. **Conexiones** — Vincula un punto del inventario a switch/panel y asigna el cable.
3. **Pruebas** — Escribe el ID del enlace o elige una opción en **"O vincular una Conexión registrada"**: el enlace se autocompleta con el cable de esa conexión. Registra mapa, longitud, atenuación, NEXT y retorno; la app sugiere PASS/FAIL según los límites y genera un informe imprimible.
4. **Etiquetas** — Crea etiquetas (con QR) desde **"Usar un punto del Inventario"** o desde **"O etiquetar el cable de una Conexión"** y elige el número de columnas antes de imprimir.
5. **Dashboard** — Consulta los contadores de Inventario, Pruebas, Conexiones y Etiquetas.

## Exportar y respaldar

- **Inventario / Conexiones**: botón **Exportar** (JSON) para respaldo/restauración e **Exportar CSV** para hojas de cálculo.
- **Pruebas**: botón **CSV** (usa `,` como separador) y **Informe** para imprimir a PDF.
- **Importar**: Inventario re-importa un JSON propio: agrega los nuevos y actualiza los existentes por `id`.
- **CSV en Excel (es-MX)**: Inventario y Conexiones usan `;` + BOM UTF-8 → se abren directo sin configuración.

## Actualizaciones

Cuando se publique una versión nueva verás el banner **"Nueva versión disponible"**. Pulsa **"Actualizar ahora"** para recargar con la última versión. Si lo cierras, se volverá a mostrar en la siguiente visita. La caché se invalida automáticamente con el número de versión.

## Datos y privacidad

- Todo vive en tu navegador (`localStorage`, claves `ntw:*`). No hay servidor, por lo que nada sale de tu equipo.
- Para respaldar: exporta el JSON de Inventario y Conexiones.
- Para borrar todo: "Limpiar datos del sitio" en el navegador (o Datos → borrar las claves `ntw:*` desde las herramientas de desarrollador).