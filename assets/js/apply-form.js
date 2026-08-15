/**
 * STS-DMS — Aday Tarafı Dinamik Form Motoru (apply-form.js)
 * ================================
 * Form Tasarımı'nda tanımlanan alanlara göre aday tarafında formu
 * otomatik render eder, dosya/imza/kimlik yakalama bileşenlerini
 * bağlar, ve gönderim için formData + files objelerini toplar.
 *
 * KULLANIM:
 * const formCtl = STSApplyForm.render(containerEl, formDef, {
 *   rejectedFields: []   // düzenleme ekranında reddedilen alan etiketleri
 * });
 * ...
 * const { formData, files } = formCtl.collect();
 */

const STSApplyForm = (function () {
  const FILE_TYPES = ['Belge', 'Fotoğraf', 'İmza'];
  const sigContexts = {};

  function render(container, formDef, options) {
    options = options || {};
    const rejectedSet = new Set(options.rejectedFields || []);
    let fileData = {};

    let html = '';

    formDef.fields.forEach(function (f) {
      const isTwoSided = (f.Type === 'Belge') && (f.TwoSided === true || f.TwoSided === 'TRUE');
      const isVesikalik = (f.Type === 'Fotoğraf') && (f.VesikalikMode === true || f.VesikalikMode === 'TRUE');
      const isRequired = (f.Required === true || f.Required === 'TRUE');
      const isRejected = rejectedSet.has(f.Label) || Array.from(rejectedSet).some(r => r.indexOf(f.Label) === 0);

      html += '<div class="apply-field" id="fieldwrap_' + f.FieldID + '">';
      html += '<label class="apply-field-label">' + escapeHtml(f.Label) + (isRequired ? ' <span class="req-star">*</span>' : '') + '</label>';

      if (isRejected) {
        html += '<div class="apply-rejected-note">⚠ ' + escapeHtml('Bu belge reddedildi — lütfen yenisini yükleyin.') + '</div>';
      }

      if (f.TemplateFileUrl) {
        html += '<a class="apply-template-link" href="' + f.TemplateFileUrl + '" target="_blank" rel="noopener">' +
          '📄 Şablonu İndir' + (f.TemplateFileName ? ' (' + escapeHtml(f.TemplateFileName) + ')' : '') + '</a>';
      }

      if (isTwoSided) {
        html += '<div id="idcap_' + f.FieldID + '" class="idcap-sides"></div>';
      } else if (isVesikalik) {
        html += '<div id="idcap_' + f.FieldID + '" class="idcap-single"></div>';
      } else if (f.Type === 'Belge') {
        html += '<input type="file" class="apply-file-input" accept="image/*,application/pdf" data-field="' + f.FieldID + '">';
      } else if (f.Type === 'Fotoğraf') {
        html += '<input type="file" class="apply-file-input" accept="image/*" data-field="' + f.FieldID + '">';
      } else if (f.Type === 'İmza') {
        html += '<canvas class="apply-sigcanvas" id="sig_' + f.FieldID + '" width="400" height="150"></canvas>';
        html += '<div class="apply-sig-buttons">' +
          '<button type="button" class="btn btn-secondary apply-sig-clear" data-field="' + f.FieldID + '">Temizle</button>' +
          '<button type="button" class="btn btn-secondary apply-sig-save" data-field="' + f.FieldID + '">Onayla</button>' +
          '<span class="apply-sig-status" id="sigstatus_' + f.FieldID + '"></span>' +
        '</div>';
      } else if (f.Type === 'AçılırListe') {
        const options2 = (f.Options || '').split(',').map(o => o.trim()).filter(Boolean);
        html += '<select class="apply-input" id="field_' + f.FieldID + '"><option value="">—</option>' +
          options2.map(o => '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>').join('') + '</select>';
      } else if (f.Type === 'Onay') {
        html += '<label class="apply-checkbox-row"><input type="checkbox" id="field_' + f.FieldID + '"> <span>' + escapeHtml(f.Label) + '</span></label>';
      } else if (f.Type === 'Tarih') {
        html += '<input type="date" class="apply-input" id="field_' + f.FieldID + '">';
      } else if (f.Type === 'Telefon') {
        html += '<input type="tel" class="apply-input" id="field_' + f.FieldID + '" placeholder="5xx xxx xx xx">';
      } else if (f.Type === 'E-posta') {
        html += '<input type="email" class="apply-input" id="field_' + f.FieldID + '" placeholder="ornek@eposta.com">';
      } else {
        html += '<input type="text" class="apply-input" id="field_' + f.FieldID + '">';
      }

      html += '</div>';
    });

    container.innerHTML = html;

    // Dosya inputlarını bağla
    container.querySelectorAll('.apply-file-input').forEach(function (input) {
      input.addEventListener('change', function (e) {
        handleSimpleFileInput(e, input.getAttribute('data-field'));
      });
    });

    // İmza canvas'larını bağla
    formDef.fields.filter(f => f.Type === 'İmza').forEach(f => setupSignatureCanvas(f.FieldID));
    container.querySelectorAll('.apply-sig-clear').forEach(btn => {
      btn.addEventListener('click', function () { clearSignature(btn.getAttribute('data-field')); });
    });
    container.querySelectorAll('.apply-sig-save').forEach(btn => {
      btn.addEventListener('click', function () { saveSignature(btn.getAttribute('data-field')); });
    });

    // İki taraflı belge alanları
    formDef.fields.filter(f => f.Type === 'Belge' && (f.TwoSided === true || f.TwoSided === 'TRUE')).forEach(f => {
      const wrap = container.querySelector('#idcap_' + f.FieldID);
      STSIDCapture.attachTwoSided(wrap, {
        hint: (f.Label || 'Belge') + ' yüzünü çerçeveye hizalayıp çekin',
        onMerged: function (data) { fileData[f.FieldID] = data; }
      });
    });

    // Vesikalık modu alanları
    formDef.fields.filter(f => f.Type === 'Fotoğraf' && (f.VesikalikMode === true || f.VesikalikMode === 'TRUE')).forEach(f => {
      const wrap = container.querySelector('#idcap_' + f.FieldID);
      STSIDCapture.attach(wrap, {
        label: f.Label || 'Vesikalık Fotoğraf',
        hint: 'Kafanızı ve omuzlarınızı kılavuza hizalayın',
        guideType: 'portrait',
        facingMode: 'user',
        onCapture: function (data) { fileData[f.FieldID] = data; }
      });
    });

    function handleSimpleFileInput(e, fieldId) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const base64 = reader.result.split(',')[1];
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        fileData[fieldId] = { base64: base64, mimeType: file.type || 'image/jpeg', extension: ext };
      };
      reader.readAsDataURL(file);
    }

    function setupSignatureCanvas(fieldId) {
      const canvas = container.querySelector('#sig_' + fieldId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      sigContexts[fieldId] = { canvas: canvas, ctx: ctx, drawing: false };

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
      };

      const start = (e) => { sigContexts[fieldId].drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
      const move = (e) => { if (!sigContexts[fieldId].drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
      const end = () => { sigContexts[fieldId].drawing = false; };

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      canvas.addEventListener('mouseup', end);
      canvas.addEventListener('mouseleave', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);
    }

    function clearSignature(fieldId) {
      const c = sigContexts[fieldId];
      if (!c) return;
      c.ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);
      delete fileData[fieldId];
      const statusEl = container.querySelector('#sigstatus_' + fieldId);
      if (statusEl) statusEl.textContent = '';
    }

    function saveSignature(fieldId) {
      const c = sigContexts[fieldId];
      if (!c) return;
      const dataUrl = c.canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      fileData[fieldId] = { base64: base64, mimeType: 'image/png', extension: 'png' };
      const statusEl = container.querySelector('#sigstatus_' + fieldId);
      if (statusEl) statusEl.textContent = '✓ Kaydedildi';
    }

    // ---- Toplama ve doğrulama ----
    function collect() {
      const formData = {};
      formDef.fields.forEach(function (f) {
        if (FILE_TYPES.indexOf(f.Type) !== -1) return;
        const el = container.querySelector('#field_' + f.FieldID);
        if (!el) return;
        formData[f.FieldID] = (el.type === 'checkbox') ? el.checked : el.value;
      });
      return { formData: formData, files: fileData };
    }

    function validate() {
      for (let i = 0; i < formDef.fields.length; i++) {
        const f = formDef.fields[i];
        const isRequired = (f.Required === true || f.Required === 'TRUE');
        if (!isRequired) continue;
        if (options.mode === 'edit') continue; // düzenlemede zorunluluk uygulanmaz (carry-forward)

        if (FILE_TYPES.indexOf(f.Type) !== -1) {
          if (!fileData[f.FieldID] || !fileData[f.FieldID].base64) {
            return f.Label + ' alanı zorunludur.';
          }
        } else {
          const el = container.querySelector('#field_' + f.FieldID);
          const val = el ? (el.type === 'checkbox' ? el.checked : el.value) : '';
          if (val === '' || val === false) {
            return f.Label + ' alanı zorunludur.';
          }
        }
      }
      return null;
    }

    return { collect: collect, validate: validate };
  }

  // ============================================================
  // YÜKLEME İLERLEME GÖSTERGESİ (gerçek yüzde, XHR upload.onprogress ile)
  // ============================================================

  /**
   * Dairesel ilerleme göstergesi oluşturur. container içine SVG basar,
   * setPercent(0-100) ile güncellenir.
   */
  function createProgressRing(container, label) {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    container.innerHTML =
      '<div class="progress-ring-wrap">' +
        '<svg width="88" height="88" viewBox="0 0 88 88">' +
          '<circle cx="44" cy="44" r="' + radius + '" stroke="var(--surface-border, #e5e7eb)" stroke-width="7" fill="none"/>' +
          '<circle class="progress-ring-fg" cx="44" cy="44" r="' + radius + '" stroke="var(--brand-primary, #2563eb)" stroke-width="7" fill="none" ' +
            'stroke-linecap="round" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + circumference + '" ' +
            'transform="rotate(-90 44 44)"/>' +
        '</svg>' +
        '<div class="progress-ring-percent">0%</div>' +
        '<div class="progress-ring-label">' + escapeHtml(label || '') + '</div>' +
      '</div>';

    const fg = container.querySelector('.progress-ring-fg');
    const percentEl = container.querySelector('.progress-ring-percent');

    return {
      setPercent: function (p) {
        p = Math.max(0, Math.min(100, p));
        const offset = circumference * (1 - p / 100);
        fg.style.strokeDashoffset = offset;
        percentEl.textContent = Math.round(p) + '%';
      }
    };
  }

  /**
   * XMLHttpRequest ile gönderim yapar, gerçek yükleme yüzdesini
   * (e.loaded/e.total) onProgress callback'ine bildirir. Büyük base64
   * dosya içeren istekler (başvuru gönderme/düzenleme) için kullanılır.
   */
  function submitWithProgress(url, payload, onProgress, onLoad, onError) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = function () {
      onProgress(100);
      try {
        const json = JSON.parse(xhr.responseText);
        onLoad(json);
      } catch (e) {
        onError('Sunucudan geçersiz yanıt.');
      }
    };

    xhr.onerror = function () {
      onError('Ağ hatası, isteği tamamlayamadık.');
    };

    xhr.send(JSON.stringify(payload));
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  return { render: render, createProgressRing: createProgressRing, submitWithProgress: submitWithProgress };
})();
