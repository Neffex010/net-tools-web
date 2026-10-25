/**
 * e2e.spec.cjs — Suite E2E persistente de Net Tools Web.
 *
 * Cubre PWA (service worker versionado, precache, banner de actualización,
 * modo offline), integraciones entre módulos (Conexiones -> Pruebas/Etiquetas),
 * dashboard (contadores), exportación CSV (BOM + cabeceras) y ausencia de
 * errores de consola.
 *
 * Ejecución: npm test
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { createTestServer } = require('./server.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SW_SOURCE = fs.readFileSync(path.join(PROJECT_ROOT, 'service-worker.js'), 'utf8');
const APP_VERSION = (/APP_VERSION\s*=\s*'([^']+)'/.exec(SW_SOURCE) || [])[1];
const CACHE_NAME = 'net-tools-web-' + APP_VERSION;
const results = [];

function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra });
}

(async () => {
  const server = createTestServer(PROJECT_ROOT);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch();

  try {
    // ---- Service worker: versión, precache y banner ----
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push('console: ' + msg.text());
    });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(800);

    const swState = await page.evaluate(async (cacheName) => {
      const keys = await caches.keys();
      const cache = await caches.open(cacheName);
      const urls = (await cache.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, ''));
      return {
        keys,
        urls,
        meta: document.querySelector('meta[name="ntw-version"]')
          ? document.querySelector('meta[name="ntw-version"]').content
          : null,
        bannerHidden: document.getElementById('pwa-update')
          ? document.getElementById('pwa-update').hidden
          : null,
      };
    }, CACHE_NAME);

    check('Cache ' + CACHE_NAME + ' presente', swState.keys.includes(CACHE_NAME));
    check('Solo queda la cache de la version actual', swState.keys.every((name) => name === CACHE_NAME), swState.keys);
    check('meta ntw-version = ' + APP_VERSION, swState.meta === APP_VERSION);
    check('Banner de actualizacion oculto', swState.bannerHidden === true);
    check('Precache contiene js/utils.js', swState.urls.includes('js/utils.js'));
    const hasEmpty = ['css/components.css', 'js/libs/fabric.min.js', 'js/libs/jspdf.umd.min.js'].some((f) =>
      swState.urls.includes(f)
    );
    check('Precache SIN archivos vacios', !hasEmpty);
    check(
      'Precache contiene index.html e iconos',
      swState.urls.includes('index.html') && swState.urls.includes('assets/icons/icon-512.png')
    );
    check('Titulo dinamico por seccion (Dashboard)', (await page.title()) === 'Dashboard · Net Tools Web');

    // ---- Datos de prueba ----
    await page.evaluate(() => {
      localStorage.setItem(
        'ntw:inventario',
        JSON.stringify([
          { id: 'p1', nombre: 'P-001', ubicacion: 'Oficina 204', estado: 'ponchado', notas: '', creado: '2026-10-01T00:00:00.000Z' },
        ])
      );
      localStorage.setItem(
        'ntw:conexiones',
        JSON.stringify([
          { id: 'c1', punto: 'p1', puntoNombre: 'P-001', switchId: 'SW-01', puertoSwitch: 'Gi1/0/1', panel: 'PP-A', puertoPanel: '1', cable: 'C-001', notas: '', creado: '2026-10-02T00:00:00.000Z' },
        ])
      );
      localStorage.setItem(
        'ntw:etiquetas',
        JSON.stringify([
          { id: 'E-001', nombre: 'C-001', ubicacion: 'Oficina 204' },
          { id: 'E-002', nombre: 'C-002', ubicacion: 'Sala 1' },
        ])
      );
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);

    // ---- Dashboard ----
    const dash = await page.evaluate(() => ({
      inv: document.querySelector('[data-dash-inventario]') ? document.querySelector('[data-dash-inventario]').textContent : null,
      pru: document.querySelector('[data-dash-pruebas]') ? document.querySelector('[data-dash-pruebas]').textContent : null,
      cxn: document.querySelector('[data-dash-conexiones]') ? document.querySelector('[data-dash-conexiones]').textContent : null,
      etq: document.querySelector('[data-dash-etiquetas]') ? document.querySelector('[data-dash-etiquetas]').textContent : null,
    }));
    check('Dashboard: 4 tiles con contadores correctos', dash.inv === '1' && dash.pru === '0' && dash.cxn === '1' && dash.etq === '2', dash);

    // ---- Pruebas: vincular Conexión ----
    await page.click('a[data-route="pruebas"]');
    await page.waitForTimeout(400);
    const pr = await page.evaluate(() => {
      const sel = document.getElementById('pr-conexion');
      if (!sel) return null;
      return { exists: true, disabled: sel.disabled, hasCable: [...sel.options].some((o) => o.textContent === 'C-001 — P-001') };
    });
    check('Pruebas: select data-pr-conexion existe y habilitado', pr && pr.exists && !pr.disabled, pr);
    check('Pruebas: select lista la conexion', pr && pr.hasCable);
    await page.selectOption('#pr-conexion', 'c1');
    const linkVal = await page.evaluate(() => document.querySelector('[data-pr-link]').value);
    check('Pruebas: autocompleta link con C-001', linkVal === 'C-001', linkVal);

    // ---- Etiquetas: vincular Conexión + contador plural ----
    await page.click('a[data-route="etiquetas"]');
    await page.waitForTimeout(400);
    const etq = await page.evaluate(() => {
      const sel = document.getElementById('etq-conexion');
      return {
        exists: !!sel,
        hasCable: sel ? [...sel.options].some((o) => o.textContent === 'C-001 — P-001') : false,
        count: document.querySelector('[data-etq-count]') ? document.querySelector('[data-etq-count]').textContent.trim() : null,
      };
    });
    check('Etiquetas: select data-etq-conexion lista la conexion', etq.exists && etq.hasCable);
    check('Etiquetas: contador pluraliza correctamente (2 etiquetas)', etq.count === '2 etiquetas', etq.count);
    await page.selectOption('#etq-conexion', 'c1');
    const etqVals = await page.evaluate(() => ({
      nombre: document.querySelector('[data-etq-nombre]') ? document.querySelector('[data-etq-nombre]').value : null,
      ubicacion: document.querySelector('[data-etq-ubicacion]') ? document.querySelector('[data-etq-ubicacion]').value : null,
    }));
    check('Etiquetas: autocompleta nombre=C-001 ubicacion=P-001', etqVals.nombre === 'C-001' && etqVals.ubicacion === 'P-001', etqVals);

    // ---- Inventario: CSV ----
    await page.click('a[data-route="inventario"]');
    await page.waitForTimeout(400);
    check('Inventario: boton Exportar CSV existe', await page.evaluate(() => !!document.querySelector('[data-inv-csv]')));
    const [dlInv] = await Promise.all([page.waitForEvent('download'), page.click('[data-inv-csv]')]);
    const invName = dlInv.suggestedFilename();
    const invContent = fs.readFileSync(await dlInv.path(), 'utf8');
    check(
      'Inventario: CSV inventario-ntw-*.csv con BOM y cabecera',
      /^inventario-ntw-.*\.csv$/.test(invName) && invContent.startsWith('\uFEFF') && invContent.includes('Nombre;Ubicacion;Estado;Notas;Creado'),
      invName
    );
    check('Inventario: CSV contiene P-001 y Oficina 204', invContent.includes('P-001') && invContent.includes('Oficina 204'));

    // ---- Conexiones: CSV ----
    await page.click('a[data-route="conexiones"]');
    await page.waitForTimeout(400);
    check('Conexiones: boton Exportar CSV existe', await page.evaluate(() => !!document.querySelector('[data-cxn-csv]')));
    const [dlCxn] = await Promise.all([page.waitForEvent('download'), page.click('[data-cxn-csv]')]);
    const cxnContent = fs.readFileSync(await dlCxn.path(), 'utf8');
    check('Conexiones: CSV con BOM y cabecera', cxnContent.startsWith('\uFEFF') && cxnContent.includes('Id;Punto;Nombre punto;Switch'));
    check('Conexiones: CSV contiene C-001 y SW-01', cxnContent.includes('C-001') && cxnContent.includes('SW-01'));

    // ---- Conexiones: búsqueda ----
    check('Conexiones: campo de búsqueda presente', await page.evaluate(() => !!document.querySelector('[data-cxn-search]')));
    await page.fill('[data-cxn-search]', 'sw-01');
    const filteredRows = await page.evaluate(() => document.querySelectorAll('[data-cxn-body] tr').length);
    check('Conexiones: la búsqueda filtra por switch', filteredRows === 1, filteredRows);
    await page.fill('[data-cxn-search]', 'zzz');
    const noMatch = await page.evaluate(() => ({
      rows: document.querySelectorAll('[data-cxn-body] tr').length,
      empty: document.querySelector('[data-cxn-empty]').hidden === false,
    }));
    check('Conexiones: búsqueda sin resultados avisa', noMatch.rows === 0 && noMatch.empty, noMatch);
    await page.fill('[data-cxn-search]', '');

    // ---- Offline ----
    await context.setOffline(true);
    await page.goto(BASE + '#/estandares', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(800);
    const offlineOk = await page.evaluate(
      () =>
        !!document.querySelector('[data-page="estandares"]') ||
        document.body.textContent.includes('Estandares') ||
        document.body.textContent.includes('Estándares')
    );
    check('Offline: pagina estandares carga desde cache', offlineOk);
    await context.setOffline(false);

    // ---- Planos: el canvas se ajusta al ancho disponible ----
    await page.goto(BASE + '#/planos', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const fit = await page.evaluate(() => {
      const canvas = document.querySelector('[data-pl-canvas]');
      const wrap = document.querySelector('[data-pl-canvas-wrap]');
      if (!canvas || !wrap) return null;
      return { canvas: Math.round(canvas.getBoundingClientRect().width), wrap: wrap.clientWidth };
    });
    check('Planos: canvas ajustado al ancho disponible', !!fit && fit.canvas <= fit.wrap + 1, fit);

    // ---- Dashboard: tarjetas enlazadas y guia de primer uso ----
    await page.goto(BASE + '#/dashboard', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const dashLinks = await page.evaluate(() => ({
      hrefs: Array.from(document.querySelectorAll('.stats a.stat')).map((a) => a.getAttribute('href')),
      hintHidden: document.querySelector('[data-dash-hint]').hidden,
    }));
    check(
      'Dashboard: tarjetas enlazan a Inventario/Pruebas/Conexiones/Etiquetas',
      dashLinks.hrefs.join(',') === '#/inventario,#/pruebas,#/conexiones,#/etiquetas',
      dashLinks.hrefs
    );
    check('Dashboard: guia de primer uso oculta si hay datos', dashLinks.hintHidden === true);

    // ---- Inventario: borrar un punto elimina sus conexiones ----
    await page.goto(BASE + '#/inventario', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    page.once('dialog', (dialog) => dialog.accept());
    await page.click('[data-delete="p1"]');
    await page.waitForTimeout(300);
    const afterDelete = await page.evaluate(() => ({
      inventario: JSON.parse(localStorage.getItem('ntw:inventario') || '[]').length,
      conexiones: JSON.parse(localStorage.getItem('ntw:conexiones') || '[]').length,
    }));
    check(
      'Inventario: borrar punto elimina sus conexiones',
      afterDelete.inventario === 0 && afterDelete.conexiones === 0,
      afterDelete
    );

    // ---- Dashboard vacio: guia de primer uso visible ----
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '#/dashboard', { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const emptyDash = await page.evaluate(() => ({
      hintVisible: !document.querySelector('[data-dash-hint]').hidden,
      inv: document.querySelector('[data-dash-inventario]').textContent,
    }));
    check('Dashboard: guia visible con la app vacia', emptyDash.hintVisible && emptyDash.inv === '0', emptyDash);

    // ---- Tema: sigue al sistema si no hay preferencia guardada ----
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(300);
    const themeDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForTimeout(250);
    const themeLight = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    check('Tema: sigue al sistema sin preferencia guardada', themeDark === true && themeLight === false, {
      themeDark,
      themeLight,
    });

    // ---- Menu movil: inert y foco ----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    const menuClosed = await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      return {
        inert: sidebar.inert,
        ariaHidden: sidebar.getAttribute('aria-hidden'),
        expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'),
      };
    });
    check('Menu movil: cerrado queda inert', menuClosed.inert === true && menuClosed.ariaHidden === 'true', menuClosed);
    await page.click('#menu-toggle');
    const menuOpen = await page.evaluate(() => ({
      inert: document.getElementById('sidebar').inert,
      expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'),
      focusInside: document.getElementById('sidebar').contains(document.activeElement),
    }));
    check(
      'Menu movil: abrir lo activa y mueve el foco',
      menuOpen.inert === false && menuOpen.expanded === 'true' && menuOpen.focusInside === true,
      menuOpen
    );
    await page.keyboard.press('Escape');
    const menuReclosed = await page.evaluate(() => ({
      inert: document.getElementById('sidebar').inert,
      focusOnToggle: document.activeElement === document.getElementById('menu-toggle'),
    }));
    check(
      'Menu movil: Escape cierra y devuelve el foco',
      menuReclosed.inert === true && menuReclosed.focusOnToggle === true,
      menuReclosed
    );
    await page.setViewportSize({ width: 1280, height: 720 });

    const pageErrors = errors.filter((e) => !e.toLowerCase().includes('favicon'));
    check('Sin errores de consola', pageErrors.length === 0, pageErrors);

    await context.close();
  } finally {
    await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }

  let pass = 0;
  let fail = 0;
  for (const r of results) {
    if (r.ok) {
      pass += 1;
      console.log('PASS ' + r.name);
    } else {
      fail += 1;
      console.log('FAIL ' + r.name + (r.extra !== undefined ? ' | ' + JSON.stringify(r.extra) : ''));
    }
  }
  console.log('\n' + pass + '/' + (pass + fail) + ' PASS');
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error('ERROR', err);
  process.exit(2);
});