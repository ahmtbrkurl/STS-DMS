/**
 * STS-DMS — Kimlik/Belge/Vesikalık Yakalama Bileşeni (id-capture.js)
 * ================================
 * ÜÇ KULLANIM MODU:
 *
 * 1) Tek taraflı belge/görsel (guideType:'card'):
 *    STSIDCapture.attach(container, { label, hint, onCapture })
 *
 * 2) Vesikalık (guideType:'portrait', ön kamera, kafa/omuz kılavuzu,
 *    3:4 oranında otomatik kırpma):
 *    STSIDCapture.attach(container, {
 *      label, hint, guideType:'portrait', facingMode:'user', onCapture
 *    })
 *
 * 3) İki taraflı belge (kimlik/pasaport ön+arka) — iki ayrı çekim
 *    yaptırır ama ikisini OTOMATİK OLARAK TEK BİR GÖRSELDE (alt alta)
 *    birleştirip TEK dosya olarak döner:
 *    STSIDCapture.attachTwoSided(container, {
 *      frontLabel, backLabel, hint, onMerged
 *    })
 *
 * Her iki kamera modu da artık SADECE kılavuz çerçevesinin içini
 * kırpıp kaydediyor (tüm kare değil) — hem gereksiz arka plan gitmiş
 * oluyor hem de sonuç görsel kılavuzla birebir eşleşiyor.
 */

const STSIDCapture = (function () {
  let activeStream = null;

  // ============================================================
  // TEK ÇEKİM (kart/belge veya vesikalık)
  // ============================================================
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
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1440 }
          },
          audio: false
        })
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
        const dataUrl = isPortrait ? capturePortraitFrame(video) : captureCardFrame(video);
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

  // ============================================================
  // İKİ TARAFLI (ön+arka) — otomatik tek görselde birleştirme
  // ============================================================
  function attachTwoSided(container, options) {
    let frontData = null;
    let backData = null;

    container.innerHTML =
      '<div class="idcap-sides">' +
        '<div class="idcap-front-slot"></div>' +
        '<div class="idcap-back-slot"></div>' +
      '</div>' +
      '<div class="idcap-merge-status"></div>';

    const frontSlot = container.querySelector('.idcap-front-slot');
    const backSlot = container.querySelector('.idcap-back-slot');
    const statusEl = container.querySelector('.idcap-merge-status');

    attach(frontSlot, {
      label: options.frontLabel || 'Ön Yüz',
      hint: options.hint,
      guideType: 'card',
      onCapture: function (data) {
        frontData = data;
        tryMerge();
      }
    });

    attach(backSlot, {
      label: options.backLabel || 'Arka Yüz',
      hint: options.hint,
      guideType: 'card',
      onCapture: function (data) {
        backData = data;
        tryMerge();
      }
    });

    function tryMerge() {
      if (!frontData || !backData) {
        statusEl.textContent = '';
        return;
      }
      statusEl.textContent = 'Birleştiriliyor...';
      mergeStacked(
        'data:' + frontData.mimeType + ';base64,' + frontData.base64,
        'data:' + backData.mimeType + ';base64,' + backData.base64,
        function (mergedDataUrl) {
          const base64 = mergedDataUrl.split(',')[1];
          statusEl.textContent = '✓ Ön ve arka yüz tek görselde birleştirildi';
          options.onMerged({ base64: base64, mimeType: 'image/jpeg', extension: 'jpg' });
        }
      );
    }
  }

  // İki görseli dikey olarak (üstte ön, altta arka) tek canvas'ta birleştirir
  function mergeStacked(dataUrlTop, dataUrlBottom, callback) {
    const imgTop = new Image();
    const imgBottom = new Image();
    let loaded = 0;

    function onBothLoaded() {
      const width = Math.max(imgTop.width, imgBottom.width);
      const scaleTop = width / imgTop.width;
      const scaleBottom = width / imgBottom.width;
      const heightTop = imgTop.height * scaleTop;
      const heightBottom = imgBottom.height * scaleBottom;
      const gap = Math.round(width * 0.02);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = heightTop + gap + heightBottom;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imgTop, 0, 0, width, heightTop);
      ctx.drawImage(imgBottom, 0, heightTop + gap, width, heightBottom);

      callback(canvas.toDataURL('image/jpeg', 0.92));
    }

    imgTop.onload = function () { loaded++; if (loaded === 2) onBothLoaded(); };
    imgBottom.onload = function () { loaded++; if (loaded === 2) onBothLoaded(); };
    imgTop.src = dataUrlTop;
    imgBottom.src = dataUrlBottom;
  }

  // ============================================================
  // KILAVUZLAR ve KIRPILMIŞ ÇEKİM
  // ============================================================
  function renderPortraitGuideSvg() {
    return '<div class="idcap-guide-portrait">' +
      '<svg viewBox="0 0 200 280" class="idcap-portrait-svg" preserveAspectRatio="xMidYMid meet">' +
        '<ellipse cx="100" cy="95" rx="58" ry="75" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-dasharray="7 5"/>' +
        '<path d="M12,280 C12,188 55,163 100,163 C145,163 188,188 188,280" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-dasharray="7 5"/>' +
      '</svg>' +
    '</div>';
  }

  /**
   * Video elementi, CSS'te aspect-ratio:4/3 + object-fit:cover ile
   * gösteriliyor. Önce bu "kapak kırpması"nı native piksel uzayında
   * hesaplıyoruz, sonra o görünür kare içindeki kılavuz dikdörtgenini
   * (genişliğin %82'si, 1.586:1 kart oranı, ortalanmış) buluyoruz ve
   * SADECE o alanı kırpıp kaydediyoruz.
   */
  function captureCardFrame(video) {
    const containerAspect = 4 / 3;
    const vw = video.videoWidth, vh = video.videoHeight;
    let cw, ch, cx, cy;

    if (vw / vh > containerAspect) {
      ch = vh; cw = vh * containerAspect; cx = (vw - cw) / 2; cy = 0;
    } else {
      cw = vw; ch = vw / containerAspect; cx = 0; cy = (vh - ch) / 2;
    }

    const guideW = cw * 0.82;
    const guideH = guideW / 1.586;
    const guideX = cx + (cw - guideW) / 2;
    const guideY = cy + (ch - guideH) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = guideW;
    canvas.height = guideH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, guideX, guideY, guideW, guideH, 0, 0, guideW, guideH);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  /**
   * Vesikalık modu: video aspect-ratio:3/4 + object-fit:cover.
   * Kılavuz kutusu (genişliğin %62'si, yüksekliğin %82'si, ortalanmış)
   * neyse sadece o alan kırpılıp kaydedilir.
   */
  function capturePortraitFrame(video) {
    const containerAspect = 3 / 4;
    const vw = video.videoWidth, vh = video.videoHeight;
    let cw, ch, cx, cy;

    if (vw / vh > containerAspect) {
      ch = vh; cw = vh * containerAspect; cx = (vw - cw) / 2; cy = 0;
    } else {
      cw = vw; ch = vw / containerAspect; cx = 0; cy = (vh - ch) / 2;
    }

    const guideW = cw * 0.62;
    const guideH = ch * 0.82;
    const guideX = cx + (cw - guideW) / 2;
    const guideY = cy + (ch - guideH) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = guideW;
    canvas.height = guideH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, guideX, guideY, guideW, guideH, 0, 0, guideW, guideH);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  return { attach: attach, attachTwoSided: attachTwoSided };
})();
