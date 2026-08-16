/**
 * STS-DMS — Global Yükleme Göstergesi (loading.js)
 * ================================
 * Tam ekran, karartılmış arka planlı, ortada dönen bir yükleme
 * göstergesi. Sayaç tabanlıdır (birden fazla istek aynı anda
 * sürüyorsa hepsi bitene kadar gizlenmez).
 *
 * KULLANIM: STSLoading.show(); ... STSLoading.hide();
 * (api.js zaten her STSAPI.call() etrafında bunu otomatik yapar,
 * ayrıca elle de çağırabilirsiniz.)
 */

const STSLoading = (function () {
  let count = 0;
  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'sts-loading-overlay';
    overlay.innerHTML = '<div class="sts-loading-spinner"></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function show() {
    count++;
    ensureOverlay().classList.add('show');
  }

  function hide() {
    count = Math.max(0, count - 1);
    if (count === 0 && overlay) {
      overlay.classList.remove('show');
    }
  }

  function forceHide() {
    count = 0;
    if (overlay) overlay.classList.remove('show');
  }

  return { show: show, hide: hide, forceHide: forceHide };
})();
