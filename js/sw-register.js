/* Registro del service worker y banner de "nueva versión disponible".
 * Extraído de un <script> inline para cumplir con la CSP del proyecto
 * (script-src 'self', sin JS inline).
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    var updateWorker = null;
    var userRequestedUpdate = false;

    function showUpdateBanner(worker) {
      updateWorker = worker;
      var banner = document.getElementById('pwa-update');
      if (banner) banner.hidden = false;
    }

    navigator.serviceWorker.register('service-worker.js')
      .then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(reg.waiting);
          return;
        }
        reg.addEventListener('updatefound', function () {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(newWorker);
            }
          });
        });
      })
      .catch(function (err) {
        console.error('[pwa] No se pudo registrar el service worker:', err);
      });

    var updateBtn = document.getElementById('pwa-update-btn');
    if (updateBtn) {
      updateBtn.addEventListener('click', function () {
        if (!updateWorker) return;
        userRequestedUpdate = true;
        updateWorker.postMessage({ type: 'SKIP_WAITING' });
        updateBtn.disabled = true;
      });
    }

    var updateClose = document.getElementById('pwa-update-close');
    if (updateClose) {
      updateClose.addEventListener('click', function () {
        var banner = document.getElementById('pwa-update');
        if (banner) banner.hidden = true;
        updateWorker = null;
      });
    }

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (userRequestedUpdate) {
        window.location.reload();
      }
    });
  });
}
