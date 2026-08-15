/**
 * STS-DMS — API Katmanı (api.js)
 * ================================
 * Backend (Google Apps Script Web App) ile tüm iletişim buradan geçer.
 * Oturum token'ı localStorage'da saklanır, sayfa yenilendiğinde korunur.
 *
 * KULLANIM:
 * const result = await STSAPI.call('groups.list');
 * const result = await STSAPI.call('groups.create', { name: 'FORMEN' });
 *
 * Auth gerektirmeyen (public) çağrılar için de aynı fonksiyon kullanılır,
 * token varsa otomatik eklenir, yoksa sorun olmaz.
 */

const STSAPI = (function () {
  // ÖNEMLİ: Deploy sonrası aldığınız gerçek Web App URL'ini buraya yazın.
  const BASE_URL = 'https://script.google.com/macros/s/AKfycbzztkmZ4T4BbxxrD2-0fxK7I8s77nyBcRA49kfjLg1G7JDe_MQszFnTj-0JjKPIaQJx3g/exec';

  const TOKEN_KEY = 'sts_dms_token';
  const USER_KEY = 'sts_dms_user';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* yoksay */ }
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) { /* yoksay */ }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) { /* yoksay */ }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  /**
   * Ana API çağrı fonksiyonu.
   * action: örn. 'groups.list'
   * payload: gövdeye eklenecek ek alanlar (action ve token otomatik eklenir)
   */
  async function call(action, payload) {
    const body = Object.assign({ action: action, token: getToken() }, payload || {});

    let res;
    try {
      res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // CORS preflight'ı önlemek için
        body: JSON.stringify(body)
      });
    } catch (networkErr) {
      return { ok: false, error: 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.' };
    }

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { return { ok: false, error: 'Sunucudan geçersiz yanıt.' }; }

    // Oturum süresi dolmuşsa merkezi olarak yönlendir
    if (json.ok === false && json.error && json.error.indexOf('Oturum geçersiz') !== -1) {
      clearSession();
      if (window.location.pathname.indexOf('/admin/') !== -1 &&
          window.location.pathname.indexOf('login.html') === -1) {
        window.location.href = 'login.html';
      }
    }

    return json;
  }

  async function login(username, password) {
    const result = await call('login', { username: username, password: password });
    if (result.ok) {
      setToken(result.token);
      setUser(result.user);
    }
    return result;
  }

  async function logout() {
    await call('logout');
    clearSession();
  }

  function requireLogin() {
    if (!isLoggedIn()) {
      window.location.href = 'login.html';
    }
  }

  // Rol kontrolü: HR sayfaları belirli bir minimum rol gerektirebilir
  const ROLE_LEVEL = { 'Görüntüleyici': 1, 'HR': 2, 'Admin': 3 };

  function hasRole(minRole) {
    const user = getUser();
    if (!user) return false;
    return (ROLE_LEVEL[user.role] || 0) >= (ROLE_LEVEL[minRole] || 99);
  }

  return {
    call: call,
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    requireLogin: requireLogin,
    getUser: getUser,
    hasRole: hasRole
  };
})();
