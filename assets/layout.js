/**
 * STS-DMS — Paylaşımlı Layout (layout.js)
 * ================================
 * Her HR paneli sayfası bu fonksiyonu çağırarak aynı sidebar + topbar'ı
 * (dil seçici, kullanıcı rozeti dahil) render eder. Böylece her sayfada
 * aynı HTML'i tekrar tekrar yazmaya gerek kalmaz.
 *
 * KULLANIM (her admin sayfasının en üstünde):
 * <div id="app-shell"></div>
 * <script>
 *   STSLayout.render({
 *     activeNav: 'dashboard',      // hangi menü öğesi vurgulanacak
 *     eyebrow: 'dashboard.eyebrow',
 *     title: 'dashboard.title'
 *   });
 * </script>
 */

const STSLayout = (function () {
  const NAV_ITEMS = [
    { key: 'dashboard', href: 'dashboard.html', icon: '📊', i18n: 'nav.dashboard', minRole: 'Görüntüleyici' },
    { key: 'groups', href: 'groups.html', icon: '👥', i18n: 'nav.groups', minRole: 'Görüntüleyici' },
    { key: 'forms', href: 'forms.html', icon: '🧩', i18n: 'nav.forms', minRole: 'Görüntüleyici' },
    { key: 'campaigns', href: 'campaigns.html', icon: '📣', i18n: 'nav.campaigns', minRole: 'Görüntüleyici' },
    { key: 'links', href: 'links.html', icon: '🔗', i18n: 'nav.links', minRole: 'Görüntüleyici' },
    { key: 'personnel', href: 'personnel.html', icon: '📄', i18n: 'nav.personnel', minRole: 'Görüntüleyici' },
    { key: 'logs', href: 'logs.html', icon: '🗒️', i18n: 'nav.logs', minRole: 'Görüntüleyici' },
    { key: 'settings', href: 'settings.html', icon: '⚙️', i18n: 'nav.settings', minRole: 'Admin' }
  ];

  function render(options) {
    STSAPI.requireLogin();
    const user = STSAPI.getUser();

    const navHtml = NAV_ITEMS
      .filter(item => STSAPI.hasRole(item.minRole))
      .map(item => {
        const activeClass = (item.key === options.activeNav) ? ' active' : '';
        return '<a href="' + item.href + '" class="' + activeClass.trim() + '">' +
          '<span class="icon">' + item.icon + '</span>' +
          '<span data-i18n="' + item.i18n + '"></span></a>';
      }).join('');

    const shell = document.getElementById('app-shell');
    shell.innerHTML =
      '<div class="app-shell">' +
        '<aside class="sidebar">' +
          '<div class="sidebar-brand">' +
            '<div class="sidebar-brand-badge">STS</div>' +
            '<div class="sidebar-brand-text">' +
              '<div class="title" data-i18n="app.name"></div>' +
              '<div class="subtitle" data-i18n="app.subtitle"></div>' +
            '</div>' +
          '</div>' +
          '<nav class="sidebar-nav">' + navHtml + '</nav>' +
        '</aside>' +
        '<div class="main">' +
          '<div class="topbar">' +
            '<div class="topbar-titles">' +
              '<div class="eyebrow" data-i18n="' + (options.eyebrow || 'dashboard.eyebrow') + '"></div>' +
              '<div class="page-title" data-i18n="' + options.title + '"></div>' +
            '</div>' +
            '<div class="topbar-actions">' +
              '<div class="lang-switch">' +
                '<button data-lang="TR" onclick="STSLayout.changeLang(\'TR\')">TR</button>' +
                '<button data-lang="RU" onclick="STSLayout.changeLang(\'RU\')">RU</button>' +
                '<button data-lang="EN" onclick="STSLayout.changeLang(\'EN\')">EN</button>' +
              '</div>' +
              '<div style="position:relative">' +
                '<div class="user-badge" onclick="STSLayout.toggleUserMenu()">' + (user ? user.username.substring(0, 2).toUpperCase() : '?') + '</div>' +
                '<div class="user-menu" id="user-menu">' +
                  '<div class="item" onclick="STSLayout.doLogout()" data-i18n="nav.logout"></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="content" id="page-content"></div>' +
        '</div>' +
      '</div>';

    STSI18N.applyToDom();
  }

  function changeLang(lang) {
    STSI18N.setLanguage(lang);
  }

  function toggleUserMenu() {
    document.getElementById('user-menu').classList.toggle('open');
  }

  async function doLogout() {
    await STSAPI.logout();
    window.location.href = 'login.html';
  }

  // Sayfa dışına tıklanınca kullanıcı menüsünü kapat
  document.addEventListener('click', function (e) {
    const menu = document.getElementById('user-menu');
    const badge = document.querySelector('.user-badge');
    if (menu && menu.classList.contains('open') && !menu.contains(e.target) && e.target !== badge) {
      menu.classList.remove('open');
    }
  });

  return {
    render: render,
    changeLang: changeLang,
    toggleUserMenu: toggleUserMenu,
    doLogout: doLogout
  };
})();
