(function () {
  'use strict';

  const DB_NAME = 'shex_media_cache_v1';
  const DB_VERSION = 1;
  const ENTRY_STORE = 'entries';
  const META_STORE = 'meta';
  const USAGE_KEY = 'usage';
  const MAX_TOTAL_BYTES = 96 * 1024 * 1024;
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
  const MEMORY_LIMIT = 48;
  const OBJECT_URL_RECHECK_MS = 30 * 1000;
  const inflight = new Map();
  const memory = new Map();
  const retiredObjectUrls = new Map();
  let databasePromise = null;
  let writeQueue = Promise.resolve();

  function normalizedScope(options = {}) {
    return {
      environmentId: String(options.environmentId || 'default').trim() || 'default',
      ownerId: String(options.ownerId || 'anonymous').trim() || 'anonymous'
    };
  }

  function entryKey(fileID, options = {}) {
    const scope = normalizedScope(options);
    return `${scope.environmentId}\u0001${scope.ownerId}\u0001${String(fileID || '').trim()}`;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    });
  }

  function openDatabase() {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB unavailable'));
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ENTRY_STORE)) {
          const entries = database.createObjectStore(ENTRY_STORE, { keyPath: 'key' });
          entries.createIndex('lastAccessAt', 'lastAccessAt', { unique: false });
          entries.createIndex('ownerScope', 'ownerScope', { unique: false });
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        // X103：连接被浏览器关闭后丢弃缓存的句柄，下次使用时重新打开（否则头像缓存一直失效到刷新页面）。
        database.onversionchange = () => { databasePromise = null; database.close(); };
        database.onclose = () => { databasePromise = null; };
        resolve(database);
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  }

  function serialWrite(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => undefined);
    return result;
  }

  function objectUrlIsStillUsed(url) {
    const documentRef = window.document;
    if (!url || !documentRef?.querySelectorAll) return false;
    try {
      return Array.from(documentRef.querySelectorAll('img,source,video,audio,[style]')).some((element) => {
        if (String(element?.src || '') === url || String(element?.currentSrc || '') === url) return true;
        return String(element?.getAttribute?.('style') || '').includes(url);
      });
    } catch (_) {
      return false;
    }
  }

  function revokeObjectUrlNow(url) {
    const retired = retiredObjectUrls.get(url);
    if (retired) window.clearTimeout(retired);
    retiredObjectUrls.delete(url);
    try { URL.revokeObjectURL(url); } catch (_) {}
  }

  function retireObjectUrl(url) {
    if (!url || retiredObjectUrls.has(url)) return;
    const check = () => {
      retiredObjectUrls.delete(url);
      if (objectUrlIsStillUsed(url)) {
        retiredObjectUrls.set(url, window.setTimeout(check, OBJECT_URL_RECHECK_MS));
        return;
      }
      revokeObjectUrlNow(url);
    };
    retiredObjectUrls.set(url, window.setTimeout(check, OBJECT_URL_RECHECK_MS));
  }

  function revokeMemoryEntry(key, options = {}) {
    const item = memory.get(key);
    if (!item) return;
    memory.delete(key);
    if (options.immediate) revokeObjectUrlNow(item.url);
    else retireObjectUrl(item.url);
  }

  function remember(key, arrayBuffer, mimeType) {
    revokeMemoryEntry(key);
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    memory.set(key, { url, lastAccessAt: Date.now() });
    while (memory.size > MEMORY_LIMIT) {
      const oldestKey = memory.keys().next().value;
      revokeMemoryEntry(oldestKey);
    }
    return url;
  }

  function peek(fileID, options = {}) {
    const key = entryKey(fileID, options);
    const item = memory.get(key);
    if (!item) return '';
    memory.delete(key);
    item.lastAccessAt = Date.now();
    memory.set(key, item);
    return item.url;
  }

  function imageMimeType(bytes, headerType = '') {
    const b = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16));
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
    if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70
      && b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && (b[11] === 0x66 || b[11] === 0x73)) return 'image/avif';
    const normalizedHeader = String(headerType || '').split(';')[0].trim().toLowerCase();
    return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif'].includes(normalizedHeader)
      ? normalizedHeader
      : '';
  }

  async function readEntry(key) {
    const database = await openDatabase();
    const transaction = database.transaction(ENTRY_STORE, 'readonly');
    const result = await requestResult(transaction.objectStore(ENTRY_STORE).get(key));
    await transactionDone(transaction);
    return result || null;
  }

  async function readUsage() {
    const database = await openDatabase();
    const transaction = database.transaction(META_STORE, 'readonly');
    const record = await requestResult(transaction.objectStore(META_STORE).get(USAGE_KEY));
    await transactionDone(transaction);
    return Math.max(0, Number(record?.bytes || 0));
  }

  async function evictForSpace(requiredBytes, protectedKey = '') {
    const database = await openDatabase();
    let usage = await readUsage();
    if (usage + requiredBytes <= MAX_TOTAL_BYTES) return usage;
    const transaction = database.transaction([ENTRY_STORE, META_STORE], 'readwrite');
    const entries = transaction.objectStore(ENTRY_STORE);
    const meta = transaction.objectStore(META_STORE);
    await new Promise((resolve, reject) => {
      const cursorRequest = entries.index('lastAccessAt').openCursor();
      cursorRequest.onerror = () => reject(cursorRequest.error || new Error('IndexedDB eviction failed'));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || usage + requiredBytes <= MAX_TOTAL_BYTES) {
          meta.put({ key: USAGE_KEY, bytes: Math.max(0, usage), updatedAt: Date.now() });
          resolve();
          return;
        }
        const record = cursor.value;
        if (record?.key !== protectedKey) {
          usage -= Math.max(0, Number(record?.size || 0));
          revokeMemoryEntry(record.key);
          cursor.delete();
        }
        cursor.continue();
      };
    });
    await transactionDone(transaction);
    return Math.max(0, usage);
  }

  async function storeEntry(record) {
    return serialWrite(async () => {
      const existing = await readEntry(record.key).catch(() => null);
      const oldSize = Math.max(0, Number(existing?.size || 0));
      const newSize = Math.max(0, Number(record.size || 0));
      let usage = await evictForSpace(Math.max(0, newSize - oldSize), record.key);
      const database = await openDatabase();
      const transaction = database.transaction([ENTRY_STORE, META_STORE], 'readwrite');
      transaction.objectStore(ENTRY_STORE).put(record);
      usage = Math.max(0, usage - oldSize + newSize);
      transaction.objectStore(META_STORE).put({ key: USAGE_KEY, bytes: usage, updatedAt: Date.now() });
      await transactionDone(transaction);
      return usage;
    });
  }

  function scheduleTouch(record) {
    if (Date.now() - Number(record.lastAccessAt || 0) < TOUCH_INTERVAL_MS) return;
    const touched = { ...record, lastAccessAt: Date.now() };
    void serialWrite(async () => {
      const database = await openDatabase();
      const transaction = database.transaction(ENTRY_STORE, 'readwrite');
      transaction.objectStore(ENTRY_STORE).put(touched);
      await transactionDone(transaction);
    }).catch(() => undefined);
  }

  async function get(fileID, options = {}) {
    const id = String(fileID || '').trim();
    if (!id) return '';
    const cached = peek(id, options);
    if (cached) return cached;
    const key = entryKey(id, options);
    try {
      const record = await readEntry(key);
      if (!record) return '';
      if (Date.now() - Number(record.cachedAt || 0) > MAX_AGE_MS) {
        void remove(id, options);
        return '';
      }
      if (!(record.bytes instanceof ArrayBuffer) || !record.bytes.byteLength || !record.mimeType) {
        void remove(id, options);
        return '';
      }
      scheduleTouch(record);
      return remember(key, record.bytes, record.mimeType);
    } catch (_) {
      return '';
    }
  }

  async function cacheFromUrl(fileID, networkUrl, options = {}) {
    const id = String(fileID || '').trim();
    const sourceUrl = String(networkUrl || '').trim();
    if (!id || !sourceUrl) return sourceUrl;
    const existing = await get(id, options);
    if (existing) return existing;
    const key = entryKey(id, options);
    if (inflight.has(key)) return inflight.get(key);
    const request = (async () => {
      try {
        const response = await fetch(sourceUrl, { credentials: 'omit' });
        if (!response.ok) return sourceUrl;
        const declaredSize = Math.max(0, Number(response.headers.get('content-length') || 0));
        if (declaredSize > MAX_FILE_BYTES) return sourceUrl;
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) return sourceUrl;
        const mimeType = imageMimeType(bytes, response.headers.get('content-type') || '');
        if (!mimeType) return sourceUrl;
        const scope = normalizedScope(options);
        const now = Date.now();
        const record = {
          key,
          ownerScope: `${scope.environmentId}\u0001${scope.ownerId}`,
          environmentId: scope.environmentId,
          ownerId: scope.ownerId,
          fileID: id,
          bytes,
          mimeType,
          size: bytes.byteLength,
          cachedAt: now,
          lastAccessAt: now
        };
        await storeEntry(record);
        return remember(key, bytes, mimeType);
      } catch (_) {
        return sourceUrl;
      }
    })();
    inflight.set(key, request);
    try {
      return await request;
    } finally {
      if (inflight.get(key) === request) inflight.delete(key);
    }
  }

  async function remove(fileID, options = {}) {
    const id = String(fileID || '').trim();
    if (!id) return false;
    const key = entryKey(id, options);
    // 同一个头像可能同时被多条消息引用。删除失效记录时先退出内存索引，
    // 但要等页面不再使用该 object URL 后再 revoke，避免一条失败拖空整屏头像。
    revokeMemoryEntry(key);
    try {
      return await serialWrite(async () => {
        const existing = await readEntry(key);
        if (!existing) return false;
        const usage = await readUsage();
        const database = await openDatabase();
        const transaction = database.transaction([ENTRY_STORE, META_STORE], 'readwrite');
        transaction.objectStore(ENTRY_STORE).delete(key);
        transaction.objectStore(META_STORE).put({
          key: USAGE_KEY,
          bytes: Math.max(0, usage - Math.max(0, Number(existing.size || 0))),
          updatedAt: Date.now()
        });
        await transactionDone(transaction);
        return true;
      });
    } catch (_) {
      return false;
    }
  }

  async function stats() {
    try {
      return { available: true, bytes: await readUsage(), maxBytes: MAX_TOTAL_BYTES, memoryEntries: memory.size };
    } catch (_) {
      return { available: false, bytes: 0, maxBytes: MAX_TOTAL_BYTES, memoryEntries: memory.size };
    }
  }

  window.addEventListener('beforeunload', () => {
    Array.from(memory.keys()).forEach((key) => revokeMemoryEntry(key, { immediate: true }));
    Array.from(retiredObjectUrls.keys()).forEach(revokeObjectUrlNow);
  });

  window.SHEXMediaCache = Object.freeze({
    get,
    peek,
    cacheFromUrl,
    remove,
    stats,
    limits: Object.freeze({ maxTotalBytes: MAX_TOTAL_BYTES, maxFileBytes: MAX_FILE_BYTES, maxAgeMs: MAX_AGE_MS })
  });
})();
