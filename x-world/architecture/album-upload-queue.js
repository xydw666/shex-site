((root, factory) => {
  'use strict';
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SHEXAlbumUploadQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
  'use strict';

  const DATABASE_NAME = 'shex_album_upload_queue_v1';
  const DATABASE_VERSION = 1;
  const TASKS_STORE = 'tasks';
  const MAX_TASKS_PER_OWNER = 30;
  const MAX_BLOB_BYTES = 2 * 1024 * 1024;
  const MAX_TOTAL_BLOB_BYTES = 20 * 1024 * 1024;
  const MAX_UPLOAD_ATTEMPTS = 5;
  const MAX_BLOB_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const FAILED_METADATA_AGE_MS = 3 * 24 * 60 * 60 * 1000;
  const ATTEMPT_LEASE_MS = 2 * 60 * 1000;
  const RETRY_DELAYS_MS = Object.freeze([0, 30_000, 120_000, 600_000, 3_600_000]);
  let databasePromise = null;

  function cleanText(value, maximum = 240) {
    return String(value || '').trim().slice(0, maximum);
  }

  function taskKey(ownerUserId, taskId) {
    return `${cleanText(ownerUserId, 160)}|${cleanText(taskId, 180)}`;
  }

  function retryDelay(attempts) {
    const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Math.floor(Number(attempts || 0))));
    return RETRY_DELAYS_MS[index];
  }

  function terminalFailureRecord(record, now, message) {
    return {
      ...record,
      status: 'failed',
      blob: null,
      bytes: 0,
      errorMessage: cleanText(message || '该照片上传失败，请手动重新选择', 180),
      nextRetryAt: 0,
      leaseUntil: 0,
      leaseToken: '',
      failedAt: now,
      failureExpiresAt: now + FAILED_METADATA_AGE_MS,
      updatedAt: now
    };
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('相册临时存储读取失败'));
    });
  }

  function transactionPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('相册临时存储事务已中止'));
      transaction.onerror = () => reject(transaction.error || new Error('相册临时存储事务失败'));
    });
  }

  function available() {
    return Boolean(root?.indexedDB);
  }

  function openDatabase() {
    if (!available()) return Promise.reject(new Error('当前环境不支持相册临时存储'));
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(TASKS_STORE)
          ? request.transaction.objectStore(TASKS_STORE)
          : db.createObjectStore(TASKS_STORE, { keyPath: 'key' });
        if (!store.indexNames.contains('owner')) store.createIndex('owner', 'ownerUserId', { unique: false });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error('无法打开相册临时存储'));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new Error('相册临时存储升级被其他页面阻塞'));
      };
    });
    return databasePromise;
  }

  async function listTasks(ownerUserId) {
    const owner = cleanText(ownerUserId, 160);
    if (!owner) return [];
    const db = await openDatabase();
    const transaction = db.transaction(TASKS_STORE, 'readonly');
    const completed = transactionPromise(transaction);
    const records = await requestPromise(transaction.objectStore(TASKS_STORE).index('owner').getAll(owner));
    await completed;
    return (Array.isArray(records) ? records : []).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  async function getTask(ownerUserId, taskId) {
    const owner = cleanText(ownerUserId, 160);
    const id = cleanText(taskId, 180);
    if (!owner || !id) return null;
    const db = await openDatabase();
    const transaction = db.transaction(TASKS_STORE, 'readonly');
    const completed = transactionPromise(transaction);
    const record = await requestPromise(transaction.objectStore(TASKS_STORE).get(taskKey(owner, id)));
    await completed;
    return record || null;
  }

  async function updateTask(ownerUserId, taskId, updater) {
    const owner = cleanText(ownerUserId, 160);
    const id = cleanText(taskId, 180);
    if (!owner || !id) return null;
    const db = await openDatabase();
    const transaction = db.transaction(TASKS_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    const store = transaction.objectStore(TASKS_STORE);
    const current = await requestPromise(store.get(taskKey(owner, id)));
    const next = current && typeof updater === 'function' ? updater(current) : current;
    if (next) store.put(next);
    await completed;
    return next || null;
  }

  async function enqueueTask(input = {}) {
    const ownerUserId = cleanText(input.ownerUserId, 160);
    const taskId = cleanText(input.taskId, 180);
    const blob = input.blob;
    const bytes = Number(blob?.size || 0);
    const mimeType = cleanText(blob?.type || input.mimeType || '', 120);
    if (!ownerUserId || !taskId) throw new Error('相册临时任务缺少账号或任务编号');
    if (!blob || typeof blob.slice !== 'function' || !/^image\//i.test(mimeType)) throw new Error('临时照片内容无效');
    if (!bytes || bytes > MAX_BLOB_BYTES) throw new Error('压缩后的照片仍然过大，请重新选择');
    const db = await openDatabase();
    const transaction = db.transaction(TASKS_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    const store = transaction.objectStore(TASKS_STORE);
    const key = taskKey(ownerUserId, taskId);
    const existing = await requestPromise(store.get(key));
    if (existing) {
      await completed;
      return existing;
    }
    const ownerRecords = await requestPromise(store.index('owner').getAll(ownerUserId));
    const activeRecords = ownerRecords.filter((record) => record?.blob && record.status !== 'failed');
    const totalBytes = activeRecords.reduce((sum, record) => sum + Math.max(0, Number(record.bytes || record.blob?.size || 0)), 0);
    if (activeRecords.length >= MAX_TASKS_PER_OWNER) throw new Error(`待上传照片最多保留${MAX_TASKS_PER_OWNER}张`);
    if (totalBytes + bytes > MAX_TOTAL_BLOB_BYTES) throw new Error('待上传照片占用空间已达上限，请联网重试或删除部分照片');
    const now = Math.max(1, Number(input.now || Date.now()));
    const attempts = Math.max(0, Math.min(MAX_UPLOAD_ATTEMPTS - 1, Math.floor(Number(input.attempts || 0))));
    const record = {
      key,
      taskId,
      ownerUserId,
      sourcePhotoId: cleanText(input.sourcePhotoId, 180),
      sourceCreatedAt: Math.max(0, Number(input.sourceCreatedAt || 0)),
      imageView: input.imageView && typeof input.imageView === 'object' ? { ...input.imageView } : null,
      name: cleanText(input.name || 'album-image.jpg', 180),
      mimeType,
      bytes,
      blob,
      status: 'pending',
      attempts,
      nextRetryAt: Math.max(now, Number(input.nextRetryAt || now + retryDelay(attempts))),
      leaseUntil: 0,
      leaseToken: '',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + MAX_BLOB_AGE_MS,
      errorMessage: cleanText(input.errorMessage, 180),
      cloudFileID: '',
      resultPhotoId: ''
    };
    store.put(record);
    await completed;
    return record;
  }

  async function beginAttempt(ownerUserId, taskId, leaseToken, now = Date.now()) {
    const token = cleanText(leaseToken, 180);
    if (!token) throw new Error('相册上传任务缺少租约编号');
    return updateTask(ownerUserId, taskId, (record) => {
      const timestamp = Math.max(1, Number(now || Date.now()));
      if (!record.blob || record.status === 'failed' || record.status === 'uploaded') return record;
      if (record.status === 'uploading' && Number(record.leaseUntil || 0) > timestamp) return record;
      return {
        ...record,
        status: 'uploading',
        attempts: Math.min(MAX_UPLOAD_ATTEMPTS, Math.max(0, Number(record.attempts || 0)) + 1),
        leaseUntil: timestamp + ATTEMPT_LEASE_MS,
        leaseToken: token,
        updatedAt: timestamp
      };
    });
  }

  async function markAttemptFailed(ownerUserId, taskId, message, leaseToken, now = Date.now()) {
    const token = cleanText(leaseToken, 180);
    return updateTask(ownerUserId, taskId, (record) => {
      const timestamp = Math.max(1, Number(now || Date.now()));
      if (!token || record.leaseToken !== token) return record;
      if (Number(record.attempts || 0) >= MAX_UPLOAD_ATTEMPTS || timestamp >= Number(record.expiresAt || 0)) {
        return terminalFailureRecord(record, timestamp, '该照片上传失败，请手动重新选择');
      }
      return {
        ...record,
        status: 'pending',
        errorMessage: cleanText(message || '上传失败，等待网络恢复后重试', 180),
        nextRetryAt: timestamp + retryDelay(record.attempts),
        leaseUntil: 0,
        leaseToken: '',
        updatedAt: timestamp
      };
    });
  }

  async function markUploaded(ownerUserId, taskId, cloudFileID, resultPhotoId, leaseToken, now = Date.now()) {
    const fileID = cleanText(cloudFileID, 500);
    const photoId = cleanText(resultPhotoId, 180);
    const token = cleanText(leaseToken, 180);
    if (!/^cloud:\/\//i.test(fileID) || !photoId) throw new Error('相册云端结果无效');
    return updateTask(ownerUserId, taskId, (record) => {
      if (!token || record.leaseToken !== token) return record;
      return {
        ...record,
      status: 'uploaded',
      cloudFileID: fileID,
      resultPhotoId: photoId,
      nextRetryAt: Math.max(1, Number(now || Date.now())),
      leaseUntil: 0,
      leaseToken: '',
      commitAttempts: 0,
      errorMessage: '',
      updatedAt: Math.max(1, Number(now || Date.now()))
      };
    });
  }

  async function deferCommit(ownerUserId, taskId, message, now = Date.now()) {
    return updateTask(ownerUserId, taskId, (record) => {
      if (record.status !== 'uploaded' || !/^cloud:\/\//i.test(String(record.cloudFileID || ''))) return record;
      const timestamp = Math.max(1, Number(now || Date.now()));
      const commitAttempts = Math.max(0, Number(record.commitAttempts || 0)) + 1;
      return {
        ...record,
        commitAttempts,
        nextRetryAt: timestamp + retryDelay(Math.min(commitAttempts, RETRY_DELAYS_MS.length - 1)),
        errorMessage: cleanText(message || '云端照片正在等待写入正式相册', 180),
        updatedAt: timestamp
      };
    });
  }

  async function deleteTask(ownerUserId, taskId) {
    const owner = cleanText(ownerUserId, 160);
    const id = cleanText(taskId, 180);
    if (!owner || !id) return false;
    const db = await openDatabase();
    const transaction = db.transaction(TASKS_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    transaction.objectStore(TASKS_STORE).delete(taskKey(owner, id));
    await completed;
    return true;
  }

  async function cleanupOwner(ownerUserId, now = Date.now()) {
    const timestamp = Math.max(1, Number(now || Date.now()));
    const records = await listTasks(ownerUserId);
    const db = await openDatabase();
    const transaction = db.transaction(TASKS_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    const store = transaction.objectStore(TASKS_STORE);
    let changed = 0;
    records.forEach((record) => {
      if (record.status === 'failed' && Number(record.failureExpiresAt || 0) <= timestamp) {
        store.delete(record.key);
        changed += 1;
        return;
      }
      if (record.status === 'uploaded') {
        if (record.blob && Number(record.expiresAt || 0) <= timestamp) {
          store.put({ ...record, blob: null, bytes: 0, updatedAt: timestamp });
          changed += 1;
        }
        return;
      }
      if (record.status === 'uploading' && Number(record.leaseUntil || 0) <= timestamp) {
        store.put({ ...record, status: 'pending', leaseUntil: 0, leaseToken: '', nextRetryAt: timestamp, updatedAt: timestamp });
        changed += 1;
        return;
      }
      if (record.blob && (Number(record.expiresAt || 0) <= timestamp || Number(record.attempts || 0) >= MAX_UPLOAD_ATTEMPTS)) {
        store.put(terminalFailureRecord(record, timestamp, '该照片上传失败，请手动重新选择'));
        changed += 1;
      }
    });
    await completed;
    return changed;
  }

  return Object.freeze({
    DATABASE_NAME,
    MAX_TASKS_PER_OWNER,
    MAX_BLOB_BYTES,
    MAX_TOTAL_BLOB_BYTES,
    MAX_UPLOAD_ATTEMPTS,
    MAX_BLOB_AGE_MS,
    FAILED_METADATA_AGE_MS,
    ATTEMPT_LEASE_MS,
    RETRY_DELAYS_MS,
    available,
    retryDelay,
    terminalFailureRecord,
    enqueueTask,
    listTasks,
    getTask,
    beginAttempt,
    markAttemptFailed,
    markUploaded,
    deferCommit,
    deleteTask,
    cleanupOwner
  });
});
