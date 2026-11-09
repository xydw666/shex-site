/**
 * SHE.X 本机文件导出。
 * APP 写入 Documents 后回读核对；网页按能力选择保存、分享或普通下载。
 */
(function (global, factory) {
  const api = factory(global);
  if (global) global.ShexFileExport = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = { createShexFileExport: factory };
  }
})(typeof window !== 'undefined' ? window : globalThis, function createShexFileExport(root) {
  const DOWNLOAD_URL_LIFETIME_MS = 60 * 1000;

  function navigatorObject() {
    return root?.navigator || {};
  }

  function userAgent() {
    return String(navigatorObject().userAgent || '');
  }

  function isWechatBrowser() {
    return /MicroMessenger/i.test(userAgent());
  }

  function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent());
  }

  function capacitorBridge() {
    return root?.ShexCapacitorBridge || null;
  }

  function isNativeApp() {
    try {
      if (root?.ShexNativeStorage?.isNative?.()) return true;
      const capacitor = capacitorBridge()?.Capacitor || root?.Capacitor;
      return Boolean(capacitor?.isNativePlatform?.());
    } catch (_) {
      return false;
    }
  }

  function makeBlob(text, mimeType) {
    const BlobConstructor = root?.Blob || (typeof Blob !== 'undefined' ? Blob : null);
    if (!BlobConstructor) throw new Error('BLOB_UNAVAILABLE');
    return new BlobConstructor([text], { type: mimeType });
  }

  function makeShareFile(text, filename, mimeType) {
    const FileConstructor = root?.File || (typeof File !== 'undefined' ? File : null);
    if (!FileConstructor) return null;
    return new FileConstructor([text], filename, { type: mimeType });
  }

  function isCancelled(error) {
    return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
  }

  async function shareFile(text, filename, mimeType) {
    const navigator = navigatorObject();
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return null;
    let file = makeShareFile(text, filename, mimeType);
    if (!file || !navigator.canShare({ files: [file] })) {
      file = makeShareFile(text, filename, 'text/plain');
    }
    if (!file || !navigator.canShare({ files: [file] })) return null;
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: '保存 SHE.X 字卡文件'
      });
      return { status: 'handed_off', method: 'web-share', filename };
    } catch (error) {
      if (isCancelled(error)) return { status: 'cancelled', method: 'web-share', filename };
      return null;
    }
  }

  async function nativeShare(uri, filename) {
    const bridge = capacitorBridge();
    const capacitor = bridge?.Capacitor || root?.Capacitor;
    if (!capacitor?.isPluginAvailable?.('Share')) return false;
    try {
      const Share = capacitor.Plugins?.Share || capacitor.registerPlugin?.('Share');
      if (!Share?.share) return false;
      await Share.share({
        title: filename,
        dialogTitle: '保存 SHE.X 字卡文件',
        files: [uri]
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function saveInNativeDocuments(text, filename) {
    const bridge = capacitorBridge();
    const Filesystem = bridge?.Filesystem;
    const Directory = bridge?.Directory;
    const Encoding = bridge?.Encoding;
    if (!Filesystem?.writeFile || !Filesystem?.readFile || !Directory?.Documents) {
      return { status: 'failed', method: 'native-documents', filename, reason: 'NATIVE_FILESYSTEM_UNAVAILABLE' };
    }
    try {
      const written = await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Documents,
        encoding: Encoding?.UTF8 || 'utf8',
        recursive: true
      });
      const verified = await Filesystem.readFile({
        path: filename,
        directory: Directory.Documents,
        encoding: Encoding?.UTF8 || 'utf8'
      });
      if (String(verified?.data ?? '') !== text) {
        return { status: 'failed', method: 'native-documents', filename, reason: 'NATIVE_VERIFY_FAILED' };
      }
      const uri = String(written?.uri || '');
      const shared = uri ? await nativeShare(uri, filename) : false;
      return {
        status: shared ? 'handed_off' : 'saved',
        method: shared ? 'native-share' : 'native-documents',
        filename,
        location: 'Documents',
        uri
      };
    } catch (error) {
      return {
        status: 'failed',
        method: 'native-documents',
        filename,
        reason: String(error?.message || error || 'NATIVE_WRITE_FAILED')
      };
    }
  }

  async function saveWithFilePicker(blob, filename, mimeType) {
    if (typeof root?.showSaveFilePicker !== 'function') return null;
    try {
      const handle = await root.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'SHE.X 字卡文件',
          accept: { [mimeType.split(';')[0]]: ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { status: 'saved', method: 'file-picker', filename };
    } catch (error) {
      if (isCancelled(error)) return { status: 'cancelled', method: 'file-picker', filename };
      return null;
    }
  }

  function scheduleUrlRelease(url) {
    const release = () => {
      try { root?.URL?.revokeObjectURL?.(url); } catch (_) { /* ignore */ }
    };
    root?.setTimeout?.(release, DOWNLOAD_URL_LIFETIME_MS);
    root?.addEventListener?.('pagehide', release, { once: true });
  }

  function startBrowserDownload(blob, filename) {
    const document = root?.document;
    const urlApi = root?.URL;
    if (!document?.createElement || !document?.body || !urlApi?.createObjectURL) {
      return { status: 'failed', method: 'browser-download', filename, reason: 'DOWNLOAD_UNAVAILABLE' };
    }
    const url = urlApi.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    scheduleUrlRelease(url);
    return { status: 'download_started', method: 'browser-download', filename };
  }

  async function saveTextFile(options = {}) {
    const filename = String(options.filename || '').trim();
    const text = String(options.text ?? '');
    const mimeType = String(options.mimeType || 'text/plain;charset=utf-8');
    if (!filename) return { status: 'failed', method: 'validation', filename, reason: 'FILENAME_REQUIRED' };

    if (isNativeApp()) {
      const nativeResult = await saveInNativeDocuments(text, filename);
      if (nativeResult.status !== 'failed') return nativeResult;
      const sharedResult = await shareFile(text, filename, mimeType);
      return sharedResult || nativeResult;
    }

    if (isWechatBrowser()) {
      const sharedResult = await shareFile(text, filename, mimeType);
      return sharedResult || { status: 'external_browser_required', method: 'wechat', filename };
    }

    const blob = makeBlob(text, mimeType);
    const pickerResult = await saveWithFilePicker(blob, filename, mimeType);
    if (pickerResult) return pickerResult;

    if (isMobileBrowser()) {
      const sharedResult = await shareFile(text, filename, mimeType);
      if (sharedResult) return sharedResult;
    }

    return startBrowserDownload(blob, filename);
  }

  return {
    saveTextFile,
    isNativeApp,
    isWechatBrowser,
    DOWNLOAD_URL_LIFETIME_MS
  };
});
