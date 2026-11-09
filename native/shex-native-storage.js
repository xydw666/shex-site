/**
 * SHE.X 原生存储桥接。
 * APP 内通过 Capacitor Filesystem 写入私有文件目录；普通浏览器保持 localStorage 兜底。
 * 所有 API 都是异步的，业务代码必须使用 await 或 .then()。
 */
(function () {
  var STORAGE_SUBDIR = 'shex-storage';

  function isNative() {
    return !!(
      window.ShexCapacitorBridge &&
      window.ShexCapacitorBridge.Capacitor &&
      window.ShexCapacitorBridge.Capacitor.isNativePlatform &&
      window.ShexCapacitorBridge.Capacitor.isNativePlatform()
    );
  }

  function nativePath(key) {
    return STORAGE_SUBDIR + '/' + encodeURIComponent(key) + '.txt';
  }

  async function setItem(key, value) {
    if (isNative()) {
      var Filesystem = window.ShexCapacitorBridge.Filesystem;
      var Directory = window.ShexCapacitorBridge.Directory;
      var Encoding = window.ShexCapacitorBridge.Encoding;
      await Filesystem.writeFile({
        path: nativePath(key),
        data: value,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return true;
    }
    localStorage.setItem(key, value);
    return true;
  }

  async function getItem(key) {
    if (isNative()) {
      var Filesystem = window.ShexCapacitorBridge.Filesystem;
      var Directory = window.ShexCapacitorBridge.Directory;
      var Encoding = window.ShexCapacitorBridge.Encoding;
      try {
        var result = await Filesystem.readFile({
          path: nativePath(key),
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        });
        return result.data;
      } catch (e) {
        return null;
      }
    }
    return localStorage.getItem(key);
  }

  async function removeItem(key) {
    if (isNative()) {
      var Filesystem = window.ShexCapacitorBridge.Filesystem;
      var Directory = window.ShexCapacitorBridge.Directory;
      try {
        await Filesystem.deleteFile({ path: nativePath(key), directory: Directory.Data });
      } catch (e) {
        // 与 localStorage.removeItem 一致：目标不存在时视为已完成。
      }
      return true;
    }
    localStorage.removeItem(key);
    return true;
  }

  async function listKeys() {
    if (isNative()) {
      var Filesystem = window.ShexCapacitorBridge.Filesystem;
      var Directory = window.ShexCapacitorBridge.Directory;
      try {
        var result = await Filesystem.readdir({ path: STORAGE_SUBDIR, directory: Directory.Data });
        return result.files.map(function (f) {
          var name = f.name || f;
          return decodeURIComponent(name.replace(/\.txt$/, ''));
        });
      } catch (e) {
        return [];
      }
    }
    return Object.keys(localStorage);
  }

  window.ShexNativeStorage = {
    isNative: isNative,
    setItem: setItem,
    getItem: getItem,
    removeItem: removeItem,
    listKeys: listKeys,
  };
})();
