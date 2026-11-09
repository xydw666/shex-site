(function imageCropperBootstrap(global) {
  'use strict';

  var VERSION = 1;
  var preparedFiles = new WeakMap();
  var fileViews = new WeakMap();
  var activePromise = null;
  var inputRules = [
    { ids: ['xTaAvatar', 'xUserAvatar', 'xDreamAvatarInput', 'ixSettingTaAvatar', 'ixSettingUserAvatar', 'xSettingGroupAvatar', 'xDreamRelationshipAvatarInput'], kind: 'avatar', mode: 'file', ratios: ['1:1', 'free', '3:4', '4:5'] },
    { selector: '[data-avatar-file]', kind: 'portrait', mode: 'file', ratios: ['3:4', '1:1', '4:5', 'free'] },
    { ids: ['xListenCoverInput'], kind: 'cover', mode: 'file', ratios: ['1:1', 'free', '4:5'] },
    { selector: '[data-simulator-role-avatar-input]', kind: 'worldRoleAvatar', mode: 'file', ratios: ['1:1'], forceStatic: true, maxBytes: 2 * 1024 * 1024 },
    { selector: '[data-simulator-media-input="worldPromo"]', kind: 'worldPromo', mode: 'file', ratios: ['16:9'], forceStatic: true, maxBytes: 2 * 1024 * 1024 },
    { ids: ['ixBackgroundInput', 'xCompanionBgInput', 'xCleanBgFile'], kind: 'background', mode: 'view', ratios: ['9:16', '16:9', 'free'] },
    { selector: '[data-album-picker-upload][data-dating-photo-background]', kind: 'album', mode: 'file', ratios: ['3:4'], forceStatic: true },
    { ids: ['xAlbumUploadInput'], selector: '[data-album-picker-upload]', kind: 'album', mode: 'view', ratios: ['free', '9:16', '16:9', '1:1'] },
    { ids: ['shexFeedbackImages'], kind: 'feedback', mode: 'optional', supportsAnimatedView: false, ratios: ['free', '1:1', '3:4', '4:5'] },
    { ids: ['ixPlusImageInput', 'xCleanImageInput', 'sReplyImages', 'ixPlusStickerInput', 'xCleanStickerUserInput', 'xCleanStickerDreamInput'], kind: 'content', mode: 'optional', ratios: ['free', '1:1', '3:4', '4:5', '9:16', '16:9'] }
  ];

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function isImage(file) { return Boolean(file && (/^image\//i.test(String(file.type || '')) || /\.(png|jpe?g|webp|gif)$/i.test(String(file.name || '')))); }
  function ratioValue(value) {
    if (!value || value === 'free') return 0;
    var parts = String(value).split(':').map(Number);
    return parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : 0;
  }
  function defaultView(ratio) {
    return { version: VERSION, mode: 'crop-view', aspectRatio: ratio || 'free', focalX: .5, focalY: .5, zoom: 1, rotation: 0 };
  }
  function normalizeView(value) {
    var source = value && typeof value === 'object' ? value : {};
    var focalX = Number(source.focalX);
    var focalY = Number(source.focalY);
    var zoom = Number(source.zoom);
    return {
      version: VERSION,
      mode: 'crop-view',
      aspectRatio: String(source.aspectRatio || 'free'),
      focalX: clamp(Number.isFinite(focalX) ? focalX : .5, 0, 1),
      focalY: clamp(Number.isFinite(focalY) ? focalY : .5, 0, 1),
      zoom: clamp(Number.isFinite(zoom) ? zoom : 1, 1, 4),
      rotation: ((Number(source.rotation) || 0) % 360 + 360) % 360
    };
  }
  function attachView(file, view) {
    if (!file || !view || (typeof file !== 'object' && typeof file !== 'function')) return file;
    var normalized = normalizeView(view);
    fileViews.set(file, normalized);
    try { Object.defineProperty(file, '__shexImageView', { value: normalized, configurable: true }); } catch (_) {}
    return file;
  }
  function attachAnimated(file, animated) {
    if (!file || (typeof file !== 'object' && typeof file !== 'function')) return file;
    try { Object.defineProperty(file, '__shexImageAnimated', { value: Boolean(animated), configurable: true }); } catch (_) {}
    return file;
  }
  function viewFor(file) {
    if (!file || (typeof file !== 'object' && typeof file !== 'function')) return null;
    return normalizeView(fileViews.get(file) || file.__shexImageView) || null;
  }
  function filesForInput(input) {
    return preparedFiles.get(input) || Array.from(input && input.files || []);
  }
  function clearInput(input) {
    if (input) preparedFiles.delete(input);
  }
  function applyView(element, view) {
    if (!element || !view) return element;
    var clean = normalizeView(view);
    element.classList.add('shex-image-view');
    element.style.setProperty('--shex-image-focal-x', (clean.focalX * 100).toFixed(3) + '%');
    element.style.setProperty('--shex-image-focal-y', (clean.focalY * 100).toFixed(3) + '%');
    element.style.setProperty('--shex-image-zoom', String(clean.zoom));
    element.style.setProperty('--shex-image-rotation', clean.rotation + 'deg');
    return element;
  }
  function matchRule(input) {
    if (!input || input.type !== 'file') return null;
    for (var i = 0; i < inputRules.length; i += 1) {
      var rule = inputRules[i];
      if (rule.ids && rule.ids.indexOf(input.id) >= 0) return rule;
      if (rule.selector && input.matches && input.matches(rule.selector)) return rule;
    }
    return null;
  }
  function extensionFor(type) {
    if (/png/i.test(type)) return 'png';
    if (/webp/i.test(type)) return 'webp';
    return 'jpg';
  }
  function croppedName(file, type) {
    var base = String(file && file.name || 'image').replace(/\.[^.]+$/, '');
    return base + '-cropped.' + extensionFor(type);
  }
  function fileFromBlob(blob, source, type) {
    try { return new File([blob], croppedName(source, type), { type: type, lastModified: Date.now() }); }
    catch (_) { blob.name = croppedName(source, type); blob.lastModified = Date.now(); return blob; }
  }
  function readBytes(file) {
    if (typeof file?.arrayBuffer === 'function') return file.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(new Uint8Array(reader.result || new ArrayBuffer(0))); };
      reader.onerror = function () { reject(new Error('图片无法读取，请重试')); };
      reader.readAsArrayBuffer(file);
    });
  }
  async function isAnimated(file) {
    var type = String(file && file.type || '').toLowerCase();
    var name = String(file && file.name || '').toLowerCase();
    if (type === 'image/gif' || /\.gif$/.test(name)) return true;
    if (type === 'image/webp' || /\.webp$/.test(name)) {
      var bytes = await readBytes(file);
      var fourcc = function (at) { return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]); };
      if (bytes.length < 20 || fourcc(0) !== 'RIFF' || fourcc(8) !== 'WEBP') return false;
      for (var at = 12; at + 8 <= bytes.length;) {
        var chunk = fourcc(at);
        var size = (bytes[at + 4] | (bytes[at + 5] << 8) | (bytes[at + 6] << 16) | (bytes[at + 7] << 24)) >>> 0;
        if (chunk === 'ANIM' || chunk === 'ANMF' || (chunk === 'VP8X' && size > 0 && (bytes[at + 8] & 2))) return true;
        at += 8 + size + (size & 1);
      }
    }
    return false;
  }
  async function runtimeBackgroundFile(file, options) {
    if (!isImage(file) || await isAnimated(file)) return null;
    options = options || {};
    var width = Number(options.width || 720);
    var height = Number(options.height || 1280);
    var view = viewFor(file) || defaultView('9:16');
    var loaded = await loadImage(file);
    try {
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('背景运行图无法生成');
      var quarterTurn = view.rotation % 180 !== 0;
      var naturalW = quarterTurn ? loaded.image.naturalHeight : loaded.image.naturalWidth;
      var naturalH = quarterTurn ? loaded.image.naturalWidth : loaded.image.naturalHeight;
      var scale = Math.max(width / naturalW, height / naturalH) * view.zoom;
      var drawnW = naturalW * scale;
      var drawnH = naturalH * scale;
      var panX = clamp((.5 - view.focalX) * drawnW, -(drawnW - width) / 2, (drawnW - width) / 2);
      var panY = clamp((.5 - view.focalY) * drawnH, -(drawnH - height) / 2, (drawnH - height) / 2);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.translate(width / 2 + panX, height / 2 + panY);
      context.rotate(view.rotation * Math.PI / 180);
      context.scale(scale, scale);
      context.drawImage(loaded.image, -loaded.image.naturalWidth / 2, -loaded.image.naturalHeight / 2);
      var blob = await canvasBlob(canvas, 'image/webp', .82);
      var type = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
      if (type === 'image/jpeg') blob = await canvasBlob(canvas, type, .84);
      var runtimeFile = fileFromBlob(blob, file, type);
      attachView(runtimeFile, defaultView('9:16'));
      return { file:runtimeFile, width:width, height:height, view:viewFor(runtimeFile) };
    } finally {
      if (loaded.ownedUrl) URL.revokeObjectURL(loaded.url);
    }
  }
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var directUrl = typeof file === 'string';
      var url = directUrl ? file : URL.createObjectURL(file);
      var image = new Image();
      if (directUrl) image.crossOrigin = 'anonymous';
      image.onload = function () { resolve({ image: image, url: url, ownedUrl: !directUrl }); };
      image.onerror = function () { if (!directUrl) URL.revokeObjectURL(url); reject(new Error('图片无法读取，请换一张图片')); };
      image.src = url;
    });
  }
  function createUi() {
    var root = document.createElement('div');
    root.className = 'shex-cropper';
    root.hidden = true;
    root.innerHTML = '' +
      '<section class="shex-cropper__dialog" role="dialog" aria-modal="true" aria-labelledby="shexCropTitle">' +
        '<header class="shex-cropper__head"><div><strong id="shexCropTitle">调整图片</strong><span data-crop-hint>拖动图片，调整要显示的区域</span></div><button class="shex-cropper__close" type="button" data-crop-cancel aria-label="取消">×</button></header>' +
        '<div class="shex-cropper__stage"><div class="shex-cropper__frame" data-crop-frame><canvas></canvas><i class="shex-cropper__grid"></i><button class="shex-cropper__resize" type="button" data-crop-resize aria-label="调整自由裁剪框"></button></div></div>' +
        '<div class="shex-cropper__quick"><button class="shex-cropper__secondary" type="button" data-crop-original>直接使用原图</button><button class="shex-cropper__primary" type="button" data-crop-edit>裁剪一下</button></div>' +
        '<div class="shex-cropper__tools"><div class="shex-cropper__ratios" data-crop-ratios></div><div class="shex-cropper__tool-row"><label>缩放<input data-crop-zoom type="range" min="1" max="4" value="1" step="0.01"></label><button class="shex-cropper__confirm" type="button" data-crop-confirm>确认上传</button><button type="button" data-crop-rotate>旋转</button><button type="button" data-crop-reset>重置</button></div></div>' +
      '</section>';
    document.body.appendChild(root);
    return root;
  }
  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('裁剪图片生成失败')); }, type, quality);
    });
  }
  function cropEditor(file, options) {
    if(options.signal?.aborted)return Promise.resolve({cancelled:true});
    if (activePromise) return Promise.reject(new Error('图片处理窗口正在使用中'));
    activePromise = new Promise(async function (resolve, reject) {
      var loaded;
      try { loaded = await loadImage(file); } catch (error) { activePromise = null; reject(error); return; }
      if(options.signal?.aborted){if(loaded.ownedUrl)URL.revokeObjectURL(loaded.url);activePromise=null;resolve({cancelled:true});return;}
      var root = createUi();
      var frame = root.querySelector('[data-crop-frame]');
      var canvas = frame.querySelector('canvas');
      var context = canvas.getContext('2d', { alpha: true });
      var stage = root.querySelector('.shex-cropper__stage');
      var zoom = root.querySelector('[data-crop-zoom]');
      var ratiosNode = root.querySelector('[data-crop-ratios]');
      var ratios = Array.isArray(options.ratios) && options.ratios.length ? options.ratios : ['free', '1:1'];
      var initialView = normalizeView(options.initialView || null);
      var initialRatio = ratios.indexOf(initialView.aspectRatio) >= 0 ? initialView.aspectRatio : ratios[0];
      var state = { ratio: initialRatio, zoom: initialView.zoom, rotation: initialView.rotation, panX: 0, panY: 0, frameWidth: 0, frameHeight: 0, drag: null, resizing: false, initialPositionPending: Boolean(options.initialView) };
      if(options.allowRotation===false){state.rotation=0;root.querySelector('[data-crop-rotate]').hidden=true;}
      var animated = Boolean(options.animated);
      var settled = false;
      root.querySelector('[data-crop-hint]').textContent = options.runtimeBackground && !animated
        ? '保存后只保留当前显示效果的运行图'
        : (animated && !options.forceStatic) || options.mode === 'view'
          ? '原图会保留，只记录缩放和位置'
          : '拖动图片，调整要保留的范围';
      if (animated && options.forceStatic) root.querySelector('[data-crop-hint]').textContent = '动图将裁剪为静态图片；拖动图片，调整要保留的范围';
      if (options.runtimeBackground && !animated) root.querySelector('[data-crop-original]').textContent = '使用默认位置';
      if (animated && options.supportsAnimatedView === false) {
        root.querySelector('[data-crop-hint]').textContent = '问题反馈中的动图会保持原文件，不会压成静态图';
        root.querySelector('[data-crop-edit]').hidden = true;
      }
      ratiosNode.innerHTML = ratios.map(function (ratio) { return '<button type="button" data-crop-ratio="' + ratio + '">' + (ratio === 'free' ? '自由' : ratio) + '</button>'; }).join('');
      function fitFrame() {
        var box = stage.getBoundingClientRect();
        var maxW = Math.max(220, box.width - 28);
        var maxH = Math.max(220, box.height - 28);
        var ratio = ratioValue(state.ratio);
        var natural = loaded.image.naturalWidth / Math.max(1, loaded.image.naturalHeight);
        if (!ratio) ratio = state.frameWidth && state.frameHeight ? state.frameWidth / state.frameHeight : natural;
        var width = maxW;
        var height = width / ratio;
        if (height > maxH) { height = maxH; width = height * ratio; }
        state.frameWidth = Math.round(width);
        state.frameHeight = Math.round(height);
        frame.style.width = state.frameWidth + 'px';
        frame.style.height = state.frameHeight + 'px';
        root.querySelector('[data-crop-resize]').hidden = state.ratio !== 'free';
        if (state.initialPositionPending) {
          var initialGeometry = geometry(state.frameWidth, state.frameHeight);
          state.panX = (.5 - initialView.focalX) * initialGeometry.drawnW;
          state.panY = (.5 - initialView.focalY) * initialGeometry.drawnH;
          state.initialPositionPending = false;
        }
        draw();
      }
      function geometry(width, height) {
        var angle = state.rotation % 180 ? Math.PI / 2 : 0;
        var naturalW = angle ? loaded.image.naturalHeight : loaded.image.naturalWidth;
        var naturalH = angle ? loaded.image.naturalWidth : loaded.image.naturalHeight;
        var base = Math.max(width / naturalW, height / naturalH);
        var scale = base * state.zoom;
        return { scale: scale, drawnW: naturalW * scale, drawnH: naturalH * scale };
      }
      function clampPan(width, height) {
        var geo = geometry(width, height);
        state.panX = clamp(state.panX, -(geo.drawnW - width) / 2, (geo.drawnW - width) / 2);
        state.panY = clamp(state.panY, -(geo.drawnH - height) / 2, (geo.drawnH - height) / 2);
      }
      function paint(target, width, height, pixelRatio) {
        var ratio = pixelRatio || 1;
        clampPan(width, height);
        var geo = geometry(width, height);
        target.save();
        target.clearRect(0, 0, width * ratio, height * ratio);
        target.scale(ratio, ratio);
        target.translate(width / 2 + state.panX, height / 2 + state.panY);
        target.rotate(state.rotation * Math.PI / 180);
        target.scale(geo.scale, geo.scale);
        target.drawImage(loaded.image, -loaded.image.naturalWidth / 2, -loaded.image.naturalHeight / 2);
        target.restore();
      }
      function draw() {
        if (!state.frameWidth || !state.frameHeight) return;
        var dpr = Math.min(2, global.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(state.frameWidth * dpr));
        canvas.height = Math.max(1, Math.round(state.frameHeight * dpr));
        paint(context, state.frameWidth, state.frameHeight, dpr);
        ratiosNode.querySelectorAll('[data-crop-ratio]').forEach(function (button) { button.classList.toggle('is-active', button.dataset.cropRatio === state.ratio); });
      }
      function view() {
        var geo = geometry(state.frameWidth, state.frameHeight);
        return normalizeView({
          aspectRatio: state.ratio,
          focalX: .5 - state.panX / Math.max(1, geo.drawnW),
          focalY: .5 - state.panY / Math.max(1, geo.drawnH),
          zoom: state.zoom,
          rotation: state.rotation
        });
      }
      function finish(result) {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort',onAbort);
        if (loaded.ownedUrl) URL.revokeObjectURL(loaded.url);
        root.remove();
        document.documentElement.classList.remove('shex-cropper-open');
        activePromise = null;
        resolve(result);
      }
      function onAbort(){finish({cancelled:true});}
      options.signal?.addEventListener('abort',onAbort,{once:true});
      async function confirmCrop() {
        var cropView = view();
        if ((animated && !options.forceStatic) || options.mode === 'view') {
          attachView(file, cropView);
          finish({ file: file, originalFile: file, view: cropView, changed: true, preserved: true, animated: animated });
          return;
        }
        try {
          var frameRatio = state.frameWidth / Math.max(1, state.frameHeight);
          var outputW = Math.min(1800, Math.max(480, Math.round(state.frameWidth * Math.max(1, loaded.image.naturalWidth / Math.max(1, state.frameWidth)) )));
          var outputH = Math.round(outputW / frameRatio);
          if (outputH > 1800) { outputH = 1800; outputW = Math.round(outputH * frameRatio); }
          var output = document.createElement('canvas');
          output.width = outputW;
          output.height = outputH;
          var outContext = output.getContext('2d', { alpha: true });
          var scaleX = outputW / state.frameWidth;
          var oldPanX = state.panX;
          var oldPanY = state.panY;
          state.panX *= scaleX;
          state.panY *= outputH / state.frameHeight;
          paint(outContext, outputW, outputH, 1);
          state.panX = oldPanX;
          state.panY = oldPanY;
          var outputType = /png/i.test(file.type) ? 'image/png' : /webp/i.test(file.type) ? 'image/webp' : 'image/jpeg';
          var blob = await canvasBlob(output, outputType, .9);
          if (options.maxBytes && blob.size > options.maxBytes) {
            var current = output;
            for (var attempt = 0; attempt < 8 && blob.size > options.maxBytes; attempt += 1) {
              if (attempt >= 3) {
                var smaller = document.createElement('canvas');
                smaller.width = Math.max(240, Math.round(current.width * .8));
                smaller.height = Math.max(1, Math.round(smaller.width / frameRatio));
                smaller.getContext('2d').drawImage(current, 0, 0, smaller.width, smaller.height);
                current = smaller;
              }
              blob = await canvasBlob(current, 'image/webp', [.82, .68, .52][Math.min(attempt, 2)]);
              if (blob.type !== 'image/webp') blob = await canvasBlob(current, 'image/jpeg', [.82, .68, .52][Math.min(attempt, 2)]);
            }
            if (blob.size > options.maxBytes) throw new Error('裁剪后的图片仍然过大，请换一张图片');
            outputType = blob.type;
          }
          var nextFile = fileFromBlob(blob, file, outputType);
          attachView(nextFile, cropView);
          finish({ file: nextFile, originalFile: file, view: cropView, changed: true, preserved: false, animated: false });
        } catch (error) {
          if (loaded.ownedUrl) URL.revokeObjectURL(loaded.url);
          root.remove();
          document.documentElement.classList.remove('shex-cropper-open');
          activePromise = null;
          reject(error);
        }
      }
      function useOriginal() {
        var cleanView = defaultView('free');
        attachView(file, cleanView);
        finish({ file: file, originalFile: file, view: cleanView, changed: false, preserved: true, animated: animated });
      }
      function cancel() { finish({ cancelled: true }); }
      root.querySelectorAll('[data-crop-original]').forEach(function (button) { button.addEventListener('click', useOriginal); });
      root.querySelector('[data-crop-cancel]').addEventListener('click', cancel);
      root.querySelector('[data-crop-confirm]').addEventListener('click', confirmCrop);
      root.querySelector('[data-crop-edit]').addEventListener('click', function () { root.classList.remove('is-quick'); });
      root.querySelector('[data-crop-rotate]').addEventListener('click', function () { state.rotation = (state.rotation + 90) % 360; state.panX = 0; state.panY = 0; draw(); });
      root.querySelector('[data-crop-reset]').addEventListener('click', function () { state.zoom = 1; state.rotation = 0; state.panX = 0; state.panY = 0; zoom.value = '1'; fitFrame(); });
      zoom.addEventListener('input', function () { state.zoom = Number(zoom.value || 1); draw(); });
      ratiosNode.addEventListener('click', function (event) {
        var button = event.target.closest('[data-crop-ratio]');
        if (!button) return;
        state.ratio = button.dataset.cropRatio;
        state.panX = 0; state.panY = 0;
        fitFrame();
      });
      frame.addEventListener('pointerdown', function (event) {
        if (event.target.closest('[data-crop-resize]')) return;
        state.drag = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
        try { frame.setPointerCapture(event.pointerId); } catch (_) {}
      });
      frame.addEventListener('pointermove', function (event) {
        if (!state.drag) return;
        state.panX = state.drag.panX + event.clientX - state.drag.x;
        state.panY = state.drag.panY + event.clientY - state.drag.y;
        draw();
      });
      frame.addEventListener('pointerup', function () { state.drag = null; });
      var resize = root.querySelector('[data-crop-resize]');
      resize.addEventListener('pointerdown', function (event) {
        event.stopPropagation();
        state.resizing = { x: event.clientX, y: event.clientY, width: state.frameWidth, height: state.frameHeight };
        try { resize.setPointerCapture(event.pointerId); } catch (_) {}
      });
      resize.addEventListener('pointermove', function (event) {
        if (!state.resizing) return;
        var box = stage.getBoundingClientRect();
        state.frameWidth = clamp(state.resizing.width + event.clientX - state.resizing.x, 150, box.width - 28);
        state.frameHeight = clamp(state.resizing.height + event.clientY - state.resizing.y, 150, box.height - 28);
        frame.style.width = Math.round(state.frameWidth) + 'px';
        frame.style.height = Math.round(state.frameHeight) + 'px';
        draw();
      });
      resize.addEventListener('pointerup', function () { state.resizing = false; });
      root.addEventListener('click', function (event) { if (event.target === root) cancel(); });
      root.addEventListener('keydown', function (event) { if (event.key === 'Escape') cancel(); });
      root.hidden = false;
      root.classList.toggle('is-quick', options.mode === 'optional');
      document.documentElement.classList.add('shex-cropper-open');
      zoom.value = String(state.zoom);
      fitFrame();
      root.querySelector('[data-crop-cancel]').focus();
    });
    return activePromise;
  }
  async function open(file, options) {
    options = options || {};
    if (!isImage(file)) return { file: file, originalFile: file, view: null, changed: false, preserved: true, animated: false };
    var animated = await isAnimated(file);
    attachAnimated(file, animated);
    return cropEditor(file, Object.assign({}, options, { animated: animated }));
  }
  function openUrl(url, options) {
    if (!url) return Promise.reject(new Error('图片地址无效'));
    return cropEditor(String(url), Object.assign({}, options || {}, { mode: 'view', animated: false }));
  }
  function replaceInputFiles(input, files) {
    preparedFiles.set(input, files.slice());
    if (typeof DataTransfer === 'undefined') return false;
    try {
      var transfer = new DataTransfer();
      files.forEach(function (file) { transfer.items.add(file); });
      input.files = transfer.files;
      return true;
    } catch (_) { return false; }
  }
  async function interceptChange(event) {
    var input = event.target;
    if (!input || input.type !== 'file') return;
    if (input.dataset.shexCropBypass === '1') { delete input.dataset.shexCropBypass; return; }
    var rule = matchRule(input);
    if (!rule) return;
    var originals = Array.from(input.files || []);
    if (!originals.some(isImage)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var output = [];
    try {
      for (var i = 0; i < originals.length; i += 1) {
        var file = originals[i];
        if (!isImage(file)) { output.push(file); continue; }
        var result = await open(file, Object.assign({}, rule, { runtimeBackground:input.id === 'ixBackgroundInput' }));
        if (result.cancelled) { input.value = ''; preparedFiles.delete(input); return; }
        output.push(result.file);
      }
      replaceInputFiles(input, output);
      input.dataset.shexCropBypass = '1';
      input.dispatchEvent(new Event('change', { bubbles: true }));
      global.setTimeout(function () { preparedFiles.delete(input); }, 0);
    } catch (error) {
      input.value = '';
      preparedFiles.delete(input);
      if (typeof global.showChatToast === 'function') global.showChatToast(error && error.message || '图片处理失败，请重试');
      else global.alert(error && error.message || '图片处理失败，请重试');
    }
  }
  document.addEventListener('change', interceptChange, true);
  global.SHEXImageCropper = {
    VERSION: VERSION,
    open: open,
    openUrl: openUrl,
    normalizeView: normalizeView,
    defaultView: defaultView,
    applyView: applyView,
    attachView: attachView,
    viewFor: viewFor,
    isAnimated: isAnimated,
    runtimeBackgroundFile: runtimeBackgroundFile,
    filesForInput: filesForInput,
    clearInput: clearInput,
    matchRule: matchRule,
    rules: inputRules.slice()
  };
})(window);
