(() => {
  'use strict';

  const DATABASE_NAME = 'shex_chat_local_v2';
  const DATABASE_VERSION = 1;
  const MESSAGES_STORE = 'messages';
  const META_STORE = 'meta';
  const BACKUPS_STORE = 'legacyBackups';
  const OVERRIDE_KEY = 'shex_chat_indexeddb_override_v1';
  const DEFAULT_RECENT_LIMIT = 300;
  let databasePromise = null;
  const remotePolicies = new Map();

  function clone(value) {
    return JSON.parse(JSON.stringify(value === undefined ? null : value));
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function currentOwnerId() {
    try {
      const current = window.SHEXAuth?.current?.() || JSON.parse(localStorage.getItem('shex_auth_session_v1') || 'null');
      return String(current?.userId || '').trim();
    } catch (_) {
      return '';
    }
  }

  function rolloutConfig() {
    return window.SHEX_CLOUDBASE_CONFIG?.chatIndexedDb || {};
  }

  function normalizeRemotePolicy(input) {
    const source = input && typeof input === 'object' ? input : {};
    return Object.freeze({
      policyVersion: Math.max(0, Number(source.policyVersion || 0)),
      configured: source.configured === true,
      enabled: source.enabled === true ? true : source.enabled === false ? false : null,
      forceOff: source.forceOff === true,
      mode: String(source.mode || '').trim().toLowerCase(),
      percent: Math.max(0, Math.min(100, Number(source.percent || 0))),
      reason: String(source.reason || '').trim().slice(0, 40)
    });
  }

  function setRemotePolicy(ownerId, input) {
    const id = String(ownerId || '').trim();
    if (!id) return null;
    const policy = normalizeRemotePolicy(input);
    remotePolicies.set(id, policy);
    return policy;
  }

  function remotePolicyForOwner(ownerId = currentOwnerId()) {
    return remotePolicies.get(String(ownerId || '').trim()) || null;
  }

  function enabledForOwner(ownerId = currentOwnerId()) {
    if (!ownerId || !window.indexedDB) return false;
    const remotePolicy = remotePolicyForOwner(ownerId);
    if (remotePolicy?.forceOff) return false;
    let override = '';
    try { override = String(localStorage.getItem(OVERRIDE_KEY) || '').trim().toLowerCase(); } catch (_) {}
    if (override === 'off') return false;
    if (override === 'on') return true;
    if (ownerId === currentOwnerId()) {
      try {
        const state = JSON.parse(localStorage.getItem('shex_x_multi_state_v1') || 'null');
        if (Number(state?.chatLocalStorageVersion || 0) >= 2 && state?.chatIndexedDbMigration?.status === 'complete') return true;
      } catch (_) {}
    }
    if (remotePolicy?.configured) return remotePolicy.enabled === true;
    const config = rolloutConfig();
    const mode = String(config.mode || 'allowlist').trim().toLowerCase();
    const allowlist = new Set((Array.isArray(config.allowlist) ? config.allowlist : []).map(value => String(value || '').trim()).filter(Boolean));
    if (allowlist.has(ownerId)) return true;
    if (mode !== 'percentage') return false;
    const percent = Math.max(0, Math.min(100, Number(config.percent || 0)));
    return Number.parseInt(fnv1a(ownerId).slice(-4), 16) % 100 < percent;
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    });
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const messages = db.objectStoreNames.contains(MESSAGES_STORE)
          ? request.transaction.objectStore(MESSAGES_STORE)
          : db.createObjectStore(MESSAGES_STORE, { keyPath: 'key' });
        if (!messages.indexNames.contains('owner')) messages.createIndex('owner', 'ownerId', { unique: false });
        if (!messages.indexNames.contains('conversationSort')) {
          messages.createIndex('conversationSort', ['ownerId', 'kind', 'conversationId', 'sortKey'], { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(BACKUPS_STORE)) db.createObjectStore(BACKUPS_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        // X103：连接被浏览器关闭（长时间后台、系统回收、版本变更）后丢弃缓存的句柄，下次使用时重新打开。
        db.onversionchange = () => { databasePromise = null; db.close(); };
        db.onclose = () => { databasePromise = null; };
        resolve(db);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error('IndexedDB open failed'));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new Error('IndexedDB upgrade blocked'));
      };
    });
    return databasePromise;
  }

  function normalizeTimestampValue(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(value.trim())) {
      const parsed = Date.parse(value.trim());
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    }
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    if (numeric >= 1_000_000_000 && numeric < 100_000_000_000) return Math.floor(numeric * 1000);
    return Math.floor(numeric);
  }

  function firstTimestamp(...values) {
    for (const value of values) {
      const timestamp = normalizeTimestampValue(value);
      if (timestamp) return timestamp;
    }
    return 0;
  }

  function messageDisplayTimestamp(message) {
    if (!message || message.timeMissing === true) return 0;
    return firstTimestamp(message.canonicalTime, message.time, message.createdAt, message.timestamp);
  }

  function messageTimestamp(message) {
    return messageDisplayTimestamp(message)
      || firstTimestamp(message?.importSortTime, message?.sentAt, message?.updatedAt);
  }

  function ensureMessageId(message, kind, conversationId, index = 0) {
    const existing = String(message?.id ?? message?.messageId ?? '').trim();
    if (existing) return existing;
    return `legacy_${fnv1a(JSON.stringify([
      kind,
      conversationId,
      messageTimestamp(message),
      message?.senderId || message?.sender || message?.role || '',
      message?.text || message?.content || message?.type || '',
      index
    ]))}`;
  }

  function messageRecord(ownerId, kind, conversationId, message, index = 0) {
    const messageId = ensureMessageId(message, kind, conversationId, index);
    const payload = { ...(message && typeof message === 'object' ? clone(message) : {}), id: messageId };
    const sortKey = messageTimestamp(payload) || index + 1;
    return {
      key: `${ownerId}|${kind}|${conversationId}|${messageId}`,
      ownerId,
      kind,
      conversationId: String(conversationId),
      messageId,
      sortKey,
      updatedAt: Date.now(),
      payload
    };
  }

  function recordsFromState(ownerId, state = {}) {
    const records = new Map();
    [['single', state.singleChats], ['group', state.groupChats]].forEach(([kind, chats]) => {
      Object.entries(chats && typeof chats === 'object' ? chats : {}).forEach(([conversationId, messages]) => {
        (Array.isArray(messages) ? messages : []).forEach((message, index) => {
          const item = messageRecord(ownerId, kind, conversationId, message, index);
          records.set(item.key, item);
        });
      });
    });
    return records;
  }

  async function migrationStatus(ownerId = currentOwnerId()) {
    const db = await openDatabase();
    const transaction = db.transaction(META_STORE, 'readonly');
    const completed = transactionPromise(transaction);
    const result = await requestPromise(transaction.objectStore(META_STORE).get(`migration:${ownerId}`));
    await completed;
    return result || null;
  }

  async function restoreLegacyBackup(ownerId = currentOwnerId()) {
    const db = await openDatabase();
    const transaction = db.transaction(BACKUPS_STORE, 'readonly');
    const completed = transactionPromise(transaction);
    const result = await requestPromise(transaction.objectStore(BACKUPS_STORE).get(`legacy:${ownerId}`));
    await completed;
    return result?.state ? clone(result.state) : null;
  }

  async function cleanupExpiredLegacyBackup(ownerId = currentOwnerId()) {
    const db = await openDatabase();
    const transaction = db.transaction(BACKUPS_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    const store = transaction.objectStore(BACKUPS_STORE);
    const result = await requestPromise(store.get(`legacy:${ownerId}`));
    if (result && Number(result.expiresAt || 0) > 0 && Number(result.expiresAt) <= Date.now()) store.delete(result.key);
    await completed;
    return Boolean(result && Number(result.expiresAt || 0) <= Date.now());
  }

  async function saveReplyDeliveries(ownerId = currentOwnerId(), deliveries = {}) {
    const id = String(ownerId || '').trim();
    if (!id || !window.indexedDB) return { enabled: false };
    const db = await openDatabase();
    const transaction = db.transaction(META_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    transaction.objectStore(META_STORE).put({
      key: `reply-deliveries:${id}`,
      ownerId: id,
      deliveries: clone(deliveries && typeof deliveries === 'object' ? deliveries : {}),
      updatedAt: Date.now()
    });
    await completed;
    return { enabled: true };
  }

  async function loadReplyDeliveries(ownerId = currentOwnerId()) {
    const id = String(ownerId || '').trim();
    if (!id || !window.indexedDB) return { enabled: false, deliveries: {} };
    const db = await openDatabase();
    const transaction = db.transaction(META_STORE, 'readonly');
    const completed = transactionPromise(transaction);
    const result = await requestPromise(transaction.objectStore(META_STORE).get(`reply-deliveries:${id}`));
    await completed;
    return {
      enabled: true,
      deliveries: clone(result?.deliveries && typeof result.deliveries === 'object' ? result.deliveries : {}),
      updatedAt: Number(result?.updatedAt || 0)
    };
  }

  async function migrateLegacyState(state, ownerId = currentOwnerId()) {
    if (!enabledForOwner(ownerId)) return { enabled: false, complete: false };
    const existing = await migrationStatus(ownerId);
    if (existing?.status === 'complete') {
      await cleanupExpiredLegacyBackup(ownerId);
      return { enabled: true, complete: true, ...existing };
    }
    const records = recordsFromState(ownerId, state);
    const db = await openDatabase();
    const config = rolloutConfig();
    const backupDays = Math.max(1, Math.min(30, Number(config.legacyBackupDays || 14)));
    const transaction = db.transaction([MESSAGES_STORE, BACKUPS_STORE], 'readwrite');
    const completed = transactionPromise(transaction);
    const messages = transaction.objectStore(MESSAGES_STORE);
    records.forEach(item => messages.put(item));
    transaction.objectStore(BACKUPS_STORE).put({
      key: `legacy:${ownerId}`,
      ownerId,
      state: clone(state),
      createdAt: Date.now(),
      expiresAt: Date.now() + backupDays * 24 * 60 * 60 * 1000
    });
    await completed;

    const verifyTransaction = db.transaction(MESSAGES_STORE, 'readonly');
    const verifyCompleted = transactionPromise(verifyTransaction);
    const storedKeys = await requestPromise(verifyTransaction.objectStore(MESSAGES_STORE).index('owner').getAllKeys(ownerId));
    await verifyCompleted;
    const storedKeySet = new Set(storedKeys.map(String));
    const verified = Array.from(records.keys()).every(key => storedKeySet.has(key));
    if (!verified) throw new Error('IndexedDB migration verification failed');

    const completedAt = Date.now();
    const metaTransaction = db.transaction(META_STORE, 'readwrite');
    const metaCompleted = transactionPromise(metaTransaction);
    metaTransaction.objectStore(META_STORE).put({
      key: `migration:${ownerId}`,
      ownerId,
      status: 'complete',
      sourceCount: records.size,
      storedCount: storedKeys.length,
      completedAt,
      version: 2
    });
    await metaCompleted;
    return { enabled: true, complete: true, sourceCount: records.size, storedCount: storedKeys.length, completedAt, version: 2 };
  }

  async function loadRecentConversation(ownerId, kind, conversationId, limit = DEFAULT_RECENT_LIMIT) {
    const db = await openDatabase();
    const transaction = db.transaction(MESSAGES_STORE, 'readonly');
    const completed = transactionPromise(transaction);
    const index = transaction.objectStore(MESSAGES_STORE).index('conversationSort');
    const range = IDBKeyRange.bound(
      [ownerId, kind, String(conversationId), Number.MIN_SAFE_INTEGER],
      [ownerId, kind, String(conversationId), Number.MAX_SAFE_INTEGER]
    );
    const items = [];
    await new Promise((resolve, reject) => {
      const request = index.openCursor(range, 'prev');
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || items.length >= limit) {
          resolve();
          return;
        }
        items.push(clone(cursor.value.payload));
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB cursor failed'));
    });
    await completed;
    return items.reverse();
  }

  async function loadRecentChats(state = {}, ownerId = currentOwnerId()) {
    if (!enabledForOwner(ownerId)) return { enabled: false, singleChats: {}, groupChats: {} };
    const config = rolloutConfig();
    const limit = Math.max(50, Math.min(1000, Number(config.recentPerConversation || DEFAULT_RECENT_LIMIT)));
    const singleIds = new Set([
      ...(Array.isArray(state.dreams) ? state.dreams.map(item => String(item?.id || '')) : []),
      ...Object.keys(state.singleChats || {})
    ].filter(Boolean));
    const groupIds = new Set([
      ...(Array.isArray(state.groups) ? state.groups.map(item => String(item?.id || '')) : []),
      ...Object.keys(state.groupChats || {})
    ].filter(Boolean));
    const singleChats = {};
    const groupChats = {};
    await Promise.all([
      ...Array.from(singleIds).map(async id => { singleChats[id] = await loadRecentConversation(ownerId, 'single', id, limit); }),
      ...Array.from(groupIds).map(async id => { groupChats[id] = await loadRecentConversation(ownerId, 'group', id, limit); })
    ]);
    return { enabled: true, singleChats, groupChats, limit };
  }

  async function loadCalendarMoodMonths(ownerId = currentOwnerId()) {
    if (!enabledForOwner(ownerId)) return { enabled: false, calendarMoodMonths: {}, scanned: 0 };
    const activity = window.SHEXCalendarMoodActivity;
    if (!activity?.mark) return { enabled: false, calendarMoodMonths: {}, scanned: 0 };
    const db = await openDatabase();
    const transaction = db.transaction(MESSAGES_STORE, 'readonly');
    const completed = transactionPromise(transaction);
    const ownerIndex = transaction.objectStore(MESSAGES_STORE).index('owner');
    const range = IDBKeyRange.only(String(ownerId));
    let calendarMoodMonths = {};
    let scanned = 0;
    await new Promise((resolve, reject) => {
      const request = ownerIndex.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        const record = cursor.value || {};
        const payload = record.payload || {};
        scanned += 1;
        const activityTimestamp = messageDisplayTimestamp(payload);
        if (activityTimestamp && record.kind === 'single' && String(payload.role || payload.originalRole || '') === 'user') {
          calendarMoodMonths = activity.mark(
            calendarMoodMonths,
            record.conversationId,
            activityTimestamp
          );
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB calendar activity scan failed'));
    });
    await completed;
    return { enabled: true, calendarMoodMonths, scanned };
  }

  async function persistDiff(previousState = {}, nextState = {}, ownerId = currentOwnerId(), options = {}) {
    if (!enabledForOwner(ownerId)) return { enabled: false, changed: 0 };
    const before = recordsFromState(ownerId, previousState);
    const after = recordsFromState(ownerId, nextState);
    const db = await openDatabase();
    const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    const store = transaction.objectStore(MESSAGES_STORE);
    let changed = 0;
    after.forEach((item, key) => {
      const prior = before.get(key);
      if (!prior || JSON.stringify(prior.payload) !== JSON.stringify(item.payload)) {
        store.put(item);
        changed += 1;
      }
    });
    before.forEach((_, key) => {
      if (options.deleteMissing !== false && !after.has(key)) {
        store.delete(key);
        changed += 1;
      }
    });
    await completed;
    return { enabled: true, changed };
  }

  async function applyTombstones(deletedChatMessages = {}, ownerId = currentOwnerId()) {
    if (!enabledForOwner(ownerId)) return { enabled: false, deleted: 0 };
    const keys = [];
    Object.entries(deletedChatMessages && typeof deletedChatMessages === 'object' ? deletedChatMessages : {}).forEach(([conversationKey, entries]) => {
      const separator = conversationKey.indexOf(':');
      const kind = conversationKey.slice(0, separator);
      const conversationId = conversationKey.slice(separator + 1);
      if (!(kind === 'single' || kind === 'group') || !conversationId || !entries || typeof entries !== 'object') return;
      Object.keys(entries).forEach(messageId => keys.push(`${ownerId}|${kind}|${conversationId}|${messageId}`));
    });
    if (!keys.length) return { enabled: true, deleted: 0 };
    const db = await openDatabase();
    const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
    const completed = transactionPromise(transaction);
    const store = transaction.objectStore(MESSAGES_STORE);
    keys.forEach(key => store.delete(key));
    await completed;
    return { enabled: true, deleted: keys.length };
  }

  function compactStateForLocalStorage(state = {}, migration = {}) {
    const compact = clone(state) || {};
    delete compact.singleChats;
    delete compact.groupChats;
    delete compact.chats;
    delete compact.chatList;
    compact.chatLocalStorageVersion = 2;
    compact.chatIndexedDbMigration = {
      status: migration.complete ? 'complete' : 'pending',
      completedAt: Number(migration.completedAt || 0),
      sourceCount: Number(migration.sourceCount || 0)
    };
    return compact;
  }

  window.SHEXChatLocalStore = Object.freeze({
    DATABASE_NAME,
    currentOwnerId,
    enabledForOwner,
    remotePolicyForOwner,
    setRemotePolicy,
    migrationStatus,
    restoreLegacyBackup,
    saveReplyDeliveries,
    loadReplyDeliveries,
    migrateLegacyState,
    loadRecentChats,
    loadCalendarMoodMonths,
    persistDiff,
    applyTombstones,
    compactStateForLocalStorage,
    _test: { ensureMessageId, fnv1a, messageRecord, recordsFromState }
  });
})();
