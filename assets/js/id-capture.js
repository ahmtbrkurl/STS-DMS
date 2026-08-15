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
 * ODAKLAMA (GÜNCEL): Kamera açıldığında sürekli otomatik odaklama
 * (continuous autofocus) istenir, cihaz destekliyorsa uygulanır.
 * Çekim butonu kamera aktive olduktan ~1 saniye sonra aktif olur
 * (otomatik odaklamanın oturması için). Video'ya dokunmak/tıklamak,
 * destekleyen cihazlarda yeniden odaklamayı tetikler.
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
          '<div class="idcap-modal-hint">Kamera açılıyor...</div>' +
          '<div class="idcap-modal-actions">' +
            '<button type="button" class="btn btn-secondary idcap-cancel">İptal</button>' +
            '<button type="button" class="btn btn-secondary idcap-refocus">🎯 Odakla</button>' +
            '<button type="button" class="btn btn-primary idcap-shoot" disabled>Odaklanıyor...</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      const video = modal.querySelector('.idcap-video');
      const hintEl = modal.querySelector('.idcap-modal-hint');
      const shootBtn = modal.querySelector('.idcap-shoot');
      const refocusBtn = modal.querySelector('.idcap-refocus');
      const facingMode = options.facingMode || (isPortrait ? 'user' : 'environment');
      let currentTrack = null;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        hintEl.textContent = 'Bu tarayıcı kamera erişimini desteklemiyor. Lütfen dosyadan yükleyin.';
        shootBtn.textContent = 'Çek';
      } else {
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode,
            width: { ideal: 2560 },
            height: { ideal: 1920 },
            // Bazı tarayıcılar (özellikle Chrome/Android) bu ipucunu dikkate alır
            advanced: [{ focusMode: 'continuous' }]
          },
          audio: false
        })
          .then(function (stream) {
            activeStream = stream;
            video.srcObject = stream;
            currentTrack = stream.getVideoTracks()[0];
            tryEnableContinuousFocus(currentTrack);

            hintEl.textContent = 'Odaklanılıyor, sabit tutun...';
            // Otomatik odaklamanın oturması için kısa bir bekleme —
            // bu süre boyunca çekim butonu kapalı tutulur.
            setTimeout(function () {
              shootBtn.disabled = false;
              shootBtn.textContent = 'Çek';
              hintEl.textContent = options.hint || 'Belgeyi çerçeveye hizalayın';
            }, 1500);
          })
          .catch(function (err) {
            hintEl.textContent = 'Kameraya erişilemedi (' + err.message + '). Lütfen dosyadan yükleyin.';
            shootBtn.disabled = true;
          });

        // Video'ya dokunmak/tıklamak yeniden odaklamayı dener (destekleyen cihazlarda)
        video.addEventListener('click', function () {
          if (currentTrack) refocus(currentTrack, hintEl, options.hint);
        });
      }

      modal.querySelector('.idcap-cancel').addEventListener('click', closeModal);

      refocusBtn.addEventListener('click', function () {
        if (currentTrack) {
          refocus(currentTrack, hintEl, options.hint);
        } else {
          hintEl.textContent = 'Kamera henüz hazır değil.';
        }
      });

      shootBtn.addEventListener('click', function () {
        if (!video.videoWidth || shootBtn.disabled) return;
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

  // Sürekli otomatik odaklamayı, stream başladıktan sonra da (bazı tarayıcılar
  // bunu getUserMedia constraint'inde değil, applyConstraints ile kabul eder) dener.
  function tryEnableContinuousFocus(track) {
    if (!track || !track.getCapabilities) return;
    try {
      const caps = track.getCapabilities();
      if (caps.focusMode && caps.focusMode.indexOf('continuous') !== -1) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
      }
    } catch (e) { /* desteklenmiyor, sorun değil — cihazın kendi otomatik odaklaması çalışır */ }
  }

  // Dokunma/buton ile yeniden odaklama — tek seferlik odaklama tetikler
  // (destekleyen cihazlarda). Desteklenmiyorsa kullanıcıya açıkça söyler.
  function refocus(track, hintEl, originalHint) {
    if (!track || !track.getCapabilities) {
      hintEl.textContent = 'Bu cihaz/tarayıcı manuel odaklama kontrolünü desteklemiyor. Belgeyi hafifçe öne/arkaya oynatmayı deneyin.';
      resetHintAfter(hintEl, originalHint);
      return;
    }
    try {
      const caps = track.getCapabilities();
      if (caps.focusMode && caps.focusMode.indexOf('single-shot') !== -1) {
        hintEl.textContent = 'Yeniden odaklanılıyor...';
        track.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] })
          .then(function () {
            setTimeout(function () {
              hintEl.textContent = 'Odaklandı, çekebilirsiniz.';
              track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
              resetHintAfter(hintEl, originalHint);
            }, 700);
          })
          .catch(function () {
            hintEl.textContent = 'Odaklama denendi ama uygulanamadı. Belgeyi hafifçe öne/arkaya oynatmayı deneyin.';
            resetHintAfter(hintEl, originalHint);
          });
      } else {
        hintEl.textContent = 'Bu cihaz manuel odaklama kontrolünü desteklemiyor. Belgeyi hafifçe öne/arkaya oynatarak netleşmesini bekleyin.';
        resetHintAfter(hintEl, originalHint);
      }
    } catch (e) {
      hintEl.textContent = 'Bu cihaz manuel odaklama kontrolünü desteklemiyor.';
      resetHintAfter(hintEl, originalHint);
    }
  }

  function resetHintAfter(hintEl, originalHint) {
    setTimeout(function () {
      hintEl.textContent = originalHint || 'Belgeyi çerçeveye hizalayın';
    }, 2600);
  }

  function attachTwoSided(container, options) {
    let frontData = null;
    let backData = null;

    container.innerHTML =
      '<div class="idcap-sides"><div class="idcap-front-slot"></div><div class="idcap-back-slot"></div></div>' +
      '<div class="idcap-merge-status"></div>';

    const frontSlot = container.querySelector('.idcap-front-slot');
    const backSlot = container.querySelector('.idcap-back-slot');
    const statusEl = container.querySelector('.idcap-merge-status');

    attach(frontSlot, {
      label: options.frontLabel || 'Ön Yüz', hint: options.hint, guideType: 'card',
      onCapture: function (data) { frontData = data; tryMerge(); }
    });
    attach(backSlot, {
      label: options.backLabel || 'Arka Yüz', hint: options.hint, guideType: 'card',
      onCapture: function (data) { backData = data; tryMerge(); }
    });

    function tryMerge() {
      if (!frontData || !backData) { statusEl.textContent = ''; return; }
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
      callback(canvas.toDataURL('image/jpeg', 0.95));
    }
    imgTop.onload = function () { loaded++; if (loaded === 2) onBothLoaded(); };
    imgBottom.onload = function () { loaded++; if (loaded === 2) onBothLoaded(); };
    imgTop.src = dataUrlTop;
    imgBottom.src = dataUrlBottom;
  }

  function renderPortraitGuideSvg() {
    return '<div class="idcap-guide-portrait">' +
      '<svg viewBox="0 0 200 280" class="idcap-portrait-svg" preserveAspectRatio="xMidYMid meet">' +
        '<ellipse cx="100" cy="95" rx="58" ry="75" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-dasharray="7 5"/>' +
        '<path d="M12,280 C12,188 55,163 100,163 C145,163 188,188 188,280" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="3" stroke-dasharray="7 5"/>' +
      '</svg>' +
    '</div>';
  }

  function captureCardFrame(video) {
    const containerAspect = 4 / 3;
    const vw = video.videoWidth, vh = video.videoHeight;
    let cw, ch, cx, cy;
    if (vw / vh > containerAspect) { ch = vh; cw = vh * containerAspect; cx = (vw - cw) / 2; cy = 0; }
    else { cw = vw; ch = vw / containerAspect; cx = 0; cy = (vh - ch) / 2; }

    const guideW = cw * 0.82;
    const guideH = guideW / 1.586;
    const guideX = cx + (cw - guideW) / 2;
    const guideY = cy + (ch - guideH) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = guideW;
    canvas.height = guideH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, guideX, guideY, guideW, guideH, 0, 0, guideW, guideH);
    return canvas.toDataURL('image/jpeg', 0.95);
  }

  function capturePortraitFrame(video) {
    const containerAspect = 3 / 4;
    const vw = video.videoWidth, vh = video.videoHeight;
    let cw, ch, cx, cy;
    if (vw / vh > containerAspect) { ch = vh; cw = vh * containerAspect; cx = (vw - cw) / 2; cy = 0; }
    else { cw = vw; ch = vw / containerAspect; cx = 0; cy = (vh - ch) / 2; }

    const guideW = cw * 0.62;
    const guideH = ch * 0.82;
    const guideX = cx + (cw - guideW) / 2;
    const guideY = cy + (ch - guideH) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = guideW;
    canvas.height = guideH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, guideX, guideY, guideW, guideH, 0, 0, guideW, guideH);
    return canvas.toDataURL('image/jpeg', 0.95);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  return { attach: attach, attachTwoSided: attachTwoSided };
})();
