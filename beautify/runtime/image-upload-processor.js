(function imageUploadProcessorModule(global) {
  'use strict';

  const VERSION = 'beautify-image-upload-processor-v2-magic-normalization-x103';
  const COMPONENT_KIND = 'beautify-components';
  const MAX_BYTES = 8 * 1024 * 1024;
  const PASSTHROUGH_BYTES = 2 * 1024 * 1024;
  const MAX_SIDE = 1280;
  const JPEG_QUALITY = 0.8;
  const WEBP_QUALITY = 0.92;
  const TYPE_EXTENSIONS = Object.freeze({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  });
  const normalizedFiles = new WeakMap();
  const processedOutputs = new WeakMap();

  function isComponentKind(kind) {
    return String(kind || '').trim().toLowerCase() === COMPONENT_KIND;
  }

  function maxBytes(kind) {
    return isComponentKind(kind) ? MAX_BYTES : 2 * 1024 * 1024;
  }

  function extensionFor(type) {
    return TYPE_EXTENSIONS[type] || 'jpg';
  }

  function outputName(file, type) {
    const name = String(file?.name || `image.${extensionFor(type)}`);
    return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, `.${extensionFor(type)}`) : `${name}.${extensionFor(type)}`;
  }

  function ascii(bytes, offset, length) {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
  }

  function readU32(bytes, offset) {
    if (offset + 4 > bytes.length) return 0;
    return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
  }

  function boxHeader(bytes, offset) {
    if (offset + 8 > bytes.length) return null;
    const size32 = readU32(bytes, offset);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (offset + 16 > bytes.length) return null;
      const high = readU32(bytes, offset + 8);
      const low = readU32(bytes, offset + 12);
      size = high * 0x100000000 + low;
      headerSize = 16;
      if (!Number.isSafeInteger(size)) return null;
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) return null;
    return { offset, size, headerSize, type:ascii(bytes, offset + 4, 4) };
  }

  function isAvif(bytes) {
    let offset = 0;
    while (offset + 8 <= bytes.length) {
      const box = boxHeader(bytes, offset);
      if (!box) return false;
      if (box.type === 'ftyp') {
        if (box.size < box.headerSize + 8) return false;
        if (['avif', 'avis'].includes(ascii(bytes, offset + box.headerSize, 4))) return true;
        for (let brandOffset = offset + box.headerSize + 8; brandOffset + 4 <= offset + box.size; brandOffset += 4) {
          const brand = ascii(bytes, brandOffset, 4);
          if (brand === 'avif' || brand === 'avis') return true;
        }
        return false;
      }
      offset += box.size;
    }
    return false;
  }

  function sniffMimeFromBytes(bytes) {
    if (!bytes || bytes.length < 3) return '';
    if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) return 'image/gif';
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
    if (isAvif(bytes)) return 'image/avif';
    return '';
  }

  async function sniffMime(file) {
    if (!file?.slice) return '';
    const bytes = new Uint8Array(await file.slice(0, Math.min(Number(file.size || 0), 64 * 1024)).arrayBuffer());
    return sniffMimeFromBytes(bytes);
  }

  async function normalizeFile(file) {
    if (!file || typeof file !== 'object') return file;
    const cached = normalizedFiles.get(file);
    if (cached) return cached;
    const type = await sniffMime(file);
    if (!TYPE_EXTENSIONS[type]) {
      const error = new Error('图片的实际格式不受支持，请使用 PNG、JPEG、WebP、GIF 或 AVIF');
      error.code = 'IMAGE_FORMAT_UNSUPPORTED';
      throw error;
    }
    const name = outputName(file, type);
    const declaredType = String(file.type || '').toLowerCase();
    const currentName = String(file.name || '');
    const normalized = declaredType === type && currentName === name
      ? file
      : new File([file], name, { type, lastModified:Number(file.lastModified || Date.now()) });
    normalizedFiles.set(file, normalized);
    normalizedFiles.set(normalized, normalized);
    return normalized;
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, url });
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('IMAGE_DECODE_FAILED')); };
      image.src = url;
    });
  }

  function hasAlpha(context, width, height) {
    const pixels = context.getImageData(0, 0, width, height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 255) return true;
    }
    return false;
  }

  function sourceHasAlpha(image, width, height) {
    const tileSize = 512;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) return true;
    for (let top = 0; top < height; top += tileSize) {
      for (let left = 0; left < width; left += tileSize) {
        const tileWidth = Math.min(tileSize, width - left);
        const tileHeight = Math.min(tileSize, height - top);
        canvas.width = tileWidth;
        canvas.height = tileHeight;
        context.clearRect(0, 0, tileWidth, tileHeight);
        context.drawImage(image, left, top, tileWidth, tileHeight, 0, 0, tileWidth, tileHeight);
        if (hasAlpha(context, tileWidth, tileHeight)) return true;
      }
    }
    return false;
  }

  function fileFromBlob(blob, source, type) {
    return new File([blob], outputName(source, type), {
      type,
      lastModified: Number(source?.lastModified || Date.now()),
    });
  }

  async function alphaSafeBlob(canvas, sourceType) {
    if (sourceType === 'image/webp') {
      const webp = await canvasBlob(canvas, 'image/webp', WEBP_QUALITY);
      if (webp?.type === 'image/webp') return { blob: webp, type: 'image/webp' };
    }
    const png = await canvasBlob(canvas, 'image/png');
    return png?.type === 'image/png' ? { blob: png, type: 'image/png' } : null;
  }

  async function process(file, kind = COMPONENT_KIND) {
    if (!isComponentKind(kind) || !file) return file;
    let normalized;
    try { normalized = await normalizeFile(file); }
    catch (error) { throw error; }
    file = normalized;
    const processed = processedOutputs.get(file);
    if (processed) return processed;
    if (file.type === 'image/gif') return file;

    let loaded;
    try {
      loaded = await loadImage(file);
      const width = Number(loaded.image.naturalWidth || loaded.image.width || 0);
      const height = Number(loaded.image.naturalHeight || loaded.image.height || 0);
      if (!width || !height) return file;

      const needsResize = Math.max(width, height) > MAX_SIDE;
      if (!needsResize && Number(file.size || 0) <= PASSTHROUGH_BYTES) return file;
      const sourceType = String(file.type || '').toLowerCase();
      const alphaPresent = /^image\/(?:png|webp|avif)$/.test(sourceType)
        ? sourceHasAlpha(loaded.image, width, height)
        : false;

      const scale = needsResize ? MAX_SIDE / Math.max(width, height) : 1;
      const outputWidth = Math.max(1, Math.round(width * scale));
      const outputHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) return file;
      context.clearRect(0, 0, outputWidth, outputHeight);
      context.drawImage(loaded.image, 0, 0, outputWidth, outputHeight);

      const outputHasAlpha = hasAlpha(context, outputWidth, outputHeight);
      if (alphaPresent && !outputHasAlpha) { processedOutputs.set(file, file); return file; }
      if (alphaPresent || outputHasAlpha) {
        const encoded = await alphaSafeBlob(canvas, sourceType);
        if (!encoded?.blob) return file;
        const next = fileFromBlob(encoded.blob, file, encoded.type);
        const selected = next.size < file.size ? next : file;
        processedOutputs.set(file, selected);
        processedOutputs.set(selected, selected);
        return selected;
      }

      const blob = await canvasBlob(canvas, 'image/jpeg', JPEG_QUALITY);
      if (!blob || blob.type !== 'image/jpeg') return file;
      const next = fileFromBlob(blob, file, 'image/jpeg');
      const selected = next.size < file.size ? next : file;
      processedOutputs.set(file, selected);
      processedOutputs.set(selected, selected);
      return selected;
    } catch (_) {
      return file;
    } finally {
      if (loaded?.url) URL.revokeObjectURL(loaded.url);
    }
  }

  global.SHEXBeautifyImageUploadProcessor = Object.freeze({
    VERSION,
    COMPONENT_KIND,
    MAX_BYTES,
    PASSTHROUGH_BYTES,
    MAX_SIDE,
    maxBytes,
    sniffMimeFromBytes,
    sniffMime,
    normalizeFile,
    process,
  });
})(window);
