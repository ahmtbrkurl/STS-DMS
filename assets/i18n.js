/**
 * STS-DMS — Dil Sistemi (i18n.js)
 * ================================
 * TR / RU / EN dillerini yönetir. Seçilen dil localStorage'da
 * saklanır, sayfa yenilendiğinde korunur.
 *
 * KULLANIM:
 * 1. Bu dosyayı sayfaya dahil edin: <script src="/assets/js/i18n.js"></script>
 * 2. Sayfa yüklendiğinde: await STSI18N.init();
 * 3. Metin göstermek için HTML'de: <span data-i18n="nav.dashboard"></span>
 *    STSI18N.applyToDom() bunları otomatik doldurur.
 * 4. JS içinde çeviri almak için: STSI18N.t('nav.dashboard')
 * 5. Dil değiştirmek için: STSI18N.setLanguage('EN')
 */

const STSI18N = (function () {
  const SUPPORTED_LANGUAGES = ['TR', 'RU', 'EN'];
  const STORAGE_KEY = 'sts_dms_language';
  const ASSET_BASE = getAssetBase();

  let currentLang = 'TR';
  let translations = {};
  let listeners = [];

  function getAssetBase() {
    // Bu script /assets/js/i18n.js altında olduğu için, hangi derinlikte
    // çağrılırsa çağrılsın doğru mutlak yolu bulmaya çalışır.
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf('i18n.js') !== -1) {
        return scripts[i].src.replace(/assets\/js\/i18n\.js.*$/, 'assets/');
      }
    }
    return '/assets/';
  }

  async function loadLanguageFile(lang) {
    const url = ASSET_BASE + 'i18n/' + lang.toLowerCase() + '.json';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Dil dosyası yüklenemedi: ' + lang);
    return res.json();
  }

  function getStoredLanguage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED_LANGUAGES.indexOf(stored) !== -1) return stored;
    } catch (e) { /* localStorage erişilemez olabilir, sorun değil */ }
    return null;
  }

  function storeLanguage(lang) {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* yoksay */ }
  }

  async function init() {
    const lang = getStoredLanguage() || 'TR';
    await setLanguage(lang, /* skipRerender */ true);
    applyToDom();
  }

  async function setLanguage(lang, skipRerender) {
    if (SUPPORTED_LANGUAGES.indexOf(lang) === -1) lang = 'TR';
    translations = await loadLanguageFile(lang);
    currentLang = lang;
    storeLanguage(lang);
    if (!skipRerender) applyToDom();
    listeners.forEach(fn => fn(lang));
  }

  function t(key, fallback) {
    return (translations && translations[key] !== undefined) ? translations[key] : (fallback || key);
  }

  function applyToDom() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('.lang-switch button').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
    });
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function getCurrentLanguage() {
    return currentLang;
  }

  return {
    init: init,
    setLanguage: setLanguage,
    t: t,
    applyToDom: applyToDom,
    onChange: onChange,
    getCurrentLanguage: getCurrentLanguage,
    SUPPORTED_LANGUAGES: SUPPORTED_LANGUAGES
  };
})();
