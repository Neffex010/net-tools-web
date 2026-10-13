/* Arranque de tema.
 * Se carga de forma sincrónica desde <head> (antes de pintar) para evitar el
 * destello de tema incorrecto. Extraído de un <script> inline para cumplir con
 * la CSP del proyecto (script-src 'self', sin JS inline).
 */
(function () {
  try {
    var stored = localStorage.getItem('nt.theme');
    var isDark = stored
      ? stored === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', isDark);
  } catch (err) {
    /* localStorage no disponible: se usa el tema claro por defecto */
  }
})();
