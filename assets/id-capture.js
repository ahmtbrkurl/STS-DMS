/**
 * STS-DMS — Kimlik/Belge/Vesikalık Yakalama Bileşeni (id-capture.js)
 * ================================
 * İki mod destekler:
 * 1) guideType:'card' (varsayılan) — kimlik/pasaport gibi kart tipi
 *    belgeler için, arka kamera, kesikli dikdörtgen kılavuz.
 * 2) guideType:'portrait' — vesikalık fotoğraf için, ön kamera,
 *    kafa+omuz silüeti kılavuzu, çekim sonrası otomatik 3:4 (vesikalık
 *    oranı) kırpma yapılır.
 *
 * KULLANIM (kart/belge):
 * STSIDCapture.attach(containerElement, {
 *   label: 'Ön Yüz', hint: '...', onCapture: function(fileData) {...}
 * });
 *
 * KULLANIM (vesikalık):
 * STSIDCapture.attach(containerElement, {
 *   label: 'Vesikalık Fotoğraf', hint: 'Kafanızı ve omuzlarınızı çerçeveye hizalayın',
 *   guideType: 'portrait', facingMode: 'user',
 *   onCapture: function(fileData) {...}
 * });
 */

const STSIDCapture = (function () {
  let activeStream = null;

  function attach(container, options) {
    const isPortrait = options.guideType === 'portrait';
    render(options.existingPreview || null);

    function render(previewDataUrl) {
      container.innerHTML =
        '<div class="idcap-box">' +
          '<div class="idcap-label">' + escapeHtml(options.label) + '</div>' +
          (previewDataUrl
            ? '<img src="' + previewDataUrl + '" class="idcap-preview' + (isPortrait ? ' idcap-preview-portrait' : '') + '" alt="">'
            : '<div class="idcap-empty">' + escapeHtml(options.hint || '') + '</div>') +
          '<div class="idcap-actions">' +
            '<button type="button" class="btn btn-secondary idcap-camera-btn">📷 ' + (options.cameraLabel || 'Kamera ile Çek') + '</button>' +
            '<label class="btn btn-secondary idcap-upload-btn" style="cursor:pointer;">' +
              '📁 ' + (options.uploadLabel || 'Dosyadan Seç') +
              '<input type="file" accept="image/*" style="display:none" class="idcap-file-input">' +
            '</label>' +
          '</div>' +
        '</div>';

      container.querySelector('.idcap-camera-btn').addEventListener('click', openCameraModal);
      container.querySelector('.idcap-file-input').addEventListener('change', handleFileInput);
    }

    function handleFileInput(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        render(dataUrl);
        options.onCapture({ base64: base64, mimeType: file.type || 'image/jpeg', extension: ext });
      };
      reader.readAsDataURL(file);
    }

    function openCameraModal() {
      const modal = document.createElement('div');
      modal.className = 'idcap-modal';
      modal.innerHTML =
        '<div class="idcap-modal-inner">' +
          '<div class="idcap-modal-header">' + escapeHtml(options.label) + '</div>' +
          '<div class="idcap-video-wrap' + (isPortrait ? ' idcap-video-portrait' : '') + '">' +
            '<video autoplay playsinline muted class="idcap-video"></video>' +
            (isPortrait ? renderPortraitGuideSvg() : '<div class="idcap-guide"></div>') +
          '</div>' +
          '<div class="idcap-modal-hint">' + escapeHtml(options.hint || 'Belgeyi çerçeveye hizalayın') + '</div>' +
          '<div class="idcap-modal-actions">' +
            '<button type="button" class="btn btn-secondary idcap-cancel">İptal</button>' +
            '<button type="button" class="btn btn-primary idcap-shoot">Çek</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      const video = modal.querySelector('.idcap-video');
      const hintEl = modal.querySelector('.idcap-modal-hint');
      const facingMode = options.facingMode || (isPortrait ? 'user' : 'environment');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        hintEl.textContent = 'Bu tarayıcı kamera erişimini desteklemiyor. Lütfen dosyadan yükleyin.';
        modal.querySelector('.idcap-shoot').disabled = true;
      } else {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode }, audio: false })
          .then(function (stream) {
            activeStream = stream;
            video.srcObject = stream;
          })
          .catch(function (err) {
            hintEl.textContent = 'Kameraya erişilemedi (' + err.message + '). Lütfen dosyadan yükleyin.';
            modal.querySelector('.idcap-shoot').disabled = true;
          });
      }

      modal.querySelector('.idcap-cancel').addEventListener('click', closeModal);
      modal.querySelector('.idcap-shoot').addEventListener('click', function () {
        if (!video.videoWidth) return;
        const dataUrl = isPortrait ? capturePortraitFrame(video) : captureFullFrame(video);
        const base64 = dataUrl.split(',')[1];
        render(dataUrl);
        options.onCapture({ base64: base64, mimeType: 'image/jpeg', extension: 'jpg' });
        closeModal();
      });

      function closeModal() {
        if (activeStream) {
          activeStream.getTracks().forEach(function (t) { t.stop(); });
          activeStream = null;
        }
        if (modal.parentNode) document.body.removeChild(modal);
      }
    }
  }

  function renderPortraitGuideSvg() {
    return '<div class="idcap-guide-portrait">' +
      '<svg viewBox="0 0 200 280" class="idcap-portrait-svg" preserveAspectRatio="xMidYMid meet">' +
        '<ellipse cx="100" cy="95" rx="58" ry="75" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-dasharray="7 5"/>' +
        '<path d="M12,280 C12,188 55,163 100,163 C145,163 188,188 188,280" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-dasharray="7 5"/>' +
      '</svg>' +
    '</div>';
  }

  // Kart/belge modu: tam kare çekim (kılavuz sadece hizalama yardımcısıdır, kırpma yapılmaz)
  function captureFullFrame(video) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  // Vesikalık modu: 3:4 (standart vesikalık oranı) otomatik ortadan kırpma
  function capturePortraitFrame(video) {
    const targetRatio = 3 / 4; // genişlik/yükseklik
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    let sx, sy, sw, sh;

    if (vw / vh > targetRatio) {
      sh = vh;
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      sw = vw;
      sh = vw / targetRatio;
      sx = 0;
      sy = (vh - sh) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  return { attach: attach };
})();
